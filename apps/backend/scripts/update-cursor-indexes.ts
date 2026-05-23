/**
 * Updates .cursor/file-index/*.md based on staged file changes.
 * Maps file paths to index files and updates timestamps/entries.
 * Usage: bun run scripts/update-cursor-indexes.ts [--dry-run]
 * Hard Rule A: All .cursor docs use .md extension only (per CURSOR_INTEGRATION.mdc GLOBAL OUTPUT FORMAT).
 */

const DRY_RUN = process.argv.includes('--dry-run');

const INDEX_MAP: Record<string, string[]> = {
  'file-index/controllers-index.md': ['src/**/*.controller.ts'],
  'file-index/services-index.md': [
    'src/**/*.service.ts',
    'src/**/services/*.ts',
  ],
  'file-index/models-index.md': ['src/**/entities/*.entity.ts'],
  'file-index/utils-index.md': [
    'src/config/*.ts',
    'src/common/**/*.ts',
    'src/decorators/*.ts',
    'src/interceptors/*.ts',
  ],
  'file-index/src-index.md': ['src/**/*.ts'],
};

function getStagedFiles(): string[] {
  const { execSync } = require('child_process');
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
    const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '<<G>>').replace(/\*/g, '[^/]*').replace(/<<G>>/g, '.*');
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
        affected.add(`.cursor/${indexPath}`);
      }
    }
  }
  return affected;
}

function updateTimestamp(content: string): string {
  const now = new Date().toISOString().slice(0, 10);
  return content.replace(
    /Last updated: \d{4}-\d{2}-\d{2}/,
    `Last updated: ${now}`
  );
}

function main(): void {
  const staged = getStagedFiles();
  const affected = getAffectedIndexes(staged);

  if (affected.size === 0) {
    if (staged.length > 0 && !DRY_RUN) {
      console.log('No cursor index files affected by staged changes.');
    }
    return;
  }

  const fs = require('fs');
  const path = require('path');

  for (const indexPath of affected) {
    const fullPath = path.join(process.cwd(), indexPath);
    if (!fs.existsSync(fullPath)) continue;
    let content = fs.readFileSync(fullPath, 'utf-8');
    content = updateTimestamp(content);
    if (DRY_RUN) {
      console.log(`[dry-run] Would update ${indexPath}`);
    } else {
      fs.writeFileSync(fullPath, content);
      console.log(`Updated ${indexPath}`);
    }
  }
}

main();
