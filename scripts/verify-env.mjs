import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// fileURLToPath, not new URL().pathname: pathname keeps percent-encoding and a
// leading slash before the drive letter, so on Windows a repo at
// "C:\DLSU Update August 10" resolved to "C:\C:\DLSU%20Update%20August%2010".
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(repoRoot, '.env');

if (!fs.existsSync(envPath)) {
  console.error(`[ENV] Missing root .env at ${envPath}`);
  process.exit(20);
}

config({ path: envPath });

const target = process.argv[2];
const requiredByTarget = {
  backend: ['JWT_SECRET', 'DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME', 'PORT'],
  web: ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_WS_HOST', 'NEXT_PUBLIC_BIOSTAR_API', 'NEXT_PUBLIC_BIOSTAR_LOGIN_ID', 'NEXT_PUBLIC_BIOSTAR_PASSWORD', 'FRONTEND_PORT'],
};

if (!target || !requiredByTarget[target]) {
  console.error('[ENV] Usage: node scripts/verify-env.mjs <backend|web>');
  process.exit(20);
}

const missing = requiredByTarget[target].filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[ENV] Missing keys for ${target}: ${missing.join(', ')}`);
  process.exit(20);
}

// Copying .env.example and deploying it unchanged passes a presence-only check,
// then fails much later as a database auth error - or worse, does not fail at
// all and ships a guessable JWT signing key on a system that opens doors.
// DB_PASSWORD is deliberately absent: check:db connects for real, so a wrong
// password is proven rather than guessed, and "postgres" is a legitimate local
// development password.
const placeholders = {
  JWT_SECRET: ['your-jwt-secret', 'secret', 'changeme', 'your-secret-key'],
  DATABASE_URL: ['postgresql://user:pass@host:5432/db'],
  NEXT_PUBLIC_BIOSTAR_PASSWORD: ['password', 'changeme'],
};

const stillExample = requiredByTarget[target]
  .concat('DATABASE_URL')
  .filter((key) => placeholders[key]?.includes((process.env[key] ?? '').trim()));

if (stillExample.length > 0) {
  console.error(`[ENV] These keys still hold example values from .env.example: ${stillExample.join(', ')}`);
  console.error('[ENV] Replace them with the real values for this machine before deploying.');
  if (stillExample.includes('JWT_SECRET')) {
    console.error('[ENV] JWT_SECRET signs every login token. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  }
  process.exit(20);
}

if (target === 'backend' && process.env.NODE_ENV !== 'production') {
  console.warn(`[ENV] NODE_ENV is "${process.env.NODE_ENV ?? 'unset'}". On a production box set NODE_ENV=production, otherwise TypeORM logs every query.`);
}

console.log(`[ENV] ${target} validation passed using ${envPath}`);
