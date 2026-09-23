#!/usr/bin/env node
// `npm run tdd:red`: run this branch's changed tests BEFORE implementing and record
// that they failed. The Claude PreToolUse guard reads the marker; see
// docs/ai/testing-strategy.md "Strict TDD".
// Exit 0 = RED recorded, 1 = not RED (nothing written), 2 = usage/git/runner error.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { RUNNABLE_KINDS, classifyChanges, judgeRed } from "./tdd-lib.mjs";
import { TestRunError, TestRunTimeout, runTestGroups } from "./tdd-runner.mjs";

export const MARKER_FILE = "tdd-red.json";

class UsageError extends Error {}

const git = (...args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (err) {
    throw new UsageError(`git ${args.join(" ")} failed: ${String(err.stderr || err.message).trim()}`);
  }
};

function parseArgs(argv) {
  const idx = argv.indexOf("--waiver");
  if (idx === -1) return { waiver: null };
  const reason = (argv[idx + 1] ?? "").trim();
  if (!reason || reason.startsWith("--")) throw new UsageError('--waiver needs a reason: npm run tdd:red -- --waiver "<reason>"');
  return { waiver: reason };
}

// Committed + staged + unstaged changes against the merge-base, plus untracked files:
// RED happens before the tests are necessarily committed.
function changedEntries(mergeBase) {
  const tracked = git("diff", "--name-status", "-M", mergeBase)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      return { status: parts[0], path: parts[parts.length - 1] };
    });
  const untracked = git("ls-files", "--others", "--exclude-standard")
    .split("\n")
    .filter(Boolean)
    .map((p) => ({ status: "A", path: p }));
  return [...tracked, ...untracked];
}

function main() {
  const { waiver } = parseArgs(process.argv.slice(2));
  const root = git("rev-parse", "--show-toplevel");
  const gitDir = git("rev-parse", "--absolute-git-dir");
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const marker = path.join(gitDir, MARKER_FILE);
  const at = new Date().toISOString();

  if (waiver) {
    writeFileSync(marker, `${JSON.stringify({ branch, waiver, at }, null, 2)}\n`);
    console.log(`tdd:red: waiver recorded for ${branch}: ${waiver}. Copy it into the PR as "TDD-Waiver: ${waiver}".`);
    return 0;
  }

  const base = process.env.TDD_RED_BASE || "origin/main";
  const mergeBase = git("merge-base", base, "HEAD");
  const groups = classifyChanges(changedEntries(mergeBase));
  const testFiles = RUNNABLE_KINDS.flatMap((k) => groups[k]);
  if (testFiles.length === 0) {
    console.error("tdd:red: this branch has no new or changed tests. Write the error: and edge: cases first.");
    return 1;
  }

  const run = runTestGroups(root, groups, Number(process.env.TDD_RED_TIMEOUT_MS) || 5 * 60 * 1000);
  const verdict = judgeRed(run);
  if (!verdict.red) {
    console.error(`tdd:red: no RED. ${verdict.reason}`);
    return 1;
  }
  const record = { branch, testFiles, failedTitles: run.testLevel, loadFailures: run.fileLevel, at };
  writeFileSync(marker, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`tdd:red: RED recorded for ${branch} (${verdict.reason}). You can implement now.`);
  return 0;
}

try {
  process.exitCode = main();
} catch (err) {
  const known = err instanceof UsageError || err instanceof TestRunError || err instanceof TestRunTimeout;
  console.error(`tdd:red: ${known ? err.message : err.stack}`);
  process.exitCode = 2;
}
