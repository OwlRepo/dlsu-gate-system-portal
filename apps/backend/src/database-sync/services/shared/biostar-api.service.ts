import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as https from 'https';

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

      this.logger.log(`[Biostar] Cleared ${fieldName} for user ${userId}`);
      return true;
    } catch (error) {
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
      this.logger.log('Attempting to authenticate with BIOSTAR API...');
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

      this.logger.log('Successfully authenticated with BIOSTAR API');
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

        this.logger.warn(
          `[Dasma Biostar] Detail fetch failed for user ${userId} (attempt ${attempt + 1}/${maxRetries}, status ${status ?? 'none'}):`,
          axios.isAxiosError(err) ? err.message : err,
        );
        // Only an explicit "no such user" is an answer. Everything else,
        // retries included, leaves the question open.
        return {
          detail: null,
          status,
          definitive: status === 400 || status === 404,
        };
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

  getApiBaseUrl(): string {
    return this.apiBaseUrl;
  }
}
