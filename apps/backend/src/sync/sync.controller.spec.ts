import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';

import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CACHE_TTL_KEY } from '../decorators/cache-control.decorator';

/**
 * `GET /sync/students` is what the mobile app pulls, and the "Data Transfer"
 * tracker — missing ID numbers and missing cards — is filed against the
 * MOBILE module. The photo is deliberately not in this payload (it is
 * base64 and dominated the response); the per-student photo lives on
 * `GET /students/:idNumber`.
 */
describe('SyncController — GET /sync/students', () => {
  let controller: SyncController;
  let syncService: { getAllStudents: jest.Mock; getAllEmployees: jest.Mock };

  const student = (over: Record<string, unknown> = {}) => ({
    id: 1,
    ID_Number: '12100001',
    Name: 'Dela Cruz, Juan',
    Lived_Name: null,
    Remarks: null,
    Campus_Entry: 'Y',
    Unique_ID: '3492455443',
    isArchived: false,
    ...over,
  });

  beforeEach(async () => {
    syncService = {
      getAllStudents: jest.fn(),
      getAllEmployees: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [{ provide: SyncService, useValue: syncService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SyncController);
  });

  it('regression: returns the card and ID number the mobile app needs, with no photo', async () => {
    syncService.getAllStudents.mockResolvedValue({ students: [student()] });

    const result = await controller.getAllStudents();

    expect(result.students).toHaveLength(1);
    expect(result.students[0].Unique_ID).toBe('3492455443');
    expect(result.students[0].ID_Number).toBe('12100001');
    expect(result.students[0]).not.toHaveProperty('Photo');
  });

  it('edge: keeps a student whose card has not arrived yet, with an explicit null', async () => {
    syncService.getAllStudents.mockResolvedValue({
      students: [student({ Unique_ID: null })],
    });

    const result = await controller.getAllStudents();

    // Omitting the key would be indistinguishable from a truncated payload;
    // an explicit null tells the client the person exists but has no card.
    expect(result.students[0]).toHaveProperty('Unique_ID', null);
  });

  it('passes an empty roster straight through rather than inventing one', async () => {
    syncService.getAllStudents.mockResolvedValue({ students: [] });

    await expect(controller.getAllStudents()).resolves.toEqual({
      students: [],
    });
  });

  it('lets a service failure surface instead of swallowing it', async () => {
    syncService.getAllStudents.mockRejectedValue(new Error('database is down'));

    await expect(controller.getAllStudents()).rejects.toThrow(
      'database is down',
    );
  });

  /**
   * The roster is cached by the global interceptor. At one hour a card that
   * has just landed in PostgreSQL stays invisible to every mobile device for
   * up to an hour, which looks exactly like "the card did not sync".
   */
  it('caches the roster for no more than five minutes', () => {
    const ttl = new Reflector().get<number>(
      CACHE_TTL_KEY,
      SyncController.prototype.getAllStudents,
    );

    expect(ttl).toBeLessThanOrEqual(300000);
  });
});
