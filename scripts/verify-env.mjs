import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { config } from 'dotenv';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
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

console.log(`[ENV] ${target} validation passed using ${envPath}`);
