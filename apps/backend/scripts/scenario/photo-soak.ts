/**
 * photo-soak.ts — can the inbound pull ever lose a photo?
 *
 * The unit and e2e tests each prove one scripted case. This asks the harder
 * question the live symptom actually raised: across many pulls, with BioStar
 * answering unpredictably — sometimes with a photo, sometimes without, exactly
 * as it does for someone who qualified as a candidate by card alone — can a
 * photo already stored ever disappear?
 *
 * Real PostgreSQL (built by the migrations, not synchronize), a real HTTP
 * BioStar stand-in, and the real service. Only the roster's SQL Server side is
 * absent, and it has to be: `syncFromBiostar` never touches it.
 *
 * Three invariants, checked for every user after every pull:
 *   1. a photo already stored is never replaced by nothing
 *   2. a photo BioStar DOES send is stored
 *   3. the card still tracks whatever BioStar last reported
 *
 * Runs against the dedicated e2e database, never development data:
 *   bun --cwd apps/backend scripts/scenario/photo-soak.ts [cycles]
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { FakeBiostarServer } from '../../test/fake-biostar-server';
import { DatabaseSyncDasmaPathService } from '../../src/database-sync/services/database-sync-dasma-path.service';
import { DatabaseSyncCommonService } from '../../src/database-sync/services/shared/database-sync-common.service';
import { BiostarApiService } from '../../src/database-sync/services/shared/biostar-api.service';
import { Student } from '../../src/students/entities/student.entity';
import { SyncSchedule } from '../../src/database-sync/entities/sync-schedule.entity';
import { BiostarSyncState } from '../../src/database-sync/entities/biostar-sync-state.entity';

/** A real JPEG header, so a stored value looks like what BioStar sends. */
const JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr';
const photoFor = (id: string, gen: number) => `${JPEG}${id}_${gen}`;

