import * as http from 'http';
import { AddressInfo } from 'net';

/**
 * A stand-in for the BioStar 2 server, spoken to over real HTTP.
 *
 * The unit specs mock axios, so nothing there ever builds a real request. This
 * exists to exercise the parts that only appear on the wire: the multipart body
 * `form-data` actually produces, the headers axios actually sends, and the exact
 * CSV bytes that would reach BioStar.
 *
 * It fakes only what the Dasma sync calls, verified against the call sites in
 * `database-sync-dasma-path.service.ts` and `shared/biostar-api.service.ts`:
 *
 *   POST /api/login              -> session id on the RESPONSE HEADER, token in body
 *   GET  /api/users              -> UserCollection { total, rows }
 *   GET  /api/users/:id          -> { User: {...} }
 *   PUT  /api/users/:id          -> records the body; scriptable response
 *   POST /api/attachments        -> parses multipart, keeps the bytes, returns { filename }
 *   POST /api/users/csv_import   -> scriptable { Response: { code } }
 *   GET  /download/:uri          -> error-details CSV (note: NO /api prefix)
 *
 * Everything it receives is retained, so a test can assert on what BioStar would
 * have seen rather than on what we intended to send.
 */

export interface UploadedFile {
  filename: string;
  /** Raw bytes of the uploaded part, exactly as they came off the wire. */
  content: string;
  contentType: string | null;
  /** The multipart field name — the service uses 'file'. */
  fieldName: string | null;
}

export interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** What the next call to each endpoint should do. */
export interface Scenario {
  /** Response.code returned by csv_import. Default '0'. */
  importCode?: string | number | null;
  /**
   * Include a CsvRowCollection (the partial-import path). The real server sends
   * file line numbers as strings, e.g. ['19']; objects remain accepted for the
   * older fixtures.
   */
  importFailedRows?: (string | Record<string, unknown>)[] | null;
  /** Body served by GET /download/:uri. Default keeps the legacy fixture. */
  errorCsv?: string;
  /** Omit `filename` from the attachment response. */
  attachmentOmitsFilename?: boolean;
  /** Fail the attachment upload this many times before succeeding. */
  attachmentFailures?: number;
  /** Response.code returned by PUT /api/users/:id. Default: none. */
  putCode?: string | number | null;
  /** HTTP status for PUT. Default 200. */
  putStatus?: number;
}

export class FakeBiostarServer {
  private server: http.Server;
  private port = 0;

  /** Every request the server saw, in order. */
  readonly requests: RecordedRequest[] = [];
  /** Every file uploaded to /api/attachments, in order. */
  readonly uploads: UploadedFile[] = [];
  /** Bodies of every PUT /api/users/:id, in order. */
  readonly userPuts: { userId: string; body: unknown }[] = [];

  /** user_id -> detail payload served by GET /api/users/:id. */
  userDetails: Record<string, Record<string, unknown>> = {};
  /** Pages served by GET /api/users. */
  listPages: { total: number; rows: Record<string, unknown>[] }[] = [
    { total: 0, rows: [] },
  ];

  scenario: Scenario = {};

  private attachmentAttempts = 0;

