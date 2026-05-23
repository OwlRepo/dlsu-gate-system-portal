import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../employee/entities/employee.entity';
import { Admin } from '../admin/entities/admin.entity';
import { UserDto } from './dto/user.dto';
import { SuperAdmin } from 'src/super-admin/entities/super-admin.entity';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { UserPaginationDto } from './dto/user-pagination.dto';
import { Role } from 'src/auth/enums/role.enum';
import { Response } from 'express';
import { BulkDeactivateDto } from './dto/bulk-deactivate.dto';
import { BulkDeactivateResponseDto } from './dto/bulk-deactivate-response.dto';
import { In } from 'typeorm';
import { BulkReactivateDto } from './dto/bulk-reactivate.dto';
import { BulkReactivateResponseDto } from './dto/bulk-reactivate-response.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    @InjectRepository(SuperAdmin)
    private superAdminRepository: Repository<SuperAdmin>,
  ) {}

  async getAllUsers(query: UserPaginationDto): Promise<any> {
    const { page = 1, limit = 10, search, type, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const allUsers: UserDto[] = [];

    // Helper function to build date conditions
    const getDateCondition = (type: string) => {
      const dateCondition =
        type === 'admin' || type === 'super-admin'
          ? 'created_at'
          : 'date_created';
      if (startDate && endDate) {
        return `AND ${dateCondition} BETWEEN :startDate AND :endDate`;
      }
      return '';
    };

    const dateParams = startDate && endDate ? { startDate, endDate } : {};

    if (!type || type === 'admin') {
      const admins = await this.adminRepository
        .createQueryBuilder('admin')
        .where(
          search
            ? 'admin.username LIKE :search OR admin.email LIKE :search OR admin.first_name LIKE :search OR admin.last_name LIKE :search ' +
                getDateCondition('admin')
            : '1=1 ' + getDateCondition('admin'),
          {
            search: `%${search}%`,
            ...dateParams,
          },
        )
        .getMany();
      allUsers.push(
        ...admins.map((admin) => ({
          id: admin.admin_id,
          username: admin.username,
          email: admin.email,
          first_name: admin.first_name,
          last_name: admin.last_name,
          userType: 'admin' as const,
          created_at: new Date(admin.created_at),
          is_active: admin.is_active,
        })),
      );
    }

    if (!type || type === 'employee') {
      const employees = await this.employeeRepository
        .createQueryBuilder('employee')
        .where(
          search
            ? 'employee.username LIKE :search OR employee.email LIKE :search OR employee.first_name LIKE :search OR employee.last_name LIKE :search ' +
                getDateCondition('employee')
            : '1=1 ' + getDateCondition('employee'),
          {
            search: `%${search}%`,
            ...dateParams,
          },
        )
        .getMany();
      allUsers.push(
        ...employees.map((employee) => ({
          id: employee.employee_id,
          username: employee.username,
          email: employee.email,
          first_name: employee.first_name,
          last_name: employee.last_name,
          userType: 'employee' as const,
          created_at: new Date(employee.date_created),
          is_active: employee.is_active,
        })),
      );
    }

    if (!type || type === 'super-admin') {
      const superAdmins = await this.superAdminRepository
        .createQueryBuilder('superAdmin')
        .where(
          search
            ? 'superAdmin.username LIKE :search OR superAdmin.email LIKE :search OR superAdmin.first_name LIKE :search OR superAdmin.last_name LIKE :search ' +
                getDateCondition('super-admin')
            : '1=1 ' + getDateCondition('super-admin'),
          {
            search: `%${search}%`,
            ...dateParams,
          },
        )
        .getMany();
      allUsers.push(
        ...superAdmins.map((superAdmin) => ({
          id: superAdmin.super_admin_id,
          username: superAdmin.username,
          email: superAdmin.email,
          first_name: superAdmin.first_name,
          last_name: superAdmin.last_name,
          userType: 'super-admin' as const,
          created_at: new Date(),
          is_active: superAdmin.is_active,
        })),
      );
    }

    const total = allUsers.length;
    const items = allUsers.slice(skip, skip + limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAdminUsers(query: PaginationQueryDto): Promise<any> {
    const { page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.adminRepository.createQueryBuilder('admin');

    if (search) {
      queryBuilder.where(
        '(admin.username LIKE :search OR admin.email LIKE :search OR admin.first_name LIKE :search OR admin.last_name LIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [admins, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const items = admins.map((admin) => ({
      id: admin.admin_id,
      username: admin.username,
      email: admin.email,
      first_name: admin.first_name,
      last_name: admin.last_name,
      userType: 'admin' as const,
      created_at: new Date(admin.created_at),
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getEmployeeUsers(query: PaginationQueryDto): Promise<any> {
    const { page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.employeeRepository.createQueryBuilder('employee');

    if (search) {
      queryBuilder.where(
        '(employee.username LIKE :search OR employee.email LIKE :search OR employee.first_name LIKE :search OR employee.last_name LIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [employees, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const items = employees.map((employee) => ({
      id: employee.employee_id,
      username: employee.username,
      email: employee.email,
      first_name: employee.first_name,
      last_name: employee.last_name,
      userType: 'employee' as const,
      created_at: new Date(employee.date_created),
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSuperAdminUsers(): Promise<UserDto[]> {
    const superAdmins = await this.superAdminRepository.find({
      select: { password: false },
    });
    return superAdmins.map((superAdmin) => ({
      id: superAdmin.super_admin_id,
      username: superAdmin.username,
      email: superAdmin.email,
      first_name: superAdmin.first_name,
      last_name: superAdmin.last_name,
      userType: 'super-admin' as const,
      created_at: new Date(),
    }));
  }

  async generateUsersCsv(
    types: (Role.ADMIN | Role.EMPLOYEE | Role.SUPER_ADMIN)[],
    startDate: string,
    endDate: string,
  ): Promise<string> {
    const users: UserDto[] = [];

    // Helper function to build date conditions
    const getDateCondition = (userType: string) => {
      const dateCondition =
        userType === 'admin' || userType === 'super-admin'
          ? 'created_at'
          : 'date_created';
      return `${dateCondition} BETWEEN :startDate AND :endDate`;
    };

    const dateParams = { startDate, endDate };

    // Fetch users for each requested type
    for (const type of types) {
      switch (type) {
        case Role.ADMIN:
          const admins = await this.adminRepository
            .createQueryBuilder('admin')
            .where(getDateCondition('admin'), dateParams)
            .orderBy('admin.created_at', 'ASC')
            .getMany();

          users.push(
            ...admins.map((admin) => ({
              id: admin.admin_id,
              username: admin.username,
              email: admin.email,
              first_name: admin.first_name,
              last_name: admin.last_name,
              userType: 'admin' as const,
              created_at: new Date(admin.created_at),
            })),
          );
          break;

        case Role.EMPLOYEE:
          const employees = await this.employeeRepository
            .createQueryBuilder('employee')
            .where(getDateCondition('employee'), dateParams)
            .orderBy('employee.date_created', 'ASC')
            .getMany();

          users.push(
            ...employees.map((employee) => ({
              id: employee.employee_id,
              username: employee.username,
              email: employee.email,
              first_name: employee.first_name,
              last_name: employee.last_name,
              userType: 'employee' as const,
              created_at: new Date(employee.date_created),
            })),
          );
          break;

        case Role.SUPER_ADMIN:
          const superAdmins = await this.superAdminRepository
            .createQueryBuilder('superAdmin')
            .where(getDateCondition('super-admin'), dateParams)
            .orderBy('superAdmin.created_at', 'ASC')
            .getMany();

          users.push(
            ...superAdmins.map((superAdmin) => ({
              id: superAdmin.super_admin_id,
              username: superAdmin.username,
              email: superAdmin.email,
              first_name: superAdmin.first_name,
              last_name: superAdmin.last_name,
              userType: 'super-admin' as const,
              created_at: new Date(superAdmin.created_at),
            })),
          );
          break;
      }
    }

    // Sort all users by creation date
    users.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

    // Generate CSV header
    const headers = [
      'ID',
      'Username',
      'Email',
      'First Name',
      'Last Name',
      'User Type',
      'Created At',
    ];

    // Generate CSV rows
    const rows = users.map((user) => [
      user.id,
      user.username,
      user.email,
      user.first_name,
      user.last_name,
      user.userType,
      user.created_at.toISOString(),
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    return csvContent;
  }

  async streamUsersCsv(
    types: Role[],
    startDate: string,
    endDate: string,
    res: Response,
  ): Promise<void> {
    // Write CSV headers
    const headers = [
      'ID',
      'Username',
      'Email',
      'First Name',
      'Last Name',
      'User Type',
      'Created At',
    ];
    res.write(headers.join(',') + '\n');

    const dateParams = { startDate, endDate };

    // Helper function to build date conditions
    const getDateCondition = (userType: string) => {
      const dateCondition =
        userType === 'admin' || userType === 'super-admin'
          ? 'created_at'
          : 'date_created';
      return `${dateCondition} BETWEEN :startDate AND :endDate`;
    };

    // Process each type sequentially
    for (const type of types) {
      let users: any[] = [];

      switch (type) {
        case Role.ADMIN:
          users = await this.adminRepository
            .createQueryBuilder('admin')
            .where(getDateCondition('admin'), dateParams)
            .orderBy('admin.created_at', 'ASC')
            .getMany();

          for (const user of users) {
            const row = [
              user.admin_id,
              user.username,
              user.email,
              user.first_name,
              user.last_name,
              'admin',
              new Date(user.created_at).toISOString(),
            ]
              .map((field) => `"${field}"`)
              .join(',');
            res.write(row + '\n');
          }
          break;

        case Role.EMPLOYEE:
          users = await this.employeeRepository
            .createQueryBuilder('employee')
            .where(getDateCondition('employee'), dateParams)
            .orderBy('employee.date_created', 'ASC')
            .getMany();

          for (const user of users) {
            const row = [
              user.employee_id,
              user.username,
              user.email,
              user.first_name,
              user.last_name,
              'employee',
              new Date(user.date_created).toISOString(),
            ]
              .map((field) => `"${field}"`)
              .join(',');
            res.write(row + '\n');
          }
          break;

        case Role.SUPER_ADMIN:
          users = await this.superAdminRepository
            .createQueryBuilder('superAdmin')
            .where(getDateCondition('super-admin'), dateParams)
            .orderBy('superAdmin.created_at', 'ASC')
            .getMany();

          for (const user of users) {
            const row = [
              user.super_admin_id,
              user.username,
              user.email,
              user.first_name,
              user.last_name,
              'super-admin',
              new Date(user.created_at).toISOString(),
            ]
              .map((field) => `"${field}"`)
              .join(',');
            res.write(row + '\n');
          }
          break;
      }
    }

    res.end();
  }

  async bulkDeactivateUsers(
    bulkDeactivateDto: BulkDeactivateDto,
  ): Promise<BulkDeactivateResponseDto> {
    const { userIds, userType } = bulkDeactivateDto;
    const now = new Date();
    const response: BulkDeactivateResponseDto = {
      status: 'success',
      userType,
      totalProcessed: userIds.length,
      timestamp: now.toISOString(),
      successful: {
        count: 0,
        userIds: [],
        details: [],
      },
      alreadyInactive: {
        count: 0,
        userIds: [],
        details: [],
      },
      notFound: {
        count: 0,
        userIds: [],
        details: [],
      },
      message: '',
      display: {
        title: 'Bulk Deactivation Complete',
        success: '',
        warnings: [],
        actionRequired: false,
      },
    };

    try {
      switch (userType) {
        case Role.EMPLOYEE:
          // First, get current status of all users with their details
          const employees = await this.employeeRepository.find({
            where: { employee_id: In(userIds) },
            select: [
              'employee_id',
              'is_active',
              'username',
              'email',
              'first_name',
              'last_name',
            ],
          });

          // Track not found users
          response.notFound.userIds = userIds.filter(
            (id) => !employees.some((emp) => emp.employee_id === id),
          );
          response.notFound.count = response.notFound.userIds.length;

          // Track already inactive users
          const inactiveEmployees = employees.filter((emp) => !emp.is_active);
          response.alreadyInactive.userIds = inactiveEmployees.map(
            (emp) => emp.employee_id,
          );
          response.alreadyInactive.count = inactiveEmployees.length;
          response.alreadyInactive.details = inactiveEmployees.map((emp) => ({
            id: emp.employee_id,
            username: emp.username,
            email: emp.email,
            name: `${emp.first_name} ${emp.last_name}`,
          }));

          // Get active users to deactivate
          const activeEmployees = employees.filter((emp) => emp.is_active);
          const activeEmployeeIds = activeEmployees.map(
            (emp) => emp.employee_id,
          );

          if (activeEmployeeIds.length > 0) {
            const result = await this.employeeRepository
              .createQueryBuilder()
              .update(Employee)
              .set({
                is_active: false,
                date_deactivated: now.toISOString(),
              })
              .where('employee_id IN (:...ids)', { ids: activeEmployeeIds })
              .execute();

            response.successful.count = result.affected || 0;
            response.successful.userIds = activeEmployeeIds;
            response.successful.details = activeEmployees.map((emp) => ({
              id: emp.employee_id,
              username: emp.username,
              email: emp.email,
              name: `${emp.first_name} ${emp.last_name}`,
            }));
          }
          break;

        case Role.ADMIN:
          // First, get current status of all users with their details
          const admins = await this.adminRepository.find({
            where: { admin_id: In(userIds) },
            select: [
              'admin_id',
              'is_active',
              'username',
              'email',
              'first_name',
              'last_name',
            ],
          });

          // Track not found users
          response.notFound.userIds = userIds.filter(
            (id) => !admins.some((admin) => admin.admin_id === id),
          );
          response.notFound.count = response.notFound.userIds.length;

          // Track already inactive users
          const inactiveAdmins = admins.filter((admin) => !admin.is_active);
          response.alreadyInactive.userIds = inactiveAdmins.map(
            (admin) => admin.admin_id,
          );
          response.alreadyInactive.count = inactiveAdmins.length;
          response.alreadyInactive.details = inactiveAdmins.map((admin) => ({
            id: admin.admin_id,
            username: admin.username,
            email: admin.email,
            name: `${admin.first_name} ${admin.last_name}`,
          }));

          // Get active users to deactivate
          const activeAdmins = admins.filter((admin) => admin.is_active);
          const activeAdminIds = activeAdmins.map((admin) => admin.admin_id);

          if (activeAdminIds.length > 0) {
            const result = await this.adminRepository
              .createQueryBuilder()
              .update(Admin)
              .set({
                is_active: false,
                date_deactivated: now.toISOString(),
              })
              .where('admin_id IN (:...ids)', { ids: activeAdminIds })
              .execute();

            response.successful.count = result.affected || 0;
            response.successful.userIds = activeAdminIds;
            response.successful.details = activeAdmins.map((admin) => ({
              id: admin.admin_id,
              username: admin.username,
              email: admin.email,
              name: `${admin.first_name} ${admin.last_name}`,
            }));
          }
          break;

        case Role.SUPER_ADMIN:
          // First, get current status of all users with their details
          const superAdmins = await this.superAdminRepository.find({
            where: { super_admin_id: In(userIds) },
            select: [
              'super_admin_id',
              'is_active',
              'username',
              'email',
              'first_name',
              'last_name',
            ],
          });

          // Track not found users
          response.notFound.userIds = userIds.filter(
            (id) => !superAdmins.some((admin) => admin.super_admin_id === id),
          );
          response.notFound.count = response.notFound.userIds.length;

          // Track already inactive users
          const inactiveSuperAdmins = superAdmins.filter(
            (admin) => !admin.is_active,
          );
          response.alreadyInactive.userIds = inactiveSuperAdmins.map(
            (admin) => admin.super_admin_id,
          );
          response.alreadyInactive.count = inactiveSuperAdmins.length;
          response.alreadyInactive.details = inactiveSuperAdmins.map(
            (admin) => ({
              id: admin.super_admin_id,
              username: admin.username,
              email: admin.email,
              name: `${admin.first_name} ${admin.last_name}`,
            }),
          );

          // Get active users to deactivate
          const activeSuperAdmins = superAdmins.filter(
            (admin) => admin.is_active,
          );
          const activeSuperAdminIds = activeSuperAdmins.map(
            (admin) => admin.super_admin_id,
          );

          if (activeSuperAdminIds.length > 0) {
            const result = await this.superAdminRepository
              .createQueryBuilder()
              .update(SuperAdmin)
              .set({
                is_active: false,
                date_deactivated: now.toISOString(),
              })
              .where('super_admin_id IN (:...ids)', {
                ids: activeSuperAdminIds,
              })
              .execute();

            response.successful.count = result.affected || 0;
            response.successful.userIds = activeSuperAdminIds;
            response.successful.details = activeSuperAdmins.map((admin) => ({
              id: admin.super_admin_id,
              username: admin.username,
              email: admin.email,
              name: `${admin.first_name} ${admin.last_name}`,
            }));
          }
          break;

        default:
          throw new BadRequestException('Invalid user type');
      }

      // Generate human-readable message and display information
      const messages: string[] = [];
      if (response.successful.count > 0) {
        messages.push(
          `Successfully deactivated ${response.successful.count} user${
            response.successful.count !== 1 ? 's' : ''
          }`,
        );
        response.display.success = messages[0];
      }

      if (response.alreadyInactive.count > 0) {
        const msg = `${response.alreadyInactive.count} user${
          response.alreadyInactive.count !== 1 ? 's were' : ' was'
        } already inactive`;
        messages.push(msg);
        response.display.warnings.push(msg);
      }

      if (response.notFound.count > 0) {
        const msg = `${response.notFound.count} user${
          response.notFound.count !== 1 ? 's were' : ' was'
        } not found`;
        messages.push(msg);
        response.display.warnings.push(msg);
      }

      response.message = messages.join('. ');

      // Set overall status
      if (response.successful.count === 0) {
        response.status = 'failed';
        response.display.title = 'Bulk Deactivation Failed';
        response.display.actionRequired = true;
      } else if (
        response.alreadyInactive.count > 0 ||
        response.notFound.count > 0
      ) {
        response.status = 'partial_success';
        response.display.title = 'Bulk Deactivation Partially Complete';
        response.display.actionRequired = response.notFound.count > 0; // Only require action if users were not found
      }

      return response;
    } catch (error) {
      throw new BadRequestException(
        `Failed to deactivate users: ${error.message}`,
      );
    }
  }

  async bulkReactivateUsers(
    bulkReactivateDto: BulkReactivateDto,
  ): Promise<BulkReactivateResponseDto> {
    const { userIds, userType } = bulkReactivateDto;
    const now = new Date();

    // Initialize response structure
    const response: BulkReactivateResponseDto = {
      status: 'success',
      userType,
      totalProcessed: userIds.length,
      timestamp: now.toISOString(),
      successful: { count: 0, userIds: [], details: [] },
      alreadyActive: { count: 0, userIds: [], details: [] },
      notFound: { count: 0, userIds: [], details: [] },
      message: '',
      display: {
        title: 'Bulk Reactivation Complete',
        success: '',
        warnings: [],
        actionRequired: false,
      },
    };

    try {
      switch (userType) {
        case Role.EMPLOYEE:
          // First, get current status of all users with their details
          const employees = await this.employeeRepository.find({
            where: { employee_id: In(userIds) },
            select: [
              'employee_id',
              'is_active',
              'username',
              'email',
              'first_name',
              'last_name',
            ],
          });

          // Track not found users
          response.notFound.userIds = userIds.filter(
            (id) => !employees.some((emp) => emp.employee_id === id),
          );
          response.notFound.count = response.notFound.userIds.length;

          // Track already active users
          const activeEmployees = employees.filter((emp) => emp.is_active);
          response.alreadyActive.userIds = activeEmployees.map(
            (emp) => emp.employee_id,
          );
          response.alreadyActive.count = activeEmployees.length;
          response.alreadyActive.details = activeEmployees.map((emp) => ({
            id: emp.employee_id,
            username: emp.username,
            email: emp.email,
            name: `${emp.first_name} ${emp.last_name}`,
          }));

          // Get inactive users to reactivate
          const inactiveEmployees = employees.filter((emp) => !emp.is_active);
          const inactiveEmployeeIds = inactiveEmployees.map(
            (emp) => emp.employee_id,
          );

          if (inactiveEmployeeIds.length > 0) {
            const result = await this.employeeRepository
              .createQueryBuilder()
              .update(Employee)
              .set({
                is_active: true,
                date_deactivated: null,
              })
              .where('employee_id IN (:...ids)', { ids: inactiveEmployeeIds })
              .execute();

            response.successful.count = result.affected || 0;
            response.successful.userIds = inactiveEmployeeIds;
            response.successful.details = inactiveEmployees.map((emp) => ({
              id: emp.employee_id,
              username: emp.username,
              email: emp.email,
              name: `${emp.first_name} ${emp.last_name}`,
            }));
          }
          break;

        case Role.ADMIN:
          // First, get current status of all users with their details
          const admins = await this.adminRepository.find({
            where: { admin_id: In(userIds) },
            select: [
              'admin_id',
              'is_active',
              'username',
              'email',
              'first_name',
              'last_name',
            ],
          });

          // Track not found users
          response.notFound.userIds = userIds.filter(
            (id) => !admins.some((admin) => admin.admin_id === id),
          );
          response.notFound.count = response.notFound.userIds.length;

          // Track already active users
          const activeAdmins = admins.filter((admin) => admin.is_active);
          response.alreadyActive.userIds = activeAdmins.map(
            (admin) => admin.admin_id,
          );
          response.alreadyActive.count = activeAdmins.length;
          response.alreadyActive.details = activeAdmins.map((admin) => ({
            id: admin.admin_id,
            username: admin.username,
            email: admin.email,
            name: `${admin.first_name} ${admin.last_name}`,
          }));

          // Get inactive users to reactivate
          const inactiveAdmins = admins.filter((admin) => !admin.is_active);
          const inactiveAdminIds = inactiveAdmins.map(
            (admin) => admin.admin_id,
          );

          if (inactiveAdminIds.length > 0) {
            const result = await this.adminRepository
              .createQueryBuilder()
              .update(Admin)
              .set({
                is_active: true,
                date_deactivated: null,
              })
              .where('admin_id IN (:...ids)', { ids: inactiveAdminIds })
              .execute();

            response.successful.count = result.affected || 0;
            response.successful.userIds = inactiveAdminIds;
            response.successful.details = inactiveAdmins.map((admin) => ({
              id: admin.admin_id,
              username: admin.username,
              email: admin.email,
              name: `${admin.first_name} ${admin.last_name}`,
            }));
          }
          break;

        case Role.SUPER_ADMIN:
          // First, get current status of all users with their details
          const superAdmins = await this.superAdminRepository.find({
            where: { super_admin_id: In(userIds) },
            select: [
              'super_admin_id',
              'is_active',
              'username',
              'email',
              'first_name',
              'last_name',
            ],
          });

          // Track not found users
          response.notFound.userIds = userIds.filter(
            (id) => !superAdmins.some((admin) => admin.super_admin_id === id),
          );
          response.notFound.count = response.notFound.userIds.length;

          // Track already active users
          const activeSuperAdmins = superAdmins.filter(
            (admin) => admin.is_active,
          );
          response.alreadyActive.userIds = activeSuperAdmins.map(
            (admin) => admin.super_admin_id,
          );
          response.alreadyActive.count = activeSuperAdmins.length;
          response.alreadyActive.details = activeSuperAdmins.map((admin) => ({
            id: admin.super_admin_id,
            username: admin.username,
            email: admin.email,
            name: `${admin.first_name} ${admin.last_name}`,
          }));

          // Get inactive users to reactivate
          const inactiveSuperAdmins = superAdmins.filter(
            (admin) => !admin.is_active,
          );
          const inactiveSuperAdminIds = inactiveSuperAdmins.map(
            (admin) => admin.super_admin_id,
          );

          if (inactiveSuperAdminIds.length > 0) {
            const result = await this.superAdminRepository
              .createQueryBuilder()
              .update(SuperAdmin)
              .set({
                is_active: true,
                date_deactivated: null,
              })
              .where('super_admin_id IN (:...ids)', {
                ids: inactiveSuperAdminIds,
              })
              .execute();

            response.successful.count = result.affected || 0;
            response.successful.userIds = inactiveSuperAdminIds;
            response.successful.details = inactiveSuperAdmins.map((admin) => ({
              id: admin.super_admin_id,
              username: admin.username,
              email: admin.email,
              name: `${admin.first_name} ${admin.last_name}`,
            }));
          }
          break;

        default:
          throw new BadRequestException('Invalid user type');
      }

      // Generate human-readable message and display information
      const messages: string[] = [];
      if (response.successful.count > 0) {
        messages.push(
          `Successfully reactivated ${response.successful.count} user${
            response.successful.count !== 1 ? 's' : ''
          }`,
        );
        response.display.success = messages[0];
      }

      if (response.alreadyActive.count > 0) {
        const msg = `${response.alreadyActive.count} user${
          response.alreadyActive.count !== 1 ? 's were' : ' was'
        } already active`;
        messages.push(msg);
        response.display.warnings.push(msg);
      }

      if (response.notFound.count > 0) {
        const msg = `${response.notFound.count} user${
          response.notFound.count !== 1 ? 's were' : ' was'
        } not found`;
        messages.push(msg);
        response.display.warnings.push(msg);
      }

      response.message = messages.join('. ');

      // Set overall status
      if (response.successful.count === 0) {
        response.status = 'failed';
        response.display.title = 'Bulk Reactivation Failed';
        response.display.actionRequired = true;
      } else if (
        response.alreadyActive.count > 0 ||
        response.notFound.count > 0
      ) {
        response.status = 'partial_success';
        response.display.title = 'Bulk Reactivation Partially Complete';
        response.display.actionRequired = response.notFound.count > 0; // Only require action if users were not found
      }

      return response;
    } catch (error) {
      throw new BadRequestException(
        `Failed to reactivate users: ${error.message}`,
      );
    }
  }
}
