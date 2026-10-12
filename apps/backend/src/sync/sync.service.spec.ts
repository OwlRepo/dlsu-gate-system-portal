import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { SyncService } from './sync.service';
import { Student } from '../students/entities/student.entity';
import { Employee } from '../employee/entities/employee.entity';

describe('SyncService.getAllStudents', () => {
  let service: SyncService;
  let studentRepository: {
    find: jest.Mock;
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

  beforeEach(async () => {
    studentRepository = {
      find: jest.fn().mockResolvedValue([]),
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

  it('error: wraps a repository failure in a BadRequestException', async () => {
    studentRepository.find.mockRejectedValue(new Error('database is down'));

    await expect(service.getAllStudents()).rejects.toThrow(
      BadRequestException,
    );
  });

  it('edge: returns an empty roster as an empty array', async () => {
    await expect(service.getAllStudents()).resolves.toEqual({ students: [] });
  });

  it('edge: still filters to non-archived students', async () => {
    await service.getAllStudents();

    expect(studentRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isArchived: false } }),
    );
  });

  it('regression: never selects the Photo column', async () => {
    await service.getAllStudents();

    const { select } = studentRepository.find.mock.calls[0][0];
    expect(select).toBeDefined();
    expect(select).not.toContain('Photo');
  });

  it('regression: selects every other Student column, so no field is dropped with the photo', async () => {
    await service.getAllStudents();

    const { select } = studentRepository.find.mock.calls[0][0];
    expect([...select].sort()).toEqual(
      entityColumns.filter((name) => name !== 'Photo').sort(),
    );
  });

  it('happy: returns the rows the repository gives back under `students`', async () => {
    const rows = [{ id: 1, ID_Number: '12100001', Unique_ID: '3492455443' }];
    studentRepository.find.mockResolvedValue(rows);

    await expect(service.getAllStudents()).resolves.toEqual({ students: rows });
  });
});