/** Deterministic PRNG, so any failure can be replayed exactly. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const USERS = Array.from(
  { length: 12 },
  (_, i) => `2010000${String(i).padStart(2, '0')}`,
);

async function main(): Promise<void> {
  const cycles = Number(process.argv[2] ?? 25);
  const rand = rng(20260921);

  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5433),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.E2E_DB_NAME ?? 'dlsu_gate_system_e2e',
    entities: [Student, SyncSchedule, BiostarSyncState],
    migrations: [path.resolve(__dirname, '../../src/migrations/*.ts')],
    migrationsRun: true,
    synchronize: false,
    logging: false,
  });
  await ds.initialize();

  const biostar = new FakeBiostarServer();
  const baseUrl = await biostar.listen();

  const CONFIG: Record<string, string> = {
    BIOSTAR_API_BASE_URL: baseUrl,
    BIOSTAR_API_LOGIN_ID: 'fake',
    BIOSTAR_API_PASSWORD: 'fake',
    BIOSTAR_DETAIL_CONCURRENCY: '4',
    BIOSTAR_MAX_CANDIDATES_PER_RUN: '0',
    SOURCE_DB_SCHEMA_ENV: 'dasma',
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DatabaseSyncDasmaPathService,
      DatabaseSyncCommonService,
      BiostarApiService,
      { provide: ConfigService, useValue: { get: (k: string) => CONFIG[k] } },
      {
        provide: getRepositoryToken(Student),
        useValue: ds.getRepository(Student),
      },
      {
        provide: getRepositoryToken(SyncSchedule),
        useValue: ds.getRepository(SyncSchedule),
      },
      {
        provide: getRepositoryToken(BiostarSyncState),
        useValue: ds.getRepository(BiostarSyncState),
      },
    ],
  }).compile();

  const service = module.get(DatabaseSyncDasmaPathService);
  const students: Repository<Student> = ds.getRepository(Student);

  await ds.query('TRUNCATE TABLE students');
  await ds.query('TRUNCATE TABLE biostar_sync_state');

  // Everyone starts already holding a photo in PostgreSQL, which is precisely
  // the state the reported bug destroys.
  for (const id of USERS) {
    await students.insert({
      ID_Number: id,
      Name: `Soak, User ${id}`,
      Photo: photoFor(id, 0),
      Campus_Entry: 'Y',
      isArchived: false,
      remarks_checked_at: new Date(),
    } as Partial<Student>);
  }

  const expectedPhoto = new Map<string, string | null>(
    USERS.map((id) => [id, photoFor(id, 0)]),
  );
  const expectedCard = new Map<string, string>();
  let modified = 100;
  let violations = 0;
  let sentPhoto = 0;
  let deletedPhoto = 0;
  let omittedPhoto = 0;

  console.log(
    `soak: ${USERS.length} users x ${cycles} pulls against ${baseUrl}\n`,
  );

  for (let cycle = 1; cycle <= cycles; cycle++) {
    const rows: Record<string, unknown>[] = [];
    biostar.userDetails = {};

    for (const id of USERS) {
      // One of the three things BioStar can say about this person, which is
      // the whole point: a deletion and an incomplete reply both arrive as
      // "no photo in the payload" and must be handled oppositely.
      const roll = rand();
      const card = String(5550000 + Math.floor(rand() * 9999));
      modified += 1;

      let photoExists: boolean;
      if (roll < 0.4) {
        // SENT — BioStar has a photo and includes it.
        const photo = photoFor(id, cycle);
        photoExists = true;
        biostar.userDetails[id] = {
          user_id: id,
          name: `Soak, User ${id}`,
          disabled: 'false',
          photo_exists: 'true',
          photo,
          cards: [{ card_id: card }],
        };
        expectedPhoto.set(id, photo);
        sentPhoto++;
      } else if (roll < 0.6) {
        // DELETED — somebody removed the photo in BioStar. Ours must follow,
        // or a guard is shown a face that is no longer the right one.
        photoExists = false;
        biostar.userDetails[id] = {
          user_id: id,
          name: `Soak, User ${id}`,
          disabled: 'false',
          photo_exists: 'false',
          cards: [{ card_id: card }],
        };
        expectedPhoto.set(id, null);
        deletedPhoto++;
      } else {
        // OMITTED — BioStar says a photo exists but did not send it. Ours
        // must survive untouched.
        photoExists = true;
        biostar.userDetails[id] = {
          user_id: id,
          name: `Soak, User ${id}`,
          disabled: 'false',
          photo_exists: 'true',
          cards: [{ card_id: card }],
        };
        omittedPhoto++;
      }

      expectedCard.set(id, card);
      rows.push({
        user_id: id,
        name: `Soak, User ${id}`,
        photo_exists: photoExists,
        card_count: '1',
        last_modified: String(modified),
      });
    }

    biostar.listPages = [{ total: rows.length, rows }];
    await service.syncFromBiostar(`soak-${cycle}`);

    for (const id of USERS) {
      const row = await students.findOne({ where: { ID_Number: id } });
      const want = expectedPhoto.get(id);
      const got = row?.Photo ?? null;
      if (got !== want) {
        violations++;
        console.log(
          `  VIOLATION cycle ${cycle} user ${id}: photo is ` +
            `${got === null ? 'NULL' : 'a value'}, expected ` +
            `${want === null ? 'NULL' : 'the stored one'}`,
        );
      }
      if (String(row?.Unique_ID ?? '') !== expectedCard.get(id)) {
        violations++;
        console.log(
          `  VIOLATION cycle ${cycle} user ${id}: card ${row?.Unique_ID} != ${expectedCard.get(id)}`,
        );
      }
    }
    if (cycle % 5 === 0) {
      console.log(`  ...${cycle} pulls, ${violations} violation(s) so far`);
    }
  }

  const total = await students.count();
  const nullPhotos = (await ds.query(
    'SELECT count(*)::int AS n FROM students WHERE "Photo" IS NULL',
  )) as { n: number }[];

  console.log('\n' + '='.repeat(62));
  console.log(`BioStar SENT a photo                 : ${sentPhoto}`);
  console.log(`BioStar had DELETED the photo        : ${deletedPhoto}`);
  console.log(`BioStar OMITTED an existing photo    : ${omittedPhoto}`);
  console.log(`students in table                    : ${total}`);
  console.log(`students whose photo is NULL         : ${nullPhotos[0].n}`);
  console.log(`invariant violations                 : ${violations}`);
  console.log(
    violations === 0
      ? 'PASS — deletions propagated, omissions never lost a photo.'
      : 'FAIL',
  );
  console.log('='.repeat(62));

  await biostar.close();
  await ds.destroy();
  process.exit(violations === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('[photo-soak] fatal:', e?.message ?? e);
  process.exit(1);
});
