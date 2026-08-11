import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

// Deploys are run by non-technical operators, so a mis-parsed .env must not
// surface as "password authentication failed" three steps later. This proves
// the database is reachable before anything touches it, and repairs the two
// .env shapes dotenv silently mangles:
//   DB_PASSWORD=abc#123      -> dotenv stops at the # and yields "abc"
//   DB_PASSWORD=abc # note   -> same, inline comment
// A value that only round-trips when quoted gets rewritten as DB_PASSWORD="...".

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(repoRoot, '.env');

if (!fs.existsSync(envPath)) {
  console.error(`[DB] Missing root .env at ${envPath}`);
  process.exit(20);
}

const raw = fs.readFileSync(envPath, 'utf8').replace(/^﻿/, '');
const parsed = config({ path: envPath }).parsed ?? {};

// Whatever sits after the first "=" on the key's line, minus line-ending noise
// and surrounding quotes. This is what the operator actually typed.
function rawValue(key) {
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.startsWith(`${key}=`)) continue;
    const value = trimmed.slice(key.length + 1).trim();
    const quoted = /^(['"])(.*)\1$/.exec(value);
    return quoted ? quoted[2] : value;
  }
  return undefined;
}

function candidates(key, fallback) {
  const seen = new Set();
  return [parsed[key], rawValue(key), fallback].filter(
    (v) => v !== undefined && v !== '' && !seen.has(v) && seen.add(v),
  );
}

const host = candidates('DB_HOST', 'localhost')[0];
const port = Number(candidates('DB_PORT', '5432')[0]);
const user = candidates('DB_USERNAME', 'postgres')[0];
const database = candidates('DB_NAME')[0];
const passwords = candidates('DB_PASSWORD', '');

if (!database) {
  console.error('[DB] DB_NAME is not set in the root .env');
  process.exit(20);
}

async function tryConnect(password) {
  const client = new pg.Client({
    host,
    port,
    user,
    password,
    database,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    await client.query('select 1');
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  } finally {
    await client.end().catch(() => {});
  }
}

// Rewrite the password line quoted, so dotenv (and therefore TypeORM, which
// loads the same file in a separate process) reads the whole value next time.
function healEnv(password) {
  fs.copyFileSync(envPath, `${envPath}.bak`);
  const escaped = password.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  let replaced = false;
  const next = raw.split(/\r?\n/).map((line) => {
    if (!replaced && line.trim().startsWith('DB_PASSWORD=')) {
      replaced = true;
      return `DB_PASSWORD="${escaped}"`;
    }
    return line;
  });
  if (!replaced) next.push(`DB_PASSWORD="${escaped}"`);
  fs.writeFileSync(envPath, next.join('\n'));
}

function explain(error) {
  switch (error?.code) {
    case '28P01':
    case '28000':
      return 'The database rejected the username or password. Check DB_USERNAME and DB_PASSWORD in .env against the Postgres login.';
    case '3D000':
      return `The database "${database}" does not exist on ${host}:${port}. Check DB_NAME.`;
    case 'ECONNREFUSED':
      return `Nothing is listening on ${host}:${port}. Is the Postgres service running, and is DB_PORT correct?`;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `The host "${host}" could not be resolved. Check DB_HOST.`;
    case 'ETIMEDOUT':
      return `Connection to ${host}:${port} timed out. Check the network route and any firewall rule.`;
    default:
      return error?.message ?? String(error);
  }
}

let lastError;
for (const [index, password] of passwords.entries()) {
  const { ok, error } = await tryConnect(password);
  if (!ok) {
    lastError = error;
    continue;
  }
  if (index > 0) {
    healEnv(password);
    console.log('[DB] The password in .env was being cut short when read (an unquoted "#" ends the value).');
    console.log('[DB] Rewrote DB_PASSWORD in quotes so it is read in full. Previous file saved as .env.bak');
  }
  console.log(`[DB] Connected to ${database} on ${host}:${port} as ${user}`);
  process.exit(0);
}

console.error(`[DB] Could not connect to ${database} on ${host}:${port} as ${user}`);
console.error(`[DB] ${explain(lastError)}`);
if (passwords.length > 1) {
  console.error('[DB] Tried the password both as read by the parser and exactly as typed in .env.');
}
process.exit(20);
