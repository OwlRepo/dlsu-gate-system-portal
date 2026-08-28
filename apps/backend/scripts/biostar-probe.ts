/**
 * biostar-probe.ts
 *
 * DEV/STAGING-ONLY DIAGNOSTIC TOOLING. Never imported by application code,
 * never run against production. Answers the questions that the repository
 * itself cannot answer about the BioStar 2 (Suprema) API, so that the
 * DLSU-Dasma sync fixes are built on observed responses instead of guesses.
 *
 * It answers four things:
 *
 *   A1. What custom fields does this BioStar instance define, and what is the
 *       exact `id` / `name` / `type` of the one called "Remarks"?
 *       -> GET /api/setting/custom_fields
 *
 *   A2. What fields do `GET /api/users` LIST rows actually carry? Suprema's
 *       docs say `photo_exists` (plural), `card_count`, `last_modified`, and
 *       NO `photo` field. `database-sync-dasma-path.service.ts:144-151`
 *       depends on that. This confirms it against the live instance.
 *       -> GET /api/users?limit=3&offset=0&group_id=1
 *
 *   B.  What exact JSON shape does `user_custom_fields` have on a real user
 *       who has a remark, and does the user-detail response carry `photo`?
 *       -> GET /api/users/:id
 *
 *   C.  Does `PUT /api/users/:id` clear a custom field when its value is set
 *       to ""? This is the mechanism Issue 3's fix depends on. Suprema
 *       documents it for the `photo` field; it is not documented for custom
 *       field VALUES, so it must be observed.
 *       -> csv_import a throwaway user carrying a remark (using the exact
 *          same upload path the real sync uses), GET it back, PUT the same
 *          structure with the value emptied, GET again, then DELETE it.
 *
 * Part C never invents a payload shape: it sends back the structure BioStar
 * itself returned, with one value blanked.
 *
 * ----------------------------------------------------------------------
 * HOW TO RUN
 * ----------------------------------------------------------------------
 * Read-only (parts A1, A2, B) — safe, makes no writes:
 *   bun --cwd apps/backend scripts/biostar-probe.ts --read-user 12345678 > probe-output.txt 2>&1
 *
 * Full probe including the write test (adds part C). The value passed to
 * --confirm-write-to must exactly match the host in BIOSTAR_API_BASE_URL:
 *   bun --cwd apps/backend scripts/biostar-probe.ts --read-user 12345678 --write-user ZZTEST001 --confirm-write-to biostar-staging.example.local > probe-output.txt 2>&1
 *
 * NOTE on invocation: `--cwd apps/backend` is required. Running
 * `bun apps/backend/scripts/biostar-probe.ts` from the repo root does NOT
 * work — the repo root has no tsconfig.json, so Bun cannot see
 * apps/backend/tsconfig.json's `emitDecoratorMetadata: true` and the
 * `@Injectable()` decorator on the imported BiostarApiService fails to
 * resolve. Same constraint as scripts/seed-qa-test-account.ts.
 *
 * ----------------------------------------------------------------------
 * SAFETY
 * ----------------------------------------------------------------------
 *   - Parts A1, A2 and B are strictly read-only and always safe to run.
 *   - Part C WRITES to BioStar (creates, updates and deletes one user). It
 *     runs only when BOTH `--write-user <id>` and `--confirm-write-to <host>`
 *     are given, and <host> must EXACTLY match the host in
 *     BIOSTAR_API_BASE_URL. Having to retype the target host is the guard:
 *     it cannot be satisfied by pasting a command out of a document, and it
 *     makes "which BioStar am I about to write to" something the operator
 *     states rather than assumes. A flag is used rather than an interactive
 *     prompt because this script is meant to be run with stdout redirected
 *     to a file, where a prompt would be invisible.
 *   - This deliberately does NOT gate on NODE_ENV. The repo-root .env ships
 *     `NODE_ENV=production` (verified), so such a check would refuse to run
 *     on the staging box while proving nothing about which BioStar instance
 *     the URL points at. The host ack is the real control; a
 *     NODE_ENV=production notice is still printed for visibility.
 *   - `--write-user` MUST be an id that does not exist in the real roster.
 *     The script aborts if that id already exists in BioStar, so it can
 *     never modify or delete a real person's record.
 *   - The target base URL is printed before any write happens.
 *
 * Reads BIOSTAR_API_BASE_URL / BIOSTAR_API_LOGIN_ID / BIOSTAR_API_PASSWORD
 * from the repo-root .env, the same file and the same keys the backend uses.
 */

import * as path from 'path';
import * as dotenv from 'dotenv';

