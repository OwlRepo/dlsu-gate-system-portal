import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { UnprocessableEntityException } from '@nestjs/common';
import { Response } from 'express';
import { Report } from './entities/report.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('ReportsController', () => {
  let controller: ReportsController;
  let service: ReportsService;

  const mockReportsService = {
    findAll: jest.fn(),
    create: jest.fn(),
    generateCSVReport: jest.fn(),
    cleanupFile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          useValue: mockReportsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportsController>(ReportsController);
    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all reports with basic pagination', async () => {
      const result = [{ id: '1', name: 'Test Report' }] as unknown as Report[];
      jest.spyOn(service, 'findAll').mockResolvedValue(result as any);

      expect(await controller.findAll({ page: 1, limit: 10 })).toBe(result);
    });

    it('should throw error if search term is too short', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockRejectedValue(
          new UnprocessableEntityException(
            'Search term must be at least 3 characters long',
          ),
        );

      await expect(controller.findAll({ searchTerm: 'ab' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should return filtered reports by search term', async () => {
      const result = [{ id: '1', name: 'Test Report' }] as unknown as Report[];
      jest.spyOn(service, 'findAll').mockResolvedValue(result as any);

      expect(await controller.findAll({ searchTerm: 'test' })).toBe(result);
    });

    it('should throw error for invalid date format', async () => {
      await expect(
        controller.findAll({ startDate: 'invalid', endDate: '2024-03-20' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw error if only one date is provided', async () => {
      await expect(
        controller.findAll({ startDate: '2024-03-20' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should return reports within date range', async () => {
      const result = [
        { id: '1', datetime: '2024-03-20' },
      ] as unknown as Report[];
      jest.spyOn(service, 'findAll').mockResolvedValue(result as any);

      expect(
        await controller.findAll({
          startDate: '2024-03-19',
          endDate: '2024-03-20',
        }),
      ).toBe(result);
    });

    it('should throw error if start date is after end date', async () => {
      await expect(
        controller.findAll({
          startDate: '2024-03-21',
          endDate: '2024-03-20',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should return reports filtered by type', async () => {
      const result = [{ id: '1', type: '1' }] as unknown as Report[];
      jest.spyOn(service, 'findAll').mockResolvedValue(result as any);

      expect(await controller.findAll({ type: '1' })).toBe(result);
    });
  });

  describe('generateCSV', () => {
    it('should generate and download CSV', async () => {
      const mockResponse = {
        download: jest.fn(),
      } as unknown as Response;

      jest.spyOn(service, 'generateCSVReport').mockResolvedValue({
        filePath: 'path/to/file',
        fileName: 'report.csv',
      });

      await controller.generateCSV(
        { startDate: '2024-03-19', endDate: '2024-03-20' },
        mockResponse,
      );
      expect(mockResponse.download).toHaveBeenCalled();
    });
  });
});
