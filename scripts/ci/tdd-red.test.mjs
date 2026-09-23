import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { BE_SPEC, BE_SRC, FE_SRC, FE_TEST, VAT_BUGGY, VAT_FIXED, VAT_SPEC, VAT_VITEST, git, makeRepo, write } from "./test-repo.mjs";

const RED = new URL("./tdd-red.mjs", import.meta.url).pathname;

const red = (cwd, args = [], env = {}) =>
  spawnSync(process.execPath, [RED, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } });

const markerPath = (cwd) => path.join(git(cwd, "rev-parse", "--absolute-git-dir"), "tdd-red.json");

// ---------------------------------------------------------------- error cases

test("error: no changed tests on the branch exits 1 and writes no marker", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_BUGGY });
  t.after(() => repo.cleanup());
  const res = red(repo.root);
  assert.equal(res.status, 1);
  assert.equal(existsSync(markerPath(repo.root)), false);
});

test("error: a base that does not exist exits 2", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  assert.equal(red(repo.root, [], { TDD_RED_BASE: "origin/does-not-exist" }).status, 2);
});

test("error: if the new tests already pass there is no RED and no marker", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_FIXED });
  t.after(() => repo.cleanup());
  write(repo.root, BE_SPEC, VAT_SPEC);
  const res = red(repo.root);
  assert.equal(res.status, 1);
  assert.match(res.stdout + res.stderr, /RED/);
  assert.equal(existsSync(markerPath(repo.root)), false);
});

// ----------------------------------------------------------------- edge cases

test("edge: an untracked (not yet committed) Jest spec counts", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_BUGGY });
  t.after(() => repo.cleanup());
  write(repo.root, BE_SPEC, VAT_SPEC);
  const res = red(repo.root);
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test("edge: a Vitest test for a module that does not exist yet is a RED", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  write(repo.root, FE_TEST, VAT_VITEST);
  const res = red(repo.root);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const marker = JSON.parse(readFileSync(markerPath(repo.root), "utf8"));
  assert.deepEqual(marker.loadFailures, [FE_TEST]);
});

test("edge: --waiver with a reason writes a waiver marker", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  const res = red(repo.root, ["--waiver", "only renames a constant"]);
  assert.equal(res.status, 0);
  const marker = JSON.parse(readFileSync(markerPath(repo.root), "utf8"));
  assert.equal(marker.branch, "feature");
  assert.equal(marker.waiver, "only renames a constant");
});

test("edge: --waiver without a reason is rejected", (t) => {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  assert.equal(red(repo.root, ["--waiver"]).status, 2);
  assert.equal(red(repo.root, ["--waiver", "  "]).status, 2);
});

test("edge: the marker is per worktree, never shared", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_BUGGY });
  t.after(() => repo.cleanup());
  write(repo.root, BE_SPEC, VAT_SPEC);
  assert.equal(red(repo.root).status, 0);
  const other = `${repo.root}-wt`;
  git(repo.root, "worktree", "add", "-q", "-b", "other", other, "main");
  // repo.cleanup (registered first) deletes the main checkout, so drop the sibling dir directly.
  t.after(() => rmSync(other, { recursive: true, force: true }));
  assert.equal(existsSync(markerPath(other)), false);
});

// ----------------------------------------------------------- regression cases

test("regression: when only happy cases fail there is no valid RED", (t) => {
  const repo = makeRepo({ [FE_SRC]: VAT_BUGGY });
  t.after(() => repo.cleanup());
  write(
    repo.root,
    FE_TEST,
    [
      "import { expect, it } from 'vitest';",
      "import { vat } from './vat';",
      "it('edge: zero', () => { expect(vat(0)).toBe(0); });",
      "it('happy: 12', () => { expect(vat(100)).toBe(12); });",
      "",
    ].join("\n"),
  );
  assert.equal(red(repo.root).status, 1);
});

// ---------------------------------------------------------------- happy paths

test("happy: failing error/edge cases write the marker with branch and titles", (t) => {
  const repo = makeRepo({ [BE_SRC]: VAT_BUGGY });
  t.after(() => repo.cleanup());
  repo.commit({ [BE_SPEC]: VAT_SPEC }, "test(vat): RED");
  const res = red(repo.root);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const marker = JSON.parse(readFileSync(markerPath(repo.root), "utf8"));
  assert.equal(marker.branch, "feature");
  assert.deepEqual(marker.testFiles, [BE_SPEC]);
  assert.ok(marker.failedTitles.includes("error: rejects negative amounts"));
  assert.match(marker.at, /^\d{4}-\d{2}-\d{2}T/);
});
