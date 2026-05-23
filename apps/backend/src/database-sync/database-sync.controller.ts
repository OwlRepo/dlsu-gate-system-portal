import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  Get,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { DatabaseSyncService } from './database-sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Role } from '../auth/enums/role.enum';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ScheduledSyncDto } from './dto/scheduled-sync.dto';
import { DeleteUsersDto } from './dto/delete-users.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import * as csv from 'csv-parse';

@ApiTags('Database Sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('database-sync')
export class DatabaseSyncController {
  constructor(private readonly databaseSyncService: DatabaseSyncService) {}

  @Post('schedule')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update sync schedule',
    description: `
      Updates when the automatic database sync should run.
      
      - Allows setting two daily sync schedules (schedule 1 and 2)
      - Time must be in 24-hour format (HH:mm)
      - Example: "09:00" for 9 AM, "21:00" for 9 PM
      - Only admins can update schedules
      
      This sync process:
      1. Pulls non-archived students from SQL Server
      2. Syncs records to local PostgreSQL database
      3. Converts data to CSV format
      4. Uploads to BIOSTAR API
    `,
  })
  @ApiBody({ type: UpdateScheduleDto })
  @ApiResponse({ status: 200, description: 'Schedule successfully updated' })
  @ApiResponse({ status: 400, description: 'Invalid military time format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async updateSchedule(@Body() payload: UpdateScheduleDto) {
    const { scheduleNumber, time } = payload;

    // Validate military time format
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(time)) {
      throw new BadRequestException(
        'Invalid military time format. Use HH:mm (00:00-23:59)',
      );
    }

    return this.databaseSyncService.updateSchedule(scheduleNumber, time);
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Trigger manual sync',
    description: `
      Starts an immediate database sync without waiting for schedule.
      
      The sync process:
      1. Connects to SQL Server
      2. Fetches all non-archived student records
      3. Syncs records to local PostgreSQL database
      4. Converts data to CSV format
      5. Uploads to BIOSTAR API
      
      - Only admins can trigger manual sync
      - Returns a queue ID to track the sync job
      - Includes automatic retries on failure
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Sync job successfully started',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Manual sync completed',
        },
        queueId: {
          type: 'string',
          example: '12345678-1234-1234-1234-123456789012',
        },
      },
    },
  })
  async triggerManualSync() {
    return this.databaseSyncService.triggerManualSync();
  }

  @Get('schedules')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get all scheduled syncs',
    description: `
      Returns information about all configured sync schedules.
      
      Returns for each schedule:
      - Schedule number (1 or 2)
      - Configured time
      - Whether it's currently active
      - Last successful sync time
      - Next scheduled run time
      
      Only admins can view schedules.
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'List of all scheduled syncs',
    type: [ScheduledSyncDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getSchedules() {
    return this.databaseSyncService.getAllSchedules();
  }

  @Post('biostar/sync')
  @ApiOperation({
    summary: 'Trigger manual Biostar sync',
    description: `
      Starts an immediate Biostar sync without waiting for schedule.
      
      The sync process:
      1. Authenticates with Biostar API
      2. Fetches all users from Biostar API (with pagination)
      3. For each user:
         - Matches user_id from Biostar with ID_Number in PostgreSQL
         - If student exists: Updates only the Photo field
         - If student doesn't exist: Creates new student with ID_Number and Photo
      
      - Only admins can trigger manual Biostar sync
      - Syncs photos from Biostar to PostgreSQL database
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Biostar sync completed successfully',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
        message: {
          type: 'string',
          example: 'Biostar sync completed successfully',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Biostar sync failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async triggerBiostarSync() {
    return this.databaseSyncService.triggerBiostarSync();
  }

  @Get('biostar/schedules')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get all Biostar sync schedules',
    description: `
      Returns information about all configured Biostar sync schedules.
      
      Returns for each schedule:
      - Schedule number (1 or 2)
      - Configured time
      - Whether it's currently active
      - Last successful sync time
      - Next scheduled run time
      
      Only admins can view Biostar schedules.
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'List of all Biostar sync schedules',
    type: [ScheduledSyncDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getBiostarSchedules() {
    return this.databaseSyncService.getAllBiostarSchedules();
  }

  @Post('biostar/schedule')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update Biostar sync schedule',
    description: `
      Updates when the automatic Biostar sync should run.
      
      - Allows setting two daily Biostar sync schedules (schedule 1 and 2)
      - Time must be in 24-hour format (HH:mm)
      - Example: "09:00" for 9 AM, "21:00" for 9 PM
      - Only admins can update Biostar schedules
      
      This sync process:
      1. Authenticates with Biostar API
      2. Fetches all users from Biostar API
      3. Syncs photos to PostgreSQL database
    `,
  })
  @ApiBody({ type: UpdateScheduleDto })
  @ApiResponse({
    status: 200,
    description: 'Biostar schedule successfully updated',
  })
  @ApiResponse({ status: 400, description: 'Invalid military time format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async updateBiostarSchedule(@Body() payload: UpdateScheduleDto) {
    const { scheduleNumber, time } = payload;

    // Validate military time format
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(time)) {
      throw new BadRequestException(
        'Invalid military time format. Use HH:mm (00:00-23:59)',
      );
    }

    return this.databaseSyncService.updateBiostarSchedule(scheduleNumber, time);
  }

  @Get('test-connection')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Test SQL Server connection',
    description:
      'Tests the connection to SQL Server and returns sample data if successful',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection successful',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        sampleData: { type: 'object' },
      },
    },
  })
  async testConnection() {
    return this.databaseSyncService.testConnection();
  }

  @Get('running-syncs')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get currently running syncs',
    description: `
      Returns a list of all currently running sync jobs.
      Shows both manual and scheduled syncs.
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'List of running syncs',
    schema: {
      type: 'object',
      properties: {
        runningJobs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              jobName: { type: 'string' },
              startedAt: { type: 'string', format: 'date-time' },
              isManual: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  async getRunningSync() {
    return this.databaseSyncService.getRunningSync();
  }

  @Post('delete-users')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Bulk delete users',
    description: `
      Deletes multiple users from both PostgreSQL and BIOSTAR databases.
      
      Accepts either:
      1. JSON payload with userIds array
      2. CSV file with 'user_ids' column
      
      Process:
      1. Sets isArchived=true in PostgreSQL database
      2. Deletes users from BIOSTAR API
      
      Only admins can perform bulk deletion.

      Sample JSON payload:
      {
        "userIds": ["12345", "67890", "11223"]
      }

      Sample CSV format:
      user_ids
      12345
      67890
      11223
    `,
  })
  @ApiBody({
    schema: {
      oneOf: [
        {
          $ref: '#/components/schemas/DeleteUsersDto',
          example: {
            userIds: ['12345', '67890', '11223'],
          },
        },
        {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              format: 'binary',
              description: 'CSV file with user_ids column',
            },
          },
        },
      ],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiResponse({ status: 200, description: 'Users successfully deleted' })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or deletion failed',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteUsers(
    @Body() payload?: DeleteUsersDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      // Handle CSV file
      const userIds = await this.parseCsvFile(file);
      return this.databaseSyncService.deleteUsers(userIds);
    } else if (payload?.userIds) {
      // Handle JSON payload
      return this.databaseSyncService.deleteUsers(payload.userIds);
    } else {
      throw new BadRequestException(
        'Either userIds array or CSV file must be provided',
      );
    }
  }

  private async parseCsvFile(file: Express.Multer.File): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const userIds: string[] = [];
      let hasHeader = false;

      csv
        .parse(file.buffer.toString(), {
          trim: true,
          skip_empty_lines: true,
        })
        .on('data', (row) => {
          if (!hasHeader) {
            // Check if header is 'user_ids'
            if (row[0].toLowerCase() !== 'user_ids') {
              reject(
                new BadRequestException(
                  "CSV file must have 'user_ids' as the header",
                ),
              );
            }
            hasHeader = true;
            return;
          }
          if (row[0]) userIds.push(row[0].toString().trim());
        })
        .on('end', () => {
          if (userIds.length === 0) {
            reject(
              new BadRequestException('No valid user IDs found in CSV file'),
            );
          }
          resolve(userIds);
        })
        .on('error', (error) => {
          reject(
            new BadRequestException(`Error parsing CSV file: ${error.message}`),
          );
        });
    });
  }
}
