import { OAuthLinkHeaderInterceptor } from './oauth-link-header.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('OAuthLinkHeaderInterceptor', () => {
  let interceptor: OAuthLinkHeaderInterceptor;
  let mockSetHeader: jest.Mock;
  let mockContext: ExecutionContext;
  let mockCallHandler: CallHandler;

  beforeEach(() => {
    interceptor = new OAuthLinkHeaderInterceptor();
    mockSetHeader = jest.fn();

    mockContext = {
      switchToHttp: () => ({
        getResponse: () => ({
          setHeader: mockSetHeader,
        }),
        getRequest: () => ({}),
      }),
      getClass: () => null,
      getHandler: () => null,
      getArgs: () => [],
      getArgByIndex: () => null,
      switchToRpc: () => null,
      switchToWs: () => null,
      getType: () => 'http',
    } as unknown as ExecutionContext;
  });

  function setupHandler(body: any): CallHandler {
    return { handle: () => of(body) };
  }

  it('should set X-Needs-OAuth-Link header when response has needsOAuthLink: true', (done) => {
    mockCallHandler = setupHandler({
      needsOAuthLink: true,
      error: 'session expired',
    });

    interceptor.intercept(mockContext, mockCallHandler).subscribe(() => {
      expect(mockSetHeader).toHaveBeenCalledWith('X-Needs-OAuth-Link', 'true');
      done();
    });
  });

  it('should NOT set header when response has needsOAuthLink: false', (done) => {
    mockCallHandler = setupHandler({ needsOAuthLink: false, data: 'ok' });

    interceptor.intercept(mockContext, mockCallHandler).subscribe(() => {
      expect(mockSetHeader).not.toHaveBeenCalled();
      done();
    });
  });

  it('should NOT set header when response has no needsOAuthLink property', (done) => {
    mockCallHandler = setupHandler({ data: 'some response' });

    interceptor.intercept(mockContext, mockCallHandler).subscribe(() => {
      expect(mockSetHeader).not.toHaveBeenCalled();
      done();
    });
  });

  it('should set header when needsOAuthLink: true is nested one level deep', (done) => {
    mockCallHandler = setupHandler({ data: { needsOAuthLink: true } });

    interceptor.intercept(mockContext, mockCallHandler).subscribe(() => {
      expect(mockSetHeader).toHaveBeenCalledWith('X-Needs-OAuth-Link', 'true');
      done();
    });
  });

  it('should NOT error on null response body', (done) => {
    mockCallHandler = setupHandler(null);

    interceptor.intercept(mockContext, mockCallHandler).subscribe(() => {
      expect(mockSetHeader).not.toHaveBeenCalled();
      done();
    });
  });

  it('should NOT error on string response body', (done) => {
    mockCallHandler = setupHandler('plain text response');

    interceptor.intercept(mockContext, mockCallHandler).subscribe(() => {
      expect(mockSetHeader).not.toHaveBeenCalled();
      done();
    });
  });

  it('should NOT error on array response body', (done) => {
    mockCallHandler = setupHandler([{ id: 1 }, { id: 2 }]);

    interceptor.intercept(mockContext, mockCallHandler).subscribe(() => {
      expect(mockSetHeader).not.toHaveBeenCalled();
      done();
    });
  });

  it('should not modify the response body', (done) => {
    const body = {
      needsOAuthLink: true,
      action: 'error',
      error: 'session expired',
    };
    mockCallHandler = setupHandler(body);

    interceptor.intercept(mockContext, mockCallHandler).subscribe((result) => {
      expect(result).toBe(body);
      done();
    });
  });
});
