import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { PdsApiError } from './pds.errors';
import { AllConfigType } from '../config/config.type';

/**
 * Account view from PDS admin API.
 */
export interface AccountView {
  did: string;
  handle: string;
  email?: string;
  indexedAt?: string;
  invitedBy?: { did: string };
  invites?: {
    code: string;
    available: number;
    disabled: boolean;
    forAccount: string;
    createdBy: string;
    createdAt: string;
    uses: { usedBy: string; usedAt: string }[];
  }[];
  invitesDisabled?: boolean;
  emailConfirmedAt?: string;
  inviteNote?: string;
  deactivatedAt?: string;
  threatSignatures?: { property: string; value: string }[];
}

/**
 * Response from PDS account creation.
 */
export interface CreateAccountResponse {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

/**
 * Response from PDS session creation.
 */
export interface CreateSessionResponse {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

/**
 * Service for interacting with the PDS (Personal Data Server) API.
 *
 * Handles account creation, session management, and handle availability checks.
 * Includes exponential backoff retry logic for transient failures.
 */
@Injectable()
export class PdsAccountService {
  private readonly logger = new Logger(PdsAccountService.name);
  private readonly pdsUrl: string;
  private readonly adminPassword: string;

  /** Maximum number of retry attempts */
  private readonly maxRetries = 3;

  /** Base delay in milliseconds for exponential backoff */
  private readonly baseDelay = 1000;

  /** Service invite code for custodial account creation */
  private readonly inviteCode: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {
    this.pdsUrl = this.configService.get('pds.url', { infer: true }) || '';
    this.adminPassword =
      this.configService.get('pds.adminPassword', { infer: true }) || '';
    this.inviteCode =
      this.configService.get('pds.inviteCode', { infer: true }) || '';

    if (!this.pdsUrl) {
      this.logger.warn(
        'PDS_URL is not configured - PDS account operations will fail',
      );
    }
  }

  /**
   * Create a new account on the PDS.
   *
   * @param params - Account creation parameters
   * @returns The created account details including tokens
   * @throws PdsApiError if account creation fails
   */
  async createAccount(params: {
    email: string;
    handle: string;
    password: string;
  }): Promise<CreateAccountResponse> {
    const url = `${this.pdsUrl}/xrpc/com.atproto.server.createAccount`;

    return this.withRetry(async () => {
      // Build request body, including invite code if configured
      const body: Record<string, string> = {
        email: params.email,
        handle: params.handle,
        password: params.password,
      };

      if (this.inviteCode) {
        body.inviteCode = this.inviteCode;
      }

      const response = await firstValueFrom(
        this.httpService.post(url, body, {
          headers: this.getCreateAccountHeaders(),
        }),
      );

      return {
        did: response.data.did,
        handle: response.data.handle,
        accessJwt: response.data.accessJwt,
        refreshJwt: response.data.refreshJwt,
      };
    });
  }

  /**
   * Create a session (login) on the PDS.
   *
   * @param identifier - Handle or DID
   * @param password - Account password
   * @returns Session details including tokens
   * @throws PdsApiError if login fails
   */
  async createSession(
    identifier: string,
    password: string,
  ): Promise<CreateSessionResponse> {
    const url = `${this.pdsUrl}/xrpc/com.atproto.server.createSession`;

    return this.withRetry(async () => {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            identifier,
            password,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return {
        did: response.data.did,
        handle: response.data.handle,
        accessJwt: response.data.accessJwt,
        refreshJwt: response.data.refreshJwt,
      };
    });
  }

  /**
   * Check if a handle is available on the PDS.
   *
   * @param handle - The handle to check
   * @returns true if available (not found), false if taken
   * @throws PdsApiError if the request fails for reasons other than handle not found
   */
  async isHandleAvailable(handle: string): Promise<boolean> {
    const url = `${this.pdsUrl}/xrpc/com.atproto.identity.resolveHandle`;

    try {
      await firstValueFrom(
        this.httpService.get(url, {
          params: { handle },
        }),
      );

      // Handle resolved successfully - it exists
      return false;
    } catch (error) {
      if (this.isAxiosError(error)) {
        // Only treat as "handle available" if it's a 400 with specific AT Protocol
        // error indicating the handle could not be resolved
        if (error.response?.status === 400) {
          const data = error.response?.data as
            | { error?: string; message?: string }
            | undefined;

          // AT Protocol returns "InvalidRequest" with message about resolution failure
          // when a handle doesn't exist. Other 400 errors (like InvalidHandle for
          // malformed input) should be thrown.
          if (
            data?.error === 'InvalidRequest' &&
            data?.message &&
            (data.message.toLowerCase().includes('unable to resolve') ||
              data.message.toLowerCase().includes('could not resolve'))
          ) {
            return true;
          }
        }
      }

      // Re-throw all other errors
      throw this.mapToPdsApiError(error);
    }
  }

