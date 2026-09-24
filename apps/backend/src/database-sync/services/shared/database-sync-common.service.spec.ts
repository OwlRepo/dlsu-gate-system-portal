import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSyncCommonService } from './database-sync-common.service';
import { Student } from '../../../students/entities/student.entity';

/**
 * Covers the activation-window rule that fixes the reported defect:
 * "The expiry date is updated every day. It always retrieves the data based on
 * today's date."
 *
 * The rule has to be pure and deterministic, so `now` is always injected and
 * never read inside the implementation.
 */
describe('DatabaseSyncCommonService — activation window', () => {
  let service: DatabaseSyncCommonService;

  /** 2026-08-28 -> 2036-08-28. The tracker's own worked example. */
  const NOW = new Date('2026-08-28T01:23:45.000Z');
  const TEN_YEARS_LATER = new Date('2036-08-28T01:23:45.000Z');

  /** Minimal existing-row stand-in; only the fields the rule reads. */
  const existingRow = (over: Partial<Student> = {}): Student =>
    ({
      ID_Number: '12345678',
      Campus_Entry: 'Y',
      isArchived: false,
      date_activated: new Date('2020-01-01T00:00:00.000Z'),
      date_deactivated: null,
      expiry_datetime: new Date('2030-01-01T00:00:00.000Z'),
      ...over,
    }) as Student;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseSyncCommonService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<DatabaseSyncCommonService>(DatabaseSyncCommonService);
  });

  describe('isRecordActive', () => {
    // Mirrors the isDisabled test in database-sync-dasma-path.service.ts:
    //   Campus_Entry === 'N' || isArchived === true  =>  disabled
    it.each([
      ['Y', false, true],
      ['y', false, true],
      ['N', false, false],
      ['n', false, false],
      ['Y', true, false],
      ['N', true, false],
      [null, false, true],
      [undefined, false, true],
      ['', false, true],
    ])(
      'Campus_Entry=%p isArchived=%p -> active=%p',
      (campusEntry, isArchived, expected) => {
        expect(service.isRecordActive(campusEntry, isArchived as boolean)).toBe(
          expected,
        );
      },
    );
  });

  describe('resolveActivationWindow', () => {
    it('stamps a brand-new active record with activation now and expiry now + 10 years', () => {
      expect(service.resolveActivationWindow(undefined, true, NOW)).toEqual({
        date_activated: NOW,
        expiry_datetime: TEN_YEARS_LATER,
        date_deactivated: null,
      });
    });

    // Changed deliberately. This used to return null, on the reasoning that
    // there was no active->inactive transition worth recording. But the CSV's
    // disabled window is now anchored to `date_deactivated`, so a row without
    // one falls back to "today" and looks different to BioStar every single
    // day — re-exporting the entire disabled population daily and re-enrolling
    // them on every device. Stamping the moment we first see someone inactive
    // gives that window something stable to hang on.
    it('stamps a deactivation date for a brand-new record that arrives inactive', () => {
      expect(service.resolveActivationWindow(undefined, false, NOW)).toEqual({
        date_deactivated: NOW,
      });
    });

    it('stamps a deactivation date for a row that predates these columns', () => {
      const existing = existingRow({
        Campus_Entry: 'N',
        date_deactivated: null,
      });

      expect(service.resolveActivationWindow(existing, false, NOW)).toEqual({
        date_deactivated: NOW,
      });
    });

    // The write-once rule: once stamped, never rewritten. Rewriting it every
    // run would be the original drifting-date bug in a different column.
    it('leaves an existing deactivation date alone', () => {
      const existing = existingRow({
        Campus_Entry: 'N',
        date_deactivated: new Date('2024-01-01T00:00:00.000Z'),
      });

      expect(service.resolveActivationWindow(existing, false, NOW)).toBeNull();
    });

    it('restarts the 10-year window when an inactive record is re-activated', () => {
      const existing = existingRow({
        Campus_Entry: 'N',
        date_activated: new Date('2019-05-05T00:00:00.000Z'),
        date_deactivated: new Date('2024-01-01T00:00:00.000Z'),
        expiry_datetime: new Date('2029-05-05T00:00:00.000Z'),
      });

      expect(service.resolveActivationWindow(existing, true, NOW)).toEqual({
        date_activated: NOW,
        expiry_datetime: TEN_YEARS_LATER,
        date_deactivated: null,
      });
    });

    it('re-activates a record that was archived rather than campus-denied', () => {
      const existing = existingRow({ Campus_Entry: 'Y', isArchived: true });

      expect(service.resolveActivationWindow(existing, true, NOW)).toEqual({
        date_activated: NOW,
        expiry_datetime: TEN_YEARS_LATER,
        date_deactivated: null,
      });
    });

    // THE FIX. Against the old behaviour the CSV re-derived expiry from
    // dayjs() on every run, so a record that never changed still moved.
    it('writes NOTHING for a record that was already active and is still active', () => {
      expect(
        service.resolveActivationWindow(existingRow(), true, NOW),
      ).toBeNull();
    });

    it('records the deactivation date but preserves activation and expiry for audit', () => {
      expect(
        service.resolveActivationWindow(existingRow(), false, NOW),
      ).toEqual({ date_deactivated: NOW });
    });

    it('writes nothing when an already-inactive record stays inactive', () => {
      const existing = existingRow({
        Campus_Entry: 'N',
        date_deactivated: new Date('2024-01-01T00:00:00.000Z'),
      });

      expect(service.resolveActivationWindow(existing, false, NOW)).toBeNull();
    });

    it('backfills an active legacy row that has no activation date yet', () => {
      const existing = existingRow({
        date_activated: null,
        expiry_datetime: null,
      });

      expect(service.resolveActivationWindow(existing, true, NOW)).toEqual({
        date_activated: NOW,
        expiry_datetime: TEN_YEARS_LATER,
        date_deactivated: null,
      });
    });

    it('backfills when activation exists but expiry is missing, keeping the known activation date', () => {
      const knownActivation = new Date('2021-06-15T00:00:00.000Z');
      const existing = existingRow({
        date_activated: knownActivation,
        expiry_datetime: null,
      });

      expect(service.resolveActivationWindow(existing, true, NOW)).toEqual({
        date_activated: knownActivation,
        expiry_datetime: new Date('2031-06-15T00:00:00.000Z'),
        date_deactivated: null,
      });
    });

    it('is deterministic — the same inputs never depend on the wall clock', () => {
      const first = service.resolveActivationWindow(undefined, true, NOW);
      const second = service.resolveActivationWindow(undefined, true, NOW);
      expect(first).toEqual(second);
    });

    it('clamps a 29 February activation to 28 February ten years on', () => {
      const leapDay = new Date('2028-02-29T00:00:00.000Z');

      expect(service.resolveActivationWindow(undefined, true, leapDay)).toEqual(
        {
          date_activated: leapDay,
          expiry_datetime: new Date('2038-02-28T00:00:00.000Z'),
          date_deactivated: null,
        },
      );
    });
  });
});

