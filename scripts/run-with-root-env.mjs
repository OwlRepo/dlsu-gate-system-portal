import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { config } from 'dotenv';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
config({ path: path.join(repoRoot, '.env') });

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
