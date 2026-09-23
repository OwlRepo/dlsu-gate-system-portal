import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GLOBAL_POLICY, renderClaudeMarkdown } from "./generate-agent-defs.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const GENERATOR = join(SCRIPT_DIR, "generate-agent-defs.mjs");

function fixturePersona(overrides = {}) {
  return {
    name: "fixture-agent",
    filePrefix: "99",
    description: "Fixture persona for generator tests.",
    claude: { tools: ["Read", "Grep"], model: "sonnet" },
    ownedGlobs: [],
    systemPrompt: "You are a fixture persona.\n\n# Section\n- one\n- two\n",
    ...overrides,
  };
}

function setupScratchRepo(personas = [fixturePersona()]) {
  const tmp = mkdtempSync(join(tmpdir(), "agent-defs-"));
  mkdirSync(join(tmp, "scripts"), { recursive: true });
  mkdirSync(join(tmp, "agents", "src"), { recursive: true });
  cpSync(GENERATOR, join(tmp, "scripts", "generate-agent-defs.mjs"));
  for (const persona of personas) {
    writeFileSync(
      join(tmp, "agents", "src", `${persona.name}.agent.mjs`),
      `export default ${JSON.stringify(persona, null, 2)};\n`,
    );
  }
  return tmp;
}

const generatorIn = (tmp) => join(tmp, "scripts", "generate-agent-defs.mjs");

function runGenerator(tmp, args = []) {
  return execFileSync("node", [generatorIn(tmp), ...args], { encoding: "utf8" });
}

function expectCheckFailure(tmp, pattern) {
  assert.throws(
    () => execFileSync("node", [generatorIn(tmp), "--check"], { encoding: "utf8", stdio: "pipe" }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr, pattern);
      return true;
    },
  );
}

// ---------------------------------------------------------------- error cases

test("error: a persona missing a required field is refused", () => {
  assert.throws(() => renderClaudeMarkdown(fixturePersona({ description: "" })), /description/);
  assert.throws(() => renderClaudeMarkdown(fixturePersona({ claude: { tools: [], model: "sonnet" } })), /tools/);
});

test("error: --check fails when a generated Claude file is hand-edited", () => {
  const tmp = setupScratchRepo();
  try {
    runGenerator(tmp);
    const drifted = join(tmp, ".claude", "agents", "99-fixture-agent.md");
    writeFileSync(drifted, readFileSync(drifted, "utf8") + "x");
    expectCheckFailure(tmp, /99-fixture-agent\.md/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("error: --check fails on an orphan generated file with no matching source", () => {
  const tmp = setupScratchRepo();
  try {
    runGenerator(tmp);
    writeFileSync(join(tmp, ".claude", "agents", "50-orphan.md"), "---\nname: orphan\n---\n");
    expectCheckFailure(tmp, /50-orphan\.md[\s\S]*delete this file or add its source/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("error: --check fails when two personas claim the same owned glob", () => {
  const tmp = setupScratchRepo([
    fixturePersona({ name: "one", filePrefix: "01", ownedGlobs: ["apps/backend/src/**"] }),
    fixturePersona({ name: "two", filePrefix: "02", ownedGlobs: ["apps/backend/src/**"] }),
  ]);
  try {
    runGenerator(tmp);
    expectCheckFailure(tmp, /ownedGlobs conflict/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("error: --check fails when a generated file is missing", () => {
  const tmp = setupScratchRepo();
  try {
    expectCheckFailure(tmp, /does not exist/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------------- edge cases

test("edge: descriptions with quotes and backslashes are escaped", () => {
  const persona = fixturePersona({ description: 'Say "hi" \\ bye' });
  assert.match(renderClaudeMarkdown(persona), /description: "Say \\"hi\\" \\\\ bye"/);
});

test("edge: generation writes Claude agents only, never a .codex directory", () => {
  const tmp = setupScratchRepo();
  try {
    runGenerator(tmp);
    assert.ok(existsSync(join(tmp, ".claude", "agents", "99-fixture-agent.md")));
    assert.equal(existsSync(join(tmp, ".codex")), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------- regression cases

test("regression: GLOBAL_POLICY carries caveman ultra, the stack persona and the gate invariants", () => {
  assert.match(GLOBAL_POLICY, /caveman ultra/);
  assert.match(GLOBAL_POLICY, /NestJS/);
  assert.match(GLOBAL_POLICY, /studentMutationLock/);
  assert.match(GLOBAL_POLICY, /docs\/ai\/planning\.md/);
  assert.doesNotMatch(GLOBAL_POLICY, /Supabase|Juanfer|Tarraula/);
});

test("regression: real repo --check passes against agents/src/* and the generated files", () => {
  execFileSync("node", [GENERATOR, "--check"], { cwd: REPO_ROOT, encoding: "utf8" });
});

test("regression: every declared ownedGlobs entry is documented in docs/ai/agent-orchestration.md", async () => {
  const docPath = join(REPO_ROOT, "docs", "ai", "agent-orchestration.md");
  assert.ok(existsSync(docPath), "docs/ai/agent-orchestration.md must exist");
  const doc = readFileSync(docPath, "utf8");
  const srcDir = join(REPO_ROOT, "agents", "src");
  const files = readdirSync(srcDir).filter((file) => file.endsWith(".agent.mjs"));
  assert.ok(files.length > 0, "agents/src must declare personas");
  for (const file of files) {
    const personaModule = await import(`file://${join(srcDir, file)}`);
    const persona = personaModule.default;
    for (const glob of persona.ownedGlobs ?? []) {
      assert.ok(
        doc.includes(glob),
        `${persona.name}: ownedGlobs entry "${glob}" is not documented in docs/ai/agent-orchestration.md`,
      );
    }
  }
});

// ---------------------------------------------------------------- happy paths

test("happy: renderClaudeMarkdown produces exact frontmatter + body + policy", () => {
  const persona = fixturePersona();
  assert.equal(
    renderClaudeMarkdown(persona),
    [
      "---",
      "name: fixture-agent",
      'description: "Fixture persona for generator tests."',
      "tools: Read, Grep",
      "model: sonnet",
      "---",
      "",
      "",
    ].join("\n") +
      persona.systemPrompt +
      GLOBAL_POLICY,
  );
});

test("happy: --check passes immediately after a fresh generation", () => {
  const tmp = setupScratchRepo();
  try {
    runGenerator(tmp);
    assert.doesNotThrow(() => runGenerator(tmp, ["--check"]));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
