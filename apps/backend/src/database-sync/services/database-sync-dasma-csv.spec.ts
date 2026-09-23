import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as os from 'os';
import * as realPath from 'path';
import * as sql from 'mssql';
import axios from 'axios';
import { createObjectCsvWriter, createObjectCsvStringifier } from 'csv-writer';

import { DatabaseSyncDasmaPathService } from './database-sync-dasma-path.service';
import { DatabaseSyncCommonService } from './shared/database-sync-common.service';
import { BiostarApiService } from './shared/biostar-api.service';
import { Student } from '../../students/entities/student.entity';
import { SyncSchedule } from '../entities/sync-schedule.entity';
import { BiostarSyncState } from '../entities/biostar-sync-state.entity';

jest.mock('mssql');
jest.mock('axios');
jest.mock('csv-writer', () => {
  const actual = jest.requireActual('csv-writer');
  return { ...actual, createObjectCsvWriter: jest.fn() };
});
jest.mock('form-data', () =>
  jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    getHeaders: jest.fn(() => ({ 'content-type': 'multipart/form-data' })),
  })),
);

/** Filled by the csv-writer mock with the real rendered text, per file. */
const csvText = new Map<string, string>();

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    constants: actual.constants,
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    // Hands back the REAL header line rendered for this file, so the column
    // list in the csv_import payload is derived from actual bytes rather than
    // from a hardcoded string that could drift away from the writer.
    readFileSync: jest.fn((p: string) => {
      const text = csvText.get(String(p));
      return text ? text.split('\n')[0] + '\n' : '';
    }),
    createReadStream: jest.fn(() => ({ pipe: jest.fn() })),
    promises: {
      ...actual.promises,
      access: jest.fn(async () => undefined),
      stat: jest.fn(async () => ({ size: 1024 })),
    },
  };
});

/**
 * What BioStar actually receives, asserted on the bytes.
 *
 * The main Dasma spec checks the CSV as objects handed to csv-writer, which
 * cannot see quoting, the rendered column order, or how an empty cell is
 * written. Those are exactly what a remote CSV parser cares about, and there is
 * no real BioStar here to try them against — so they are pinned by driving the
 * REAL csv-writer stringifier and comparing whole lines.
 *
 * Also carries the volume proof: how many overwrite imports a full roster costs
 * on a second run when nothing changed. That number is the entire reason for
 * the changed-only export, since every imported row marks a user modified in
 * BioStar and gets them re-transferred to every connected device.
 */
