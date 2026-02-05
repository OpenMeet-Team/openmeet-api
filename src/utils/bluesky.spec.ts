import { createPlcFallbackFetch } from './bluesky';

describe('createPlcFallbackFetch', () => {
  let mockGlobalFetch: jest.Mock;

  beforeEach(() => {
    mockGlobalFetch = jest.fn();
  });

  it('should return undefined when didPlcUrl is not provided', () => {
    const result = createPlcFallbackFetch(undefined, mockGlobalFetch);
    expect(result).toBeUndefined();
  });

  it('should return undefined when didPlcUrl is empty string', () => {
    const result = createPlcFallbackFetch('', mockGlobalFetch);
    expect(result).toBeUndefined();
  });

  it('should return a fetch function when didPlcUrl is provided', () => {
    const result = createPlcFallbackFetch('http://plc:2582', mockGlobalFetch);
    expect(result).toBeInstanceOf(Function);
  });

  describe('when didPlcUrl is set', () => {
    const privatePlcUrl = 'http://plc:2582';
    let customFetch: typeof globalThis.fetch;

    beforeEach(() => {
      customFetch = createPlcFallbackFetch(privatePlcUrl, mockGlobalFetch)!;
    });

    it('should try private PLC first for plc.directory DID requests', async () => {
      const privateResponse = new Response(
        JSON.stringify({ id: 'did:plc:abc123' }),
        { status: 200 },
      );
      mockGlobalFetch.mockResolvedValueOnce(privateResponse);

      const result = await customFetch('https://plc.directory/did:plc:abc123');

      // Should have called fetch with private PLC URL
      expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
      expect(mockGlobalFetch).toHaveBeenCalledWith(
        'http://plc:2582/did:plc:abc123',
        undefined,
      );
      expect(result).toBe(privateResponse);
    });

    it('should fall back to public plc.directory when private PLC returns 404', async () => {
      const notFoundResponse = new Response('Not Found', { status: 404 });
      const publicResponse = new Response(
        JSON.stringify({ id: 'did:plc:external' }),
        { status: 200 },
      );
      mockGlobalFetch
        .mockResolvedValueOnce(notFoundResponse) // private PLC 404
        .mockResolvedValueOnce(publicResponse); // public PLC success

      const result = await customFetch(
        'https://plc.directory/did:plc:external',
      );

      // Should have called fetch twice: private PLC first, then public
      expect(mockGlobalFetch).toHaveBeenCalledTimes(2);
      expect(mockGlobalFetch).toHaveBeenNthCalledWith(
        1,
        'http://plc:2582/did:plc:external',
        undefined,
      );
      expect(mockGlobalFetch).toHaveBeenNthCalledWith(
        2,
        'https://plc.directory/did:plc:external',
        undefined,
      );
      expect(result).toBe(publicResponse);
    });

    it('should pass through non-plc.directory requests unchanged', async () => {
      const response = new Response('OK', { status: 200 });
      mockGlobalFetch.mockResolvedValueOnce(response);

      const result = await customFetch('https://bsky.social/xrpc/some.method');

      expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
      expect(mockGlobalFetch).toHaveBeenCalledWith(
        'https://bsky.social/xrpc/some.method',
        undefined,
      );
      expect(result).toBe(response);
    });

    it('should pass through plc.directory requests that are not DID lookups', async () => {
      const response = new Response('OK', { status: 200 });
      mockGlobalFetch.mockResolvedValueOnce(response);

      const result = await customFetch(
        'https://plc.directory/.well-known/did.json',
      );

      expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
      expect(mockGlobalFetch).toHaveBeenCalledWith(
        'https://plc.directory/.well-known/did.json',
        undefined,
      );
      expect(result).toBe(response);
    });

    it('should preserve query parameters when redirecting to private PLC', async () => {
      const privateResponse = new Response(
        JSON.stringify({ id: 'did:plc:abc123' }),
        { status: 200 },
      );
      mockGlobalFetch.mockResolvedValueOnce(privateResponse);

      await customFetch('https://plc.directory/did:plc:abc123?foo=bar');

      expect(mockGlobalFetch).toHaveBeenCalledWith(
        'http://plc:2582/did:plc:abc123?foo=bar',
        undefined,
      );
    });

    it('should forward RequestInit options to private PLC', async () => {
      const privateResponse = new Response('OK', { status: 200 });
      mockGlobalFetch.mockResolvedValueOnce(privateResponse);

      const init: RequestInit = {
        method: 'GET',
        headers: { Accept: 'application/json' },
      };

      await customFetch('https://plc.directory/did:plc:abc123', init);

      expect(mockGlobalFetch).toHaveBeenCalledWith(
        'http://plc:2582/did:plc:abc123',
        init,
      );
    });

    it('should handle URL object input', async () => {
      const privateResponse = new Response('OK', { status: 200 });
      mockGlobalFetch.mockResolvedValueOnce(privateResponse);

      const url = new URL('https://plc.directory/did:plc:abc123');
      await customFetch(url);

      expect(mockGlobalFetch).toHaveBeenCalledWith(
        'http://plc:2582/did:plc:abc123',
        undefined,
      );
    });

    it('should handle Request object input', async () => {
      const privateResponse = new Response('OK', { status: 200 });
      mockGlobalFetch.mockResolvedValueOnce(privateResponse);

      const request = new Request('https://plc.directory/did:plc:abc123');
      await customFetch(request);

      expect(mockGlobalFetch).toHaveBeenCalledWith(
        'http://plc:2582/did:plc:abc123',
        undefined,
      );
    });

    it('should fall back to public PLC on non-ok responses other than 404', async () => {
      const errorResponse = new Response('Server Error', { status: 500 });
      const publicResponse = new Response(
        JSON.stringify({ id: 'did:plc:abc123' }),
        { status: 200 },
      );
      mockGlobalFetch
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(publicResponse);

      const result = await customFetch('https://plc.directory/did:plc:abc123');

      // Should fall back on any non-ok response, not just 404
      expect(mockGlobalFetch).toHaveBeenCalledTimes(2);
      expect(result).toBe(publicResponse);
    });
  });
});
