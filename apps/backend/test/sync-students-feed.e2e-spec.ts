import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, Repository } from 'typeorm';

import { Student } from '../src/students/entities/student.entity';
import { SyncService, SyncStudentsResponse } from '../src/sync/sync.service';
import { encodeFeedToken } from '../src/sync/sync-students-feed-token';

/** Minimal .env reader; jest does not load dotenv for us. */
const envFromFile = (): Record<string, string> => {
  const file = path.resolve(__dirname, '../../../.env');
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
};

/**
 * The mobile changes feed against a real PostgreSQL schema built by the
 * migrations. The unit specs mock the query builder, so they prove intent;
 * only this proves the SQL: the microsecond cursor, the NULL-safe sort key and
 * the row comparison.
 *
 * Its own database, because jest runs e2e files in parallel and the Dasma spec
 * truncates `students`:
 *
 *   createdb -h localhost -p 5433 -U postgres dlsu_gate_system_e2e_feed
 */
describe('GET /sync/students changes feed — real PostgreSQL', () => {
  const env = { ...envFromFile(), ...process.env };

  let dataSource: DataSource;
  let students: Repository<Student>;
  let service: SyncService;

  interface Seed {
    id: string;
    updatedAt: string | null;
    archived?: boolean;
    photo?: string;
  }

  /** Inserts a student, then pins its updatedAt to an exact microsecond value. */
  const seed = async (rows: Seed[]) => {
    for (const row of rows) {
      await students.insert({
        ID_Number: row.id,
        Name: `Student ${row.id}`,
        Photo: row.photo,
        isArchived: row.archived ?? false,
      });
      await dataSource.query(
        `UPDATE students SET "updatedAt" = $1 WHERE "ID_Number" = $2`,
        [row.updatedAt, row.id],
      );
    }
  };

  const idsOf = (response: SyncStudentsResponse) =>
    response.students.map((s) => s.ID_Number);

  /** Pulls every page of one sync; fails loudly if the cursor never ends. */
  const pullAll = async (limit: number, since?: string) => {
    const pages: SyncStudentsResponse[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 50; i++) {
      const page = await service.getAllStudents(
        cursor ? { limit, cursor } : { limit, since },
      );
      pages.push(page);
      if (!page.nextCursor) return pages;
      cursor = page.nextCursor;
    }
    throw new Error('the feed did not end within 50 pages');
  };

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: env.DB_HOST ?? 'localhost',
      port: Number(env.DB_PORT ?? 5433),
      username: env.DB_USERNAME ?? 'postgres',
      password: env.DB_PASSWORD ?? 'postgres',
      database: env.E2E_FEED_DB_NAME ?? 'dlsu_gate_system_e2e_feed',
      entities: [Student],
      // Built by the migrations, like production and like the Dasma e2e.
      migrations: [path.resolve(__dirname, '../src/migrations/*.ts')],
      migrationsRun: true,
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    students = dataSource.getRepository(Student);
    // The service never touches the employee repository on this path.
    service = new SyncService(students, {} as never);
  }, 60000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE students');
  });

  it('error: rejects a cursor that is not a feed token', async () => {
    await expect(
      service.getAllStudents({ cursor: 'not-a-token' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('error: rejects cursor and since sent together', async () => {
    const token = encodeFeedToken({
      mode: 'd',
      key: '2026-01-01 00:00:00',
      id: 1,
    });

    await expect(
      service.getAllStudents({ cursor: token, since: token }),
    ).rejects.toThrow(BadRequestException);
  });

  it('edge: an empty roster returns no rows and no tokens', async () => {
    await expect(service.getAllStudents({ limit: 10 })).resolves.toEqual({
      students: [],
      nextCursor: null,
      syncToken: null,
    });
  });

  it('edge: the first sync leaves out archived students and a delta includes them', async () => {
    await seed([
      { id: '1', updatedAt: '2026-01-01 00:00:00' },
      { id: '2', updatedAt: '2026-01-02 00:00:00', archived: true },
    ]);

    const first = await service.getAllStudents({ limit: 10 });
    const since = encodeFeedToken({
      mode: 'd',
      key: '2025-12-31 00:00:00',
      id: 0,
    });
    const delta = await service.getAllStudents({ limit: 10, since });

    expect(idsOf(first)).toEqual(['1']);
    expect(delta.students.map((s) => [s.ID_Number, s.isArchived])).toEqual([
      ['1', false],
      ['2', true],
    ]);
  });

  it('edge: a student whose updatedAt is NULL is still returned, exactly once', async () => {
    await seed([
      { id: '1', updatedAt: '2026-01-01 00:00:00' },
      { id: '2', updatedAt: null },
      { id: '3', updatedAt: '2026-01-02 00:00:00' },
    ]);

    const pages = await pullAll(1);

    expect(pages.flatMap(idsOf).sort()).toEqual(['1', '2', '3']);
  });

  it('regression: students sharing one microsecond updatedAt are paged without looping or skipping', async () => {
    const tie = '2026-01-01 00:00:00.123456';
    await seed([
      { id: '1', updatedAt: tie },
      { id: '2', updatedAt: tie },
      { id: '3', updatedAt: tie },
    ]);

    const pages = await pullAll(1);

    expect(pages).toHaveLength(3);
    expect(pages.flatMap(idsOf)).toEqual(['1', '2', '3']);
  });

  it('regression: a repository update moves the student into the next delta', async () => {
    await seed([
      { id: '1', updatedAt: '2026-01-01 00:00:00' },
      { id: '2', updatedAt: '2026-01-02 00:00:00' },
      { id: '3', updatedAt: '2025-12-01 00:00:00' },
    ]);
    const first = await service.getAllStudents({ limit: 10 });

    await students.update({ ID_Number: '1' }, { Name: 'Renamed' });
    const delta = await service.getAllStudents({
      limit: 10,
      since: first.syncToken as string,
    });

    expect(idsOf(delta)).toEqual(['2', '1']);
    expect(delta.students[1].Name).toBe('Renamed');
  });

  it('regression: a delta re-sends the last ten minutes so a late commit is not missed', async () => {
    await seed([
      { id: '1', updatedAt: '2026-01-01 12:00:00' },
      { id: '2', updatedAt: '2026-01-01 12:06:00' },
      { id: '3', updatedAt: '2026-01-01 12:11:00' },
    ]);
    const first = await service.getAllStudents({ limit: 10 });

    const delta = await service.getAllStudents({
      limit: 10,
      since: first.syncToken as string,
    });

    expect(idsOf(delta)).toEqual(['2', '3']);
  });

  it('regression: the delta of a quiet roster is only the last row and hands back a token', async () => {
    await seed([
      { id: '1', updatedAt: '2026-01-01 00:00:00' },
      { id: '2', updatedAt: '2026-01-02 00:00:00' },
    ]);
    const first = await service.getAllStudents({ limit: 10 });

    const delta = await service.getAllStudents({
      limit: 10,
      since: first.syncToken as string,
    });

    expect(idsOf(delta)).toEqual(['2']);
    expect(delta.syncToken).toEqual(first.syncToken);
  });

  it('happy: 25 students in pages of 10 arrive as 10, 10 and 5 with no gap or repeat', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: String(i + 1).padStart(2, '0'),
      updatedAt: `2026-01-01 00:00:${String(i).padStart(2, '0')}`,
    }));
    await seed(rows);

    const pages = await pullAll(10);

    expect(pages.map((p) => p.students.length)).toEqual([10, 10, 5]);
    expect(pages.map((p) => p.nextCursor !== null)).toEqual([
      true,
      true,
      false,
    ]);
    expect(pages.map((p) => p.syncToken !== null)).toEqual([
      false,
      false,
      true,
    ]);
    expect(pages.flatMap(idsOf)).toEqual(rows.map((r) => r.id));
  });

  it('happy: a stored Photo never appears in a feed row', async () => {
    await seed([
      { id: '1', updatedAt: '2026-01-01 00:00:00', photo: '/9j/BLOB' },
    ]);

    const page = await service.getAllStudents({ limit: 10 });
    const stored = await students.findOneByOrFail({ ID_Number: '1' });

    expect(page.students[0]).not.toHaveProperty('Photo');
    expect(stored.Photo).toBe('/9j/BLOB');
  });
});