describe('DatabaseSyncCommonService — BioStar name and import-error parsing', () => {
  let service: DatabaseSyncCommonService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseSyncCommonService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = module.get<DatabaseSyncCommonService>(DatabaseSyncCommonService);
  });

  describe('renderBiostarName', () => {
    it('keeps a name of exactly 48 characters untouched', () => {
      const name = 'A'.repeat(48);
      expect(service.renderBiostarName(name)).toEqual({
        value: name,
        truncated: false,
      });
    });

    it('cuts a 49-character name to 48 and reports it', () => {
      expect(service.renderBiostarName('A'.repeat(49))).toEqual({
        value: 'A'.repeat(48),
        truncated: true,
      });
    });

    it('cuts the name BioStar rejected live to 48', () => {
      expect(
        service.renderBiostarName(`${'L'.repeat(50)}, ${'F'.repeat(50)}`),
      ).toEqual({ value: 'L'.repeat(48), truncated: true });
    });

    it('leaves no trailing space where the cut lands', () => {
      expect(
        service.renderBiostarName(`${'A'.repeat(47)} ${'B'.repeat(10)}`),
      ).toEqual({ value: 'A'.repeat(47), truncated: true });
    });

    it('strips punctuation exactly as before', () => {
      expect(service.renderBiostarName("Pena-Cruz, O'Brien Jr.")).toEqual({
        value: 'PenaCruz OBrien Jr',
        truncated: false,
      });
    });

    it('treats a missing name as empty', () => {
      expect(service.renderBiostarName(null)).toEqual({
        value: '',
        truncated: false,
      });
    });
  });

  describe('parseBiostarImportErrorIds', () => {
    const HEADER =
      '\uFEFFuser_id,name,department,user_title,user_group,Remarks,csn,start_datetime,expiry_datetime,original_campus_entry,Error_Description\r\n';

    // The line BioStar returned for batch manual-21, captured live on 2026-09-23.
    const MANUAL_21 =
      HEADER +
      `91000020,${'L'.repeat(50)} ${'F'.repeat(50)},DLSU,Student,All Users,,,2026-09-22 00:00:00.000,2036-09-23 00:00:00.000,Y,Invalid value is included in User Name. User Name can contain only letters numbers spaces and underscores up to 48 characters.\r\n`;

    // The line BioStar returned for batch manual-7 on 2026-09-10: a row it
    // mis-split on an embedded newline, so its first cell is not one of ours.
    const MANUAL_7 =
      HEADER +
      '"second line"",,2026-09-09 00:00:00.000,2036-09-10 00:00:00.000,Y",User ID Type Mismatch.\r\n';

    it('names the rejected row from the live capture', () => {
      expect(
        service.parseBiostarImportErrorIds(
          MANUAL_21,
          1,
          new Set(['91000019', '91000020', '91000021']),
        ),
      ).toEqual(['91000020']);
    });

    it('refuses a line that is not one of our rows', () => {
      expect(
        service.parseBiostarImportErrorIds(MANUAL_7, 1, new Set(['12100001'])),
      ).toBeNull();
    });

    it('refuses when the count disagrees with BioStar', () => {
      expect(
        service.parseBiostarImportErrorIds(MANUAL_21, 2, new Set(['91000020'])),
      ).toBeNull();
    });

    it('refuses a file without the user_id header', () => {
      expect(
        service.parseBiostarImportErrorIds(
          'name,reason\r\nx,y\r\n',
          1,
          new Set(['x']),
        ),
      ).toBeNull();
    });

    it('refuses a header-only file', () => {
      expect(
        service.parseBiostarImportErrorIds('user_id,name\n', 1, new Set(['a'])),
      ).toBeNull();
    });

    it('refuses anything that is not text', () => {
      expect(
        service.parseBiostarImportErrorIds(undefined, 1, new Set(['a'])),
      ).toBeNull();
    });
  });
});

