import {
  Controller,
  Get,
  Query,
  Res,
  Header,
  ValidationPipe,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { StudentPaginationDto } from './dto/student-pagination.dto';
import { GenerateStudentCsvDto } from './dto/generate-csv.dto';
import { Response } from 'express';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Students')
@Controller('students')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all students with pagination',
    description:
      'Retrieves a paginated list of students with optional filtering',
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
    name: 'search',
    required: false,
    type: String,
    description:
      'Search term for ID_Number, Name, Remarks, Campus_Entry, or group',
  })
  @ApiQuery({
    name: 'isArchived',
    required: false,
    type: Boolean,
    description: 'Filter by archive status',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated list of students',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              ID_Number: { type: 'string' },
              Name: { type: 'string' },
              Lived_Name: { type: 'string' },
              Remarks: { type: 'string' },
              Campus_Entry: { type: 'string' },
              Unique_ID: { type: 'number' },
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
        total: { type: 'number', description: 'Total number of records' },
        page: { type: 'number', description: 'Current page' },
        limit: { type: 'number', description: 'Items per page' },
        totalPages: { type: 'number', description: 'Total number of pages' },
      },
    },
  })
  findAll(@Query() query: StudentPaginationDto) {
    return this.studentsService.findAll(query);
  }

  @Get('generate-csv')
  @Header('Content-Type', 'text/csv')
  @ApiOperation({
    summary: 'Generate CSV file of students',
    description:
      'Generates and downloads a CSV file containing student data based on filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns a CSV file containing student data',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid date range or parameters',
  })
  async generateStudentsCsv(
    @Query(new ValidationPipe({ transform: true }))
    query: GenerateStudentCsvDto,
    @Res() res: Response,
  ) {
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

      // Validate date range (6 months maximum)
      const sixMonthsInMs = 6 * 30 * 24 * 60 * 60 * 1000;
      if (end.getTime() - start.getTime() > sixMonthsInMs) {
        throw new UnprocessableEntityException(
          'Date range cannot exceed 6 months',
        );
      }
    }

    const filename = `students-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    return this.studentsService.streamStudentsCsv(query, res);
  }
}
