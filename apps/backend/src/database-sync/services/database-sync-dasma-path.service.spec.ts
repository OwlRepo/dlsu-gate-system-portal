import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fsMock from 'fs';
import * as sql from 'mssql';
import axios from 'axios';
import { createObjectCsvWriter } from 'csv-writer';

import { DatabaseSyncDasmaPathService } from './database-sync-dasma-path.service';
import { DatabaseSyncCommonService } from './shared/database-sync-common.service';
import { BiostarApiService } from './shared/biostar-api.service';
import { Student } from '../../students/entities/student.entity';
import { SyncSchedule } from '../entities/sync-schedule.entity';
import { BiostarSyncState } from '../entities/biostar-sync-state.entity';

jest.mock('mssql');
jest.mock('axios');
jest.mock('csv-writer');
// An explicit factory, not an automock: the service does `new FormData()` and
// spreads `getHeaders()` into the request config. An automock leaves those
// returning undefined, the upload throws before axios is ever called, and the
// service sleeps 5s between retries — 10s of silent nothing per test.
jest.mock('form-data', () =>
  jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    getHeaders: jest.fn(() => ({
      'content-type': 'multipart/form-data; boundary=fake',
    })),
  })),
);

// csv-writer is mocked, so no CSV file ever lands on disk. The service polls
// for the file before uploading and skips the upload if it never appears, so
// the whole BioStar leg would go untested. Fake the filesystem so the file
// reads as present and non-empty. jest.spyOn(fs.promises, ...) does NOT work
// here — the service resolves fs.promises before the spy is installed.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    // Not enumerable on the real module, so the spread above drops it. The
    // service reads fs.constants.F_OK inside a silent catch, so losing it
    // makes the CSV-readiness poll fail invisibly and skip the upload.
    constants: actual.constants,
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn(
      () =>
        'user_id,name,department,user_title,user_group,Remarks,csn,start_datetime,expiry_datetime,original_campus_entry\n',
    ),
    createReadStream: jest.fn(() => ({ pipe: jest.fn() })),
    promises: {
      ...actual.promises,
      access: jest.fn(async () => undefined),
      stat: jest.fn(async () => ({ size: 1024 })),
    },
  };
});

/**
 * End-to-end coverage of the Dasma sync path against faked externals: a fake
 * SQL Server, a fake BioStar HTTP API, an in-memory `students` table and a
 * captured CSV writer. Nothing here touches a network, a database or a disk,
 * so the scenarios that would otherwise need a manual staging run — a record
 * synced two days running, a deactivation, a re-activation, a removed remark —
 * are all exercised here instead.
 */
