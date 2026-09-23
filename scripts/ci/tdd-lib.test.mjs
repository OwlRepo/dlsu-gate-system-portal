import assert from "node:assert/strict";
import test from "node:test";

import {
  checkTitles,
  classifyChanges,
  extractTestTitles,
  findBashWriteTargets,
  isGuardedSource,
  judgeRed,
  parseJsonReport,
  parseTapFailures,
  parseWaivers,
} from "./tdd-lib.mjs";

const ROOT = "/repo";
const report = (testResults) => ({ testResults });

// ---------------------------------------------------------------- error cases

test("error: a title without a prefix is a violation", () => {
  const violations = checkTitles({
    added: [{ file: "apps/backend/src/a.spec.ts", title: "computes VAT", prefix: null, dynamic: false }],
    newFiles: [],
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /apps\/backend\/src\/a\.spec\.ts/);
  assert.match(violations[0], /computes VAT/);
});

test("error: a happy case with no error or edge case in the change is a violation", () => {
  const violations = checkTitles({
    added: [{ file: "apps/backend/src/a.spec.ts", title: "happy: ok", prefix: "happy", dynamic: false }],
    newFiles: [],
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /error:|edge:/);
});

test("error: in a new file, an edge declared after a happy is a violation", () => {
  const violations = checkTitles({
    added: [],
    newFiles: [
      {
        path: "apps/portal-web/src/b.test.ts",
        titles: [
          { title: "error: x", prefix: "error", dynamic: false },
          { title: "happy: y", prefix: "happy", dynamic: false },
          { title: "edge: z", prefix: "edge", dynamic: false },
        ],
      },
    ],
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /edge: z/);
});

test("error: a title that starts with an interpolation cannot be classified", () => {
  const titles = extractTestTitles("it(`${name} fails`, () => {});");
  assert.equal(titles.length, 1);
  assert.equal(titles[0].dynamic, true);
  const violations = checkTitles({ added: titles.map((t) => ({ ...t, file: "x.spec.ts" })), newFiles: [] });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /interpolation/i);
});

test("error: only happy cases failing is not a valid RED", () => {
  const verdict = judgeRed({ testLevel: ["happy: saves"], fileLevel: [] });
  assert.equal(verdict.red, false);
  assert.match(verdict.reason, /error:|edge:|regression:/);
});

test("error: no failure at all is not RED", () => {
  assert.equal(judgeRed({ testLevel: [], fileLevel: [] }).red, false);
});

test("error: parsers survive empty or missing input", () => {
  assert.deepEqual(parseTapFailures("", []), { testLevel: [], fileLevel: [] });
  assert.deepEqual(parseTapFailures(undefined, []), { testLevel: [], fileLevel: [] });
  assert.deepEqual(parseJsonReport(null, [], ROOT), { testLevel: [], fileLevel: [] });
  assert.deepEqual(parseJsonReport({}, [], ROOT), { testLevel: [], fileLevel: [] });
});

// ----------------------------------------------------------------- edge cases

test("edge: parseWaivers with a null or empty body grants no waiver", () => {
  for (const body of [null, undefined, "", "   "]) {
    assert.deepEqual(parseWaivers(body), { tdd: null, ui: null, migration: null });
  }
});

test("edge: parseWaivers accepts any case and position but requires a reason", () => {
  const body = "Summary\n\n  tdd-waiver: refactor with no behaviour change\nUI-TEST-WAIVER:   copy only\nMigration-Waiver:\n";
  const w = parseWaivers(body);
  assert.equal(w.tdd, "refactor with no behaviour change");
  assert.equal(w.ui, "copy only");
  assert.equal(w.migration, null);
});

test("edge: classifyChanges ignores deletions and pure renames", () => {
  const groups = classifyChanges([
    { status: "D", path: "apps/backend/src/old.ts" },
    { status: "R100", path: "apps/backend/src/moved.ts" },
    { status: "R087", path: "apps/backend/src/edited-move.ts" },
  ]);
  assert.deepEqual(groups.logic, ["apps/backend/src/edited-move.ts"]);
});

test("edge: declaration files, migrations and the Vitest setup are not logic", () => {
  const groups = classifyChanges([
    { status: "A", path: "apps/backend/src/types/global.d.ts" },
    { status: "A", path: "apps/backend/src/migrations/1790000000000-AddX.ts" },
    { status: "M", path: "apps/portal-web/src/test/setup.ts" },
  ]);
  assert.deepEqual(groups.logic, []);
  assert.deepEqual(groups.migrations, ["apps/backend/src/migrations/1790000000000-AddX.ts"]);
});

test("edge: a portal .tsx is UI, a portal .ts (hooks, mocks) is logic", () => {
  const groups = classifyChanges([
    { status: "M", path: "apps/portal-web/src/components/use-thing.tsx" },
    { status: "M", path: "apps/portal-web/src/hooks/use-other.ts" },
    { status: "M", path: "apps/portal-web/src/mocks/handlers/auth.ts" },
  ]);
  assert.deepEqual(groups.ui, ["apps/portal-web/src/components/use-thing.tsx"]);
  assert.deepEqual(groups.logic, ["apps/portal-web/src/hooks/use-other.ts", "apps/portal-web/src/mocks/handlers/auth.ts"]);
});

test("edge: every test kind lands in its group", () => {
  const groups = classifyChanges([
    { status: "A", path: "apps/backend/src/a.spec.ts" },
    { status: "A", path: "apps/portal-web/src/b.test.ts" },
    { status: "A", path: "apps/portal-web/src/c.test.tsx" },
    { status: "A", path: "scripts/ci/x.test.mjs" },
    { status: "A", path: "apps/backend/test/sync.e2e-spec.ts" },
    { status: "A", path: "apps/backend/src/migrations/1790000000000-AddX.spec.ts" },
    { status: "A", path: "apps/backend/test/add-x-migration.e2e-spec.ts" },
    { status: "M", path: "docs/ai/planning.md" },
  ]);
  assert.deepEqual(groups.jest, ["apps/backend/src/a.spec.ts", "apps/backend/src/migrations/1790000000000-AddX.spec.ts"]);
  assert.deepEqual(groups.vitest, ["apps/portal-web/src/b.test.ts", "apps/portal-web/src/c.test.tsx"]);
  assert.deepEqual(groups.uiTests, ["apps/portal-web/src/c.test.tsx"]);
  assert.deepEqual(groups.scriptTests, ["scripts/ci/x.test.mjs"]);
  assert.deepEqual(groups.backendE2e, ["apps/backend/test/sync.e2e-spec.ts", "apps/backend/test/add-x-migration.e2e-spec.ts"]);
  assert.deepEqual(groups.migrationTests, [
    "apps/backend/src/migrations/1790000000000-AddX.spec.ts",
    "apps/backend/test/add-x-migration.e2e-spec.ts",
  ]);
  assert.deepEqual(groups.migrations, []);
  assert.deepEqual(groups.logic, []);
  assert.deepEqual(groups.ui, []);
});

test("edge: extractTestTitles reads multi-line titles, it, only/skip and single quotes", () => {
  const src = [
    "test(",
    '  "error: multi-line",',
    "  () => {},",
    ");",
    "it('edge: with it', () => {});",
    'it.skip("happy: skipped", () => {});',
    'describe("group without prefix", () => {});',
  ].join("\n");
  assert.deepEqual(
    extractTestTitles(src).map((t) => [t.title, t.prefix]),
    [
      ["error: multi-line", "error"],
      ["edge: with it", "edge"],
      ["happy: skipped", "happy"],
    ],
  );
});

test("edge: a template literal with a literal prefix is classified", () => {
  const [t] = extractTestTitles("it(`edge: ${n} rows`, () => {});");
  assert.equal(t.prefix, "edge");
  assert.equal(t.dynamic, false);
});

test("edge: parseJsonReport splits suite-load failures from failing cases", () => {
  const parsed = parseJsonReport(
    report([
      {
        name: "/repo/apps/backend/src/lib/vat.spec.ts",
        status: "failed",
        assertionResults: [
          { title: "error: rejects negative amounts", status: "failed" },
          { title: "edge: zero gives zero", status: "passed" },
        ],
      },
      { name: "/repo/apps/backend/src/lib/new.spec.ts", status: "failed", message: "Test suite failed to run", assertionResults: [] },
    ]),
    ["apps/backend/src/lib/vat.spec.ts", "apps/backend/src/lib/new.spec.ts"],
    ROOT,
  );
  assert.deepEqual(parsed, {
    testLevel: ["error: rejects negative amounts"],
    fileLevel: ["apps/backend/src/lib/new.spec.ts"],
  });
});

test("edge: a requested file missing from the JSON report counts as a load failure", () => {
  const parsed = parseJsonReport(report([]), ["apps/portal-web/src/lib/vat.test.ts"], ROOT);
  assert.deepEqual(parsed.fileLevel, ["apps/portal-web/src/lib/vat.test.ts"]);
});

test("edge: parseTapFailures splits file-load failures and skips suites", () => {
  const tap = [
    "TAP version 13",
    "# Subtest: group",
    "    # Subtest: edge: inside",
    "    not ok 1 - edge: inside",
    "      ---",
    "      type: 'test'",
    "      ...",
    "not ok 1 - group",
    "  ---",
    "  type: 'suite'",
    "  ...",
    "# Subtest: scripts/ci/b.test.mjs",
    "not ok 2 - scripts/ci/b.test.mjs",
    "  ---",
    "  type: 'test'",
    "  ...",
  ].join("\n");
  assert.deepEqual(parseTapFailures(tap, ["scripts/ci/a.test.mjs", "scripts/ci/b.test.mjs"]), {
    testLevel: ["edge: inside"],
    fileLevel: ["scripts/ci/b.test.mjs"],
  });
});

test("edge: a load failure with no case failures counts as RED (module not written yet)", () => {
  assert.equal(judgeRed({ testLevel: [], fileLevel: ["apps/backend/src/lib/new.spec.ts"] }).red, true);
});

test("edge: isGuardedSource protects only application logic under apps/*/src", () => {
  for (const p of [
    "apps/backend/src/auth/login.service.ts",
    "apps/portal-web/src/lib/api.ts",
    "apps/portal-web/src/components/button.tsx",
    "apps/portal-web/src/mocks/handlers/auth.ts",
  ]) {
    assert.equal(isGuardedSource(p), true, p);
  }
  for (const p of [
    "apps/backend/src/auth/login.service.spec.ts",
    "apps/backend/src/types/x.d.ts",
    "apps/backend/src/migrations/1790000000000-AddX.ts",
    "apps/backend/test/sync.e2e-spec.ts",
    "apps/backend/scripts/scenario/campaign.ts",
    "apps/portal-web/src/lib/api.test.ts",
    "apps/portal-web/src/components/button.test.tsx",
    "apps/portal-web/src/test/setup.ts",
    "apps/portal-web/next.config.ts",
    "src/lib/a.ts",
    "scripts/ci/x.mjs",
    "docs/a.md",
  ]) {
    assert.equal(isGuardedSource(p), false, p);
  }
});

test("edge: findBashWriteTargets ignores reads that only mention a source file", () => {
  assert.deepEqual(findBashWriteTargets("grep -n foo apps/backend/src/a.ts > /tmp/out.txt"), ["/tmp/out.txt"]);
  assert.deepEqual(findBashWriteTargets("cat apps/backend/src/a.ts | head"), []);
  assert.deepEqual(findBashWriteTargets("sed -n 1,20p apps/backend/src/a.ts"), []);
});

test("edge: findBashWriteTargets catches sed -i, perl -i, tee, redirects and cp/mv", () => {
  assert.deepEqual(findBashWriteTargets("sed -i '' 's/a/b/' apps/backend/src/a.ts"), ["apps/backend/src/a.ts"]);
  assert.deepEqual(findBashWriteTargets("perl -pi -e 's/a/b/' src/a.ts src/b.ts"), ["src/a.ts", "src/b.ts"]);
  assert.deepEqual(findBashWriteTargets("echo x | tee -a src/a.ts"), ["src/a.ts"]);
  assert.deepEqual(findBashWriteTargets("cat > 'src/a.ts' <<'EOF'"), ["src/a.ts"]);
  assert.deepEqual(findBashWriteTargets("cp /tmp/x.ts src/a.ts && mv a b"), ["src/a.ts", "b"]);
});

test("edge: findBashWriteTargets treats inline interpreter scripts that name a source file as writes", () => {
  assert.deepEqual(
    findBashWriteTargets(`node -e "require('fs').writeFileSync('apps/backend/src/x.service.ts', code)"`),
    ["apps/backend/src/x.service.ts"],
  );
  assert.deepEqual(findBashWriteTargets(`python3 -c "open('apps/portal-web/src/lib/a.ts','w').write(s)"`), ["apps/portal-web/src/lib/a.ts"]);
  assert.deepEqual(
    findBashWriteTargets("python3 - <<'EOF'\np='apps/backend/src/app.service.ts'\nopen(p,'w').write('x')\nEOF"),
    ["apps/backend/src/app.service.ts"],
  );
  assert.deepEqual(findBashWriteTargets(`bun -e "await Bun.write('apps/portal-web/src/b.tsx', t)"`), ["apps/portal-web/src/b.tsx"]);
});

// ----------------------------------------------------------- regression cases

test("regression: an it( inside a string or comment (a fixture) is not a case", () => {
  const src = [
    'const fixture = "it(\\"happy: fake\\", () => {})";',
    "const tpl = `it('happy: also fake', () => {})`;",
    '// it("happy: commented")',
    "/* it('happy: block') */",
    'it("error: the only real one", () => {});',
  ].join("\n");
  assert.deepEqual(
    extractTestTitles(src).map((t) => t.title),
    ["error: the only real one"],
  );
});

test("regression: a > inside quotes or a comment is not a redirect", () => {
  assert.deepEqual(findBashWriteTargets('git commit -m "note: > src/foo.ts needs work"'), []);
  assert.deepEqual(findBashWriteTargets("git commit -m 'a; b | c > src/foo.ts'"), []);
  assert.deepEqual(findBashWriteTargets("echo hi # > src/foo.ts"), []);
  assert.deepEqual(findBashWriteTargets('echo "x" > "src/a.ts" # comment'), ["src/a.ts"]);
});

test("regression: 2>&1 is not a file write", () => {
  assert.deepEqual(findBashWriteTargets("npx jest 2>&1 | tail"), []);
});

test("regression: a skipped or todo case in the JSON report is not a failure", () => {
  const parsed = parseJsonReport(
    report([
      {
        name: "/repo/apps/portal-web/src/a.test.ts",
        status: "passed",
        assertionResults: [
          { title: "error: later", status: "pending" },
          { title: "edge: later", status: "todo" },
          { title: "happy: now", status: "skipped" },
        ],
      },
    ]),
    ["apps/portal-web/src/a.test.ts"],
    ROOT,
  );
  assert.deepEqual(parsed, { testLevel: [], fileLevel: [] });
});

test("regression: running a script file or an inline script that names no source file is not a write", () => {
  assert.deepEqual(findBashWriteTargets("node scripts/ci/tdd-gate.mjs"), []);
  assert.deepEqual(findBashWriteTargets(`node -e "console.log(process.version)"`), []);
  assert.deepEqual(findBashWriteTargets("python3 scripts/tool.py apps/backend/src/a.ts"), []);
});

// ---------------------------------------------------------------- happy paths

test("happy: a change with error, edge and happy in order has no violations", () => {
  const src = 'it("error: a", () => {});\nit("edge: b", () => {});\nit("happy: c", () => {});';
  const titles = extractTestTitles(src);
  assert.deepEqual(
    checkTitles({
      added: titles.map((t) => ({ ...t, file: "apps/backend/src/n.spec.ts" })),
      newFiles: [{ path: "apps/backend/src/n.spec.ts", titles }],
    }),
    [],
  );
});

test("happy: a failing error or regression case is a valid RED", () => {
  assert.equal(judgeRed({ testLevel: ["error: rejects"], fileLevel: [] }).red, true);
  assert.equal(judgeRed({ testLevel: ["regression: bug 12"], fileLevel: [] }).red, true);
});
