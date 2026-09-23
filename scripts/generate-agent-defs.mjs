#!/usr/bin/env node
// One source of truth for the Claude Code subagent personas:
//   agents/src/*.agent.mjs (+ agents/src/prompts/*.md)  ->  .claude/agents/<prefix>-<name>.md
// `npm run agents:generate` writes them; `npm run agents:lint` (--check) fails on drift,
// orphans, or two personas claiming the same owned glob. Never hand-edit the output.

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "agents", "src");
const CLAUDE_DIR = join(ROOT, ".claude", "agents");

function escapeDoubleQuoted(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

// Appended to every persona so repo-wide policy cannot drift per persona.
export const GLOBAL_POLICY = `
# Global Policy (applies to every persona)

- Respond in caveman ultra per /Users/romeoangelesjr/.agents/skills/caveman/SKILL.md. Code, tests, commit messages, and PR text stay normal.
- Persona: Senior Staff Full Stack AI Engineer specialising in a self-hosted NestJS + TypeORM/PostgreSQL + Redis API and a Next.js 15 portal on Windows Server 2022 (PM2), built with Bun + Turborepo. Simplest durable solution; never a band-aid.
- This system gates physical access. The four invariants in .ai-engineering/core/safety.md "Project Invariants" hold on every task: studentMutationLock is never bypassed; a BioStar deprovision failure rolls back the matching PostgreSQL change; JWT role checks use the Role enum, never a string literal; gate-access writes to reports are never silently dropped.
- Find things with Graphify (/graphify query|path|explain); grep only when Graphify cannot answer, and say which query failed.
- Follow AGENTS.md (Canonical Task Flow) strictly; read docs/ai/planning.md before any planning and docs/ai/execution.md before any code.
- Strict TDD: tests first, cases ordered error: > edge: > regression: > happy:, seen failing with npm run tdd:red before any apps/*/src logic change (docs/ai/testing-strategy.md "Strict TDD").
- Read .ai-engineering/core/operating-model.md first; read the relevant .ai-engineering/agents/ role before acting; follow .ai-engineering/core/task-lifecycle.md, .ai-engineering/core/safety.md, .ai-engineering/core/evidence-policy.md, applicable .ai-engineering/workflows/, and .ai-engineering/config/autonomous-engineering.yaml.
- Migrations: TypeORM, additive and backward compatible; destructive operations only with Romeo's explicit approval — canonical rule in docs/ai/planning.md "Migrations".
`;

const REQUIRED = ["name", "filePrefix", "description", "systemPrompt"];

function validate(persona) {
  for (const field of REQUIRED) {
    if (typeof persona[field] !== "string" || !persona[field].trim()) {
      throw new Error(`${persona.name ?? "(unnamed persona)"}: missing required field "${field}"`);
    }
  }
  if (!Array.isArray(persona.claude?.tools) || persona.claude.tools.length === 0) {
    throw new Error(`${persona.name}: claude.tools must list at least one tool`);
  }
  if (typeof persona.claude?.model !== "string" || !persona.claude.model) {
    throw new Error(`${persona.name}: claude.model is required`);
  }
}

export function claudeFilePath(persona) {
  return join(CLAUDE_DIR, `${persona.filePrefix}-${persona.name}.md`);
}

export function renderClaudeMarkdown(persona) {
  validate(persona);
  const frontmatter = [
    "---",
    `name: ${persona.name}`,
    `description: "${escapeDoubleQuoted(persona.description)}"`,
    `tools: ${persona.claude.tools.join(", ")}`,
    `model: ${persona.claude.model}`,
    "---",
    "",
    "",
  ].join("\n");
  return frontmatter + persona.systemPrompt + GLOBAL_POLICY;
}

async function loadPersonas() {
  const files = readdirSync(SRC_DIR)
    .filter((file) => file.endsWith(".agent.mjs"))
    .sort();
  const personas = [];
  for (const file of files) {
    const personaModule = await import(pathToFileURL(join(SRC_DIR, file)).href);
    personas.push(personaModule.default);
  }
  return personas;
}

function computeTargets(personas) {
  const targets = new Map();
  for (const persona of personas) targets.set(claudeFilePath(persona), renderClaudeMarkdown(persona));
  return targets;
}

function listExistingGenerated() {
  if (!existsSync(CLAUDE_DIR)) return [];
  return readdirSync(CLAUDE_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => join(CLAUDE_DIR, file));
}

// Exact-string collision only, not full glob overlap — catches the common
// copy-paste-glob mistake without a glob-matching library. Nested ownership
// (a narrower glob inside a broader one) is documented in docs/ai/agent-orchestration.md.
function findDuplicateOwnedGlobs(personas) {
  const seen = new Map();
  const failures = [];
  for (const persona of personas) {
    for (const glob of persona.ownedGlobs ?? []) {
      const owner = seen.get(glob);
      if (owner && owner !== persona.name) {
        failures.push(`ownedGlobs conflict: "${glob}" claimed by both "${owner}" and "${persona.name}"`);
      } else {
        seen.set(glob, persona.name);
      }
    }
  }
  return failures;
}

async function generate() {
  const personas = await loadPersonas();
  const targets = computeTargets(personas);
  mkdirSync(CLAUDE_DIR, { recursive: true });
  for (const [path, content] of targets) {
    writeFileSync(path, content, "utf8");
    console.log(`Wrote ${path}`);
  }
  console.log(`Generated ${personas.length} Claude agent definitions from agents/src/*.agent.mjs.`);
}

async function check() {
  const personas = await loadPersonas();
  const targets = computeTargets(personas);
  const failures = [];

  for (const [path, expected] of targets) {
    if (!existsSync(path)) {
      failures.push(`${path}: file does not exist — run 'npm run agents:generate' to generate it`);
      continue;
    }
    if (readFileSync(path, "utf8") !== expected) {
      failures.push(`${path}: generated content does not match agents/src/*.agent.mjs — run 'npm run agents:generate' to regenerate`);
    }
  }

  for (const existingPath of listExistingGenerated()) {
    if (!targets.has(existingPath)) {
      failures.push(`${existingPath}: no matching agents/src/*.agent.mjs source — delete this file or add its source`);
    }
  }

  failures.push(...findDuplicateOwnedGlobs(personas));

  if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`Agent definitions lint passed (${personas.length} personas).`);
}

async function main() {
  if (process.argv.includes("--check")) await check();
  else await generate();
}

function isDirectlyInvoked() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectlyInvoked()) await main();
