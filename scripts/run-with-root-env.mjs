import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// fileURLToPath, not new URL().pathname: pathname keeps percent-encoding and a
// leading slash before the drive letter, so on Windows a repo at
// "C:\DLSU Update August 10" resolved to "C:\C:\DLSU%20Update%20August%2010".
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(repoRoot, '.env');

// Warn loudly: a missed .env here bakes undefined NEXT_PUBLIC_* values into the
// Next build, which then fails in the browser instead of at build time.
const { error } = config({ path: envPath });
if (error) {
  console.warn(`[ENV] Could not load root .env at ${envPath}: ${error.message}`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Missing command. Usage: node scripts/run-with-root-env.mjs <cmd> [args...]');
  process.exit(1);
}

const [command, ...commandArgs] = args;
if (command === 'next') {
  if (process.env.FRONTEND_PORT) {
    process.env.PORT = process.env.FRONTEND_PORT;
  }
  const sub = commandArgs[0];
  if (sub === 'build' || sub === 'start') {
    process.env.NODE_ENV = 'production';
  } else if (sub === 'dev') {
    process.env.NODE_ENV = 'development';
  }
}
const child = spawn(command, commandArgs, {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 1));
