import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { BE_SRC, git, makeRepo } from "../ci/test-repo.mjs";

const GUARD = new URL("./tdd-red-guard.mjs", import.meta.url).pathname;

const guard = (input, cwd = process.cwd()) =>
  spawnSync(process.execPath, [GUARD], {
    cwd,
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
  });

const edit = (root, rel) => ({ tool_name: "Edit", cwd: root, tool_input: { file_path: path.join(root, rel) } });
const bash = (root, command) => ({ tool_name: "Bash", cwd: root, tool_input: { command } });

function writeMarker(root, marker) {
  const gitDir = git(root, "rev-parse", "--absolute-git-dir");
  writeFileSync(path.join(gitDir, "tdd-red.json"), typeof marker === "string" ? marker : JSON.stringify(marker));
}

const VALID = (branch = "feature") => ({
  branch,
  testFiles: ["apps/backend/src/lib/vat.spec.ts"],
  failedTitles: ["error: rejects negative amounts"],
  at: "2026-09-23T08:00:00.000Z",
});

// ---------------------------------------------------------------- error cases

test("error: stdin that is not JSON does not block (fail-open) but warns", () => {
  const res = guard("this is not json");
  assert.equal(res.status, 0);
  assert.match(res.stderr, /tdd-red-guard/);
});

test("error: an edit with no file_path does not block", () => {
  assert.equal(guard({ tool_name: "Edit", tool_input: {} }).status, 0);
});

test("error: a corrupt marker blocks with a clear message", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  writeMarker(repo.root, "{broken");
  const res = guard(edit(repo.root, BE_SRC));
  assert.equal(res.status, 2);
  assert.match(res.stderr, /tdd:red/);
});

test("error: editing backend logic without a marker blocks", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  const res = guard(edit(repo.root, BE_SRC));
  assert.equal(res.status, 2);
  assert.match(res.stderr, /RED/);
});

test("error: editing a portal component without a marker blocks", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  assert.equal(guard(edit(repo.root, "apps/portal-web/src/components/badge.tsx")).status, 2);
});

// ----------------------------------------------------------------- edge cases

test("edge: a marker from another branch does not count", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  writeMarker(repo.root, VALID("other-branch"));
  assert.equal(guard(edit(repo.root, BE_SRC)).status, 2);
});

test("edge: tests, docs, scripts, migrations and test setup are never blocked", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  for (const rel of [
    "apps/backend/src/lib/vat.spec.ts",
    "apps/backend/test/sync.e2e-spec.ts",
    "apps/backend/src/migrations/1790000000000-AddX.ts",
    "apps/portal-web/src/lib/vat.test.ts",
    "apps/portal-web/src/components/badge.test.tsx",
    "apps/portal-web/src/test/setup.ts",
    "docs/a.md",
    "scripts/ci/x.mjs",
  ]) {
    assert.equal(guard(edit(repo.root, rel)).status, 0, rel);
  }
});

test("edge: a file outside any git repo is not blocked", () => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "no-git-")));
  const input = { tool_name: "Write", cwd: dir, tool_input: { file_path: path.join(dir, BE_SRC) } };
  assert.equal(guard(input).status, 0);
});

test("edge: read-only Bash that mentions a source file is not blocked", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  assert.equal(guard(bash(repo.root, `grep -n vat ${BE_SRC} > /tmp/x.txt`)).status, 0);
  assert.equal(guard(bash(repo.root, `sed -n 1,5p ${BE_SRC}`)).status, 0);
});

test("edge: Bash sed -i on a spec is allowed; on logic it is blocked", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  assert.equal(guard(bash(repo.root, "sed -i '' 's/a/b/' apps/backend/src/lib/vat.spec.ts")).status, 0);
  assert.equal(guard(bash(repo.root, `sed -i '' 's/a/b/' ${BE_SRC}`)).status, 2);
});

test("edge: relative Bash paths resolve against the tool's cwd", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  const cmd = { tool_name: "Bash", cwd: path.join(repo.root, "apps/backend"), tool_input: { command: "echo x > src/lib/vat.ts" } };
  assert.equal(guard(cmd).status, 2);
});

test("edge: on main without a marker it also blocks", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  git(repo.root, "checkout", "-q", "main");
  assert.equal(guard(edit(repo.root, BE_SRC)).status, 2);
});

test("edge: a waiver marker with a reason allows the edit", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  writeMarker(repo.root, { branch: "feature", waiver: "copy only", at: "2026-09-23T08:00:00.000Z" });
  assert.equal(guard(edit(repo.root, BE_SRC)).status, 0);
});

// ----------------------------------------------------------- regression cases

test("regression: a marker where only happy cases failed does not allow edits", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  writeMarker(repo.root, { ...VALID(), failedTitles: ["happy: saves"] });
  assert.equal(guard(edit(repo.root, BE_SRC)).status, 2);
});

// ---------------------------------------------------------------- happy paths

test("happy: with a valid RED marker the edit goes through", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  writeMarker(repo.root, VALID());
  assert.equal(guard(edit(repo.root, BE_SRC)).status, 0);
  assert.equal(guard(bash(repo.root, `sed -i '' 's/a/b/' ${BE_SRC}`)).status, 0);
});