describe('Dasma CSV — rendered bytes and volume', () => {
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
    Status: true,
    Remarks: null,
    IsArchived: false,
    ...over,
  });

  const unwrapIn = (operand: unknown): string[] =>
    operand && typeof operand === 'object' && '_value' in operand
      ? (operand as { _value: string[] })._value
      : [operand as string];

  /**
   * Indexed by ID_Number. The linear scan the main spec's fake uses is fine for
   * a handful of rows but turns the 20k volume test into minutes of comparing.
   */
  class IndexedStudentRepository {
    rows: Student[] = [];
    private byIdIndex = new Map<string, Student>();

    private matches(where: Record<string, unknown>, row: Student): boolean {
      return Object.entries(where).every(([key, operand]) => {
        const actual = (row as unknown as Record<string, unknown>)[key];
        if (operand && typeof operand === 'object' && '_type' in operand) {
          const kind = (operand as { _type: string })._type;
          if (kind === 'isNull') return actual === null || actual === undefined;
          if (kind === 'in')
            return unwrapIn(operand).includes(actual as string);
          throw new Error(`unsupported operator ${kind}`);
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
      let matched: Student[];
      const where = options.where;
      // The sync's hot path is `where: { ID_Number: In([...]) }`; serve that
      // from the index rather than scanning every row.
      if (where && Object.keys(where).length === 1 && where.ID_Number) {
        matched = unwrapIn(where.ID_Number)
          .map((id) => this.byIdIndex.get(id))
          .filter((r): r is Student => !!r);
      } else if (where) {
        matched = this.rows.filter((r) => this.matches(where, r));
      } else {
        matched = [...this.rows];
      }
      return options.take ? matched.slice(0, options.take) : matched;
    }

    async findOne(options: { where: Record<string, unknown> }) {
      const where = options.where;
      if (
        Object.keys(where).length === 1 &&
        typeof where.ID_Number === 'string'
      ) {
        return this.byIdIndex.get(where.ID_Number) ?? null;
      }
      return this.rows.find((r) => this.matches(where, r)) ?? null;
    }

    async insert(rows: Partial<Student>[]) {
      for (const r of rows) {
        const row = { ...r } as Student;
        this.rows.push(row);
        this.byIdIndex.set(row.ID_Number, row);
      }
      return { identifiers: [] };
    }

    async save(row: Partial<Student>) {
      const stored = { ...row } as Student;
      this.rows.push(stored);
      this.byIdIndex.set(stored.ID_Number, stored);
      return row;
    }

    async update(where: Record<string, unknown>, patch: Partial<Student>) {
      let affected = 0;
      // Mutated in place so the index keeps pointing at live objects.
      const targets =
        Object.keys(where).length === 1 && where.ID_Number
          ? unwrapIn(where.ID_Number)
              .map((id) => this.byIdIndex.get(id))
              .filter((r): r is Student => !!r)
          : this.rows.filter((r) => this.matches(where, r));
      for (const row of targets) {
        Object.assign(row, patch);
        affected++;
      }
      return { affected };
    }

    byId(id: string): Student | undefined {
      return this.byIdIndex.get(id);
    }
  }

  let service: DatabaseSyncDasmaPathService;
  let studentRepo: IndexedStudentRepository;
  let sourceRows: SourceRow[];
  let CONFIG: Record<string, string>;
  let importCallCount: number;
  let uploadCallCount: number;
  /** Data rows rendered per CSV file, in write order. */
  let rowCountsPerCsv: number[];
  let common: DatabaseSyncCommonService;

  const latestCsvText = () => Array.from(csvText.values()).pop() ?? '';
  const latestLines = () => latestCsvText().split('\n');
  const totalRowsWritten = () => rowCountsPerCsv.reduce((a, b) => a + b, 0);

  beforeEach(async () => {
    jest.clearAllMocks();
    csvText.clear();
    importCallCount = 0;
    uploadCallCount = 0;
    rowCountsPerCsv = [];
    sourceRows = [sourceRow()];

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
    jest.setSystemTime(new Date('2026-08-26T08:00:00+08:00'));

    CONFIG = {
      SOURCE_DB_USERNAME: 'fake',
      SOURCE_DB_PASSWORD: 'fake',
      SOURCE_DB_NAME: 'fake',
      SOURCE_DB_HOST: 'localhost',
      SOURCE_DB_PORT: '1433',
      SOURCE_DB_TABLE: 'dbo.FakeRoster',
      BIOSTAR_DETAIL_CONCURRENCY: '4',
    };

    studentRepo = new IndexedStudentRepository();

    const fakePool = {
      request: () => ({
        query: jest.fn(async (text: string) => {
          if (text.includes('sys.columns'))
            return { recordset: [{ count: 1 }] };
          // Page by exactly what the service asked for, as a real server would.
          const size = Number(
            text.match(/FETCH NEXT (\d+) ROWS/)?.[1] ?? sourceRows.length,
          );
          const offset = Number(text.match(/OFFSET (\d+) ROWS/)?.[1] ?? 0);
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

    (axios.post as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/api/attachments')) {
        uploadCallCount++;
        return { data: { filename: 'fake-upload.csv' } };
      }
      if (url.includes('/api/users/csv_import')) {
        importCallCount++;
        return { data: { Response: { code: '0' } } };
      }
      return { data: {} };
    });
    (axios.get as jest.Mock).mockResolvedValue({ data: {} });
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn(() => false);

    // The real stringifier, so what we assert on is the actual file content.
    (createObjectCsvWriter as jest.Mock).mockImplementation(
      ({
        path: p,
        header,
      }: {
        path: string;
        header: { id: string; title: string }[];
      }) => {
        const stringifier = createObjectCsvStringifier({ header });
        return {
          writeRecords: async (records: Record<string, string>[]) => {
            rowCountsPerCsv.push(records.length);
            csvText.set(
              p,
              stringifier.getHeaderString() +
                stringifier.stringifyRecords(records),
            );
          },
        };
      },
    );

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
          useValue: { findOne: jest.fn(async () => null), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(BiostarSyncState),
          useValue: {
            findOne: jest.fn(async () => null),
            create: jest.fn((d: unknown) => d),
            save: jest.fn(async (d: unknown) => d),
            update: jest.fn(async () => undefined),
          },
        },
        {
          provide: BiostarApiService,
          useValue: {
            getApiToken: jest
              .fn()
              .mockResolvedValue({ token: 't0ken', sessionId: 's3ss10n' }),
            getApiBaseUrl: jest.fn().mockReturnValue('https://biostar.fake'),
            fetchBiostarUserDetailWithRetry: jest.fn(async () => null),
            // BioStar answers definitively that it has never seen these users,
            // which is the ordinary case for a roster of people not yet
            // enrolled: an empty `csn` for them can clear nothing.
            fetchBiostarUserDetail: jest.fn(async () => ({
              detail: null,
              status: 400,
              definitive: true,
            })),
            clearUserCustomField: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get(DatabaseSyncDasmaPathService);
    common = module.get(DatabaseSyncCommonService);
    jest.spyOn(common, 'logSyncedRecords').mockResolvedValue(undefined);
    jest.spyOn(common, 'cleanupTempFiles').mockResolvedValue(undefined);
    jest.spyOn(common, 'writeSyncDiagnostics').mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete process.env.SYNC_BATCH_SIZE;
  });

  // ------------------------------------------------------------------
  // The stringifier really does produce the file
  // ------------------------------------------------------------------
  // Guards the assumption every other test here rests on: that driving
  // createObjectCsvStringifier is byte-for-byte what createObjectCsvWriter
  // would have written to disk.
  it('renders identical bytes to what the real writer puts on disk', async () => {
    const header = [
      { id: 'a', title: 'a' },
      { id: 'b', title: 'B' },
    ];
    const records = [{ a: 'plain', b: 'has,comma' }];

    // jest.mock('fs') intercepts this file's imports too, so reach for the
    // real module explicitly — otherwise readFileSync returns the stub.
    const realFs = jest.requireActual('fs');
    const dir = realFs.mkdtempSync(realPath.join(os.tmpdir(), 'dasma-csv-'));
    const file = realPath.join(dir, 'out.csv');
    try {
      const actualCsv = jest.requireActual('csv-writer');
      await actualCsv
        .createObjectCsvWriter({ path: file, header })
        .writeRecords(records);
      const onDisk = realFs.readFileSync(file, 'utf8');

      const s = createObjectCsvStringifier({ header });
      expect(s.getHeaderString() + s.stringifyRecords(records)).toBe(onDisk);
    } finally {
      realFs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ------------------------------------------------------------------
  // Header and a plain row
  // ------------------------------------------------------------------
  it('writes the ten columns in the documented order', async () => {
    await service.executeDatabaseSync('run-1');

    expect(latestLines()[0]).toBe(
      'user_id,name,department,user_title,user_group,Remarks,csn,start_datetime,expiry_datetime,original_campus_entry',
    );
  });

  it('writes an active student as one fully-specified line', async () => {
    await service.executeDatabaseSync('run-1');

    expect(latestLines()[1]).toBe(
      '12100001,Dela Cruz Juan,DLSU,STUDENT,All Users,,,2026-08-25 00:00:00.000,2036-08-26 00:00:00.000,Y',
    );
  });

  it('ends with a trailing newline and uses no CRLF or BOM', async () => {
    await service.executeDatabaseSync('run-1');

    const text = latestCsvText();
    expect(text.endsWith('\n')).toBe(true);
    expect(text).not.toMatch(/\r/);
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
  });

  // ------------------------------------------------------------------
  // Empty cells — the shape a cleared remark takes on the wire
  // ------------------------------------------------------------------
  it('writes a cleared remark as an empty cell, not a quoted empty string', async () => {
    sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
    await service.executeDatabaseSync('run-1');
    expect(latestLines()[1]).toContain(',Owes library fee,');

    sourceRows = [sourceRow({ Remarks: null })];
    jest.setSystemTime(new Date('2026-08-27T08:00:00+08:00'));
    await service.executeDatabaseSync('run-2');

    // Two adjacent commas — Remarks then csn, both empty. NOT `,"",`.
    expect(latestLines()[1]).toContain('All Users,,,2026-08-25');
  });

  // ------------------------------------------------------------------
  // Quoting — RFC 4180. Only remarks can carry these characters; names are
  // stripped of everything non-alphanumeric before reaching the CSV.
  // ------------------------------------------------------------------
  it('quotes a remark containing a comma', async () => {
    sourceRows = [sourceRow({ Remarks: 'Lost ID, replaced' })];
    await service.executeDatabaseSync('run-1');

    expect(latestLines()[1]).toContain(',"Lost ID, replaced",');
  });

  it('doubles the quotes in a remark containing a quote', async () => {
    sourceRows = [sourceRow({ Remarks: 'He said "hi"' })];
    await service.executeDatabaseSync('run-1');

    expect(latestLines()[1]).toContain(',"He said ""hi""",');
  });

  /**
   * It is no longer unknown whether BioStar's parser accepts a quoted embedded
   * newline: on 2026-09-10 a live import rejected exactly that row with
   * `User ID Type Mismatch.` — it read the continuation line as a new record
   * whose first field was the tail of the remark. Our writer was correct;
   * BioStar simply is not RFC-4180 for this case.
   *
   * So a newline is flattened to a space before the cell is written. The remark
   * keeps its words, the record keeps its single physical line, and the row
   * imports instead of being silently dropped from the batch.
   */
  it('flattens a newline in a remark so the record stays on one line', async () => {
    sourceRows = [sourceRow({ Remarks: 'line1\nline2' })];
    await service.executeDatabaseSync('run-1');

    const text = latestCsvText();
    expect(text).toContain('line1 line2');
    expect(text).not.toContain('\n"');
    expect(text.split('\n')).toHaveLength(3); // header + 1 record + trailing
  });

  it('flattens a Windows line ending in a remark too', async () => {
    sourceRows = [sourceRow({ Remarks: 'line1\r\nline2' })];
    await service.executeDatabaseSync('run-1');

    expect(latestCsvText()).toContain('line1 line2');
    // header + the one record + the trailing newline's empty tail
    expect(latestLines()).toHaveLength(3);
  });

  it('still quotes a remark that only contains a comma', async () => {
    sourceRows = [sourceRow({ Remarks: 'late, again' })];
    await service.executeDatabaseSync('run-1');

    expect(latestCsvText()).toContain('"late, again"');
  });

  it('strips punctuation from names, so a name never needs quoting', async () => {
    sourceRows = [sourceRow({ LastName: "O'Brien-Smith", FirstName: 'Pena' })];
    await service.executeDatabaseSync('run-1');

    expect(latestLines()[1]).toContain('OBrienSmith Pena');
    expect(latestLines()[1]).not.toContain('"');
  });

  // The DLSU source view does not send SQL NULL for an absent middle name or
  // suffix — it sends the four-character TEXT "NULL". The assembler gated on
  // truthiness, and a non-empty string is truthy, so the word travelled all the
  // way to the gate: a live export on 2026-09-21 carried
  // "DELA CRUZ MARIA RACHEL NULL NULL" as a student's name.
  it('drops a middle name and suffix the source sent as the word NULL', async () => {
    sourceRows = [
      sourceRow({
        LastName: 'Dela Cruz',
        FirstName: 'Maria Rachel',
        MiddleName: 'NULL',
        Suffix: 'NULL',
      }),
    ];
    await service.executeDatabaseSync('run-1');

    expect(latestLines()[1]).toContain('Dela Cruz Maria Rachel');
    expect(latestLines()[1]).not.toContain('NULL');
  });

  it('keeps a middle name and suffix the source actually sent', async () => {
    sourceRows = [
      sourceRow({
        LastName: 'Dela Cruz',
        FirstName: 'Juan',
        MiddleName: 'Santos',
        Suffix: 'Jr',
      }),
    ];
    await service.executeDatabaseSync('run-1');

    expect(latestLines()[1]).toContain('Dela Cruz Juan Santos Jr');
  });

  // The guard matches a whole part, never a substring, so a real surname that
  // merely contains those letters is untouched.
  it('leaves a real name that merely contains the letters alone', async () => {
    sourceRows = [
      sourceRow({
        LastName: 'Nullova',
        FirstName: 'Ana',
        MiddleName: 'Nonesuch',
      }),
    ];
    await service.executeDatabaseSync('run-1');

    expect(latestLines()[1]).toContain('Nullova Ana Nonesuch');
  });

  // BioStar rejects a name over 48 characters, and a rejected row used to hold
  // its whole batch back from being recorded — measured live on 2026-09-23.
  it("cuts a name to BioStar's 48-character limit and reports it", async () => {
    sourceRows = [
      sourceRow({ LastName: 'L'.repeat(50), FirstName: 'F'.repeat(50) }),
    ];
    await service.executeDatabaseSync('run-1');

    expect(latestLines()[1].split(',')[1]).toBe('L'.repeat(48));
    const calls = (common.writeSyncDiagnostics as jest.Mock).mock.calls;
    const payload = calls[calls.length - 1][1];
    expect(payload.csvExport.nameTruncatedForBiostar.ids).toEqual(['12100001']);
  });

  // ------------------------------------------------------------------
  // Boundary
  // ------------------------------------------------------------------
  it('keeps leading zeros in a user_id', async () => {
    sourceRows = [sourceRow({ ID: '0012' })];
    await service.executeDatabaseSync('run-1');

    expect(latestLines()[1].startsWith('0012,')).toBe(true);
  });

  it('clamps a 29 February activation to 28 February ten years on', async () => {
    jest.setSystemTime(new Date('2028-02-29T08:00:00+08:00'));
    await service.executeDatabaseSync('run-1');

    expect(latestLines()[1]).toContain('2038-02-28 00:00:00.000');
  });

  it('exports a deactivated student with a window that already expired', async () => {
    sourceRows = [sourceRow({ Status: false })];
    await service.executeDatabaseSync('run-1');

    const cells = latestLines()[1].split(',');
    expect(new Date(cells[8]).getTime()).toBeLessThan(Date.now());
    expect(new Date(cells[7]).getTime()).toBeLessThan(
      new Date(cells[8]).getTime(),
    );
    expect(cells[9]).toBe('N');
  });

  // ------------------------------------------------------------------
  // The import payload is derived from the real header line
  // ------------------------------------------------------------------
  it('declares exactly the ten rendered columns to csv_import', async () => {
    await service.executeDatabaseSync('run-1');

    const importCall = (axios.post as jest.Mock).mock.calls.find((c) =>
      String(c[0]).includes('/api/users/csv_import'),
    );
    const payload = importCall[1];
    expect(payload.CsvOption.columns.total).toBe('10');
    expect(payload.CsvOption.import_option).toBe(2);
    expect(payload.CsvOption.start_line).toBe(2);
    expect(payload.Query.headers).toEqual(latestLines()[0].split(','));
  });

  // ------------------------------------------------------------------
  // Volume — the number this whole change exists for
  // ------------------------------------------------------------------
  describe('volume', () => {
    const ROSTER = 20000;

    const buildRoster = () =>
      Array.from({ length: ROSTER }, (_, i) =>
        sourceRow({ ID: String(12100000 + i) }),
      );

    it('edge: splits a large change into imports of BIOSTAR_IMPORT_MAX_ROWS rows', async () => {
      process.env.SYNC_BATCH_SIZE = '800';
      sourceRows = Array.from({ length: 250 }, (_, i) =>
        sourceRow({ ID: String(12100000 + i) }),
      );

      await service.executeDatabaseSync('run-1');

      // No cap configured: 100, the only size Suprema documents.
      expect(importCallCount).toBe(3);
      expect(rowCountsPerCsv).toEqual([100, 100, 50]);
    }, 120000);

    it('costs 25 overwrite imports on the first run and none on the second', async () => {
      process.env.SYNC_BATCH_SIZE = '800'; // the value the DASMA server runs
      CONFIG.BIOSTAR_IMPORT_MAX_ROWS = '800';
      sourceRows = buildRoster();

      await service.executeDatabaseSync('run-1');

      // 20,000 / 800 = 25 batches, each one attachment plus one import.
      expect(importCallCount).toBe(25);
      expect(uploadCallCount).toBe(25);
      expect(totalRowsWritten()).toBe(ROSTER);

      importCallCount = 0;
      uploadCallCount = 0;
      rowCountsPerCsv = [];
      jest.setSystemTime(new Date('2026-08-27T08:00:00+08:00'));

      await service.executeDatabaseSync('run-2');

      // Nothing changed upstream, so BioStar must hear nothing at all. Every
      // row sent would be marked modified and re-transferred to every
      // connected device — the mass re-enrollment DLSU reported.
      expect(importCallCount).toBe(0);
      expect(uploadCallCount).toBe(0);
      expect(totalRowsWritten()).toBe(0);
    }, 120000);

    it('sends only the handful that changed, not the batches they sit in', async () => {
      process.env.SYNC_BATCH_SIZE = '800';
      CONFIG.BIOSTAR_IMPORT_MAX_ROWS = '800';
      sourceRows = buildRoster();
      await service.executeDatabaseSync('run-1');

      // 30 people, clustered so they occupy three batches, not thirty.
      for (let i = 0; i < 30; i++) {
        const idx = [5, 900, 1700][i % 3] + Math.floor(i / 3);
        sourceRows[idx] = sourceRow({
          ID: String(12100000 + idx),
          LastName: `Changed${i}`,
        });
      }

      importCallCount = 0;
      rowCountsPerCsv = [];
      jest.setSystemTime(new Date('2026-08-27T08:00:00+08:00'));
      await service.executeDatabaseSync('run-2');

      expect(totalRowsWritten()).toBe(30);
      // The 30 changed rows travel together, whatever batches they sit in.
      expect(importCallCount).toBe(1);
    }, 120000);

    it('is unaffected by the batch size', async () => {
      process.env.SYNC_BATCH_SIZE = '500'; // the code default
      CONFIG.BIOSTAR_IMPORT_MAX_ROWS = '500';
      sourceRows = buildRoster();

      await service.executeDatabaseSync('run-1');
      expect(importCallCount).toBe(40); // 20,000 / 500

      importCallCount = 0;
      rowCountsPerCsv = [];
      jest.setSystemTime(new Date('2026-08-27T08:00:00+08:00'));
      await service.executeDatabaseSync('run-2');

      expect(importCallCount).toBe(0);
      expect(totalRowsWritten()).toBe(0);
    }, 120000);
  });
});
