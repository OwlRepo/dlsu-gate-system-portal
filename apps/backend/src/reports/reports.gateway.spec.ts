import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { Server, Socket } from 'socket.io';
import { Report } from './entities/report.entity';
import { Logger } from '@nestjs/common';

// Mock dayjs config before importing gateway
jest.mock('../config/dayjs.config', () => {
  const actualDayjs = jest.requireActual('dayjs');
  const utc = jest.requireActual('dayjs/plugin/utc');
  const timezone = jest.requireActual('dayjs/plugin/timezone');

  actualDayjs.extend(utc);
  actualDayjs.extend(timezone);
  actualDayjs.tz.setDefault('Asia/Manila');

  // Return the configured dayjs as default export
  return {
    __esModule: true,
    default: actualDayjs,
  };
});

import { ReportsGateway } from './reports.gateway';

type StatsAggregate = {
  entry: number;
  exit: number;
  green: number;
  yellow: number;
  red: number;
  total: number;
};

const ZERO_AGGREGATE: StatsAggregate = {
  entry: 0,
  exit: 0,
  green: 0,
  yellow: 0,
  red: 0,
  total: 0,
};

// Mirrors the OLD row-fetch-then-count-in-JS logic byte-for-byte, so feeding
// its output into the NEW aggregate-based calculateTodayStats() proves the
// two are mathematically equivalent for identical underlying data — this is
// the "behavior-preserving" proof required for this optimization. It does
// NOT prove the raw SQL COUNT(*) FILTER expressions compute these same
// counts against a real Postgres instance; no live database is available in
// this environment (see reports.service.spec.ts for the aggregate parsing
// unit tests, and the completion report for what remains unverified).
function aggregateFromReports(reports: Report[]): StatsAggregate {
  let entry = 0;
  let exit = 0;
  reports.forEach((report) => {
    if (report.type === '1') entry++;
    else if (report.type === '2') exit++;
  });

  let green = 0;
  let yellow = 0;
  let red = 0;
  reports.forEach((report) => {
    if (report.status?.startsWith('GREEN')) green++;
    else if (report.status?.startsWith('YELLOW')) yellow++;
    else if (report.status?.startsWith('RED')) red++;
  });

  return { entry, exit, green, yellow, red, total: reports.length };
}