  constructor() {
    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch((err) => {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      });
    });
  }

  async listen(): Promise<string> {
    await new Promise<void>((resolve) =>
      this.server.listen(0, '127.0.0.1', resolve),
    );
    this.port = (this.server.address() as AddressInfo).port;
    return this.baseUrl;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close((err) => (err ? reject(err) : resolve())),
    );
  }

  reset(): void {
    this.requests.length = 0;
    this.uploads.length = 0;
    this.userPuts.length = 0;
    this.userDetails = {};
    this.listPages = [{ total: 0, rows: [] }];
    this.scenario = {};
    this.attachmentAttempts = 0;
  }

  /** Requests to one path, in order. */
  requestsTo(pathFragment: string): RecordedRequest[] {
    return this.requests.filter((r) => r.url.includes(pathFragment));
  }

  countOf(pathFragment: string): number {
    return this.requestsTo(pathFragment).length;
  }

  /** The most recently uploaded CSV, as text. */
  lastUploadText(): string {
    return this.uploads[this.uploads.length - 1]?.content ?? '';
  }

  // ------------------------------------------------------------------

  private readBody(req: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  /**
   * Pulls the uploaded part out of a multipart/form-data body.
   *
   * Hand-rolled on purpose: the point is to read exactly what `form-data`
   * produced, and a library that silently repaired a malformed body would
   * defeat the test.
   */
  private parseMultipart(
    body: Buffer,
    contentType: string | undefined,
  ): UploadedFile | null {
    const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(
      contentType ?? '',
    );
    if (!boundaryMatch) return null;
    const boundary = `--${boundaryMatch[1] ?? boundaryMatch[2]}`.trim();

    const text = body.toString('binary');
    const parts = text.split(boundary).slice(1, -1);
    for (const part of parts) {
      const sep = part.indexOf('\r\n\r\n');
      if (sep === -1) continue;
      const rawHeaders = part.slice(0, sep);
      // The trailing CRLF belongs to the boundary delimiter, not the content.
      const content = part.slice(sep + 4).replace(/\r\n$/, '');

      const nameMatch = /name="([^"]+)"/i.exec(rawHeaders);
      const filenameMatch = /filename="([^"]+)"/i.exec(rawHeaders);
      const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(rawHeaders);

      return {
        fieldName: nameMatch?.[1] ?? null,
        filename: filenameMatch?.[1] ?? 'unnamed',
        contentType: typeMatch?.[1]?.trim() ?? null,
        content: Buffer.from(content, 'binary').toString('utf8'),
      };
    }
    return null;
  }

  private json(res: http.ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  private async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const raw = await this.readBody(req);
    const url = req.url ?? '';
    const method = req.method ?? 'GET';
    const isMultipart = (req.headers['content-type'] ?? '').includes(
      'multipart/form-data',
    );

    this.requests.push({
      method,
      url,
      headers: req.headers,
      body: isMultipart ? `<multipart ${raw.length} bytes>` : raw.toString(),
    });

    // --- auth ---------------------------------------------------------
    if (method === 'POST' && url.startsWith('/api/login')) {
      // The session id comes back on the HEADER, not in the body — the service
      // throws without it.
      res.writeHead(200, {
        'content-type': 'application/json',
        'bs-session-id': 'fake-session-id',
      });
      res.end(JSON.stringify({ token: 'fake-token' }));
      return;
    }

    // --- attachment upload --------------------------------------------
    if (method === 'POST' && url.startsWith('/api/attachments')) {
      this.attachmentAttempts++;
      if (
        this.scenario.attachmentFailures &&
        this.attachmentAttempts <= this.scenario.attachmentFailures
      ) {
        this.json(res, 500, { message: 'upload exploded' });
        return;
      }
      const file = this.parseMultipart(raw, req.headers['content-type']);
      if (file) this.uploads.push(file);
      if (this.scenario.attachmentOmitsFilename) {
        this.json(res, 200, {});
        return;
      }
      this.json(res, 200, { filename: file?.filename ?? 'upload.csv' });
      return;
    }

    // --- csv import ----------------------------------------------------
    if (method === 'POST' && url.startsWith('/api/users/csv_import')) {
      const code = this.scenario.importCode ?? '0';
      const body: Record<string, unknown> = { Response: { code } };
      if (this.scenario.importFailedRows) {
        body.CsvRowCollection = {
          total: String(this.scenario.importFailedRows.length),
          rows: this.scenario.importFailedRows,
        };
        body.File = { uri: 'errors.csv' };
      }
      // The documented all-failed code arrives with HTTP 404.
      this.json(res, String(code) === '8' ? 404 : 200, body);
      return;
    }

    // --- error-details download (no /api prefix) -----------------------
    if (method === 'GET' && url.startsWith('/download/')) {
      res.writeHead(200, { 'content-type': 'text/csv' });
      res.end(this.scenario.errorCsv ?? 'user_id,reason\n12100001,rejected\n');
      return;
    }

    // --- user list -----------------------------------------------------
    if (method === 'GET' && /^\/api\/users(\?|$)/.test(url)) {
      const params = new URL(url, this.baseUrl).searchParams;
      const offset = Number(params.get('offset') ?? '0');
      const page = this.listPages[Math.floor(offset / 500)] ?? {
        total: 0,
        rows: [],
      };

      // Honour `last_modified` the way the real endpoint does: it is a filter,
      // and a caller that sends one is asking BioStar to WITHHOLD everyone it
      // does not consider newer. Ignoring it here made the fake far more
      // generous than the real thing and hid an entire class of bug — a user
      // BioStar never returns cannot be fetched, updated, or noticed missing.
      //
      // Suprema documents the comparison as INCLUSIVE: the endpoint "returns
      // records with last_modified >= this value". So the user sitting exactly
      // on the cursor comes back on every run, and a caller that stores the
      // highest value it saw re-reads that row next time. Matching the
      // documented server matters even though this code no longer sends the
      // parameter — a double that contradicts the real thing is worse than no
      // double at all.
      const since = params.get('last_modified');
      const rows = since
        ? page.rows.filter((r) => Number(r.last_modified ?? 0) >= Number(since))
        : page.rows;

      this.json(res, 200, {
        UserCollection: { total: String(page.total), rows },
      });
      return;
    }

    // --- single user ---------------------------------------------------
    const userMatch = /^\/api\/users\/([^/?]+)/.exec(url);
    if (userMatch) {
      const userId = decodeURIComponent(userMatch[1]);
      if (method === 'GET') {
        const detail = this.userDetails[userId];
        if (!detail) {
          this.json(res, 404, { Response: { code: '404' } });
          return;
        }
        this.json(res, 200, { User: detail });
        return;
      }
      if (method === 'PUT') {
        this.userPuts.push({
          userId,
          body: JSON.parse(raw.toString() || '{}'),
        });
        const status = this.scenario.putStatus ?? 200;
        const body =
          this.scenario.putCode === undefined || this.scenario.putCode === null
            ? {}
            : { Response: { code: this.scenario.putCode } };
        this.json(res, status, body);
        return;
      }
    }

    this.json(res, 404, { message: `no fake route for ${method} ${url}` });
  }
}
