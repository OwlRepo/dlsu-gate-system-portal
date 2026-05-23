import { Test, TestingModule } from '@nestjs/testing';
import { LoginService } from './login.service';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Admin } from '../admin/entities/admin.entity';
import { SuperAdmin } from '../super-admin/entities/super-admin.entity';
import { TokenBlacklistService } from '../auth/token-blacklist.service';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role } from '../auth/enums/role.enum';

describe('LoginService', () => {
  let service: LoginService;
  let tokenBlacklistService: TokenBlacklistService;

  const mockAdminRepository = {
    findOne: jest.fn(),
  };

  const mockSuperAdminRepository = {
    findOne: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockTokenBlacklistService = {
    isTokenBlacklisted: jest.fn(),
    blacklistToken: jest.fn(),
    trackUserToken: jest.fn(),
    getActiveTokensByUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: getRepositoryToken(Admin),
          useValue: mockAdminRepository,
        },
        {
          provide: getRepositoryToken(SuperAdmin),
          useValue: mockSuperAdminRepository,
        },
        {
          provide: TokenBlacklistService,
          useValue: mockTokenBlacklistService,
        },
      ],
    }).compile();

    service = module.get<LoginService>(LoginService);
    tokenBlacklistService = module.get<TokenBlacklistService>(
      TokenBlacklistService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateAdminAuthentication', () => {
    const loginDto = {
      username: 'testuser',
      password: 'password123',
    };

    it('should authenticate super admin successfully', async () => {
      const mockSuperAdmin = {
        id: 1,
        username: 'testuser',
        password: await bcrypt.hash('password123', 10),
        email: 'test@example.com',
      };

      mockSuperAdminRepository.findOne.mockResolvedValue(mockSuperAdmin);
      mockJwtService.sign.mockReturnValue('mock_token');
      mockTokenBlacklistService.getActiveTokensByUser.mockResolvedValue([]);

      const result = await service.validateAdminAuthentication(loginDto);

      expect(result).toEqual({
        message: 'Super Admin authentication successful',
        access_token: 'Bearer mock_token',
        user: {
          id: mockSuperAdmin.id,
          username: mockSuperAdmin.username,
          email: mockSuperAdmin.email,
        },
      });
      expect(tokenBlacklistService.trackUserToken).toHaveBeenCalledWith(
        mockSuperAdmin.id,
        Role.SUPER_ADMIN,
        'mock_token',
      );
    });

    it('should authenticate admin successfully', async () => {
      const mockAdmin = {
        id: 1,
        username: 'testuser',
        password: await bcrypt.hash('password123', 10),
        email: 'test@example.com',
      };

      mockSuperAdminRepository.findOne.mockResolvedValue(null);
      mockAdminRepository.findOne.mockResolvedValue(mockAdmin);
      mockJwtService.sign.mockReturnValue('mock_token');
      mockTokenBlacklistService.getActiveTokensByUser.mockResolvedValue([]);

      const result = await service.validateAdminAuthentication(loginDto);

      expect(result).toEqual({
        message: 'Admin authentication successful',
        access_token: 'Bearer mock_token',
        user: {
          id: mockAdmin.id,
          username: mockAdmin.username,
          email: mockAdmin.email,
        },
      });
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      mockSuperAdminRepository.findOne.mockResolvedValue(null);
      mockAdminRepository.findOne.mockResolvedValue(null);

      await expect(
        service.validateAdminAuthentication(loginDto),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should blacklist token and return success message', async () => {
      mockTokenBlacklistService.blacklistToken.mockResolvedValue(undefined);

      const result = await service.logout('test_token');

      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(tokenBlacklistService.blacklistToken).toHaveBeenCalledWith(
        'test_token',
      );
    });
  });

  describe('getAdminInfo', () => {
    it('should return admin info if found', async () => {
      const mockAdmin = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
      };

      mockAdminRepository.findOne.mockResolvedValue(mockAdmin);

      const result = await service.getAdminInfo(1);
      expect(result).toEqual(mockAdmin);
    });

    it('should throw NotFoundException if admin not found', async () => {
      mockAdminRepository.findOne.mockResolvedValue(null);

      await expect(service.getAdminInfo(1)).rejects.toThrow(NotFoundException);
    });
  });
});
