import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Report } from './entities/report.entity';
import { Repository } from 'typeorm';
import { Student } from '../students/entities/student.entity';

describe('ReportsService', () => {
  let service: ReportsService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getRepositoryToken(Report),
          useValue: {
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
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
});
