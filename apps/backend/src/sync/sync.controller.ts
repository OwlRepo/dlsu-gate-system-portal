import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SyncService } from './sync.service';
import { CacheTTL } from '../decorators/cache-control.decorator';

@ApiTags('Sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('students')
  @ApiOperation({
    summary: 'Get all non-archived students',
    description:
      'Returns complete list of non-archived students for mobile database synchronization',
  })
  @CacheTTL(3600000) // 1 hour
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved students',
    schema: {
      type: 'object',
      properties: {
        students: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              ID_Number: { type: 'string', nullable: true },
              Name: { type: 'string', nullable: true },
              Lived_Name: { type: 'string', nullable: true },
              Remarks: { type: 'string', nullable: true },
              Photo: { type: 'string', nullable: true },
              Campus_Entry: { type: 'string', nullable: true },
              Unique_ID: { type: 'string', nullable: true },
              isArchived: { type: 'boolean' },
              group: {
                type: 'string',
                nullable: true,
                description: 'EMPLOYEE, STUDENT, or AGENCY',
              },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Error retrieving data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async getAllStudents() {
    return this.syncService.getAllStudents();
  }

  @Get('employees')
  @ApiOperation({
    summary: 'Get all active employees',
    description:
      'Returns complete list of active employees for mobile database synchronization',
  })
  @CacheTTL(3600000) // 1 hour
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved employees',
    schema: {
      type: 'object',
      properties: {
        employees: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              employee_id: { type: 'string' },
              username: { type: 'string' },
              first_name: { type: 'string' },
              last_name: { type: 'string' },
              email: { type: 'string' },
              is_active: { type: 'boolean' },
              date_created: { type: 'string', format: 'date-time' },
              date_activated: { type: 'string', format: 'date-time' },
              date_deactivated: {
                type: 'string',
                format: 'date-time',
                nullable: true,
              },
              device_id: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Error retrieving data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async getAllEmployees() {
    return this.syncService.getAllEmployees();
  }
}
