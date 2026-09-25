import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as https from 'https';

/**
 * True when BioStar sent an error envelope instead of data: HTTP 200 with a
 * non-zero Response.code. Measured 2026-09-25: code "4", "Synced Web Request
 * is not respond in timeout period", when BioStar is too busy to answer.
 */
export function isBiostarErrorReply(data: unknown): boolean {
  const code = (data as { Response?: { code?: unknown } } | null | undefined)
    ?.Response?.code;
  return code !== undefined && code !== null && String(code) !== '0';
}

/**
 * BioStar's user list reduced to card counts. `complete` is false when the
 * list held fewer distinct users than BioStar reported — measured 2026-09-23
 * at 19,653 users — so a user missing from `counts` is unknown, not absent.
 */
export type CardDirectory = {
  counts: Map<string, number>;
  complete: boolean;
};

@Injectable()
export class BiostarApiService {
  private readonly logger = new Logger(BiostarApiService.name);
  private readonly apiBaseUrl: string;
  private readonly apiCredentials: { login_id: string; password: string };

  constructor(private configService: ConfigService) {
    this.apiBaseUrl = this.configService.get('BIOSTAR_API_BASE_URL');
    this.apiCredentials = {
      login_id: this.configService.get('BIOSTAR_API_LOGIN_ID'),
      password: this.configService.get('BIOSTAR_API_PASSWORD'),
    };
  }

