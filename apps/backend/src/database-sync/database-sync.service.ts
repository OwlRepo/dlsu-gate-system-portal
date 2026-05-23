import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncSchedule } from './entities/sync-schedule.entity';
import { BiostarSyncState } from './entities/biostar-sync-state.entity';
import { ConfigService } from '@nestjs/config';
import { ScheduledSyncDto } from './dto/scheduled-sync.dto';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import * as sql from 'mssql';
import * as fs from 'fs';
import axios from 'axios';
import * as path from 'path';
import { Student } from '../students/entities/student.entity';
import * as https from 'https';
import { In } from 'typeorm';
import { DatabaseSyncQueueService } from './database-sync-queue.service';
import { DatabaseSyncCommonService } from './services/shared/database-sync-common.service';
import { BiostarApiService } from './services/shared/biostar-api.service';
import { DatabaseSyncMainPathService } from './services/database-sync-main-path.service';
import { DatabaseSyncDasmaPathService } from './services/database-sync-dasma-path.service';
import { IDatabaseSyncPath } from './services/database-sync-path.interface';

@Injectable()
export class DatabaseSyncService {
  private readonly logger = new Logger(DatabaseSyncService.name);
  private readonly activeJobs = new Map<string, boolean>();
  private readonly jobStartTimes = new Map<string, Date>();
  private studentMutationLock: Promise<void> = Promise.resolve();
  private sqlConfig: sql.config;
  private readonly schemaEnv: string;
  private readonly logDir = path.join(process.cwd(), 'logs', 'skipped-records');
  private readonly syncedDir = path.join(
    process.cwd(),
    'logs',
    'synced-records',
  );
  private readonly syncedJsonDir = path.join(
    process.cwd(),
    'logs',
    'synced-records',
    'json',
  );
  private readonly syncedCsvDir = path.join(
    process.cwd(),
    'logs',
    'synced-records',
    'csv',
  );
  private readonly photoConversionLogDir = path.join(
    process.cwd(),
    'logs',
    'photo-conversion',
  );
  private readonly faceImagesDir = path.join(
    process.cwd(),
    'temp',
    'face-images',
  );

  constructor(
    @InjectRepository(SyncSchedule)
    private syncScheduleRepository: Repository<SyncSchedule>,
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
    @InjectRepository(BiostarSyncState)
    private biostarSyncStateRepository: Repository<BiostarSyncState>,
    private configService: ConfigService,
    private schedulerRegistry: SchedulerRegistry,
    private databaseSyncQueueService: DatabaseSyncQueueService,
    private commonService: DatabaseSyncCommonService,
    private biostarApiService: BiostarApiService,
    private mainPathService: DatabaseSyncMainPathService,
    private dasmaPathService: DatabaseSyncDasmaPathService,
  ) {
    // Schema selector: 'main' (old schema) or 'dasma' (new Entrant-style schema)
    const rawEnv = this.configService.get('SOURCE_DB_SCHEMA_ENV') ?? 'main';
    const envValue = String(rawEnv).trim().toLowerCase();
    this.schemaEnv = envValue === 'dasma' ? 'dasma' : 'main';

    this.initializeSchedules();

    this.sqlConfig = {
      user: this.configService.get('SOURCE_DB_USERNAME'),
      password: this.configService.get('SOURCE_DB_PASSWORD'),
      database: this.configService.get('SOURCE_DB_NAME'),
      server: this.configService.get('SOURCE_DB_HOST'),
      port: parseInt(this.configService.get('SOURCE_DB_PORT')),
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectTimeout: 120000,
        requestTimeout: 120000,
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 120000,
      },
    };

