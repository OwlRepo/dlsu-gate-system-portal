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
   * The CSV import cannot do this. Updating a remark to a NEW value through
   * `csv_import` works, but an empty cell is ignored rather than applied, so a
   * remark deleted in the DLSU source view stays on the gate screen forever.
   * Suprema documents the per-user update as the way to clear a user field
   * (their profile-photo article clears the photo by sending it empty).
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
      if (!target || (target as { item?: unknown }).item === '') {
        return true;
      }

      const cleared = fields.map((entry) =>
        (entry as { custom_field?: { name?: string } })?.custom_field?.name ===
        fieldName
          ? { ...(entry as Record<string, unknown>), item: '' }
          : entry,
      );

      await axios.put(
        `${this.apiBaseUrl}/api/users/${encodeURIComponent(userId)}`,
        { User: { user_custom_fields: cleared } },
        { headers, httpsAgent, timeout: 30000 },
      );

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

  async fetchBiostarUserDetailWithRetry(
    userId: string,
    token: string,
    sessionId: string,
    maxRetries = 3,
    rateLimitTracker?: { count: number },
  ): Promise<Record<string, unknown> | null> {
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
        return (user && typeof user === 'object' ? user : {}) as Record<
          string,
          unknown
        >;
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : null;
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
        } else {
          this.logger.warn(
            `[Dasma Biostar] Detail fetch failed for user ${userId} (attempt ${attempt + 1}/${maxRetries}):`,
            axios.isAxiosError(err) ? err.message : err,
          );
          return null;
        }
      }
    }
    return null;
  }

  getApiBaseUrl(): string {
    return this.apiBaseUrl;
  }
}
