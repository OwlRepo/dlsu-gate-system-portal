/**
 * biostar-replay.ts — does the pull land a photo when BioStar answers exactly
 * as the real server answered?
 *
 * The soak next door invents payloads to prove an invariant across many shapes.
 * This does the opposite and answers a narrower, more urgent question: DLSU
 * reports `Photo` NULL in production, and nothing in the code read alone
 * explains it. So stop reasoning about what BioStar sends and replay what it
 * actually sent.
 *
 * Every list row and every user detail here is served verbatim from
 * `logs/scenario/baseline.json`, captured from the live server on 2026-09-10:
 * 34 users, `photo_exists` as the string 'true'/'false', `card_count` as a
 * string, `last_modified` as a numeric-string counter, all 34 in group 1
 * "All Users", and the full 28-key list row / 30-key detail shape. Nothing is
 * normalised or tidied on the way in — a fixture that has been tidied is a
 * fixture that can no longer reproduce the bug.
 *
 * The single substitution: the capture redacted each photo to the literal
 * '<15632 chars>'. It is replaced with synthetic base64 of the SAME length, so
 * size and shape stay faithful and no real biometric data is copied into a
 * fixture that lives in the repo.
 *
 * Starting state is the one production is in — every student row present, every
 * `Photo` NULL.
 *
 *   bun --cwd apps/backend scripts/scenario/biostar-replay.ts
 */

import * as path from 'path';
import * as fs from 'fs';
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

const BASELINE = path.resolve(__dirname, '../../logs/scenario/baseline.json');

/** A real JPEG header, so a replayed photo starts with the bytes a real one does. */
const JPEG_HEAD =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgIC';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Rebuilds a photo of the exact length the capture recorded.
 *
 * The capture stored `<15632 chars>` in place of the bytes. Length is the part
 * that matters here — it is what distinguishes a real photo from a truncated
 * one, and what would make a column-size or payload-size failure reproducible.
 */
function photoOfRecordedLength(redacted: string, seed: number): string {
  const m = /^<(\d+) chars>$/.exec(redacted.trim());
  if (!m) return redacted; // not redacted — replay whatever was captured
  const total = Number(m[1]);
  let out = JPEG_HEAD;
  let s = seed >>> 0;
  while (out.length < total) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out += B64[s % B64.length];
  }
  return out.slice(0, total);
}

type Row = Record<string, unknown>;

async function main(): Promise<void> {
  if (!fs.existsSync(BASELINE)) {
    throw new Error(`No capture at ${BASELINE}`);
  }
  const capture = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const listRows: Row[] = capture.biostar.list;
  const details: Record<string, Row> = capture.biostar.details;

  const expectPhoto = new Map<string, number>();
  let seed = 20260910;
  for (const [userId, detail] of Object.entries(details)) {
    const raw = detail.photo;
    if (typeof raw === 'string' && raw.trim() !== '') {
      const rebuilt = photoOfRecordedLength(raw, (seed += 7919));
      detail.photo = rebuilt;
      expectPhoto.set(userId, rebuilt.length);
    }
  }

  const flaggedTrue = listRows
    .filter((r) => String(r.photo_exists) === 'true')
    .map((r) => String(r.user_id));
  const flaggedFalse = listRows
    .filter((r) => String(r.photo_exists) === 'false')
    .map((r) => String(r.user_id));

  console.log(
    `replay: ${listRows.length} captured users, ` +
      `${flaggedTrue.length} flagged photo_exists='true', ` +
      `${expectPhoto.size} details carrying photo bytes\n`,
  );

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

  // Production's observed starting state: the roster sync has run, so every
  // student row exists, and every Photo is NULL because the pull never filled
  // it in.
  for (const row of listRows) {
    await students.insert({
      ID_Number: String(row.user_id),
      Name: String(row.name ?? ''),
      Photo: null,
      Campus_Entry: 'Y',
      isArchived: false,
      remarks_checked_at: new Date(),
    } as Partial<Student>);
  }

  biostar.listPages = [{ total: listRows.length, rows: listRows }];
  biostar.userDetails = details as Record<string, Record<string, unknown>>;

  let failures = 0;
  const fail = (msg: string) => {
    failures++;
    console.log(`  FAIL ${msg}`);
  };

  // ---- Run 1 — the pull production says does nothing ---------------------
  await service.syncFromBiostar('replay-1');
  const detailCallsRun1 = biostar.requestsTo('/api/users/').length;

  for (const userId of flaggedTrue) {
    const stored = await students.findOne({ where: { ID_Number: userId } });
    const want = expectPhoto.get(userId);
    const got = stored?.Photo ?? null;
    if (want === undefined) {
      if (got !== null) {
        fail(
          `${userId}: flagged true, detail sent nothing, yet a photo appeared`,
        );
      }
      continue;
    }
    if (got === null) {
      fail(
        `${userId}: BioStar sent ${want} chars of photo, PostgreSQL holds NULL`,
      );
    } else if (got.length !== want) {
      fail(`${userId}: stored photo is ${got.length} chars, sent ${want}`);
    }
  }

  for (const userId of flaggedFalse) {
    const stored = await students.findOne({ where: { ID_Number: userId } });
    if ((stored?.Photo ?? null) !== null) {
      fail(`${userId}: flagged photo_exists='false' but a photo was stored`);
    }
  }

  const withPhoto = (await ds.query(
    'SELECT count(*)::int AS n FROM students WHERE "Photo" IS NOT NULL',
  )) as { n: number }[];

  // ---- Run 2 — nothing changed upstream, so nothing should move ----------
  const before = biostar.requestsTo('/api/users/').length;
  await service.syncFromBiostar('replay-2');
  const detailCallsRun2 = biostar.requestsTo('/api/users/').length - before;

  for (const userId of flaggedTrue) {
    if (expectPhoto.get(userId) === undefined) continue;
    const stored = await students.findOne({ where: { ID_Number: userId } });
    if ((stored?.Photo ?? null) === null) {
      fail(`${userId}: photo was lost by the second run`);
    }
  }

  console.log('\n' + '='.repeat(64));
  console.log(`captured users replayed             : ${listRows.length}`);
  console.log(`flagged photo_exists='true'         : ${flaggedTrue.length}`);
  console.log(`details that carried photo bytes    : ${expectPhoto.size}`);
  console.log(`detail fetches, run 1               : ${detailCallsRun1}`);
  console.log(`detail fetches, run 2               : ${detailCallsRun2}`);
  console.log(`students holding a photo after run 1: ${withPhoto[0].n}`);
  console.log(`invariant failures                  : ${failures}`);
  console.log(
    failures === 0
      ? 'PASS — every photo the real server sent reached PostgreSQL.'
      : 'FAIL — reproduced the reported symptom locally.',
  );
  console.log('='.repeat(64));

  await biostar.close();
  await ds.destroy();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('[biostar-replay] fatal:', e?.message ?? e);
  process.exit(1);
});
