import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, FindManyOptions } from 'typeorm';
import { Report } from './entities/report.entity';
import * as fs from 'fs';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { CreateReportDto } from './dto/create-report.dto';
import { EnhancedReportQueryDto } from './dto/enhanced-report-query.dto';
import { Student } from '../students/entities/student.entity';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
  ) {}

  async create(createReportDto: CreateReportDto) {
    const report = this.reportRepository.create({
      ...createReportDto,
      datetime: new Date(createReportDto.datetime),
    });
    return await this.reportRepository.save(report);
  }

  async createBulk(createReportDtos: CreateReportDto[]): Promise<Report[]> {
    if (!Array.isArray(createReportDtos) || createReportDtos.length === 0) {
      throw new BadRequestException(
        'Array of reports is required and cannot be empty',
      );
    }

    const queryRunner =
      this.reportRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reports = createReportDtos.map((dto) =>
        this.reportRepository.create({
          ...dto,
          datetime: new Date(dto.datetime),
        }),
      );

      const savedReports = await queryRunner.manager.save(Report, reports);

      await queryRunner.commitTransaction();
      return savedReports;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(
        `Failed to create reports: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(query: EnhancedReportQueryDto) {
    const {
      page = 1,
      limit = 10,
      type,
      startDate,
      endDate,
      searchTerm,
    } = query;

    const queryBuilder = this.reportRepository.createQueryBuilder('report');

    // Apply type filter
    if (type) {
      queryBuilder.andWhere('report.type = :type', { type });
    }

    // Apply date range filter
    if (startDate && endDate) {
      queryBuilder.andWhere('report.datetime BETWEEN :startDate AND :endDate', {
        startDate: `${startDate} 00:00:00`,
        endDate: `${endDate} 23:59:59`,
      });
    }

    // Apply search filter
    if (searchTerm) {
      queryBuilder.andWhere(
        '(LOWER(report.name) LIKE LOWER(:search) OR LOWER(report.remarks) LIKE LOWER(:search))',
        { search: `%${searchTerm}%` },
      );
    }

    // Add ordering (newest first) and pagination
    const skip = (page - 1) * limit;
    queryBuilder.orderBy('report.datetime', 'DESC').skip(skip).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    };
  }

  async searchContains(searchString: string) {
    return await this.reportRepository.find({
      where: [
        { name: Like(`%${searchString}%`) },
        { remarks: Like(`%${searchString}%`) },
        { type: Like(`%${searchString}%`) },
      ],
    });
  }

  async findByDateRange(startDate: string, endDate: string) {
    return await this.reportRepository.find({
      where: {
        datetime: Between(new Date(startDate), new Date(endDate)),
      },
    });
  }

  async findByType(type: string) {
    if (type !== '1' && type !== '2') {
      throw new Error(
        'Invalid type. Only types "1" (entry) and "2" (out) are allowed.',
      );
    }
    return await this.reportRepository.find({
      where: { type },
    });
  }

  async findByTypeAndDateRange(
    type: string,
    startDate: string,
    endDate: string,
  ) {
    return await this.reportRepository.find({
      where: {
        type,
        datetime: Between(new Date(startDate), new Date(endDate)),
      },
    });
  }

  async generateCSVReport(
    startDate: Date,
    endDate: Date,
    includePhoto: boolean = false,
  ): Promise<{ filePath: string; fileName: string }> {
    // Ensure proper date range by setting time to start and end of day using dayjs
    const start = dayjs(startDate).startOf('day').toDate();
    const end = dayjs(endDate).endOf('day').toDate();

    console.log(
      `Fetching reports between ${dayjs(start).format()} and ${dayjs(end).format()}`,
    );

    const reports = await this.reportRepository.find({
      where: {
        datetime: Between(start, end),
      },
      order: {
        datetime: 'ASC',
      },
    });

    console.log(`Found ${reports.length} reports`);

    const userIds = [...new Set(reports.map((report) => report.user_id))];
    console.log(`Found ${userIds.length} unique user IDs`);

    const studentMap = new Map();

    if (userIds.length > 0) {
      // Only select photo if needed
      const columns = [
        'student.ID_Number as id',
        'student."Unique_ID" as card',
        'student."Lived_Name" as lived_name',
        'student.Remarks as remarks',
        'student."group" as group',
      ];
      if (includePhoto) {
        columns.push('student.Photo as photo');
      }

      const students = await this.studentRepository
        .createQueryBuilder('student')
        .select(columns)
        .where('student.ID_Number IN (:...userIds)', { userIds })
        .getRawMany();

      console.log(`Found ${students.length} matching students`);

      students.forEach((student) => {
        studentMap.set(student.id, {
          card: student.card,
          lived_name: student.lived_name,
          remarks: student.remarks,
          group: student.group ?? null,
          ...(includePhoto && { photo: student.photo }),
        });
      });
    }

    // Define base headers
    const headers = [
      { id: 'timestamp', title: 'Time stamp' },
      { id: 'id_number', title: 'ID Number' },
      { id: 'card_number', title: 'Card Number' },
      { id: 'name', title: 'Name' },
      { id: 'lived_name', title: 'Lived_Name' },
      { id: 'remarks', title: 'Remarks' },
      { id: 'group', title: 'group' },
      { id: 'status', title: 'Status' },
      { id: 'device', title: 'Device' }, // Added device header
    ];

    // Add photo header if needed
    if (includePhoto) {
      headers.push({ id: 'photo', title: 'Photo' });
    }

    const dateStr = dayjs().format('YYYY-MM-DD');
    const fileName = `reports-${dateStr}.csv`;
    const uploadDir = path.join(process.cwd(), 'persistent_uploads', 'reports');
    const filePath = path.join(uploadDir, fileName);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: headers,
    });

    const formattedRecords = reports.map((report) => {
      const student = studentMap.get(report.user_id);
      const record = {
        timestamp: dayjs(report.datetime).format(),
        id_number: report.user_id,
        card_number: student?.card || 'null',
        name: report.name,
        lived_name: student?.lived_name || 'null',
        remarks: student?.remarks || 'null',
        group: student?.group ?? '',
        status: report.status || 'null',
        device: report.device || 'null', // Added device field
      };

      if (includePhoto) {
        record['photo'] = student?.photo || 'null';
      }

      return record;
    });

    console.log(`Writing ${formattedRecords.length} records to CSV`);
    await csvWriter.writeRecords(formattedRecords);
    console.log(`CSV file written successfully to ${filePath}`);

    return { filePath, fileName };
  }

  async cleanupFile(filePath: string) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async find(options: FindManyOptions<Report>): Promise<Report[]> {
    return await this.reportRepository.find(options);
  }
}
