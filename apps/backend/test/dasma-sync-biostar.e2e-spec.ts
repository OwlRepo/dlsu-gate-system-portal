import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as sql from 'mssql';

import { FakeBiostarServer } from './fake-biostar-server';
import { DatabaseSyncDasmaPathService } from '../src/database-sync/services/database-sync-dasma-path.service';
import { DatabaseSyncCommonService } from '../src/database-sync/services/shared/database-sync-common.service';
import { BiostarApiService } from '../src/database-sync/services/shared/biostar-api.service';
import { Student } from '../src/students/entities/student.entity';
import { SyncSchedule } from '../src/database-sync/entities/sync-schedule.entity';
import { BiostarSyncState } from '../src/database-sync/entities/biostar-sync-state.entity';

// ONLY the SQL Server driver is faked. axios, fs, csv-writer, form-data and
// TypeORM are all real — that is the entire point of this file.
jest.mock('mssql');

/** Minimal .env reader; jest does not load dotenv for us. */
const envFromFile = (): Record<string, string> => {
  const file = path.resolve(__dirname, '../../../.env');
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
};

/**
 * The Dasma sync against a real HTTP server, a real PostgreSQL database and
 * real file I/O.
 *
 * The unit specs mock axios, so nothing there ever forms a request; they prove
 * intent. This proves the wire: the multipart body `form-data` actually builds,
 * the bytes that actually reach BioStar, and the way PostgreSQL actually
 * returns a `bigint` column — as a string, not a number, which feeds both the
 * exported `csn` cell and the row hash.
 *
 * Runs against a SEPARATE database so it can never touch development data:
 *
 *   createdb -h localhost -p 5433 -U postgres dlsu_gate_system_e2e
 */
