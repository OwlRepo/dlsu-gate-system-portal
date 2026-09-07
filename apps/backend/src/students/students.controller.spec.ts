import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { Student } from './entities/student.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Covers the by-ID lookup that lets the gate dashboards fall back to the photo
 * the Dasma sync pulled from BioStar into PostgreSQL. Without it that photo is
 * unreachable: the paginated GET /students deliberately omits `Photo`.
 */
describe('StudentsController — GET /students/:idNumber', () => {
  let controller: StudentsController;
  let rows: Student[];

  beforeEach(async () => {
    rows = [
      {
        id: 1,
        ID_Number: '12100001',
        Name: 'Dela Cruz, Juan',
        Photo: '/9j/4AAQSkZJRgABAQ',
        Unique_ID: '1234567890',
      } as Student,
      {
        id: 2,
        ID_Number: '12100002',
        Name: 'Santos, Maria',
        Photo: null,
        Unique_ID: null,
      } as Student,
    ];

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentsController],
      providers: [
        StudentsService,
        {
          provide: getRepositoryToken(Student),
          useValue: {
            findOne: jest.fn(
              async ({ where }: { where: { ID_Number: string } }) =>
                rows.find((r) => r.ID_Number === where.ID_Number) ?? null,
            ),
          },
        },
      ],
    })
      // The controller carries a class-level JwtAuthGuard, whose own
      // dependency graph is not what this spec is about. Auth coverage
      // belongs with the auth module.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StudentsController>(StudentsController);
  });

  it('returns the synced photo and card for a known ID number', async () => {
    await expect(controller.findOneByIdNumber('12100001')).resolves.toEqual({
      ID_Number: '12100001',
      Name: 'Dela Cruz, Juan',
      Photo: '/9j/4AAQSkZJRgABAQ',
      Unique_ID: '1234567890',
    });
  });

  it('returns null photo and card rather than omitting the fields', async () => {
    // The frontend branches on these being null, so the keys must be present.
    await expect(controller.findOneByIdNumber('12100002')).resolves.toEqual({
      ID_Number: '12100002',
      Name: 'Santos, Maria',
      Photo: null,
      Unique_ID: null,
    });
  });

  it('404s on an unknown ID number instead of 500ing', async () => {
    await expect(
      controller.findOneByIdNumber('99999999'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // DLSU reported "photo and card wla daw return yung api ng sync". The card
  // lives in `Unique_ID` — there is no column called `card` — and this is the
  // only endpoint that serves a single student's photo, so it is where the
  // card belongs too. Still deliberately narrow: no remarks, no campus entry.
  it('returns identity, photo and card — and nothing else', async () => {
    const result = await controller.findOneByIdNumber('12100001');
    expect(Object.keys(result).sort()).toEqual([
      'ID_Number',
      'Name',
      'Photo',
      'Unique_ID',
    ]);
  });
});