describe('DatabaseSyncCommonService — phase timings', () => {
  let service: DatabaseSyncCommonService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseSyncCommonService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = module.get<DatabaseSyncCommonService>(DatabaseSyncCommonService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('edge: adds the elapsed milliseconds to a phase that has not run yet', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1500);
    const timings: Record<string, number> = {};
    service.addElapsed(timings, 'csvUpload', 1000);
    expect(timings).toEqual({ csvUpload: 500 });
  });

  it('edge: sums a phase that runs once per batch', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1500);
    const timings: Record<string, number> = { csvUpload: 200 };
    service.addElapsed(timings, 'csvUpload', 1000);
    expect(timings).toEqual({ csvUpload: 700 });
  });
});

describe('DatabaseSyncCommonService — synced-records file', () => {
  let service: DatabaseSyncCommonService;
  const jsonDir = path.join(process.cwd(), 'logs', 'synced-records', 'json');
  const csvDir = path.join(process.cwd(), 'logs', 'synced-records', 'csv');
  const day = new Date().toISOString().split('T')[0].replace(/-/g, '_');
  const prefix = `synced_zztest1_${day}`;
  const jsonFile = path.join(jsonDir, `${prefix}.json`);
  const csvFile = path.join(csvDir, `${prefix}.csv`);
  const row = (user_id: string) => ({
    user_id,
    name: 'Santos Juan',
    department: 'DLSU',
    user_title: 'Student',
    user_group: 'All Users',
    remarks: '',
    csn: '',
    start_datetime: '2026-09-23 00:00:00.000',
    expiry_datetime: '2036-09-24 00:00:00.000',
    original_campus_entry: 'Y',
  });
  const ids = () =>
    (
      JSON.parse(fs.readFileSync(jsonFile, 'utf8')) as { user_id: string }[]
    ).map((r) => r.user_id);
  const cleanUp = () => {
    for (const dir of [jsonDir, csvDir]) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith(prefix)) fs.unlinkSync(path.join(dir, f));
      }
    }
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseSyncCommonService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = module.get<DatabaseSyncCommonService>(DatabaseSyncCommonService);
    cleanUp();
  });

  afterEach(cleanUp);

  it('error: moves an unreadable day file aside instead of overwriting it', async () => {
    fs.mkdirSync(jsonDir, { recursive: true });
    fs.writeFileSync(jsonFile, '[{"user_id":"91200011"');

    await service.logSyncedRecords([row('91200012')], 'zztest-1', true);

    expect(ids()).toEqual(['91200012']);
    expect(
      fs
        .readdirSync(jsonDir)
        .some((f) => f.startsWith(`${prefix}.unreadable-`)),
    ).toBe(true);
  });

  it('edge: writes the CSV header once when a later sync adds to the day', async () => {
    await service.logSyncedRecords([row('91200011')], 'zztest-1', true);
    await service.logSyncedRecords([row('91200012')], 'zztest-1', true);

    const lines = fs.readFileSync(csvFile, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith('user_id,')).toBe(true);
  });

  // Measured 2026-09-24: each write replaced the day's file, so only the
  // last batch of the day survived.
  it('regression: a later Dasma sync the same day adds to the file instead of replacing it', async () => {
    await service.logSyncedRecords([row('91200011')], 'zztest-1', true);
    await service.logSyncedRecords([row('91200012')], 'zztest-1', true);

    expect(ids()).toEqual(['91200011', '91200012']);
  });

  it('happy: the main path still replaces its file on each write', async () => {
    await service.logSyncedRecords([row('91200011')], 'zztest-1');
    await service.logSyncedRecords([row('91200012')], 'zztest-1');

    expect(ids()).toEqual(['91200012']);
  });
});
