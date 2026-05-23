import * as fs from 'fs';
import * as path from 'path';

function resolveRepoRoot(start: string): string {
  let current = start;
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(current, 'docs', 'ai', 'entry-point.md'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return start;
}

const ROOT = resolveRepoRoot(process.cwd());

function assertPathExists(relativePath: string): void {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required Codex integration path: ${relativePath}`);
  }
}

function main(): void {
  assertPathExists('docs/ai/entry-point.md');
  assertPathExists('docs/ai/implementation-playbook.md');
  assertPathExists('docs/ai/file-index');
  assertPathExists('docs/ai/architecture');
  assertPathExists('docs/ai/workflows');

  console.log('Codex integration paths verified.');
  console.log('Use docs/ai/entry-point.md as the single AI integration entrypoint.');
}

main();

export {};
