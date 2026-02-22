import { createPlcFallbackFetch } from './bluesky';

describe('createPlcFallbackFetch', () => {
  let mockGlobalFetch: jest.Mock;

  beforeEach(() => {
    mockGlobalFetch = jest.fn();
  });

  it('should return undefined when no features are configured', () => {
    const result = createPlcFallbackFetch(undefined, mockGlobalFetch);
    expect(result).toBeUndefined();
  });

  it('should return undefined when didPlcUrl is empty string and no handle domains', () => {
    const result = createPlcFallbackFetch('', mockGlobalFetch);
    expect(result).toBeUndefined();
  });

  it('should return undefined when pdsUrl is set but handleDomains is missing', () => {
    const result = createPlcFallbackFetch(
      undefined,
      mockGlobalFetch,
      'http://localhost:3101',
    );
    expect(result).toBeUndefined();
  });

  it('should return undefined when handleDomains is set but pdsUrl is missing', () => {
    const result = createPlcFallbackFetch(
      undefined,
      mockGlobalFetch,
      undefined,
      '.pds.test',
    );
    expect(result).toBeUndefined();
  });

  it('should return a fetch function when didPlcUrl is provided', () => {
    const result = createPlcFallbackFetch('http://plc:2582', mockGlobalFetch);
    expect(result).toBeInstanceOf(Function);
  });

  it('should return a fetch function when only pdsUrl and handleDomains are set (no didPlcUrl)', () => {
    const result = createPlcFallbackFetch(
      undefined,
      mockGlobalFetch,
      'http://localhost:3101',
      '.pds.test',
    );
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

  describe('handle resolution via PDS', () => {
    const pdsUrl = 'http://localhost:3101';
    const handleDomains = '.pds.test';

    describe('with only handle resolution configured (no didPlcUrl)', () => {
      let customFetch: typeof globalThis.fetch;

      beforeEach(() => {
        customFetch = createPlcFallbackFetch(
          undefined,
          mockGlobalFetch,
          pdsUrl,
          handleDomains,
        )!;
      });

      it('should try normal fetch first for matching handle domains', async () => {
        // Normal fetch succeeds with DID text — PDS should never be called
        const normalResponse = new Response(
          'did:plc:3asjfargakqdqezbcqnhqfdm',
          { status: 200, headers: { 'content-type': 'text/plain' } },
        );
        mockGlobalFetch.mockResolvedValueOnce(normalResponse);

        const result = await customFetch(
          'https://bob-jones-vjwfqo.pds.test/.well-known/atproto-did',
        );

        // Should have called only the normal fetch (the original URL), not PDS
        expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
        expect(mockGlobalFetch).toHaveBeenCalledWith(
          'https://bob-jones-vjwfqo.pds.test/.well-known/atproto-did',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );

        // Should return the normal response directly
        expect(result).toBe(normalResponse);
      });

      it('should fall back to PDS when normal fetch returns non-ok', async () => {
        const failedResponse = new Response('Not Found', { status: 404 });
        const pdsResponse = new Response(
          JSON.stringify({ did: 'did:plc:xyz789' }),
          { status: 200 },
        );
        mockGlobalFetch
          .mockResolvedValueOnce(failedResponse) // normal fetch fails with 404
          .mockResolvedValueOnce(pdsResponse); // PDS resolveHandle succeeds

        const result = await customFetch(
          'https://alice.pds.test/.well-known/atproto-did',
        );

        expect(mockGlobalFetch).toHaveBeenCalledTimes(2);
        // First call: normal fetch (the original URL with abort signal)
        expect(mockGlobalFetch).toHaveBeenNthCalledWith(
          1,
          'https://alice.pds.test/.well-known/atproto-did',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        // Second call: PDS resolveHandle
        expect(mockGlobalFetch).toHaveBeenNthCalledWith(
          2,
          'http://localhost:3101/xrpc/com.atproto.identity.resolveHandle?handle=alice.pds.test',
          undefined,
        );

        // Should return synthetic plain text response with just the DID
        const body = await result.text();
        expect(body).toBe('did:plc:xyz789');
        expect(result.status).toBe(200);
        expect(result.headers.get('content-type')).toBe('text/plain');
      });

      it('should fall back to PDS when normal fetch throws network error', async () => {
        const pdsResponse = new Response(
          JSON.stringify({ did: 'did:plc:fallback456' }),
          { status: 200 },
        );
        mockGlobalFetch
          .mockRejectedValueOnce(new Error('Network error')) // normal fetch throws
          .mockResolvedValueOnce(pdsResponse); // PDS resolveHandle succeeds

        const result = await customFetch(
          'https://user.pds.test/.well-known/atproto-did',
        );

        expect(mockGlobalFetch).toHaveBeenCalledTimes(2);
        // First call: normal fetch attempt
        expect(mockGlobalFetch).toHaveBeenNthCalledWith(
          1,
          'https://user.pds.test/.well-known/atproto-did',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        // Second call: PDS resolveHandle
        expect(mockGlobalFetch).toHaveBeenNthCalledWith(
          2,
          'http://localhost:3101/xrpc/com.atproto.identity.resolveHandle?handle=user.pds.test',
          undefined,
        );

        const body = await result.text();
        expect(body).toBe('did:plc:fallback456');
        expect(result.status).toBe(200);
        expect(result.headers.get('content-type')).toBe('text/plain');
      });

      it('should fall back to PDS when normal fetch returns 500', async () => {
        const serverError = new Response('Internal Server Error', {
          status: 500,
        });
        const pdsResponse = new Response(
          JSON.stringify({ did: 'did:plc:server-err' }),
          { status: 200 },
        );
        mockGlobalFetch
          .mockResolvedValueOnce(serverError) // normal fetch returns 500
          .mockResolvedValueOnce(pdsResponse); // PDS resolveHandle succeeds

        const result = await customFetch(
          'https://user.pds.test/.well-known/atproto-did',
        );

        expect(mockGlobalFetch).toHaveBeenCalledTimes(2);
        const body = await result.text();
        expect(body).toBe('did:plc:server-err');
        expect(result.status).toBe(200);
      });

      it('should return failed normal response when both normal fetch and PDS fail', async () => {
        const failedResponse = new Response('Not Found', { status: 404 });
        mockGlobalFetch
          .mockResolvedValueOnce(failedResponse) // normal fetch returns 404
          .mockRejectedValueOnce(new Error('PDS down')); // PDS also fails

        const result = await customFetch(
          'https://unknown-user.pds.test/.well-known/atproto-did',
        );

        expect(mockGlobalFetch).toHaveBeenCalledTimes(2);
        // Should return the original failed response
        expect(result).toBe(failedResponse);
      });

      it('should return failed normal response when both normal fetch throws and PDS fails', async () => {
        mockGlobalFetch
          .mockRejectedValueOnce(new Error('Network error')) // normal fetch throws
          .mockRejectedValueOnce(new Error('PDS also down')); // PDS also fails

        const result = await customFetch(
          'https://unknown-user.pds.test/.well-known/atproto-did',
        );

        expect(mockGlobalFetch).toHaveBeenCalledTimes(2);
        // When both fail and normal fetch threw, should return a synthetic error response
        expect(result.ok).toBe(false);
      });

      it('should ignore requests for non-matching domains', async () => {
        const response = new Response('OK', { status: 200 });
        mockGlobalFetch.mockResolvedValueOnce(response);

        const result = await customFetch(
          'https://someone.bsky.social/.well-known/atproto-did',
        );

        // Should pass through without trying PDS
        expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
        expect(mockGlobalFetch).toHaveBeenCalledWith(
          'https://someone.bsky.social/.well-known/atproto-did',
          undefined,
        );
        expect(result).toBe(response);
      });

      it('should ignore non .well-known/atproto-did paths even for matching domains', async () => {
        const response = new Response('OK', { status: 200 });
        mockGlobalFetch.mockResolvedValueOnce(response);

        const result = await customFetch(
          'https://bob.pds.test/xrpc/some.method',
        );

        // Should pass through without trying PDS
        expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
        expect(mockGlobalFetch).toHaveBeenCalledWith(
          'https://bob.pds.test/xrpc/some.method',
          undefined,
        );
        expect(result).toBe(response);
      });

      it('should pass through non-intercepted requests unchanged', async () => {
        const response = new Response('OK', { status: 200 });
        mockGlobalFetch.mockResolvedValueOnce(response);

        const result = await customFetch('https://example.com/api/data');

        expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
        expect(mockGlobalFetch).toHaveBeenCalledWith(
          'https://example.com/api/data',
          undefined,
        );
        expect(result).toBe(response);
      });
    });

    describe('with multiple handle domains', () => {
      let customFetch: typeof globalThis.fetch;

      beforeEach(() => {
        customFetch = createPlcFallbackFetch(
          undefined,
          mockGlobalFetch,
          pdsUrl,
          '.pds.test,.pds.local',
        )!;
      });

      it('should try normal fetch first then fall back to PDS for any configured domain', async () => {
        const failedResponse = new Response('Not Found', { status: 404 });
        const pdsResponse = new Response(
          JSON.stringify({ did: 'did:plc:abc123' }),
          { status: 200 },
        );
        mockGlobalFetch
          .mockResolvedValueOnce(failedResponse) // normal fetch fails
          .mockResolvedValueOnce(pdsResponse); // PDS succeeds

        const result = await customFetch(
          'https://user.pds.local/.well-known/atproto-did',
        );

        expect(mockGlobalFetch).toHaveBeenCalledTimes(2);
        // First call: normal fetch
        expect(mockGlobalFetch).toHaveBeenNthCalledWith(
          1,
          'https://user.pds.local/.well-known/atproto-did',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        // Second call: PDS resolveHandle
        expect(mockGlobalFetch).toHaveBeenNthCalledWith(
          2,
          'http://localhost:3101/xrpc/com.atproto.identity.resolveHandle?handle=user.pds.local',
          undefined,
        );
        const body = await result.text();
        expect(body).toBe('did:plc:abc123');
      });

      it('should return normal fetch response when it succeeds for any configured domain', async () => {
        const normalResponse = new Response('did:plc:direct', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
        mockGlobalFetch.mockResolvedValueOnce(normalResponse);

        const result = await customFetch(
          'https://user.pds.local/.well-known/atproto-did',
        );

        expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
        expect(result).toBe(normalResponse);
      });
    });

    describe('with both PLC fallback and handle resolution configured', () => {
      let customFetch: typeof globalThis.fetch;

      beforeEach(() => {
        customFetch = createPlcFallbackFetch(
          'http://plc:2582',
          mockGlobalFetch,
          pdsUrl,
          handleDomains,
        )!;
      });

      it('should try normal fetch first for handle domains, fall back to PDS', async () => {
        const failedResponse = new Response('Not Found', { status: 404 });
        const pdsResponse = new Response(
          JSON.stringify({ did: 'did:plc:both123' }),
          { status: 200 },
        );
        mockGlobalFetch
          .mockResolvedValueOnce(failedResponse) // normal fetch fails
          .mockResolvedValueOnce(pdsResponse); // PDS succeeds

        const result = await customFetch(
          'https://user.pds.test/.well-known/atproto-did',
        );

        expect(mockGlobalFetch).toHaveBeenCalledTimes(2);
        // First call: normal fetch (not PDS, not PLC)
        expect(mockGlobalFetch).toHaveBeenNthCalledWith(
          1,
          'https://user.pds.test/.well-known/atproto-did',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        // Second call: PDS resolveHandle
        expect(mockGlobalFetch).toHaveBeenNthCalledWith(
          2,
          'http://localhost:3101/xrpc/com.atproto.identity.resolveHandle?handle=user.pds.test',
          undefined,
        );
        const body = await result.text();
        expect(body).toBe('did:plc:both123');
      });

      it('should still intercept PLC requests when handle resolution is also configured', async () => {
        const privateResponse = new Response(
          JSON.stringify({ id: 'did:plc:abc123' }),
          { status: 200 },
        );
        mockGlobalFetch.mockResolvedValueOnce(privateResponse);

        const result = await customFetch(
          'https://plc.directory/did:plc:abc123',
        );

        expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
        expect(mockGlobalFetch).toHaveBeenCalledWith(
          'http://plc:2582/did:plc:abc123',
          undefined,
        );
        expect(result).toBe(privateResponse);
      });
    });
  });
});
