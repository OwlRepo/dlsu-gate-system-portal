// Shared rules for the TDD gate (`npm run tdd:gate`), `npm run tdd:red` (local) and the
// Claude PreToolUse guard. Pure functions only; the CLIs own git and process I/O.
// Rules: docs/ai/testing-strategy.md "Strict TDD".

import path from "node:path";

export const PREFIXES = ["error", "edge", "regression", "happy"];
const RED_PREFIXES = new Set(["error", "edge", "regression"]);

const BACKEND_SRC = /^apps\/backend\/src\/.+\.ts$/;
const BACKEND_SPEC = /^apps\/backend\/src\/.+\.spec\.ts$/;
const BACKEND_MIGRATION = /^apps\/backend\/src\/migrations\//;
const BACKEND_E2E = /^apps\/backend\/test\/.+\.e2e-spec\.ts$/;
const PORTAL_SRC = /^apps\/portal-web\/src\/.+\.tsx?$/;
const PORTAL_TEST = /^apps\/portal-web\/src\/.+\.test\.tsx?$/;
const PORTAL_TEST_SETUP = /^apps\/portal-web\/src\/test\//;
const SCRIPT_TEST = /^scripts\/.+\.test\.mjs$/;

// Application logic the edit guard protects and the gate demands tests for:
// apps/backend/src and apps/portal-web/src, minus tests, declarations, TypeORM
// migrations (their own kind) and the Vitest setup. portal-web mocks are included
// because mock mode runs them in the browser.
export function isGuardedSource(rel) {
  if (rel.endsWith(".d.ts")) return false;
  if (BACKEND_SRC.test(rel)) return !BACKEND_SPEC.test(rel) && !BACKEND_MIGRATION.test(rel);
  if (PORTAL_SRC.test(rel)) return !PORTAL_TEST.test(rel) && !PORTAL_TEST_SETUP.test(rel);
  return false;
}

// One path can land in several groups (a migration spec is both a Jest spec and a
// migration test).
function kindsOf(rel) {
  const kinds = [];
  if (BACKEND_SPEC.test(rel)) {
    kinds.push("jest");
    if (BACKEND_MIGRATION.test(rel)) kinds.push("migrationTests");
  } else if (BACKEND_MIGRATION.test(rel) && rel.endsWith(".ts")) {
    kinds.push("migrations");
  }
  if (BACKEND_E2E.test(rel)) {
    kinds.push("backendE2e");
    if (/migration/i.test(rel)) kinds.push("migrationTests");
  }
  if (PORTAL_TEST.test(rel)) {
    kinds.push("vitest");
    if (rel.endsWith(".tsx")) kinds.push("uiTests");
  }
  if (SCRIPT_TEST.test(rel)) kinds.push("scriptTests");
  if (isGuardedSource(rel)) kinds.push(rel.endsWith(".tsx") ? "ui" : "logic");
  return kinds;
}

export const GROUPS = ["logic", "ui", "jest", "vitest", "uiTests", "scriptTests", "backendE2e", "migrations", "migrationTests"];

// entries: [{ status: "A"|"M"|"D"|"R087"..., path }] as from `git diff --name-status`.
// Deleted files and pure renames (R100) carry no new behaviour to test.
export function classifyChanges(entries) {
  const groups = Object.fromEntries(GROUPS.map((g) => [g, []]));
  for (const { status, path: rel } of entries) {
    if (status.startsWith("D") || status === "R100") continue;
    for (const kind of kindsOf(rel)) groups[kind].push(rel);
  }
  return groups;
}

export function parseWaivers(body) {
  const out = { tdd: null, ui: null, migration: null };
  if (!body) return out;
  const re = /^[ \t]*(tdd|ui-test|migration)-waiver:[ \t]*(.*)$/gim;
  for (const m of body.matchAll(re)) {
    const reason = m[2].trim();
    const key = m[1].toLowerCase() === "ui-test" ? "ui" : m[1].toLowerCase();
    if (reason) out[key] = reason;
  }
  return out;
}

// Blanks string, template and comment contents (newlines kept) so a `test(` inside
// a fixture string is not read as a real case. Quote strings end at a newline, which
// bounds the damage of a regex literal containing a quote to its own line.
function codeMask(source) {
  const out = source.split("");
  let state = "code";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (state === "code") {
      if (c === "/" && next === "/") state = "line";
      else if (c === "/" && next === "*") state = "block";
      else if (c === '"' || c === "'" || c === "`") state = c;
      continue;
    }
    if (c === "\n") {
      if (state === "line" || state === '"' || state === "'") state = "code";
      continue;
    }
    out[i] = " ";
    if (state === "block" && c === "*" && next === "/") {
      out[i + 1] = " ";
      i++;
      state = "code";
    } else if ((state === '"' || state === "'" || state === "`") && c === "\\") {
      if (next !== "\n") out[i + 1] = " ";
      i++;
    } else if (state === c) {
      out[i] = c;
      state = "code";
    }
  }
  return out.join("");
}