// Same root-.env resolution as src/config/data-source.ts:11, adjusted for this
// file's depth (apps/backend/scripts -> apps/backend -> apps -> repo root).
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import axios from 'axios';
import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as FormData from 'form-data';
import { createObjectCsvWriter } from 'csv-writer';
import type { ConfigService } from '@nestjs/config';
import { BiostarApiService } from '../src/database-sync/services/shared/biostar-api.service';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/** Exactly the header set database-sync-dasma-path.service.ts:491-502 writes. */
const DASMA_CSV_HEADERS = [
  { id: 'user_id', title: 'user_id' },
  { id: 'name', title: 'name' },
  { id: 'department', title: 'department' },
  { id: 'user_title', title: 'user_title' },
  { id: 'user_group', title: 'user_group' },
  { id: 'remarks', title: 'Remarks' },
  { id: 'csn', title: 'csn' },
  { id: 'start_datetime', title: 'start_datetime' },
  { id: 'expiry_datetime', title: 'expiry_datetime' },
  { id: 'original_campus_entry', title: 'original_campus_entry' },
];

const PROBE_REMARK = 'PROBE_VALUE_1';

interface Args {
  readUser?: string;
  writeUser?: string;
  /** Must equal the host of BIOSTAR_API_BASE_URL for the write test to run. */
  confirmWriteTo?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--read-user') args.readUser = argv[++i];
    else if (argv[i] === '--write-user') args.writeUser = argv[++i];
    else if (argv[i] === '--confirm-write-to') args.confirmWriteTo = argv[++i];
  }
  return args;
}

/** Host portion of a base URL, or null when it cannot be parsed. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function banner(title: string): void {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

function show(label: string, value: unknown): void {
  console.log(`${label}: ${JSON.stringify(value, null, 2)}`);
}

/**
 * Truncates any `photo` value so a base64 image never floods the output,
 * while still showing enough of the prefix to identify the image format.
 */