  /**
   * Get account info by DID using the admin API.
   *
   * @param did - The DID of the account
   * @returns The account info, or null if not found
   * @throws PdsApiError if the request fails (except for NotFound)
   */
  async getAccountInfo(did: string): Promise<AccountView | null> {
    const url = `${this.pdsUrl}/xrpc/com.atproto.admin.getAccountInfo`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: { did },
          headers: {
            Authorization: this.getBasicAuthHeader(),
          },
        }),
      );
      return response.data as AccountView;
    } catch (error) {
      // Return null for "not found" errors
      if (this.isAxiosError(error) && error.response?.status === 400) {
        const data = error.response?.data as { error?: string } | undefined;
        if (data?.error === 'NotFound') {
          return null;
        }
      }
      throw this.mapToPdsApiError(error);
    }
  }

  /**
   * List all repos (accounts) on the PDS.
   *
   * @returns Array of DIDs
   */
  private async listAllRepoDids(): Promise<string[]> {
    const url = `${this.pdsUrl}/xrpc/com.atproto.sync.listRepos`;
    const dids: string[] = [];
    let cursor: string | undefined;

    do {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: { limit: 100, cursor },
          headers: {
            Authorization: this.getBasicAuthHeader(),
          },
        }),
      );

      const repos = response.data?.repos as { did: string }[] | undefined;
      if (repos) {
        dids.push(...repos.map((r) => r.did));
      }
      cursor = response.data?.cursor;
    } while (cursor);

    return dids;
  }

  /**
   * Search for an account by email using the admin API.
   *
   * First tries com.atproto.admin.searchAccounts (available on ozone/moderation services).
   * Falls back to iterating through all accounts if that endpoint isn't available.
   *
   * @param email - The email to search for
   * @returns The account if found, or null if not found
   * @throws PdsApiError if the request fails
   */
  async searchAccountsByEmail(email: string): Promise<AccountView | null> {
    // First try the dedicated search endpoint (may not be available on all PDS)
    try {
      const url = `${this.pdsUrl}/xrpc/com.atproto.admin.searchAccounts`;
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: { email },
          headers: {
            Authorization: this.getBasicAuthHeader(),
          },
        }),
      );

      const accounts = response.data?.accounts as AccountView[] | undefined;
      return accounts && accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      // If searchAccounts isn't available, fall back to iteration
      if (this.isAxiosError(error)) {
        const data = error.response?.data as { message?: string } | undefined;
        if (data?.message?.includes('No service configured')) {
          this.logger.debug(
            'searchAccounts not available, falling back to iteration',
          );
          return this.findAccountByEmailViaIteration(email);
        }
      }
      throw this.mapToPdsApiError(error);
    }
  }

  /**
   * Find an account by email by iterating through all accounts.
   * Used as fallback when com.atproto.admin.searchAccounts isn't available.
   */
  private async findAccountByEmailViaIteration(
    email: string,
  ): Promise<AccountView | null> {
    const normalizedEmail = email.toLowerCase();
    const dids = await this.listAllRepoDids();

    for (const did of dids) {
      try {
        const account = await this.getAccountInfo(did);
        if (account?.email?.toLowerCase() === normalizedEmail) {
          return account;
        }
      } catch (error) {
        // Log but continue - one failed lookup shouldn't stop the search
        this.logger.warn(`Failed to get account info for ${did}: ${error}`);
      }
    }

    return null;
  }

  /**
   * Update an account's password using the admin API.
   *
   * @param did - The DID of the account to update
   * @param newPassword - The new password to set
   * @throws PdsApiError if the request fails
   */
  async adminUpdateAccountPassword(
    did: string,
    newPassword: string,
  ): Promise<void> {
    const url = `${this.pdsUrl}/xrpc/com.atproto.admin.updateAccountPassword`;

    return this.withRetry(async () => {
      await firstValueFrom(
        this.httpService.post(
          url,
          {
            did,
            password: newPassword,
          },
          {
            headers: {
              Authorization: this.getBasicAuthHeader(),
              'Content-Type': 'application/json',
            },
          },
        ),
      );
    });
  }

  /**
   * Request a password reset email for an account.
   * This is a public endpoint and does not require admin authentication.
   *
   * @param email - The email address to send the reset link to
   * @throws PdsApiError if the request fails (network errors, etc.)
   */
  async requestPasswordReset(email: string): Promise<void> {
    const url = `${this.pdsUrl}/xrpc/com.atproto.server.requestPasswordReset`;

    return this.withRetry(async () => {
      await firstValueFrom(
        this.httpService.post(
          url,
          { email },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );
    });
  }

  /**
   * Execute an operation with exponential backoff retry.
   *
   * Retries on:
   * - 5xx server errors
   * - 429 rate limit errors
   * - Network errors
   *
   * Does NOT retry on:
   * - 4xx client errors (except 429)
   *
   * @param operation - The async operation to execute
   * @returns The result of the operation
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        if (!this.shouldRetry(error)) {
          throw this.mapToPdsApiError(error);
        }

        // Calculate delay with exponential backoff
        const delay = this.baseDelay * Math.pow(2, attempt);
        this.logger.warn(
          `PDS request failed (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${delay}ms`,
          { error: lastError.message },
        );

        await this.sleep(delay);
      }
    }

    // All retries exhausted
    this.logger.error(
      `PDS request failed permanently after ${this.maxRetries} attempts`,
      { error: lastError?.message },
    );
    throw this.mapToPdsApiError(lastError);
  }

  /**
   * Determine if an error should trigger a retry.
   *
   * Only retries on:
   * - Specific network errors (ECONNREFUSED, ECONNRESET, ETIMEDOUT, ENOTFOUND)
   * - AxiosError with no response (network failure)
   * - 5xx server errors
   * - 429 rate limit errors
   *
   * Does NOT retry on programming errors (TypeError, ReferenceError, etc.)
   */
  private shouldRetry(error: unknown): boolean {
    if (!this.isAxiosError(error)) {
      // Only retry on specific network-related errors, not programming errors
      if (error instanceof Error) {
        const networkErrorCodes = [
          'ECONNREFUSED',
          'ECONNRESET',
          'ETIMEDOUT',
          'ENOTFOUND',
        ];
        const code = (error as NodeJS.ErrnoException).code;
        if (code && networkErrorCodes.includes(code)) {
          return true;
        }
      }
      // Don't retry unknown error types - they're likely programming errors
      return false;
    }

    const status = error.response?.status;

    // No response (network error) - retry
    if (!status) {
      return true;
    }

    // 5xx server errors - retry
    if (status >= 500) {
      return true;
    }

    // 429 rate limit - retry
    if (status === 429) {
      return true;
    }

    // 4xx client errors - don't retry
    return false;
  }

  /**
   * Map an error to a PdsApiError.
   */
  private mapToPdsApiError(error: unknown): PdsApiError {
    if (this.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data as
        | { error?: string; message?: string }
        | undefined;
      const atError = data?.error;
      const message = data?.message || error.message;

      return new PdsApiError(message, status, atError);
    }

    if (error instanceof Error) {
      return new PdsApiError(error.message);
    }

    return new PdsApiError(String(error));
  }

  /**
   * Type guard for AxiosError.
   */
  private isAxiosError(error: unknown): error is AxiosError {
    return (
      error !== null &&
      typeof error === 'object' &&
      'isAxiosError' in error &&
      (error as AxiosError).isAxiosError === true
    );
  }

  /**
   * Get headers for createAccount requests.
   * Note: Admin auth is NOT used for account creation - only the invite code in the request body.
   * Admin auth is only for admin-level APIs like createInviteCode.
   */
  private getCreateAccountHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get Basic auth header for admin operations.
   *
   * @todo Used for admin-level APIs like createInviteCode. Will be used when
   *       we implement automated invite code rotation or admin account management.
   */
  private getBasicAuthHeader(): string {
    const credentials = Buffer.from(`admin:${this.adminPassword}`).toString(
      'base64',
    );
    return `Basic ${credentials}`;
  }

  /**
   * Sleep for a specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
