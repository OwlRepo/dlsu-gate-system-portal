/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  OnModuleInit,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository, DataSource, Table, Raw } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class EmployeeService implements OnModuleInit {
  constructor(
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    private dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.ensureTablesExist();
  }

  private async ensureTablesExist() {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      // Check if employee table exists
      const employeeTableExists = await queryRunner.hasTable('employee');
      if (!employeeTableExists) {
        console.log('Creating employee table...');
        await queryRunner.createTable(
          new Table({
            name: 'employee',
            columns: [
              {
                name: 'id',
                type: 'uuid',
                isPrimary: true,
                generationStrategy: 'uuid',
                default: 'uuid_generate_v4()',
              },
              {
                name: 'email',
                type: 'varchar',
                isUnique: true,
              },
              {
                name: 'employee_id',
                type: 'varchar',
                isUnique: true,
              },
              {
                name: 'username',
                type: 'varchar',
                isUnique: true,
              },
              {
                name: 'password',
                type: 'varchar',
              },
              {
                name: 'first_name',
                type: 'varchar',
              },
              {
                name: 'last_name',
                type: 'varchar',
              },
              {
                name: 'device_id',
                type: 'json',
              },
              {
                name: 'is_active',
                type: 'boolean',
                default: true,
              },
              {
                name: 'date_created',
                type: 'timestamp',
                default: 'CURRENT_TIMESTAMP',
              },
              {
                name: 'date_activated',
                type: 'timestamp',
                default: 'CURRENT_TIMESTAMP',
              },
              {
                name: 'date_deactivated',
                type: 'timestamp',
                isNullable: true,
              },
            ],
          }),
          true,
        );
      }
    } catch (error) {
      console.error('Error ensuring employee table exists:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async generateUniqueEmployeeId(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const generatedId = `EMP${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, '0')}`;

      // Check if this ID already exists
      const existing = await this.employeeRepository.findOne({
        where: { employee_id: generatedId },
      });

      if (!existing) {
        return generatedId;
      }

      attempts++;
    }

    throw new Error(
      'Failed to generate unique employee ID after multiple attempts',
    );
  }

  async create(createEmployeeDto: CreateEmployeeDto) {
    try {
      // Check if device_id array is empty
      if (
        !createEmployeeDto.device_id ||
        createEmployeeDto.device_id.length === 0
      ) {
        throw new BadRequestException('At least one device ID is required');
      }

      // Check for duplicate device IDs
      const uniqueDeviceIds = new Set(createEmployeeDto.device_id);
      if (uniqueDeviceIds.size !== createEmployeeDto.device_id.length) {
        throw new BadRequestException('Duplicate device IDs are not allowed');
      }

      // Check for existing username
      const existingUsername = await this.employeeRepository.findOne({
        where: { username: createEmployeeDto.username },
      });

      if (existingUsername) {
        throw new ConflictException(
          'Username already exists. Please choose a different username.',
        );
      }

      // Generate a unique employee_id
      const generatedemployee_id = await this.generateUniqueEmployeeId();

      // Hash the password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(
        createEmployeeDto.password,
        saltRounds,
      );

      // Create employee with hashed password
      const employee = await this.employeeRepository.create({
        ...createEmployeeDto,
        password: hashedPassword,
        employee_id: generatedemployee_id,
        is_active: true,
        date_created: new Date().toISOString(),
        date_activated: new Date().toISOString(),
        date_deactivated: null,
      });

      // Save to database
      const savedEmployee = await this.employeeRepository.save(employee);

      // Return the response without the hashed password
      const { password, ...employeeWithoutPassword } = savedEmployee;
      return {
        success: true,
        data: employeeWithoutPassword,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  async findAll() {
    try {
      const employees = await this.employeeRepository.find();
      return {
        success: true,
        data: employees,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async findOne(idOrUsername: string) {
    try {
      const employee = await this.employeeRepository.findOne({
        where: [{ employee_id: idOrUsername }, { username: idOrUsername }],
      });
      if (!employee) {
        throw new NotFoundException('Employee not found');
      }
      return {
        success: true,
        data: employee,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  async findByDeviceId(device_id: string) {
    try {
      const employees = await this.employeeRepository
        .createQueryBuilder('employee')
        .where(`device_id::jsonb @> :deviceId::jsonb`, {
          deviceId: JSON.stringify([device_id]),
        })
        .getMany();

      if (employees.length === 0) {
        throw new NotFoundException(
          'No employees found with the given device ID',
        );
      }

      return {
        success: true,
        data: employees,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  async findByDateRange(startDate: string, endDate: string) {
    try {
      console.log('Searching with dates:', { startDate, endDate });

      const employees = await this.employeeRepository
        .createQueryBuilder('employee')
        .select([
          'employee.id',
          'employee.email',
          'employee.employee_id',
          'employee.username',
          'employee.first_name',
          'employee.last_name',
          'employee.device_id',
          'employee.is_active',
          'employee.date_created',
          'employee.date_activated',
          'employee.date_deactivated',
        ])
        .where('employee.date_created BETWEEN :start AND :end', {
          start: startDate,
          end: endDate,
        })
        .getMany();

      console.log('Query result:', employees);

      if (employees.length === 0) {
        throw new NotFoundException(
          'No employees found in the specified date range',
        );
      }

      return {
        success: true,
        data: employees,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  async update(employee_id: string, updateEmployeeDto: UpdateEmployeeDto) {
    try {
      const employee = await this.employeeRepository.findOne({
        where: { employee_id: employee_id },
      });

      if (!employee) {
        throw new NotFoundException('Employee not found');
      }

      // Ensure string values are properly handled
      const allowedUpdates: Partial<Employee> = {};

      if (updateEmployeeDto.username)
        allowedUpdates.username = String(updateEmployeeDto.username);
      if (updateEmployeeDto.first_name)
        allowedUpdates.first_name = String(updateEmployeeDto.first_name);
      if (updateEmployeeDto.last_name)
        allowedUpdates.last_name = String(updateEmployeeDto.last_name);
      if (updateEmployeeDto.device_id)
        allowedUpdates.device_id = updateEmployeeDto.device_id;

      // If password is provided, hash it before updating
      if (updateEmployeeDto.password) {
        const saltRounds = 10;
        allowedUpdates.password = await bcrypt.hash(
          updateEmployeeDto.password,
          saltRounds,
        );
      }

      // Update using employee_id in where clause
      await this.employeeRepository.update(
        { employee_id: employee_id },
        allowedUpdates,
      );

      return {
        success: true,
        message: 'Employee updated successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  async updateDisable(employee_id: string) {
    try {
      const result = await this.employeeRepository.update(
        { employee_id },
        {
          is_active: false,
          date_deactivated: new Date().toISOString(),
        },
      );
      if (result.affected === 0) {
        return {
          success: false,
          message: 'Employee not found',
        };
      }
      return {
        success: true,
        message: 'Employee disabled successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