// `test(` / `it(` with optional .only/.skip/.todo/.failing/.concurrent; describe is a
// grouping, not a case, so it carries no prefix requirement. `it.each(...)(...)`
// titles are not parsed (known limit).
const CALL_RE = /\b(?:test|it)(?:\.(?:only|skip|todo|failing|concurrent|fails))?\s*\(\s*(?=["'`])/g;
const LITERAL_RE = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/y;

export function extractTestTitles(source) {
  const titles = [];
  if (!source) return titles;
  const masked = codeMask(source);
  for (const call of masked.matchAll(CALL_RE)) {
    LITERAL_RE.lastIndex = call.index + call[0].length;
    const m = LITERAL_RE.exec(source);
    if (!m) continue;
    const title = m[2];
    const dynamic = m[1] === "`" && title.startsWith("${");
    const pm = /^(error|edge|regression|happy):/.exec(title);
    titles.push({ title, prefix: pm ? pm[1] : null, dynamic });
  }
  return titles;
}

// added: titles introduced by the diff (any file). newFiles: full ordered titles of
// files created by the diff, where declaration order is also enforced.
export function checkTitles({ added, newFiles }) {
  const violations = [];
  for (const t of added) {
    if (t.dynamic) {
      violations.push(`${t.file}: "${t.title}" starts with an interpolation; the prefix (error:/edge:/regression:/happy:) must be literal`);
    } else if (!t.prefix) {
      violations.push(`${t.file}: "${t.title}" has no error:/edge:/regression:/happy: prefix`);
    }
  }
  const hasHappy = added.some((t) => t.prefix === "happy");
  const hasErrorOrEdge = added.some((t) => t.prefix === "error" || t.prefix === "edge");
  if (hasHappy && !hasErrorOrEdge) {
    violations.push("the change adds happy: cases without any error: or edge: case");
  }
  for (const file of newFiles) {
    let seenHappy = false;
    for (const t of file.titles) {
      if (t.prefix === "happy") seenHappy = true;
      else if (seenHappy && (t.prefix === "error" || t.prefix === "edge")) {
        violations.push(`${file.path}: "${t.title}" is declared after a happy: case; error/edge cases come first`);
      }
    }
  }
  return violations;
}

// Reads node:test TAP (scripts/**/*.test.mjs). A top-level failure named after one of
// the run files is a file-level failure (usually a module that does not exist yet);
// suites are skipped.
export function parseTapFailures(tap, files) {
  const out = { testLevel: [], fileLevel: [] };
  if (!tap) return out;
  const lines = tap.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)not ok \d+ - (.*)$/.exec(lines[i]);
    if (!m) continue;
    const title = m[2].replace(/\\#/g, "#").trim();
    let type = "test";
    for (let j = i + 1; j < lines.length && j < i + 40; j++) {
      const tm = /^\s*type: '(\w+)'/.exec(lines[j]);
      if (tm) {
        type = tm[1];
        break;
      }
      if (/^\s*\.\.\.\s*$/.test(lines[j])) break;
    }
    if (type === "suite") continue;
    const isFile = m[1] === "" && files.some((f) => title === f || title.endsWith(`/${f}`) || f.endsWith(`/${title}`));
    (isFile ? out.fileLevel : out.testLevel).push(title);
  }
  return out;
}

// Reads the Jest-compatible JSON report that both `jest --json` and
// `vitest run --reporter=json` write. A suite that failed with no case results could
// not load (usually a module that does not exist yet); a requested file absent from
// the report never ran, which is treated the same way. Skipped/todo cases are ignored.
export function parseJsonReport(report, files, root) {
  const out = { testLevel: [], fileLevel: [] };
  const results = Array.isArray(report?.testResults) ? report.testResults : [];
  const seen = new Set();
  for (const suite of results) {
    const rel = path.relative(root, suite.name ?? "").split(path.sep).join("/");
    seen.add(rel);
    const cases = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
    const failed = cases.filter((c) => c.status === "failed");
    if (suite.status === "failed" && cases.length === 0) out.fileLevel.push(rel);
    else out.testLevel.push(...failed.map((c) => c.title));
  }
  for (const f of files) if (!seen.has(f)) out.fileLevel.push(f);
  return out;
}

export function judgeRed({ testLevel, fileLevel }) {
  const redTitles = testLevel.filter((t) => RED_PREFIXES.has(/^(\w+):/.exec(t)?.[1]));
  if (redTitles.length > 0) return { red: true, reason: `failing: ${redTitles.join(", ")}` };
  if (testLevel.length === 0 && fileLevel.length > 0) {
    return { red: true, reason: `do not load (module not written yet): ${fileLevel.join(", ")}` };
  }
  if (testLevel.length > 0) {
    return {
      red: false,
      reason: `only cases without an error:/edge:/regression: prefix fail (${testLevel.join(", ")}); a RED starts with errors and edges`,
    };
  }
  return { red: false, reason: "no test fails: the tests do not pin the new behaviour" };
}

// Shell text with quoted contents blanked (quote chars kept) and `#` comments
// dropped, so `-m "a > src/x.ts"` or `# > src/x.ts` never read as redirections.
function shellMask(command) {
  const mask = command.split("");
  const comment = new Array(command.length).fill(false);
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === "\\" && quote === '"') {
        mask[i] = " ";
        if (i + 1 < command.length) mask[++i] = " ";
      } else if (c === quote) quote = null;
      else mask[i] = " ";
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === "#" && (i === 0 || /\s/.test(command[i - 1]))) {
      for (; i < command.length && command[i] !== "\n"; i++) {
        mask[i] = " ";
        comment[i] = true;
      }
      i--;
    }
  }
  return { mask: mask.join(""), comment };
}

