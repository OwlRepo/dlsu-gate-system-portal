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
              // This endpoint returns whole entities, so every column the Dasma
              // sync added appears in the payload whether documented or not.
              // Listed so the contract matches what clients actually receive.
              date_activated: {
                type: 'string',
                format: 'date-time',
                nullable: true,
              },
              date_deactivated: {
                type: 'string',
                format: 'date-time',
                nullable: true,
              },
              expiry_datetime: {
                type: 'string',
                format: 'date-time',
                nullable: true,
                description: 'Activation date + 10 years. Write-once.',
              },
              remarks_clear_pending: {
                type: 'boolean',
                description:
                  'A removed remark BioStar has not confirmed clearing yet.',
              },
              biostar_row_hash: {
                type: 'string',
                nullable: true,
                description:
                  'Fingerprint of the CSV row BioStar last accepted. Internal to the sync.',
              },
              remarks_checked_at: {
                type: 'string',
                format: 'date-time',
                nullable: true,
                description:
                  'When this remark was last reconciled against BioStar.',
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