describe('DatabaseSyncDasmaPathService', () => {
  /** One row as the DLSU source view returns it. */
  interface SourceRow {
    ID: string;
    LastName: string;
    FirstName: string;
    MiddleName: string | null;
    Suffix: string | null;
    Group: string | null;
    Status: boolean;
    Remarks: string | null;
    IsArchived: boolean;
  }

  const sourceRow = (over: Partial<SourceRow> = {}): SourceRow => ({
    ID: '12100001',
    LastName: 'Dela Cruz',
    FirstName: 'Juan',
    MiddleName: null,
    Suffix: null,
    Group: 'STUDENT',
    Status: true, // Status truthy -> Campus_Entry 'Y'
    Remarks: null,
    IsArchived: false,
    ...over,
  });

  // ---------------------------------------------------------------------
  // Fake `students` table
  // ---------------------------------------------------------------------
  /** Pulls the array back out of a TypeORM In(...) operator. */
  const unwrapIn = (operand: unknown): string[] => {
    if (operand && typeof operand === 'object' && '_value' in operand) {
      return (operand as { _value: string[] })._value;
    }
    return [operand as string];
  };

  class FakeStudentRepository {
    rows: Student[] = [];

    private matches(where: Record<string, unknown>, row: Student): boolean {
      return Object.entries(where).every(([key, operand]) => {
        const actual = (row as unknown as Record<string, unknown>)[key];
        if (operand && typeof operand === 'object' && '_value' in operand) {
          return unwrapIn(operand).includes(actual as string);
        }
        return actual === operand;
      });
    }

    create(data: Partial<Student>): Student {
      return { ...data } as Student;
    }

    async find(options: { where?: Record<string, unknown> } = {}) {
      if (!options.where) return [...this.rows];
      return this.rows.filter((r) => this.matches(options.where, r));
    }

    async findOne(options: { where: Record<string, unknown> }) {
      return this.rows.find((r) => this.matches(options.where, r)) ?? null;
    }

    async insert(rows: Partial<Student>[]) {
      rows.forEach((r) => this.rows.push({ ...r } as Student));
      return { identifiers: [] };
    }

    async save(row: Partial<Student>) {
      this.rows.push({ ...row } as Student);
      return row;
    }

    async update(where: Record<string, unknown>, patch: Partial<Student>) {
      let affected = 0;
      this.rows = this.rows.map((r) => {
        if (!this.matches(where, r)) return r;
        affected++;
        return { ...r, ...patch };
      });
      return { affected };
    }

    byId(id: string): Student | undefined {
      return this.rows.find((r) => r.ID_Number === id);
    }
  }

  // ---------------------------------------------------------------------
  // Harness state
  // ---------------------------------------------------------------------
  let service: DatabaseSyncDasmaPathService;
  let studentRepo: FakeStudentRepository;
  let commonService: DatabaseSyncCommonService;
  let biostarApi: jest.Mocked<BiostarApiService>;
  /** Every CSV row handed to csv-writer, newest run last. */
  let writtenCsvRows: Record<string, string>[][];
  /** The header definition csv-writer was configured with, per run. */
  let csvHeaders: { id: string; title: string }[][];
  let sourceRows: SourceRow[];
  /** The single biostar_sync_state row, mutated in place by the service. */
  let biostarState: BiostarSyncState;
  /** Pages the fake BioStar /api/users list endpoint will serve. */
  let biostarPages: { total: number; rows: Record<string, unknown>[] }[];
  /** user_id -> detail payload for the fake /api/users/:id endpoint. */
  let biostarDetails: Record<string, Record<string, unknown> | null>;

  /** Rebuilt per test so one test's override cannot leak into the next. */
  let CONFIG: Record<string, string>;
  const baseConfig = (): Record<string, string> => ({
    SOURCE_DB_USERNAME: 'fake',
    SOURCE_DB_PASSWORD: 'fake',
    SOURCE_DB_NAME: 'fake',
    SOURCE_DB_HOST: 'localhost',
    SOURCE_DB_PORT: '1433',
    SOURCE_DB_TABLE: 'dbo.FakeRoster',
    // Off by default so the CSN path does not fan out to BioStar per row.
    DASMA_CSV_FETCH_CARD_FROM_BIOSTAR: 'false',
    BIOSTAR_DETAIL_CONCURRENCY: '4',
  });

  /** The rows of the most recent CSV written. */
  const latestCsv = () => writtenCsvRows[writtenCsvRows.length - 1] ?? [];
  const csvRowFor = (userId: string, run = writtenCsvRows.length - 1) =>
    writtenCsvRows[run]?.find((r) => r.user_id === userId);

  const setClock = (iso: string) => {
    jest.setSystemTime(new Date(iso));
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Fake ONLY Date. Everything else must stay real — faking queueMicrotask
    // or nextTick stalls promise scheduling and every test in this file hangs
    // until the 5s timeout.
    jest.useFakeTimers({
      doNotFake: [
        'cancelAnimationFrame',
        'cancelIdleCallback',
        'clearImmediate',
        'clearInterval',
        'clearTimeout',
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'requestIdleCallback',
        'setImmediate',
        'setInterval',
        'setTimeout',
      ],
    });

    CONFIG = baseConfig();
    writtenCsvRows = [];
    csvHeaders = [];
    sourceRows = [sourceRow()];
    biostarState = {
      schemaKey: 'dasma',
      lastModifiedCursor: null,
      lastProcessedOffset: null,
      lastProcessedUserId: null,
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
    } as BiostarSyncState;
    biostarPages = [{ total: 0, rows: [] }];
    biostarDetails = {};
    studentRepo = new FakeStudentRepository();

    // --- fake SQL Server -------------------------------------------------
    const fakePool = {
      request: () => ({
        query: jest.fn(async (text: string) => {
          if (text.includes('sys.columns')) {
            // checkColumnExists('IsArchived') -> yes
            return { recordset: [{ count: 1 }] };
          }
          // fetchBatches pages with OFFSET n ROWS; serve everything on page 1.
          const offsetMatch = text.match(/OFFSET (\d+) ROWS/);
          const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
          // Fresh copies every query, exactly as a real driver returns. The
          // service truncates the recordset it is handed (`batchRecords.length
          // = 0`) to release memory, so returning the same array twice would
          // leave the second sync in a test seeing an empty roster.
          return {
            recordset:
              offset === 0 ? sourceRows.map((row) => ({ ...row })) : [],
          };
        }),
      }),
      close: jest.fn(async () => undefined),
    };
    (sql.connect as jest.Mock).mockResolvedValue(fakePool);

    // --- fake BioStar HTTP ----------------------------------------------
    (axios.post as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/api/attachments')) {
        return { data: { filename: 'fake-upload.csv' } };
      }
      if (url.includes('/api/users/csv_import')) {
        return { data: { Response: { code: '0' } } };
      }
      return { data: {} };
    });
    // Fake BioStar /api/users list. Serves one page per `offset` step of 500,
    // mirroring the real paging contract (UserCollection.total + rows).
    (axios.get as jest.Mock).mockImplementation(
      async (url: string, cfg?: { params?: Record<string, number> }) => {
        if (url.endsWith('/api/users')) {
          const pageIndex = Math.floor((cfg?.params?.offset ?? 0) / 500);
          const page = biostarPages[pageIndex] ?? { total: 0, rows: [] };
          return {
            data: {
              UserCollection: {
                total: String(page.total),
                rows: page.rows.map((r) => ({ ...r })),
              },
            },
          };
        }
        return { data: {} };
      },
    );
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn(() => false);

    // --- capture CSV output ----------------------------------------------
    (createObjectCsvWriter as jest.Mock).mockImplementation(
      (opts: { header: { id: string; title: string }[] }) => {
        csvHeaders.push(opts.header);
        return {
          writeRecords: jest.fn(async (records: Record<string, string>[]) => {
            writtenCsvRows.push(records.map((r) => ({ ...r })));
          }),
        };
      },
    );

    // The filesystem is faked at module level (see jest.mock('fs') above).

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseSyncDasmaPathService,
        DatabaseSyncCommonService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => CONFIG[key]) },
        },
        { provide: getRepositoryToken(Student), useValue: studentRepo },
        {
          provide: getRepositoryToken(SyncSchedule),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(BiostarSyncState),
          useValue: {
            // The service mutates the row it is handed and saves it back, so
            // returning one stable object makes the cursor observable.
            findOne: jest.fn(async () => biostarState),
            create: jest.fn((d: Partial<BiostarSyncState>) =>
              Object.assign(biostarState, d),
            ),
            save: jest.fn(async (d: BiostarSyncState) => d),
          },
        },
        {
          provide: BiostarApiService,
          useValue: {
            getApiToken: jest
              .fn()
              .mockResolvedValue({ token: 't0ken', sessionId: 's3ss10n' }),
            getApiBaseUrl: jest.fn().mockReturnValue('https://biostar.fake'),
            fetchBiostarUserDetailWithRetry: jest.fn(
              async (userId: string) => biostarDetails[userId] ?? null,
            ),
            clearUserCustomField: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get(DatabaseSyncDasmaPathService);
    commonService = module.get(DatabaseSyncCommonService);
    biostarApi = module.get(BiostarApiService);

    // Audit-log writers touch real directories; silence them.
    jest.spyOn(commonService, 'logSyncedRecords').mockResolvedValue(undefined);
    jest.spyOn(commonService, 'cleanupTempFiles').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // =====================================================================
  // Issue 1 — the expiry date must stop moving
  // =====================================================================
  describe('activation window', () => {
    it('stamps activation and a +10y expiry when a new active student first syncs', async () => {
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('manual-1');

      const stored = studentRepo.byId('12100001');
      expect(stored.date_activated).toEqual(
        new Date('2026-08-26T08:00:00+08:00'),
      );
      expect(stored.expiry_datetime).toEqual(
        new Date('2036-08-26T08:00:00+08:00'),
      );
      expect(stored.date_deactivated).toBeNull();
    });

    // THE REGRESSION TEST. Before the fix the CSV re-derived both dates from
    // dayjs() every run, so day two exported an expiry one day later than
    // day one for a record that had not changed at all.
    it('exports the SAME expiry on two consecutive days for an unchanged record', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('manual-day-1');

      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('manual-day-2');

      const dayOne = csvRowFor('12100001', 0);
      const dayTwo = csvRowFor('12100001', 1);

      expect(dayOne.expiry_datetime).toBe('2036-08-26 08:00:00.000');
      expect(dayTwo.expiry_datetime).toBe(dayOne.expiry_datetime);
      expect(dayTwo.start_datetime).toBe(dayOne.start_datetime);
    });

    it('leaves the stored window untouched on a re-sync that changes nothing', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('manual-day-1');
      const afterFirst = { ...studentRepo.byId('12100001') };

      setClock('2026-09-30T08:00:00+08:00');
      await service.executeDatabaseSync('manual-day-2');

      expect(studentRepo.byId('12100001').date_activated).toEqual(
        afterFirst.date_activated,
      );
      expect(studentRepo.byId('12100001').expiry_datetime).toEqual(
        afterFirst.expiry_datetime,
      );
    });

    it('exports the expired window and records the date when someone is deactivated', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('manual-1');

      // Source flips Status to falsy -> Campus_Entry 'N'
      sourceRows = [sourceRow({ Status: false })];
      setClock('2026-09-01T08:00:00+08:00');
      await service.executeDatabaseSync('manual-2');

      const row = csvRowFor('12100001', 1);
      expect(row.expiry_datetime).toBe('2026-08-31 00:00:00.000'); // yesterday
      expect(row.start_datetime).toBe('2026-08-30 00:00:00.000'); // two days ago

      const stored = studentRepo.byId('12100001');
      expect(stored.date_deactivated).toEqual(
        new Date('2026-09-01T08:00:00+08:00'),
      );
      // activation history is preserved for audit
      expect(stored.date_activated).toEqual(
        new Date('2026-08-26T08:00:00+08:00'),
      );
    });

    it('restarts the 10-year window from the re-activation date', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      sourceRows = [sourceRow({ Status: false })];
      setClock('2026-09-01T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      sourceRows = [sourceRow({ Status: true })];
      setClock('2027-01-15T08:00:00+08:00');
      await service.executeDatabaseSync('run-3');

      const stored = studentRepo.byId('12100001');
      expect(stored.date_activated).toEqual(
        new Date('2027-01-15T08:00:00+08:00'),
      );
      expect(stored.expiry_datetime).toEqual(
        new Date('2037-01-15T08:00:00+08:00'),
      );
      expect(stored.date_deactivated).toBeNull();
      expect(csvRowFor('12100001', 2).expiry_datetime).toBe(
        '2037-01-15 08:00:00.000',
      );
    });

    it('backfills a legacy row that predates the activation columns', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Campus_Entry: 'Y',
        isArchived: false,
        date_activated: null,
        date_deactivated: null,
        expiry_datetime: null,
      } as Student);

      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('manual-1');

      const stored = studentRepo.byId('12100001');
      expect(stored.date_activated).toEqual(
        new Date('2026-08-26T08:00:00+08:00'),
      );
      expect(stored.expiry_datetime).toEqual(
        new Date('2036-08-26T08:00:00+08:00'),
      );
    });

    it('gives everyone in one run the same activation instant', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002' }),
        sourceRow({ ID: '12100003' }),
      ];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('manual-1');

      const stamps = studentRepo.rows.map((r) =>
        r.date_activated?.toISOString(),
      );
      expect(new Set(stamps).size).toBe(1);
    });
  });

  // =====================================================================
  // Issue 3 — a removed remark must reach PostgreSQL
  // =====================================================================
  describe('remarks', () => {
    it('clears the stored remark when the source view empties it', async () => {
      sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      expect(studentRepo.byId('12100001').Remarks).toBe('Owes library fee');

      sourceRows = [sourceRow({ Remarks: null })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(studentRepo.byId('12100001').Remarks).toBeNull();
    });

    it('treats an empty-string remark from the source as cleared', async () => {
      sourceRows = [sourceRow({ Remarks: 'Temporary note' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      sourceRows = [sourceRow({ Remarks: '' })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(studentRepo.byId('12100001').Remarks).toBeNull();
    });

    it('sends the remark to BioStar as an empty CSV cell once removed', async () => {
      sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      expect(csvRowFor('12100001', 0).remarks).toBe('Owes library fee');

      sourceRows = [sourceRow({ Remarks: null })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      // The CSV cell does go out empty. BioStar ignoring an empty cell is the
      // reported defect, and is why clearing needs the per-user PUT as well.
      expect(csvRowFor('12100001', 1).remarks).toBe('');
    });

    it('clears the remark in BioStar via PUT when the flag is on', async () => {
      CONFIG.DASMA_CLEAR_REMARKS_VIA_API = 'true';
      sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      sourceRows = [sourceRow({ Remarks: null })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(biostarApi.clearUserCustomField).toHaveBeenCalledTimes(1);
      expect(biostarApi.clearUserCustomField).toHaveBeenCalledWith(
        '12100001',
        'Remarks',
        't0ken',
        's3ss10n',
      );
    });

    it('does not touch BioStar when the flag is off (the default)', async () => {
      sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      sourceRows = [sourceRow({ Remarks: null })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(biostarApi.clearUserCustomField).not.toHaveBeenCalled();
    });

    it('only PUTs for remarks that were actually removed', async () => {
      CONFIG.DASMA_CLEAR_REMARKS_VIA_API = 'true';
      sourceRows = [
        sourceRow({ ID: '12100001', Remarks: 'Owes library fee' }),
        sourceRow({ ID: '12100002', Remarks: 'Late return' }),
        sourceRow({ ID: '12100003', Remarks: null }),
      ];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      // Only 12100001 is emptied; 12100002 changes value, 12100003 never had one.
      sourceRows = [
        sourceRow({ ID: '12100001', Remarks: null }),
        sourceRow({ ID: '12100002', Remarks: 'Cleared fine' }),
        sourceRow({ ID: '12100003', Remarks: null }),
      ];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(biostarApi.clearUserCustomField).toHaveBeenCalledTimes(1);
      expect(
        (biostarApi.clearUserCustomField as jest.Mock).mock.calls[0][0],
      ).toBe('12100001');
    });

    it('does not abort the sync when clearing a remark fails', async () => {
      CONFIG.DASMA_CLEAR_REMARKS_VIA_API = 'true';
      (biostarApi.clearUserCustomField as jest.Mock).mockResolvedValue(false);

      sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      sourceRows = [sourceRow({ Remarks: null })];
      setClock('2026-08-27T08:00:00+08:00');

      await expect(service.executeDatabaseSync('run-2')).resolves.toMatchObject(
        { success: true },
      );
      expect(studentRepo.byId('12100001').Remarks).toBeNull();
    });
  });

  // =====================================================================
  // Issue 2 — BioStar -> PostgreSQL must not silently drop people
  // =====================================================================
  describe('syncFromBiostar', () => {
    /** A row as GET /api/users returns it (see Suprema's list-users docs). */
    const listRow = (over: Record<string, unknown> = {}) => ({
      user_id: '12100001',
      name: 'Dela Cruz, Juan',
      photo_exists: true,
      card_count: '0',
      last_modified: '100',
      ...over,
    });

    const detail = (over: Record<string, unknown> = {}) => ({
      User: {
        user_id: '12100001',
        name: 'Dela Cruz, Juan',
        photo: 'BASE64PHOTO',
        disabled: 'false',
        ...over,
      },
    });

    it('creates a student from a BioStar user that PostgreSQL does not have', async () => {
      biostarPages = [{ total: 1, rows: [listRow()] }];
      biostarDetails = { '12100001': detail() };

      await service.syncFromBiostar('biostar-1');

      const stored = studentRepo.byId('12100001');
      expect(stored.Photo).toBe('BASE64PHOTO');
      expect(stored.isArchived).toBe(false);
      expect(biostarState.lastSuccessAt).toBeInstanceOf(Date);
    });

    it('never fetches detail for a user with neither photo nor card', async () => {
      biostarPages = [
        {
          total: 2,
          rows: [
            listRow({ user_id: '12100001', photo_exists: true }),
            listRow({
              user_id: '12100002',
              photo_exists: false,
              card_count: '0',
            }),
          ],
        },
      ];
      biostarDetails = {
        '12100001': detail({ user_id: '12100001' }),
        '12100002': detail({ user_id: '12100002' }),
      };

      await service.syncFromBiostar('biostar-1');

      // Documents the current filter: no photo and no card means no record.
      expect(studentRepo.byId('12100001')).toBeDefined();
      expect(studentRepo.byId('12100002')).toBeUndefined();
    });

    // 6a — the cursor was compared as text, where "9" sorts above "10".
    it('advances the incremental cursor numerically, not lexicographically', async () => {
      biostarPages = [
        {
          total: 3,
          rows: [
            listRow({ user_id: '1', last_modified: '9' }),
            listRow({ user_id: '2', last_modified: '10' }),
            listRow({ user_id: '3', last_modified: '8' }),
          ],
        },
      ];
      biostarDetails = {
        '1': detail({ user_id: '1' }),
        '2': detail({ user_id: '2' }),
        '3': detail({ user_id: '3' }),
      };

      await service.syncFromBiostar('biostar-1');

      expect(biostarState.lastModifiedCursor).toBe('10');
    });

    it('still orders ISO-timestamp cursors correctly', async () => {
      biostarPages = [
        {
          total: 2,
          rows: [
            listRow({ user_id: '1', last_modified: '2026-08-26T00:00:00Z' }),
            listRow({ user_id: '2', last_modified: '2026-09-02T00:00:00Z' }),
          ],
        },
      ];
      biostarDetails = {
        '1': detail({ user_id: '1' }),
        '2': detail({ user_id: '2' }),
      };

      await service.syncFromBiostar('biostar-1');

      expect(biostarState.lastModifiedCursor).toBe('2026-09-02T00:00:00Z');
    });

    // 6b — a run cut short by the cap used to still mark itself successful,
    // so the remainder was skipped forever on the next incremental run.
    it('does not mark a run successful when the per-run cap cut it short', async () => {
      CONFIG.BIOSTAR_MAX_CANDIDATES_PER_RUN = '1';
      biostarPages = [
        {
          total: 2,
          rows: [
            listRow({ user_id: '1', last_modified: '1' }),
            listRow({ user_id: '2', last_modified: '2' }),
          ],
        },
      ];
      biostarDetails = { '1': detail({ user_id: '1' }) };

      await service.syncFromBiostar('biostar-1');

      expect(biostarState.lastSuccessAt).toBeNull();
      expect(biostarState.lastError).toMatch(/cap/i);
    });

    // 6c — a failed detail fetch was counted and forgotten.
    it('does not mark a run successful when a detail fetch failed', async () => {
      biostarPages = [
        {
          total: 2,
          rows: [
            listRow({ user_id: '1', last_modified: '1' }),
            listRow({ user_id: '2', last_modified: '2' }),
          ],
        },
      ];
      // '2' resolves to null — the retry helper gave up on it.
      biostarDetails = { '1': detail({ user_id: '1' }) };

      await service.syncFromBiostar('biostar-1');

      expect(biostarState.lastSuccessAt).toBeNull();
      expect(biostarState.lastError).toMatch(/detail fetch/i);
    });

    it('marks the run successful when every candidate resolved', async () => {
      biostarPages = [
        { total: 1, rows: [listRow({ user_id: '1', last_modified: '5' })] },
      ];
      biostarDetails = { '1': detail({ user_id: '1' }) };

      await service.syncFromBiostar('biostar-1');

      expect(biostarState.lastSuccessAt).toBeInstanceOf(Date);
      expect(biostarState.lastError).toBeNull();
    });

    it('archives a user BioStar reports as disabled', async () => {
      biostarPages = [{ total: 1, rows: [listRow()] }];
      biostarDetails = { '12100001': detail({ disabled: 'true' }) };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').isArchived).toBe(true);
    });

    it('treats a past expiry_datetime in BioStar as archived', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      biostarPages = [{ total: 1, rows: [listRow()] }];
      biostarDetails = {
        '12100001': detail({ expiry_datetime: '2020-01-01T00:00:00Z' }),
      };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').isArchived).toBe(true);
    });
  });

  // =====================================================================
  // Diagnostics — the file handed back after a staging run
  // =====================================================================
  describe('diagnostics', () => {
    /** Parses the JSON handed to the (mocked) writeFileSync. */
    const diagnosticsWritten = () =>
      (fsMock.writeFileSync as jest.Mock).mock.calls
        .filter(([p]) => String(p).includes('diagnostics'))
        .map(([, body]) => JSON.parse(String(body)));

    beforeEach(() => {
      jest.spyOn(commonService, 'writeSyncDiagnostics');
    });

    it('never needs the expiry fallback, because the window is stored before export', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      const [first, second] = diagnosticsWritten();
      // Persistence happens earlier in the same run than the CSV build, and
      // existingMap is refreshed from the database in between — so even a
      // brand-new record already has its window by export time. Anything in
      // this list on staging means that ordering broke.
      expect(first.expiryFallbackUsed.ids).toEqual([]);
      expect(second.expiryFallbackUsed.ids).toEqual([]);
    });

    it('names the users BioStar listed that PostgreSQL does not hold', async () => {
      biostarPages = [
        {
          total: 2,
          rows: [
            {
              user_id: 'IN_PG',
              photo_exists: true,
              card_count: '0',
              last_modified: '1',
            },
            {
              user_id: 'MISSING',
              photo_exists: false,
              card_count: '0',
              last_modified: '2',
            },
          ],
        },
      ];
      biostarDetails = { IN_PG: { User: { user_id: 'IN_PG', photo: 'P' } } };

      await service.syncFromBiostar('biostar-1');

      const diag = diagnosticsWritten().at(-1);
      expect(diag.missingFromPostgres.ids).toEqual(['MISSING']);
      expect(diag.direction).toBe('biostar-to-postgres');
    });

    it('records the real list-row field names and the group ids seen', async () => {
      biostarPages = [
        {
          total: 1,
          rows: [
            {
              user_id: '1',
              photo_exists: true,
              card_count: '0',
              last_modified: '1',
              user_group_id: { id: 1, name: 'All Users' },
            },
          ],
        },
      ];
      biostarDetails = { '1': { User: { user_id: '1', photo: 'P' } } };

      await service.syncFromBiostar('biostar-1');

      const diag = diagnosticsWritten().at(-1);
      expect(diag.listRowKeys).toContain('photo_exists');
      expect(diag.groupIdsSeen).toEqual(['1']);
      expect(diag.detailHadPhoto).toBe(1);
    });

    it('writes a diagnostics file even when the sync throws', async () => {
      (sql.connect as jest.Mock).mockRejectedValueOnce(
        new Error('SQL Server unreachable'),
      );

      await expect(service.executeDatabaseSync('run-1')).rejects.toThrow();

      const diag = diagnosticsWritten().at(-1);
      expect(diag.failed).toBe(true);
    });

    it('carries identifiers only — never names, photos or remark text', async () => {
      sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      const body = JSON.stringify(diagnosticsWritten().at(-1));
      expect(body).not.toContain('Owes library fee');
      expect(body).not.toContain('Dela Cruz');
    });
  });

  // =====================================================================
  // Export shape — the contract with BioStar must not drift
  // =====================================================================
  describe('CSV contract', () => {
    it('keeps the ten Dasma columns and their order', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('manual-1');

      // csv-writer emits columns in HEADER order, not object-key order, so the
      // header definition is the actual contract with BioStar.
      expect(csvHeaders[0].map((h) => h.title)).toEqual([
        'user_id',
        'name',
        'department',
        'user_title',
        'user_group',
        'Remarks',
        'csn',
        'start_datetime',
        'expiry_datetime',
        'original_campus_entry',
      ]);
      expect(latestCsv()[0]).toHaveProperty('csn');
    });

    it('uploads the CSV to BioStar and imports it in overwrite mode', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('manual-1');

      const posted = (axios.post as jest.Mock).mock.calls.map((c) => c[0]);
      expect(posted).toContain('https://biostar.fake/api/attachments');
      expect(posted).toContain('https://biostar.fake/api/users/csv_import');

      const importCall = (axios.post as jest.Mock).mock.calls.find((c) =>
        String(c[0]).includes('csv_import'),
      );
      // import_option 2 is overwrite; start_line 2 skips the header row.
      expect(importCall[1].CsvOption.import_option).toBe(2);
      expect(importCall[1].CsvOption.start_line).toBe(2);
    });

    it('excludes archived people from the upload', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002', IsArchived: true }),
      ];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('manual-1');

      expect(latestCsv().map((r) => r.user_id)).toEqual(['12100001']);
    });

    it('skips records with no name rather than shipping them to a gate', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002', LastName: '', FirstName: '' }),
      ];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('manual-1');

      expect(latestCsv().map((r) => r.user_id)).toEqual(['12100001']);
    });

    it('archives people who disappear from the source view', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002' }),
      ];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      sourceRows = [sourceRow({ ID: '12100001' })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(studentRepo.byId('12100002').isArchived).toBe(true);
      expect(studentRepo.byId('12100001').isArchived).toBe(false);
    });
  });
});
