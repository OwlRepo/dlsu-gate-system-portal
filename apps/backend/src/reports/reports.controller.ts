import {
  Controller,
  Get,
  Query,
  UseGuards,
  Post,
  Body,
  Res,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Response } from 'express';
import { CreateReportDto } from './dto/create-report.dto';
import { BasePaginationDto } from '../common/dto/base-pagination.dto';
import { IsOptional, IsEnum, IsDateString, MinLength } from 'class-validator';

// Add new DTO by extending BasePaginationDto
export class EnhancedReportQueryDto extends BasePaginationDto {
  @IsOptional()
  @IsEnum(['1', '2'], { message: 'Type must be either "1" or "2"' })
  type?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @MinLength(3, { message: 'Search term must be at least 3 characters long' })
  searchTerm?: string;
}

// Add new DTO for CSV generation
export class GenerateCSVDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all reports with pagination and filtering',
    description:
      'Retrieves a paginated list of reports with optional filtering by type, date range, and search term',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['1', '2'],
    description: 'Filter by report type (1=entry, 2=out)',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'searchTerm',
    required: false,
    type: String,
    description: 'Search in name, remarks (min 3 chars)',
  })
  async findAll(@Query() query: EnhancedReportQueryDto) {
    try {
      // Validate dates if provided
      if (
        (query.startDate && !query.endDate) ||
        (!query.startDate && query.endDate)
      ) {
        throw new UnprocessableEntityException(
          'Both startDate and endDate must be provided together',
        );
      }

      if (query.startDate && query.endDate) {
        const start = new Date(query.startDate);
        const end = new Date(query.endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw new UnprocessableEntityException(
            'Invalid date format. Use YYYY-MM-DD',
          );
        }
        if (start > end) {
          throw new UnprocessableEntityException(
            'Start date must be before or equal to end date',
          );
        }
      }

      return this.reportsService.findAll(query);
    } catch (error) {
      throw new UnprocessableEntityException(error.message);
    }
  }

  @Post()
  @ApiOperation({
    summary: 'Create new report(s)',
    description:
      'Creates a new report or multiple reports. Accepts either a single report object or an array of report objects for bulk creation.\n\n' +
      '**Report Types:**\n' +
      '- `"1"` = Entry (person entering the gate)\n' +
      '- `"2"` = Exit (person leaving the gate)\n\n' +
      '**Status Format:**\n' +
      '- `"GREEN;allowed"` = Access granted\n' +
      '- `"RED;cannot enter with or without remarks"` = Access denied\n' +
      '- `"YELLOW;pending"` = Access pending review\n\n' +
      '**DateTime Format:** ISO 8601 format (e.g., "2024-03-15T10:00:00Z" or "2024-03-15T10:00:00+08:00")',
  })
  @ApiBody({
    schema: {
      oneOf: [
        {
          $ref: '#/components/schemas/CreateReportDto',
        },
        {
          type: 'array',
          items: {
            $ref: '#/components/schemas/CreateReportDto',
          },
        },
      ],
    },
    examples: {
      singleEntry: {
        summary: 'Single Entry Report',
        description:
          'Create a single entry report when a person enters the gate',
        value: {
          datetime: '2024-03-15T10:30:00Z',
          type: '1',
          user_id: '2021-12345',
          name: 'Juan Dela Cruz',
          remarks: 'Student entering campus',
          status: 'GREEN;allowed',
          device: 'Mobile App',
        },
      },
      singleExit: {
        summary: 'Single Exit Report',
        description:
          'Create a single exit report when a person leaves the gate',
        value: {
          datetime: '2024-03-15T18:45:00Z',
          type: '2',
          user_id: '2021-12345',
          name: 'Juan Dela Cruz',
          remarks: 'Student leaving campus',
          status: 'GREEN;allowed',
          device: 'Mobile App',
        },
      },
      singleEntryDenied: {
        summary: 'Single Entry Report - Access Denied',
        description: 'Create an entry report when access is denied',
        value: {
          datetime: '2024-03-15T10:30:00Z',
          type: '1',
          user_id: '2021-12345',
          name: 'Juan Dela Cruz',
          remarks: 'No valid ID presented',
          status: 'RED;cannot enter with or without remarks',
          device: 'Mobile App',
        },
      },
      bulkEntry: {
        summary: 'Bulk Entry Reports',
        description:
          'Create multiple entry reports at once (useful for offline sync)',
        value: [
          {
            datetime: '2024-03-15T08:00:00Z',
            type: '1',
            user_id: '2021-12345',
            name: 'Juan Dela Cruz',
            remarks: 'Morning entry',
            status: 'GREEN;allowed',
            device: 'Mobile App',
          },
          {
            datetime: '2024-03-15T08:05:00Z',
            type: '1',
            user_id: '2021-67890',
            name: 'Maria Santos',
            remarks: 'Morning entry',
            status: 'GREEN;allowed',
            device: 'Mobile App',
          },
          {
            datetime: '2024-03-15T08:10:00Z',
            type: '1',
            user_id: '2021-11111',
            name: 'Pedro Garcia',
            remarks: 'Morning entry',
            status: 'RED;cannot enter with or without remarks',
            device: 'Mobile App',
          },
        ],
      },
      bulkMixed: {
        summary: 'Bulk Mixed Reports (Entry and Exit)',
        description: 'Create multiple reports with both entry and exit types',
        value: [
          {
            datetime: '2024-03-15T08:00:00Z',
            type: '1',
            user_id: '2021-12345',
            name: 'Juan Dela Cruz',
            remarks: 'Morning entry',
            status: 'GREEN;allowed',
            device: 'Mobile App',
          },
          {
            datetime: '2024-03-15T12:00:00Z',
            type: '2',
            user_id: '2021-12345',
            name: 'Juan Dela Cruz',
            remarks: 'Lunch break exit',
            status: 'GREEN;allowed',
            device: 'Mobile App',
          },
          {
            datetime: '2024-03-15T13:00:00Z',
            type: '1',
            user_id: '2021-12345',
            name: 'Juan Dela Cruz',
            remarks: 'Return from lunch',
            status: 'GREEN;allowed',
            device: 'Mobile App',
          },
          {
            datetime: '2024-03-15T17:00:00Z',
            type: '2',
            user_id: '2021-12345',
            name: 'Juan Dela Cruz',
            remarks: 'End of day exit',
            status: 'GREEN;allowed',
            device: 'Mobile App',
          },
        ],
      },
      minimalRequired: {
        summary: 'Minimal Required Fields',
        description: 'Example with only required fields (device is optional)',
        value: {
          datetime: '2024-03-15T10:30:00Z',
          type: '1',
          user_id: '2021-12345',
          name: 'Juan Dela Cruz',
          remarks: 'Entry report',
          status: 'GREEN;allowed',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Report(s) created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid data or empty array',
  })
  create(@Body() createReportDto: CreateReportDto | CreateReportDto[]) {
    if (Array.isArray(createReportDto)) {
      if (createReportDto.length === 0) {
        throw new BadRequestException('Array cannot be empty');
      }
      return this.reportsService.createBulk(createReportDto);
    }
    return this.reportsService.create(createReportDto);
  }

  @Get('generate-csv')
  @ApiOperation({
    summary: 'Generate CSV report',
    description:
      'Generates and downloads a CSV report containing reports data within specified date range (max 6 months)',
  })
  @ApiQuery({
    name: 'startDate',
    required: true,
    type: String,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    type: String,
    description: 'End date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'includePhoto',
    required: false,
    type: Boolean,
    description: 'Include photo column in CSV (default: false)',
  })
  @ApiResponse({
    status: 200,
    description: 'CSV file download',
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  @ApiResponse({
    status: 422,
    description: 'Validation error',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 422 },
        message: {
          type: 'string',
          example: 'Date range cannot exceed 6 months',
        },
        error: { type: 'string', example: 'Unprocessable Entity' },
      },
    },
  })
  async generateCSV(
    @Query() query: GenerateCSVDto,
    @Res() res: Response,
    @Query('includePhoto') includePhoto: string = 'false',
  ) {
    let filePath: string | undefined;

    try {
      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid date format. Use YYYY-MM-DD');
      }

      if (startDate > endDate) {
        throw new Error('Start date must be before or equal to end date');
      }

      // Calculate date difference in months
      const monthsDiff =
        (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth());

      if (monthsDiff > 6) {
        throw new Error('Date range cannot exceed 6 months');
      }

      const result = await this.reportsService.generateCSVReport(
        startDate,
        endDate,
        includePhoto === 'true',
      );
      filePath = result.filePath;

      if (!filePath || !result.fileName) {
        throw new Error(
          'Failed to generate CSV file - missing file information',
        );
      }

      return res.download(filePath, result.fileName, (err) => {
        if (err) {
          console.error('Error during file download:', err);
          // Only cleanup if download failed
          if (filePath) {
            this.reportsService
              .cleanupFile(filePath)
              .catch((cleanupErr) =>
                console.error('Error cleaning up file:', cleanupErr),
              );
          }
          // Check if headers are not sent yet
          if (!res.headersSent) {
            res.status(500).json({
              statusCode: 500,
              message: 'Failed to download CSV file',
              error: 'Internal Server Error',
            });
          }
          return;
        }

        // Cleanup after successful download
        if (filePath) {
          this.reportsService
            .cleanupFile(filePath)
            .catch((cleanupErr) =>
              console.error(
                'Error cleaning up file after download:',
                cleanupErr,
              ),
            );
        }
      });
    } catch (error) {
      console.error('Error in CSV generation:', error);

      // Cleanup on error
      if (filePath) {
        try {
          await this.reportsService.cleanupFile(filePath);
        } catch (cleanupErr) {
          console.error(
            'Error cleaning up file after generation failure:',
            cleanupErr,
          );
        }
      }

      throw new UnprocessableEntityException({
        statusCode: 422,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to generate CSV report',
        error: 'Unprocessable Entity',
      });
    }
  }
}
