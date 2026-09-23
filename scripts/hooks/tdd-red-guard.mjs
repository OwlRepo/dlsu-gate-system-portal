#!/usr/bin/env node
// Claude Code PreToolUse hook: blocks writes to apps/*/src logic until `npm run tdd:red`
// has recorded failing tests for the current branch. Exit 2 = block (stderr is shown to
// the agent), 0 = allow. Rules: docs/ai/testing-strategy.md "Strict TDD".
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { findBashWriteTargets, isGuardedSource, judgeRed } from "../ci/tdd-lib.mjs";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

const HOW_TO =
  "Write the tests first (error: > edge: > regression: > happy:), run `npm run tdd:red` and see them fail. " +
  'If it truly does not apply: npm run tdd:red -- --waiver "<reason>".';

const git = (cwd, ...args) => {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

// The target may not exist yet (Write of a new file); resolve through the nearest
// existing ancestor so symlinked temp dirs (/var vs /private/var) still match git.
function resolveTarget(target, cwd) {
  const abs = path.resolve(cwd, target);
  let dir = path.dirname(abs);
  const rest = [path.basename(abs)];
  while (!existsSync(dir)) {
    rest.unshift(path.basename(dir));
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  const real = realpathSync(dir);
  return { dir: real, abs: path.join(real, ...rest) };
}

function markerProblem(toplevel) {
  const gitDir = git(toplevel, "rev-parse", "--absolute-git-dir");
  const branch = git(toplevel, "rev-parse", "--abbrev-ref", "HEAD");
  const file = path.join(gitDir, "tdd-red.json");
  if (!existsSync(file)) return `RED first: no failing-test marker for branch ${branch}.`;
  let marker;
  try {
    marker = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return `The marker ${file} is corrupt; run npm run tdd:red again.`;
  }
  if (marker.branch !== branch) return `RED first: the marker belongs to branch ${marker.branch}, not ${branch}.`;
  if (typeof marker.waiver === "string" && marker.waiver.trim()) return null;
  const verdict = judgeRed({ testLevel: marker.failedTitles ?? [], fileLevel: marker.loadFailures ?? [] });
  return verdict.red ? null : `RED first: the marker is not a valid RED (${verdict.reason}).`;
}

function main(raw) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stderr.write("tdd-red-guard: hook input is not JSON; allowing.\n");
    return 0;
  }
  const cwd = input.cwd || process.cwd();
  const toolInput = input.tool_input ?? {};
  let targets = [];
  if (EDIT_TOOLS.has(input.tool_name)) {
    const file = toolInput.file_path ?? toolInput.notebook_path;
    if (file) targets = [file];
  } else if (input.tool_name === "Bash") {
    targets = findBashWriteTargets(toolInput.command ?? "");
  }

  for (const target of targets) {
    const resolved = resolveTarget(target, cwd);
    if (!resolved) continue;
    const toplevel = git(resolved.dir, "rev-parse", "--show-toplevel");
    if (!toplevel) continue;
    const rel = path.relative(toplevel, resolved.abs).split(path.sep).join("/");
    if (!isGuardedSource(rel)) continue;
    const problem = markerProblem(toplevel);
    if (problem) {
      process.stderr.write(`${problem} ${rel} is application logic. ${HOW_TO}\n`);
      return 2;
    }
  }
  return 0;
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  process.exitCode = main(raw);
});
