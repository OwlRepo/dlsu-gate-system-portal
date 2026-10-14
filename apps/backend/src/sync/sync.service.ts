import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../students/entities/student.entity';
import { Employee } from '../employee/entities/employee.entity';
import {
  SYNC_STUDENTS_DEFAULT_LIMIT,
  SyncStudentsQueryDto,
} from './dto/sync-students-query.dto';
import {
  decodeFeedToken,
  encodeFeedToken,
  FeedMode,
  FeedPosition,
} from './sync-students-feed-token';

export type SyncStudent = Omit<Student, 'Photo'>;

export interface SyncStudentsResponse {
  students: SyncStudent[];
  /** Only present when a paging parameter was sent. */
  nextCursor?: string | null;
  syncToken?: string | null;
}

// A transaction's updatedAt is its start time, so a long sync batch can commit
// after a mobile pull has already read past that timestamp. Re-sending this
// much history on every delta lets such a late commit still arrive; mobile
// upserts by ID_Number, so the repeats are harmless.
const SYNC_OVERLAP = '10 minutes';

// updatedAt and createdAt are both nullable in the schema, so a student can have
// neither. Falling back to epoch keeps that row ordered and returned instead of
// silently dropped by a NULL comparison.
const SORT_KEY = `COALESCE("student"."updatedAt", "student"."createdAt", TIMESTAMP 'epoch')`;

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async getAllStudents(
    query: SyncStudentsQueryDto = {},
  ): Promise<SyncStudentsResponse> {
    try {
      const { limit, cursor, since } = query;

      if (limit === undefined && cursor === undefined && since === undefined) {
        return { students: await this.findWholeRoster() };
      }

      return await this.findStudentsFeed(
        limit ?? SYNC_STUDENTS_DEFAULT_LIMIT,
        cursor,
        since,
      );
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  private async findWholeRoster(): Promise<SyncStudent[]> {
    return this.studentRepository.find({
      select: this.studentColumns(),
      where: { isArchived: false },
    });
  }

  // Photo is a base64 blob and dominates the payload; mobile reads it per
  // student from GET /students/:idNumber. Selecting the other columns, rather
  // than stripping after load, keeps the blob out of the PostgreSQL result set.
  // Derived from entity metadata so a column added later reaches mobile without
  // editing this list.
  private studentColumns(): (keyof Student)[] {
    return this.studentRepository.metadata.columns
      .map((column) => column.propertyName)
      .filter((name): name is keyof Student => name !== 'Photo');
  }

  private async findStudentsFeed(
    limit: number,
    cursor?: string,
    since?: string,
  ): Promise<SyncStudentsResponse> {
    if (cursor !== undefined && since !== undefined) {
      throw new BadRequestException('Send either cursor or since, not both');
    }

    const token = cursor ?? since;
    let position: FeedPosition | null = null;
    if (token !== undefined) {
      position = decodeFeedToken(token);
      if (position === null) {
        throw new BadRequestException('Invalid cursor or since token');
      }
    }

    // A first sync has nobody to delete locally, so archived students are left
    // out; a delta must carry them or they stay on devices forever.
    const isDelta = since !== undefined || position?.mode === 'd';

    const builder = this.studentRepository
      .createQueryBuilder('student')
      .select(this.studentColumns().map((name) => `student.${name}`))
      .addSelect(`CAST(${SORT_KEY} AS text)`, 'sync_key')
      .orderBy(SORT_KEY, 'ASC')
      .addOrderBy('student.id', 'ASC')
      // One row more than asked tells us whether another page exists without a
      // COUNT over the whole table.
      .limit(limit + 1);

    if (!isDelta) {
      builder.where('student.isArchived = :isArchived', { isArchived: false });
    }

    if (position !== null) {
      if (cursor !== undefined) {
        builder.andWhere(
          `(${SORT_KEY}, student.id) > (CAST(:key AS timestamp), :id)`,
          { key: position.key, id: position.id },
        );
      } else {
        builder.andWhere(
          `${SORT_KEY} >= CAST(:key AS timestamp) - CAST(:overlap AS interval)`,
          { key: position.key, overlap: SYNC_OVERLAP },
        );
      }
    }

    const { entities, raw } = await builder.getRawAndEntities<{
      sync_key: string;
    }>();

    const hasMore = entities.length > limit;
    const students = hasMore ? entities.slice(0, limit) : entities;
    const last = students.length - 1;
    const lastToken = (mode: FeedMode): string | null =>
      last < 0
        ? null
        : encodeFeedToken({
            mode,
            key: raw[last].sync_key,
            id: students[last].id,
          });

    return {
      students,
      nextCursor: hasMore ? lastToken(isDelta ? 'd' : 'i') : null,
      // An empty page keeps the position it was asked from, so mobile never
      // loses its bookmark because nothing changed.
      syncToken: hasMore
        ? null
        : (lastToken('d') ??
          (position === null
            ? null
            : encodeFeedToken({ ...position, mode: 'd' }))),
    };
  }

  async getAllEmployees(): Promise<{
    employees: Omit<Employee, 'password'>[];
  }> {
    try {
      const employees = await this.employeeRepository.find({
        where: { is_active: true },
        select: [
          'id',
          'employee_id',
          'username',
          'first_name',
          'last_name',
          'email',
          'is_active',
          'date_created',
          'date_activated',
          'date_deactivated',
          'device_id',
        ],
      });
      return { employees };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
