import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { LoginService } from './login.service';
import { Public } from '../auth/public.decorator';
import {
  ApiBody,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SuperAdminAuthService } from './services/super-admin-auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from '@nestjs/common';
import { EmployeeAuthService } from './services/employee-auth.service';
import { JwtService } from '@nestjs/jwt';
import { ScreensaverService } from '../screensaver/screensaver.service';

@ApiTags('Authentication')
@Controller('auth')
export class LoginController {
  constructor(
    private readonly loginService: LoginService,
    private readonly superAdminAuthService: SuperAdminAuthService,
    private readonly employeeAuthService: EmployeeAuthService,
    private readonly jwtService: JwtService,
    private readonly screensaverService: ScreensaverService,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({
    summary: 'Unified login for admin and super-admin',
    description:
      'Authenticates admin or super-admin users and returns a JWT token with user information.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string', example: 'admin' },
        password: { type: 'string', example: 'password' },
      },
      required: ['username', 'password'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'User successfully authenticated',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        access_token: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
            email: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            // Add other relevant user fields here, excluding password
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid credentials',
  })
  async unifiedLogin(
    @Body()
    loginDto: {
      username: string;
      password: string;
    },
  ) {
    // First try admin login
    try {
      const adminResult = await this.loginService.validateAdminAuthentication({
        username: loginDto.username,
        password: loginDto.password,
      });
      if (adminResult.user.is_active === false) {
        throw new UnauthorizedException('Account is not active');
      }
      return adminResult;
    } catch (error) {
      // If error is about inactive account, propagate it
      if (
        error instanceof UnauthorizedException &&
        error.message === 'Account is not active'
      ) {
        throw error;
      }

      // If admin login fails, try super-admin login
      try {
        const superAdminResult = await this.superAdminAuthService.login({
          username: loginDto.username,
          password: loginDto.password,
        });
        if (superAdminResult.user.is_active === false) {
          throw new UnauthorizedException('Account is not active');
        }
        return superAdminResult;
      } catch (superAdminError) {
        // If super admin error is about inactive account, propagate it
        if (
          superAdminError instanceof UnauthorizedException &&
          superAdminError.message === 'Account is not active'
        ) {
          throw superAdminError;
        }
        // If both fail, throw unauthorized exception
        throw new UnauthorizedException('Invalid credentials');
      }
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiOperation({
    summary: 'Logout user',
    description:
      'Logs out the user and invalidates their token. Requires authentication.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Successfully logged out' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
  async logout(@Request() req) {
    const token = req.headers.authorization?.split(' ')[1];
    return this.loginService.logout(token);
  }

  @Public()
  @Post('employee')
  @ApiOperation({ summary: 'Employee login' })
  @ApiBody({
    schema: {
      example: {
        username: 'john.doe',
        password: 'secretPassword123',
      },
    },
  })
  async employeeLogin(
    @Body() loginDto: { username: string; password: string },
  ) {
    const employee = await this.employeeAuthService.validateEmployee(
      loginDto.username,
      loginDto.password,
    );
    if (employee.is_active === false) {
      throw new UnauthorizedException('Account is not active');
    }
    return this.employeeAuthService.login(employee);
  }

  @UseGuards(JwtAuthGuard)
  @Get('validate')
  @ApiOperation({
    summary: 'Validate token and return user information',
    description:
      'Validates the provided JWT token and returns the associated user information',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Token is valid, user information returned',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        username: { type: 'string' },
        role: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async validateToken(@Request() req) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    const decodedToken = this.jwtService.decode(token);
    if (!decodedToken) {
      throw new UnauthorizedException('Invalid token');
    }

    const userType = decodedToken['role'];
    let userInfo;

    try {
      switch (userType) {
        case 'admin':
          userInfo = await this.loginService.getAdminInfo(decodedToken['sub']);
          break;
        case 'super-admin':
          userInfo = await this.superAdminAuthService.getSuperAdminInfo(
            decodedToken['sub'],
          );
          break;
        case 'employee':
          userInfo = await this.employeeAuthService.getEmployeeInfo(
            decodedToken['sub'],
          );
          userInfo.password = undefined;
          userInfo = {
            ...userInfo,
          };
          break;
        default:
          throw new UnauthorizedException('Invalid user type');
      }

      const { ...userInfoWithoutPassword } = userInfo;
      return userInfoWithoutPassword;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(`${userType} not found`);
      }
      throw error;
    }
  }
}
