import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';
import * as fs from 'fs';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';

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

  normalizeGroupValue(val: any): string | null {
    if (val == null || val === '') return null;
    const trimmed = String(val).trim();
    if (!trimmed) return null;
    const upper = trimmed.toUpperCase();
    if (['EMPLOYEE', 'STUDENT', 'AGENCY'].includes(upper)) return upper;
    return null;
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
}
