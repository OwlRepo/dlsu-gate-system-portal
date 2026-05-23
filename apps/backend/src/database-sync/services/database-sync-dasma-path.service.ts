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
import { BiostarSyncState } from '../entities/biostar-sync-state.entity';
import { DatabaseSyncCommonService } from './shared/database-sync-common.service';
import { BiostarApiService } from './shared/biostar-api.service';

@Injectable()
export class DatabaseSyncDasmaPathService implements IDatabaseSyncPath {
  private readonly logger = new Logger(DatabaseSyncDasmaPathService.name);
  private readonly logDir: string;
  private sqlConfig: sql.config;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
    @InjectRepository(SyncSchedule)
    private syncScheduleRepository: Repository<SyncSchedule>,
    @InjectRepository(BiostarSyncState)
    private biostarSyncStateRepository: Repository<BiostarSyncState>,
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- interface requires these params
  async syncFromBiostar(jobKey: string, jobName?: string): Promise<void> {
    void jobName; // intentionally unused for path-level sync
    const { token, sessionId } = await this.biostarApiService.getApiToken();
    const apiBaseUrl = this.biostarApiService.getApiBaseUrl();
    const baseConcurrency = Math.max(
      1,
      parseInt(
        this.configService.get('BIOSTAR_DETAIL_CONCURRENCY') || '8',
        10,
      ) || 8,
    );
    let effectiveConcurrency = baseConcurrency;
    const rateLimitTracker = { count: 0 };
    const maxCandidates =
      parseInt(
        this.configService.get('BIOSTAR_MAX_CANDIDATES_PER_RUN') || '0',
        10,
      ) || 0;

    const state = await this.getOrCreateBiostarSyncState();
    state.lastRunAt = new Date();
    await this.biostarSyncStateRepository.save(state);

    this.logger.log(
      `[Dasma Biostar] Starting sync: incremental=${!!state.lastSuccessAt && !!state.lastModifiedCursor}, lastModifiedCursor=${state.lastModifiedCursor ?? 'none'}, lastSuccessAt=${state.lastSuccessAt?.toISOString() ?? 'never'}`,
    );

    const runStartMs = Date.now();
    let totalDiscovered = 0;
    let totalCandidates = 0;
    let totalDetailFetched = 0;
    let totalUpdated = 0;
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let totalCardUpdated = 0;
    const totalCardCleared = 0;
    let totalRateLimitHits = 0;
    let maxLastModified = state.lastModifiedCursor || '0';

    const limit = 500;
    const useIncremental = !!state.lastSuccessAt && !!state.lastModifiedCursor;
    let offset = useIncremental ? 0 : (state.lastProcessedOffset ?? 0);

    try {
      do {
        const params: Record<string, string | number> = {
          limit,
          offset,
          group_id: 1,
          order_by: 'name:true',
        };
        if (useIncremental && state.lastModifiedCursor) {
          params.last_modified = state.lastModifiedCursor;
        }

        const response = await axios.get(`${apiBaseUrl}/api/users`, {
          params,
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

        const total = parseInt(String(userCollection.total || 0), 10);
        const rows = userCollection.rows || [];
        totalDiscovered += rows.length;

        let candidates = rows.filter((u: Record<string, unknown>) => {
          if (!u.user_id) return false;
          const photoExists =
            u.photo_exists === true || u.photo_exists === 'true';
          const cardCount = parseInt(String(u.card_count ?? 0), 10) || 0;
          const hasCard = cardCount > 0;
          return photoExists || hasCard;
        });

        if (
          maxCandidates > 0 &&
          totalCandidates + candidates.length > maxCandidates
        ) {
          const take = maxCandidates - totalCandidates;
          candidates = candidates.slice(0, take);
        }
        totalCandidates += candidates.length;

        this.logger.log(
          `[Dasma Biostar] List page: offset=${offset}, discovered=${rows.length}, candidates=${candidates.length} (totalDiscovered=${totalDiscovered}, totalCandidates=${totalCandidates})`,
        );

        for (const u of rows) {
          const lm = String(u.last_modified ?? '0');
          if (lm > maxLastModified) maxLastModified = lm;
        }

        try {
          const results = await this.commonService.runWithConcurrency(
            candidates,
            effectiveConcurrency,
            async (candidate: { user_id: string }) => {
              const detail =
                await this.biostarApiService.fetchBiostarUserDetailWithRetry(
                  candidate.user_id,
                  token,
                  sessionId,
                  3,
                  rateLimitTracker,
                );
              return { userId: candidate.user_id, detail };
            },
          );

          totalRateLimitHits += rateLimitTracker.count;
          if (rateLimitTracker.count >= 3) {
            const prev = effectiveConcurrency;
            effectiveConcurrency = Math.max(
              1,
              Math.floor(effectiveConcurrency / 2),
            );
            this.logger.warn(
              `[Dasma Biostar] Rate limit threshold reached (${rateLimitTracker.count} hits), reducing concurrency ${prev} -> ${effectiveConcurrency}`,
            );
            rateLimitTracker.count = 0;
          }

          for (const { userId, detail } of results) {
            if (!detail) {
              totalFailed++;
              continue;
            }
            totalDetailFetched++;

            const cleanUserId = (userId || '').trim().replace(/\s/g, '');
            const userObj = (detail.User as Record<string, unknown>) ?? detail;
            const photo =
              (detail.photo as string | null) ??
              (userObj?.photo as string | null) ??
              null;
            const name =
              (detail.name as string | null) ??
              (userObj?.name as string | null) ??
              null;
            const uniqueId = this.normalizeUniqueIdValue(
              this.extractBiostarCardValue(detail),
            );
            const isArchivedFromBiostar =
              this.deriveBiostarUserDisabled(detail);

            const existingStudent = await this.studentRepository.findOne({
              where: { ID_Number: cleanUserId },
            });

            if (existingStudent) {
              const photoChanged = photo !== existingStudent.Photo;
              const existingUnique =
                existingStudent.Unique_ID != null
                  ? String(existingStudent.Unique_ID).trim()
                  : null;
              const uniqueIdChanged =
                uniqueId !== null && uniqueId !== (existingUnique || null);
              const nameChanged = name !== (existingStudent.Name ?? null);
              const isArchivedChanged =
                existingStudent.isArchived !== isArchivedFromBiostar;
              if (
                photoChanged ||
                uniqueIdChanged ||
                nameChanged ||
                isArchivedChanged
              ) {
                const updatePayload: Partial<Student> = {
                  updatedAt: new Date(),
                };
                if (photoChanged) {
                  updatePayload.Photo = photo;
                }
                if (nameChanged) {
                  updatePayload.Name = name ?? existingStudent.Name;
                }
                if (uniqueIdChanged) {
                  updatePayload.Unique_ID = uniqueId;
                }
                if (isArchivedChanged) {
                  updatePayload.isArchived = isArchivedFromBiostar;
                }
                await this.studentRepository.update(
                  { ID_Number: cleanUserId },
                  updatePayload,
                );
                totalUpdated++;
                if (uniqueIdChanged) {
                  totalCardUpdated++;
                }
              } else {
                totalSkipped++;
              }
            } else {
              const newStudent = this.studentRepository.create({
                ID_Number: cleanUserId,
                Photo: photo,
                Unique_ID: uniqueId,
                Name: name,
                isArchived: isArchivedFromBiostar,
              });
              await this.studentRepository.save(newStudent);
              totalCreated++;
              if (uniqueId != null && uniqueId !== '') {
                totalCardUpdated++;
              }
            }
          }
        } catch (pageError) {
          state.lastProcessedOffset = offset;
          state.lastProcessedUserId =
            rows.length > 0 ? String(rows[rows.length - 1].user_id) : null;
          state.lastModifiedCursor = maxLastModified;
          state.lastError = (pageError as Error)?.message ?? String(pageError);
          await this.biostarSyncStateRepository.save(state);
          this.logger.error(
            `[Dasma Biostar] Page failed at offset=${offset}, checkpoint saved for resume`,
            pageError,
          );
          throw pageError;
        }

        state.lastProcessedOffset = offset + limit;
        state.lastProcessedUserId =
          rows.length > 0 ? String(rows[rows.length - 1].user_id) : null;
        state.lastModifiedCursor = maxLastModified;
        await this.biostarSyncStateRepository.save(state);

        offset += limit;

        if (rows.length === 0 || (total > 0 && offset >= total)) break;
        if (maxCandidates > 0 && totalCandidates >= maxCandidates) break;
      } while (true);

      state.lastSuccessAt = new Date();
      state.lastError = null;
      state.lastModifiedCursor = maxLastModified;
      await this.biostarSyncStateRepository.save(state);

      const durationMs = Date.now() - runStartMs;
      this.logger.log(
        `[Dasma Biostar] Sync completed: discovered=${totalDiscovered}, candidates=${totalCandidates}, detailFetched=${totalDetailFetched}, updated=${totalUpdated}, created=${totalCreated}, skipped=${totalSkipped}, failed=${totalFailed}, cardUpdated=${totalCardUpdated}, cardCleared=${totalCardCleared}, rateLimitHits=${totalRateLimitHits}, finalConcurrency=${effectiveConcurrency}, durationMs=${durationMs}`,
      );
      const failRatio =
        totalDetailFetched > 0 ? totalFailed / totalDetailFetched : 0;
      if (failRatio > 0.1) {
        this.logger.warn(
          `[Dasma Biostar] High failure ratio: ${(failRatio * 100).toFixed(1)}% (${totalFailed}/${totalDetailFetched})`,
        );
      }
      if (totalRateLimitHits > 5) {
        this.logger.warn(
          `[Dasma Biostar] Elevated rate limit hits: ${totalRateLimitHits}`,
        );
      }
    } catch (error) {
      state.lastError = error?.message ?? String(error);
      await this.biostarSyncStateRepository.save(state);
      throw error;
    }
  }

  /**
   * Derives whether a Biostar user is disabled/expired.
   * Used to map Biostar state to Postgres isArchived.
   */
  private deriveBiostarUserDisabled(detail: Record<string, unknown>): boolean {
    const userObj = (detail.User as Record<string, unknown>) ?? detail;
    const disabled =
      userObj?.disabled === true ||
      userObj?.disabled === 'true' ||
      detail.disabled === true ||
      detail.disabled === 'true';
    if (disabled) return true;
    const expiry = userObj?.expiry_datetime ?? detail.expiry_datetime;
    if (expiry) {
      const expiryDate = new Date(String(expiry));
      if (!isNaN(expiryDate.getTime()) && expiryDate < new Date()) {
        return true;
      }
    }
    return false;
  }

  private extractBiostarCardValue(
    detail: Record<string, unknown>,
  ): string | null {
    const userObj = (detail.User as Record<string, unknown>) ?? detail;
    const creds = userObj?.credentials as Record<string, unknown> | undefined;
    const cardsFromCreds = creds?.cards as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(cardsFromCreds) && cardsFromCreds.length > 0) {
      const first = cardsFromCreds[0];
      const cid = first?.card_id ?? first?.cardID;
      if (cid != null) return String(cid).trim() || null;
    }
    const cards = (detail.cards ?? userObj?.cards) as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(cards) && cards.length > 0) {
      const first = cards[0];
      const cid = first?.card_id ?? first?.cardID;
      if (cid != null) return String(cid).trim() || null;
    }
    const csn = detail.csn ?? userObj?.csn;
    if (csn != null) return String(csn).trim() || null;
    return null;
  }

