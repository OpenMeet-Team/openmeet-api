import { AxiosError, AxiosHeaders } from 'axios';
import {
  isServiceNotConfiguredError,
  SERVICE_NOT_CONFIGURED_PATTERNS,
} from './pds-error-detection';
import { PdsApiError } from './pds.errors';

describe('pds-error-detection', () => {
  describe('isServiceNotConfiguredError', () => {
    describe('should return true for "service not configured" errors', () => {
      it('when message contains "No service configured"', () => {
        const error = new Error(
          'No service configured for com.atproto.admin.searchAccounts',
        );
        expect(isServiceNotConfiguredError(error)).toBe(true);
      });

      it('when message contains "service not configured" (case-insensitive)', () => {
        const error = new Error(
          'Service Not Configured for this endpoint',
        );
        expect(isServiceNotConfiguredError(error)).toBe(true);
      });

      it('when message contains "not implemented"', () => {
        const error = new Error('Method not implemented');
        expect(isServiceNotConfiguredError(error)).toBe(true);
      });

      it('when message contains "not available"', () => {
        const error = new Error('Endpoint not available');
        expect(isServiceNotConfiguredError(error)).toBe(true);
      });

      it('when message contains "method not supported"', () => {
        const error = new Error('Method not supported');
        expect(isServiceNotConfiguredError(error)).toBe(true);
      });
    });

    describe('should return true for HTTP 501 status code', () => {
      it('when PdsApiError has statusCode 501', () => {
        const error = new PdsApiError('Some random message', 501);
        expect(isServiceNotConfiguredError(error)).toBe(true);
      });

      it('when AxiosError has status 501', () => {
        const error: AxiosError = {
          isAxiosError: true,
          response: {
            data: { message: 'Unknown error' },
            status: 501,
            statusText: 'Not Implemented',
            headers: {},
            config: { headers: new AxiosHeaders() },
          },
          message: 'Request failed with status code 501',
          name: 'AxiosError',
          config: { headers: new AxiosHeaders() },
          toJSON: () => ({}),
        };
        expect(isServiceNotConfiguredError(error)).toBe(true);
      });
    });

    describe('should return false for unrelated errors', () => {
      it('when message is a different error', () => {
        const error = new Error('Network error');
        expect(isServiceNotConfiguredError(error)).toBe(false);
      });

      it('when message is empty', () => {
        const error = new Error('');
        expect(isServiceNotConfiguredError(error)).toBe(false);
      });

      it('when error is null', () => {
        expect(isServiceNotConfiguredError(null)).toBe(false);
      });

      it('when error is undefined', () => {
        expect(isServiceNotConfiguredError(undefined)).toBe(false);
      });

      it('when error is a string', () => {
        expect(isServiceNotConfiguredError('some error')).toBe(false);
      });

      it('when PdsApiError has different status code (400)', () => {
        const error = new PdsApiError('Invalid request', 400);
        expect(isServiceNotConfiguredError(error)).toBe(false);
      });

      it('when AxiosError has status 400 without matching message', () => {
        const error: AxiosError = {
          isAxiosError: true,
          response: {
            data: { message: 'Invalid parameters' },
            status: 400,
            statusText: 'Bad Request',
            headers: {},
            config: { headers: new AxiosHeaders() },
          },
          message: 'Request failed with status code 400',
          name: 'AxiosError',
          config: { headers: new AxiosHeaders() },
          toJSON: () => ({}),
        };
        expect(isServiceNotConfiguredError(error)).toBe(false);
      });
    });

    describe('should handle AxiosError with message in response data', () => {
      it('when response.data.message contains pattern', () => {
        const error: AxiosError = {
          isAxiosError: true,
          response: {
            data: {
              message:
                'No service configured for com.atproto.admin.searchAccounts',
            },
            status: 400,
            statusText: 'Bad Request',
            headers: {},
            config: { headers: new AxiosHeaders() },
          },
          message: 'Request failed with status code 400',
          name: 'AxiosError',
          config: { headers: new AxiosHeaders() },
          toJSON: () => ({}),
        };
        expect(isServiceNotConfiguredError(error)).toBe(true);
      });

      it('when response.data.error contains pattern', () => {
        const error: AxiosError = {
          isAxiosError: true,
          response: {
            data: {
              error: 'NotImplemented',
              message: 'Some other text',
            },
            status: 400,
            statusText: 'Bad Request',
            headers: {},
            config: { headers: new AxiosHeaders() },
          },
          message: 'Request failed with status code 400',
          name: 'AxiosError',
          config: { headers: new AxiosHeaders() },
          toJSON: () => ({}),
        };
        expect(isServiceNotConfiguredError(error)).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle AxiosError with no response', () => {
        const error: AxiosError = {
          isAxiosError: true,
          message: 'Network Error',
          name: 'AxiosError',
          config: { headers: new AxiosHeaders() },
          toJSON: () => ({}),
        };
        expect(isServiceNotConfiguredError(error)).toBe(false);
      });

      it('should handle AxiosError with null response data', () => {
        const error: AxiosError = {
          isAxiosError: true,
          response: {
            data: null,
            status: 400,
            statusText: 'Bad Request',
            headers: {},
            config: { headers: new AxiosHeaders() },
          },
          message: 'Request failed with status code 400',
          name: 'AxiosError',
          config: { headers: new AxiosHeaders() },
          toJSON: () => ({}),
        };
        expect(isServiceNotConfiguredError(error)).toBe(false);
      });

      it('should be case-insensitive when matching patterns', () => {
        const error1 = new Error('NO SERVICE CONFIGURED');
        const error2 = new Error('no service configured');
        const error3 = new Error('No Service Configured');
        expect(isServiceNotConfiguredError(error1)).toBe(true);
        expect(isServiceNotConfiguredError(error2)).toBe(true);
        expect(isServiceNotConfiguredError(error3)).toBe(true);
      });
    });
  });

  describe('SERVICE_NOT_CONFIGURED_PATTERNS', () => {
    it('should export the patterns array', () => {
      expect(SERVICE_NOT_CONFIGURED_PATTERNS).toBeDefined();
      expect(Array.isArray(SERVICE_NOT_CONFIGURED_PATTERNS)).toBe(true);
      expect(SERVICE_NOT_CONFIGURED_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should include expected patterns', () => {
      expect(SERVICE_NOT_CONFIGURED_PATTERNS).toContain('no service configured');
      expect(SERVICE_NOT_CONFIGURED_PATTERNS).toContain('not implemented');
      expect(SERVICE_NOT_CONFIGURED_PATTERNS).toContain('not available');
    });
  });
});
