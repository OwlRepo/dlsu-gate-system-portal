// Disposable monorepo fixtures for the tdd-* integration tests. Not a test file itself.
// Mirrors this repo's layout: apps/backend (Jest + ts-jest) and apps/portal-web (Vitest),
// reusing the real root node_modules through a symlink.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

export function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function write(root, rel, content) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const SKELETON = {
  ".gitignore": "node_modules\n",
  "apps/backend/package.json": `${JSON.stringify(
    {
      name: "fixture-backend",
      private: true,
      jest: {
        moduleFileExtensions: ["js", "json", "ts"],
        rootDir: "src",
        testRegex: ".*\\.spec\\.ts$",
        transform: { "^.+\\.(t|j)s$": "ts-jest" },
        testEnvironment: "node",
      },
    },
    null,
    2,
  )}\n`,
  "apps/backend/tsconfig.json": `${JSON.stringify({
    compilerOptions: { module: "commonjs", target: "ES2021", strict: true, esModuleInterop: true, skipLibCheck: true },
  })}\n`,
  "apps/portal-web/package.json": `${JSON.stringify({ name: "fixture-portal-web", private: true, type: "module" })}\n`,
};

// Base commit on `main`, then a `feature` branch checked out. `origin/main` is faked
// as a local ref so the scripts' default base resolves without a network remote.
export function makeRepo(baseFiles = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "tdd-repo-")));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@t.test");
  git(root, "config", "user.name", "t");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "config", "core.hooksPath", "/dev/null");
  for (const [rel, content] of Object.entries({ ...SKELETON, ...baseFiles })) write(root, rel, content);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(root, "checkout", "-q", "-b", "feature");
  symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(root, "node_modules"));
  return {
    root,
    commit(files, message = "change") {
      for (const [rel, content] of Object.entries(files)) {
        if (content === null) git(root, "rm", "-q", rel);
        else write(root, rel, content);
      }
      git(root, "add", "-A");
      git(root, "commit", "-q", "-m", message);
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export const BE_SRC = "apps/backend/src/lib/vat.ts";
export const BE_SPEC = "apps/backend/src/lib/vat.spec.ts";
export const FE_SRC = "apps/portal-web/src/lib/vat.ts";
export const FE_TEST = "apps/portal-web/src/lib/vat.test.ts";

export const VAT_BUGGY = "export const vat = (n: number): number => n * 0.1;\n";
export const VAT_FIXED = [
  "export const vat = (n: number): number => {",
  '  if (n < 0) throw new Error("negative amount");',
  "  return Math.round(n * 12) / 100;",
  "};",
  "",
].join("\n");

const CASES = [
  "  it('error: rejects negative amounts', () => { expect(() => vat(-1)).toThrow(); });",
  "  it('edge: zero gives zero', () => { expect(vat(0)).toBe(0); });",
  "  it('happy: 12% of 100', () => { expect(vat(100)).toBe(12); });",
];

export const VAT_SPEC = ["import { vat } from './vat';", "describe('vat', () => {", ...CASES, "});", ""].join("\n");

export const VAT_VITEST = [
  "import { describe, expect, it } from 'vitest';",
  "import { vat } from './vat';",
  "describe('vat', () => {",
  ...CASES,
  "});",
  "",
].join("\n");