  /**
   * When Biostar CSV import uses overwrite (import_option 2), including the current
   * CSN in the row prevents clearing cards enrolled only in Biostar UI.
   */
  private async resolveDasmaCsnForCsvRow(
    userId: string,
    existing: Student | undefined,
    token: string,
    sessionId: string,
    fetchFromBiostar: boolean,
    rateLimitTracker: { count: number },
  ): Promise<string> {
    const fromDb = this.normalizeUniqueIdValue(existing?.Unique_ID);
    if (fromDb) {
      return fromDb;
    }
    if (!fetchFromBiostar) {
      return '';
    }
    const detail = await this.biostarApiService.fetchBiostarUserDetailWithRetry(
      userId,
      token,
      sessionId,
      3,
      rateLimitTracker,
    );
    if (!detail) {
      return '';
    }
    const card = this.extractBiostarCardValue(
      detail as Record<string, unknown>,
    );
    return this.normalizeUniqueIdValue(card) ?? '';
  }

  private async getOrCreateBiostarSyncState(): Promise<BiostarSyncState> {
    let state = await this.biostarSyncStateRepository.findOne({
      where: { schemaKey: 'dasma' },
    });
    if (!state) {
      state = this.biostarSyncStateRepository.create({
        schemaKey: 'dasma',
      });
      await this.biostarSyncStateRepository.save(state);
    }
    return state;
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
        'IsArchived',
      );
      this.logger.log(
        `Table ${hasIsArchivedColumn ? 'has' : 'does not have'} IsArchived column`,
      );
      const batchSize = parseInt(process.env.SYNC_BATCH_SIZE) || 500;
      let totalProcessed = 0;
      let totalSkipped = 0;
      let totalEnabled = 0;
      let totalDisabled = 0;
      let totalActiveExported = 0;
      let totalArchivedDisabledExported = 0;
      const failedRecordsAll = [];
      const seenIdsFromSource = new Set<string>();
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }

      const dasmaHeaders = [
        { id: 'user_id', title: 'user_id' },
        { id: 'name', title: 'name' },
        { id: 'department', title: 'department' },
        { id: 'user_title', title: 'user_title' },
        { id: 'user_group', title: 'user_group' },
        { id: 'remarks', title: 'Remarks' },
        { id: 'csn', title: 'csn' },
        { id: 'start_datetime', title: 'start_datetime' },
        { id: 'expiry_datetime', title: 'expiry_datetime' },
        { id: 'original_campus_entry', title: 'original_campus_entry' },
      ];

      dayjs.extend(utc);
      dayjs.extend(timezone);

      for await (const { batchRecords, batchNumber } of this.fetchBatches(
        pool,
        hasIsArchivedColumn,
        batchSize,
      )) {
        const normalizedRecords = batchRecords.map((record) =>
          this.normalizeRecord(record),
        );

        const batchRecordsWithPhoto = normalizedRecords.map((record) => ({
          ...record,
          Photo: null,
        }));

        batchRecordsWithPhoto.forEach((r) =>
          seenIdsFromSource.add(r.ID_Number),
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

        const toCreate: Array<Partial<Student>> = [];
        const toUpdate: Array<{
          ID_Number: string;
          changes: Partial<Student>;
        }> = [];
        for (const record of batchRecordsWithPhoto) {
          const incomingUniqueId = this.normalizeUniqueIdValue(
            record.Unique_ID,
          );
          const groupValue = this.commonService.normalizeGroupValue(
            record.Group,
          );
          const data: Partial<Student> = {
            ID_Number: record.ID_Number,
            Name: record.Name,
            Lived_Name: record.Lived_Name,
            Remarks: record.Remarks,
            Photo: record.Photo,
            Campus_Entry: record.Campus_Entry,
            isArchived: record.isArchived,
            group: groupValue ?? null,
          };
          if (incomingUniqueId !== null) {
            data.Unique_ID = incomingUniqueId;
          }
          const existing = existingMap.get(record.ID_Number);
          if (!existing) {
            toCreate.push(data);
          } else {
            const changedFields = this.buildChangedFields(existing, {
              Name: record.Name,
              Lived_Name: record.Lived_Name,
              Remarks: record.Remarks,
              Photo: record.Photo,
              Campus_Entry: record.Campus_Entry,
              Unique_ID: incomingUniqueId ?? existing.Unique_ID ?? null,
              isArchived: record.isArchived,
              group: groupValue ?? null,
            });
            if (Object.keys(changedFields).length > 0) {
              toUpdate.push({
                ID_Number: record.ID_Number,
                changes: changedFields,
              });
            }
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
                    for (const rec of insertChunk) {
                      const existing = await this.studentRepository.findOne({
                        where: { ID_Number: rec.ID_Number as string },
                      });
                      if (existing) {
                        const changedFields = this.buildChangedFields(
                          existing,
                          {
                            Name: rec.Name ?? null,
                            Lived_Name: rec.Lived_Name ?? null,
                            Remarks: rec.Remarks ?? null,
                            Photo: rec.Photo ?? null,
                            Campus_Entry: rec.Campus_Entry ?? null,
                            Unique_ID:
                              this.normalizeUniqueIdValue(rec.Unique_ID) ??
                              existing.Unique_ID ??
                              null,
                            isArchived: rec.isArchived ?? false,
                            group: rec.group ?? null,
                          },
                        );
                        if (Object.keys(changedFields).length > 0) {
                          await this.studentRepository.update(
                            { ID_Number: rec.ID_Number as string },
                            { ...changedFields, updatedAt: new Date() },
                          );
                        }
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
              async () => {
                for (const record of updateChunk) {
                  await this.studentRepository.update(
                    { ID_Number: record.ID_Number },
                    {
                      ...record.changes,
                      updatedAt: new Date(),
                    },
                  );
                }
              },
              3,
              `update chunk ${Math.floor(i / updateChunkSize) + 1}`,
            );
          }
        }
        this.logger.log(
          `[Batch ${batchNumber}] Synced ${toCreate.length + toUpdate.length} records (${batchRecordsWithPhoto.length - (toCreate.length + toUpdate.length)} unchanged)`,
        );

        const refreshedStudents = await this.commonService.executeWithRetry(
          () =>
            this.studentRepository.find({
              where: { ID_Number: In(idNumbers) },
            }),
          3,
          `refresh students for CSN batch ${batchNumber}`,
        );
        refreshedStudents.forEach((s) => existingMap.set(s.ID_Number, s));

        const csvFilePath = path.join(
          tempDir,
          `sync_${jobName}_batch${batchNumber}_${Date.now()}.csv`,
        );
        const csvWriter = createObjectCsvWriter({
          path: csvFilePath,
          header: dasmaHeaders,
        });
        const skippedRecords = [];

        const currentDate = dayjs().tz('Asia/Manila').startOf('day');
        const formattedStartDateEnabled = currentDate
          .subtract(1, 'day')
          .format('YYYY-MM-DD HH:mm:ss.SSS');
        const formattedExpiryDateEnabled = currentDate
          .add(10, 'year')
          .format('YYYY-MM-DD HH:mm:ss.SSS');
        const formattedStartDateDisabled = currentDate
          .subtract(2, 'day')
          .format('YYYY-MM-DD HH:mm:ss.SSS');
        const formattedExpiryDateDisabled = currentDate
          .subtract(1, 'day')
          .format('YYYY-MM-DD HH:mm:ss.SSS');

        const activeRecordsForBiostar = batchRecordsWithPhoto.filter(
          (r) => r.isArchived !== true,
        );

        const fetchCardsFromBiostar =
          (this.configService.get('DASMA_CSV_FETCH_CARD_FROM_BIOSTAR') ??
            'true') !== 'false';
        const csnConcurrency = Math.max(
          1,
          parseInt(
            this.configService.get('BIOSTAR_DETAIL_CONCURRENCY') || '8',
            10,
          ) || 8,
        );
        const { token: csnToken, sessionId: csnSessionId } =
          await this.biostarApiService.getApiToken();
        const csnRateLimitTracker = { count: 0 };

        type DasmaCsvRowInput = {
          userId: string;
          rowBase: Record<string, string>;
        };

        const validatedRows: Array<DasmaCsvRowInput | null> =
          activeRecordsForBiostar.map((record) => {
            // Preserve ID_Number as-is for identity; no hex conversion or truncation
            const userId = (record.ID_Number?.toString() || '').trim();
            const name = this.commonService.removeSpecialChars(
              record.Name?.trim() || '',
            );
            const remarks = record.Remarks?.trim() || '';
            const validationErrors = [];
            if (!userId) {
              validationErrors.push('Empty ID');
            }
            if (!name) {
              validationErrors.push('Empty name');
            }
            if (validationErrors.length > 0) {
              skippedRecords.push({
                ID_Number: record.ID_Number,
                userId,
                name,
                livedName: '',
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

            const userTitle =
              (record.Group && String(record.Group).trim()) || 'Student';
            const isDisabled =
              record.Campus_Entry?.toString().toUpperCase() === 'N' ||
              record.isArchived === true;
            return {
              userId,
              rowBase: {
                user_id: userId,
                name: name,
                department: 'DLSU',
                user_title: userTitle,
                user_group: 'All Users',
                remarks: remarks,
                start_datetime: isDisabled
                  ? formattedStartDateDisabled
                  : formattedStartDateEnabled,
                expiry_datetime: isDisabled
                  ? formattedExpiryDateDisabled
                  : formattedExpiryDateEnabled,
                original_campus_entry: String(record.Campus_Entry ?? ''),
              },
            };
          });

        const toResolveCsn = validatedRows.filter(
          (row): row is DasmaCsvRowInput => row !== null,
        );

        let csnFilledFromApi = 0;
        const formattedRecords: Record<string, string>[] =
          await this.commonService.runWithConcurrency(
            toResolveCsn,
            csnConcurrency,
            async ({ userId, rowBase }): Promise<Record<string, string>> => {
              const hadDbCsn = !!this.normalizeUniqueIdValue(
                existingMap.get(userId)?.Unique_ID,
              );
              const csn = await this.resolveDasmaCsnForCsvRow(
                userId,
                existingMap.get(userId),
                csnToken,
                csnSessionId,
                fetchCardsFromBiostar,
                csnRateLimitTracker,
              );
              if (!hadDbCsn && csn) {
                csnFilledFromApi++;
              }
              return { ...rowBase, csn };
            },
          );

        if (csnFilledFromApi > 0 || fetchCardsFromBiostar) {
          this.logger.log(
            `[Batch ${batchNumber}] Dasma CSV CSN: filledFromBiostarApi=${csnFilledFromApi}, fetchEnabled=${fetchCardsFromBiostar}`,
          );
        }

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

        await this.commonService.logSyncedRecords(
          formattedRecords,
          jobName,
          true,
        );

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
        totalActiveExported += formattedRecords.length;
        totalArchivedDisabledExported += batchRecordsWithPhoto.filter(
          (r) => r.isArchived === true,
        ).length;
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

      let archivedByReconciliation = 0;
      if (seenIdsFromSource.size > 0) {
        const activeStudents = await this.studentRepository.find({
          where: { isArchived: false },
          select: ['ID_Number'],
        });
        const missingIds = activeStudents
          .filter((s) => !seenIdsFromSource.has(s.ID_Number))
          .map((s) => s.ID_Number);
        if (missingIds.length > 0) {
          const reconcileChunkSize = 200;
          for (let i = 0; i < missingIds.length; i += reconcileChunkSize) {
            const chunk = missingIds.slice(i, i + reconcileChunkSize);
            const result = await this.studentRepository.update(
              { ID_Number: In(chunk) },
              { isArchived: true, updatedAt: new Date() },
            );
            archivedByReconciliation += result.affected ?? 0;
          }
          this.logger.log(
            `[Dasma] Reconciliation: archived ${archivedByReconciliation} users missing from source`,
          );
        }
      }

      this.logger.log(
        `[Dasma] Run summary: seenFromSource=${seenIdsFromSource.size}, activeUploadedToBiostar=${totalActiveExported}, archivedSkippedFromCsv=${totalArchivedDisabledExported}, archivedByReconciliation=${archivedByReconciliation}`,
      );
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
      const columns =
        'ID, LastName, FirstName, MiddleName, Suffix, [Group], Status, Remarks, IsArchived';
      if (hasIsArchivedColumn) {
        // Fetch both active and archived rows; archived rows exported as disabled via date-window
        query = `
          SELECT ${columns} FROM ${tableName}
          ORDER BY ID
          OFFSET ${offset} ROWS
          FETCH NEXT ${batchSize} ROWS ONLY
        `;
      } else {
        query = `
          SELECT ${columns} FROM ${tableName}
          ORDER BY ID
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
    const nameParts: string[] = [];
    if (record.LastName) nameParts.push(record.LastName.trim());
    if (record.FirstName) nameParts.push(record.FirstName.trim());
    if (record.MiddleName) nameParts.push(record.MiddleName.trim());
    if (record.Suffix) nameParts.push(record.Suffix.trim());

    let fullName = '';
    if (nameParts.length > 0) {
      fullName = nameParts[0];
      if (nameParts.length > 1) {
        fullName += ', ' + nameParts.slice(1).join(' ');
      }
    }

    const campusEntry = Boolean(record.Status) ? 'Y' : 'N';
    const isArchived = Boolean(record.IsArchived);

    const rawId = (record.ID?.toString() || '').trim().replace(/\s/g, '');
    return {
      ID_Number: rawId,
      Name: fullName,
      Lived_Name: null,
      Remarks: record.Remarks || null,
      Photo: null,
      Campus_Entry: campusEntry,
      Unique_ID: null,
      isArchived: isArchived,
      Group: record['Group'] ?? record.Group ?? null,
    };
  }

  private normalizeUniqueIdValue(value: unknown): string | null {
    if (value == null) {
      return null;
    }

    const normalized = String(value).trim();
    return normalized === '' ? null : normalized;
  }

  private buildChangedFields(
    existing: Student,
    incoming: Pick<
      Student,
      | 'Name'
      | 'Lived_Name'
      | 'Remarks'
      | 'Photo'
      | 'Campus_Entry'
      | 'Unique_ID'
      | 'isArchived'
      | 'group'
    >,
  ): Partial<Student> {
    const changedFields: Partial<Student> = {};

    if (existing.Name !== incoming.Name) {
      changedFields.Name = incoming.Name;
    }
    if (existing.Lived_Name !== incoming.Lived_Name) {
      changedFields.Lived_Name = incoming.Lived_Name;
    }
    if (existing.Remarks !== incoming.Remarks) {
      changedFields.Remarks = incoming.Remarks;
    }
    if (existing.Photo !== incoming.Photo) {
      changedFields.Photo = incoming.Photo;
    }
    if (existing.Campus_Entry !== incoming.Campus_Entry) {
      changedFields.Campus_Entry = incoming.Campus_Entry;
    }
    if (existing.isArchived !== incoming.isArchived) {
      changedFields.isArchived = incoming.isArchived;
    }
    if (existing.group !== incoming.group) {
      changedFields.group = incoming.group;
    }

    const normalizedIncomingUnique = this.normalizeUniqueIdValue(
      incoming.Unique_ID,
    );
    if (
      normalizedIncomingUnique !== null &&
      String(existing.Unique_ID ?? '').trim() !== normalizedIncomingUnique
    ) {
      changedFields.Unique_ID = normalizedIncomingUnique;
    }

    return changedFields;
  }
}
