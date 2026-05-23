/**
 * Setup/regenerate .cursor integration files based on project detection.
 * Detects: backend NestJS, TypeORM, modules from src/
 * Creates minimal .md stubs so indexer and pre-commit work immediately.
 * Usage: bun run scripts/setup-cursor-integration.ts
 * Hard Rule A: All .cursor docs use .md extension only (per CURSOR_INTEGRATION.mdc GLOBAL OUTPUT FORMAT).
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TODAY = new Date().toISOString().slice(0, 10);

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function detectModules(): string[] {
  const srcDir = path.join(ROOT, 'src');
  if (!fs.existsSync(srcDir)) return [];
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
}

function detectTechStack(pkg: Record<string, unknown>): Record<string, string> {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } as Record<string, string>;
  return {
    nest: deps['@nestjs/core'] || '',
    typeorm: deps['typeorm'] || deps['@nestjs/typeorm'] || '',
    pg: deps['pg'] || '',
    redis: deps['ioredis'] || deps['redis'] || '',
    socketio: deps['socket.io'] || deps['@nestjs/platform-socket.io'] || '',
  };
}

function writeStub(filePath: string, title: string, body: string): void {
  const fullPath = path.join(ROOT, '.cursor', filePath);
  const dir = path.dirname(fullPath);
  ensureDir(dir);
  const content = `# ${title}

Last updated: ${TODAY}

${body}
`;
  fs.writeFileSync(fullPath, content, 'utf-8');
  console.log('  Created:', filePath);
}

function main(): void {
  const pkgPath = path.join(ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error('No package.json found');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } as Record<string, string>;
  const hasNest = !!deps['@nestjs/core'];
  const hasTypeorm = !!(deps['typeorm'] || deps['@nestjs/typeorm']);

  const projectType = 'backend';
  const modules = detectModules();
  const tech = detectTechStack(pkg);

  console.log('Project type:', projectType);
  console.log('Tech: NestJS, TypeORM, PostgreSQL, Redis, Socket.io');
  console.log('Modules:', modules.join(', '));

  ensureDir(path.join(ROOT, '.cursor'));
  ensureDir(path.join(ROOT, '.cursor/architecture'));
  ensureDir(path.join(ROOT, '.cursor/file-index'));
  ensureDir(path.join(ROOT, '.cursor/debugging'));
  ensureDir(path.join(ROOT, '.cursor/rules'));
  ensureDir(path.join(ROOT, '.cursor/commands'));
  ensureDir(path.join(ROOT, '.cursor/maintenance'));

  console.log('\nCreating .md stubs...');

  // Core files (do not overwrite CURSOR_INTEGRATION.mdc)
  const entryPointPath = path.join(ROOT, '.cursor', 'rules', 'entry-point.md');
  ensureDir(path.dirname(entryPointPath));
  fs.writeFileSync(
    entryPointPath,
    `---
alwaysApply: true
---

# Entry Point - Cursor AI Integration

**Hard Rule B**: Always load \`@.cursor/rules/entry-point.md\` first for any workflow.

## Purpose

Primary entry point for the Cursor AI context system. Automatically routes prompts to appropriate rules, discovers files, and enforces planning before implementation.

## Intent Detection

Analyze user prompts to detect intent from keywords and context:

| Intent | Keywords | Rules to Apply |
|--------|----------|----------------|
| Bug fix | bug, fix, error, broken, not working, crash | bug-fix.md, root-cause-analysis.md |
| Feature | add, implement, create, new feature | feature-implementation.md |
| Enhancement | improve, enhance, optimize, better | enhancement.md |
| Refactor | refactor, clean up, simplify | refactoring.md |
| Code review | review, check, audit | code-review.md |
| Testing | test, coverage, spec | testing.md |

## File Discovery

Use file-index to locate files mentioned in prompts:

- **Controllers**: \`file-index/controllers-index.md\`
- **Services**: \`file-index/services-index.md\`
- **Models/Entities**: \`file-index/models-index.md\`
- **Utils**: \`file-index/utils-index.md\`
- **Full tree**: \`file-index/src-index.md\`

## Automatic Workflow

1. Load this entry point first
2. Detect intent from prompt
3. Resolve file references via file-index
4. Apply relevant rules (rules/*.md)
5. Include architecture docs as needed
6. Create execution plan (required gate)
7. Implement when plan is approved
8. Verify and update indexes

## Planning Gate

Before any implementation:

1. Create execution plan with: exact files, exact edits, reasons, before/after snippets, verification steps
2. Verify file existence and current code
3. Ask clarifying questions if gaps exist
4. Execute strictly against approved plan

## Project Context

- **Type**: NestJS backend
- **Modules**: ${modules.join(', ')}
- **Tech**: TypeORM, PostgreSQL, Redis, Socket.io, Swagger

Last updated: ${TODAY}
`,
    'utf-8'
  );
  console.log('  Created: rules/entry-point.md');
  writeStub('README.md', 'Cursor Integration Overview', 'System overview and usage. See CURSOR_INTEGRATION.mdc for full spec.');
  writeStub('CURSOR_USAGE_GUIDE.md', 'Cursor Usage Guide', 'Project-tailored handbook. Regenerate with: "Analyze the codebase and regenerate all .cursor/ files according to @.cursor/CURSOR_INTEGRATION.mdc"');

  // Architecture (backend)
  writeStub('architecture/overview.md', 'Architecture Overview', 'System architecture, module relationships, data flow. Add mermaid diagrams.');
  writeStub('architecture/tech-stack.md', 'Tech Stack', `NestJS ${tech.nest}, TypeORM ${tech.typeorm}, PostgreSQL, Redis, Socket.io.`);
  writeStub('architecture/api-integration.md', 'API Integration', 'REST patterns, Swagger, auth, error handling.');
  writeStub('architecture/module-structure.md', 'Module Structure', `Modules: ${modules.join(', ')}.`);
  writeStub('architecture/database.md', 'Database', 'TypeORM, entities, migrations, data-source.');
  writeStub('architecture/service-patterns.md', 'Service Patterns', 'NestJS services, dependency injection, module boundaries.');

  // File indexes (backend)
  writeStub('file-index/src-index.md', 'Source Index', 'Full src/ directory tree. Update when structure changes.');
  writeStub('file-index/utils-index.md', 'Utils Index', 'config, common, decorators, interceptors.');
  writeStub('file-index/controllers-index.md', 'Controllers Index', 'All *.controller.ts files.');
  writeStub('file-index/services-index.md', 'Services Index', 'All *.service.ts and services/*.ts files.');
  writeStub('file-index/models-index.md', 'Models Index', 'All entities/*.entity.ts files.');

  // Debugging
  writeStub('debugging/workflow.md', 'Debugging Workflow', 'Reproduce → identify → RCA → fix → test.');
  writeStub('debugging/root-cause-analysis.md', 'Root Cause Analysis', 'RCA template: problem, affected areas, root cause, impact, solution.');
  writeStub('debugging/common-issues.md', 'Common Issues', 'Known issues database with solutions.');
  writeStub('debugging/fix-plan-template.md', 'Fix Plan Template', 'Standardized fix plan format.');

  // Rules
  writeStub('rules/bug-fix.md', 'Bug Fix Rules', 'Reproduce first, use RCA, test thoroughly.');
  writeStub('rules/feature-implementation.md', 'Feature Implementation Rules', 'Follow architecture, use patterns, create types, error handling.');
  writeStub('rules/enhancement.md', 'Enhancement Rules', 'Understand current, identify improvements, maintain compatibility.');
  writeStub('rules/refactoring.md', 'Refactoring Rules', 'Maintain functionality, follow style, update related files.');
  writeStub('rules/code-review.md', 'Code Review Rules', 'Check patterns, error handling, performance.');
  writeStub('rules/testing.md', 'Testing Rules', 'Happy paths, error cases, edge cases.');
  writeStub('rules/automation-guidelines.md', 'Automation Guidelines', 'When to proceed automatically vs ask questions.');

  // Commands (optional templates)
  writeStub('commands/bug-report.md', 'Bug Report Template', 'Description, steps, expected/actual, environment.');
  writeStub('commands/new-feature.md', 'New Feature Template', 'Description, requirements, acceptance criteria.');
  writeStub('commands/enhancement.md', 'Enhancement Template', 'Current behavior, desired improvement, benefits.');
  writeStub('commands/refactor.md', 'Refactor Template', 'Code, reason, scope.');
  writeStub('commands/code-review.md', 'Code Review Template', 'Files, focus areas.');

  // Maintenance
  writeStub('maintenance/update-workflow.md', 'Update Workflow', 'When and how to update .cursor files.');
  writeStub('maintenance/update-checklist.md', 'Update Checklist', 'Maintenance checklist.');
  writeStub('maintenance/auto-update-guide.md', 'Auto-Update Guide', 'AI auto-update instructions.');

  // AGENTS.md (Cursor built-in trigger)
  const agentsPath = path.join(ROOT, 'AGENTS.md');
  fs.writeFileSync(agentsPath, 'For any task, load @.cursor/rules/entry-point.md first and follow its workflow.\n', 'utf-8');
  console.log('  Created: AGENTS.md');

  console.log('\nDone. Run "bun run scripts/update-cursor-indexes.ts --dry-run" to verify indexer.');
}

main();
