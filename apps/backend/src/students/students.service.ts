import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from './entities/student.entity';
import { StudentPaginationDto } from './dto/student-pagination.dto';
import { GenerateStudentCsvDto } from './dto/generate-csv.dto';
import { Response } from 'express';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
  ) {}

  async findAll(query: StudentPaginationDto) {
    const { page = 1, limit = 10, search, isArchived } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.createBaseQuery(search, isArchived);

    const [items, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private createBaseQuery(search?: string, isArchived?: boolean) {
    const queryBuilder = this.studentRepository
      .createQueryBuilder('student')
      .select([
        'student.id',
        'student.ID_Number',
        'student.Name',
        'student.Lived_Name',
        'student.Remarks',
        'student.Campus_Entry',
        'student.Unique_ID',
        'student.isArchived',
        'student.group',
        'student.createdAt',
        'student.updatedAt',
      ]);

    if (search) {
      queryBuilder.where(
        '(student.ID_Number LIKE :search OR student.Name LIKE :search OR student.Remarks LIKE :search OR student.Campus_Entry LIKE :search OR student.group LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (isArchived !== undefined) {
      queryBuilder.andWhere('student.isArchived = :isArchived', { isArchived });
    }

    return queryBuilder;
  }

  async streamStudentsCsv(
    query: GenerateStudentCsvDto,
    res: Response,
  ): Promise<void> {
    const { search, isArchived, startDate, endDate } = query;

    // Write CSV headers
    const headers = [
      'ID',
      'ID Number',
      'Name',
      'Lived_Name',
      'Remarks',
      'Campus Entry',
      'Unique ID',
      'Archived',
      'group',
      'Created At',
      'Updated At',
    ];
    res.write(headers.join(',') + '\n');

    const queryBuilder = this.createBaseQuery(search, isArchived);

    // Add date range filter if provided
    if (startDate && endDate) {
      queryBuilder.andWhere(
        'student.createdAt BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    }

    // Order by creation date
    queryBuilder.orderBy('student.createdAt', 'ASC');

    // Process in batches of 1000 records
    const batchSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const students = await queryBuilder
        .skip(offset)
        .take(batchSize)
        .getMany();

      if (students.length === 0) {
        hasMore = false;
        break;
      }

      for (const student of students) {
        const row = [
          student.id,
          student.ID_Number,
          student.Name,
          student.Lived_Name,
          student.Remarks,
          student.Campus_Entry,
          student.Unique_ID,
          student.isArchived,
          student.group ?? '',
          student.createdAt.toISOString(),
          student.updatedAt.toISOString(),
        ]
          .map((field) => `"${field ?? ''}"`)
          .join(',');

        res.write(row + '\n');
      }

      offset += batchSize;
    }

    res.end();
  }
}