  /**
   * Clears one user custom field — in practice "Remarks" — in BioStar.
   *
   * The CSV import appears unable to do this. Updating a remark to a NEW value
   * through `csv_import` works; emptying it does not. That is a FIELD REPORT
   * from DLSU, not something we have observed against a server ourselves — the
   * CSV has always sent an empty cell for a cleared remark, and the remark
   * stayed. Note it also sits uneasily beside the CSN comment in
   * `database-sync-dasma-path.service.ts`, which assumes a blank `csn` cell IS
   * applied. Suprema documents neither case. The reconciling guess is that
   * blanks apply to built-in fields and are ignored for custom ones, but it is
   * a guess.
   *
   * What IS documented: Suprema's per-user update clears a field by sending it
   * empty (their profile-photo article does exactly that), and states you need
   * only send the parameters you want to change.
   *
   * Read-modify-write on purpose: it sends back the exact `user_custom_fields`
   * array BioStar just returned, with a single `item` blanked. Nothing about
   * the payload shape is invented here, and fields this call does not target
   * are handed back untouched.
   *
   * Returns false rather than throwing — a BioStar hiccup while clearing one
   * remark must never abort a roster sync.
   */
  async clearUserCustomField(
    userId: string,
    fieldName: string,
    token: string,
    sessionId: string,
  ): Promise<boolean> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'bs-session-id': sessionId,
      accept: 'application/json',
    };
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

    try {
      const current = await axios.get(
        `${this.apiBaseUrl}/api/users/${encodeURIComponent(userId)}`,
        { headers, httpsAgent, timeout: 30000 },
      );

      const user = (current.data?.User ?? current.data) as Record<
        string,
        unknown
      >;
      const fields = user?.user_custom_fields;
      if (!Array.isArray(fields)) {
        this.logger.warn(
          `[Biostar] User ${userId} returned no user_custom_fields array; nothing to clear`,
        );
        return false;
      }

      const target = fields.find(
        (entry) =>
          (entry as { custom_field?: { name?: string } })?.custom_field
            ?.name === fieldName,
      );
      // Already absent or already blank — the desired end state.
      //
      // A field this code has ALREADY cleared comes back from the live server
      // with no `item` key at all (observed 2026-09-10: the entry is just
      // `{ user_id, custom_field, size: "0" }`). So `item === ''` alone never
      // matches our own successful clear, and every later run re-issued a PUT
      // that could not change anything. `== null` covers both the missing key
      // and an explicit null.
      const item = (target as { item?: unknown } | undefined)?.item;
      if (!target || item === '' || item == null) {
        return true;
      }

      const cleared = fields.map((entry) =>
        (entry as { custom_field?: { name?: string } })?.custom_field?.name ===
        fieldName
          ? { ...(entry as Record<string, unknown>), item: '' }
          : entry,
      );

      const putResponse = await axios.put(
        `${this.apiBaseUrl}/api/users/${encodeURIComponent(userId)}`,
        { User: { user_custom_fields: cleared } },
        { headers, httpsAgent, timeout: 30000 },
      );

      // BioStar answers HTTP 200 with a non-zero Response.code when it refuses
      // a write, so a 2xx alone proves nothing. Discarding this response is how
      // a refused clear used to be recorded as success: the caller then reset
      // `remarks_clear_pending` and the drift became permanent and invisible.
      //
      // Only an explicit non-zero code counts as a refusal. A 2xx carrying no
      // Response envelope stays a success — Suprema does not document a code
      // vocabulary for the single-user PUT, so demanding one would break this
      // against a server that simply does not send it.
      //
      // Compared via String(): Suprema's examples show "0" as a string, but we
      // have never captured a real response from this deployment, and a
      // numeric 0 must not read as failure.
      const responseCode = putResponse?.data?.Response?.code;
      if (responseCode !== undefined && String(responseCode) !== '0') {
        this.logger.warn(
          `[Biostar] Refused to clear ${fieldName} for user ${userId}: ` +
            `Response.code=${String(responseCode)}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      // BioStar does not hold this user, so there is no remark to clear and a
      // retry could never succeed. Measured 2026-09-25: an archived student is
      // never sent to BioStar, and GET answers 400 with Response.code "201"
      // ("User can not be found with id").
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const code = String(error.response?.data?.Response?.code ?? '');
        if (status === 404 || (status === 400 && code === '201')) {
          return true;
        }
      }
      const message = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : ((error as Error)?.message ?? String(error));
      this.logger.warn(
        `[Biostar] Failed to clear ${fieldName} for user ${userId}: ${message}`,
      );
      return false;
    }
  }

  async getApiToken(): Promise<{ token: string; sessionId: string }> {
    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/api/login`,
        {
          User: this.apiCredentials,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          httpsAgent: new https.Agent({
            rejectUnauthorized: false,
          }),
        },
      );

      const sessionId = response.headers['bs-session-id'];
      const token = response.data.token;

      if (!sessionId) {
        throw new BadRequestException({
          message: 'BIOSTAR API Authentication Failed',
          details: 'No session ID received from BIOSTAR API',
          biostarMessage: response.data?.Response?.message,
          step: 'authentication',
        });
      }

      return { token, sessionId };
    } catch (error) {
      this.logger.error('BIOSTAR API Authentication Failed:', error);

      if (axios.isAxiosError(error)) {
        throw new BadRequestException({
          message: 'BIOSTAR API Authentication Failed',
          details: error.response?.data || error.message,
          biostarMessage: error.response?.data?.Response?.message,
          step: 'authentication',
          statusCode: error.response?.status || 500,
        });
      }

      throw new BadRequestException({
        message: 'BIOSTAR API Authentication Failed',
        details: 'Unable to connect to BIOSTAR API',
        step: 'authentication',
      });
    }
  }

  /**
   * Fetches one user's detail and reports WHY it came back empty.
   *
   * `definitive` is the whole point. A `400`/`404` means BioStar looked and
   * genuinely does not have this user; anything else — a timeout, a `5xx`, a
   * `429` that outlived its retries — means we simply do not know. Two callers
   * have to act on opposite sides of that line:
   *
   *   - `sweepUncheckedRemarks` must stamp `remarks_checked_at` for a user
   *     BioStar does not have. Without that the sweep re-checks the same rows
   *     on every run forever and never drains, which is what it was built to do.
   *   - `resolveCsn` must let a brand-new student through with an empty `csn`.
   *     There is no card to blank on a user BioStar has never seen, and
   *     dropping the row instead deadlocks them: they cannot be enrolled
   *     because they are not already enrolled.
   *
   * Collapsing both into `null` is what made those two bugs possible, so the
   * distinction lives here rather than being re-derived at each call site.
   */
  async fetchBiostarUserDetail(
    userId: string,
    token: string,
    sessionId: string,
    maxRetries = 3,
    rateLimitTracker?: { count: number },
  ): Promise<{
    detail: Record<string, unknown> | null;
    status: number | null;
    definitive: boolean;
  }> {
    let lastStatus: number | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await axios.get(
          `${this.apiBaseUrl}/api/users/${userId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'bs-session-id': sessionId,
              accept: 'application/json',
            },
            httpsAgent: new https.Agent({
              rejectUnauthorized: false,
            }),
            timeout: 30000,
          },
        );

        const data = response.data;
        // A busy BioStar says nothing about this person. Reading its reply as
        // the detail meant "no card, no photo": a blank card could go out and a
        // stored photo could be erased. Retried, then reported as no answer.
        if (!data?.User && isBiostarErrorReply(data)) {
          lastStatus = response.status ?? 200;
          if (attempt < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
            continue;
          }
          this.logger.warn(
            `[Dasma Biostar] BioStar gave no answer for user ${userId} after ${attempt + 1} attempt(s): ${JSON.stringify(data?.Response ?? null)}`,
          );
          return { detail: null, status: lastStatus, definitive: false };
        }
        const user = data?.User ?? data;
        return {
          detail: (user && typeof user === 'object' ? user : {}) as Record<
            string,
            unknown
          >,
          status: response.status ?? 200,
          definitive: true,
        };
      } catch (err) {
        const status = axios.isAxiosError(err)
          ? (err.response?.status ?? null)
          : null;
        lastStatus = status;
        const isRetryable =
          status === 429 ||
          (status != null && status >= 500) ||
          err?.code === 'ECONNRESET' ||
          err?.code === 'ETIMEDOUT';

        if (status === 429 && rateLimitTracker) {
          rateLimitTracker.count++;
        }

        if (isRetryable && attempt < maxRetries - 1) {
          const baseDelay = status === 429 ? 5000 : 1000;
          const maxDelay = status === 429 ? 30000 : 16000;
          const delay = Math.min(
            baseDelay * 2 ** attempt + Math.random() * 1000,
            maxDelay,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // Only an explicit "no such user" is an answer. Everything else,
        // retries included, leaves the question open.
        const definitive = status === 400 || status === 404;
        // "No such user" is the ordinary answer for everyone not enrolled yet
        // — 20,000 new students printed 40,000 lines per sync. Callers count
        // those; only a failure nobody can explain is worth a line, and one
        // line, not the two a second logger argument prints.
        if (!definitive) {
          this.logger.warn(
            `[Dasma Biostar] Detail fetch failed for user ${userId} after ${attempt + 1} attempt(s), status ${status ?? 'none'}: ${
              axios.isAxiosError(err) ? err.message : String(err)
            }`,
          );
        }
        return { detail: null, status, definitive };
      }
    }

    return { detail: null, status: lastStatus, definitive: false };
  }

  /**
   * Back-compatible wrapper: the detail, or null for any kind of failure.
   * Callers that genuinely cannot act on the difference keep using this.
   */
  async fetchBiostarUserDetailWithRetry(
    userId: string,
    token: string,
    sessionId: string,
    maxRetries = 3,
    rateLimitTracker?: { count: number },
  ): Promise<Record<string, unknown> | null> {
    const { detail } = await this.fetchBiostarUserDetail(
      userId,
      token,
      sessionId,
      maxRetries,
      rateLimitTracker,
    );
    return detail;
  }

  /**
   * Every BioStar user's card count, read from the user list in one pass.
   *
   * The list already carries `card_count`, 500 users a page, so 20,000 users
   * cost 40 requests instead of one detail request each. Returns null when
   * the list cannot be read in full — a failed page, or fewer rows than
   * BioStar says it holds — because a partial map would call a listed user
   * "not in BioStar", and the caller must then fall back to asking per user.
   */
  async listUserCardCounts(
    token: string,
    sessionId: string,
  ): Promise<CardDirectory | null> {
    const pageSize = 500;
    const counts = new Map<string, number>();
    try {
      for (let offset = 0; ; offset += pageSize) {
        const response = await axios.get(`${this.apiBaseUrl}/api/users`, {
          params: { limit: pageSize, offset, order_by: 'name:true' },
          headers: {
            Authorization: `Bearer ${token}`,
            'bs-session-id': sessionId,
            accept: 'application/json',
          },
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          timeout: 120000,
        });
        const collection = response.data?.UserCollection;
        // No list is no directory: reading it as zero users would mark every
        // card-holder card-less and let a blank card through.
        if (!collection) {
          this.logger.warn(
            `[Dasma Biostar] BioStar returned no user list (${JSON.stringify(response.data?.Response ?? null)}); card lookups fall back to one request per user`,
          );
          return null;
        }
        const rows = (collection.rows ?? []) as Record<string, unknown>[];
        const total = parseInt(String(collection.total ?? 0), 10) || 0;
        for (const row of rows) {
          if (row.user_id == null) continue;
          counts.set(
            String(row.user_id),
            parseInt(String(row.card_count ?? 0), 10) || 0,
          );
        }
        if (rows.length === 0 || offset + pageSize >= total) {
          const complete = counts.size >= total;
          if (!complete) {
            this.logger.warn(
              `[Dasma Biostar] The user list held ${counts.size} distinct users of the ${total} BioStar reports; the missing ones are looked up one by one`,
            );
          }
          return { counts, complete };
        }
      }
    } catch (error) {
      this.logger.warn(
        `[Dasma Biostar] Could not read the user list; card lookups fall back to one request per user: ${
          (error as Error)?.message ?? String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * user_ids whose photo was changed between `since` and `until`, read from
   * BioStar's own audit log in one paged query.
   *
   * Measured on the sandbox 2026-09-23: a photo uploaded through the admin
   * app or the API is logged under the user menu with CONTENT containing
   * `audit.user.photo` and TARGET `Name(user_id)`. Returns null when the log
   * cannot be read, so the caller keeps its list-based signals alone.
   */
  async listAuditPhotoChanges(
    token: string,
    sessionId: string,
    since: Date,
    until: Date,
  ): Promise<Set<string> | null> {
    const pageSize = 500;
    // The format BioStar accepted in the live probe: two fraction digits.
    const asBiostarDate = (d: Date) =>
      d.toISOString().replace(/\.\d{3}Z$/, '.00Z');
    const ids = new Set<string>();
    try {
      for (let offset = 0; ; offset += pageSize) {
        const response = await axios.post(
          `${this.apiBaseUrl}/api/audit/search`,
          {
            Query: {
              offset,
              limit: pageSize,
              conditions: [
                { column: 'MENU', operator: 0, values: ['user'] },
                {
                  column: 'DATE',
                  operator: 3,
                  values: [asBiostarDate(since), asBiostarDate(until)],
                },
              ],
              total: false,
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              'bs-session-id': sessionId,
              accept: 'application/json',
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 120000,
          },
        );
        if (isBiostarErrorReply(response.data)) {
          this.logger.warn(
            `[Dasma Biostar] BioStar did not answer the audit search (${JSON.stringify(response.data?.Response ?? null)}); photo replacements wait for the next run`,
          );
          return null;
        }
        const rows = (response.data?.AuditCollection?.rows ?? []) as Record<
          string,
          unknown
        >[];
        for (const row of rows) {
          const content = String(row.CONTENT ?? '').split('|');
          if (!content.includes('audit.user.photo')) continue;
          const id = /\(([^()]+)\)\s*$/.exec(String(row.TARGET ?? ''))?.[1];
          if (id) ids.add(id);
        }
        if (rows.length < pageSize) return ids;
      }
    } catch (error) {
      this.logger.warn(
        `[Dasma Biostar] Could not read the audit log; photo replacements wait for the list signals: ${
          (error as Error)?.message ?? String(error)
        }`,
      );
      return null;
    }
  }

  getApiBaseUrl(): string {
    return this.apiBaseUrl;
  }
}
