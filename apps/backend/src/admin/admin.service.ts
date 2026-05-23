import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { Admin } from './entities/admin.entity';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
  ) {
    this.initializeExistingAdmins();
  }

  private async initializeExistingAdmins() {
    try {
      // Find admins where admin_id is null OR empty string
      const admins = await this.adminRepository
        .createQueryBuilder('admin')
        .where('admin.admin_id IS NULL OR admin.admin_id = :emptyString', {
          emptyString: '',
        })
        .getMany();

      for (const admin of admins) {
        admin.admin_id = this.generateSecureAdminId();
        await this.adminRepository.save(admin);
      }

      if (admins.length > 0) {
        console.log(`Initialized admin_id for ${admins.length} admin(s)`);
      }
    } catch (error) {
      console.error('Error initializing existing admins:', error);
      throw error; // Rethrow to ensure initialization failures are noticed
    }
  }

  private generateSecureAdminId(): string {
    const randomBytes = crypto.randomBytes(6);
    const randomHex = randomBytes.toString('hex').toUpperCase();
    return `ADM-${randomHex}`;
  }

  async findAll(query: PaginationQueryDto) {
    const { page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.adminRepository.createQueryBuilder('admin');

    if (search) {
      queryBuilder.where(
        '(admin.username LIKE :search OR admin.email LIKE :search OR admin.first_name LIKE :search OR admin.last_name LIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [items, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByAdminId(admin_id: string) {
    const admin = await this.adminRepository.findOne({ where: { admin_id } });
    if (!admin) {
      throw new NotFoundException(`Admin with admin_id ${admin_id} not found`);
    }
    return admin;
  }

  async update(admin_id: string, updateAdminDto: UpdateAdminDto) {
    const admin = await this.findByAdminId(admin_id);

    if (updateAdminDto.email) {
      const existingEmail = await this.adminRepository.findOne({
        where: { email: updateAdminDto.email },
      });

      if (existingEmail && existingEmail.id !== admin.id) {
        throw new ConflictException(
          `Admin with email ${updateAdminDto.email} already exists`,
        );
      }
    }

    if (updateAdminDto.password) {
      const saltRounds = 10;
      updateAdminDto.password = await bcrypt.hash(
        updateAdminDto.password,
        saltRounds,
      );
    }

    Object.assign(admin, updateAdminDto);
    return this.adminRepository.save(admin);
  }

  async updateByUsername(username: string, updateAdminDto: UpdateAdminDto) {
    const admin = await this.adminRepository.findOne({ where: { username } });
    if (!admin) {
      throw new NotFoundException(`Admin with username ${username} not found`);
    }
    Object.assign(admin, updateAdminDto);
    return this.adminRepository.save(admin);
  }
}
