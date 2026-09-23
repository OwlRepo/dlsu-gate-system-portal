import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';
import * as fs from 'fs';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import * as dayjs from 'dayjs';

import { Student } from '../../../students/entities/student.entity';

/**
 * How long a credential stays valid from its activation date. The tracker's
 * worked example: activated 2026-08-26 -> expires 2036-08-26.
 */
const ACTIVATION_VALIDITY_YEARS = 10;

/** Same column set as bulk upload CSV in `database-sync-dasma-path.service.ts`. */
const DASMA_BULK_CSV_HEADERS = [
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

/**
 * Legacy audit CSV/JSON shape for non-Dasma sync (main path). Kept for backward compatibility.
 */
const LEGACY_SYNC_AUDIT_CSV_HEADERS = [
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

@Injectable()
export class DatabaseSyncCommonService {
  private readonly logger = new Logger(DatabaseSyncCommonService.name);
  private readonly logDir = path.join(process.cwd(), 'logs', 'skipped-records');
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
  /** Per-run machine-readable diagnostics, for handing back after a staging run. */
  private readonly diagnosticsDir = path.join(
    process.cwd(),
    'logs',
    'diagnostics',
  );
  private readonly photoConversionLogDir = path.join(
    process.cwd(),
    'logs',
    'photo-conversion',
  );

  constructor(private configService: ConfigService) {}

  removeSpecialChars(str: string): string {
    return str.replace(/[^a-zA-Z0-9\s]/g, '');
  }

  /**
   * The longest name BioStar accepts — measured, not assumed. A live import on
   * 2026-09-23 rejected a 101-character name with: "User Name can contain only
   * letters numbers spaces and underscores up to 48 characters."
   */
  static readonly BIOSTAR_NAME_MAX_LENGTH = 48;

  /**
   * The exact name cell sent to BioStar.
   *
   * BioStar rejects the whole ROW for an over-long name, and a rejected row
   * used to hold its entire batch back from being recorded as delivered — so
   * one long name re-sent up to 800 people on every run. Cutting it here keeps
   * the person enrolled; `truncated` lets the caller report it so the source
   * record can be fixed. PostgreSQL keeps the full name: this is only the
   * BioStar cell.
   */
  renderBiostarName(name: string | null | undefined): {
    value: string;
    truncated: boolean;
  } {
    const cleaned = this.removeSpecialChars((name ?? '').trim());
    const max = DatabaseSyncCommonService.BIOSTAR_NAME_MAX_LENGTH;
    if (cleaned.length <= max) return { value: cleaned, truncated: false };
    return { value: cleaned.slice(0, max).trimEnd(), truncated: true };
  }

  /**
   * Reads BioStar's csv_import error file and returns the user_ids it rejected,
   * or null when the file cannot be trusted to say so.
   *
   * Shape measured live on 2026-09-23 (batch manual-21): UTF-8 with a BOM, CRLF
   * line endings, the header we sent plus a trailing `Error_Description`
   * column, then one line echoing each rejected row verbatim, `user_id` first.
   * `CsvRowCollection.rows` carries only file line numbers, so this file is the
   * one place that names who failed.
   *
   * Every check that can fail returns null rather than guessing, because the
   * caller reads null as "re-send the whole batch" — the safe direction.
   * Wrongly calling a row rejected costs one retry; wrongly calling it
   * delivered would stop it ever being sent again.
   */
  parseBiostarImportErrorIds(
    csvText: string | null | undefined,
    expectedCount: number,
    emittedIds: Set<string>,
  ): string[] | null {
    if (typeof csvText !== 'string') return null;
    const lines = csvText
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '');
    if (lines.length < 2) return null;

    const firstCell = (line: string) =>
      line.split(',')[0].trim().replace(/^"|"$/g, '');
    if (firstCell(lines[0]) !== 'user_id') return null;

    const ids = lines.slice(1).map(firstCell);
    if (!Number.isInteger(expectedCount) || ids.length !== expectedCount) {
      return null;
    }
    if (ids.some((id) => id === '' || !emittedIds.has(id))) return null;
    return ids;
  }

  /**
   * Normalizes userId for CSN/card-like values (hex-to-decimal, truncation).
   * WARNING: Do NOT use for identity keys (ID_Number). This performs lossy
   * transformations that can mutate or collapse distinct IDs. For identity
   * preservation use trim-only normalization.
   */
  sanitizeUserId(userId: string): string {
    const cleanUserId = userId.replace(/\s/g, '');
    if (/^[0-9A-Fa-f]+$/.test(cleanUserId)) {
      const decimal = parseInt(cleanUserId, 16);
      if (!isNaN(decimal)) {
        userId = decimal.toString();
      }
    }
    if (userId.length > 10) {
      userId = userId.substring(0, 10);
    }
    return userId;
  }

  /**
   * Words the DLSU source view sends to mean "there is nothing here".
   *
   * The view does not send SQL NULL for an absent middle name or suffix — it
   * sends the four-character TEXT "NULL". Everything downstream gated on
   * truthiness, and a non-empty string is truthy, so the word travelled all the
   * way to the gate: a live export on 2026-09-21 carried
   * "DELA CRUZ MARIA RACHEL NULL NULL" as a student's name, and BioStar showed
   * it to a guard.
   *
   * Bare "NA" and "UNKNOWN" are deliberately NOT here. "NA" is plausible as
   * real initials or a real suffix, and discarding part of somebody's actual
   * name is worse than carrying a stray placeholder.
   */
  private static readonly NAME_PLACEHOLDERS = new Set([
    'NULL',
    'N/A',
    'NONE',
    '-',
    '.',
  ]);

  /**
   * Is this name part a placeholder rather than part of somebody's name?
   *
   * Matches a WHOLE part only, never a substring, so the surname "Nullova" and
   * the middle name "Nonesuch" are left alone.
   */
  isPlaceholderNamePart(value: unknown): boolean {
    if (value == null) return true;
    const trimmed = String(value).trim();
    if (trimmed === '') return true;
    return DatabaseSyncCommonService.NAME_PLACEHOLDERS.has(
      trimmed.toUpperCase(),
    );
  }

  /**
   * Removes placeholder words from a name that has already been assembled.
   *
   * Needed for the inbound direction: BioStar hands back one finished string,
   * not the four source columns. Since we exported the dirty names in the first
   * place, BioStar is still holding them, and the pull writes whatever it reads
   * straight back into PostgreSQL — so without this a cleaned row is re-dirtied
   * on the next pull.
   *
   * Returns null when nothing survives, which callers read as "no usable name".
   */
  scrubNameTokens(name: string | null | undefined): string | null {
    if (name == null) return null;
    const kept = String(name)
      .split(/\s+/)
      .filter((token) => !this.isPlaceholderNamePart(token.replace(/,+$/, '')));
    const cleaned = kept.join(' ').trim();
    return cleaned === '' ? null : cleaned;
  }

  normalizeGroupValue(val: any): string | null {
    if (val == null || val === '') return null;
    const trimmed = String(val).trim();
    if (!trimmed) return null;
    const upper = trimmed.toUpperCase();
    if (['EMPLOYEE', 'STUDENT', 'AGENCY'].includes(upper)) return upper;
    return null;
  }

  /**
   * Is this person admitted to campus right now?
   *
   * Mirrors the `isDisabled` test in `database-sync-dasma-path.service.ts`
   * exactly — `Campus_Entry === 'N'` or archived means disabled — so the stored
   * activation window and the exported CSV can never disagree about who counts
   * as active.
   */
  isRecordActive(campusEntry: unknown, isArchived: boolean): boolean {
    const deniedEntry = campusEntry?.toString().toUpperCase() === 'N';
    return !deniedEntry && isArchived !== true;
  }

  /**
   * Decides what activation/expiry fields to persist for one record, or null
   * when nothing should change.
   *
   * This is the fix for "the expiry date is updated every day": when someone
   * was already active and is still active, this returns null, so the stored
   * window — and therefore the window exported to BioStar — stays exactly where
   * it was. Re-activating a deactivated person restarts the 10 years from the
   * new activation date.
   *
   * Pure: `now` is injected and never read from the clock inside.
   */
  resolveActivationWindow(
    existing: Student | undefined,
    incomingActive: boolean,
    now: Date,
  ): Partial<Student> | null {
    const wasActive = existing
      ? this.isRecordActive(existing.Campus_Entry, existing.isArchived)
      : false;

    if (!incomingActive) {
      // Only the active -> inactive transition is worth recording. Someone who
      // was already inactive and stays inactive must not have their
      // deactivation date rewritten on every run — that would be the same
      // drifting-date bug in a different column.
      if (wasActive) {
        return { date_deactivated: now };
      }
      // Inactive and never stamped: the row is brand new and arrived inactive,
      // it predates these columns, or it was created before this backfill
      // existed. Either way there was no active->inactive moment to record, and
      // the exported expiry window is derived from this stamp — so without it
      // the window falls back to "today" and the row looks different to BioStar
      // every single day. Stamp once, then leave it alone: the same write-once
      // rule the active window follows.
      if (!existing || !existing.date_deactivated) {
        return { date_deactivated: now };
      }
      return null;
    }

    if (!wasActive) {
      return this.startActivationWindow(now);
    }

    // Already active and still active. Normally nothing changes — but a row
    // that predates these columns has no window yet, so backfill it once,
    // preserving a known activation date if one is already present.
    if (!existing.date_activated || !existing.expiry_datetime) {
      return this.startActivationWindow(existing.date_activated ?? now);
    }

    return null;
  }

  /**
   * Builds the fields for a fresh window. Expiry uses dayjs so that a 29
   * February activation clamps to 28 February rather than rolling into March.
   */
  private startActivationWindow(activatedAt: Date): Partial<Student> {
    return {
      date_activated: activatedAt,
      expiry_datetime: dayjs(activatedAt)
        .add(ACTIVATION_VALIDITY_YEARS, 'year')
        .toDate(),
      date_deactivated: null,
    };
  }

  convertMilitaryTimeToCron(time: string): string {
    const [hours, minutes] = time.split(':');
    return `${minutes} ${hours} * * *`;
  }

  logMemoryUsage(batchNumber: number): void {
    const used = process.memoryUsage();
    this.logger.log(
      `[Batch ${batchNumber}] Memory usage: RSS ${(used.rss / 1024 / 1024).toFixed(2)} MB, Heap ${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    );
  }

  async cleanupTempFiles(tempDir: string): Promise<void> {
    try {
      if (fs.existsSync(tempDir)) {
        fs.readdirSync(tempDir).forEach((file) => {
          const filePath = path.join(tempDir, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            fs.unlinkSync(filePath);
          }
        });
      }
    } catch (e) {
      this.logger.warn('Failed to cleanup temp files:', e);
    }
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    operationName: string,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        const isTimeout =
          error.message?.includes('timeout') ||
          error.message?.includes('Query read timeout') ||
          error.code === 'ECONNRESET';

        if (isTimeout) {
          this.logger.warn(
            `Timeout in ${operationName} (attempt ${attempt}/${maxRetries})`,
          );
        } else {
          this.logger.error(
            `Error in ${operationName} (attempt ${attempt}/${maxRetries}): ${error.message}`,
          );
        }

        if (attempt < maxRetries) {
          const backoffTime = isTimeout
            ? Math.pow(2, attempt) * 5000
            : Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
        }
      }
    }

    throw lastError;
  }

  async runWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;

    async function worker(): Promise<void> {
      while (index < items.length) {
        const i = index++;
        results[i] = await fn(items[i]);
      }
    }

    const workerCount =
      items.length === 0 ? 0 : Math.min(concurrency, items.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);
    return results;
  }

  async checkColumnExists(
    pool: sql.ConnectionPool,
    columnName: string,
  ): Promise<boolean> {
    try {
      const result = await pool.request().query(`
        SELECT COUNT(*) as count
        FROM sys.columns 
        WHERE object_id = OBJECT_ID('${this.configService.get('SOURCE_DB_TABLE')}')
        AND name = '${columnName}'
      `);
      return result.recordset[0].count > 0;
    } catch (error) {
      this.logger.error(
        `Error checking column existence for ${columnName}:`,
        error,
      );
      return false;
    }
  }

  logPhotoConversionFailure(
    photoData: any,
    reason: string,
    studentId?: string,
  ): void {
    try {
      const dateString = new Date().toISOString().split('T')[0];
      const logFile = path.join(
        this.photoConversionLogDir,
        `photo_conversion_failures_${dateString}.json`,
      );

      let existingLogs = [];
      if (fs.existsSync(logFile)) {
        existingLogs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      }

      const logEntry = {
        timestamp: new Date().toISOString(),
        studentId: studentId || 'unknown',
        reason,
        photoDataType: typeof photoData,
        photoDataSample:
          typeof photoData === 'string'
            ? photoData.slice(0, 100) + '...'
            : null,
        isBuffer: Buffer.isBuffer(photoData),
        isBlob: photoData instanceof Blob,
        hasData: photoData && 'data' in photoData,
      };

      existingLogs.push(logEntry);
      fs.writeFileSync(logFile, JSON.stringify(existingLogs, null, 2));
    } catch {
      this.logger.error('Failed to log photo conversion failure');
    }
  }

  async useDefaultImage(reason: string): Promise<string> {
    const defaultImagePath = path.join(process.cwd(), 'dlsu.png');

    this.logger.debug('Attempting to use default image', {
      reason,
      defaultImagePath,
      exists: fs.existsSync(defaultImagePath),
    });

    try {
      const defaultImageBuffer = fs.readFileSync(defaultImagePath);
      const base64Image = defaultImageBuffer.toString('base64');
      return `data:image/png;base64,${base64Image}`;
    } catch (error) {
      this.logger.error('Failed to read default image', {
        error: error.message,
        path: defaultImagePath,
      });
      throw new Error('Failed to read default image');
    }
  }

  async convertPhotoToBase64(
    photoData: any,
    studentId: string,
  ): Promise<string> {
    try {
      let imageBuffer: Buffer;

      if (typeof photoData === 'string') {
        if (photoData.match(/^[a-zA-Z]:\\|^\\\\/)) {
          try {
            if (fs.existsSync(photoData)) {
              imageBuffer = fs.readFileSync(photoData);
              this.logger.debug('Successfully read image from file path', {
                studentId,
                path: photoData,
              });
            } else {
              this.logger.warn('File path exists but file not found', {
                studentId,
                path: photoData,
              });
              return this.useDefaultImage('File not found');
            }
          } catch (error) {
            this.logger.error('Failed to read file from path', {
              studentId,
              path: photoData,
              error: error.message,
            });
            return this.useDefaultImage('Failed to read file');
          }
        } else if (photoData.startsWith('0x')) {
          try {
            const hexData = photoData.slice(2);
            if (!/^[0-9A-Fa-f]+$/.test(hexData)) {
              throw new Error('Invalid hex string format');
            }
            imageBuffer = Buffer.from(hexData, 'hex');

            if (
              imageBuffer.length >= 14 &&
              imageBuffer.slice(0, 2).toString() === 'BM'
            ) {
              const originalSize = imageBuffer.readUInt32BE(2);
              if (originalSize > imageBuffer.length) {
                const size =
                  ((originalSize & 0xff) << 24) |
                  ((originalSize & 0xff00) << 8) |
                  ((originalSize & 0xff0000) >> 8) |
                  ((originalSize & 0xff000000) >> 24);

                this.logger.debug(
                  'Photo conversion debug - attempting byte order correction',
                  {
                    studentId,
                    originalSize,
                    correctedSize: size,
                    bufferLength: imageBuffer.length,
                  },
                );

                if (size <= imageBuffer.length) {
                  const newBuffer = Buffer.alloc(imageBuffer.length);
                  imageBuffer.copy(newBuffer);
                  newBuffer.writeUInt32LE(size, 2);
                  imageBuffer = newBuffer;
                }
              }
            }
          } catch (error) {
            this.logger.error('Failed to convert hex string to buffer', {
              studentId,
              error: error.message,
            });
            return this.useDefaultImage(
              'Failed to convert hex string to buffer',
            );
          }
        } else {
          imageBuffer = Buffer.from(photoData, 'base64');
        }
      } else if (Buffer.isBuffer(photoData)) {
        imageBuffer = photoData;
      } else {
        return this.useDefaultImage('Invalid photo data type');
      }

      const signature = imageBuffer.slice(0, 4).toString('hex');

      if (!imageBuffer || imageBuffer.length === 0) {
        this.logger.warn('Empty image buffer detected, using default image');
        this.logPhotoConversionFailure(
          photoData,
          'Empty image buffer detected',
          studentId,
        );
        imageBuffer = fs.readFileSync(path.join(process.cwd(), 'dlsu.png'));
      }

      if (imageBuffer.length < 100) {
        this.logger.warn(
          'Suspiciously small image detected, using default image',
          {
            bufferLength: imageBuffer.length,
            originalDataType: typeof photoData,
          },
        );
        this.logPhotoConversionFailure(
          photoData,
          'Suspiciously small image detected',
          studentId,
        );
        imageBuffer = fs.readFileSync(path.join(process.cwd(), 'dlsu.png'));
      }

      try {
        if (signature.startsWith('424d')) {
          const fileSize = imageBuffer.readUInt32LE(2);
          const pixelOffset = imageBuffer.readUInt32LE(10);
          const headerSize = imageBuffer.readUInt32LE(14);

          this.logger.debug('BMP Header Analysis:', {
            signature,
            fileSize,
            actualFileSize: imageBuffer.length,
            pixelOffset,
            headerSize,
            studentId,
            isValidSize: fileSize === imageBuffer.length,
            isValidPixelOffset: pixelOffset > 0 && pixelOffset < fileSize,
            isValidHeaderSize: [12, 40, 52, 56, 108, 124].includes(headerSize),
          });

          if (!this.isValidBmpStructure(imageBuffer)) {
            this.logger.warn('Invalid BMP structure detected', {
              reason: 'File structure does not match BMP format',
              signature,
              fileSize,
              actualFileSize: imageBuffer.length,
              pixelOffset,
              headerSize,
            });
            this.logPhotoConversionFailure(
              photoData,
              'Invalid BMP structure: Incorrect header values',
              studentId,
            );
            imageBuffer = fs.readFileSync(path.join(process.cwd(), 'dlsu.png'));
            return imageBuffer.toString('base64');
          }
        }
      } catch (signatureError) {
        this.logger.error('Error checking image signature:', {
          error: signatureError.message,
          bufferLength: imageBuffer?.length,
        });
        this.logPhotoConversionFailure(
          photoData,
          'Error checking image signature',
          studentId,
        );
        imageBuffer = fs.readFileSync(path.join(process.cwd(), 'dlsu.png'));
      }

      const base64String = imageBuffer.toString('base64');
      return base64String;
    } catch (error) {
      this.logger.error('Critical error in convertPhotoToBase64:', {
        error: error.message,
        stack: error.stack,
        photoDataType: typeof photoData,
        photoDataSample:
          typeof photoData === 'string'
            ? photoData.slice(0, 100) + '...'
            : null,
      });
      this.logPhotoConversionFailure(
        photoData,
        'Critical error in convertPhotoToBase64',
        studentId,
      );
      return null;
    }
  }

  isValidBmpStructure(buffer: Buffer): boolean {
    try {
      if (buffer.length < 54) return false;

      const signature = buffer.slice(0, 2).toString('ascii');
      if (signature !== 'BM') return false;

      const fileSize = buffer.readUInt32LE(2);
      const pixelOffset = buffer.readUInt32LE(10);
      const headerSize = buffer.readUInt32LE(14);

      return (
        fileSize === buffer.length &&
        pixelOffset >= 54 &&
        pixelOffset < fileSize &&
        [12, 40, 52, 56, 108, 124].includes(headerSize) &&
        pixelOffset <= buffer.length
      );
    } catch (e) {
      this.logger.error('Error validating BMP structure:', {
        error: e.message,
      });
      return false;
    }
  }

  /**
   * Writes synced-records JSON/CSV audit logs.
   * @param auditAsDasmaBulkUpload When true (Dasma path only), columns match the Dasma Biostar bulk upload CSV.
   *   Main path omits this flag and keeps the legacy summary format.
   */
  async logSyncedRecords(
    formattedRecords: any[],
    jobName: string,
    auditAsDasmaBulkUpload = false,
  ): Promise<void> {
    const dateString = new Date()
      .toISOString()
      .split('T')[0]
      .replace(/-/g, '_');

    const syncType = jobName.startsWith('manual-')
      ? 'manual'
      : jobName.replace('-', '');

    let rowsForLog: Record<string, unknown>[];
    let csvHeaders: { id: string; title: string }[];

    if (auditAsDasmaBulkUpload) {
      csvHeaders = [...DASMA_BULK_CSV_HEADERS];
      rowsForLog = formattedRecords.map((record) => ({
        user_id: record.user_id ?? '',
        name: record.name ?? '',
        department: record.department ?? '',
        user_title: record.user_title ?? '',
        user_group: record.user_group ?? '',
        remarks: record.remarks ?? '',
        csn: record.csn ?? '',
        start_datetime: record.start_datetime ?? '',
        expiry_datetime: record.expiry_datetime ?? '',
        original_campus_entry: record.original_campus_entry ?? '',
      }));
    } else {
      csvHeaders = [...LEGACY_SYNC_AUDIT_CSV_HEADERS];
      rowsForLog = formattedRecords.map((record) => ({
        user_id: record.user_id,
        name: record.name,
        lived_name: record.lived_name ?? '',
        remarks: record.remarks ?? record.Remarks ?? '',
        campus_entry: record.original_campus_entry ?? '',
        expiry_datetime: record.expiry_datetime ?? '',
        sync_timestamp: new Date().toISOString(),
      }));
    }

    const jsonFilePath = path.join(
      this.syncedJsonDir,
      `synced_${syncType}_${dateString}.json`,
    );
    fs.writeFileSync(jsonFilePath, JSON.stringify(rowsForLog, null, 2));

    const csvFilePath = path.join(
      this.syncedCsvDir,
      `synced_${syncType}_${dateString}.csv`,
    );
    const csvWriter = createObjectCsvWriter({
      path: csvFilePath,
      header: csvHeaders,
    });

    await csvWriter.writeRecords(rowsForLog);

    this.logger.log(`Saved ${rowsForLog.length} synced records to:`);
    this.logger.log(`- JSON: ${jsonFilePath}`);
    this.logger.log(`- CSV: ${csvFilePath}`);
  }

  getLogDir(): string {
    return this.logDir;
  }

  /**
   * Writes one machine-readable diagnostics file per sync run.
   *
   * This exists so a staging run answers the open questions on its own — which
   * users BioStar reported that PostgreSQL does not hold, which detail fetches
   * failed, whether the stored expiry window is actually persisting — instead
   * of someone reproducing each one by hand.
   *
   * Identifiers only. No names, no photo bytes, no remark text: the existing
   * audit logs under logs/synced-records already carry plaintext PII and this
   * must not widen that surface. Long id lists are capped so a bad run cannot
   * produce a gigabyte of JSON.
   */
  async writeSyncDiagnostics(
    jobName: string,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    try {
      if (!fs.existsSync(this.diagnosticsDir)) {
        fs.mkdirSync(this.diagnosticsDir, { recursive: true });
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(
        this.diagnosticsDir,
        `diag_${jobName}_${stamp}.json`,
      );
      fs.writeFileSync(
        filePath,
        JSON.stringify(
          { jobName, writtenAt: new Date().toISOString(), ...payload },
          null,
          2,
        ),
      );
      this.logger.log(`Diagnostics written to ${filePath}`);
      return filePath;
    } catch (error) {
      // Diagnostics are an aid, never a reason to fail a sync.
      this.logger.warn(
        `Failed to write diagnostics for ${jobName}: ${(error as Error)?.message}`,
      );
      return null;
    }
  }

  /** Caps an id list so one bad run cannot write a gigabyte of JSON. */
  /**
   * Adds the milliseconds since `startMs` to `timings[phase]`.
   *
   * Summed, not overwritten: most phases run once per batch, and the number
   * worth reading off a diagnostics file is the run's total per phase.
   */
  addElapsed(
    timings: Record<string, number>,
    phase: string,
    startMs: number,
  ): void {
    timings[phase] = (timings[phase] ?? 0) + (Date.now() - startMs);
  }

  capIds(ids: string[], limit = 500): { ids: string[]; truncated: number } {
    return {
      ids: ids.slice(0, limit),
      truncated: Math.max(0, ids.length - limit),
    };
  }
}
