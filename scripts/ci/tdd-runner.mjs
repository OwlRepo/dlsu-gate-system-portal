// Runs changed test files per kind and collects failures. Shared by tdd-gate (against
// the base) and tdd-red (now).
//   jest        -> apps/backend, `jest --json --runTestsByPath`
//   vitest      -> apps/portal-web, `vitest run --reporter=json`
//   scriptTests -> repo root, `node --test --test-reporter=tap`
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { RUNNABLE_KINDS, parseJsonReport, parseTapFailures } from "./tdd-lib.mjs";

export class TestRunTimeout extends Error {}
export class TestRunError extends Error {}

// A parent node:test run leaks NODE_TEST_CONTEXT, which switches a child node:test to
// the parent's internal protocol and suppresses the TAP output parsed below.
function childEnv() {
  const env = { ...process.env, CI: "true" };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function binary(root, rel) {
  const file = path.join(root, "node_modules", rel);
  if (!existsSync(file)) throw new TestRunError(`${rel} not found under ${root}/node_modules; install dependencies first`);
  return file;
}

function spawn(kind, args, cwd, timeoutMs) {
  const started = Date.now();
  const res = spawnSync(process.execPath, args, {
    cwd,
    env: childEnv(),
    encoding: "utf8",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    maxBuffer: 64 * 1024 * 1024,
  });
  const elapsed = Date.now() - started;
  if (res.error?.code === "ETIMEDOUT" || (res.signal && elapsed >= timeoutMs)) {
    throw new TestRunTimeout(`timeout: the ${kind} tests did not finish within ${timeoutMs} ms`);
  }
  // Killed early by something else (crash, OOM killer): a runner failure, not a timeout.
  if (res.status === null && res.signal) {
    throw new TestRunError(`the ${kind} test process was killed by ${res.signal} after ${elapsed} ms (a crash, not a timeout)`);
  }
  return res;
}

function runJsonReporter(kind, root, files, timeoutMs) {
  const outDir = mkdtempSync(path.join(tmpdir(), "tdd-report-"));
  const outFile = path.join(outDir, "report.json");
  try {
    let res;
    if (kind === "jest") {
      const cwd = path.join(root, "apps", "backend");
      const jest = binary(root, "jest/bin/jest.js");
      res = spawn(kind, [jest, "--ci", "--json", `--outputFile=${outFile}`, "--runTestsByPath", ...files.map((f) => path.join(root, f))], cwd, timeoutMs);
    } else {
      const cwd = path.join(root, "apps", "portal-web");
      const vitest = binary(root, "vitest/vitest.mjs");
      const prefix = "apps/portal-web/";
      res = spawn(kind, [vitest, "run", "--reporter=json", `--outputFile=${outFile}`, ...files.map((f) => f.slice(prefix.length))], cwd, timeoutMs);
    }
    if (!existsSync(outFile)) {
      const tail = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim().split("\n").slice(-15).join("\n");
      throw new TestRunError(`${kind} wrote no JSON report (exit ${res.status}); the runner itself failed:\n${tail}`);
    }
    const parsed = parseJsonReport(JSON.parse(readFileSync(outFile, "utf8")), files, root);
    return { ...parsed, failed: res.status !== 0 };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function runNodeTest(root, files, timeoutMs) {
  const res = spawn("scriptTests", ["--test", "--test-reporter=tap", ...files], root, timeoutMs);
  return { ...parseTapFailures(res.stdout, files), failed: res.status !== 0 };
}

export function runTestGroups(checkout, groups, timeoutMs) {
  const root = realpathSync(checkout);
  const results = { testLevel: [], fileLevel: [], anyFailure: false };
  for (const kind of RUNNABLE_KINDS) {
    const files = groups[kind];
    if (files.length === 0) continue;
    const run = kind === "scriptTests" ? runNodeTest(root, files, timeoutMs) : runJsonReporter(kind, root, files, timeoutMs);
    if (run.failed) results.anyFailure = true;
    results.testLevel.push(...run.testLevel);
    results.fileLevel.push(...run.fileLevel);
  }
  return results;
}
