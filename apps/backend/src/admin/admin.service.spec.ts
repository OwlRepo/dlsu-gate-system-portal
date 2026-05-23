import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Admin } from './entities/admin.entity';
import { NotFoundException } from '@nestjs/common';

describe('AdminService', () => {
  let service: AdminService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          { id: 1, username: 'admin1', password: 'pass1' },
          { id: 2, username: 'admin2', password: 'pass2' },
        ],
        2,
      ]),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: getRepositoryToken(Admin),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of admins', async () => {
      const admins = [
        { id: 1, username: 'admin1', password: 'pass1' },
        { id: 2, username: 'admin2', password: 'pass2' },
      ];

      mockRepository
        .createQueryBuilder()
        .getManyAndCount.mockResolvedValue([admins, 2]);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result).toEqual({
        items: admins,
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });

  describe('findByAdminId', () => {
    it('should return a single admin', async () => {
      const expected = { id: 1, username: 'admin1', password: 'pass1' };

      mockRepository.findOne.mockResolvedValue(expected);

      const result = await service.findByAdminId('ADM-123456789012');

      expect(result).toEqual(expected);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { admin_id: 'ADM-123456789012' },
      });
    });

    it('should throw NotFoundException when admin is not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findByAdminId('ADM-123456789012')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update an admin', async () => {
      const updateAdminDto = {
        username: 'updatedadmin',
        password: 'newpassword',
      };

      const existingAdmin = {
        id: 1,
        username: 'oldadmin',
        password: 'oldpassword',
      };

      const updatedAdmin = {
        id: 1,
        ...updateAdminDto,
      };

      mockRepository.findOne.mockResolvedValue(existingAdmin);
      mockRepository.save.mockResolvedValue(updatedAdmin);

      const result = await service.update('ADM-123456789012', updateAdminDto);

      expect(result).toEqual(updatedAdmin);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when admin to update is not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update('ADM-123456789012', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
