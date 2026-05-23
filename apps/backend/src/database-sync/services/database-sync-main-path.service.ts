import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { In } from 'typeorm';
import * as sql from 'mssql';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as https from 'https';
import * as FormData from 'form-data';
import { createObjectCsvWriter } from 'csv-writer';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

import { IDatabaseSyncPath } from './database-sync-path.interface';
import { Student } from '../../students/entities/student.entity';
import { SyncSchedule } from '../entities/sync-schedule.entity';
import { DatabaseSyncCommonService } from './shared/database-sync-common.service';
import { BiostarApiService } from './shared/biostar-api.service';

@Injectable()
export class DatabaseSyncMainPathService implements IDatabaseSyncPath {
  private readonly logger = new Logger(DatabaseSyncMainPathService.name);
  private readonly logDir: string;
  private sqlConfig: sql.config;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
    @InjectRepository(SyncSchedule)
    private syncScheduleRepository: Repository<SyncSchedule>,
    private commonService: DatabaseSyncCommonService,
    private biostarApiService: BiostarApiService,
  ) {
    this.logDir = this.commonService.getLogDir();
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
  }

  /**
   * Legacy Biostar sync: list users, use photo from list (often empty).
   * Used when schemaEnv !== 'dasma'.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- interface requires these params
  async syncFromBiostar(jobKey: string, jobName?: string): Promise<void> {
    const { token, sessionId } = await this.biostarApiService.getApiToken();
    const apiBaseUrl = this.biostarApiService.getApiBaseUrl();

    const limit = 500;
    let offset = 0;
    let total = 0;
    let fetchedCount = 0;
    let totalUpdated = 0;
    let totalCreated = 0;
    let totalSkipped = 0;

    do {
      this.logger.log(
        `Fetching Biostar users: offset=${offset}, limit=${limit}`,
      );

      const response = await axios.get(`${apiBaseUrl}/api/users`, {
        params: {
          limit,
          offset,
          group_id: 1,
          order_by: 'name:true',
        },
        headers: {
          Authorization: `Bearer ${token}`,
          'bs-session-id': sessionId,
          accept: 'application/json',
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
        timeout: 120000,
      });

      const userCollection = response.data?.UserCollection;
      if (!userCollection) {
        throw new BadRequestException(
          'Invalid response format from Biostar API',
        );
      }

      total = userCollection.total || 0;
      const users = userCollection.rows || [];

      this.logger.log(
        `Fetched ${users.length} users (${fetchedCount + users.length}/${total})`,
      );

      for (const user of users) {
        try {
          const userId = user.user_id;
          const photo = user.photo || null;
          const name = user.name || null;

          if (!userId) {
            this.logger.warn('Skipping user with no user_id');
            totalSkipped++;
            continue;
          }

          const existingStudent = await this.studentRepository.findOne({
            where: { ID_Number: userId },
          });

          if (existingStudent) {
            if (photo && photo !== existingStudent.Photo) {
              await this.studentRepository.update(
                { ID_Number: userId },
                { Photo: photo, updatedAt: new Date() },
              );
              totalUpdated++;
              this.logger.debug(`Updated photo for student ${userId}`);
            } else if (!photo) {
              this.logger.debug(`No photo for user ${userId}, skipping update`);
              totalSkipped++;
            } else {
              this.logger.debug(`Photo unchanged for student ${userId}`);
              totalSkipped++;
            }
          } else {
            const newStudent = this.studentRepository.create({
              ID_Number: userId,
              Photo: photo,
              Name: name,
              isArchived: false,
            });
            await this.studentRepository.save(newStudent);
            totalCreated++;
            this.logger.debug(`Created new student ${userId}`);
          }
        } catch (error) {
          this.logger.error(
            `Error processing user ${user.user_id}:`,
            error.message,
          );
          totalSkipped++;
        }
      }

      fetchedCount += users.length;
      offset += limit;

      if (fetchedCount >= total || users.length === 0) break;
    } while (fetchedCount < total);

    this.logger.log(
      `Biostar sync completed: ${totalCreated} created, ${totalUpdated} updated, ${totalSkipped} skipped`,
    );
  }

  async executeDatabaseSync(jobName: string): Promise<{
    success: boolean;
    message: string;
    recordsProcessed: number;
  } | void> {
    let pool: sql.ConnectionPool | null = null;

    try {
      this.logger.log(`Starting database sync for ${jobName}`);

      this.logger.log('Attempting SQL Server connection...');
      try {
        pool = await sql.connect(this.sqlConfig);
        this.logger.log('Successfully connected to SQL Server');
      } catch (sqlError) {
        this.logger.error('SQL Connection Error:', {
          message: sqlError.message,
          code: sqlError.code,
          state: sqlError.state,
          serverName: sqlError.serverName,
          procName: sqlError.procName,
          number: sqlError.number,
          class: sqlError.class,
          lineNumber: sqlError.lineNumber,
          stack: sqlError.stack,
        });
        throw new BadRequestException({
          message: 'Failed to connect to SQL Server',
          details: sqlError.message,
          code: sqlError.code,
          state: sqlError.state,
        });
      }

      const hasIsArchivedColumn = await this.commonService.checkColumnExists(
        pool,
        'isArchived',
      );
      this.logger.log(
        `Table ${hasIsArchivedColumn ? 'has' : 'does not have'} isArchived column`,
      );
      const batchSize = parseInt(process.env.SYNC_BATCH_SIZE) || 500;
      let totalProcessed = 0;
      let totalSkipped = 0;
      let totalEnabled = 0;
      let totalDisabled = 0;
      const failedRecordsAll = [];
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }

      for await (const { batchRecords, batchNumber } of this.fetchBatches(
        pool,
        hasIsArchivedColumn,
        batchSize,
      )) {
        const normalizedRecords = batchRecords.map((record) =>
          this.normalizeRecord(record),
        );

        const batchRecordsWithPhoto = await Promise.all(
          normalizedRecords.map(async (record) => ({
            ...record,
            Photo: record.Photo
              ? await this.commonService.convertPhotoToBase64(
                  record.Photo,
                  record.ID_Number,
                )
              : null,
          })),
        );

        const existingMap = new Map();
        const idNumbers = batchRecordsWithPhoto.map((r) => r.ID_Number);
        const chunkSize = 100;

        for (let i = 0; i < idNumbers.length; i += chunkSize) {
          const chunk = idNumbers.slice(i, i + chunkSize);
          const existingStudentsChunk =
            await this.commonService.executeWithRetry(
              () =>
                this.studentRepository.find({
                  where: { ID_Number: In(chunk) },
                }),
              3,
              `get existing students chunk ${Math.floor(i / chunkSize) + 1}`,
            );
          existingStudentsChunk.forEach((s) => existingMap.set(s.ID_Number, s));
        }

        const toCreate = [];
        const toUpdate = [];
        for (const record of batchRecordsWithPhoto) {
          let uniqueId = record.Unique_ID;
          if (
            uniqueId != null &&
            typeof uniqueId === 'string' &&
            /^[0-9A-Fa-f\s]+$/.test(uniqueId)
          ) {
            const parsedId = parseInt(uniqueId.replace(/\s/g, ''), 16);
            if (isNaN(parsedId)) {
              this.logger.warn(
                `[Batch ${batchNumber}] Skipping record with invalid Unique_ID (NaN) - ID: ${record.ID_Number}, Unique_ID: ${record.Unique_ID}`,
              );
              totalSkipped++;
              continue;
            }
            uniqueId = parsedId;
          }

          const groupValue = this.commonService.normalizeGroupValue(
            record.Group,
          );
          const data = {
            ID_Number: record.ID_Number,
            Name: record.Name,
            Lived_Name: record.Lived_Name,
            Remarks: record.Remarks,
            Photo: record.Photo,
            Campus_Entry: record.Campus_Entry,
            Unique_ID: uniqueId,
            isArchived: record.isArchived,
            group: groupValue ?? null,
            updatedAt: new Date(),
          };
          const existing = existingMap.get(record.ID_Number);
          if (!existing) {
            toCreate.push(data);
          } else if (
            existing.Name !== record.Name ||
            existing.Lived_Name !== record.Lived_Name ||
            existing.Remarks !== record.Remarks ||
            existing.Photo !== record.Photo ||
            existing.Campus_Entry !== record.Campus_Entry ||
            existing.Unique_ID !== uniqueId ||
            existing.isArchived !== record.isArchived ||
            existing.group !== (groupValue ?? null)
          ) {
            toUpdate.push({ ...data, id: existing.id });
          }
        }

        if (toCreate.length) {
          const insertChunkSize = 50;
          for (let i = 0; i < toCreate.length; i += insertChunkSize) {
            const insertChunk = toCreate.slice(i, i + insertChunkSize);
            await this.commonService.executeWithRetry(
              async () => {
                try {
                  await this.studentRepository.insert(insertChunk);
                } catch (error) {
                  if (
                    error.message.includes(
                      'duplicate key value violates unique constraint',
                    )
                  ) {
                    this.logger.warn(
                      `[Batch ${batchNumber}] Duplicate key error, updating existing records`,
                    );
                    for (const record of insertChunk) {
                      const existing = await this.studentRepository.findOne({
                        where: { ID_Number: record.ID_Number },
                      });
                      if (existing) {
                        await this.studentRepository.update(
                          { ID_Number: record.ID_Number },
                          record,
                        );
                      }
                    }
                  } else {
                    throw error;
                  }
                }
              },
              3,
              `insert chunk ${Math.floor(i / insertChunkSize) + 1}`,
            );
          }
        }
        if (toUpdate.length) {
          const updateChunkSize = 50;
          for (let i = 0; i < toUpdate.length; i += updateChunkSize) {
            const updateChunk = toUpdate.slice(i, i + updateChunkSize);
            await this.commonService.executeWithRetry(
              () => this.studentRepository.save(updateChunk),
              3,
              `update chunk ${Math.floor(i / updateChunkSize) + 1}`,
            );
          }
        }
        this.logger.log(
          `[Batch ${batchNumber}] Synced ${toCreate.length + toUpdate.length} records (${batchRecordsWithPhoto.length - (toCreate.length + toUpdate.length)} unchanged)`,
        );

        const csvFilePath = path.join(
          tempDir,
          `sync_${jobName}_batch${batchNumber}_${Date.now()}.csv`,
        );
        const mainHeaders = [
          { id: 'user_id', title: 'user_id' },
          { id: 'name', title: 'name' },
          { id: 'department', title: 'department' },
          { id: 'user_title', title: 'user_title' },
          { id: 'phone', title: 'phone' },
          { id: 'email', title: 'email' },
          { id: 'user_group', title: 'user_group' },
          { id: 'lived_name', title: 'Lived Name' },
          { id: 'remarks', title: 'Remarks' },
          { id: 'csn', title: 'csn' },
          { id: 'photo', title: 'photo' },
          { id: 'face_image_file1', title: 'face_image_file1' },
          { id: 'face_image_file2', title: 'face_image_file2' },
          { id: 'start_datetime', title: 'start_datetime' },
          { id: 'expiry_datetime', title: 'expiry_datetime' },
          { id: 'original_campus_entry', title: 'original_campus_entry' },
        ];
        const csvWriter = createObjectCsvWriter({
          path: csvFilePath,
          header: mainHeaders,
        });
        const skippedRecords = [];
        dayjs.extend(utc);
        dayjs.extend(timezone);
        const currentDate = dayjs().tz('Asia/Manila').startOf('day');
        const startDateEnabled = currentDate;
        const formattedStartDateEnabled = startDateEnabled.format(
          'YYYY-MM-DD HH:mm:ss.SSS',
        );
        const expiryDateEnabled = currentDate.add(10, 'year');
        const formattedExpiryDateEnabled = expiryDateEnabled.format(
          'YYYY-MM-DD HH:mm:ss.SSS',
        );
        const startDateDisabled = currentDate.subtract(10, 'year');
        const formattedStartDateDisabled = startDateDisabled.format(
          'YYYY-MM-DD HH:mm:ss.SSS',
        );
        const expiryDateDisabled = currentDate.subtract(1, 'day');
        const formattedExpiryDateDisabled = expiryDateDisabled.format(
          'YYYY-MM-DD HH:mm:ss.SSS',
        );

        const formattedRecords = (
          await Promise.all(
            batchRecordsWithPhoto.map(async (record) => {
              const userId = this.commonService.sanitizeUserId(
                record.Unique_ID !== null && record.Unique_ID !== undefined
                  ? record.Unique_ID?.toString()?.trim()
                  : record.ID_Number?.toString()?.trim() || '',
              );
              const name = this.commonService.removeSpecialChars(
                record.Name?.trim() || '',
              );
              const livedName = record.Lived_Name?.trim() || '';
              const remarks = record.Remarks?.trim() || '';
              const validationErrors = [];
              if (!userId || userId.length > 10) {
                validationErrors.push(!userId ? 'Empty ID' : 'ID too long');
              }
              if (!name) {
                validationErrors.push('Empty name');
              }
              if (validationErrors.length > 0) {
                skippedRecords.push({
                  ID_Number: record.ID_Number,
                  userId,
                  name,
                  livedName,
                  remarks,
                  length: userId.length,
                  reasons: validationErrors,
                  timestamp: new Date().toISOString(),
                });
                this.logger.warn(
                  `[Batch ${batchNumber}] Skipping record with validation errors - ID: ${record.ID_Number}, Errors: ${validationErrors.join(', ')}`,
                );
                return null;
              }

              let faceImageBase64: string | null = null;
              let faceImageFile1 = '';
              let faceImageFile2 = '';
              faceImageBase64 = await this.commonService.convertPhotoToBase64(
                record.Photo,
                record.ID_Number,
              );
              if (faceImageBase64) {
                const fileName1 = `${userId}_1.jpg`;
                const fileName2 = `${userId}_2.jpg`;
                const filePath1 = path.join(tempDir, fileName1);
                const filePath2 = path.join(tempDir, fileName2);
                fs.writeFileSync(
                  filePath1,
                  Buffer.from(faceImageBase64, 'base64'),
                );
                fs.writeFileSync(
                  filePath2,
                  Buffer.from(faceImageBase64, 'base64'),
                );
                faceImageFile1 = fileName1;
                faceImageFile2 = fileName2;
              }

              const isDisabled =
                record.Campus_Entry.toString().toUpperCase() === 'N';
              return {
                user_id: record.ID_Number,
                name: name,
                department: 'DLSU',
                user_title: 'Student',
                phone: '',
                email: '',
                user_group: 'All Users',
                lived_name: livedName,
                remarks: remarks,
                csn: userId,
                photo: faceImageBase64,
                face_image_file1: faceImageFile1,
                face_image_file2: faceImageFile2,
                start_datetime: isDisabled
                  ? formattedStartDateDisabled
                  : formattedStartDateEnabled,
                expiry_datetime: isDisabled
                  ? formattedExpiryDateDisabled
                  : formattedExpiryDateEnabled,
                original_campus_entry: record.Campus_Entry,
              };
            }),
          )
        ).filter((record) => record !== null);

        await csvWriter.writeRecords(formattedRecords);
        this.logger.log(
          `[Batch ${batchNumber}] CSV file created at ${csvFilePath}`,
        );

        let csvFileReady = false;
        for (let i = 0; i < 10; i++) {
          try {
            await fs.promises.access(
              csvFilePath,
              fs.constants.F_OK | fs.constants.R_OK,
            );
            const stats = await fs.promises.stat(csvFilePath);
            if (stats.size > 0) {
              csvFileReady = true;
              break;
            }
          } catch {
            this.logger.warn(
              `[Batch ${batchNumber}] CSV file not ready yet, retrying...`,
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        if (!csvFileReady) {
          this.logger.error(
            `[Batch ${batchNumber}] CSV file was not created or is empty. Aborting upload for this batch.`,
          );
          failedRecordsAll.push({
            batchNumber,
            error: 'CSV file not created or empty',
            details: `File: ${csvFilePath}`,
          });
          const failedFile = path.join(
            this.logDir,
            `failed_batch_${jobName}_${batchNumber}_${Date.now()}.json`,
          );
          fs.writeFileSync(
            failedFile,
            JSON.stringify(failedRecordsAll, null, 2),
          );
          this.logger.log(
            `[Batch ${batchNumber}] Failed records written to ${failedFile}`,
          );
          continue;
        }

        await this.commonService.logSyncedRecords(formattedRecords, jobName);

        let retries = 3;
        while (retries > 0) {
          try {
            const { token, sessionId } =
              await this.biostarApiService.getApiToken();
            const apiBaseUrl = this.biostarApiService.getApiBaseUrl();

            const uploadFormData = new FormData();
            uploadFormData.append('file', fs.createReadStream(csvFilePath));
            this.logger.log(
              `[Batch ${batchNumber}] Uploading CSV file to attachments...`,
            );
            const uploadResponse = await axios.post(
              `${apiBaseUrl}/api/attachments`,
              uploadFormData,
              {
                headers: {
                  ...uploadFormData.getHeaders(),
                  Authorization: `Bearer ${token}`,
                  'bs-session-id': sessionId,
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                timeout: 120000,
                httpsAgent: new https.Agent({
                  rejectUnauthorized: false,
                }),
              },
            );
            if (!uploadResponse.data?.filename) {
              throw new Error('Failed to get filename from upload response');
            }
            const uploadedFileName = uploadResponse.data.filename;
            this.logger.log(
              `[Batch ${batchNumber}] File uploaded successfully as: ${uploadedFileName}`,
            );

            const firstLine = fs
              .readFileSync(csvFilePath, 'utf8')
              .split('\n')[0];
            const headers = firstLine.split(',');

            const importPayload = {
              File: {
                uri: uploadedFileName,
                fileName: uploadedFileName,
              },
              CsvOption: {
                columns: {
                  total: headers.length.toString(),
                  rows: headers,
                  formats: headers.map(() => 'Text'),
                },
                start_line: 2,
                import_option: 2,
              },
              Query: {
                headers: headers,
                columns: headers,
              },
            };
            this.logger.log(`[Batch ${batchNumber}] Importing CSV file...`);
            const importResponse = await axios.post(
              `${apiBaseUrl}/api/users/csv_import`,
              importPayload,
              {
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                  'bs-session-id': sessionId,
                },
                httpsAgent: new https.Agent({
                  rejectUnauthorized: false,
                }),
              },
            );
            if (importResponse.data?.Response?.code === '1') {
              if (importResponse.data.CsvRowCollection) {
                const failedRows = importResponse.data.CsvRowCollection.rows;
                if (importResponse.data.File?.uri) {
                  const errorFileUri = importResponse.data.File.uri;
                  this.logger.warn(
                    `[Batch ${batchNumber}] Error details file generated: ${errorFileUri}`,
                  );
                  try {
                    const errorFilePath = path.join(
                      this.logDir,
                      `error_details_batch_${jobName}_${batchNumber}_${Date.now()}.csv`,
                    );
                    const downloadResponse = await axios.get(
                      `${apiBaseUrl}/download/${errorFileUri}`,
                      {
                        headers: {
                          Authorization: `Bearer ${token}`,
                          'bs-session-id': sessionId,
                        },
                        responseType: 'stream',
                        httpsAgent: new https.Agent({
                          rejectUnauthorized: false,
                        }),
                      },
                    );
                    const writer = fs.createWriteStream(errorFilePath);
                    downloadResponse.data.pipe(writer);
                    await new Promise((resolve, reject) => {
                      writer.on('finish', () => resolve(undefined));
                      writer.on('error', reject);
                    });
                    this.logger.log(
                      `[Batch ${batchNumber}] Error details file downloaded to ${errorFilePath}`,
                    );
                    failedRecordsAll.push({
                      batchNumber,
                      error: `Partial import: ${failedRows.length} rows failed`,
                      failedRows,
                      importResponse: importResponse.data,
                      errorDetailsFilePath: errorFilePath,
                    });
                  } catch (downloadError) {
                    this.logger.error(
                      `[Batch ${batchNumber}] Failed to download error details file: ${downloadError.message}`,
                    );
                    failedRecordsAll.push({
                      batchNumber,
                      error: `Partial import: ${failedRows.length} rows failed`,
                      failedRows,
                      importResponse: importResponse.data,
                      downloadError: downloadError.message,
                    });
                  }
                } else {
                  failedRecordsAll.push({
                    batchNumber,
                    error: `Partial import: ${failedRows.length} rows failed`,
                    failedRows,
                    importResponse: importResponse.data,
                  });
                }
                break;
              }
            } else if (importResponse.data?.Response?.code !== '0') {
              this.logger.log(
                `[Batch ${batchNumber}] CSV import successful - All ${formattedRecords.length} records processed`,
              );
            }
            this.logger.log(
              `[Batch ${batchNumber}] CSV file uploaded successfully`,
            );
            break;
          } catch (error) {
            retries--;
            const errorMessage = axios.isAxiosError(error)
              ? `API Error: ${error.response?.status} - ${error.response?.data?.message || error.message}`
              : `Upload Error: ${error.message}`;
            if (retries === 0) {
              this.logger.warn(
                `[Batch ${batchNumber}] Final upload attempt failed: ${errorMessage}`,
              );
              failedRecordsAll.push({
                batchNumber,
                error: 'CSV upload failed after all retries',
                details: errorMessage,
              });
              break;
            }
            this.logger.warn(
              `[Batch ${batchNumber}] Upload attempt failed (${retries} retries left): ${errorMessage}`,
            );
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }

        if (skippedRecords.length > 0) {
          const skippedFile = path.join(
            this.logDir,
            `skipped_batch_${jobName}_${batchNumber}_${Date.now()}.json`,
          );
          fs.writeFileSync(
            skippedFile,
            JSON.stringify(skippedRecords, null, 2),
          );
          this.logger.log(
            `[Batch ${batchNumber}] Skipped records written to ${skippedFile}`,
          );
        }
        if (failedRecordsAll.length > 0) {
          const failedFile = path.join(
            this.logDir,
            `failed_batch_${jobName}_${batchNumber}_${Date.now()}.json`,
          );
          fs.writeFileSync(
            failedFile,
            JSON.stringify(failedRecordsAll, null, 2),
          );
          this.logger.log(
            `[Batch ${batchNumber}] Failed records written to ${failedFile}`,
          );
        }

        totalProcessed += formattedRecords.length;
        void (totalSkipped += skippedRecords.length);
        void (totalEnabled += formattedRecords.filter((r) => {
          const campusEntry = r.original_campus_entry
            ?.toString()
            ?.toUpperCase();
          return campusEntry === 'Y';
        }).length);
        void (totalDisabled += formattedRecords.filter((r) => {
          const campusEntry = r.original_campus_entry
            ?.toString()
            ?.toUpperCase();
          return campusEntry === 'N';
        }).length);

        batchRecords.length = 0;
        batchRecordsWithPhoto.length = 0;
        skippedRecords.length = 0;
        failedRecordsAll.length = 0;
        for (let i = 0; i < formattedRecords.length; i++) {
          formattedRecords[i] = null;
        }

        this.commonService.logMemoryUsage(batchNumber);
        await this.commonService.cleanupTempFiles(tempDir);
        if (global.gc) {
          global.gc();
        }
      }

      this.logger.log('All batches processed, performing final cleanup...');
      await this.commonService.cleanupTempFiles(tempDir);

      const scheduleNumber = parseInt(jobName.replace('sync-', ''));
      if (!isNaN(scheduleNumber)) {
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

      return {
        success: true,
        message: 'Sync completed successfully',
        recordsProcessed: totalProcessed,
      };
    } catch (error) {
      this.logger.error(`Sync failed for ${jobName}:`, error);
      throw error;
    } finally {
      if (pool) {
        await pool.close();
        this.logger.log('Database connection closed');
      }
    }
  }

  private async *fetchBatches(
    pool: sql.ConnectionPool,
    hasIsArchivedColumn: boolean,
    batchSize: number,
  ) {
    let offset = 0;
    let batchNumber = 0;
    const tableName = this.configService.get('SOURCE_DB_TABLE');

    while (true) {
      batchNumber++;
      let query: string;
      if (hasIsArchivedColumn) {
        query = `
          SELECT * FROM ${tableName}
          WHERE isArchived = 'N' OR isArchived IS NULL
          ORDER BY ID_Number
          OFFSET ${offset} ROWS
          FETCH NEXT ${batchSize} ROWS ONLY
        `;
      } else {
        query = `
          SELECT * FROM ${tableName}
          ORDER BY ID_Number
          OFFSET ${offset} ROWS
          FETCH NEXT ${batchSize} ROWS ONLY
        `;
      }

      const result = await pool.request().query(query);
      if (result.recordset.length === 0) break;
      yield { batchRecords: result.recordset, batchNumber };
      offset += batchSize;
    }
  }

  private normalizeRecord(record: any): any {
    return {
      ID_Number: record.ID_Number || '',
      Name: record.Name || null,
      Lived_Name: record.Lived_Name || null,
      Remarks: record.Remarks || null,
      Photo: record.Photo || null,
      Campus_Entry: record.Campus_Entry || null,
      Unique_ID: record.Unique_ID || null,
      isArchived: record.isArchived === 'Y' || record.isArchived === true,
      Group: record.Group ?? null,
    };
  }
}