describe('Dasma sync — real HTTP, real PostgreSQL', () => {
  const env = { ...envFromFile(), ...process.env };

  let dataSource: DataSource;
  let service: DatabaseSyncDasmaPathService;
  let students: Repository<Student>;
  let biostar: FakeBiostarServer;
  let baseUrl: string;

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

  let sourceRows: SourceRow[];

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

  const CSV_HEADER =
    'user_id,name,department,user_title,user_group,Remarks,csn,start_datetime,expiry_datetime,original_campus_entry';

  /** Builds the service with a real repository set and a real BioStar client. */
  const makeService = async (
    overrides: Record<string, string> = {},
  ): Promise<DatabaseSyncDasmaPathService> => {
    const CONFIG: Record<string, string> = {
      SOURCE_DB_USERNAME: 'fake',
      SOURCE_DB_PASSWORD: 'fake',
      SOURCE_DB_NAME: 'fake',
      SOURCE_DB_HOST: 'localhost',
      SOURCE_DB_PORT: '1433',
      SOURCE_DB_TABLE: 'dbo.FakeRoster',
      BIOSTAR_API_BASE_URL: baseUrl,
      BIOSTAR_API_LOGIN_ID: 'fake',
      BIOSTAR_API_PASSWORD: 'fake',
      DASMA_CSV_FETCH_CARD_FROM_BIOSTAR: 'false',
      BIOSTAR_DETAIL_CONCURRENCY: '2',
      ...overrides,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseSyncDasmaPathService,
        DatabaseSyncCommonService,
        BiostarApiService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((k: string) => CONFIG[k]) },
        },
        {
          provide: getRepositoryToken(Student),
          useValue: dataSource.getRepository(Student),
        },
        {
          provide: getRepositoryToken(SyncSchedule),
          useValue: dataSource.getRepository(SyncSchedule),
        },
        {
          provide: getRepositoryToken(BiostarSyncState),
          useValue: dataSource.getRepository(BiostarSyncState),
        },
      ],
    }).compile();

    return module.get(DatabaseSyncDasmaPathService);
  };

  beforeAll(async () => {
    const connection = {
      type: 'postgres' as const,
      host: env.DB_HOST ?? 'localhost',
      port: Number(env.DB_PORT ?? 5433),
      username: env.DB_USERNAME ?? 'postgres',
      password: env.DB_PASSWORD ?? 'postgres',
      database: env.E2E_DB_NAME ?? 'dlsu_gate_system_e2e',
    };

    dataSource = new DataSource({
      ...connection,
      entities: [Student, SyncSchedule, BiostarSyncState],
      // Built by the MIGRATIONS, not by synchronize — including the uuid-ossp
      // extension, which EnableUuidOsspExtension1700000000000 installs before
      // anything needs it. Nothing is set up by hand here; a virgin database
      // is enough. The entity understates the
      // real schema — `ID_Number` carries a UNIQUE constraint that exists only
      // in the migration, and the duplicate-key fallback depends on it — so a
      // synchronize-built database would quietly differ from production and
      // some paths would be untestable. Running the migrations here also
      // proves they produce a schema this code actually works against.
      migrations: [path.resolve(__dirname, '../src/migrations/*.ts')],
      migrationsRun: true,
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    biostar = new FakeBiostarServer();
    baseUrl = await biostar.listen();
  }, 60000);

  afterAll(async () => {
    await biostar?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  beforeEach(async () => {
    biostar.reset();
    sourceRows = [sourceRow()];

    await dataSource.query('TRUNCATE TABLE students');
    await dataSource.query('TRUNCATE TABLE biostar_sync_state');

    // Real OFFSET/FETCH paging, fresh copies per query — the service truncates
    // the recordset it is handed in order to release memory.
    const fakePool = {
      request: () => ({
        query: jest.fn(async (text: string) => {
          if (text.includes('sys.columns'))
            return { recordset: [{ count: 1 }] };
          const size = Number(process.env.SYNC_BATCH_SIZE ?? '500');
          const offset = Number(text.match(/OFFSET (\d+) ROWS/)?.[1] ?? 0);
          return {
            recordset: sourceRows
              .slice(offset, offset + size)
              .map((r) => ({ ...r })),
          };
        }),
      }),
      close: jest.fn(async () => undefined),
    };
    (sql.connect as jest.Mock).mockResolvedValue(fakePool);

    students = dataSource.getRepository(Student);
    service = await makeService();
  }, 60000);

  const byId = (id: string) => students.findOne({ where: { ID_Number: id } });

  // ==================================================================
  // The wire
  // ==================================================================
  it('uploads a real multipart body whose part is the rendered CSV', async () => {
    await service.executeDatabaseSync('e2e-1');

    expect(biostar.uploads).toHaveLength(1);
    const upload = biostar.uploads[0];

    // The field name and filename are what BioStar keys off.
    expect(upload.fieldName).toBe('file');
    expect(upload.filename).toMatch(/^sync_e2e-1_batch1_\d+\.csv$/);

    const lines = upload.content.split('\n');
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines[1]).toMatch(
      /^12100001,Dela Cruz Juan,DLSU,STUDENT,All Users,,,[\d-]{10} [\d:.]{12},[\d-]{10} [\d:.]{12},Y$/,
    );
    expect(upload.content.endsWith('\n')).toBe(true);
    expect(upload.content).not.toMatch(/\r/);
  }, 60000);

  it('sends the auth headers BioStar requires on every call', async () => {
    await service.executeDatabaseSync('e2e-1');

    const importReq = biostar.requestsTo('/api/users/csv_import')[0];
    expect(importReq.headers.authorization).toBe('Bearer fake-token');
    // Read off the LOGIN RESPONSE HEADER, not its body.
    expect(importReq.headers['bs-session-id']).toBe('fake-session-id');

    const uploadReq = biostar.requestsTo('/api/attachments')[0];
    expect(uploadReq.headers['content-type']).toMatch(
      /^multipart\/form-data; boundary=/,
    );
  }, 60000);

  it('declares the columns it actually rendered', async () => {
    await service.executeDatabaseSync('e2e-1');

    const body = JSON.parse(
      biostar.requestsTo('/api/users/csv_import')[0].body,
    );
    expect(body.CsvOption.import_option).toBe(2);
    expect(body.CsvOption.start_line).toBe(2);
    expect(body.CsvOption.columns.total).toBe('10');
    expect(body.Query.headers).toEqual(CSV_HEADER.split(','));
    expect(body.File.fileName).toBe(body.File.uri);
  }, 60000);

  // ==================================================================
  // Real PostgreSQL, including the bigint column
  // ==================================================================
  it('round-trips a BioStar card through a real bigint column', async () => {
    biostar.userDetails['12100001'] = {
      user_id: '12100001',
      cards: [{ card_id: '9876543210' }],
    };
    service = await makeService({
      DASMA_CSV_FETCH_CARD_FROM_BIOSTAR: 'true',
    });

    await service.executeDatabaseSync('e2e-1');

    const stored = await byId('12100001');
    // PostgreSQL returns bigint as a STRING. If anything downstream assumed a
    // number, the csn cell and the row hash could disagree between runs.
    expect(typeof stored.Unique_ID).toBe('string');
    expect(stored.Unique_ID).toBe('9876543210');
    expect(biostar.lastUploadText().split('\n')[1]).toContain(',9876543210,');

    // Second run must not look the card up again, and must stay quiet.
    const detailCallsAfterFirst = biostar.countOf('/api/users/12100001');
    await service.executeDatabaseSync('e2e-2');
    expect(biostar.countOf('/api/users/12100001')).toBe(detailCallsAfterFirst);
    expect(biostar.countOf('/api/users/csv_import')).toBe(1);
  }, 90000);

  it('persists the activation window as real timestamps', async () => {
    await service.executeDatabaseSync('e2e-1');

    const stored = await byId('12100001');
    expect(stored.date_activated).toBeInstanceOf(Date);
    expect(stored.expiry_datetime).toBeInstanceOf(Date);
    expect(stored.date_deactivated).toBeNull();
    expect(stored.expiry_datetime.getUTCFullYear()).toBe(
      stored.date_activated.getUTCFullYear() + 10,
    );
    expect(stored.biostar_row_hash).toMatch(/^[0-9a-f]{64}$/);
  }, 60000);

  // ==================================================================
  // The headline: a quiet second run, over real HTTP and real PostgreSQL
  // ==================================================================
  it('sends BioStar nothing at all on a second unchanged run', async () => {
    await service.executeDatabaseSync('e2e-1');
    expect(biostar.countOf('/api/attachments')).toBe(1);
    expect(biostar.countOf('/api/users/csv_import')).toBe(1);
    const firstUpload = biostar.lastUploadText();

    await service.executeDatabaseSync('e2e-2');

    expect(biostar.countOf('/api/attachments')).toBe(1);
    expect(biostar.countOf('/api/users/csv_import')).toBe(1);

    // And when something does change, the bytes differ only where expected.
    sourceRows = [sourceRow({ LastName: 'Reyes' })];
    await service.executeDatabaseSync('e2e-3');

    expect(biostar.countOf('/api/users/csv_import')).toBe(2);
    const thirdUpload = biostar.lastUploadText();
    expect(thirdUpload).not.toBe(firstUpload);
    expect(thirdUpload.split('\n')[1]).toContain('Reyes Juan');
    // The window did not move, so those cells are byte-identical.
    expect(thirdUpload.split('\n')[1].split(',').slice(7, 9)).toEqual(
      firstUpload.split('\n')[1].split(',').slice(7, 9),
    );
  }, 90000);

  // ==================================================================
  // Clearing a remark over real HTTP
  // ==================================================================
  it('clears a removed remark with a real PUT carrying only that field', async () => {
    sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
    await service.executeDatabaseSync('e2e-1');

    biostar.userDetails['12100001'] = {
      user_id: '12100001',
      user_custom_fields: [
        { custom_field: { name: 'Lived Name' }, item: 'Johnny' },
        { custom_field: { name: 'Remarks' }, item: 'Owes library fee' },
        { custom_field: { name: 'Gate' }, item: 'Main' },
      ],
    };
    sourceRows = [sourceRow({ Remarks: null })];
    await service.executeDatabaseSync('e2e-2');

    expect(biostar.userPuts).toHaveLength(1);
    expect(biostar.userPuts[0].userId).toBe('12100001');
    expect(biostar.userPuts[0].body).toEqual({
      User: {
        user_custom_fields: [
          { custom_field: { name: 'Lived Name' }, item: 'Johnny' },
          { custom_field: { name: 'Remarks' }, item: '' },
          { custom_field: { name: 'Gate' }, item: 'Main' },
        ],
      },
    });

    const stored = await byId('12100001');
    expect(stored.Remarks).toBeNull();
    expect(stored.remarks_clear_pending).toBe(false);
  }, 90000);

  it('keeps the clear pending when BioStar refuses it with a 200', async () => {
    sourceRows = [sourceRow({ Remarks: 'Owes library fee' })];
    await service.executeDatabaseSync('e2e-1');

    biostar.userDetails['12100001'] = {
      user_id: '12100001',
      user_custom_fields: [
        { custom_field: { name: 'Remarks' }, item: 'Owes library fee' },
      ],
    };
    biostar.scenario.putCode = '1'; // HTTP 200, logical refusal
    sourceRows = [sourceRow({ Remarks: null })];
    await service.executeDatabaseSync('e2e-2');

    expect((await byId('12100001')).remarks_clear_pending).toBe(true);

    // BioStar recovers; the retry comes from persisted state alone.
    biostar.scenario.putCode = '0';
    await service.executeDatabaseSync('e2e-3');

    expect((await byId('12100001')).remarks_clear_pending).toBe(false);
  }, 120000);

  // ==================================================================
  // Failure over real HTTP
  // ==================================================================
  it('retries a failed attachment upload and still imports once', async () => {
    biostar.scenario.attachmentFailures = 1;

    await service.executeDatabaseSync('e2e-1');

    expect(biostar.countOf('/api/attachments')).toBe(2);
    expect(biostar.countOf('/api/users/csv_import')).toBe(1);
    expect((await byId('12100001')).biostar_row_hash).toMatch(/^[0-9a-f]{64}$/);
  }, 120000);

  it('records no hash when the import fails, so the row goes again', async () => {
    biostar.scenario.importCode = '8'; // arrives as HTTP 404

    await service.executeDatabaseSync('e2e-1');
    expect((await byId('12100001')).biostar_row_hash).toBeNull();

    biostar.scenario.importCode = '0';
    await service.executeDatabaseSync('e2e-2');

    expect(biostar.lastUploadText().split('\n')[1]).toContain('12100001');
    expect((await byId('12100001')).biostar_row_hash).toMatch(/^[0-9a-f]{64}$/);
  }, 120000);

  it('downloads the error details on a partial import and re-sends the batch', async () => {
    biostar.scenario.importCode = '1';
    biostar.scenario.importFailedRows = [{ user_id: '12100001' }];

    await service.executeDatabaseSync('e2e-1');

    expect(biostar.countOf('/download/')).toBe(1);
    expect((await byId('12100001')).biostar_row_hash).toBeNull();

    biostar.scenario.importCode = '0';
    biostar.scenario.importFailedRows = null;
    await service.executeDatabaseSync('e2e-2');

    expect(biostar.countOf('/api/users/csv_import')).toBe(2);
  }, 120000);

  // ==================================================================
  // Quoting and empty source, on the wire
  // ==================================================================
  it('quotes a remark containing a comma in the bytes BioStar receives', async () => {
    sourceRows = [sourceRow({ Remarks: 'Lost ID, replaced' })];

    await service.executeDatabaseSync('e2e-1');

    expect(biostar.lastUploadText()).toContain(',"Lost ID, replaced",');
  }, 60000);

  it('never uploads anything when the source view is empty', async () => {
    await service.executeDatabaseSync('e2e-1');
    expect(await students.count()).toBe(1);

    sourceRows = [];
    await service.executeDatabaseSync('e2e-2');

    // Still exactly one upload — the first run's — and nobody archived.
    expect(biostar.countOf('/api/attachments')).toBe(1);
    expect((await byId('12100001')).isArchived).toBe(false);
  }, 90000);

  // ==================================================================
  // The inbound direction: BioStar -> PostgreSQL, over real HTTP
  // ==================================================================
  describe('pulling from BioStar', () => {
    const listRow = (over: Record<string, unknown> = {}) => ({
      user_id: '12100001',
      name: 'Dela Cruz, Juan',
      photo_exists: true,
      card_count: '1',
      last_modified: '100',
      ...over,
    });

    it('writes a photo and a card into PostgreSQL', async () => {
      // Seed the roster first so there is a row to enrich.
      await service.executeDatabaseSync('e2e-1');

      biostar.listPages = [{ total: 1, rows: [listRow()] }];
      biostar.userDetails['12100001'] = {
        user_id: '12100001',
        name: 'Dela Cruz, Juan',
        photo: '/9j/4AAQSkZJRgABAQAAAQ',
        disabled: 'false',
        cards: [{ card_id: '5551234' }],
      };

      await service.syncFromBiostar('e2e-biostar');

      const stored = await byId('12100001');
      expect(stored.Photo).toBe('/9j/4AAQSkZJRgABAQAAAQ');
      expect(stored.Unique_ID).toBe('5551234');
    }, 90000);

    // THE WHOLE POINT OF THE PHOTO FIX, proven end to end over real HTTP and
    // real PostgreSQL: the photo BioStar supplied must survive the next
    // source sync, which knows nothing about photos.
    it('keeps that photo when the source syncs again afterwards', async () => {
      await service.executeDatabaseSync('e2e-1');

      biostar.listPages = [{ total: 1, rows: [listRow()] }];
      biostar.userDetails['12100001'] = {
        user_id: '12100001',
        photo: '/9j/4AAQSkZJRgABAQAAAQ',
        disabled: 'false',
      };
      await service.syncFromBiostar('e2e-biostar');
      expect((await byId('12100001')).Photo).toBe('/9j/4AAQSkZJRgABAQAAAQ');

      sourceRows = [sourceRow({ LastName: 'Reyes' })];
      await service.executeDatabaseSync('e2e-2');

      const stored = await byId('12100001');
      expect(stored.Photo).toBe('/9j/4AAQSkZJRgABAQAAAQ');
      expect(stored.Name).toContain('Reyes');
    }, 90000);

    it('never asks for the detail of a user with neither photo nor card', async () => {
      biostar.listPages = [
        {
          total: 1,
          rows: [listRow({ photo_exists: false, card_count: '0' })],
        },
      ];

      await service.syncFromBiostar('e2e-biostar');

      expect(biostar.countOf('/api/users/12100001')).toBe(0);
    }, 60000);

    it('advances the incremental cursor from the highest last_modified', async () => {
      biostar.listPages = [
        {
          total: 2,
          rows: [
            listRow({ user_id: '12100001', last_modified: '90' }),
            listRow({ user_id: '12100002', last_modified: '120' }),
          ],
        },
      ];
      biostar.userDetails['12100001'] = { user_id: '12100001', photo: 'A' };
      biostar.userDetails['12100002'] = { user_id: '12100002', photo: 'B' };

      await service.syncFromBiostar('e2e-biostar');

      const state = await dataSource
        .getRepository(BiostarSyncState)
        .findOne({ where: { schemaKey: 'dasma' } });
      expect(state.lastModifiedCursor).toBe('120');
      expect(state.lastSuccessAt).not.toBeNull();
    }, 90000);

    // Free backlog reconciliation: the detail is already in hand, so noticing
    // a remark BioStar still shows costs nothing extra.
    it('queues a stale remark it notices while pulling, and clears it next sync', async () => {
      await service.executeDatabaseSync('e2e-1');
      expect(await byId('12100001')).toMatchObject({ Remarks: null });

      biostar.listPages = [{ total: 1, rows: [listRow()] }];
      biostar.userDetails['12100001'] = {
        user_id: '12100001',
        photo: 'X',
        user_custom_fields: [
          { custom_field: { name: 'Remarks' }, item: 'Stale from before' },
        ],
      };

      await service.syncFromBiostar('e2e-biostar');
      expect((await byId('12100001')).remarks_clear_pending).toBe(true);
      expect(biostar.userPuts).toHaveLength(0); // the pull never writes

      // The next roster sync is what actually clears it.
      await service.executeDatabaseSync('e2e-2');

      expect(biostar.userPuts).toHaveLength(1);
      expect(biostar.userPuts[0].body).toEqual({
        User: {
          user_custom_fields: [{ custom_field: { name: 'Remarks' }, item: '' }],
        },
      });
      expect((await byId('12100001')).remarks_clear_pending).toBe(false);
    }, 120000);
  });

  // ==================================================================
  // A realistic roster, end to end
  // ==================================================================
  describe('a mixed roster', () => {
    it('spreads a multi-batch roster across one upload per batch', async () => {
      process.env.SYNC_BATCH_SIZE = '500';
      try {
        sourceRows = Array.from({ length: 1200 }, (_, i) =>
          sourceRow({ ID: String(12100000 + i) }),
        );

        await service.executeDatabaseSync('e2e-1');

        // 1200 / 500 = 3 batches.
        expect(biostar.countOf('/api/attachments')).toBe(3);
        expect(biostar.countOf('/api/users/csv_import')).toBe(3);

        const rowsSent = biostar.uploads.reduce(
          (n, u) => n + u.content.trim().split('\n').length - 1,
          0,
        );
        expect(rowsSent).toBe(1200);
        expect(await students.count()).toBe(1200);

        // Second run: nothing changed anywhere, so BioStar hears nothing.
        await service.executeDatabaseSync('e2e-2');
        expect(biostar.countOf('/api/users/csv_import')).toBe(3);
      } finally {
        delete process.env.SYNC_BATCH_SIZE;
      }
    }, 180000);

    it('exports the active and the deactivated correctly, and only once', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001', Status: true }),
        sourceRow({ ID: '12100002', Status: false }),
        sourceRow({ ID: '12100003', IsArchived: true }),
        sourceRow({ ID: '12100004', Remarks: 'Suspended' }),
      ];

      await service.executeDatabaseSync('e2e-1');

      const rows = biostar
        .lastUploadText()
        .trim()
        .split('\n')
        .slice(1)
        .map((l) => l.split(','));

      // The archived person is never offered to BioStar at all.
      expect(rows.map((r) => r[0]).sort()).toEqual([
        '12100001',
        '12100002',
        '12100004',
      ]);

      const active = rows.find((r) => r[0] === '12100001');
      const disabled = rows.find((r) => r[0] === '12100002');
      const remarked = rows.find((r) => r[0] === '12100004');

      expect(active[9]).toBe('Y');
      expect(disabled[9]).toBe('N');
      expect(remarked[5]).toBe('Suspended');

      // The deactivated person's window is already in the past.
      expect(new Date(disabled[8]).getTime()).toBeLessThan(Date.now());
      // The active person's runs ten years out.
      expect(new Date(active[8]).getUTCFullYear()).toBe(
        new Date(active[7]).getUTCFullYear() + 10,
      );

      // All four are stored; the archived one flagged rather than dropped.
      expect(await students.count()).toBe(4);
      expect((await byId('12100003')).isArchived).toBe(true);

      // Nothing changed upstream: the whole mixed roster stays quiet.
      await service.executeDatabaseSync('e2e-2');
      expect(biostar.countOf('/api/users/csv_import')).toBe(1);
    }, 120000);

    // The source is a VIEW, so the same person can legitimately appear twice.
    // The bulk insert then hits the real UNIQUE constraint on ID_Number and
    // falls back to updating. Only real PostgreSQL raises that error, which is
    // why this lives here rather than in the unit spec.
    it('survives the same ID appearing twice in one batch', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002' }),
      ];

      await service.executeDatabaseSync('e2e-1');

      expect(await students.count()).toBe(2);
      expect(await byId('12100001')).not.toBeNull();
      expect(await byId('12100002')).not.toBeNull();
      // The run still completed and shipped a CSV.
      expect(biostar.countOf('/api/users/csv_import')).toBe(1);
    }, 120000);

    it('re-exports only the person whose remark changed', async () => {
      sourceRows = [
        sourceRow({ ID: '12100001' }),
        sourceRow({ ID: '12100002' }),
        sourceRow({ ID: '12100003' }),
      ];
      await service.executeDatabaseSync('e2e-1');

      sourceRows[1] = sourceRow({ ID: '12100002', Remarks: 'Owes fee' });
      await service.executeDatabaseSync('e2e-2');

      const lines = biostar.lastUploadText().trim().split('\n');
      expect(lines).toHaveLength(2); // header + exactly one row
      expect(lines[1]).toContain('12100002');
      expect(lines[1]).toContain(',Owes fee,');
    }, 120000);
  });
});
