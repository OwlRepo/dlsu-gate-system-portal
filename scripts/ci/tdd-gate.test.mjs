import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { BE_SPEC, BE_SRC, FE_TEST, VAT_BUGGY, VAT_FIXED, VAT_SPEC, VAT_VITEST, git, makeRepo } from "./test-repo.mjs";

const GATE = new URL("./tdd-gate.mjs", import.meta.url).pathname;

function gate(root, env = {}, args = []) {
  const summary = path.join(mkdtempSync(path.join(tmpdir(), "tdd-summary-")), "summary.md");
  const fullEnv = {
    ...process.env,
    TDD_GATE_BASE: "origin/main",
    PR_BODY: "",
    GITHUB_STEP_SUMMARY: summary,
    ...env,
  };
  for (const [k, v] of Object.entries(fullEnv)) if (v === undefined) delete fullEnv[k];
  const res = spawnSync(process.execPath, [GATE, ...args], { cwd: root, encoding: "utf8", env: fullEnv });
  let summaryText = "";
  try {
    summaryText = readFileSync(summary, "utf8");
  } catch {
    summaryText = "";
  }
  return { ...res, summary: summaryText };
}

// ---------------------------------------------------------------- error cases

test("error: a base that does not exist is a git failure (2), never a pass", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  assert.equal(gate(repo.root, { TDD_GATE_BASE: "origin/does-not-exist" }).status, 2);
});

test("error: changed logic with no test at all blocks", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_BUGGY });
  t.after(() => repo.cleanup());
  repo.commit({ [BE_SRC]: VAT_FIXED });
  const res = gate(repo.root);
  assert.equal(res.status, 1);
  assert.match(res.stdout + res.stderr, /apps\/backend\/src\/lib\/vat\.ts/);
});

test("error: --pr-body-file pointing at a missing file exits 2", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  assert.equal(gate(repo.root, {}, ["--pr-body-file", path.join(repo.root, "nope.md")]).status, 2);
});

test("error: a test that hangs on the base times out, exits 2 and cleans up the worktree", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_BUGGY });
  t.after(() => repo.cleanup());
  repo.commit({
    [BE_SRC]: VAT_FIXED,
    "scripts/ci/hang.test.mjs":
      'import test from "node:test";\ntest("error: hangs", () => new Promise(() => { setInterval(() => {}, 1000); }));\n',
  });
  const res = gate(repo.root, { TDD_GATE_TIMEOUT_MS: "3000" });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /timeout/i);
  assert.equal(git(repo.root, "worktree", "list").split("\n").length, 1);
});

// ----------------------------------------------------------------- edge cases

test("edge: TDD_GATE_BASE defaults to origin/main when unset", (t) => {
  const repo = makeRepo({ "docs/a.md": "a\n" });
  t.after(() => repo.cleanup());
  repo.commit({ "docs/a.md": "b\n" });
  assert.equal(gate(repo.root, { TDD_GATE_BASE: undefined }).status, 0);
});

test("edge: a docs-only change passes", (t) => {
  const repo = makeRepo({ "docs/a.md": "a\n" });
  t.after(() => repo.cleanup());
  repo.commit({ "docs/a.md": "b\n" });
  assert.equal(gate(repo.root).status, 0);
});

test("edge: a tests-only change needs no RED but still needs prefixes", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_FIXED });
  t.after(() => repo.cleanup());
  repo.commit({ [BE_SPEC]: VAT_SPEC });
  assert.equal(gate(repo.root).status, 0);

  repo.commit({ "apps/backend/src/lib/other.spec.ts": "it('no prefix', () => { expect(1).toBe(1); });\n" });
  assert.equal(gate(repo.root).status, 1);
});

test("edge: a missing PR body means no waiver", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_BUGGY });
  t.after(() => repo.cleanup());
  repo.commit({ [BE_SRC]: VAT_FIXED });
  assert.equal(gate(repo.root, { PR_BODY: undefined }).status, 1);
});

