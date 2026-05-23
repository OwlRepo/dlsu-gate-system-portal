/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminLoginDto } from './dto/admin-login.dto';
import { Admin } from '../admin/entities/admin.entity';
import { SuperAdmin } from '../super-admin/entities/super-admin.entity';
import * as bcrypt from 'bcryptjs';
import { TokenBlacklistService } from '../auth/token-blacklist.service';
import { Role } from '../auth/enums/role.enum';

@Injectable()
export class LoginService {
  constructor(
    private jwtService: JwtService,
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
    @InjectRepository(SuperAdmin)
    private readonly superAdminRepository: Repository<SuperAdmin>,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  private async invalidatePreviousTokens(userId: number, role: string) {
    try {
      // Get all active tokens for this user from the blacklist service
      const activeTokens =
        await this.tokenBlacklistService.getActiveTokensByUser(userId, role);

      // Blacklist all previous tokens
      for (const token of activeTokens) {
        await this.tokenBlacklistService.blacklistToken(token);
      }
    } catch (error) {
      console.error('Error invalidating previous tokens:', error);
      // Continue with login process even if token invalidation fails
    }
  }

  async validateAdminAuthentication(adminLoginDto: AdminLoginDto) {
    // First try super admin
    const superAdmin = await this.superAdminRepository.findOne({
      where: { username: adminLoginDto.username },
    });

    if (superAdmin) {
      const isPasswordValid = await bcrypt.compare(
        adminLoginDto.password,
        superAdmin.password,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Invalidate previous tokens before issuing new one
      await this.invalidatePreviousTokens(superAdmin.id, Role.SUPER_ADMIN);

      const { password, ...userInfo } = superAdmin;
      const payload = {
        username: superAdmin.username,
        sub: superAdmin.id,
        role: Role.SUPER_ADMIN,
      };

      const newToken = this.jwtService.sign(payload);

      // Track the new token
      await this.tokenBlacklistService.trackUserToken(
        superAdmin.id,
        Role.SUPER_ADMIN,
        newToken,
      );

      return {
        message: 'Super Admin authentication successful',
        access_token: 'Bearer ' + newToken,
        user: userInfo,
      };
    }

    // Then try regular admin
    const admin = await this.adminRepository.findOne({
      where: { username: adminLoginDto.username },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      adminLoginDto.password,
      admin.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { password, ...userInfo } = admin;
    const payload = {
      username: admin.username,
      sub: admin.id,
      role: 'ADMIN',
    };

    // Invalidate previous tokens before issuing new one
    await this.invalidatePreviousTokens(admin.id, 'ADMIN');

    const newToken = this.jwtService.sign(payload);
    await this.tokenBlacklistService.trackUserToken(
      admin.id,
      'ADMIN',
      newToken,
    );

    return {
      message: 'Admin authentication successful',
      access_token: 'Bearer ' + newToken,
      user: userInfo,
    };
  }

  async logout(token: string) {
    await this.tokenBlacklistService.blacklistToken(token);
    return { message: 'Logged out successfully' };
  }

  async getAdminInfo(admin_id: number): Promise<Admin> {
    const admin = await this.adminRepository.findOne({
      where: { id: admin_id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        admin_id: true,
        first_name: true,
        last_name: true,
        is_active: true,
        created_at: true,
        date_activated: true,
        date_deactivated: true,
      },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    return admin;
  }
}
