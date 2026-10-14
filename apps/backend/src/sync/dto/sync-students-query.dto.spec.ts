import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  SYNC_STUDENTS_MAX_LIMIT,
  SyncStudentsQueryDto,
} from './sync-students-query.dto';

const check = (plain: Record<string, unknown>) =>
  validate(plainToInstance(SyncStudentsQueryDto, plain));

describe('SyncStudentsQueryDto', () => {
  it('error: rejects a limit that is not an integer between 1 and 5000', async () => {
    for (const limit of [
      '0',
      '-1',
      '1.5',
      'abc',
      String(SYNC_STUDENTS_MAX_LIMIT + 1),
    ]) {
      const errors = await check({ limit });
      expect(errors.map((e) => e.property)).toContain('limit');
    }
  });

  it('error: rejects a cursor or since with characters outside base64url, or longer than 200', async () => {
    for (const field of ['cursor', 'since']) {
      for (const value of [
        'a b',
        'a/b',
        'a+b',
        'a=',
        '../x',
        'a'.repeat(201),
      ]) {
        const errors = await check({ [field]: value });
        expect(errors.map((e) => e.property)).toContain(field);
      }
    }
  });

  it('edge: accepts a request with no parameters at all', async () => {
    await expect(check({})).resolves.toHaveLength(0);
  });

  it('edge: accepts the smallest and the largest limit', async () => {
    await expect(check({ limit: '1' })).resolves.toHaveLength(0);
    await expect(
      check({ limit: String(SYNC_STUDENTS_MAX_LIMIT) }),
    ).resolves.toHaveLength(0);
  });

  it('happy: turns the limit query string into a number', () => {
    expect(plainToInstance(SyncStudentsQueryDto, { limit: '25' }).limit).toBe(
      25,
    );
  });
});
