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
        // TypeORM FindOperators arrive as objects carrying their kind in
        // `_type`. Only the two the sync actually uses are honoured; anything
        // else must fail loudly rather than silently matching nothing.
        if (operand && typeof operand === 'object' && '_type' in operand) {
          const kind = (operand as { _type: string })._type;
          if (kind === 'isNull') {
            return actual === null || actual === undefined;
          }
          if (kind === 'in') {
            return unwrapIn(operand).includes(actual as string);
          }
          if (kind === 'raw') {
            // The sync uses exactly one Raw predicate — the reconciliation
            // snapshot's "this column holds something", i.e. NOT NULL AND
            // <> ''. Mirroring it here keeps the double honest; a second,
            // different Raw would need this widened rather than reused.
            return actual !== null && actual !== undefined && actual !== '';
          }
          throw new Error(
            `FakeStudentRepository: unsupported operator ${kind}`,
          );
        }
        if (operand && typeof operand === 'object' && '_value' in operand) {
          return unwrapIn(operand).includes(actual as string);
        }
        return actual === operand;
      });
    }

    create(data: Partial<Student>): Student {
      return { ...data } as Student;
    }

    async find(
      options: { where?: Record<string, unknown>; take?: number } = {},
    ) {
      const matched = options.where
        ? this.rows.filter((r) => this.matches(options.where, r))
        : [...this.rows];
      // `take` is load-bearing for the remark sweep, which is bounded per run.
      return options.take ? matched.slice(0, options.take) : matched;
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
  /**
   * Ids BioStar cannot answer for right now — a timeout or a 5xx, not a "no
   * such user". Absence from `biostarDetails` means the opposite: BioStar
   * looked and genuinely does not have them, which is a 400.
   */
  let biostarUnreachable: Set<string>;

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
    biostarUnreachable = new Set<string>();
    studentRepo = new FakeStudentRepository();

    // --- fake SQL Server -------------------------------------------------
    const fakePool = {
      request: () => ({
        query: jest.fn(async (text: string) => {
          if (text.includes('sys.columns')) {
            // checkColumnExists('IsArchived') -> yes
            return { recordset: [{ count: 1 }] };
          }
          // Honour the page the service asked for, as a real server would.
          const offsetMatch = text.match(/OFFSET (\d+) ROWS/);
          const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
          const fetchMatch = text.match(/FETCH NEXT (\d+) ROWS/);
          const size = fetchMatch ? Number(fetchMatch[1]) : sourceRows.length;
          // Fresh copies every query, exactly as a real driver returns. The
          // service truncates the recordset it is handed (`batchRecords.length
          // = 0`) to release memory, so returning the same array twice would
          // leave the second sync in a test seeing an empty roster.
          return {
            recordset: sourceRows
              .slice(offset, offset + size)
              .map((row) => ({ ...row })),
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
            fetchBiostarUserDetail: jest.fn(async (userId: string) => {
              if (biostarUnreachable.has(userId)) {
                return { detail: null, status: 503, definitive: false };
              }
              const detail = biostarDetails[userId] ?? null;
              return detail
                ? { detail, status: 200, definitive: true }
                : { detail: null, status: 400, definitive: true };
            }),
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
    // dayjs() every run, so day two exported an expiry one day later than day
    // one for a record that had not changed at all.
    //
    // Day two changes the surname so the row is exported again — an otherwise
    // untouched record is no longer re-sent at all now, which is a stronger
    // guarantee but would leave nothing to compare the dates against.
    it('exports the SAME expiry on two consecutive days for a record whose window did not move', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('manual-day-1');

      sourceRows = [sourceRow({ LastName: 'Dela Cruz-Reyes' })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('manual-day-2');

      const dayOne = csvRowFor('12100001', 0);
      const dayTwo = csvRowFor('12100001', 1);

      // Day-floored, not the 08:00 activation instant — see
      // 'back-dates the exported start to the day before activation'.
      expect(dayOne.expiry_datetime).toBe('2036-08-26 00:00:00.000');
      expect(dayTwo.expiry_datetime).toBe(dayOne.expiry_datetime);
      expect(dayTwo.start_datetime).toBe(dayOne.start_datetime);
    });

    /**
     * The exported window must keep the 24-hour head start the legacy build had.
     *
     * Anchoring the window to the stored activation date fixed the drift, but
     * it also started exporting the activation INSTANT — live BioStar held
     * `start_datetime: 2026-09-10T16:28:31Z` for 27 people after one run. The
     * old build always sent `today - 1 day 00:00`, and that day of slack is
     * what absorbs any disagreement between our clock and the devices' about
     * what timezone a naked `YYYY-MM-DD HH:mm:ss.SSS` is in. With zero margin,
     * a student activated at 16:28 is at the mercy of that interpretation.
     *
     * The dates still come from the stored column, so they are still stable
     * run to run — this only floors them to the day and steps the start back.
     */
    it('back-dates the exported start to the day before activation', async () => {
      setClock('2026-08-26T16:28:31+08:00');

      await service.executeDatabaseSync('manual-1');

      const row = csvRowFor('12100001');
      expect(row.start_datetime).toBe('2026-08-25 00:00:00.000');
      expect(row.expiry_datetime).toBe('2036-08-26 00:00:00.000');
    });

    it('keeps that window byte-identical when the run happens a day later', async () => {
      setClock('2026-08-26T16:28:31+08:00');
      await service.executeDatabaseSync('day-1');

      sourceRows = [sourceRow({ LastName: 'Dela Cruz-Reyes' })];
      setClock('2026-08-27T09:14:02+08:00');
      await service.executeDatabaseSync('day-2');

      const one = csvRowFor('12100001', 0);
      const two = csvRowFor('12100001', 1);
      expect(two.start_datetime).toBe(one.start_datetime);
      expect(two.expiry_datetime).toBe(one.expiry_datetime);
      expect(two.start_datetime).toBe('2026-08-25 00:00:00.000');
    });

    it('back-dates a whole day even for a late-evening activation', async () => {
      setClock('2026-08-26T23:59:59+08:00');

      await service.executeDatabaseSync('manual-1');

      expect(csvRowFor('12100001').start_datetime).toBe(
        '2026-08-25 00:00:00.000',
      );
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
      // The STORED expiry keeps the activation instant (asserted just above);
      // only the exported cell is floored to the day.
      expect(csvRowFor('12100001', 2).expiry_datetime).toBe(
        '2037-01-15 00:00:00.000',
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

    // The CSV cell has always been trimmed (`record.Remarks?.trim() || ''`)
    // while the value stored in Postgres was not, so a remark of only spaces
    // stayed truthy in the database. The removal test at the persistence layer
    // therefore never fired: no clear, no pending flag, no log line — the old
    // remark simply stayed on the gate screen forever. Silent.
    it('treats a whitespace-only remark from the source as cleared', async () => {
      sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      sourceRows = [sourceRow({ Remarks: '   ' })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(studentRepo.byId('12100001').Remarks).toBeNull();
    });

    it('clears a whitespace-only remark in BioStar too', async () => {
      sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      sourceRows = [sourceRow({ Remarks: '   ' })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(biostarApi.clearUserCustomField).toHaveBeenCalledWith(
        '12100001',
        'Remarks',
        expect.any(String),
        expect.any(String),
      );
    });

    // A remark that only gained or lost surrounding spaces is not a change.
    // Before the trim it looked like one every run, which both churned the
    // database and inflated the changed-row count the export is sized from.
    it('does not treat re-padding an unchanged remark as a change', async () => {
      sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      const afterFirstRun = studentRepo.byId('12100001').updatedAt;

      sourceRows = [sourceRow({ Remarks: '  Owes library fee  ' })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(studentRepo.byId('12100001').Remarks).toBe('Owes library fee');
      expect(studentRepo.byId('12100001').updatedAt).toEqual(afterFirstRun);
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

    it('clears the remark in BioStar via PUT', async () => {
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

    it('does not PUT at all when no remark was removed', async () => {
      sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      // Same remark, unchanged.
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(biostarApi.clearUserCustomField).not.toHaveBeenCalled();
    });

    it('only PUTs for remarks that were actually removed', async () => {
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

    // Bucket 2 (error) — safety.md invariant 2. Before the pending flag the
    // retry trigger was `existing.Remarks`, which this run already nulled, so
    // a failed PUT could never be re-attempted and PostgreSQL and the gate
    // screen disagreed forever.
    it('retries a failed remark clear on the next run', async () => {
      (biostarApi.clearUserCustomField as jest.Mock).mockResolvedValue(false);

      sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      sourceRows = [sourceRow({ Remarks: null })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(biostarApi.clearUserCustomField).toHaveBeenCalledTimes(1);
      expect(studentRepo.byId('12100001').remarks_clear_pending).toBe(true);

      // Run 3: nothing changed in the source, but the clear is still owed.
      (biostarApi.clearUserCustomField as jest.Mock).mockResolvedValue(true);
      setClock('2026-08-28T08:00:00+08:00');
      await service.executeDatabaseSync('run-3');

      expect(biostarApi.clearUserCustomField).toHaveBeenCalledTimes(2);
      expect(studentRepo.byId('12100001').remarks_clear_pending).toBe(false);
    });

    it('stops retrying once BioStar confirms the clear', async () => {
      sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      sourceRows = [sourceRow({ Remarks: null })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');
      expect(studentRepo.byId('12100001').remarks_clear_pending).toBe(false);

      setClock('2026-08-28T08:00:00+08:00');
      await service.executeDatabaseSync('run-3');

      // One PUT total — the successful one. No re-attempt.
      expect(biostarApi.clearUserCustomField).toHaveBeenCalledTimes(1);
    });

    // Bucket 5 (performance) — PUT count tracks removed remarks, never roster.
    /**
     * THE LIVE INCIDENT, as a regression test.
     *
     * On 2026-09-10 a single run exported `88888888,…,Sir Boss,…` in the CSV,
     * imported it successfully, and then cleared that very remark in BioStar a
     * few seconds later. Diagnostics showed why: `clearedInPostgres: []` but
     * `pendingCarriedOver: ["88888888"]`. The flag was left over from an
     * earlier run and was acted on without ever re-reading the remark, which
     * by then was back.
     *
     * A pending flag is a record of an intention, not a licence. If the source
     * still holds a remark, the intention is stale and must be dropped — not
     * executed against a live value.
     */
    it('drops a stale pending flag instead of deleting a remark that came back', async () => {
      // The source says this person HAS a remark...
      sourceRows = [sourceRow({ Remarks: 'Sir Boss' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      // ...and an earlier run left a clear pending on them anyway.
      await studentRepo.update(
        { ID_Number: '12100001' },
        { remarks_clear_pending: true },
      );
      (biostarApi.clearUserCustomField as jest.Mock).mockClear();

      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(biostarApi.clearUserCustomField).not.toHaveBeenCalled();
      expect(studentRepo.byId('12100001').remarks_clear_pending).toBe(false);
      // And the remark itself is untouched on both sides.
      expect(studentRepo.byId('12100001').Remarks).toBe('Sir Boss');
    });

    it('still clears when the pending flag matches an empty remark', async () => {
      sourceRows = [sourceRow({ Remarks: 'Watchlist' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      // Remark removed upstream, but the PUT fails, so the flag survives.
      (biostarApi.clearUserCustomField as jest.Mock).mockResolvedValueOnce(
        false,
      );
      sourceRows = [sourceRow({ Remarks: null })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');
      expect(studentRepo.byId('12100001').remarks_clear_pending).toBe(true);

      // Next run retries it — the source still says the remark is gone.
      (biostarApi.clearUserCustomField as jest.Mock).mockClear();
      setClock('2026-08-28T08:00:00+08:00');
      await service.executeDatabaseSync('run-3');

      expect(biostarApi.clearUserCustomField).toHaveBeenCalledTimes(1);
      expect(studentRepo.byId('12100001').remarks_clear_pending).toBe(false);
    });

    it('never PUTs for users whose remark did not change', async () => {
      sourceRows = Array.from({ length: 25 }, (_, i) =>
        sourceRow({ ID: `1210${String(i).padStart(4, '0')}`, Remarks: 'keep' }),
      );
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      sourceRows[0].Remarks = null;
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(biostarApi.clearUserCustomField).toHaveBeenCalledTimes(1);
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

    /**
     * `photo_exists` is BioStar's own statement about whether the person has a
     * photo, and it is the only thing that separates two situations a bare
     * missing `photo` field cannot:
     *
     *   - the photo was deliberately deleted over there, and ours must follow
     *   - the reply simply did not carry it, and ours must survive
     *
     * Checked against the 34 users captured live on 2026-09-10: `photo_exists`
     * agreed with whether the detail carried a photo in 34 of 34 cases, and
     * every detail payload carried the flag.
     */
    it('clears the photo when BioStar says the person no longer has one', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [
        { total: 1, rows: [listRow({ photo_exists: false, card_count: '1' })] },
      ];
      biostarDetails = {
        '12100001': {
          User: {
            user_id: '12100001',
            name: 'Dela Cruz, Juan',
            disabled: 'false',
            photo_exists: 'false',
            cards: [{ card_id: '5551234' }],
          },
        },
      };

      await service.syncFromBiostar('biostar-1');

      // Deliberate removal propagates — otherwise a stale face stays on the
      // gate screen, which is worse than no face at all.
      expect(studentRepo.byId('12100001').Photo).toBeNull();
    });

    it('keeps the stored photo when BioStar says one exists but does not send it', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [
        { total: 1, rows: [listRow({ photo_exists: true, card_count: '1' })] },
      ];
      // Says it has one, did not include it: an incomplete reply, not a removal.
      biostarDetails = {
        '12100001': {
          User: {
            user_id: '12100001',
            name: 'Dela Cruz, Juan',
            disabled: 'false',
            photo_exists: 'true',
            cards: [{ card_id: '5551234' }],
          },
        },
      };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').Photo).toBe('/9j/ALREADYSTORED');
      expect(studentRepo.byId('12100001').Unique_ID).toBe('5551234');
    });

    it('leaves the photo alone when BioStar does not say either way', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow({ card_count: '1' })] }];
      // No photo_exists at all — unknown, so the safe answer is to not touch it.
      biostarDetails = {
        '12100001': {
          User: {
            user_id: '12100001',
            name: 'Dela Cruz, Juan',
            disabled: 'false',
            cards: [{ card_id: '5551234' }],
          },
        },
      };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').Photo).toBe('/9j/ALREADYSTORED');
    });

    it('still replaces the stored photo when BioStar sends a different one', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/OLDPHOTO',
        Campus_Entry: 'Y',
        isArchived: false,
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow()] }];
      biostarDetails = { '12100001': detail({ photo: '/9j/NEWPHOTO' }) };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').Photo).toBe('/9j/NEWPHOTO');
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

    // ================================================================
    // Edge and error cases on the photo, the card and the payload shape.
    // These exist so the next one is not found in production.
    // ================================================================

    it('treats an empty-string photo as no photo, not as a new one', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        Unique_ID: '1111111',
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow({ card_count: '1' })] }];
      biostarDetails = {
        '12100001': {
          User: {
            user_id: '12100001',
            name: 'Dela Cruz, Juan',
            disabled: 'false',
            photo: '',
            photo_exists: 'true',
            cards: [{ card_id: '5551234' }],
          },
        },
      };

      await service.syncFromBiostar('biostar-1');

      // An empty string is not an image. Storing it would blank the avatar
      // just as surely as null would.
      expect(studentRepo.byId('12100001').Photo).toBe('/9j/ALREADYSTORED');
    });

    it('keeps the photo when the flag says TRUE in a different case', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        Unique_ID: '1111111',
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow({ card_count: '1' })] }];
      biostarDetails = {
        '12100001': {
          User: {
            user_id: '12100001',
            name: 'Dela Cruz, Juan',
            disabled: 'false',
            photo_exists: 'TRUE',
            cards: [{ card_id: '5551234' }],
          },
        },
      };

      await service.syncFromBiostar('biostar-1');

      // A case-sensitive read of the flag would call this "no photo" and wipe
      // a real one. The flag decides whether to DELETE; it must be read loosely.
      expect(studentRepo.byId('12100001').Photo).toBe('/9j/ALREADYSTORED');
    });

    it('stores a photo BioStar actually sent even if the flag disagrees', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        Unique_ID: '1111111',
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow({ card_count: '1' })] }];
      biostarDetails = {
        '12100001': {
          User: {
            user_id: '12100001',
            name: 'Dela Cruz, Juan',
            disabled: 'false',
            photo: '/9j/REALBYTES',
            photo_exists: 'false',
            cards: [{ card_id: '5551234' }],
          },
        },
      };

      await service.syncFromBiostar('biostar-1');

      // Bytes beat the flag. The flag only has to settle what an ABSENT photo
      // means; if an image arrived, BioStar plainly has one.
      expect(studentRepo.byId('12100001').Photo).toBe('/9j/REALBYTES');
    });

    it('honours photo_exists on an unwrapped detail payload', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        Unique_ID: '1111111',
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [
        { total: 1, rows: [listRow({ photo_exists: false, card_count: '1' })] },
      ];
      // No `User` wrapper — the other shape the code accepts.
      biostarDetails = {
        '12100001': {
          user_id: '12100001',
          name: 'Dela Cruz, Juan',
          disabled: 'false',
          photo_exists: 'false',
          cards: [{ card_id: '5551234' }],
        },
      };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').Photo).toBeNull();
    });

    it('creates a photoless student without inventing a photo', async () => {
      biostarPages = [
        { total: 1, rows: [listRow({ photo_exists: false, card_count: '1' })] },
      ];
      biostarDetails = {
        '12100001': {
          User: {
            user_id: '12100001',
            name: 'Dela Cruz, Juan',
            disabled: 'false',
            photo_exists: 'false',
            cards: [{ card_id: '5551234' }],
          },
        },
      };

      await service.syncFromBiostar('biostar-1');

      const stored = studentRepo.byId('12100001');
      expect(stored.Photo).toBeNull();
      expect(stored.Unique_ID).toBe('5551234');
    });

    // ---------------- the card side ----------------

    it('leaves the stored card alone when the detail carries no cards array', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        Unique_ID: '1111111',
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow()] }];
      biostarDetails = { '12100001': detail() };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').Unique_ID).toBe('1111111');
    });

    it('leaves the stored card alone when cards is an empty array', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        Unique_ID: '1111111',
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow()] }];
      biostarDetails = { '12100001': detail({ cards: [] }) };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').Unique_ID).toBe('1111111');
    });

    it('leaves the stored card alone when the card id is blank', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        Unique_ID: '1111111',
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow()] }];
      biostarDetails = { '12100001': detail({ cards: [{ card_id: '   ' }] }) };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').Unique_ID).toBe('1111111');
    });

    it('reads a card from the credentials shape as well as the cards shape', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        Unique_ID: '1111111',
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow()] }];
      biostarDetails = {
        '12100001': detail({
          credentials: { cards: [{ cardID: '7654321' }] },
        }),
      };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').Unique_ID).toBe('7654321');
    });

    /**
     * Documents a REAL asymmetry rather than asserting it is desirable.
     *
     * A card deleted in BioStar does not clear here, because a missing card is
     * read as "not told". The roster export then sends the stale card back in
     * the `csn` cell, which re-creates it. So deleting a card in the BioStar UI
     * is undone by the next sync. The photo now has `photo_exists` to settle
     * the same ambiguity; the card has `card_count` on the list row and does
     * not use it.
     */
    it('does NOT clear a card deleted in BioStar — known gap, pinned here', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        Unique_ID: '1111111',
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [
        { total: 1, rows: [listRow({ card_count: '0', photo_exists: true })] },
      ];
      biostarDetails = { '12100001': detail({ cards: [] }) };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').Unique_ID).toBe('1111111');
    });

    // ---------------- error paths ----------------

    it('writes nothing for a user BioStar could not be reached for', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        Unique_ID: '1111111',
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow({ card_count: '1' })] }];
      biostarUnreachable.add('12100001');

      await service.syncFromBiostar('biostar-1');

      const stored = studentRepo.byId('12100001');
      expect(stored.Photo).toBe('/9j/ALREADYSTORED');
      expect(stored.Unique_ID).toBe('1111111');
      // A run that lost someone must not advance the cursor past them.
      expect(biostarState.lastSuccessAt).toBeNull();
    });

    it('survives a detail payload that is an empty object', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        Unique_ID: '1111111',
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow({ card_count: '1' })] }];
      biostarDetails = { '12100001': {} };

      await expect(
        service.syncFromBiostar('biostar-1'),
      ).resolves.toBeUndefined();

      const stored = studentRepo.byId('12100001');
      expect(stored.Photo).toBe('/9j/ALREADYSTORED');
      expect(stored.Name).toBe('Dela Cruz, Juan');
    });

    it('handles the same user appearing twice in one list page', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/ALREADYSTORED',
        Campus_Entry: 'Y',
        isArchived: false,
        Unique_ID: '1111111',
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      biostarPages = [
        {
          total: 2,
          rows: [listRow({ card_count: '1' }), listRow({ card_count: '1' })],
        },
      ];
      biostarDetails = {
        '12100001': detail({ photo: '/9j/NEW', photo_exists: 'true' }),
      };

      await expect(
        service.syncFromBiostar('biostar-1'),
      ).resolves.toBeUndefined();

      expect(
        studentRepo.rows.filter((r) => r.ID_Number === '12100001'),
      ).toHaveLength(1);
      expect(studentRepo.byId('12100001').Photo).toBe('/9j/NEW');
    });

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

    // ------------------------------------------------------------------
    // Reconciling remarks for free
    //
    // A remark deleted from the source view BEFORE the clearing fix shipped
    // can never be detected as a removal: PostgreSQL is already blank, so the
    // transition cannot recur and nothing revisits the row. BioStar keeps
    // showing the old text forever.
    //
    // This pull already fetches each candidate's full detail, and that payload
    // carries `user_custom_fields`. Comparing the remark here costs no extra
    // BioStar call at all.
    // ------------------------------------------------------------------
    const detailWithRemark = (userId: string, remark: string | null) =>
      detail({
        user_id: userId,
        user_custom_fields: [
          { custom_field: { name: 'Lived Name' }, item: 'Johnny' },
          { custom_field: { name: 'Remarks' }, item: remark },
        ],
      });

    it('flags a remark BioStar still holds that PostgreSQL no longer has', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Remarks: null,
        remarks_clear_pending: false,
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow({ user_id: '12100001' })] }];
      biostarDetails = {
        '12100001': detailWithRemark('12100001', 'Owes library fee'),
      };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').remarks_clear_pending).toBe(true);
    });

    it('does not flag anything when both sides agree the remark is gone', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Remarks: null,
        remarks_clear_pending: false,
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow({ user_id: '12100001' })] }];
      biostarDetails = { '12100001': detailWithRemark('12100001', '') };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').remarks_clear_pending).toBe(false);
    });

    // A remark that still exists upstream is not drift — the roster sync owns
    // updating its text, and clearing it here would delete a live remark.
    it('does not flag a remark PostgreSQL still holds', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Remarks: 'Owes library fee',
        remarks_clear_pending: false,
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow({ user_id: '12100001' })] }];
      biostarDetails = {
        '12100001': detailWithRemark('12100001', 'Owes library fee'),
      };

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').remarks_clear_pending).toBe(false);
    });

    it('records that the remark was checked, so the sweep can skip it', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Remarks: null,
        remarks_clear_pending: false,
      } as Student);
      biostarPages = [{ total: 1, rows: [listRow({ user_id: '12100001' })] }];
      biostarDetails = { '12100001': detailWithRemark('12100001', null) };
      setClock('2026-08-26T08:00:00+08:00');

      await service.syncFromBiostar('biostar-1');

      expect(studentRepo.byId('12100001').remarks_checked_at).toEqual(
        new Date('2026-08-26T08:00:00+08:00'),
      );
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
  // CSV import response — Suprema documents Response.code as
  //   "0" = all successful, "1" = partially successful,
  //   "8" = all failed (delivered with HTTP 404)
  // =====================================================================
  describe('csv_import response handling', () => {
    const diagnosticsWritten = () =>
      (fsMock.writeFileSync as jest.Mock).mock.calls
        .filter(([p]) => String(p).includes('diagnostics'))
        .map(([, body]) => JSON.parse(String(body)));

    /** Makes csv_import answer with the given body; attachments still succeed. */
    const importResponds = (body: unknown) => {
      (axios.post as jest.Mock).mockImplementation(async (url: string) => {
        if (url.includes('/api/attachments')) {
          return { data: { filename: 'fake-upload.csv' } };
        }
        if (url.includes('/api/users/csv_import')) {
          return { data: body };
        }
        return { data: {} };
      });
    };

    // Bucket 1 — happy path.
    it('records a clean import when code is "0"', async () => {
      importResponds({ Response: { code: '0' } });
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      const diag = diagnosticsWritten().at(-1);
      expect(diag.csvImport[0]).toMatchObject({
        responseCode: '0',
        outcome: 'success',
      });
    });

    // Bucket 3 — edge. Partial failure WITHOUT the row collection used to fall
    // through and be logged as uploaded successfully.
    it('records a partial import when code is "1" even with no CsvRowCollection', async () => {
      importResponds({ Response: { code: '1' } });
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      const diag = diagnosticsWritten().at(-1);
      expect(diag.csvImport[0]).toMatchObject({
        responseCode: '1',
        outcome: 'partial',
      });
    });

    it('counts the failed rows when code is "1" and CsvRowCollection is present', async () => {
      importResponds({
        Response: { code: '1' },
        CsvRowCollection: { rows: [{ row: 2 }, { row: 7 }] },
      });
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(diagnosticsWritten().at(-1).csvImport[0]).toMatchObject({
        responseCode: '1',
        outcome: 'partial',
        partialFailureRows: 2,
      });
    });

    // Bucket 4 — rare/boundary. `undefined !== '0'` used to log "successful".
    it('treats a missing Response.code as a failure, not a success', async () => {
      importResponds({});
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(diagnosticsWritten().at(-1).csvImport[0]).toMatchObject({
        outcome: 'failed',
      });
    });

    it('treats an undocumented response code as a failure', async () => {
      importResponds({ Response: { code: '99' } });
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(diagnosticsWritten().at(-1).csvImport[0]).toMatchObject({
        responseCode: '99',
        outcome: 'failed',
      });
    });

    // Bucket 2 — error. A transport failure is already retried; assert the
    // retry count reaches diagnostics rather than being invisible.
    it('records how many upload retries a batch needed', async () => {
      let attempt = 0;
      (axios.post as jest.Mock).mockImplementation(async (url: string) => {
        if (url.includes('/api/attachments')) {
          attempt++;
          if (attempt === 1) throw new Error('ECONNRESET');
          return { data: { filename: 'fake-upload.csv' } };
        }
        if (url.includes('/api/users/csv_import')) {
          return { data: { Response: { code: '0' } } };
        }
        return { data: {} };
      });
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(diagnosticsWritten().at(-1).csvImport[0].retriesUsed).toBe(1);
    }, 15000);
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

    // These are the numbers a human reads off staging to decide whether the
    // re-enroll storm actually stopped. A renamed or missing key here costs
    // the entire signal, silently — so the shape is pinned, not just the
    // behaviour it describes.
    /**
     * The disabled branch had no equivalent of `expiryFallbackUsed`.
     *
     * A deactivated row with no `date_deactivated` anchors its window to TODAY,
     * so its rendered bytes change every calendar day and it re-exports
     * forever — the exact churn this whole change set exists to stop — with
     * nothing anywhere saying why. `resolveActivationWindow` stamps that column
     * precisely so this cannot happen, which is why it needs to be visible if
     * it ever does.
     */
    it('names a disabled row that had to fall back to today', async () => {
      studentRepo.rows.push({
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Campus_Entry: 'N',
        isArchived: false,
        date_activated: null,
        date_deactivated: null,
        expiry_datetime: null,
        remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
      } as Student);
      sourceRows = [sourceRow({ Status: false })];
      // Stop resolveActivationWindow from stamping the column, so the row
      // reaches the CSV builder in the state this diagnostic is here to catch.
      jest
        .spyOn(commonService, 'resolveActivationWindow')
        .mockReturnValue(null);
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(
        diagnosticsWritten().at(-1).disabledAnchorFallbackUsed.ids,
      ).toEqual(['12100001']);
    });

    it('leaves that list empty when the deactivation date is stamped', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      sourceRows = [sourceRow({ Status: false })];
      setClock('2026-09-01T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(
        diagnosticsWritten().at(-1).disabledAnchorFallbackUsed.ids,
      ).toEqual([]);
    });

    // Where a run's time goes, read off the file instead of guessed — the
    // 20k stress round and any slow production run both depend on it.
    it('edge: reports wall time for every push phase, even one that never ran', async () => {
      sourceRows = [sourceRow({ ID: '12100001' })];
      await service.executeDatabaseSync('run-1');

      const { timingsMs } = diagnosticsWritten().at(-1);
      expect(Object.keys(timingsMs).sort()).toEqual([
        'csnResolve',
        'csvUpload',
        'persistRowHashes',
        'postgresWrite',
        'reconciliation',
        'remarks',
        'sourceRead',
        'total',
      ]);
      for (const v of Object.values(timingsMs)) {
        expect(Number.isInteger(v) && (v as number) >= 0).toBe(true);
      }
    });

    // The unit fake has no user list, so lookups go per user. Each one is
    // counted — and an unchanged row is not sent, so it needs none on run 2.
    it('edge: counts a per-user card lookup when the BioStar user list is unavailable', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002' }),
      ];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      const [first, second] = diagnosticsWritten();
      expect(first.csvExport.csnApiLookups).toBe(2);
      expect(second.csvExport.csnApiLookups).toBe(0);
    });

    // Changed-only export, pinned by identity: after one row changes, that row
    // and nothing else goes to BioStar.
    it('regression: names exactly the rows it sent to BioStar', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002' }),
      ];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002', FirstName: 'Maria' }),
      ];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');
      setClock('2026-08-28T08:00:00+08:00');
      await service.executeDatabaseSync('run-3');

      const [first, second, third] = diagnosticsWritten();
      expect(second.rowsChanged).toBe(1);
      expect(third.rowsChanged).toBe(0);
      expect(first.csvExport.emittedIds).toEqual({
        ids: ['12100001', '12100002'],
        truncated: 0,
      });
      expect(second.csvExport.emittedIds).toEqual({
        ids: ['12100002'],
        truncated: 0,
      });
      expect(third.csvExport.emittedIds).toEqual({ ids: [], truncated: 0 });
    });

    it('happy: reports wall time per phase for the BioStar pull', async () => {
      biostarPages = [
        {
          total: 1,
          rows: [
            {
              user_id: '12100001',
              name: 'Dela Cruz, Juan',
              photo_exists: true,
              card_count: '0',
              last_modified: '100',
            },
          ],
        },
      ];
      biostarDetails = {
        '12100001': {
          User: {
            user_id: '12100001',
            name: 'Dela Cruz, Juan',
            photo: 'BASE64PHOTO',
            disabled: 'false',
          },
        },
      };
      await service.syncFromBiostar('biostar-1');

      const { timingsMs } = diagnosticsWritten().at(-1);
      expect(Object.keys(timingsMs).sort()).toEqual([
        'detailFetch',
        'listFetch',
        'postgresWrite',
        'storedState',
        'total',
      ]);
      for (const v of Object.values(timingsMs)) {
        expect(Number.isInteger(v) && (v as number) >= 0).toBe(true);
      }
    });

    it('reports what was exported versus suppressed', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002' }),
      ];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      const [first, second] = diagnosticsWritten();

      expect(first.csvExport).toEqual(
        expect.objectContaining({
          rowsEmitted: 2,
          rowsSuppressedUnchanged: 0,
          batchesSkippedNoChanges: 0,
          csnPersistedFromBiostar: 0,
        }),
      );
      expect(first.csvExport.csnUnresolvedRowsSkipped.ids).toEqual([]);

      // Second run: nothing changed, so nothing goes out and the batch is
      // skipped outright rather than uploaded as a header-only file.
      expect(second.csvExport).toEqual(
        expect.objectContaining({
          rowsEmitted: 0,
          rowsSuppressedUnchanged: 2,
          batchesSkippedNoChanges: 1,
        }),
      );
      expect(second.csvImport).toEqual([]);
    });

    it('reports the remark sweep and clearing counters', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      const [first] = diagnosticsWritten();
      expect(first.remarks).toEqual(
        expect.objectContaining({
          attempted: expect.any(Number),
          succeeded: expect.any(Number),
          sweptThisRun: expect.any(Number),
        }),
      );
      expect(first.remarks.failedIds.ids).toEqual([]);
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

    // Whatever case or spelling the source uses for "there is nothing here".
    it.each([
      ['NULL'],
      ['null'],
      ['Null'],
      ['  NULL  '],
      ['N/A'],
      ['n/a'],
      ['NONE'],
      ['-'],
      ['.'],
    ])('drops a middle name the source sent as %p', async (placeholder) => {
      sourceRows = [
        sourceRow({
          LastName: 'Reyes',
          FirstName: 'Ana',
          MiddleName: placeholder,
        }),
      ];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('manual-1');

      expect(latestCsv()[0].name).toBe('Reyes Ana');
    });

    it('drops a placeholder surname without losing the rest of the name', async () => {
      sourceRows = [
        sourceRow({ LastName: 'NULL', FirstName: 'Ana', MiddleName: 'Reyes' }),
      ];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('manual-1');

      expect(latestCsv()[0].name).toBe('Ana Reyes');
    });

    // The one case where cleaning must NOT win. Every part is a placeholder, so
    // a clean name would be empty — and an empty name is dropped from the batch
    // by the guard above, which means that person silently stops being updated
    // at the gate. Keeping the unclean name is the lesser harm, and it is
    // reported rather than done quietly.
    it('keeps the unclean name rather than dropping the person entirely', async () => {
      sourceRows = [
        sourceRow({
          ID: '12100003',
          LastName: 'NULL',
          FirstName: 'NULL',
          MiddleName: null,
          Suffix: null,
        }),
      ];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('manual-1');

      expect(latestCsv().map((r) => r.user_id)).toEqual(['12100003']);
      expect(latestCsv()[0].name).toBe('NULL NULL');
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

  // =====================================================================
  // Only send BioStar what actually changed
  //
  // The reported defect: "khit wla nmn changes nag generate parin ng csv file
  // tpos binato sa biostar kaya nag rere enroll sa mga devices ng madaming
  // user". Every run exported the whole non-archived roster under
  // `import_option: 2` (Overwrite), so BioStar marked every user modified and
  // its Automatic User Synchronization re-transferred all of them to every
  // connected device.
  // =====================================================================
  describe('changed-only export', () => {
    const importCalls = () =>
      (axios.post as jest.Mock).mock.calls.filter((c: unknown[]) =>
        String(c[0]).includes('/api/users/csv_import'),
      );
    const uploadCalls = () =>
      (axios.post as jest.Mock).mock.calls.filter((c: unknown[]) =>
        String(c[0]).includes('/api/attachments'),
      );

    it('exports every row on the first run, because nothing has been sent yet', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002' }),
      ];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(latestCsv()).toHaveLength(2);
      expect(importCalls()).toHaveLength(1);
    });

    // THE REGRESSION TEST for the reported defect.
    it('sends nothing at all on a second run when nothing changed', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002' }),
      ];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      jest.clearAllMocks();
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(uploadCalls()).toHaveLength(0);
      expect(importCalls()).toHaveLength(0);
    });

    // The hash write happens after a confirmed import, but inside the upload
    // retry loop. If it were allowed to throw, the loop would treat it as an
    // upload failure and send the very same CSV to BioStar again — a database
    // hiccup causing an extra overwrite import, which is the exact thing this
    // whole change exists to stop. Failing to record the hash must instead
    // just mean the row goes out again next run.
    it('does not re-import when recording the hash fails', async () => {
      const realUpdate = studentRepo.update.bind(studentRepo);
      jest
        .spyOn(studentRepo, 'update')
        .mockImplementation(async (where, patch) => {
          if ('biostar_row_hash' in patch) throw new Error('DB write failed');
          return realUpdate(where, patch);
        });

      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      expect(importCalls()).toHaveLength(1);
      expect(uploadCalls()).toHaveLength(1);
      // The row keeps no hash, so it is simply exported again next run.
      expect(studentRepo.byId('12100001').biostar_row_hash).toBeUndefined();
      // Real backoff inside executeWithRetry, so this genuinely takes seconds.
    }, 20000);

    // When BioStar reports a partial import but gives no row detail, nothing
    // identifies what was accepted, so the whole batch goes again: one
    // redundant export, versus permanently dropping a row it rejected.
    it('re-exports the whole batch when BioStar gives no row detail', async () => {
      (axios.post as jest.Mock).mockImplementation(async (url: string) => {
        if (url.includes('/api/attachments')) {
          return { data: { filename: 'fake-upload.csv' } };
        }
        if (url.includes('/api/users/csv_import')) {
          return { data: { Response: { code: '1' } } };
        }
        return { data: {} };
      });
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002' }),
      ];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      expect(studentRepo.byId('12100001').biostar_row_hash).toBeUndefined();

      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(
        latestCsv()
          .map((r) => r.user_id)
          .sort(),
      ).toEqual(['12100001', '12100002']);
    });

    // THE ONE THAT WOULD HURT MOST. If the source view returns nothing — a
    // broken view, a permissions change, a bad deploy on the DLSU side — the
    // reconciliation must NOT read that as "everyone has left" and archive the
    // whole roster. Archiving everybody denies every person at every gate.
    it('archives nobody when the source view comes back empty', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      expect(studentRepo.byId('12100001').isArchived).toBe(false);

      sourceRows = [];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(studentRepo.byId('12100001').isArchived).toBe(false);
      expect(uploadCalls()).toHaveLength(1); // run-1 only; nothing new to send
    });

    // Every remaining person is archived, so there is no data row to send.
    // csv-writer still emits the header, so the file is never zero-length and
    // the size check cannot catch this — only the explicit guard can. A
    // header-only file imported under overwrite is not a harmless no-op.
    it('uploads nothing when every row is archived', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      jest.clearAllMocks();
      sourceRows = [sourceRow({ IsArchived: true })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(uploadCalls()).toHaveLength(0);
      expect(importCalls()).toHaveLength(0);
    });

    // The attachment call can answer 200 with no filename, and the import
    // needs that name. It must retry rather than post an import naming
    // undefined, and must give up rather than loop.
    it('never imports when the attachment upload returns no filename', async () => {
      (axios.post as jest.Mock).mockImplementation(async (url: string) => {
        if (url.includes('/api/attachments')) return { data: {} };
        return { data: {} };
      });
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(importCalls()).toHaveLength(0);
      expect(uploadCalls()).toHaveLength(3); // three attempts, then gives up
      // No hash recorded, so the row is retried on the next run.
      expect(studentRepo.byId('12100001').biostar_row_hash).toBeUndefined();
    }, 30000);

    /**
     * A duplicate ID in the source must not re-export forever.
     *
     * Two source rows sharing one ID render two different CSV lines under the
     * same `user_id`, but only ONE hash can be stored against the one student
     * row. Whichever variant loses that race mismatches on every subsequent
     * run, so that person is re-imported — and re-transferred to every device —
     * on every single sync, permanently.
     *
     * Seen live on 2026-09-10: with everything else quiet, run C still emitted
     * exactly one row, and it was the duplicated id.
     *
     * The last occurrence wins, which is the same one the PostgreSQL upsert
     * keeps, so the CSV and the roster agree on which variant is canonical.
     */
    it('exports a duplicated source id once, and stops re-exporting it', async () => {
      sourceRows = [
        sourceRow({ LastName: 'Juliet', FirstName: 'Eleven' }),
        sourceRow({ LastName: 'Juliet', FirstName: 'Eleven-Dup' }),
      ];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      expect(latestCsv()).toHaveLength(1);
      expect(latestCsv()[0].name).toBe('Juliet ElevenDup');

      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      // Nothing changed upstream, so the second run must send nothing at all.
      expect(importCalls()).toHaveLength(1);
    });

    it('exports only the row that changed', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002' }),
      ];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002', LastName: 'Reyes' }),
      ];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(latestCsv().map((r) => r.user_id)).toEqual(['12100002']);
    });

    // A deactivated person's window used to be re-derived from dayjs() every
    // run, so their row changed daily even though the person did not — which
    // would defeat the hash and re-export the whole disabled population every
    // single day.
    it('exports a stable window for someone who stays deactivated', async () => {
      sourceRows = [sourceRow({ Status: false })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      const dayOne = csvRowFor('12100001', 0);

      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(importCalls()).toHaveLength(1); // run-1 only
      expect(dayOne.expiry_datetime).toBeTruthy();
    });

    // Self-healing: a batch BioStar never accepted must not be recorded as
    // sent, or the row would be silently skipped forever.
    it('re-exports a row whose import failed', async () => {
      (axios.post as jest.Mock).mockImplementation(async (url: string) => {
        if (url.includes('/api/attachments')) {
          return { data: { filename: 'fake-upload.csv' } };
        }
        if (url.includes('/api/users/csv_import')) {
          return { data: { Response: { code: '8' } } };
        }
        return { data: {} };
      });
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      // BioStar recovers; the same unchanged row must still go out.
      (axios.post as jest.Mock).mockImplementation(async (url: string) => {
        if (url.includes('/api/attachments')) {
          return { data: { filename: 'fake-upload.csv' } };
        }
        if (url.includes('/api/users/csv_import')) {
          return { data: { Response: { code: '0' } } };
        }
        return { data: {} };
      });
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(latestCsv().map((r) => r.user_id)).toEqual(['12100001']);
    });
  });

  // =====================================================================
  // BioStar load at scale — measured on the 2026-09-23 stress run
  // =====================================================================
  describe('BioStar load at scale', () => {
    const diag = () =>
      (fsMock.writeFileSync as jest.Mock).mock.calls
        .filter(([p]) => String(p).includes('diagnostics'))
        .map(([, body]) => JSON.parse(String(body)))
        .at(-1);
    const importCalls = () =>
      (axios.post as jest.Mock).mock.calls.filter(([url]) =>
        String(url).includes('/api/users/csv_import'),
      ).length;
    const withCardDirectory = (directory: Map<string, number> | null) =>
      Object.assign(biostarApi, {
        listUserCardCounts: jest.fn(async () => directory),
      });
    const importAnswers = (answer: () => Promise<unknown>) => {
      (axios.post as jest.Mock).mockImplementation(async (url: string) => {
        if (url.includes('/api/attachments')) {
          return { data: { filename: 'fake-upload.csv' } };
        }
        if (url.includes('/api/users/csv_import')) {
          return answer();
        }
        return { data: {} };
      });
    };
    const threeRows = () => [
      sourceRow({ ID: '12100001' }),
      sourceRow({ ID: '12100002' }),
      sourceRow({ ID: '12100003' }),
    ];

    it('error: stops sending imports for the run once BioStar answers "still importing"', async () => {
      CONFIG.BIOSTAR_IMPORT_MAX_ROWS = '1';
      sourceRows = threeRows();
      importAnswers(async () => ({
        data: { Response: { code: '4', task_id: '1470' } },
      }));
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(importCalls()).toBe(1);
      const d = diag();
      expect(d.csvImport).toHaveLength(1);
      expect(d.csvImport[0]).toMatchObject({
        outcome: 'timeout',
        taskId: '1470',
      });
      expect(d.csvExport.biostarUploadsHalted).toEqual({
        afterBatch: 1,
        taskId: '1470',
      });
      expect(d.csvExport.rowsDeferredAfterHalt).toBe(2);
      for (const id of ['12100001', '12100002', '12100003']) {
        expect(studentRepo.byId(id)?.biostar_row_hash ?? null).toBeNull();
      }
    });

    it('error: never re-sends an import whose request failed after it went out', async () => {
      sourceRows = threeRows();
      importAnswers(async () => {
        throw new Error('socket hang up');
      });
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(importCalls()).toBe(1);
      expect(diag().csvImport[0]).toMatchObject({ outcome: 'timeout' });
      expect(diag().csvExport.biostarUploadsHalted).toEqual({
        afterBatch: 1,
        taskId: null,
      });
    }, 30000);

    it('edge: asks BioStar per user when its user list cannot be read', async () => {
      withCardDirectory(null);
      sourceRows = [sourceRow({ ID: '12100001' })];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(biostarApi.fetchBiostarUserDetail).toHaveBeenCalledWith(
        '12100001',
        't0ken',
        's3ss10n',
        3,
        expect.anything(),
      );
      expect(diag().csvExport.csnApiLookups).toBe(1);
    });

    it('edge: looks up only a listed user whose card PostgreSQL does not hold', async () => {
      CONFIG.BIOSTAR_CARD_DIRECTORY_MIN_ROWS = '0';
      withCardDirectory(
        new Map([
          ['12100001', 1],
          ['12100002', 0],
        ]),
      );
      biostarDetails['12100001'] = {
        user_id: '12100001',
        cards: [{ card_id: '4242424242' }],
      };
      // Already swept, so the remark sweep cannot be mistaken for a lookup.
      for (const id of ['12100001', '12100002', '12100003']) {
        studentRepo.rows.push({
          ID_Number: id,
          Name: 'Santos, Juan',
          Campus_Entry: 'Y',
          isArchived: false,
          remarks_checked_at: new Date('2026-08-01T00:00:00+08:00'),
        } as Student);
      }
      sourceRows = threeRows();
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(
        (biostarApi.fetchBiostarUserDetail as jest.Mock).mock.calls.map(
          ([id]) => id,
        ),
      ).toEqual(['12100001']);
      expect(csvRowFor('12100001')?.csn).toBe('4242424242');
      expect(csvRowFor('12100002')?.csn).toBe('');
      expect(csvRowFor('12100003')?.csn).toBe('');
      expect(diag().csvExport.csnApiLookups).toBe(1);
    });

    it('regression: a roster BioStar does not hold yet costs no per-user request', async () => {
      CONFIG.BIOSTAR_CARD_DIRECTORY_MIN_ROWS = '0';
      withCardDirectory(new Map());
      sourceRows = threeRows();
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(biostarApi.fetchBiostarUserDetail).not.toHaveBeenCalled();
      expect(latestCsv().map((r) => r.csn)).toEqual(['', '', '']);
      expect(diag().csvExport.csnApiLookups).toBe(0);
    });

    it('regression: the remark sweep stamps a user BioStar does not hold without asking', async () => {
      CONFIG.BIOSTAR_CARD_DIRECTORY_MIN_ROWS = '0';
      withCardDirectory(new Map());
      sourceRows = [sourceRow({ ID: '12100001' })];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(studentRepo.byId('12100001')?.remarks_checked_at).toBeInstanceOf(
        Date,
      );
      expect(biostarApi.fetchBiostarUserDetail).not.toHaveBeenCalled();
      expect(diag().remarks.sweptThisRun).toBe(1);
    });

    it('regression: logs in for a card lookup only when a batch needs one', async () => {
      withCardDirectory(new Map());
      CONFIG.BIOSTAR_IMPORT_MAX_ROWS = '1';
      sourceRows = threeRows();
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      // One login for the whole push: uploads reuse it, card lookups too.
      expect(biostarApi.getApiToken).toHaveBeenCalledTimes(1);
    });

    it('happy: records how long each import took and the rows-per-import cap', async () => {
      sourceRows = [sourceRow({ ID: '12100001' })];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      const d = diag();
      expect(d.csvImport[0]).toMatchObject({
        outcome: 'success',
        taskId: null,
      });
      expect(Number.isInteger(d.csvImport[0].durationMs)).toBe(true);
      expect(d.csvExport.importMaxRows).toBe(100);
      expect(d.csvExport.biostarUploadsHalted).toBeNull();
    });
  });

  // =====================================================================
  // Fewer calls per sync — measured on the 2026-09-23 stress run
  // =====================================================================
  describe('Fewer calls per sync', () => {
    const queriesSeen: string[] = [];
    const poolAnswering = (lastWrite: string | null) => ({
      request: () => {
        const req = {
          input: () => req,
          query: jest.fn(async (text: string) => {
            queriesSeen.push(text);
            if (text.includes('dm_db_index_usage_stats')) {
              return { recordset: [{ lastWrite }] };
            }
            if (text.includes('sys.columns')) {
              return { recordset: [{ count: 1 }] };
            }
            const offset = Number(text.match(/OFFSET (\d+) ROWS/)?.[1] ?? 0);
            const size = Number(
              text.match(/FETCH NEXT (\d+) ROWS/)?.[1] ?? sourceRows.length,
            );
            return {
              recordset: sourceRows
                .slice(offset, offset + size)
                .map((row) => ({ ...row })),
            };
          }),
        };
        return req;
      },
      close: jest.fn(async () => undefined),
    });
    const sourceReads = () =>
      queriesSeen.filter((q) => q.includes('FROM dbo.FakeRoster')).length;
    const importCalls = () =>
      (axios.post as jest.Mock).mock.calls.filter(([url]) =>
        String(url).includes('/api/users/csv_import'),
      ).length;
    const diag = () =>
      (fsMock.writeFileSync as jest.Mock).mock.calls
        .filter(([p]) => String(p).includes('diagnostics'))
        .map(([, body]) => JSON.parse(String(body)))
        .at(-1);
    const cursor = () =>
      biostarState as BiostarSyncState & { sourceLastWrite?: string | null };
    const threeRows = () => [
      sourceRow({ ID: '12100001' }),
      sourceRow({ ID: '12100002' }),
      sourceRow({ ID: '12100003' }),
    ];
    const WRITE = '2026-09-23T14:01:25.497';

    beforeEach(() => {
      queriesSeen.length = 0;
    });

    it('error: reads the source when SQL Server cannot say when it was last written', async () => {
      (sql.connect as jest.Mock).mockResolvedValue(poolAnswering(null));
      sourceRows = [sourceRow({ ID: '12100001' })];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(sourceReads()).toBe(1);
      expect(latestCsv().map((r) => r.user_id)).toEqual(['12100001']);
    });

    it('edge: pushes while a remark clear is pending even if the source is unchanged', async () => {
      (sql.connect as jest.Mock).mockResolvedValue(poolAnswering(WRITE));
      cursor().sourceLastWrite = WRITE;
      studentRepo.rows.push({
        ID_Number: '12100009',
        Remarks: null,
        remarks_clear_pending: true,
        isArchived: false,
        Campus_Entry: 'Y',
      } as Student);
      sourceRows = [sourceRow({ ID: '12100001' })];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(sourceReads()).toBe(1);
    });

    it('regression: skips the push when the source was not written since the last clean sync', async () => {
      (sql.connect as jest.Mock).mockResolvedValue(poolAnswering(WRITE));
      sourceRows = [sourceRow({ ID: '12100001' })];
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      expect(cursor().sourceLastWrite).toBe(WRITE);

      queriesSeen.length = 0;
      const importsBefore = importCalls();
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(sourceReads()).toBe(0);
      expect(importCalls()).toBe(importsBefore);
      expect(diag().skippedUnchangedSource).toBe(true);
    });

    it('regression: forgets the source snapshot after a run that halted uploads', async () => {
      (sql.connect as jest.Mock).mockResolvedValue(poolAnswering(WRITE));
      cursor().sourceLastWrite = 'an older write';
      (axios.post as jest.Mock).mockImplementation(async (url: string) => {
        if (url.includes('/api/attachments')) {
          return { data: { filename: 'fake-upload.csv' } };
        }
        if (url.includes('/api/users/csv_import')) {
          return { data: { Response: { code: '4', task_id: '1470' } } };
        }
        return { data: {} };
      });
      sourceRows = [sourceRow({ ID: '12100001' })];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(cursor().sourceLastWrite ?? null).toBeNull();
    });

    it('regression: reads the whole source in one query, then imports it in pages', async () => {
      (sql.connect as jest.Mock).mockResolvedValue(poolAnswering(null));
      CONFIG.BIOSTAR_IMPORT_MAX_ROWS = '2';
      sourceRows = [
        ...threeRows(),
        sourceRow({ ID: '12100004' }),
        sourceRow({ ID: '12100005' }),
      ];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(sourceReads()).toBe(1);
      expect(importCalls()).toBe(3);
    });

    // Measured 2026-09-23 (L3): 100 changed rows scattered across the roster
    // went out as about 100 one-row imports, one per source page.
    it('regression: sends changes from different source pages together in one import', async () => {
      (sql.connect as jest.Mock).mockResolvedValue(poolAnswering(null));
      CONFIG.BIOSTAR_IMPORT_MAX_ROWS = '2';
      const roster = (firstName: string, lastFirstName: string) => [
        sourceRow({ ID: '12100001', FirstName: firstName }),
        sourceRow({ ID: '12100002' }),
        sourceRow({ ID: '12100003' }),
        sourceRow({ ID: '12100004' }),
        sourceRow({ ID: '12100005', FirstName: lastFirstName }),
      ];
      sourceRows = roster('Juan', 'Juan');
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      const importsBefore = importCalls();
      sourceRows = roster('Maria', 'Jose');
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(importCalls() - importsBefore).toBe(1);
      expect(latestCsv().map((r) => r.user_id)).toEqual([
        '12100001',
        '12100005',
      ]);
    });

    it('regression: orders the source by every column so a duplicated ID resolves the same way', async () => {
      (sql.connect as jest.Mock).mockResolvedValue(poolAnswering(null));
      sourceRows = [sourceRow({ ID: '12100001' })];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(
        queriesSeen.find((q) => q.includes('FROM dbo.FakeRoster')),
      ).toContain(
        'ORDER BY ID, LastName, FirstName, MiddleName, Suffix, [Group], Status, Remarks, IsArchived',
      );
    });

    it('regression: looks up a card only for a row that is about to be sent', async () => {
      (sql.connect as jest.Mock).mockResolvedValue(poolAnswering(null));
      sourceRows = threeRows();
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      (biostarApi.fetchBiostarUserDetail as jest.Mock).mockClear();
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002', FirstName: 'Maria' }),
        sourceRow({ ID: '12100003' }),
      ];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(
        (biostarApi.fetchBiostarUserDetail as jest.Mock).mock.calls.map(
          ([id]) => id,
        ),
      ).toEqual(['12100002']);
    });

    it('regression: logs in to BioStar once per push', async () => {
      (sql.connect as jest.Mock).mockResolvedValue(poolAnswering(null));
      CONFIG.BIOSTAR_IMPORT_MAX_ROWS = '1';
      sourceRows = threeRows();
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(biostarApi.getApiToken).toHaveBeenCalledTimes(1);
    });
  });

  // =====================================================================
  // The card must never be blanked, and must never be re-fetched forever
  // =====================================================================
  describe('CSN handling', () => {
    beforeEach(() => {});

    it('persists a CSN fetched from BioStar instead of re-fetching it', async () => {
      biostarDetails['12100001'] = {
        user_id: '12100001',
        cards: [{ card_id: '987654321' }],
      };
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      expect(studentRepo.byId('12100001').Unique_ID).toBe('987654321');

      (biostarApi.fetchBiostarUserDetailWithRetry as jest.Mock).mockClear();
      sourceRows = [sourceRow({ LastName: 'Changed' })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(biostarApi.fetchBiostarUserDetailWithRetry).not.toHaveBeenCalled();
      expect(csvRowFor('12100001').csn).toBe('987654321');
    });

    // BioStar could not be reached, so we do not know whether this person holds
    // a card. Under import_option 2 an empty cell is a candidate to blank one,
    // so the row is held back and BioStar keeps whatever it already has.
    it('omits the row when BioStar could not be reached', async () => {
      biostarUnreachable.add('12100001');
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(latestCsv()).toHaveLength(0);
    });

    /**
     * THE ENROLMENT DEADLOCK.
     *
     * A student who is in the source but not yet in BioStar is exactly who the
     * CSV exists to create. BioStar answers 400 for them — it has never heard
     * of them — and treating that like "could not be reached" held the row back,
     * so they could not be enrolled because they were not already enrolled.
     *
     * Observed live on 2026-09-10: of 14 freshly seeded students, 13 were
     * dropped this way and only the one pre-created in BioStar got through.
     * An empty `csn` cannot blank a card on a user who does not exist.
     */
    it('exports a brand-new student BioStar has never seen', async () => {
      // Not in biostarDetails and not unreachable => BioStar answers 400.
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(latestCsv()).toHaveLength(1);
      expect(csvRowFor('12100001').csn).toBe('');
    });

    it('names only the unreachable row as skipped, never a new student', async () => {
      biostarUnreachable.add('12100001');
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      const diag = (fsMock.writeFileSync as jest.Mock).mock.calls
        .filter(([path]) => String(path).includes('diagnostics'))
        .map(([, body]) => JSON.parse(String(body)))
        .at(-1);
      expect(diag.csvExport.csnUnresolvedRowsSkipped.ids).toEqual(['12100001']);
    });

    // BioStar answered, and the answer was "this person has no card". An empty
    // csn here can clear nothing, so the row goes out normally — unlike the
    // case where BioStar could not be reached at all.
    it('exports a row with an empty csn when BioStar says there is no card', async () => {
      biostarDetails['12100001'] = { user_id: '12100001' };
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(latestCsv()).toHaveLength(1);
      expect(csvRowFor('12100001').csn).toBe('');
    });

    /**
     * The lookup is unconditional now, so a student with no stored card always
     * causes exactly one BioStar call — never a blind blank cell. A blank cell
     * destroys a card: measured on 2026-09-10, one import with an empty `csn`
     * took a live user from `card_count: 1` to `card_count: 0`.
     */
    it('always asks BioStar when PostgreSQL has no card stored', async () => {
      biostarDetails['12100001'] = {
        user_id: '12100001',
        cards: [{ card_id: '4242424242' }],
      };
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(biostarApi.fetchBiostarUserDetail).toHaveBeenCalledWith(
        '12100001',
        't0ken',
        's3ss10n',
        3,
        expect.anything(),
      );
      expect(csvRowFor('12100001').csn).toBe('4242424242');
    });

    it('exports the stored card without calling BioStar at all', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      await studentRepo.update(
        { ID_Number: '12100001' },
        {
          Unique_ID: '1234567890',
          // Marked already reconciled so the remark sweep — a different caller
          // of the same BioStar method — cannot be mistaken for a CSN lookup.
          remarks_checked_at: new Date('2026-08-26T08:00:00+08:00'),
        },
      );

      (biostarApi.fetchBiostarUserDetailWithRetry as jest.Mock).mockClear();
      sourceRows = [sourceRow({ LastName: 'Changed' })];
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(biostarApi.fetchBiostarUserDetailWithRetry).not.toHaveBeenCalled();
      expect(csvRowFor('12100001').csn).toBe('1234567890');
    });
  });

  // =====================================================================
  // Source-data shapes that only show up in the wild
  // =====================================================================
  describe('awkward source data', () => {
    // A duplicate ID within one batch is covered in the e2e suite instead: the
    // fallback it exercises is triggered by PostgreSQL's UNIQUE constraint on
    // ID_Number, which this in-memory fake does not enforce. Asserting it here
    // would only be testing the fake.

    it('maps the three known groups and leaves anything else ungrouped', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001', Group: 'EMPLOYEE' }),
        sourceRow({ ID: '12100002', Group: 'faculty' }),
        sourceRow({ ID: '12100003', Group: null }),
      ];
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      // user_title is the raw source value, or 'Student' when absent.
      expect(csvRowFor('12100001').user_title).toBe('EMPLOYEE');
      expect(csvRowFor('12100002').user_title).toBe('faculty');
      expect(csvRowFor('12100003').user_title).toBe('Student');

      // The stored enum only accepts the three known values.
      expect(studentRepo.byId('12100001').group).toBe('EMPLOYEE');
      expect(studentRepo.byId('12100002').group).toBeNull();
      expect(studentRepo.byId('12100003').group).toBeNull();
    });

    // Manila is UTC+8, so 15:59Z and 16:01Z fall on different Manila days.
    // A stored window must not shift just because a run straddles midnight
    // there — that was the original drifting-expiry bug in miniature.
    it('does not move a stored window across Manila midnight', async () => {
      setClock('2026-08-26T15:59:00Z'); // 23:59 Manila
      await service.executeDatabaseSync('run-1');
      const before = csvRowFor('12100001', 0);

      setClock('2026-08-26T16:01:00Z'); // 00:01 Manila, the next day
      sourceRows = [sourceRow({ LastName: 'Reyes' })];
      await service.executeDatabaseSync('run-2');
      const after = csvRowFor('12100001', 1);

      expect(after.start_datetime).toBe(before.start_datetime);
      expect(after.expiry_datetime).toBe(before.expiry_datetime);
    });
  });

  // =====================================================================
  // Draining the pre-fix remark backlog
  //
  // Remarks removed before clearing existed were blanked in PostgreSQL without
  // BioStar ever being told. That removal cannot recur, so nothing would ever
  // revisit those rows. The BioStar pull reconciles the ones it visits for
  // free; this sweep picks up the remainder — and stops once it has.
  // =====================================================================
  describe('remark backlog sweep', () => {
    const detailWithRemark = (userId: string, remark: string | null) => ({
      User: {
        user_id: userId,
        user_custom_fields: [
          { custom_field: { name: 'Remarks' }, item: remark },
        ],
      },
    });

    it('flags a stale remark on a student nobody has checked', async () => {
      biostarDetails['12100001'] = detailWithRemark(
        '12100001',
        'Owes library fee',
      );
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(biostarApi.clearUserCustomField).toHaveBeenCalledWith(
        '12100001',
        'Remarks',
        expect.any(String),
        expect.any(String),
      );
    });

    it('stamps the row so it is never swept twice', async () => {
      biostarDetails['12100001'] = detailWithRemark('12100001', null);
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');

      expect(studentRepo.byId('12100001').remarks_checked_at).toEqual(
        new Date('2026-08-26T08:00:00+08:00'),
      );

      // Second run: already stamped, so the sweep must not look again.
      (biostarApi.fetchBiostarUserDetailWithRetry as jest.Mock).mockClear();
      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(biostarApi.fetchBiostarUserDetailWithRetry).not.toHaveBeenCalled();
    });

    /**
     * The sweep is meant to drain and stop. It selects only rows with no
     * `remarks_checked_at`, so once everyone has been looked at it selects
     * nothing — unless a row can never be stamped, in which case it is
     * re-checked on every run forever.
     *
     * BioStar answers 400 for a user it does not have. That IS an answer:
     * there is no remark over there to clear, so the row is done. Observed
     * live 2026-09-10, where `remarks_checked_at IS NULL` climbed from 2 rows
     * to 18 across a single campaign because nothing ever stamped them.
     */
    it('stamps a row BioStar has never heard of, so the sweep drains', async () => {
      studentRepo.rows.push({
        ID_Number: '99999999',
        Name: 'Unknown To Biostar',
        Campus_Entry: 'Y',
        isArchived: false,
        Remarks: null,
        remarks_checked_at: null,
      } as Student);
      // Not in biostarDetails and not unreachable => a definitive 400.
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(studentRepo.byId('99999999').remarks_checked_at).toEqual(
        new Date('2026-08-26T08:00:00+08:00'),
      );
    });

    it('leaves a row unstamped when BioStar could not be reached', async () => {
      // Unreachable, not "no such user" — the answer is unknown, so the row
      // must come back around rather than be written off as checked.
      biostarUnreachable.add('12100001');
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      // No stamp means it is retried rather than written off as checked.
      expect(studentRepo.byId('12100001').remarks_checked_at).toBeUndefined();
    });

    // A repair job must never be able to fail a roster sync.
    it('completes the sync even when the sweep itself blows up', async () => {
      const realFind = studentRepo.find.bind(studentRepo);
      jest
        .spyOn(studentRepo, 'find')
        .mockImplementation(async (options: Record<string, any> = {}) => {
          // Only the sweep queries by remarks_checked_at; fail just that one
          // so the rest of the sync runs exactly as it normally would.
          if (options?.where && 'remarks_checked_at' in options.where) {
            throw new Error('sweep query exploded');
          }
          return realFind(options);
        });
      setClock('2026-08-26T08:00:00+08:00');

      await expect(service.executeDatabaseSync('run-1')).resolves.toBeDefined();

      // The roster still landed, and BioStar still got its CSV.
      expect(studentRepo.byId('12100001')).toBeDefined();
      expect(latestCsv().map((r) => r.user_id)).toEqual(['12100001']);
    });

    it('does not flag a remark that PostgreSQL still holds', async () => {
      sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
      biostarDetails['12100001'] = detailWithRemark(
        '12100001',
        'Owes library fee',
      );
      setClock('2026-08-26T08:00:00+08:00');

      await service.executeDatabaseSync('run-1');

      expect(biostarApi.clearUserCustomField).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  // Photo and Lived_Name must survive a source sync
  //
  // The Dasma source view has no photo column and no lived-name column —
  // documented in the legacy `.env.example` schema block, and stated in
  // commit 3f27b9a: "Set Photo, Unique_ID, Lived_Name to null for new schema
  // (not available)". `normalizeRecord` therefore hands both fields down as
  // null on every row.
  //
  // "Not available from the source" must mean "leave whatever is stored
  // alone", never "overwrite the stored value with null". `Unique_ID` already
  // gets that treatment; `Photo` and `Lived_Name` did not, so every source
  // sync destroyed the photo the BioStar sync had just fetched.
  // =====================================================================
  describe('photo and lived name preservation', () => {
    /** Stands in for what syncFromBiostar writes after pulling user detail. */
    const seedBiostarSuppliedFields = (idNumber: string) =>
      studentRepo.update(
        { ID_Number: idNumber },
        {
          Photo: '/9j/4AAQSkZJRgABAQAAAQ',
          Lived_Name: 'Johnny',
          Unique_ID: '1234567890',
        },
      );

    it('keeps a photo that BioStar supplied when the source syncs again', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      await seedBiostarSuppliedFields('12100001');

      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(studentRepo.byId('12100001').Photo).toBe('/9j/4AAQSkZJRgABAQAAAQ');
    });

    it('keeps a BioStar-supplied lived name when the source syncs again', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      await seedBiostarSuppliedFields('12100001');

      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(studentRepo.byId('12100001').Lived_Name).toBe('Johnny');
    });

    // Regression guard for the asymmetry that caused this: Unique_ID was
    // guarded, Photo was not. Both must now behave identically.
    it('keeps the card, exactly as it always did', async () => {
      setClock('2026-08-26T08:00:00+08:00');
      await service.executeDatabaseSync('run-1');
      await seedBiostarSuppliedFields('12100001');

      setClock('2026-08-27T08:00:00+08:00');
      await service.executeDatabaseSync('run-2');

      expect(studentRepo.byId('12100001').Unique_ID).toBe('1234567890');
    });
  });
});