test("edge: a TDD-Waiver with a reason passes and is written to the summary", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_BUGGY });
  t.after(() => repo.cleanup());
  repo.commit({ [BE_SRC]: VAT_FIXED });
  const res = gate(repo.root, { PR_BODY: "TDD-Waiver: hotfix agreed with Romeo" });
  assert.equal(res.status, 0);
  assert.match(res.summary, /hotfix agreed with Romeo/);
});

test("edge: the PR body can come from --pr-body-file", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_BUGGY });
  t.after(() => repo.cleanup());
  repo.commit({ [BE_SRC]: VAT_FIXED });
  const body = path.join(mkdtempSync(path.join(tmpdir(), "pr-body-")), "body.md");
  writeFileSync(body, "TDD-Waiver: hotfix agreed with Romeo\n");
  assert.equal(gate(repo.root, { PR_BODY: undefined }, ["--pr-body-file", body]).status, 0);
});

test("edge: UI change without a component test blocks; a UI-Test-Waiver passes", (t) => {
  const repo = makeRepo({ "apps/portal-web/src/components/badge.tsx": "export const Badge = () => null;\n" });
  t.after(() => repo.cleanup());
  repo.commit({ "apps/portal-web/src/components/badge.tsx": "export const Badge = () => 1;\n" });
  assert.equal(gate(repo.root).status, 1);
  assert.equal(gate(repo.root, { PR_BODY: "UI-Test-Waiver: changes a literal only" }).status, 0);
});

test("edge: a migration without a migration test blocks; a Migration-Waiver passes", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  repo.commit({ "apps/backend/src/migrations/1790000000000-AddX.ts": "export class AddX1790000000000 {}\n" });
  assert.equal(gate(repo.root).status, 1);
  assert.equal(gate(repo.root, { PR_BODY: "Migration-Waiver: verified by hand on a DB copy" }).status, 0);
});

test("edge: a new module that does not exist on the base counts as RED", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  repo.commit({ [BE_SRC]: VAT_FIXED, [BE_SPEC]: VAT_SPEC });
  assert.equal(gate(repo.root).status, 0);
});

// ----------------------------------------------------------- regression cases

test("regression: tests that already pass on the old code prove nothing and block", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_FIXED });
  t.after(() => repo.cleanup());
  repo.commit({ [BE_SRC]: VAT_FIXED + "// note\n", [BE_SPEC]: VAT_SPEC });
  const res = gate(repo.root);
  assert.equal(res.status, 1);
  assert.match(res.stdout + res.stderr, /RED/);
});

test("regression: a refactor TDD-Waiver inverts the proof: the tests must pass on the base", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_FIXED });
  t.after(() => repo.cleanup());
  repo.commit({ [BE_SRC]: VAT_FIXED + "// refactor\n", [BE_SPEC]: VAT_SPEC });
  assert.equal(gate(repo.root, { PR_BODY: "TDD-Waiver: refactor with no behaviour change" }).status, 0);

  const buggy = makeRepo({ [BE_SRC]: VAT_BUGGY });
  t.after(() => buggy.cleanup());
  buggy.commit({ [BE_SRC]: VAT_FIXED, [BE_SPEC]: VAT_SPEC });
  assert.equal(gate(buggy.root, { PR_BODY: "TDD-Waiver: refactor with no behaviour change" }).status, 1);
});

// ---------------------------------------------------------------- happy paths

test("happy: a backend fix whose Jest spec fails on the base and passes now is approved", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_BUGGY });
  t.after(() => repo.cleanup());
  repo.commit({ [BE_SPEC]: VAT_SPEC }, "test(vat): RED");
  repo.commit({ [BE_SRC]: VAT_FIXED }, "fix(vat): 12%");
  const res = gate(repo.root);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.equal(git(repo.root, "worktree", "list").split("\n").length, 1);
});

test("happy: a portal fix whose Vitest test fails on the base and passes now is approved", (t) => {
  const repo = makeRepo({ "apps/portal-web/src/lib/vat.ts": VAT_BUGGY });
  t.after(() => repo.cleanup());
  repo.commit({ [FE_TEST]: VAT_VITEST, "apps/portal-web/src/lib/vat.ts": VAT_FIXED });
  const res = gate(repo.root);
  assert.equal(res.status, 0, res.stdout + res.stderr);
});
