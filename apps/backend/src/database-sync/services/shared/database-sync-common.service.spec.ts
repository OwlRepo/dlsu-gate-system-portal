import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
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

    it('writes nothing for a brand-new record that arrives inactive', () => {
      expect(service.resolveActivationWindow(undefined, false, NOW)).toBeNull();
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
