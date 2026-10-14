import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { SyncService } from './sync.service';
import { decodeFeedToken, encodeFeedToken } from './sync-students-feed-token';
import { Student } from '../students/entities/student.entity';
import { Employee } from '../employee/entities/employee.entity';

describe('SyncService.getAllStudents — changes feed', () => {
  let service: SyncService;
  let builder: Record<string, jest.Mock>;
  let studentRepository: {
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
    metadata: { columns: { propertyName: string }[] };
  };

  const entityColumns = [
    'id',
    'ID_Number',
    'Name',
    'Lived_Name',
    'Remarks',
    'Photo',
    'Campus_Entry',
    'Unique_ID',
    'isArchived',
    'group',
    'date_activated',
    'date_deactivated',
    'expiry_datetime',
    'remarks_clear_pending',
    'biostar_row_hash',
    'remarks_checked_at',
    'createdAt',
    'updatedAt',
  ];

  const KEY = '2026-01-01 00:00:00.123456';
  const sinceToken = encodeFeedToken({ mode: 'd', key: KEY, id: 7 });
  const answerWith = (rows: { id: number; key: string }[]) =>
    builder.getRawAndEntities.mockResolvedValue({
      entities: rows.map((r) => ({ id: r.id })),
      raw: rows.map((r) => ({ sync_key: r.key })),
    });

  beforeEach(async () => {
    builder = {};
    for (const method of [
      'select',
      'addSelect',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'limit',
    ]) {
      builder[method] = jest.fn().mockReturnValue(builder);
    }
    builder.getRawAndEntities = jest
      .fn()
      .mockResolvedValue({ entities: [], raw: [] });

    studentRepository = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue(builder),
      metadata: {
        columns: entityColumns.map((propertyName) => ({ propertyName })),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: getRepositoryToken(Student), useValue: studentRepository },
        {
          provide: getRepositoryToken(Employee),
          useValue: { find: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(SyncService);
  });

  it('error: rejects a cursor that is not a feed token, without touching the database', async () => {
    await expect(
      service.getAllStudents({ cursor: 'not-a-token' }),
    ).rejects.toThrow(BadRequestException);
    expect(studentRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('error: rejects cursor and since sent together', async () => {
    await expect(
      service.getAllStudents({ cursor: sinceToken, since: sinceToken }),
    ).rejects.toThrow(BadRequestException);
    expect(studentRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('error: rejects a since token whose month is impossible', async () => {
    const since = Buffer.from('d|2026-13-45 00:00:00|1', 'utf8').toString(
      'base64url',
    );

    await expect(service.getAllStudents({ since })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('error: rejects a since that carries a first-sync cursor, which is not a finished sync', async () => {
    const since = encodeFeedToken({ mode: 'i', key: KEY, id: 7 });

    await expect(service.getAllStudents({ since })).rejects.toThrow(
      BadRequestException,
    );
    expect(studentRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('error: wraps a database failure in a BadRequestException', async () => {
    builder.getRawAndEntities.mockRejectedValue(new Error('database is down'));

    await expect(service.getAllStudents({ limit: 10 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('edge: a first sync leaves archived students out', async () => {
    await service.getAllStudents({ limit: 2 });

    expect(builder.where).toHaveBeenCalledWith(
      'student.isArchived = :isArchived',
      { isArchived: false },
    );
    expect(builder.andWhere).not.toHaveBeenCalled();
  });

  it('edge: a delta keeps archived students and re-sends the overlap window', async () => {
    await service.getAllStudents({ since: sinceToken });

    expect(builder.where).not.toHaveBeenCalled();
    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('>= CAST(:key AS timestamp)'),
      { key: KEY, overlap: '10 minutes' },
    );
  });

  it('edge: a cursor from a first sync stays filtered and continues strictly after its position', async () => {
    const cursor = encodeFeedToken({ mode: 'i', key: KEY, id: 7 });

    await service.getAllStudents({ cursor, limit: 2 });

    expect(builder.where).toHaveBeenCalledWith(
      'student.isArchived = :isArchived',
      { isArchived: false },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('> (CAST(:key AS timestamp), :id)'),
      { key: KEY, id: 7 },
    );
  });

  it('edge: a cursor from a delta stays unfiltered', async () => {
    const cursor = encodeFeedToken({ mode: 'd', key: KEY, id: 7 });

    await service.getAllStudents({ cursor, limit: 2 });

    expect(builder.where).not.toHaveBeenCalled();
    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('> (CAST(:key AS timestamp), :id)'),
      { key: KEY, id: 7 },
    );
  });

  it('edge: asks for one row more than the limit and offers a next page without a sync token', async () => {
    answerWith([
      { id: 1, key: '2026-01-01 00:00:01' },
      { id: 2, key: '2026-01-01 00:00:02' },
      { id: 3, key: '2026-01-01 00:00:03' },
    ]);

    const result = await service.getAllStudents({ limit: 2 });

    expect(builder.limit).toHaveBeenCalledWith(3);
    expect(result.students).toHaveLength(2);
    expect(result.syncToken).toBeNull();
    expect(decodeFeedToken(result.nextCursor as string)).toEqual({
      mode: 'i',
      key: '2026-01-01 00:00:02',
      id: 2,
    });
  });

  it('edge: the last page has no next cursor and a delta sync token for its last row', async () => {
    answerWith([
      { id: 1, key: '2026-01-01 00:00:01' },
      { id: 2, key: '2026-01-01 00:00:02' },
    ]);

    const result = await service.getAllStudents({ limit: 2 });

    expect(result.nextCursor).toBeNull();
    expect(decodeFeedToken(result.syncToken as string)).toEqual({
      mode: 'd',
      key: '2026-01-01 00:00:02',
      id: 2,
    });
  });

  it('edge: an empty delta hands the same position back as the sync token', async () => {
    const result = await service.getAllStudents({ since: sinceToken });

    expect(result.students).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(decodeFeedToken(result.syncToken as string)).toEqual({
      mode: 'd',
      key: KEY,
      id: 7,
    });
  });

  it('edge: an empty first sync has no tokens', async () => {
    await expect(service.getAllStudents({ limit: 10 })).resolves.toEqual({
      students: [],
      nextCursor: null,
      syncToken: null,
    });
  });

  it('edge: uses a page size of 2000 when only a token is given', async () => {
    await service.getAllStudents({ since: sinceToken });

    expect(builder.limit).toHaveBeenCalledWith(2001);
  });

  it('regression: never selects Photo and selects every other Student column', async () => {
    await service.getAllStudents({ limit: 10 });

    const [selection] = builder.select.mock.calls[0] as [string[]];
    expect(selection).not.toContain('student.Photo');
    expect([...selection].sort()).toEqual(
      entityColumns
        .filter((name) => name !== 'Photo')
        .map((name) => `student.${name}`)
        .sort(),
    );
  });

  it('regression: a call with no parameters still returns the whole roster through find', async () => {
    const result = await service.getAllStudents();

    expect(studentRepository.find).toHaveBeenCalledTimes(1);
    expect(studentRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(result).toEqual({ students: [] });
  });

  it('regression: orders by the null-safe sort key, then by id', async () => {
    await service.getAllStudents({ limit: 10 });

    expect(builder.orderBy).toHaveBeenCalledWith(
      expect.stringContaining(
        'COALESCE("student"."updatedAt", "student"."createdAt"',
      ),
      'ASC',
    );
    expect(builder.addOrderBy).toHaveBeenCalledWith('student.id', 'ASC');
  });

  it('happy: returns the rows the query gives back under `students`', async () => {
    answerWith([{ id: 5, key: '2026-01-01 00:00:05' }]);

    const result = await service.getAllStudents({ limit: 10 });

    expect(result.students).toEqual([{ id: 5 }]);
  });
});
