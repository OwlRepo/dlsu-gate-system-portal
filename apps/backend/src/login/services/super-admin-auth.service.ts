/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SuperAdminService } from '../../super-admin/super-admin.service';
import { SuperAdminLoginDto } from '../../super-admin/dto/super-admin.dto';
import * as bcrypt from 'bcryptjs';
import { SuperAdmin } from '../../super-admin/entities/super-admin.entity';
import { TokenBlacklistService } from '../../auth/token-blacklist.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class SuperAdminAuthService {
  constructor(
    private superAdminService: SuperAdminService,
    private jwtService: JwtService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    @InjectRepository(SuperAdmin)
    private readonly superAdminRepository: Repository<SuperAdmin>,
  ) {}

  async login(loginDto: SuperAdminLoginDto) {
    const superAdmin = await this.superAdminService.findOneByUsername(
      loginDto.username,
    );

    if (!superAdmin) {
      throw new NotFoundException('Super Admin not found');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      superAdmin.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Invalidate previous tokens before issuing new one
    await this.invalidatePreviousTokens(parseInt(superAdmin.super_admin_id));

    const { password, ...userInfo } = superAdmin;
    const payload = {
      sub: superAdmin.id,
      username: superAdmin.username,
      role: 'super-admin',
    };

    const newToken = this.jwtService.sign(payload);

    // Track the new token
    await this.tokenBlacklistService.trackUserToken(
      parseInt(superAdmin.super_admin_id),
      'super-admin',
      newToken,
    );

    return {
      message: 'Admin authentication successful',
      access_token: 'Bearer ' + newToken,
      user: userInfo,
    };
  }

  private async invalidatePreviousTokens(userId: number) {
    try {
      // Get all active tokens for this user from the blacklist service
      const activeTokens =
        await this.tokenBlacklistService.getActiveTokensByUser(
          userId,
          'super-admin',
        );

      // Blacklist all previous tokens
      for (const token of activeTokens) {
        await this.tokenBlacklistService.blacklistToken(token);
      }
    } catch (error) {
      console.error('Error invalidating previous tokens:', error);
      // Continue with login process even if token invalidation fails
    }
  }

  async getSuperAdminInfo(id: string): Promise<SuperAdmin> {
    const superAdmin = await this.superAdminRepository.findOne({
      where: { id: parseInt(id) },
      select: {
        id: true,
        super_admin_id: true,
        username: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        created_at: true,
        updated_at: true,
        is_active: true,
        date_activated: true,
        date_deactivated: true,
      },
    });

    if (!superAdmin) {
      throw new NotFoundException('Super admin not found');
    }

    return superAdmin;
  }
}
