import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController', () => {
  let controller: AdminController;

  const mockAdminService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    updateByUsername: jest.fn(),
    findByAdminId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: mockAdminService,
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
  describe('findAll', () => {
    it('should return an array of admins', async () => {
      const expected = [
        { id: 1, username: 'admin1', password: 'pass1' },
        { id: 2, username: 'admin2', password: 'pass2' },
      ];

      mockAdminService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(result).toEqual(expected);
      expect(mockAdminService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single admin', async () => {
      const expected = { id: 1, username: 'admin1', password: 'pass1' };

      mockAdminService.findByAdminId = jest.fn().mockResolvedValue(expected);

      const result = await controller.findOne('ADM-123456789012');

      expect(result).toEqual(expected);
      expect(mockAdminService.findByAdminId).toHaveBeenCalledWith(
        'ADM-123456789012',
      );
    });
  });

  describe('updateByUsername', () => {
    it('should update an admin by username', async () => {
      const updateAdminDto = {
        email: 'new.email@example.com',
        first_name: 'Updated',
        last_name: 'Name',
        password: 'newSecurePassword123',
      };

      const expected = { id: 1, ...updateAdminDto };
      mockAdminService.updateByUsername = jest.fn().mockResolvedValue(expected);

      const result = await controller.updateByUsername(
        'admin1',
        updateAdminDto,
      );
      expect(result).toEqual(expected);
    });
  });
});
