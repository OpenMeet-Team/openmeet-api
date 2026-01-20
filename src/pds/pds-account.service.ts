import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { PdsApiError } from './pds.errors';
import { AllConfigType } from '../config/config.type';

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

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {
    this.pdsUrl = this.configService.get('pds.url', { infer: true }) || '';
    this.adminPassword =
      this.configService.get('pds.adminPassword', { infer: true }) || '';
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
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            email: params.email,
            handle: params.handle,
            password: params.password,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: this.getBasicAuthHeader(),
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
    throw this.mapToPdsApiError(lastError);
  }

  /**
   * Determine if an error should trigger a retry.
   */
  private shouldRetry(error: unknown): boolean {
    if (!this.isAxiosError(error)) {
      // Network errors, etc. - retry
      return true;
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
   * Get Basic auth header for admin operations.
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
