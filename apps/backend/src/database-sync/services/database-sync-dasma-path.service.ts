import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { In, IsNull } from 'typeorm';
import * as sql from 'mssql';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as https from 'https';
import { createHash } from 'crypto';
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

/** The datetime format BioStar's CSV import accepts. */
const BIOSTAR_DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss.SSS';

/** Mirrors the same constant in the common service, which owns the stored window. */
const ACTIVATION_VALIDITY_YEARS = 10;

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
    /** Users BioStar listed but whose detail could not be fetched. */
    const failedUserIds: string[] = [];
    /** Stale remarks spotted in BioStar that PostgreSQL no longer has. */
    const remarksBackfilled: string[] = [];
    /** True when the per-run candidate cap, not exhaustion, ended the loop. */
    let endedOnCap = false;
    /** Every user_id BioStar listed, for the reconciliation below. */
    const discoveredUserIds: string[] = [];
    /** Field names on the first list row — settles the list-shape question. */
    let firstListRowKeys: string[] = [];
    /** Distinct BioStar group ids seen, to check the hardcoded group_id: 1. */
    const groupIdsSeen = new Set<string>();
    let reportedTotal = 0;
    let totalDetailWithPhoto = 0;

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

        reportedTotal = total;
        if (firstListRowKeys.length === 0 && rows.length > 0) {
          firstListRowKeys = Object.keys(rows[0]).sort();
        }
        for (const u of rows as Record<string, unknown>[]) {
          if (u.user_id != null) discoveredUserIds.push(String(u.user_id));
          const groupId =
            (u.user_group_id as { id?: unknown })?.id ?? u.group_id;
          if (groupId != null) groupIdsSeen.add(String(groupId));
        }

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
          // Flag the truncation here rather than at the loop's cap-break: the
          // break below is unreachable whenever `offset` (which steps by the
          // page size) passes `total` first, yet candidates were still dropped.
          if (take < candidates.length) {
            endedOnCap = true;
          }
          candidates = candidates.slice(0, take);
        }
        totalCandidates += candidates.length;

        this.logger.log(
          `[Dasma Biostar] List page: offset=${offset}, discovered=${rows.length}, candidates=${candidates.length} (totalDiscovered=${totalDiscovered}, totalCandidates=${totalCandidates})`,
        );

        for (const u of rows) {
          const lm = String(u.last_modified ?? '0');
          if (this.isLaterCursor(lm, maxLastModified)) maxLastModified = lm;
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
              // Name who was lost. Counting failures told nobody which users
              // were missing from PostgreSQL afterwards.
              failedUserIds.push(String(userId));
              continue;
            }
            totalDetailFetched++;
            if (
              (detail.photo ??
                (detail.User as Record<string, unknown>)?.photo) != null
            ) {
              totalDetailWithPhoto++;
            }

            const cleanUserId = (userId || '').trim().replace(/\s/g, '');
            const userObj = (detail.User as Record<string, unknown>) ?? detail;
            const photo =
              (detail.photo as string | null) ??
              (userObj?.photo as string | null) ??
              null;
            /** The photo BioStar actually sent, or null. "" is not an image. */
            const sentPhoto =
              typeof photo === 'string' && photo.trim() !== '' ? photo : null;
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

            // What BioStar currently shows on the gate screen for this person.
            const biostarRemark = this.extractBiostarCustomField(
              detail,
              'Remarks',
            );

            if (existingStudent) {
              // Reconcile the remark while we already have the detail in hand.
              //
              // A remark removed upstream BEFORE the clearing fix shipped left
              // no trace to act on: PostgreSQL was blanked in that same run, so
              // the removal can never be observed again and nothing would
              // revisit the row. BioStar keeps showing the old text forever.
              // Comparing here costs nothing — this payload is already fetched.
              //
              // Only "PostgreSQL says nothing, BioStar says something" counts.
              // A remark PostgreSQL still holds is not drift: the roster sync
              // owns its text, and clearing it here would delete a live remark.
              const postgresRemark = existingStudent.Remarks?.trim() || null;
              const remarkNeedsClearing =
                postgresRemark === null && !!biostarRemark;

              // A missing `photo` is ambiguous, and the two meanings need
              // opposite handling:
              //
              //   - the photo was DELETED in BioStar. Ours must follow, or a
              //     stale face stays on the gate screen — worse than no face,
              //     because a guard may be shown the wrong person.
              //   - the reply simply did not carry it. Ours must survive:
              //     nothing on the Dasma path can put it back, since the
              //     outbound CSV has no photo column and this inbound copy is
              //     the only one that exists.
              //
              // `photo_exists` is BioStar's own statement of which it is, and
              // it is carried on the user detail. Measured against the 34 users
              // captured live on 2026-09-10: every detail carried the flag, and
              // it agreed with whether `photo` was present in 34 of 34 cases.
              //
              // Absent flag means we were not told — the safe reading is to
              // leave the stored photo alone rather than guess.
              // Bytes beat the flag. `photo_exists` only has to settle what an
              // ABSENT photo means; if an image actually arrived, BioStar
              // plainly has one, whatever the flag claims. And an empty string
              // is not an image — storing it blanks the avatar just as surely
              // as null does.
              //
              // The flag is read loosely on purpose: it can only ever trigger a
              // DELETE, so a case-sensitive match that mistook "TRUE" for "not
              // true" would wipe a real photo.
              const flagRaw =
                (userObj?.photo_exists as unknown) ?? detail.photo_exists;
              const saysNoPhoto =
                flagRaw !== undefined &&
                flagRaw !== null &&
                String(flagRaw).trim().toLowerCase() === 'false';

              // undefined here means "we were not told" — leave the stored
              // photo exactly as it is.
              let nextPhoto: string | null | undefined;
              if (sentPhoto !== null) {
                nextPhoto = sentPhoto;
              } else if (saysNoPhoto) {
                nextPhoto = null;
              } else {
                nextPhoto = undefined;
              }

              const photoChanged =
                nextPhoto !== undefined && nextPhoto !== existingStudent.Photo;
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
                isArchivedChanged ||
                remarkNeedsClearing ||
                !existingStudent.remarks_checked_at
              ) {
                const updatePayload: Partial<Student> = {
                  updatedAt: new Date(),
                  // Stamped every time we see this person's detail, so the
                  // bounded sweep can tell who still needs looking at.
                  remarks_checked_at: new Date(),
                };
                if (remarkNeedsClearing) {
                  updatePayload.remarks_clear_pending = true;
                  remarksBackfilled.push(cleanUserId);
                }
                if (photoChanged) {
                  updatePayload.Photo = nextPhoto as string | null;
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
                Photo: sentPhoto,
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
        if (maxCandidates > 0 && totalCandidates >= maxCandidates) {
          endedOnCap = true;
          break;
        }
      } while (true);

      // A run only counts as successful when it actually saw everything it was
      // supposed to see. Marking a truncated run successful advances the
      // incremental cursor past users that were never fetched, and no later
      // run ever goes back for them.
      const incompleteReasons: string[] = [];
      if (endedOnCap) {
        incompleteReasons.push(
          `stopped early at the BIOSTAR_MAX_CANDIDATES_PER_RUN cap of ${maxCandidates}`,
        );
      }
      if (failedUserIds.length > 0) {
        incompleteReasons.push(
          `${failedUserIds.length} detail fetch(es) failed: ${failedUserIds.slice(0, 20).join(', ')}${failedUserIds.length > 20 ? ' …' : ''}`,
        );
      }

      if (incompleteReasons.length === 0) {
        state.lastSuccessAt = new Date();
        state.lastError = null;
        state.lastModifiedCursor = maxLastModified;
      } else {
        // Leave lastSuccessAt and the cursor where they were so the next run
        // re-covers the same ground instead of stepping over the gap.
        state.lastError = `Run incomplete — ${incompleteReasons.join('; ')}`;
        this.logger.warn(`[Dasma Biostar] ${state.lastError}`);
      }
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
      // Names the users BioStar reported that PostgreSQL does not hold, which
      // is the durable answer to "some ID numbers are not synchronised"
      // instead of inferring it from counts.
      const postgresIds = new Set(
        (await this.studentRepository.find({ select: ['ID_Number'] })).map(
          (s) => s.ID_Number,
        ),
      );
      const missingFromPostgres = discoveredUserIds.filter(
        (id) => !postgresIds.has(id),
      );

      await this.commonService.writeSyncDiagnostics(jobKey, {
        direction: 'biostar-to-postgres',
        schemaEnv: 'dasma',
        incremental: useIncremental,
        listRowKeys: firstListRowKeys,
        groupIdsSeen: [...groupIdsSeen],
        reportedTotal: reportedTotal,
        discovered: totalDiscovered,
        candidatesAccepted: totalCandidates,
        excludedNoPhotoNoCard: totalDiscovered - totalCandidates,
        detailFetched: totalDetailFetched,
        detailHadPhoto: totalDetailWithPhoto,
        detailHadNoPhoto: totalDetailFetched - totalDetailWithPhoto,
        // Stale remarks found in BioStar that PostgreSQL no longer has, and so
        // queued for clearing. Costs no extra BioStar call — the detail is
        // already fetched. Expect a burst on the first runs after deploy while
        // the pre-fix backlog is worked off, then effectively zero.
        remarksBackfilledFromBiostar:
          this.commonService.capIds(remarksBackfilled),
        created: totalCreated,
        updated: totalUpdated,
        skippedUnchanged: totalSkipped,
        failedUserIds: this.commonService.capIds(failedUserIds),
        missingFromPostgres: this.commonService.capIds(missingFromPostgres),
        postgresRowCount: postgresIds.size,
        endedOnCap,
        cursorMode: this.cursorMode(maxLastModified),
        lastModifiedCursor: state.lastModifiedCursor,
        markedSuccessful: !!state.lastSuccessAt,
        rateLimitHits: totalRateLimitHits,
      });

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

  /**
   * Looks at a bounded slice of students never reconciled against BioStar and
   * flags any whose remark BioStar still shows but PostgreSQL no longer has.
   *
   * This exists only to drain the backlog that predates remark clearing: those
   * rows were blanked in PostgreSQL without BioStar ever being told, and the
   * removal cannot recur, so nothing else would ever revisit them.
   *
   * Deliberately finite. It selects only rows with no `remarks_checked_at`, so
   * once the roster has been worked through it selects nothing and costs
   * nothing — rather than re-scanning the same people forever.
   *
   * Never throws: a sweep is a repair job, not a reason to fail a roster sync.
   */
  private async sweepUncheckedRemarks(jobName: string): Promise<number> {
    const SWEEP_SIZE = 500;
    try {
      const unchecked = await this.studentRepository.find({
        where: { remarks_checked_at: IsNull(), isArchived: false },
        select: ['ID_Number', 'Remarks'],
        take: SWEEP_SIZE,
      });
      if (unchecked.length === 0) return 0;

      const { token, sessionId } = await this.biostarApiService.getApiToken();
      const rateLimitTracker = { count: 0 };
      const flagged: string[] = [];
      const checkedAt = new Date();

      for (const student of unchecked) {
        const { detail, definitive } =
          await this.biostarApiService.fetchBiostarUserDetail(
            student.ID_Number,
            token,
            sessionId,
            3,
            rateLimitTracker,
          );

        // Leave the stamp off only when the answer is genuinely unknown — a
        // timeout, a 5xx — so the row comes back around next run.
        if (!detail && !definitive) continue;

        // A definitive 400/404 IS an answer: BioStar does not have this person,
        // so there is no remark over there to clear and the row is finished
        // with. Skipping the stamp here is what stopped the sweep draining —
        // those rows were re-checked on every run forever, which defeats the
        // whole self-terminating design.
        if (!detail) {
          await this.studentRepository.update(
            { ID_Number: student.ID_Number },
            { remarks_checked_at: checkedAt },
          );
          continue;
        }

        const biostarRemark = this.extractBiostarCustomField(detail, 'Remarks');
        const postgresRemark = student.Remarks?.trim() || null;
        const needsClearing = postgresRemark === null && !!biostarRemark;

        await this.studentRepository.update(
          { ID_Number: student.ID_Number },
          {
            remarks_checked_at: checkedAt,
            ...(needsClearing ? { remarks_clear_pending: true } : {}),
          },
        );
        if (needsClearing) flagged.push(student.ID_Number);
      }

      this.logger.log(
        `[${jobName}] Remark sweep: checked ${unchecked.length}, flagged ${flagged.length} stale remark(s) for clearing`,
      );
      return unchecked.length;
    } catch (error) {
      this.logger.warn(
        `[${jobName}] Remark sweep skipped: ${(error as Error)?.message ?? String(error)}`,
      );
      return 0;
    }
  }

  /**
   * Reads one custom field's value off a BioStar user detail payload.
   *
   * The `{ custom_field: { name }, item }` shape is not guesswork: it is what
   * the production dashboards read off the live server
   * (`apps/portal-web/src/app/dashboard/dashboard.tsx`), matching on
   * `field.custom_field.name === "Remarks"`.
   *
   * Returns null for absent, blank or whitespace-only, so "no remark" is one
   * answer rather than three.
   */
  private extractBiostarCustomField(
    detail: Record<string, unknown>,
    fieldName: string,
  ): string | null {
    const userObj = (detail.User as Record<string, unknown>) ?? detail;
    const fields =
      (detail.user_custom_fields as unknown[]) ??
      (userObj?.user_custom_fields as unknown[]);
    if (!Array.isArray(fields)) return null;

    const match = fields.find(
      (entry) =>
        (entry as { custom_field?: { name?: string } })?.custom_field?.name ===
        fieldName,
    ) as { item?: unknown } | undefined;

    const value = match?.item;
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text === '' ? null : text;
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
   * Resolves the `csn` cell for one CSV row.
   *
   * Under `import_option: 2` a blank `csn` DESTROYS the user's card — measured
   * against the live server on 2026-09-10, where a single import with a blank
   * cell took a user from `card_count: 1, cards: ["7710000016"]` to
   * `card_count: 0, cards: []`. So carrying the current CSN through is not a
   * nicety, it is what stops the roster sync deleting cards that were enrolled
   * in the BioStar UI. A cell is only ever left blank when we positively know
   * there is no card to lose.
   *
   * The lookup is unconditional. It used to sit behind
   * `DASMA_CSV_FETCH_CARD_FROM_BIOSTAR`, which existed to avoid one GET per
   * card-less student per run — but the card is written to `Unique_ID` the
   * first time it is found, so that cost was already one-time. Switching the
   * lookup off left only bad options: send a blank and destroy cards, or hold
   * the row back and stop updating those people at all. A flag whose only safe
   * value is "on" is a trap, so it is gone.
   */
  private async resolveDasmaCsnForCsvRow(
    userId: string,
    existing: Student | undefined,
    token: string,
    sessionId: string,
    rateLimitTracker: { count: number },
  ): Promise<{ csn: string; unresolved: boolean; fetched: boolean }> {
    return this.resolveCsn(
      userId,
      existing,
      token,
      sessionId,
      rateLimitTracker,
    );
  }

  /**
   * Fingerprints one rendered CSV row.
   *
   * Hashed in header order over the exact cell values, so this identifies the
   * bytes BioStar is about to receive rather than the database row behind them.
   * That distinction is the point: a row can change without any Postgres column
   * changing — a card newly resolved from BioStar, or a first activation window
   * — and a column-level comparison would miss exactly those.
   */
  private hashCsvRow(
    row: Record<string, string>,
    headers: { id: string; title: string }[],
  ): string {
    // NUL-delimited, written as an escape so it is visible in a diff: a raw
    // NUL byte in the source renders as blank in most tools and reads as a
    // space. A space would be wrong here — spaces occur inside `name`,
    // inside `user_title` (free text from the source `Group`) and inside
    // `Remarks`, so the field boundaries would be ambiguous and two
    // different rows could hash alike. That row would then be silently
    // never exported and stay stale in BioStar forever.
    const payload = headers.map((h) => row[h.id] ?? '').join('\u0000');
    return createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Records what BioStar accepted, so the next run can stay quiet.
   *
   * Never throws, deliberately. This runs inside the upload retry loop, so an
   * exception here would be caught as an upload failure and the identical CSV
   * would be sent to BioStar again — a database hiccup causing an extra
   * overwrite import, which is precisely what the hash exists to prevent.
   *
   * Failing to record a hash is the safe direction: the row simply goes out
   * again on the next run. Losing a hash costs one redundant export; throwing
   * costs an immediate duplicate import plus a device re-transfer.
   */
  private async persistRowHashes(
    records: Record<string, string>[],
    hashes: Map<string, string>,
  ): Promise<void> {
    const chunkSize = 50;
    try {
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        await this.commonService.executeWithRetry(
          async () => {
            for (const row of chunk) {
              const hash = hashes.get(row.user_id);
              if (!hash) continue;
              await this.studentRepository.update(
                { ID_Number: row.user_id },
                { biostar_row_hash: hash },
              );
            }
          },
          3,
          `persist row hashes chunk ${Math.floor(i / chunkSize) + 1}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not record CSV row hashes; those rows will be re-exported next run: ${
          (error as Error)?.message ?? String(error)
        }`,
      );
    }
  }

  private async resolveCsn(
    userId: string,
    existing: Student | undefined,
    token: string,
    sessionId: string,
    rateLimitTracker: { count: number },
  ): Promise<{ csn: string; unresolved: boolean; fetched: boolean }> {
    const fromDb = this.normalizeUniqueIdValue(existing?.Unique_ID);
    if (fromDb) {
      return { csn: fromDb, unresolved: false, fetched: false };
    }
    const { detail, definitive } =
      await this.biostarApiService.fetchBiostarUserDetail(
        userId,
        token,
        sessionId,
        3,
        rateLimitTracker,
      );
    if (!detail && !definitive) {
      // BioStar was asked and could not answer — a timeout, a 5xx, a 429 that
      // outlived its retries. This is the ONLY case where an empty `csn` is
      // dangerous: under `import_option: 2` a blank cell is a candidate to
      // blank a card the person really holds, and we do not know whether they
      // hold one. The caller drops the row and BioStar keeps what it has.
      return { csn: '', unresolved: true, fetched: false };
    }
    if (!detail) {
      // A definitive 400/404: BioStar looked and has never heard of this
      // person. They are precisely who the CSV exists to CREATE, and an empty
      // `csn` cannot blank a card on a user who does not exist yet. Treating
      // this like "could not be reached" deadlocked every new student out of
      // enrolment — they could not be created because they were not already
      // there. Observed live 2026-09-10: 13 of 14 new students silently
      // dropped.
      return { csn: '', unresolved: false, fetched: false };
    }
    const card = this.extractBiostarCardValue(
      detail as Record<string, unknown>,
    );
    const csn = this.normalizeUniqueIdValue(card) ?? '';
    return { csn, unresolved: false, fetched: csn !== '' };
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
      // One timestamp for the whole run. Every activation stamped by this sync
      // shares it, so a batch that straddles midnight cannot hand two people
      // activated in the same run expiry dates a day apart.
      const runNow = new Date();

      // IDs that reached the CSV active but with no stored window, so the run
      // fell back to a today-derived expiry rather than shipping a gate device
      // an empty one. This should always be EMPTY, including the first run
      // after deploy: the window is persisted earlier in the same run than the
      // CSV build, and existingMap is refreshed from the database in between.
      // Anything here means that ordering has broken.
      /** Extra CSV lines dropped because the source repeated an id. */
      let csvDuplicateRowsDropped = 0;
      const expiryFallbackUsed: string[] = [];
      /**
       * Disabled rows whose window had to be anchored to today because
       * `date_deactivated` was never stamped. Must stay empty: anything here
       * re-exports every single day, which is the churn this path exists to
       * stop.
       */
      const disabledAnchorFallbackUsed: string[] = [];

      // IDs whose remark went from a value to empty this run. These need an
      // explicit BioStar PUT; the CSV cannot clear a custom field.
      const remarksClearedIds: string[] = [];

      // Per-batch csv_import outcome, so a partial or unexpected response is
      // visible in the diagnostics file rather than only in the logs.
      const csvImportOutcomes: Array<{
        batchNumber: number;
        responseCode: string | null;
        outcome: 'success' | 'partial' | 'failed';
        partialFailureRows: number;
        retriesUsed: number;
      }> = [];

      // Evidence for the deferred changed-only-export decision: how much of
      // each run is re-sending rows that did not change.
      let rowsChanged = 0;
      let rowsUnchanged = 0;
      /** Rows dropped because BioStar could not confirm their card. */
      const csnUnresolvedAll: string[] = [];
      /** Rows suppressed because their exported content is unchanged. */
      let csvRowsSuppressed = 0;
      let csvRowsEmitted = 0;
      let batchesSkippedNoChanges = 0;
      let csnPersistedFromBiostar = 0;

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
          // The activation window is decided by a state transition, not by
          // comparing values, so it is resolved separately from
          // buildChangedFields and merged in afterwards.
          const incomingActive = this.commonService.isRecordActive(
            record.Campus_Entry,
            record.isArchived,
          );
          const activationWindow = this.commonService.resolveActivationWindow(
            existing,
            incomingActive,
            runNow,
          );
          if (!existing) {
            toCreate.push({ ...data, ...(activationWindow ?? {}) });
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
            // A remark that went from a value to nothing needs a per-user PUT:
            // an empty CSV cell appears to be ignored by BioStar's import
            // (DLSU field report, never verified here), so the CSV
            // alone can never clear it.
            const remarkWasRemoved =
              'Remarks' in changedFields &&
              !changedFields.Remarks &&
              !!existing.Remarks;
            if (remarkWasRemoved) {
              remarksClearedIds.push(record.ID_Number);
            }
            const merged = {
              ...changedFields,
              ...(activationWindow ?? {}),
              // Persist the intent in the same write that nulls Remarks. The
              // transition itself cannot be re-derived next run — `existing`
              // will already be null — so without this a failed PUT could
              // never be retried.
              ...(remarkWasRemoved ? { remarks_clear_pending: true } : {}),
            };
            if (Object.keys(merged).length > 0) {
              toUpdate.push({
                ID_Number: record.ID_Number,
                changes: merged,
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
                        // A row that lands here was meant to be an insert, so
                        // it carries a freshly-resolved window on `rec`. Re-run
                        // the transition against the row that actually exists,
                        // or this path would leave the window null forever.
                        const activationWindow =
                          this.commonService.resolveActivationWindow(
                            existing,
                            this.commonService.isRecordActive(
                              rec.Campus_Entry ?? null,
                              rec.isArchived ?? false,
                            ),
                            runNow,
                          );
                        const merged = {
                          ...changedFields,
                          ...(activationWindow ?? {}),
                        };
                        if (Object.keys(merged).length > 0) {
                          await this.studentRepository.update(
                            { ID_Number: rec.ID_Number as string },
                            { ...merged, updatedAt: new Date() },
                          );
                        }
                      } else {
                        // Collateral damage. The chunk was rejected wholesale
                        // because SOME row in it duplicated an existing ID —
                        // but this row is genuinely new and did nothing wrong.
                        // Without this it was silently dropped: it never
                        // reached PostgreSQL, so it never reached BioStar, so
                        // the person could not get through the gate. One
                        // duplicated ID in the source view took out up to 50
                        // students at a time, invisibly.
                        //
                        // Inserted individually. If the duplicate is WITHIN
                        // this chunk, the first pass inserts and the second
                        // finds it existing and updates — which de-duplicates
                        // the source view for free.
                        try {
                          await this.studentRepository.insert(rec);
                        } catch (insertError) {
                          this.logger.error(
                            `[Batch ${batchNumber}] Could not insert ${rec.ID_Number}: ${
                              (insertError as Error)?.message
                            }`,
                          );
                          failedRecordsAll.push({
                            batchNumber,
                            error: 'Insert failed after duplicate-key fallback',
                            details: String(rec.ID_Number),
                          });
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
        rowsChanged += toCreate.length + toUpdate.length;
        rowsUnchanged +=
          batchRecordsWithPhoto.length - (toCreate.length + toUpdate.length);

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

        // Only a fallback now. Both windows are anchored to what is stored on
        // the row — activation for the enabled window, deactivation for the
        // disabled one — so an unchanged person exports identical dates every
        // run. See the per-row derivation below.
        const currentDate = dayjs().tz('Asia/Manila').startOf('day');

        const activeRecordsForBiostar = batchRecordsWithPhoto.filter(
          (r) => r.isArchived !== true,
        );

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
            // Flattened, not quoted-and-preserved.
            //
            // Our writer quotes an embedded newline correctly per RFC 4180,
            // but BioStar's importer does not read it that way: on 2026-09-10 a
            // live import rejected such a row with `User ID Type Mismatch.`,
            // having treated the continuation line as a fresh record whose
            // first column was the tail of the remark. One bad remark silently
            // costs that person their row in the batch. `Remarks` is free text
            // a clerk types, so a pasted newline is entirely plausible.
            const remarks = this.flattenCsvCell(record.Remarks);
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
            const isDisabled = !this.commonService.isRecordActive(
              record.Campus_Entry,
              record.isArchived,
            );

            // THE FIX. The enabled window now comes from what was stored at
            // activation instead of being re-derived from today, so a record
            // that has not changed exports the same dates on every run.
            // `existingMap` was refreshed from the database a few lines above,
            // so it already holds whatever this run just wrote.
            const stored = existingMap.get(userId);
            const storedStart = stored?.date_activated ?? null;
            const storedExpiry = stored?.expiry_datetime ?? null;

            if (!isDisabled && (!storedStart || !storedExpiry)) {
              // Never ship a gate device an empty expiry. Fall back to the old
              // behaviour and name the record so the gap is visible rather than
              // silent — this list must be empty on the second run.
              expiryFallbackUsed.push(userId);
            }

            // The disabled window is anchored to the stored deactivation date,
            // not to today. It still has to read as expired — an expired window
            // is how this system denies someone at the gate — and a fixed date
            // in the past does that just as well as a moving one. Deriving it
            // from dayjs() every run made every disabled person's row change
            // daily, which would re-export the entire disabled population every
            // single day and defeat the whole point of the comparison below.
            const disabledAnchor = stored?.date_deactivated
              ? dayjs(stored.date_deactivated).tz('Asia/Manila').startOf('day')
              : currentDate;
            if (isDisabled && !stored?.date_deactivated) {
              // Same contract as expiryFallbackUsed on the enabled branch:
              // name the row rather than let a daily-changing window pass
              // silently.
              disabledAnchorFallbackUsed.push(userId);
            }

            // The enabled window is floored to the activation DAY and starts a
            // day earlier, which is what the legacy build always sent.
            //
            // Anchoring to the stored date is what stopped the drift; flooring
            // is what keeps the 24-hour head start that absorbs any
            // disagreement between this server's clock and the devices' about
            // what timezone a bare `YYYY-MM-DD HH:mm:ss.SSS` denotes. Exporting
            // the activation INSTANT left zero margin — live BioStar held
            // `2026-09-10T16:28:31Z` for 27 people after one run. Both values
            // still derive only from `date_activated`, so an unchanged person
            // still exports identical bytes every run.
            const activationDay = storedStart
              ? dayjs(storedStart).tz('Asia/Manila').startOf('day')
              : null;
            const startDatetime = isDisabled
              ? disabledAnchor
                  .subtract(2, 'day')
                  .format(BIOSTAR_DATETIME_FORMAT)
              : (activationDay
                  ?.subtract(1, 'day')
                  .format(BIOSTAR_DATETIME_FORMAT) ??
                currentDate.subtract(1, 'day').format(BIOSTAR_DATETIME_FORMAT));
            const expiryDatetime = isDisabled
              ? disabledAnchor
                  .subtract(1, 'day')
                  .format(BIOSTAR_DATETIME_FORMAT)
              : (activationDay
                  ?.add(ACTIVATION_VALIDITY_YEARS, 'year')
                  .format(BIOSTAR_DATETIME_FORMAT) ??
                currentDate
                  .add(ACTIVATION_VALIDITY_YEARS, 'year')
                  .format(BIOSTAR_DATETIME_FORMAT));

            return {
              userId,
              rowBase: {
                user_id: userId,
                name: name,
                department: 'DLSU',
                user_title: userTitle,
                user_group: 'All Users',
                remarks: remarks,
                start_datetime: startDatetime,
                expiry_datetime: expiryDatetime,
                original_campus_entry: String(record.Campus_Entry ?? ''),
              },
            };
          });

        const toResolveCsn = validatedRows.filter(
          (row): row is DasmaCsvRowInput => row !== null,
        );

        let csnFilledFromApi = 0;
        /** Cards learned from BioStar this batch, to write back once. */
        const csnToPersist: { userId: string; csn: string }[] = [];
        const resolvedRows = await this.commonService.runWithConcurrency(
          toResolveCsn,
          csnConcurrency,
          async ({
            userId,
            rowBase,
          }): Promise<{
            row: Record<string, string>;
            unresolved: boolean;
          }> => {
            const hadDbCsn = !!this.normalizeUniqueIdValue(
              existingMap.get(userId)?.Unique_ID,
            );
            const { csn, unresolved, fetched } =
              await this.resolveDasmaCsnForCsvRow(
                userId,
                existingMap.get(userId),
                csnToken,
                csnSessionId,
                csnRateLimitTracker,
              );
            if (!hadDbCsn && csn) {
              csnFilledFromApi++;
            }
            if (fetched) {
              csnToPersist.push({ userId, csn });
            }
            return { row: { ...rowBase, csn }, unresolved };
          },
        );

        // Write back every card BioStar just told us about. Without this the
        // same lookup repeats on every run for every card-less student, and a
        // momentary BioStar outage turns their `csn` cell empty — which would
        // both churn the export and put their card at risk.
        if (csnToPersist.length) {
          await this.commonService.executeWithRetry(
            async () => {
              for (const { userId, csn } of csnToPersist) {
                await this.studentRepository.update(
                  { ID_Number: userId },
                  { Unique_ID: csn, updatedAt: new Date() },
                );
                const cached = existingMap.get(userId);
                if (cached) {
                  cached.Unique_ID = csn;
                }
              }
            },
            3,
            `persist CSNs batch ${batchNumber}`,
          );
        }

        const csnUnresolvedIds = resolvedRows
          .filter((r) => r.unresolved)
          .map((r) => r.row.user_id);
        if (csnUnresolvedIds.length) {
          this.logger.warn(
            `[Batch ${batchNumber}] Skipping ${csnUnresolvedIds.length} row(s) whose card BioStar could not confirm; ` +
              `exporting a blank csn under import_option 2 could clear a real card.`,
          );
          csnUnresolvedAll.push(...csnUnresolvedIds);
        }

        const candidateRecords: Record<string, string>[] = resolvedRows
          .filter((r) => !r.unresolved)
          .map((r) => r.row);
        csnPersistedFromBiostar += csnToPersist.length;

        // ------------------------------------------------------------------
        // Send BioStar only what actually changed.
        //
        // `import_option: 2` is per-record Overwrite, so every row in this file
        // marks that user modified in BioStar, and BioStar's Automatic User
        // Synchronization then re-transfers them to every connected device.
        // Exporting the whole roster every run is therefore not merely wasteful
        // — it is what re-enrolled thousands of users on the gates.
        //
        // The comparison is on the rendered row, not on the Postgres columns,
        // because a row can change without any column changing: a card newly
        // resolved from BioStar, or a first activation window. Hashing what we
        // are about to send is the only comparison that cannot miss those.
        // ------------------------------------------------------------------
        // One CSV line per user_id, keeping the LAST occurrence.
        //
        // A duplicated id in the source renders two different lines under the
        // same key, but only one hash can be stored against the one student
        // row — so whichever variant loses that race mismatches on every later
        // run and that person is re-imported, and re-transferred to every
        // device, forever. Keeping the last one matches what the PostgreSQL
        // upsert keeps, so the exported row and the roster row never disagree
        // about which variant is canonical.
        const dedupedByUserId = new Map<string, Record<string, string>>();
        for (const row of candidateRecords)
          dedupedByUserId.set(row.user_id, row);
        const duplicateRowsDropped =
          candidateRecords.length - dedupedByUserId.size;
        if (duplicateRowsDropped > 0) {
          csvDuplicateRowsDropped += duplicateRowsDropped;
          this.logger.warn(
            `[Batch ${batchNumber}] ${duplicateRowsDropped} duplicate source id(s) collapsed to one CSV row each`,
          );
        }
        const uniqueCandidates = [...dedupedByUserId.values()];

        const rowHashes = new Map<string, string>();
        const formattedRecords = uniqueCandidates.filter((row) => {
          const hash = this.hashCsvRow(row, dasmaHeaders);
          rowHashes.set(row.user_id, hash);
          const unchanged =
            existingMap.get(row.user_id)?.biostar_row_hash === hash;
          if (unchanged) csvRowsSuppressed++;
          return !unchanged;
        });
        csvRowsEmitted += formattedRecords.length;

        // Nothing to say. Writing a header-only CSV and importing it is still a
        // full overwrite request, so the upload has to be skipped outright —
        // the file-size check further down cannot catch this, because csv-writer
        // always emits the header line and the file is therefore never empty.
        if (formattedRecords.length === 0) {
          batchesSkippedNoChanges++;
          this.logger.log(
            `[Batch ${batchNumber}] No changed rows (${csvRowsSuppressed} unchanged so far); skipping CSV upload entirely.`,
          );
          continue;
        }

        if (csnFilledFromApi > 0) {
          this.logger.log(
            `[Batch ${batchNumber}] Dasma CSV CSN: filledFromBiostarApi=${csnFilledFromApi}`,
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
            // Suprema documents Response.code for bulk operations as:
            //   "0" = all edits were successful
            //   "1" = partially successful
            //   "8" = all failed (delivered with HTTP 404, so axios rejects
            //         and the catch below retries it — it never lands here)
            // Anything else is undocumented and must not be read as success.
            // Compared via String() because we have never captured a real
            // response from this deployment and our own fixtures disagree on
            // whether the code arrives as a string or a number.
            const responseCode = importResponse.data?.Response?.code;
            const codeText =
              responseCode === undefined || responseCode === null
                ? null
                : String(responseCode);
            const outcome: 'success' | 'partial' | 'failed' =
              codeText === '0'
                ? 'success'
                : codeText === '1'
                  ? 'partial'
                  : 'failed';
            csvImportOutcomes.push({
              batchNumber,
              responseCode: responseCode ?? null,
              outcome,
              partialFailureRows:
                importResponse.data?.CsvRowCollection?.rows?.length ?? 0,
              retriesUsed: 3 - retries,
            });

            if (outcome === 'success') {
              // Only now is it safe to remember what BioStar holds. Recording
              // the hash any earlier would let a rejected batch be treated as
              // delivered and silently skipped on every future run.
              //
              // Deliberately not done for a partial import: the shape of
              // CsvRowCollection has never been observed against a real server,
              // so rather than guess which rows survived, the whole batch is
              // re-sent next run. That costs one extra export and cannot lose a
              // row — the opposite trade would risk dropping one permanently.
              await this.persistRowHashes(formattedRecords, rowHashes);
              this.logger.log(
                `[Batch ${batchNumber}] CSV import successful — all ${formattedRecords.length} changed records processed`,
              );
            } else if (outcome === 'failed') {
              this.logger.error(
                `[Batch ${batchNumber}] CSV import returned an unexpected Response.code=${responseCode ?? '(absent)'} — NOT treating this as success`,
              );
              failedRecordsAll.push({
                batchNumber,
                error: `Unexpected csv_import Response.code: ${responseCode ?? '(absent)'}`,
                importResponse: importResponse.data,
              });
            }

            if (outcome === 'partial') {
              const failedRows =
                importResponse.data?.CsvRowCollection?.rows ?? [];
              if (importResponse.data.CsvRowCollection) {
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
              } else {
                // Partial per Response.code but no row detail. Previously this
                // fell through and was logged as uploaded successfully.
                this.logger.warn(
                  `[Batch ${batchNumber}] Partial CSV import reported (code=1) with no CsvRowCollection — failed rows unknown`,
                );
                failedRecordsAll.push({
                  batchNumber,
                  error:
                    'Partial import reported (code=1) with no CsvRowCollection',
                  importResponse: importResponse.data,
                });
              }
            }
            this.logger.log(
              `[Batch ${batchNumber}] CSV upload finished with outcome=${outcome}`,
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

      // Drain the pre-fix backlog, a bounded slice at a time.
      //
      // The BioStar pull reconciles remarks for free, but only for users it
      // visits — those with a photo or a card, in group 1. Anyone else whose
      // remark was removed before the clearing fix shipped would never be
      // looked at again. This sweep picks up only rows never checked, so it
      // works through that remainder over a handful of runs and then stops on
      // its own: once every row carries a `remarks_checked_at`, it selects
      // nothing. Removals from here on are caught by the normal transition,
      // which no longer needs sweeping.
      const sweptThisRun = await this.sweepUncheckedRemarks(jobName);

      // Everything owed: removed this run, anything a previous run failed to
      // clear, and anything the reconciliation or sweep just flagged. Retrying
      // from persisted state is what keeps PostgreSQL and BioStar from drifting
      // apart permanently (core/safety.md invariant 2).
      const pendingRows = await this.studentRepository.find({
        where: { remarks_clear_pending: true },
        // `Remarks` is selected on purpose — see the re-validation below.
        select: ['ID_Number', 'Remarks'],
      });

      // A pending flag records an intention from an earlier run, not a licence
      // to delete whatever is there now. If the remark has come back — or was
      // never really removed — acting on the flag destroys a live value.
      //
      // That is not hypothetical: on 2026-09-10 one run exported
      // `88888888,…,Sir Boss,…`, imported it successfully, and then cleared
      // that same remark seconds later off a flag left over from a previous
      // run. Because the row hash was stored in the same run, the next sync
      // suppressed the row as unchanged and the loss became permanent.
      const stillEmpty = (r: Student) => !(r.Remarks?.trim() || null);
      const staleFlags = pendingRows
        .filter((r) => !stillEmpty(r))
        .map((r) => r.ID_Number);
      const carriedOver = pendingRows
        .filter(stillEmpty)
        .map((r) => r.ID_Number)
        .filter((id) => !remarksClearedIds.includes(id));

      if (staleFlags.length > 0) {
        this.logger.log(
          `[${jobName}] Dropping ${staleFlags.length} stale remark-clear flag(s) — ` +
            `PostgreSQL holds a remark again for: ${staleFlags.slice(0, 20).join(', ')}`,
        );
      }

      const remarkClearResult = await this.clearRemovedRemarksInBiostar([
        ...remarksClearedIds,
        ...carriedOver,
      ]);

      // Clear the flag for the writes that landed AND for the ones that should
      // never have been queued, so a stale flag cannot come back next run.
      const flagsToClear = [...remarkClearResult.succeeded, ...staleFlags];
      if (flagsToClear.length > 0) {
        await this.studentRepository.update(
          { ID_Number: In(flagsToClear) },
          { remarks_clear_pending: false },
        );
      }

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

      await this.commonService.writeSyncDiagnostics(jobName, {
        direction: 'sql-server-to-postgres-to-biostar',
        schemaEnv: 'dasma',
        seenFromSource: seenIdsFromSource.size,
        activeUploadedToBiostar: totalActiveExported,
        archivedSkippedFromCsv: totalArchivedDisabledExported,
        archivedByReconciliation,
        skippedValidation: totalSkipped,
        // MUST be empty on every run, including the first after deploy.
        // Anything here means the stored expiry window is not persisting.
        expiryFallbackUsed: this.commonService.capIds(expiryFallbackUsed),
        // Also MUST be empty. See the declaration above.
        disabledAnchorFallbackUsed: this.commonService.capIds(
          disabledAnchorFallbackUsed,
        ),

        // How much of this run changed at the database level.
        rowsChanged,
        rowsUnchanged,

        // What actually went to BioStar. On a healthy run after the first,
        // `csvRowsEmitted` should be small and `batchesSkippedNoChanges`
        // should account for most batches — that is the whole point of the
        // change: every emitted row marks a user modified in BioStar and gets
        // them re-transferred to every device.
        csvExport: {
          rowsEmitted: csvRowsEmitted,
          rowsSuppressedUnchanged: csvRowsSuppressed,
          batchesSkippedNoChanges,
          // Rows dropped because BioStar could not confirm their card. Sending
          // a blank csn under import_option 2 could clear a real card, so the
          // row is held back instead. A number that stays high means BioStar
          // lookups are failing, not that people have no cards.
          csnUnresolvedRowsSkipped: this.commonService.capIds(csnUnresolvedAll),
          // Cards learned from BioStar and written back this run. Should fall
          // to ~0 once the roster is populated; if it stays high the write-back
          // is not sticking.
          csnPersistedFromBiostar,
          duplicateRowsDropped: csvDuplicateRowsDropped,
        },

        csvImport: csvImportOutcomes,

        remarks: {
          clearedInPostgres: this.commonService.capIds(remarksClearedIds),
          pendingCarriedOver: this.commonService.capIds(carriedOver),
          // Flags dropped without a PUT because the remark is present again.
          staleFlagsDropped: this.commonService.capIds(staleFlags),
          attempted: remarkClearResult.attempted,
          succeeded: remarkClearResult.succeeded.length,
          failedIds: this.commonService.capIds(remarkClearResult.failed),
          // Backlog drain. Falls to 0 once every row has been checked once —
          // if it stays at the sweep size, the roster is not being worked
          // through and the stamp is not sticking.
          sweptThisRun,
        },
      });

      return {
        success: true,
        message: 'Sync completed successfully',
        recordsProcessed: totalProcessed,
      };
    } catch (error) {
      this.logger.error(`Sync failed for ${jobName}:`, error);
      await this.commonService.writeSyncDiagnostics(jobName, {
        direction: 'sql-server-to-postgres-to-biostar',
        schemaEnv: 'dasma',
        failed: true,
        error: (error as Error)?.message ?? String(error),
      });
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
      // Trimmed on the way in so the stored value matches what the CSV has
      // always exported (`record.Remarks?.trim() || ''`). Without this a remark
      // of only spaces stayed truthy in Postgres, so the removal test never
      // fired: no clear, no pending flag, no log — the stale remark just sat on
      // the gate screen. Trimming also stops re-padding from looking like a
      // change, which used to churn the row and inflate the changed-row count.
      Remarks: record.Remarks?.trim() || null,
      Photo: null,
      Campus_Entry: campusEntry,
      Unique_ID: null,
      isArchived: isArchived,
      Group: record['Group'] ?? record.Group ?? null,
    };
  }

  /**
   * Renders a stored timestamp in the format BioStar's CSV import expects,
   * in Manila time to match the rest of this path. Returns null for a missing
   * or unparseable value so callers can decide on a fallback rather than
   * shipping "Invalid Date" to a gate device.
   */
  /**
   * Is `candidate` a later cursor than `current`?
   *
   * BioStar's `last_modified` is a counter on some deployments and a timestamp
   * on others. A plain string comparison — what this used to do — puts "9"
   * above "10", which can park the saved cursor above records that were never
   * processed, so every later incremental run skips them permanently. Compare
   * numerically when both sides are numbers, lexicographically otherwise.
   */
  /**
   * Clears, in BioStar, the remarks that were emptied in the source view this
   * run. Only those users are touched, so the call count equals the number of
   * remarks actually removed — typically a handful, never the roster.
   *
   * This is the only PUT this codebase makes against BioStar. It is safe to
   * run unconditionally because `clearUserCustomField` echoes back the exact
   * `user_custom_fields` array BioStar returned with one `item` blanked — it
   * never reconstructs the array, so fields it does not target (Lived Name,
   * Gate) are handed back untouched.
   *
   * Returns the IDs that failed, so the caller can leave their pending flag
   * set and retry them on the next run.
   */
  private async clearRemovedRemarksInBiostar(
    userIds: string[],
  ): Promise<{ attempted: number; succeeded: string[]; failed: string[] }> {
    if (userIds.length === 0) {
      return { attempted: 0, succeeded: [], failed: [] };
    }

    const { token, sessionId } = await this.biostarApiService.getApiToken();
    const concurrency = Math.max(
      1,
      parseInt(
        this.configService.get('BIOSTAR_DETAIL_CONCURRENCY') || '8',
        10,
      ) || 8,
    );

    const results = await this.commonService.runWithConcurrency(
      userIds,
      concurrency,
      (userId: string) =>
        this.biostarApiService.clearUserCustomField(
          userId,
          'Remarks',
          token,
          sessionId,
        ),
    );

    const failed = userIds.filter((_, i) => !results[i]);
    const succeeded = userIds.filter((_, i) => !!results[i]);
    this.logger.log(
      `[Dasma] Remark clear: attempted=${userIds.length}, succeeded=${succeeded.length}, failed=${failed.length}` +
        (failed.length ? `, failedIds=${failed.slice(0, 20).join(', ')}` : ''),
    );
    return { attempted: userIds.length, succeeded, failed };
  }

  /** Reports how the cursor was compared, so the log shows which rule applied. */
  private cursorMode(cursor: string): 'numeric' | 'lexicographic' {
    return Number.isFinite(Number(cursor)) ? 'numeric' : 'lexicographic';
  }

  private isLaterCursor(candidate: string, current: string): boolean {
    const a = Number(candidate);
    const b = Number(current);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return a > b;
    }
    return candidate > current;
  }

  /**
   * Makes one free-text value safe for BioStar's CSV importer.
   *
   * Collapses every line break — and the runs of whitespace they leave behind —
   * into single spaces, so a record always occupies exactly one physical line.
   * Commas and quotes are left alone: the writer quotes those correctly and
   * BioStar reads them back correctly. Only newlines are the problem.
   */
  private flattenCsvCell(value: string | null | undefined): string {
    if (value == null) return '';
    return value
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatBiostarDatetime(value: Date | null): string | null {
    if (!value) return null;
    const parsed = dayjs(value).tz('Asia/Manila');
    return parsed.isValid() ? parsed.format(BIOSTAR_DATETIME_FORMAT) : null;
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
    // Photo and Lived_Name are NOT in the Dasma source view — `normalizeRecord`
    // hands them down as null on every row (commit 3f27b9a: "Set Photo,
    // Unique_ID, Lived_Name to null for new schema (not available)"). A null
    // here therefore means "the source has nothing to say", never "delete what
    // is stored". Without these guards every source sync wiped the photo that
    // `syncFromBiostar` had just fetched, so the gate screens fell back to the
    // default avatar. Guarded the same way `Unique_ID` already is below — that
    // asymmetry is exactly why the card survived and the photo did not.
    if (
      incoming.Lived_Name != null &&
      existing.Lived_Name !== incoming.Lived_Name
    ) {
      changedFields.Lived_Name = incoming.Lived_Name;
    }
    if (existing.Remarks !== incoming.Remarks) {
      changedFields.Remarks = incoming.Remarks;
    }
    if (incoming.Photo != null && existing.Photo !== incoming.Photo) {
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