function redactPhoto(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.length > 40
    ? `${value.slice(0, 40)}… (${value.length} chars)`
    : value;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const baseUrl = process.env.BIOSTAR_API_BASE_URL;
  if (!baseUrl) {
    console.error(
      '[biostar-probe] BIOSTAR_API_BASE_URL is not set. Expected it in the repo-root .env, ' +
        'the same file the backend reads.',
    );
    process.exit(1);
  }

  const targetHost = hostOf(baseUrl);
  const writeAcked =
    !!args.writeUser &&
    !!args.confirmWriteTo &&
    !!targetHost &&
    args.confirmWriteTo === targetHost;

  banner('BIOSTAR PROBE');
  console.log(`Target BioStar : ${baseUrl}`);
  console.log(`Target host    : ${targetHost ?? '(unparseable)'}`);
  console.log(`NODE_ENV       : ${process.env.NODE_ENV ?? '(unset)'}`);
  console.log(`Run from       : ${os.hostname()}`);
  console.log(
    `Read user      : ${args.readUser ?? '(not supplied — part B skipped)'}`,
  );
  console.log(
    `Write test     : ${
      writeAcked
        ? `ENABLED against throwaway user "${args.writeUser}"`
        : '(disabled — needs --write-user <id> and --confirm-write-to <target host>)'
    }`,
  );
  if (process.env.NODE_ENV === 'production') {
    console.log(
      '\nNOTE: NODE_ENV=production. That comes from the repo-root .env and says nothing about\n' +
        'which BioStar instance the URL above points at — confirm the target host yourself\n' +
        'before enabling the write test.',
    );
  }
  if (args.writeUser && !writeAcked) {
    console.log(
      `\nWrite test refused: --confirm-write-to was ${
        args.confirmWriteTo ? `"${args.confirmWriteTo}"` : 'not supplied'
      }, which does not match the target host "${targetHost ?? '(unparseable)'}".`,
    );
  }

  // Reuse the real client so this probe authenticates exactly the way the sync
  // does, instead of re-implementing login. BiostarApiService only ever calls
  // configService.get(), so a plain lookup object satisfies it.
  const configShim = {
    get: (key: string) => process.env[key],
  } as unknown as ConfigService;
  const api = new BiostarApiService(configShim);

  const { token, sessionId } = await api.getApiToken();
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'bs-session-id': sessionId,
    accept: 'application/json',
  };

  // ---- A1: custom field definitions ------------------------------------
  banner('A1. GET /api/setting/custom_fields — custom field definitions');
  try {
    const res = await axios.get(`${baseUrl}/api/setting/custom_fields`, {
      headers: authHeaders,
      httpsAgent,
      timeout: 30000,
    });
    show('raw response', res.data);
  } catch (err) {
    console.error(
      'A1 FAILED:',
      axios.isAxiosError(err) ? (err.response?.data ?? err.message) : err,
    );
  }

  // ---- A2: list row shape ----------------------------------------------
  banner('A2. GET /api/users (list) — row shape');
  try {
    const res = await axios.get(`${baseUrl}/api/users`, {
      params: { limit: 3, offset: 0, group_id: 1, order_by: 'name:true' },
      headers: authHeaders,
      httpsAgent,
      timeout: 60000,
    });
    const collection = res.data?.UserCollection;
    const rows: Array<Record<string, unknown>> = collection?.rows ?? [];
    console.log(`reported total : ${collection?.total ?? '(absent)'}`);
    console.log(`rows returned  : ${rows.length}`);
    if (rows.length > 0) {
      show('first row KEYS', Object.keys(rows[0]).sort());
      console.log(
        '\nThe three fields the Dasma candidate filter and cursor depend on:',
      );
      console.log(
        `  photo_exists (plural) : ${JSON.stringify(rows[0].photo_exists)}`,
      );
      console.log(
        `  photo_exist (singular): ${JSON.stringify(rows[0].photo_exist)}`,
      );
      console.log(
        `  card_count            : ${JSON.stringify(rows[0].card_count)}`,
      );
      console.log(
        `  last_modified         : ${JSON.stringify(rows[0].last_modified)}`,
      );
      console.log(
        '  (last_modified decides whether the cursor comparison must be numeric or lexicographic)',
      );
      const redacted = rows.map((r) => ({ ...r, photo: redactPhoto(r.photo) }));
      show('\nfirst row (photo truncated)', redacted[0]);
    }
  } catch (err) {
    console.error(
      'A2 FAILED:',
      axios.isAxiosError(err) ? (err.response?.data ?? err.message) : err,
    );
  }

  // ---- B: real user detail shape ---------------------------------------
  if (args.readUser) {
    banner(`B. GET /api/users/${args.readUser} — detail shape (READ ONLY)`);
    try {
      const res = await axios.get(`${baseUrl}/api/users/${args.readUser}`, {
        headers: authHeaders,
        httpsAgent,
        timeout: 30000,
      });
      const user = (res.data?.User ?? res.data) as Record<string, unknown>;
      show('detail KEYS', Object.keys(user).sort());
      console.log(`\nphoto present : ${user.photo != null}`);
      console.log(`photo value   : ${JSON.stringify(redactPhoto(user.photo))}`);
      console.log(`photo_exist   : ${JSON.stringify(user.photo_exist)}`);
      console.log(`photo_exists  : ${JSON.stringify(user.photo_exists)}`);
      console.log(`expiry_datetime: ${JSON.stringify(user.expiry_datetime)}`);
      console.log(`start_datetime : ${JSON.stringify(user.start_datetime)}`);
      console.log(`disabled       : ${JSON.stringify(user.disabled)}`);
      show(
        '\nuser_custom_fields (VERBATIM — this is the shape the fix must echo back)',
        user.user_custom_fields,
      );
    } catch (err) {
      console.error(
        'B FAILED:',
        axios.isAxiosError(err) ? (err.response?.data ?? err.message) : err,
      );
    }
  } else {
    banner(
      'B. SKIPPED — pass --read-user <id of a real user that HAS a remark>',
    );
  }

  // ---- C: does PUT with "" clear a custom field? -------------------------
  if (!writeAcked) {
    banner(
      'C. SKIPPED — needs --write-user <throwaway-id> and --confirm-write-to <target host>',
    );
    console.log(
      'Part C is the one that answers whether a removed remark can be cleared at all.',
    );
    return;
  }

  banner(`C. WRITE TEST on throwaway user "${args.writeUser}"`);
  console.log(
    `About to CREATE, UPDATE and DELETE user "${args.writeUser}" on ${baseUrl}`,
  );

  // Refuse to touch an id that already exists — that could be a real person.
  let alreadyExists = false;
  try {
    const existing = await axios.get(`${baseUrl}/api/users/${args.writeUser}`, {
      headers: authHeaders,
      httpsAgent,
      timeout: 30000,
      validateStatus: () => true,
    });
    alreadyExists = existing.status === 200 && !!(existing.data?.User ?? null);
  } catch {
    alreadyExists = false;
  }
  if (alreadyExists) {
    console.error(
      `C ABORTED: user "${args.writeUser}" already exists in BioStar. ` +
        'Pick an id that is not in the roster — this script will not modify or delete an existing user.',
    );
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biostar-probe-'));
  const csvPath = path.join(tempDir, 'probe.csv');

  const writeProbeCsv = async (remarks: string): Promise<void> => {
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: DASMA_CSV_HEADERS,
    });
    await csvWriter.writeRecords([
      {
        user_id: args.writeUser,
        name: 'BIOSTAR PROBE USER',
        department: 'DLSU',
        user_title: 'Student',
        user_group: 'All Users',
        remarks,
        csn: '',
        start_datetime: '2001-01-01 00:00:00.000',
        expiry_datetime: '2030-12-31 23:59:00.000',
        original_campus_entry: 'Y',
      },
    ]);
  };

  // Import via the exact same two calls the real sync makes
  // (database-sync-dasma-path.service.ts:879-947), so nothing about the
  // import path is invented either.
  const importCsv = async (label: string): Promise<void> => {
    const form = new FormData();
    form.append('file', fs.createReadStream(csvPath));
    const upload = await axios.post(`${baseUrl}/api/attachments`, form, {
      headers: { ...form.getHeaders(), ...authHeaders },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      httpsAgent,
      timeout: 120000,
    });
    const uploadedFileName = upload.data?.filename;
    if (!uploadedFileName)
      throw new Error('no filename returned from /api/attachments');

    const headerLine = fs.readFileSync(csvPath, 'utf8').split('\n')[0];
    const headers = headerLine.split(',');
    const res = await axios.post(
      `${baseUrl}/api/users/csv_import`,
      {
        File: { uri: uploadedFileName, fileName: uploadedFileName },
        CsvOption: {
          columns: {
            total: headers.length.toString(),
            rows: headers,
            formats: headers.map(() => 'Text'),
          },
          start_line: 2,
          import_option: 2,
        },
        Query: { headers, columns: headers },
      },
      {
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        httpsAgent,
        timeout: 120000,
      },
    );
    show(`${label} — csv_import response`, res.data);
  };

  const readCustomFields = async (label: string): Promise<unknown> => {
    const res = await axios.get(`${baseUrl}/api/users/${args.writeUser}`, {
      headers: authHeaders,
      httpsAgent,
      timeout: 30000,
    });
    const user = (res.data?.User ?? res.data) as Record<string, unknown>;
    show(`${label} — user_custom_fields`, user.user_custom_fields);
    return user.user_custom_fields;
  };

  try {
    console.log(
      '\n--- C1. create the throwaway user with a remark, via csv_import ---',
    );
    await writeProbeCsv(PROBE_REMARK);
    await importCsv('C1');
    const afterCreate = await readCustomFields('C1');

    console.log(
      '\n--- C2. control: does a BLANK CSV cell clear it? (the reported failure) ---',
    );
    await writeProbeCsv('');
    await importCsv('C2');
    await readCustomFields('C2');
    console.log(
      `Expected per the field report: the remark is STILL "${PROBE_REMARK}" here, ` +
        'i.e. a blank CSV cell is ignored rather than applied.',
    );

    console.log(
      '\n--- C3. the candidate fix: PUT the same structure with the value emptied ---',
    );
    if (!Array.isArray(afterCreate)) {
      console.error(
        'C3 SKIPPED: user_custom_fields was not an array, so there is no structure to echo back.',
      );
    } else {
      // Echo BioStar's own array back with only the Remarks value blanked.
      // Nothing about this shape is invented — it is what C1 returned.
      const cleared = (afterCreate as Array<Record<string, any>>).map(
        (entry) =>
          entry?.custom_field?.name === 'Remarks'
            ? { ...entry, item: '' }
            : entry,
      );
      show('C3 — PUT body being sent', {
        User: { user_custom_fields: cleared },
      });
      const res = await axios.put(
        `${baseUrl}/api/users/${args.writeUser}`,
        { User: { user_custom_fields: cleared } },
        {
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          httpsAgent,
          timeout: 30000,
        },
      );
      show('C3 — PUT response', res.data);
      await readCustomFields('C3 (after PUT)');
      console.log(
        'VERDICT: if Remarks is now empty/absent above, PUT-with-"" is the clearing mechanism ' +
          'and Issue 3 Step 9 is correct as planned. If it still shows the old value, ' +
          'the write shape needs another form and Step 9 must be revised.',
      );
    }
  } catch (err) {
    console.error(
      'C FAILED:',
      axios.isAxiosError(err) ? (err.response?.data ?? err.message) : err,
    );
  } finally {
    console.log('\n--- C4. cleanup: delete the throwaway user ---');
    try {
      const del = await axios.delete(
        `${baseUrl}/api/users?id=${encodeURIComponent(args.writeUser)}&group_id=1`,
        { headers: authHeaders, httpsAgent, timeout: 30000 },
      );
      show('C4 — delete response', del.data);
    } catch (err) {
      console.error(
        `C4 CLEANUP FAILED — user "${args.writeUser}" may still exist in BioStar, delete it by hand:`,
        axios.isAxiosError(err) ? (err.response?.data ?? err.message) : err,
      );
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main()
  .then(() => {
    banner('PROBE COMPLETE — send this whole output back');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[biostar-probe] Fatal:', err);
    process.exit(1);
  });
