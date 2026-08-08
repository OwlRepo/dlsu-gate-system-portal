import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Report } from './entities/report.entity';
import { Repository } from 'typeorm';
import { Student } from '../students/entities/student.entity';

describe('ReportsService', () => {
  let service: ReportsService;
  let module: TestingModule;

  let mockQueryBuilder: {
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    setParameters: jest.Mock;
    getRawOne: jest.Mock;
  };

  beforeEach(async () => {
    mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getRepositoryToken(Report),
          useValue: {
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(Student),
          useValue: {
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getRawMany: jest.fn().mockResolvedValue([]),
            })),
          },
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByTypeAndDateRange', () => {
    it('should find reports by type and date range', async () => {
      const mockReports = [{ id: '1', type: '0' }];
      const repository = module.get<Repository<Report>>(
        getRepositoryToken(Report),
      );
      jest.spyOn(repository, 'find').mockResolvedValue(mockReports as Report[]);

      const result = await service.findByTypeAndDateRange(
        '0',
        '2024-03-19',
        '2024-03-20',
      );
      expect(result).toEqual(mockReports);
    });
  });

  describe('getTodayStatsAggregate', () => {
    const start = new Date('2024-03-20T00:00:00+08:00');
    const end = new Date('2024-03-20T23:59:59+08:00');

    it('parses Postgres bigint-as-string COUNT results into numbers (happy path)', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({
        entry: '12',
        exit: '8',
        green: '10',
        yellow: '1',
        red: '1',
        total: '12',
      });

      const result = await service.getTodayStatsAggregate(start, end);

      expect(result).toEqual({
        entry: 12,
        exit: 8,
        green: 10,
        yellow: 1,
        red: 1,
        total: 12,
      });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'report.datetime BETWEEN :start AND :end',
        { start, end },
      );
      expect(mockQueryBuilder.setParameters).toHaveBeenCalledWith({
        entryType: '1',
        exitType: '2',
      });
    });

    it('returns all zeros for an empty day (getRawOne resolves undefined)', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue(undefined);

      const result = await service.getTodayStatsAggregate(start, end);

      expect(result).toEqual({
        entry: 0,
        exit: 0,
        green: 0,
        yellow: 0,
        red: 0,
        total: 0,
      });
    });

    it('falls back to zero for individual null/undefined aggregate fields', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({
        entry: '5',
        exit: null,
        green: undefined,
        yellow: '0',
        red: '0',
        total: '5',
      });

      const result = await service.getTodayStatsAggregate(start, end);

      expect(result).toEqual({
        entry: 5,
        exit: 0,
        green: 0,
        yellow: 0,
        red: 0,
        total: 5,
      });
    });
  });
});
