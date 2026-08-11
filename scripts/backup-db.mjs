import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Pre-migration safety net. This system gates physical access, so a deploy
// should never be the first place we find out the database was not backed up.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(repoRoot, '.env');
const { error: envError } = config({ path: envPath });
if (envError) {
  console.error(`[BACKUP] Could not load root .env at ${envPath}: ${envError.message}`);
  process.exit(20);
}

const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } = process.env;
if (!DB_NAME) {
  console.error('[BACKUP] DB_NAME is not set in the root .env');
  process.exit(20);
}

// pg_dump ships with PostgreSQL, not with Node. On a Windows box where only the
// server was installed, or where its bin/ is not on PATH, it may be absent.
// That is a warning, not a deploy blocker: the pending migrations are additive.
const probe = spawnSync('pg_dump', ['--version'], { shell: process.platform === 'win32' });
if (probe.error || probe.status !== 0) {
  console.warn('[BACKUP] pg_dump not found on PATH - skipping backup.');
  console.warn('[BACKUP] Install PostgreSQL client tools to enable pre-migration backups.');
  process.exit(0);
}

const backupDir = path.join(repoRoot, 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = path.join(backupDir, `${DB_NAME}-${stamp}.sql`);

const result = spawnSync(
  'pg_dump',
  [
    '-h', DB_HOST || 'localhost',
    '-p', String(DB_PORT || 5432),
    '-U', DB_USERNAME || 'postgres',
    '-d', DB_NAME,
    '--no-owner',
    '--no-privileges',
    '-f', outFile,
  ],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, PGPASSWORD: DB_PASSWORD ?? '' },
  },
);

if (result.status !== 0) {
  console.error(`[BACKUP] pg_dump failed with exit code ${result.status}. Aborting before migrations.`);
  process.exit(50);
}

const bytes = fs.statSync(outFile).size;
if (bytes === 0) {
  console.error(`[BACKUP] pg_dump produced an empty file at ${outFile}. Aborting before migrations.`);
  process.exit(50);
}

console.log(`[BACKUP] ${DB_NAME} backed up to ${outFile} (${bytes} bytes)`);