function segments(command) {
  const { mask, comment } = shellMask(command);
  const out = [];
  let from = 0;
  for (const m of mask.matchAll(/\|\||&&|;|\||\n/g)) {
    out.push([from, m.index]);
    from = m.index + m[0].length;
  }
  out.push([from, command.length]);
  return out.map(([a, b]) => {
    let clean = "";
    for (let i = a; i < b; i++) if (!comment[i]) clean += command[i];
    return { text: command.slice(a, b), mask: mask.slice(a, b), clean };
  });
}

function tokenize(segment) {
  const tokens = [];
  for (const m of segment.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)) tokens.push(m[1] ?? m[2] ?? m[3]);
  return tokens;
}

const isPathArg = (t) => !t.startsWith("-") && !/^\d*>/.test(t) && !t.startsWith("<") && !t.startsWith(">");
const REDIRECT_RE = /(?<![0-9&<>])>{1,2}(?!&)[ \t]*/g;
const TARGET_RE = /'([^']+)'|"([^"]+)"|([^\s'"<>&;|]+)/y;

// Best-effort: the file paths a shell command would write. Reads (grep, cat,
// sed -n) yield nothing. A heuristic, not a shell parser.
export function findBashWriteTargets(command) {
  const targets = [];
  if (!command) return targets;
  for (const seg of segments(command)) {
    if (!seg.mask.trim()) continue;
    let stripped = "";
    let last = 0;
    for (const m of seg.mask.matchAll(REDIRECT_RE)) {
      TARGET_RE.lastIndex = m.index + m[0].length;
      const t = TARGET_RE.exec(seg.text);
      if (!t || seg.mask[m.index + m[0].length] === undefined) continue;
      targets.push(t[1] ?? t[2] ?? t[3]);
      stripped += seg.text.slice(last, m.index);
      last = TARGET_RE.lastIndex;
    }
    stripped += seg.text.slice(last);
    const withoutComment = segments(stripped)[0]?.clean ?? stripped;
    const tokens = tokenize(withoutComment.replace(/<<-?\s*['"]?\w+['"]?/g, "").trim());
    const [cmd, ...rest] = tokens;
    if (cmd === "tee") {
      targets.push(...rest.filter(isPathArg));
    } else if ((cmd === "sed" || cmd === "perl") && rest.some((t) => /^-[a-z]*i/.test(t))) {
      let skipNext = false;
      const args = [];
      for (const t of rest) {
        if (skipNext) {
          skipNext = false;
          continue;
        }
        if (t === "-e") {
          skipNext = true;
          continue;
        }
        if (t.startsWith("-") || t === "") continue;
        args.push(t);
      }
      // sed: first non-flag arg is the script unless -e was used.
      const files = cmd === "sed" && !rest.includes("-e") ? args.slice(1) : args;
      targets.push(...files.filter((t) => /[./]/.test(t)));
    } else if (["cp", "mv", "install", "rsync"].includes(cmd)) {
      const args = rest.filter(isPathArg);
      if (args.length >= 2) targets.push(args[args.length - 1]);
    }
  }
  return targets.filter((t) => t && !t.startsWith("/dev/"));
}

// Kinds whose tests can prove a RED locally. backendE2e needs Postgres and the fake
// BioStar server, so the gate only checks it exists.
export const RUNNABLE_KINDS = ["jest", "vitest", "scriptTests"];
