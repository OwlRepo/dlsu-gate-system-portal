import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SuperAdmin } from './entities/super-admin.entity';
import { Admin } from '../admin/entities/admin.entity';
import { CreateSuperAdminDto } from './dto/super-admin.dto';
import { CreateAdminDto } from '../admin/dto/create-admin.dto';
import { defaultSuperAdmin } from '../config/default-users.config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Table } from 'typeorm';
import { UpdateSuperAdminDto } from './dto/update-super-admin.dto';

@Injectable()
export class SuperAdminService implements OnModuleInit {
  constructor(
    @InjectRepository(SuperAdmin)
    private superAdminRepository: Repository<SuperAdmin>,
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    private dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.ensureTablesExist();
    await this.initializeDefaultUsers();
  }

  private async ensureTablesExist() {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      // Check if super-admin table exists
      const superAdminTableExists = await queryRunner.hasTable('super-admin');
      if (!superAdminTableExists) {
        console.log('Creating super-admin table...');
        await queryRunner.createTable(
          new Table({
            name: 'super-admin',
            columns: [
              {
                name: 'id',
                type: 'uuid',
                isPrimary: true,
                generationStrategy: 'uuid',
                default: 'uuid_generate_v4()',
              },
              {
                name: 'super_admin_id',
                type: 'varchar',
                isUnique: true,
              },
              {
                name: 'email',
                type: 'varchar',
                isUnique: true,
              },
              {
                name: 'password',
                type: 'varchar',
              },
              {
                name: 'username',
                type: 'varchar',
                isUnique: true,
              },
              {
                name: 'first_name',
                type: 'varchar',
                isNullable: false,
              },
              {
                name: 'last_name',
                type: 'varchar',
                isNullable: false,
              },
              {
                name: 'role',
                type: 'varchar',
              },
              {
                name: 'created_at',
                type: 'timestamp',
                default: 'CURRENT_TIMESTAMP',
              },
              {
                name: 'updated_at',
                type: 'timestamp',
                default: 'CURRENT_TIMESTAMP',
              },
            ],
          }),
          true,
        );
      }

      // Check if admin table exists
      const adminTableExists = await queryRunner.hasTable('admin');
      if (!adminTableExists) {
        console.log('Creating admin table...');
        await queryRunner.createTable(
          new Table({
            name: 'admin',
            columns: [
              {
                name: 'id',
                type: 'uuid',
                isPrimary: true,
                generationStrategy: 'uuid',
                default: 'uuid_generate_v4()',
              },
              {
                name: 'admin_id',
                type: 'varchar',
                isUnique: true,
              },
              {
                name: 'email',
                type: 'varchar',
                isUnique: true,
              },
              {
                name: 'password',
                type: 'varchar',
              },
              {
                name: 'username',
                type: 'varchar',
                isUnique: true,
              },
              {
                name: 'first_name',
                type: 'varchar',
                isNullable: false,
              },
              {
                name: 'last_name',
                type: 'varchar',
                isNullable: false,
              },
              {
                name: 'role',
                type: 'varchar',
              },
              {
                name: 'is_active',
                type: 'boolean',
                default: true,
              },
              {
                name: 'created_at',
                type: 'timestamp',
                default: 'CURRENT_TIMESTAMP',
              },
              {
                name: 'updated_at',
                type: 'timestamp',
                default: 'CURRENT_TIMESTAMP',
              },
            ],
          }),
          true,
        );
      }
    } catch (error) {
      console.error('Error ensuring tables exist:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async initializeDefaultUsers() {
    try {
      // Check only for super admin
      console.log('Checking for existing super admin...');
      const superAdminCount = await this.superAdminRepository.count();
      console.log('Super admin count:', superAdminCount);

      // Only proceed with creation if no super admin exists
      if (superAdminCount === 0) {
        console.log('Creating default super admin...');

        // Create super admin
        const superAdminResult = await this.superAdminRepository.save({
          email: defaultSuperAdmin.email,
          password: await bcrypt.hash(defaultSuperAdmin.password, 10),
          first_name: defaultSuperAdmin.name.split(' ')[0],
          last_name: defaultSuperAdmin.name.split(' ')[1] || '',
          username: defaultSuperAdmin.username,
          role: 'super-admin',
          super_admin_id: this.generateSecureSuperAdminId(),
          created_at: new Date(),
          is_active: true,
          date_activated: new Date(),
          date_deactivated: null,
        });

        console.log('Default super admin created:', {
          ...superAdminResult,
          password: undefined,
        });
        console.log('Successfully created default super admin');
      } else {
        console.log('Super admin already exists, skipping initialization');
      }
    } catch (error) {
      console.error('Error in initializeDefaultUsers:', error);
      // Rethrow the error to ensure the application knows initialization failed
      throw new Error(
        `Failed to initialize default super admin: ${error.message}`,
      );
    }
  }

  private generateSecureAdminId(): string {
    const randomBytes = crypto.randomBytes(6);
    const randomHex = randomBytes.toString('hex').toUpperCase();
    return `ADM-${randomHex}`;
  }

  private generateSecureSuperAdminId(): string {
    const randomBytes = crypto.randomBytes(6);
    const randomHex = randomBytes.toString('hex').toUpperCase();
    return `SAD-${randomHex}`; // SAD prefix for Super ADmin
  }

  async findOneByEmail(email: string) {
    return this.superAdminRepository.findOne({ where: { email } });
  }

  async findOneByUsername(username: string) {
    return this.superAdminRepository.findOne({ where: { username } });
  }

  async createAdmin(createAdminDto: CreateAdminDto) {
    // Check for existing admin with same username
    const existingAdmin = await this.adminRepository.findOne({
      where: { username: createAdminDto.username },
    });

    if (existingAdmin) {
      throw new NotFoundException(
        `Admin with username ${createAdminDto.username} already exists`,
      );
    }

    // Check for existing admin with same email
    const existingEmail = await this.adminRepository.findOne({
      where: { email: createAdminDto.email },
    });

    if (existingEmail) {
      throw new NotFoundException(
        `Admin with email ${createAdminDto.email} already exists`,
      );
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(
      createAdminDto.password,
      saltRounds,
    );

    const admin = this.adminRepository.create({
      ...createAdminDto,
      admin_id: this.generateSecureAdminId(),
      password: hashedPassword,
      role: 'admin',
      is_active: true,
      date_activated: new Date(),
      date_deactivated: null,
      created_at: new Date(),
    });

    const savedAdmin = await this.adminRepository.save(admin);
    savedAdmin.password = undefined;
    return savedAdmin;
  }

  async create(createSuperAdminDto: CreateSuperAdminDto) {
    // Check for existing super admin with same username
    const existingUsername = await this.superAdminRepository.findOne({
      where: { username: createSuperAdminDto.username },
    });

    if (existingUsername) {
      throw new NotFoundException(
        `Super admin with username ${createSuperAdminDto.username} already exists`,
      );
    }

    // Check for existing super admin with same email
    const existingEmail = await this.superAdminRepository.findOne({
      where: { email: createSuperAdminDto.email },
    });

    if (existingEmail) {
      throw new NotFoundException(
        `Super admin with email ${createSuperAdminDto.email} already exists`,
      );
    }

    const hashedPassword = await bcrypt.hash(createSuperAdminDto.password, 10);
    const superAdmin = this.superAdminRepository.create({
      email: createSuperAdminDto.email,
      password: hashedPassword,
      username: createSuperAdminDto.username,
      first_name: createSuperAdminDto.first_name,
      last_name: createSuperAdminDto.last_name,
      role: 'super-admin',
      super_admin_id: this.generateSecureSuperAdminId(),
      is_active: true,
      date_activated: new Date(),
      date_deactivated: null,
    });
    const savedSuperAdmin = await this.superAdminRepository.save(superAdmin);
    savedSuperAdmin.password = undefined;
    return savedSuperAdmin;
  }

  async findOneById(id: string): Promise<SuperAdmin> {
    return this.superAdminRepository.findOne({
      where: { super_admin_id: id },
    });
  }

  async update(id: string, updateSuperAdminDto: UpdateSuperAdminDto) {
    const superAdmin = await this.superAdminRepository.findOne({
      where: { super_admin_id: id },
    });

    if (!superAdmin) {
      throw new NotFoundException('Super admin not found');
    }

    // If password is provided, hash it before saving
    if (updateSuperAdminDto.password) {
      updateSuperAdminDto.password = await bcrypt.hash(
        updateSuperAdminDto.password,
        10,
      );
    }

    updateSuperAdminDto.updated_at = new Date();

    await this.superAdminRepository.update(
      { super_admin_id: id },
      updateSuperAdminDto,
    );
    return this.superAdminRepository.findOne({
      where: { super_admin_id: id },
    });
  }

  async findOne(super_admin_id: string) {
    return this.superAdminRepository.findOne({
      where: { super_admin_id },
    });
  }
}
