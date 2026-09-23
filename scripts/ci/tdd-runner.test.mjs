import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { TestRunError, TestRunTimeout, runTestGroups } from "./tdd-runner.mjs";

const groups = (scriptTests) => ({ jest: [], vitest: [], scriptTests });

function scratch(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "tdd-runner-")));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), content);
  }
  return root;
}

// ---------------------------------------------------------------- error cases

test("error: a runner process killed by a signal before the timeout is a crash, not a timeout", (t) => {
  // A stand-in jest binary that dies from SIGKILL at once, like an OOM kill or native crash.
  const root = scratch({
    "node_modules/jest/bin/jest.js": 'process.kill(process.pid, "SIGKILL");\n',
    "apps/backend/src/a.spec.ts": "",
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(
    () => runTestGroups(root, { jest: ["apps/backend/src/a.spec.ts"], vitest: [], scriptTests: [] }, 60_000),
    (err) => {
      assert.ok(err instanceof TestRunError, `expected TestRunError, got ${err?.constructor?.name}: ${err?.message}`);
      assert.ok(!(err instanceof TestRunTimeout));
      assert.match(err.message, /SIGKILL/);
      return true;
    },
  );
});

// ----------------------------------------------------------------- edge cases

test("edge: a test that outlives the timeout is still reported as a timeout", (t) => {
  const root = scratch({
    "scripts/hang.test.mjs": 'import test from "node:test";\ntest("error: hangs", () => new Promise(() => { setInterval(() => {}, 1000); }));\n',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => runTestGroups(root, groups(["scripts/hang.test.mjs"]), 1500), TestRunTimeout);
});

// ---------------------------------------------------------------- happy paths

test("happy: a failing error case is collected as a test-level failure", (t) => {
  const root = scratch({
    "scripts/red.test.mjs": 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("error: fails", () => { assert.equal(1, 2); });\n',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = runTestGroups(root, groups(["scripts/red.test.mjs"]), 60_000);
  assert.deepEqual(run.testLevel, ["error: fails"]);
  assert.equal(run.anyFailure, true);
});
