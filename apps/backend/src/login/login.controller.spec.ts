import { Test, TestingModule } from '@nestjs/testing';
import { LoginController } from './login.controller';
import { LoginService } from './login.service';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Admin } from '../admin/entities/admin.entity';
import { SuperAdminAuthService } from './services/super-admin-auth.service';
import { TokenBlacklistService } from '../auth/token-blacklist.service';
import { EmployeeAuthService } from './services/employee-auth.service';
import { ScreensaverService } from '../screensaver/screensaver.service';
import { SuperAdmin } from '../super-admin/entities/super-admin.entity';

describe('LoginController', () => {
  let controller: LoginController;
  let loginService: LoginService;

  const mockAdminRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockSuperAdminAuthService = {
    validateSuperAdmin: jest.fn(),
  };

  const mockTokenBlacklistService = {
    isTokenBlacklisted: jest.fn(),
    blacklistToken: jest.fn(),
  };

  const mockEmployeeAuthService = {
    validateEmployee: jest.fn(),
    login: jest.fn(),
  };

  const mockScreensaverService = {
    getScreensaverInfo: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoginController],
      providers: [
        LoginService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Admin),
          useValue: mockAdminRepository,
        },
        {
          provide: getRepositoryToken(SuperAdmin),
          useValue: mockAdminRepository,
        },
        {
          provide: SuperAdminAuthService,
          useValue: mockSuperAdminAuthService,
        },
        {
          provide: TokenBlacklistService,
          useValue: mockTokenBlacklistService,
        },
        {
          provide: EmployeeAuthService,
          useValue: mockEmployeeAuthService,
        },
        {
          provide: ScreensaverService,
          useValue: mockScreensaverService,
        },
      ],
    }).compile();

    controller = module.get<LoginController>(LoginController);
    loginService = module.get<LoginService>(LoginService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('unifiedLogin', () => {
    it('should validate admin authentication with correct parameters', async () => {
      const adminLoginDto = {
        username: 'admin',
        password: 'password123',
      };

      const expectedResult = {
        message: 'Admin authenticated successfully',
        access_token: 'mock_token',
        user: {
          id: 1,
          admin_id: '1',
          username: 'admin',
          email: 'admin@example.com',
          first_name: 'Admin',
          last_name: 'User',
          role: 'ADMIN',
          created_at: new Date(),
          updated_at: new Date(),
          is_active: true,
          date_activated: new Date(),
          date_deactivated: null,
        },
      };

      jest
        .spyOn(loginService, 'validateAdminAuthentication')
        .mockResolvedValue(expectedResult);

      const result = await controller.unifiedLogin(adminLoginDto);

      expect(loginService.validateAdminAuthentication).toHaveBeenCalledWith(
        adminLoginDto,
      );
      expect(result).toEqual(expectedResult);
    });
  });
});
