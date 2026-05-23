import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import {
  ApiTags,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('employee')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create a new employee',
    description:
      'Creates a new employee with the provided information. Requires Admin privileges.',
  })
  @ApiBody({
    type: CreateEmployeeDto,
    description: 'Employee creation data',
    examples: {
      example1: {
        value: {
          username: 'john.doe',
          password: 'secretPassword123',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john.doe@example.com',
          is_active: true,
          device_id: ['1234567890'],
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Employee successfully created',
    type: CreateEmployeeDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid data' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires Admin privileges',
  })
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeeService.create(createEmployeeDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all employees',
    description:
      'Retrieves all employees. Available to all authenticated users.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all employees',
    type: [CreateEmployeeDto],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires Admin privileges',
  })
  findAll() {
    return this.employeeService.findAll();
  }

  @Get('created')
  @ApiOperation({ summary: 'Get employees created within a date range' })
  @ApiResponse({
    status: 200,
    description: 'List of employees created within the date range',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            email: 'john.doe@example.com',
            employee_id: 'EMP1234',
            username: 'john.doe',
            first_name: 'John',
            last_name: 'Doe',
            device_id: ['1234567890'],
            is_active: true,
            date_created: '2024-03-20T10:00:00.000Z',
            date_activated: '2024-03-20T10:00:00.000Z',
            date_deactivated: null,
          },
        ],
      },
    },
  })
  findByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    console.log('startDate', startDate);
    console.log('endDate', endDate);
    return this.employeeService.findByDateRange(startDate, endDate);
  }

  @Get('device/:device_id')
  @ApiOperation({ summary: 'Get employee by device ID' })
  findByDeviceId(@Param('device_id') device_id: string) {
    return this.employeeService.findByDeviceId(device_id);
  }

  @Get(':idOrUsername')
  @ApiOperation({
    summary: 'Get employee by ID or username',
    description: 'Retrieves an employee using either their ID or username',
  })
  @ApiParam({
    name: 'idOrUsername',
    description: 'Employee ID or username',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Employee found',
    type: CreateEmployeeDto,
  })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  findOne(@Param('idOrUsername') idOrUsername: string) {
    return this.employeeService.findOne(idOrUsername);
  }

  @Patch(':employee_id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update employee by ID',
    description:
      'Update specific fields of an employee. Only provided fields will be updated, others remain unchanged.\n\n' +
      'Updatable fields:\n' +
      '- first_name (string): First name of the employee\n' +
      '- last_name (string): Last name of the employee\n' +
      '- email (string): Email address of the employee\n' +
      '- password (string): Password for the employee account\n' +
      '- device_id (string[]): Array of device IDs associated with the employee\n\n' +
      'Note: To change employee active status, please use the /users/bulk-deactivate endpoint instead.',
  })
  @ApiBody({
    type: UpdateEmployeeDto,
    examples: {
      passwordOnly: {
        summary: 'Update password only',
        value: {
          password: 'newpassword123',
        },
      },
      namesOnly: {
        summary: 'Update names only',
        value: {
          first_name: 'John',
          last_name: 'Doe',
        },
      },
      emailOnly: {
        summary: 'Update email only',
        value: {
          email: 'new.email@example.com',
        },
      },
      devicesOnly: {
        summary: 'Update device IDs only',
        value: {
          device_id: ['DEVICE123', 'DEVICE456'],
        },
      },
      multipleFields: {
        summary: 'Update multiple fields',
        value: {
          first_name: 'John',
          last_name: 'Doe',
          email: 'john.doe@example.com',
          password: 'newpassword123',
          device_id: ['DEVICE123'],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Employee has been successfully updated',
    schema: {
      example: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        employee_id: 'EMP123',
        username: 'johndoe',
        email: 'john.doe@example.com',
        first_name: 'John',
        last_name: 'Doe',
        is_active: true,
        device_id: ['DEVICE123'],
        date_created: '2024-03-20T10:00:00.000Z',
        date_activated: '2024-03-20T10:00:00.000Z',
        date_deactivated: null,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires Admin privileges',
  })
  update(
    @Param('employee_id') employee_id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    if ('is_active' in updateEmployeeDto) {
      delete updateEmployeeDto.is_active;
    }
    return this.employeeService.update(employee_id, updateEmployeeDto);
  }
}
