import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const DRY_RUN = process.argv.includes('--dry-run');
const TODAY = new Date().toISOString().slice(0, 10);

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

const INDEX_MAP: Record<string, string[]> = {
  'docs/ai/file-index/controllers-index.md': ['apps/backend/src/**/*.controller.ts'],
  'docs/ai/file-index/services-index.md': ['apps/backend/src/**/*.service.ts', 'apps/backend/src/**/services/*.ts'],
  'docs/ai/file-index/models-index.md': ['apps/backend/src/**/entities/*.entity.ts'],
  'docs/ai/file-index/hooks-index.md': ['apps/portal-web/src/hooks/**/*.ts', 'apps/portal-web/src/hooks/**/*.tsx'],
  'docs/ai/file-index/components-index.md': ['apps/portal-web/src/components/**/*.tsx'],
  'docs/ai/file-index/utils-index.md': ['apps/portal-web/src/lib/**/*.ts', 'apps/portal-web/src/lib/**/*.tsx'],
  'docs/ai/file-index/src-index.md': ['apps/backend/src/**/*.ts', 'apps/portal-web/src/**/*.ts', 'apps/portal-web/src/**/*.tsx'],
  'docs/ai/architecture/code-map.md': ['apps/**', 'scripts/**'],
  'docs/ai/architecture/environment.md': ['.env.example', '.env'],
};

function getStagedFiles(): string[] {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACMR', {
      encoding: 'utf-8',
    });
    return out.trim() ? out.trim().split('\n') : [];
  } catch {
    return [];
  }
}

function pathMatches(filePath: string, patterns: string[]): boolean {
  for (const p of patterns) {
    const escaped = p
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '<<G>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<G>>/g, '.*');
    const regex = new RegExp('^' + escaped + '$');
    if (regex.test(filePath)) return true;
  }
  return false;
}

function getAffectedIndexes(staged: string[]): Set<string> {
  const affected = new Set<string>();
  for (const file of staged) {
    for (const [indexPath, patterns] of Object.entries(INDEX_MAP)) {
      if (pathMatches(file, patterns)) {
        affected.add(indexPath);
      }
    }
  }
  return affected;
}

function updateTimestamp(content: string): string {
  if (/Last updated: \d{4}-\d{2}-\d{2}/.test(content)) {
    return content.replace(/Last updated: \d{4}-\d{2}-\d{2}/, `Last updated: ${TODAY}`);
  }
  return content;
}

function main(): void {
  const staged = getStagedFiles();
  const affected = getAffectedIndexes(staged);

  if (affected.size === 0) {
    if (!DRY_RUN) {
      console.log('No Codex index files affected by staged changes.');
    }
    return;
  }

  for (const indexPath of affected) {
    const fullPath = path.join(ROOT, indexPath);
    if (!fs.existsSync(fullPath)) continue;

    const original = fs.readFileSync(fullPath, 'utf-8');
    const updated = updateTimestamp(original);

    if (DRY_RUN) {
      console.log(`[dry-run] Would update ${indexPath}`);
      continue;
    }

    fs.writeFileSync(fullPath, updated, 'utf-8');
    console.log(`Updated ${indexPath}`);
  }
}

main();

export {};