describe('ReportsGateway', () => {
  let gateway: ReportsGateway;
  let reportsService: ReportsService;
  let mockServer: any;
  let mockLogger: jest.SpyInstance;

  const mockReportsService = {
    getTodayStatsAggregate: jest.fn().mockResolvedValue(ZERO_AGGREGATE),
  };

  const createMockReport = (
    id: string,
    type: string,
    datetime: Date,
    status: string = 'GREEN;allowed',
  ): Report => {
    return {
      id,
      datetime,
      type,
      user_id: `user-${id}`,
      name: `User ${id}`,
      remarks: 'Test remarks',
      status,
      device: 'Test Device',
      created_at: datetime,
    } as Report;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsGateway,
        {
          provide: ReportsService,
          useValue: mockReportsService,
        },
      ],
    }).compile();

    gateway = module.get<ReportsGateway>(ReportsGateway);
    reportsService = module.get<ReportsService>(ReportsService);

    // Mock WebSocket server
    mockServer = {
      emit: jest.fn(),
      sockets: {
        sockets: new Map([
          ['client1', { id: 'client1' }],
          ['client2', { id: 'client2' }],
        ]),
        size: 2,
      },
    };
    gateway.server = mockServer as any;
    gateway['connectedClients'] = 2;

    // Mock logger
    mockLogger = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    // Reset mocks
    jest.clearAllMocks();
    mockReportsService.getTodayStatsAggregate.mockResolvedValue(ZERO_AGGREGATE);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Date Change Detection', () => {
    it('should detect date change when crossing midnight', async () => {
      // Set initial date
      gateway['currentStatsDate'] = '2024-03-20';

      // Set up stats with non-zero values
      gateway['currentStats'] = {
        onPremise: 10,
        entry: 15,
        exit: 5,
        gateAccessStats: {
          allowed: 80,
          allowedWithRemarks: 10,
          notAllowed: 10,
        },
        lastUpdated: new Date('2024-03-20T23:59:59+08:00'),
      };

      // Mock getCurrentDateString to return new date (after midnight)
      jest
        .spyOn(gateway as any, 'getCurrentDateString')
        .mockReturnValue('2024-03-21');

      await gateway['handleInterval']();

      // Verify date was updated
      expect(gateway['currentStatsDate']).toBe('2024-03-21');
      // Verify stats were reset
      expect(gateway['currentStats'].onPremise).toBe(0);
      expect(gateway['currentStats'].entry).toBe(0);
      expect(gateway['currentStats'].exit).toBe(0);
      // Verify WebSocket emit was called with reset stats
      expect(mockServer.emit).toHaveBeenCalledWith(
        'stats-update',
        expect.objectContaining({
          onPremise: 0,
          entry: 0,
          exit: 0,
        }),
      );
    });

    it('should not reset stats when date has not changed', async () => {
      // Set same date
      gateway['currentStatsDate'] = '2024-03-20';
      jest
        .spyOn(gateway as any, 'getCurrentDateString')
        .mockReturnValue('2024-03-20');
      mockReportsService.getTodayStatsAggregate.mockResolvedValue(
        ZERO_AGGREGATE,
      );

      // Set up stats
      gateway['currentStats'] = {
        onPremise: 10,
        entry: 15,
        exit: 5,
        gateAccessStats: {
          allowed: 80,
          allowedWithRemarks: 10,
          notAllowed: 10,
        },
        lastUpdated: new Date(),
      };

      const resetSpy = jest.spyOn(gateway as any, 'resetStatsForNewDay');

      await gateway['handleInterval']();

      // Verify date was not changed
      expect(gateway['currentStatsDate']).toBe('2024-03-20');
      // Verify resetStatsForNewDay was not called
      expect(resetSpy).not.toHaveBeenCalled();

      resetSpy.mockRestore();
    });

    it('should handle timezone correctly (Asia/Manila)', async () => {
      // Test at 11:59 PM Manila time (should not reset)
      gateway['currentStatsDate'] = '2024-03-20';
      jest
        .spyOn(gateway as any, 'getCurrentDateString')
        .mockReturnValue('2024-03-20');

      await gateway['handleInterval']();
      expect(gateway['currentStatsDate']).toBe('2024-03-20');

      // Test at 12:00 AM Manila time (should reset)
      jest
        .spyOn(gateway as any, 'getCurrentDateString')
        .mockReturnValue('2024-03-21');

      await gateway['handleInterval']();
      expect(gateway['currentStatsDate']).toBe('2024-03-21');
      expect(gateway['currentStats'].onPremise).toBe(0);

      // Test at 12:01 AM Manila time (should not reset again)
      const previousStatsDate = gateway['currentStatsDate'];
      jest
        .spyOn(gateway as any, 'getCurrentDateString')
        .mockReturnValue('2024-03-21');

      await gateway['handleInterval']();
      expect(gateway['currentStatsDate']).toBe(previousStatsDate);
    });
  });

  describe('Stats Reset Behavior', () => {
    it('should reset all stats to zero on date change', async () => {
      gateway['currentStats'] = {
        onPremise: 10,
        entry: 15,
        exit: 5,
        gateAccessStats: {
          allowed: 80,
          allowedWithRemarks: 10,
          notAllowed: 10,
        },
        lastUpdated: new Date('2024-03-20T10:00:00+08:00'),
      };

      gateway['currentStatsDate'] = '2024-03-20';

      await gateway['resetStatsForNewDay']('2024-03-21');

      expect(gateway['currentStats'].onPremise).toBe(0);
      expect(gateway['currentStats'].entry).toBe(0);
      expect(gateway['currentStats'].exit).toBe(0);
      expect(gateway['currentStats'].gateAccessStats.allowed).toBe(0);
      expect(gateway['currentStats'].gateAccessStats.allowedWithRemarks).toBe(
        0,
      );
      expect(gateway['currentStats'].gateAccessStats.notAllowed).toBe(0);
      expect(gateway['currentStats'].lastUpdated).toBeInstanceOf(Date);
    });

    it('should broadcast reset stats to all connected clients', async () => {
      gateway['currentStatsDate'] = '2024-03-20';

      await gateway['resetStatsForNewDay']('2024-03-21');

      expect(mockServer.emit).toHaveBeenCalledWith(
        'stats-update',
        expect.objectContaining({
          onPremise: 0,
          entry: 0,
          exit: 0,
          gateAccessStats: {
            allowed: 0,
            allowedWithRemarks: 0,
            notAllowed: 0,
          },
          lastUpdated: expect.any(Date),
        }),
      );
    });

    it('should log reset event', async () => {
      gateway['currentStatsDate'] = '2024-03-20';

      await gateway['resetStatsForNewDay']('2024-03-21');

      expect(mockLogger).toHaveBeenCalledWith(
        expect.stringContaining('Stats reset for new day (2024-03-21)'),
      );
    });

    it('should handle reset when no clients connected', async () => {
      gateway['connectedClients'] = 0;
      gateway['currentStatsDate'] = '2024-03-20';
      gateway.server = { sockets: { sockets: new Map(), size: 0 } } as any;

      await gateway['resetStatsForNewDay']('2024-03-21');

      expect(gateway['currentStats'].onPremise).toBe(0);
      expect(mockLogger).toHaveBeenCalledWith(
        expect.stringContaining('Stats reset for new day (2024-03-21)'),
      );
    });
  });

  describe('Stats Calculation After Reset', () => {
    it('should calculate stats for new day after reset', async () => {
      // Reset stats first
      gateway['currentStatsDate'] = '2024-03-20';
      await gateway['resetStatsForNewDay']('2024-03-21');

      // Mock reports for new day
      const newDayReports = [
        createMockReport(
          '1',
          '1',
          new Date('2024-03-21T08:00:00+08:00'),
          'GREEN;allowed',
        ),
        createMockReport(
          '2',
          '1',
          new Date('2024-03-21T09:00:00+08:00'),
          'GREEN;allowed',
        ),
        createMockReport(
          '3',
          '2',
          new Date('2024-03-21T10:00:00+08:00'),
          'GREEN;allowed',
        ),
      ];
      mockReportsService.getTodayStatsAggregate.mockResolvedValue(
        aggregateFromReports(newDayReports),
      );

      // Spy on getCurrentDateString to avoid dayjs issues in test
      const getDateSpy = jest
        .spyOn(gateway as any, 'getCurrentDateString')
        .mockReturnValue('2024-03-21');

      const stats = await gateway['calculateTodayStats']();

      expect(stats.entry).toBe(2);
      expect(stats.exit).toBe(1);
      expect(stats.onPremise).toBe(1);
      expect(mockReportsService.getTodayStatsAggregate).toHaveBeenCalled();

      getDateSpy.mockRestore();
    });

    it('should not include previous day data after reset', async () => {
      // Set up previous day's date
      gateway['currentStatsDate'] = '2024-03-19';
      jest
        .spyOn(gateway as any, 'getCurrentDateString')
        .mockReturnValue('2024-03-20');
      gateway['connectedClients'] = 2; // Ensure interval runs

      // Mock empty aggregate for new day (no reports yet)
      mockReportsService.getTodayStatsAggregate.mockResolvedValue(
        ZERO_AGGREGATE,
      );

      await gateway['handleInterval']();

      // Verify date was updated
      expect(gateway['currentStatsDate']).toBe('2024-03-20');
      // Verify stats are all zeros after reset
      expect(gateway['currentStats'].onPremise).toBe(0);
      expect(gateway['currentStats'].entry).toBe(0);
      expect(gateway['currentStats'].exit).toBe(0);

      // Verify the aggregate query was made with a start/end Date range
      expect(mockReportsService.getTodayStatsAggregate).toHaveBeenCalled();
      const [start, end] =
        mockReportsService.getTodayStatsAggregate.mock.calls[0];
      expect(start).toBeInstanceOf(Date);
      expect(end).toBeInstanceOf(Date);
    });
  });

  describe('Initialization', () => {
    it('should initialize currentStatsDate on module init', async () => {
      jest
        .spyOn(gateway as any, 'getCurrentDateString')
        .mockReturnValue('2024-03-20');

      await gateway.onModuleInit();

      expect(gateway['currentStatsDate']).toBe('2024-03-20');
      expect(gateway['currentStatsDate']).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD format
    });

    it('should initialize stats on module init', async () => {
      const mockReports = [
        createMockReport('1', '1', new Date('2024-03-20T08:00:00+08:00')),
        createMockReport('2', '2', new Date('2024-03-20T09:00:00+08:00')),
      ];
      mockReportsService.getTodayStatsAggregate.mockResolvedValue(
        aggregateFromReports(mockReports),
      );
      jest
        .spyOn(gateway as any, 'getCurrentDateString')
        .mockReturnValue('2024-03-20');
      jest
        .spyOn(gateway as any, 'initializeStats')
        .mockResolvedValue(undefined);

      await gateway.onModuleInit();

      expect(gateway['currentStatsDate']).toBe('2024-03-20');
      expect(gateway['currentStats']).toBeDefined();
    });
  });

  describe('Interval Handler', () => {
    it('should check for date change on each interval', async () => {
      gateway['currentStatsDate'] = '2024-03-20';
      jest
        .spyOn(gateway as any, 'getCurrentDateString')
        .mockReturnValue('2024-03-20');

      await gateway['handleInterval']();

      // Date unchanged, should proceed normally
      expect(gateway['currentStatsDate']).toBe('2024-03-20');

      // Now change date
      jest
        .spyOn(gateway as any, 'getCurrentDateString')
        .mockReturnValue('2024-03-21');

      await gateway['handleInterval']();

      // Date should be updated
      expect(gateway['currentStatsDate']).toBe('2024-03-21');
    });

    it('should skip processing if no clients connected', async () => {
      gateway['connectedClients'] = 0;
      mockReportsService.getTodayStatsAggregate.mockClear();

      await gateway['handleInterval']();

      // Should not query database
      expect(mockReportsService.getTodayStatsAggregate).not.toHaveBeenCalled();
    });

    it('should handle date change when no clients connected', async () => {
      gateway['connectedClients'] = 0;
      gateway['currentStatsDate'] = '2024-03-20';
      gateway.server = { sockets: { sockets: new Map(), size: 0 } } as any;

      // Even with no clients, date change should be detected in handleInterval
      // But it will return early, so we test resetStatsForNewDay directly
      await gateway['resetStatsForNewDay']('2024-03-21');

      expect(gateway['currentStatsDate']).toBe('2024-03-21');
      expect(gateway['currentStats'].onPremise).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple date changes in quick succession', async () => {
      gateway['currentStatsDate'] = '2024-03-20';

      // Simulate rapid date changes
      await gateway['resetStatsForNewDay']('2024-03-21');
      expect(gateway['currentStatsDate']).toBe('2024-03-21');

      await gateway['resetStatsForNewDay']('2024-03-22');
      expect(gateway['currentStatsDate']).toBe('2024-03-22');

      await gateway['resetStatsForNewDay']('2024-03-23');
      expect(gateway['currentStatsDate']).toBe('2024-03-23');

      // Verify stats reset each time
      expect(gateway['currentStats'].onPremise).toBe(0);
    });

    it('should handle database errors during reset', async () => {
      gateway['currentStatsDate'] = '2024-03-20';
      jest
        .spyOn(gateway as any, 'getCurrentDateString')
        .mockReturnValue('2024-03-21');

      // Reset should still occur even if database query fails later
      await gateway['resetStatsForNewDay']('2024-03-21');

      expect(gateway['currentStats'].onPremise).toBe(0);
      expect(gateway['currentStatsDate']).toBe('2024-03-21');

      // Now simulate database error in calculateTodayStats
      mockReportsService.getTodayStatsAggregate.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(gateway['handleInterval']()).resolves.not.toThrow();
      // Stats should remain reset
      expect(gateway['currentStats'].onPremise).toBe(0);
    });

    it('should handle getCurrentDateString correctly', () => {
      // Mock the actual dayjs call
      const mockDayjs = require('../config/dayjs.config').default;
      jest.spyOn(mockDayjs(), 'tz').mockReturnValue({
        format: jest.fn().mockReturnValue('2024-03-20'),
      });

      const dateString = gateway['getCurrentDateString']();

      expect(dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Helper Methods', () => {
    it('should get current date string in correct format', () => {
      // Test that getCurrentDateString returns correct format
      // This will use the real dayjs implementation
      const dateString = gateway['getCurrentDateString']();

      expect(dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(dateString.length).toBe(10);
    });

    it('should use Asia/Manila timezone for date calculations', async () => {
      // Test that calculateTodayStats uses Manila timezone
      const mockReports = [
        createMockReport('1', '1', new Date('2024-03-20T08:00:00+08:00')),
      ];
      mockReportsService.getTodayStatsAggregate.mockResolvedValue(
        aggregateFromReports(mockReports),
      );

      const stats = await gateway['calculateTodayStats']();

      expect(mockReportsService.getTodayStatsAggregate).toHaveBeenCalled();
      // Verify the aggregate call receives a start/end Date range
      const [start, end] =
        mockReportsService.getTodayStatsAggregate.mock.calls[0];
      expect(start).toBeInstanceOf(Date);
      expect(end).toBeInstanceOf(Date);
      expect(stats).toBeDefined();
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('Aggregate-vs-legacy equivalence (behavior-preserving optimization proof)', () => {
    // These feed the SAME underlying report set through both the OLD
    // JS-counting formula (aggregateFromReports, copied verbatim from the
    // pre-optimization implementation) and the NEW gateway formula (which
    // now consumes a pre-aggregated {entry,exit,green,yellow,red,total}
    // instead of a Report[]). Matching output proves the gateway's own
    // math is unchanged; it does not prove the SQL FILTER clauses compute
    // the same counts against a real Postgres instance (no live DB in this
    // environment — see reports.service.spec.ts for the query-shape unit
    // tests, and the completion report for this residual gap).

    it('happy path: matches the legacy per-row count for a normal mixed day', async () => {
      const reports = [
        createMockReport('1', '1', new Date(), 'GREEN;allowed'),
        createMockReport('2', '1', new Date(), 'YELLOW;remarks'),
        createMockReport('3', '2', new Date(), 'GREEN;allowed'),
        createMockReport('4', '2', new Date(), 'RED;denied'),
      ];
      mockReportsService.getTodayStatsAggregate.mockResolvedValue(
        aggregateFromReports(reports),
      );

      const stats = await gateway['calculateTodayStats']();

      expect(stats.entry).toBe(2);
      expect(stats.exit).toBe(2);
      expect(stats.onPremise).toBe(0);
      expect(stats.gateAccessStats.allowed).toBe(Math.round((2 / 4) * 100));
      expect(stats.gateAccessStats.allowedWithRemarks).toBe(
        Math.round((1 / 4) * 100),
      );
      expect(stats.gateAccessStats.notAllowed).toBe(Math.round((1 / 4) * 100));
    });

    it('empty day: all zeros, no division by zero', async () => {
      mockReportsService.getTodayStatsAggregate.mockResolvedValue(
        aggregateFromReports([]),
      );

      const stats = await gateway['calculateTodayStats']();

      expect(stats).toEqual(
        expect.objectContaining({
          entry: 0,
          exit: 0,
          onPremise: 0,
          gateAccessStats: {
            allowed: 0,
            allowedWithRemarks: 0,
            notAllowed: 0,
          },
        }),
      );
    });

    it('malformed/null status values: not counted in any bucket, still counted in total', async () => {
      const reports = [
        createMockReport('1', '1', new Date(), 'GREEN;allowed'),
        { ...createMockReport('2', '1', new Date()), status: null } as Report,
        {
          ...createMockReport('3', '1', new Date()),
          status: undefined,
        } as Report,
      ];
      mockReportsService.getTodayStatsAggregate.mockResolvedValue(
        aggregateFromReports(reports),
      );

      const stats = await gateway['calculateTodayStats']();

      expect(stats.entry).toBe(3);
      // Only 1 of 3 has a matching status prefix; total denominator is still 3.
      expect(stats.gateAccessStats.allowed).toBe(Math.round((1 / 3) * 100));
    });

    it('large fixture: aggregate path returns correct counts without depending on row hydration', async () => {
      const reports: Report[] = [];
      for (let i = 0; i < 5000; i++) {
        const type = i % 3 === 0 ? '2' : '1';
        const status =
          i % 5 === 0
            ? 'RED;denied'
            : i % 2 === 0
              ? 'GREEN;allowed'
              : 'YELLOW;remarks';
        reports.push(createMockReport(String(i), type, new Date(), status));
      }
      mockReportsService.getTodayStatsAggregate.mockResolvedValue(
        aggregateFromReports(reports),
      );

      const stats = await gateway['calculateTodayStats']();
      const expected = aggregateFromReports(reports);

      expect(stats.entry).toBe(expected.entry);
      expect(stats.exit).toBe(expected.exit);
      expect(stats.onPremise).toBe(expected.entry - expected.exit);
      // The gateway never iterates the 5000-row array itself anymore — it
      // only ever sees the 6-integer aggregate returned by the mock.
      expect(mockReportsService.getTodayStatsAggregate).toHaveBeenCalledTimes(
        1,
      );
    });
  });
});