    this.ensureLogDirectory();
    this.ensureFaceImagesDirectory();
    this.initializeBiostarSchedules();
  }

  private getPathService(): IDatabaseSyncPath {
    return this.schemaEnv === 'dasma'
      ? this.dasmaPathService
      : this.mainPathService;
  }

  private async runWithStudentMutationLock<T>(
    operationName: string,
    handler: () => Promise<T>,
  ): Promise<T> {
    const previousLock = this.studentMutationLock;
    let releaseLock!: () => void;
    this.studentMutationLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const waitStart = Date.now();
    await previousLock;
    const waitedMs = Date.now() - waitStart;
    if (waitedMs > 0) {
      this.logger.warn(
        `Waiting for global student mutation lock (${operationName}) for ${waitedMs}ms`,
      );
    }

    try {
      return await handler();
    } finally {
      releaseLock();
    }
  }

  private async initializeBiostarSchedules() {
    // Dasma: unified schedule (1/2) runs combined main+biostar; no separate biostar crons
    if (this.schemaEnv === 'dasma') {
      return;
    }

    const defaultBiostarSchedules = [
      { scheduleNumber: 3, displayNumber: 1, time: '09:00' },
      { scheduleNumber: 4, displayNumber: 2, time: '21:00' },
    ];

    for (const schedule of defaultBiostarSchedules) {
      try {
        const existing = await this.syncScheduleRepository.findOne({
          where: { scheduleNumber: schedule.scheduleNumber },
        });

        if (!existing) {
          const cronExpression = this.commonService.convertMilitaryTimeToCron(
            schedule.time,
          );
          const newSchedule = this.syncScheduleRepository.create({
            scheduleNumber: schedule.scheduleNumber,
            time: schedule.time,
            cronExpression,
          });
          await this.syncScheduleRepository.save(newSchedule);
          this.addBiostarCronJob(
            `biostar-sync-${schedule.displayNumber}`,
            cronExpression,
            schedule.displayNumber,
          );
        } else {
          this.addBiostarCronJob(
            `biostar-sync-${schedule.displayNumber}`,
            existing.cronExpression,
            schedule.displayNumber,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to initialize biostar schedule ${schedule.scheduleNumber}:`,
          error,
        );
        // Continue with next schedule even if one fails
        continue;
      }
    }
  }

  private ensureLogDirectory() {
    const directories = [
      this.logDir,
      this.syncedDir,
      this.syncedJsonDir,
      this.syncedCsvDir,
      this.photoConversionLogDir,
    ];

    directories.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Cleanup logs older than 1 month
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    directories.forEach((dir) => {
      fs.readdirSync(dir).forEach((file) => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtime < oneMonthAgo) {
          try {
            if (stats.isDirectory()) {
              // Remove directory recursively
              fs.rmSync(filePath, { recursive: true, force: true });
            } else {
              // Remove file
              fs.unlinkSync(filePath);
            }
          } catch (error) {
            // Log error but continue cleanup
            this.logger.warn(`Failed to delete ${filePath}: ${error.message}`);
          }
        }
      });
    });
  }

  private ensureFaceImagesDirectory() {
    if (!fs.existsSync(this.faceImagesDir)) {
      fs.mkdirSync(this.faceImagesDir, { recursive: true });
    }
  }

  private removeSpecialChars(str: string): string {
    return str.replace(/[^a-zA-Z0-9\s]/g, '');
  }

  private sanitizeUserId(userId: string): string {
    // Remove spaces from the userId first
    const cleanUserId = userId.replace(/\s/g, '');
    // Convert hex to decimal if userId is a valid hex number
    if (/^[0-9A-Fa-f]+$/.test(cleanUserId)) {
      const decimal = parseInt(cleanUserId, 16);
      if (!isNaN(decimal)) {
        userId = decimal.toString();
      }
    }
    // Ensure the userId has a maximum of 10 characters
    if (userId.length > 10) {
      userId = userId.substring(0, 10);
    }
    return userId;
  }

  private async initializeSchedules() {
    const defaultSchedules = [
      { scheduleNumber: 1, time: '09:00' },
      { scheduleNumber: 2, time: '21:00' },
    ];

    for (const schedule of defaultSchedules) {
      try {
        const existing = await this.syncScheduleRepository.findOne({
          where: { scheduleNumber: schedule.scheduleNumber },
        });

        if (!existing) {
          const cronExpression = this.commonService.convertMilitaryTimeToCron(
            schedule.time,
          );
          const newSchedule = this.syncScheduleRepository.create({
            ...schedule,
            cronExpression,
          });
          await this.syncScheduleRepository.save(newSchedule);
          this.addCronJob(`sync-${schedule.scheduleNumber}`, cronExpression);
        } else {
          this.addCronJob(
            `sync-${schedule.scheduleNumber}`,
            existing.cronExpression,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to initialize schedule ${schedule.scheduleNumber}:`,
          error,
        );
        // Continue with next schedule even if one fails
        continue;
      }
    }
  }

  private addCronJob(name: string, cronExpression: string) {
    const job = new CronJob(
      cronExpression,
      () => {
        if (this.schemaEnv === 'dasma') {
          this.executeCombinedSync(name);
        } else {
          this.executeDatabaseSync(name);
        }
      },
      null,
      true,
      'Asia/Manila', // Set timezone to Philippine Time
    );

    // In @nestjs/schedule v6, addCronJob expects CronJob<null, null>
    // Cast to match the expected type while preserving functionality
    this.schedulerRegistry.addCronJob(name, job as any);
    job.start();
  }

  /**
   * For dasma: runs main sync first (SQL->PG->Biostar), then biostar sync (Biostar->PG photos).
   * Updates lastSyncTime for the shared schedule when jobName is sync-1 or sync-2.
   */
  private async executeCombinedSync(jobName: string): Promise<void> {
    await this.runWithStudentMutationLock(
      `combined-sync:${jobName}`,
      async () => {
        try {
          this.logger.log(`Starting combined sync for ${jobName}`);
          await this.executeDatabaseSyncInternal(jobName, false);
          const biostarJobKey = `biostar-after-${jobName}`;
          await this.syncFromBiostarInternal(biostarJobKey, false);

          const scheduleMatch = jobName.match(/^sync-(\d+)$/);
          if (scheduleMatch) {
            const scheduleNumber = parseInt(scheduleMatch[1], 10);
            const schedule = await this.syncScheduleRepository.findOne({
              where: { scheduleNumber },
            });
            if (schedule) {
              schedule.lastSyncTime = new Date();
              await this.syncScheduleRepository.save(schedule);
              this.logger.log(
                `Updated last sync time for schedule ${scheduleNumber}`,
              );
            }
          }
          this.logger.log(`Combined sync completed for ${jobName}`);
        } catch (error) {
          this.logger.error(`Combined sync failed for ${jobName}:`, error);
          throw error;
        }
      },
    );
  }

  private addBiostarCronJob(
    name: string,
    cronExpression: string,
    scheduleNumber: number,
  ) {
    void scheduleNumber; // kept for API consistency with callers
    const job = new CronJob(
      cronExpression,
      () => {
        this.syncFromBiostar(name);
      },
      null,
      true,
      'Asia/Manila', // Set timezone to Philippine Time
    );

    // In @nestjs/schedule v6, addCronJob expects CronJob<null, null>
    // Cast to match the expected type while preserving functionality
    this.schedulerRegistry.addCronJob(name, job as any);
    job.start();
  }

  private async executeDatabaseSync(jobName: string) {
    return this.executeDatabaseSyncInternal(jobName, true);
  }

  private async executeDatabaseSyncInternal(
    jobName: string,
    useGlobalLock: boolean,
  ) {
    if (this.activeJobs.get(jobName)) {
      this.logger.warn(`Sync ${jobName} is already running`);
      return;
    }

    const runSync = async () => {
      try {
        this.activeJobs.set(jobName, true);
        this.jobStartTimes.set(jobName, new Date());
        return await this.getPathService().executeDatabaseSync(jobName);
      } finally {
        this.activeJobs.set(jobName, false);
        this.jobStartTimes.delete(jobName);
      }
    };

    if (!useGlobalLock) {
      return runSync();
    }

    return this.runWithStudentMutationLock(`db-sync:${jobName}`, runSync);
  }

  async triggerManualSync() {
    try {
      const { queueId, position } =
        await this.databaseSyncQueueService.addToQueue();
      this.processQueue();
      return {
        success: true,
        message: 'Sync job added to queue',
        queueId,
        position,
      };
    } catch (error) {
      this.logger.error('Failed to add sync job to queue:', error);
      throw new BadRequestException({
        message: 'Failed to add sync job to queue',
        details: error.message,
      });
    }
  }

  private async processQueue() {
    if (this.activeJobs.get('queue-processor')) {
      this.logger.debug('Queue processor is already running');
      return;
    }
    this.activeJobs.set('queue-processor', true);
    try {
      await this.processNextQueueItem();
    } catch (error) {
      this.logger.error('Error processing queue:', error);
    } finally {
      this.activeJobs.set('queue-processor', false);
    }
  }

  private async processNextQueueItem() {
    const pendingJob = await this.databaseSyncQueueService.findNextPendingJob();
    if (!pendingJob) {
      this.logger.debug('No pending jobs in queue');
      return;
    }
    await this.databaseSyncQueueService.updateQueueStatus(
      pendingJob.id,
      'processing',
    );
    try {
      const jobName = `manual-${pendingJob.id}`;
      if (this.schemaEnv === 'dasma') {
        await this.executeCombinedSync(jobName);
      } else {
        await this.executeDatabaseSync(jobName);
      }
      await this.databaseSyncQueueService.updateQueueStatus(
        pendingJob.id,
        'completed',
      );
      await this.processNextQueueItem();
    } catch (error) {
      await this.databaseSyncQueueService.updateQueueStatus(
        pendingJob.id,
        'failed',
      );
      this.logger.error(`Sync job ${pendingJob.id} failed:`, error);
      await this.processNextQueueItem();
    }
  }

  async updateSchedule(scheduleNumber: number, time: string) {
    const existingSchedule = await this.syncScheduleRepository.findOne({
      where: { scheduleNumber },
    });

    if (!existingSchedule) {
      throw new BadRequestException(
        `Schedule ${scheduleNumber} does not exist`,
      );
    }

    if (scheduleNumber !== 1 && scheduleNumber !== 2) {
      throw new BadRequestException('Schedule number must be 1 or 2');
    }

    const cronExpression = this.commonService.convertMilitaryTimeToCron(time);
    const jobName = `sync-${scheduleNumber}`;

    // Update database
    existingSchedule.time = time;
    existingSchedule.cronExpression = cronExpression;
    await this.syncScheduleRepository.save(existingSchedule);

    // Update cron job
    const existingJob = this.schedulerRegistry.getCronJob(jobName);
    if (existingJob) {
      existingJob.stop();
      this.schedulerRegistry.deleteCronJob(jobName);
    }
    this.addCronJob(jobName, cronExpression);

    return {
      message: 'Schedule updated successfully',
      scheduleNumber,
      time,
      timezone: 'Asia/Manila',
    };
  }

  async getAllSchedules(): Promise<ScheduledSyncDto[]> {
    const schedules = await this.syncScheduleRepository.find({
      where: { scheduleNumber: In([1, 2]) },
    });
    return schedules.map((schedule) => {
      const job = this.schedulerRegistry.getCronJob(
        `sync-${schedule.scheduleNumber}`,
      );
      return {
        scheduleNumber: schedule.scheduleNumber,
        time: schedule.time,
        isActive: job?.isActive ?? false,
        lastSyncTime: schedule.lastSyncTime
          ? new Date(schedule.lastSyncTime)
          : null,
        nextRun: job?.nextDate()?.toJSDate()
          ? new Date(job.nextDate().toJSDate())
          : null,
        timezone: 'Asia/Manila',
      };
    });
  }

  async getAllBiostarSchedules(): Promise<ScheduledSyncDto[]> {
    // Dasma: shared schedule (1/2) - delegate to main schedules
    if (this.schemaEnv === 'dasma') {
      return this.getAllSchedules();
    }

    const schedules = await this.syncScheduleRepository.find({
      where: { scheduleNumber: In([3, 4]) },
    });
    return schedules.map((schedule) => {
      // Map database scheduleNumber (3, 4) to display number (1, 2)
      const displayNumber = schedule.scheduleNumber === 3 ? 1 : 2;
      const jobName = `biostar-sync-${displayNumber}`;
      const job = this.schedulerRegistry.getCronJob(jobName);
      return {
        scheduleNumber: displayNumber,
        time: schedule.time,
        isActive: job?.isActive ?? false,
        lastSyncTime: schedule.lastSyncTime
          ? new Date(schedule.lastSyncTime)
          : null,
        nextRun: job?.nextDate()?.toJSDate()
          ? new Date(job.nextDate().toJSDate())
          : null,
        timezone: 'Asia/Manila',
      };
    });
  }

  async updateBiostarSchedule(scheduleNumber: number, time: string) {
    if (scheduleNumber !== 1 && scheduleNumber !== 2) {
      throw new BadRequestException('Schedule number must be 1 or 2');
    }

    // Dasma: shared schedule - delegate to main schedule
    if (this.schemaEnv === 'dasma') {
      return this.updateSchedule(scheduleNumber, time);
    }

    // Map display scheduleNumber (1, 2) to database scheduleNumber (3, 4)
    const dbScheduleNumber = scheduleNumber === 1 ? 3 : 4;
    const existingSchedule = await this.syncScheduleRepository.findOne({
      where: { scheduleNumber: dbScheduleNumber },
    });

    if (!existingSchedule) {
      throw new BadRequestException(
        `Biostar schedule ${scheduleNumber} does not exist`,
      );
    }

    const cronExpression = this.commonService.convertMilitaryTimeToCron(time);
    const jobName = `biostar-sync-${scheduleNumber}`;

    // Update database
    existingSchedule.time = time;
    existingSchedule.cronExpression = cronExpression;
    await this.syncScheduleRepository.save(existingSchedule);

    // Update cron job
    const existingJob = this.schedulerRegistry.getCronJob(jobName);
    if (existingJob) {
      existingJob.stop();
      this.schedulerRegistry.deleteCronJob(jobName);
    }
    this.addBiostarCronJob(jobName, cronExpression, scheduleNumber);

    return {
      message: 'Biostar schedule updated successfully',
      scheduleNumber,
      time,
      timezone: 'Asia/Manila',
    };
  }

  async triggerBiostarSync() {
    try {
      await this.syncFromBiostar();
      return {
        success: true,
        message: 'Biostar sync completed successfully',
      };
    } catch (error) {
      this.logger.error('Failed to trigger Biostar sync:', error);
      throw new BadRequestException({
        message: 'Failed to trigger Biostar sync',
        details: error.message,
      });
    }
  }

  async syncFromBiostar(jobName?: string): Promise<void> {
    return this.syncFromBiostarInternal(jobName, true);
  }

  private async syncFromBiostarInternal(
    jobName: string | undefined,
    useGlobalLock: boolean,
  ): Promise<void> {
    const jobKey = jobName || 'biostar-manual-sync';

    if (this.activeJobs.get(jobKey)) {
      this.logger.warn(`Biostar sync ${jobKey} is already running`);
      return;
    }

    const runBiostarSync = async () => {
      try {
        this.activeJobs.set(jobKey, true);
        this.jobStartTimes.set(jobKey, new Date());
        this.logger.log(`Starting Biostar sync for ${jobKey}`);

        await this.getPathService().syncFromBiostar(jobKey, jobName);

        // Update lastSyncTime if this is a scheduled biostar-only sync (non-dasma)
        if (
          this.schemaEnv !== 'dasma' &&
          jobName &&
          jobName.startsWith('biostar-sync-')
        ) {
          const scheduleNumberStr = jobName.replace('biostar-sync-', '');
          const displayNumber = parseInt(scheduleNumberStr, 10);
          const dbScheduleNumber = displayNumber === 1 ? 3 : 4;

          const schedule = await this.syncScheduleRepository.findOne({
            where: { scheduleNumber: dbScheduleNumber },
          });

          if (schedule) {
            schedule.lastSyncTime = new Date();
            await this.syncScheduleRepository.save(schedule);
          }
        }
      } catch (error) {
        this.logger.error(`Biostar sync failed:`, error);
        throw new BadRequestException({
          message: 'Biostar sync failed',
          details: error.message,
        });
      } finally {
        this.activeJobs.set(jobKey, false);
        this.jobStartTimes.delete(jobKey);
      }
    };

    if (!useGlobalLock) {
      return runBiostarSync();
    }

    return this.runWithStudentMutationLock(
      `biostar-sync:${jobKey}`,
      runBiostarSync,
    );
  }

  async testConnection() {
    let pool: sql.ConnectionPool | null = null;
    let sqlServerConnected = false;
    let biostarConnected = false;
    let postgresConnected = false;

    try {
      this.logger.log('Testing all connections...');

      // Test 1: SQL Server Connection
      this.logger.log('1. Testing SQL Server connection...');
      pool = await sql.connect(this.sqlConfig);
      const tableName = this.configService.get('SOURCE_DB_TABLE');

      let query: string;
      let hasIsArchivedColumn: boolean;

      if (this.schemaEnv === 'dasma') {
        // New schema (dasma): check for IsArchived (capital I)
        hasIsArchivedColumn = await this.commonService.checkColumnExists(
          pool,
          'IsArchived',
        );
        const columns =
          'ID, LastName, FirstName, MiddleName, Suffix, [Group], Status, Remarks, IsArchived';
        if (hasIsArchivedColumn) {
          query = `SELECT TOP 1 ${columns} FROM ${tableName} WHERE IsArchived = 0 ORDER BY ID`;
        } else {
          query = `SELECT TOP 1 ${columns} FROM ${tableName} ORDER BY ID`;
        }
      } else {
        // Old schema (main): check for isArchived (lowercase i)
        hasIsArchivedColumn = await this.commonService.checkColumnExists(
          pool,
          'isArchived',
        );
        if (hasIsArchivedColumn) {
          query = `SELECT TOP 1 * FROM ${tableName} WHERE isArchived = 'N' OR isArchived IS NULL ORDER BY ID_Number`;
        } else {
          query = `SELECT TOP 1 * FROM ${tableName} ORDER BY ID_Number`;
        }
      }

      const sqlResult = await pool.request().query(query);
      sqlServerConnected = true;
      this.logger.log('SQL Server connection successful');

      // Test 2: BIOSTAR API Connection
      this.logger.log('2. Testing BIOSTAR API connection...');
      const { token, sessionId } = await this.biostarApiService.getApiToken();
      biostarConnected = true;
      this.logger.log('BIOSTAR API connection successful');

      // Test 3: PostgreSQL Connection
      this.logger.log('3. Testing PostgreSQL connection...');
      const pgResult = await this.studentRepository
        .createQueryBuilder()
        .select('COUNT(*)')
        .from(Student, 'student')
        .getRawOne();
      postgresConnected = true;
      this.logger.log('PostgreSQL connection successful');

      return {
        success: true,
        message: 'All connections successful',
        postgresConnected,
        biostarConnected,
        sqlServerConnected,
        connections: {
          sqlServer: {
            status: 'connected',
            sampleData: sqlResult.recordset[0],
            tableInfo: {
              hasIsArchivedColumn,
              recordCount: sqlResult.recordset.length,
            },
          },
          biostarApi: {
            status: 'connected',
            sessionId: sessionId ? 'valid' : 'invalid',
            token: token ? 'valid' : 'invalid',
          },
          postgresql: {
            status: 'connected',
            totalRecords: pgResult?.count || 0,
          },
        },
      };
    } catch (error) {
      this.logger.error('Connection test failed:', error);

      // Determine which connection failed based on where the error occurred
      let failedConnection = 'unknown';
      if (error.message?.includes('SQL Server')) {
        failedConnection = 'SQL Server';
      } else if (error.message?.includes('BIOSTAR API')) {
        failedConnection = 'BIOSTAR API';
      } else if (error.message?.includes('PostgreSQL')) {
        failedConnection = 'PostgreSQL';
      }

      throw new BadRequestException({
        message: `Connection test failed`,
        failedConnection,
        postgresConnected,
        biostarConnected,
        sqlServerConnected,
        error: error.message,
        details: axios.isAxiosError(error) ? error.response?.data : undefined,
      });
    } finally {
      if (pool) {
        await pool.close();
        this.logger.log('SQL Server connection closed');
      }
    }
  }

  async getRunningSync() {
    const runningJobs = [];

    for (const [jobName, isActive] of this.activeJobs.entries()) {
      if (isActive) {
        runningJobs.push({
          jobName,
          startedAt: this.jobStartTimes.get(jobName),
          isManual: jobName.startsWith('manual-'),
        });
      }
    }

    return {
      runningJobs,
      count: runningJobs.length,
    };
  }

  public async deleteUsers(userIds: string[]) {
    if (!userIds?.length) {
      throw new BadRequestException('No user IDs provided for deletion');
    }

    let updateResult;

    try {
      this.logger.log(`Starting bulk deletion for ${userIds.length} users`);

      // 1. Update PostgreSQL records
      updateResult = await this.studentRepository
        .createQueryBuilder()
        .update(Student)
        .set({ isArchived: () => "'true'" })
        .where('ID_Number IN (:...userIds)', { userIds })
        .execute();

      this.logger.log(`Updated ${updateResult.affected} records in PostgreSQL`);

      // 2. Delete from BIOSTAR API
      const { token, sessionId } = await this.biostarApiService.getApiToken();
      const apiBaseUrl = this.biostarApiService.getApiBaseUrl();

      // First API call - Delete card records
      const deleteCardPayload = {
        mobile: {
          user_id: userIds,
          card_id: [],
          param: {
            UserIDs: userIds,
            query: {},
          },
        },
      };

      await axios.post(
        `${apiBaseUrl}/api/v2/mobile/delete`,
        deleteCardPayload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'bs-session-id': sessionId,
            'Content-Type': 'application/json',
          },
          httpsAgent: new https.Agent({
            rejectUnauthorized: false,
          }),
        },
      );

      this.logger.log(
        'Successfully deleted user card records from BIOSTAR API',
      );

      // Second API call - Delete user records
      const formattedIds = userIds
        .map((id) => encodeURIComponent(id))
        .join('%2B');
      const deleteUserResponse = await axios.delete(
        `${apiBaseUrl}/api/users?id=${formattedIds}&group_id=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'bs-session-id': sessionId,
            accept: 'application/json',
          },
          httpsAgent: new https.Agent({
            rejectUnauthorized: false,
          }),
        },
      );

      this.logger.log('Successfully deleted user records from BIOSTAR API');
      return {
        success: true,
        message: 'Users and their card records successfully deleted',
        deletedCount: updateResult.affected,
        biostarResponse: deleteUserResponse.data,
      };
    } catch (error) {
      this.logger.error('Bulk deletion failed:', error);

      // Revert PostgreSQL changes if they were made
      if (updateResult?.affected > 0) {
        try {
          await this.studentRepository
            .createQueryBuilder()
            .update(Student)
            .set({ isArchived: () => "'false'" })
            .where('ID_Number IN (:...userIds)', { userIds })
            .execute();

          this.logger.log(
            'Successfully reverted PostgreSQL changes after BIOSTAR API failure',
          );
        } catch (revertError) {
          this.logger.error(
            'Failed to revert PostgreSQL changes:',
            revertError,
          );
          throw new BadRequestException({
            message:
              'Critical error: Failed to revert PostgreSQL changes after BIOSTAR API failure',
            details: revertError.message,
            originalError: error.message,
            step: 'postgres-reversion',
          });
        }
      }

      // Throw appropriate error
      throw new BadRequestException({
        message: 'Bulk deletion failed',
        details: axios.isAxiosError(error)
          ? error.response?.data
          : error.message,
        biostarMessage: axios.isAxiosError(error)
          ? error.response?.data?.Response?.message
          : undefined,
        step: 'biostar-deletion',
      });
    }
  }
}
