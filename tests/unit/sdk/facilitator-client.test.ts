import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { FacilitatorClient } from '@/sdk/facilitator-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FacilitatorClient', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Constructor ----

  describe('constructor', () => {
    it('should strip trailing slash from baseUrl', () => {
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000/' });
      // Trigger a request to verify URL construction
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({
          kinds: [],
          extensions: [],
          signers: {},
        })
      );
      void client.supported();
      expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3000/supported', expect.any(Object));
    });

    it('should use default timeout of 30000ms when not specified', async () => {
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000' });
      // We can't directly check the private field, but we can verify it works
      // by checking that a normal request doesn't time out
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({
          kinds: [],
          extensions: [],
          signers: {},
        })
      );
      const result = await client.supported();
      expect(result).toBeDefined();
    });

    it('should accept custom headers', async () => {
      const client = new FacilitatorClient({
        baseUrl: 'http://localhost:3000',
        headers: { 'X-Custom': 'test-value' },
      });
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({
          kinds: [],
          extensions: [],
          signers: {},
        })
      );
      await client.supported();
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Custom': 'test-value' }),
        })
      );
    });
  });

  // ---- verify() ----

  describe('verify()', () => {
    const verifyRequest = {
      paymentPayload: {
        x402Version: 2 as const,
        scheme: 'exact' as const,
        network: 'cardano:preview',
        payload: {
          transaction: 'SGVsbG8gV29ybGQ=',
          payer: 'addr_test1qz...',
        },
      },
      paymentRequirements: {
        scheme: 'exact' as const,
        network: 'cardano:preview',
        maxAmountRequired: '2000000',
        payTo: 'addr_test1qx...',
        maxTimeoutSeconds: 300,
        asset: 'lovelace',
      },
    };

    it('should send POST to /verify with correct body', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ isValid: true, payer: 'addr_test1qz...' })
      );
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000' });
      await client.verify(verifyRequest);

      expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3000/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verifyRequest),
        signal: expect.any(AbortSignal),
      });
    });

    it('should return parsed VerifyResponse on success', async () => {
      const expected = { isValid: true, payer: 'addr_test1qz...' };
      fetchSpy.mockResolvedValueOnce(mockFetchResponse(expected));
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000' });
      const result = await client.verify(verifyRequest);
      expect(result.isValid).toBe(true);
      expect(result.payer).toBe('addr_test1qz...');
    });

    it('should throw on non-200 response', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({}, 500, 'Internal Server Error'));
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000' });
      await expect(client.verify(verifyRequest)).rejects.toThrow(
        'Facilitator returned 500 Internal Server Error'
      );
    });

    it('should throw on invalid response body (Zod validation failure)', async () => {
      // Missing required isValid field
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ unexpected: 'data' }));
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000' });
      await expect(client.verify(verifyRequest)).rejects.toThrow('Invalid facilitator response');
    });
  });

  // ---- settle() ----

  describe('settle()', () => {
    const settleRequest = {
      transaction: 'SGVsbG8gV29ybGQ=',
      paymentRequirements: {
        scheme: 'exact' as const,
        network: 'cardano:preview',
        maxAmountRequired: '2000000',
        payTo: 'addr_test1qx...',
        maxTimeoutSeconds: 300,
        asset: 'lovelace',
      },
    };

    it('should send POST to /settle with correct body', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ success: true, transaction: 'abc123', network: 'cardano:preview' })
      );
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000' });
      await client.settle(settleRequest);

      expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3000/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settleRequest),
        signal: expect.any(AbortSignal),
      });
    });

    it('should return parsed SettleResponse on success', async () => {
      const expected = { success: true, transaction: 'abc123', network: 'cardano:preview' };
      fetchSpy.mockResolvedValueOnce(mockFetchResponse(expected));
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000' });
      const result = await client.settle(settleRequest);
      expect(result.success).toBe(true);
      expect(result.transaction).toBe('abc123');
    });

    it('should throw on facilitator error', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({}, 503, 'Service Unavailable'));
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000' });
      await expect(client.settle(settleRequest)).rejects.toThrow(
        'Facilitator returned 503 Service Unavailable'
      );
    });
  });

  // ---- status() ----

  describe('status()', () => {
    const statusRequest = {
      transaction: 'a'.repeat(64),
      paymentRequirements: {
        scheme: 'exact' as const,
        network: 'cardano:preview',
        maxAmountRequired: '2000000',
        payTo: 'addr_test1qx...',
        maxTimeoutSeconds: 300,
        asset: 'lovelace',
      },
    };

    it('should send POST to /status with correct body', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ status: 'confirmed', transaction: 'a'.repeat(64) })
      );
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000' });
      await client.status(statusRequest);

      expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3000/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statusRequest),
        signal: expect.any(AbortSignal),
      });
    });

    it('should return parsed StatusResponse on success', async () => {
      const expected = { status: 'confirmed', transaction: 'a'.repeat(64) };
      fetchSpy.mockResolvedValueOnce(mockFetchResponse(expected));
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000' });
      const result = await client.status(statusRequest);
      expect(result.status).toBe('confirmed');
    });
  });

  // ---- supported() ----

  describe('supported()', () => {
    it('should send GET to /supported', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({
          kinds: [{ x402Version: 2, scheme: 'exact', network: 'cardano:preview' }],
          extensions: [],
          signers: { 'cardano:preview': ['addr_test1qz...'] },
        })
      );
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000' });
      await client.supported();

      expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3000/supported', {
        method: 'GET',
        headers: {},
        signal: expect.any(AbortSignal),
      });
    });

    it('should return parsed SupportedResponse on success', async () => {
      const expected = {
        kinds: [{ x402Version: 2, scheme: 'exact', network: 'cardano:preview' }],
        extensions: [],
        signers: { 'cardano:preview': ['addr_test1qz...'] },
      };
      fetchSpy.mockResolvedValueOnce(mockFetchResponse(expected));
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000' });
      const result = await client.supported();
      expect(result.kinds).toHaveLength(1);
      expect(result.kinds[0].x402Version).toBe(2);
      expect(result.signers['cardano:preview']).toEqual(['addr_test1qz...']);
    });

    it('should throw on invalid response', async () => {
      // Missing required signers field
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ kinds: [], extensions: [] }));
      const client = new FacilitatorClient({ baseUrl: 'http://localhost:3000' });
      await expect(client.supported()).rejects.toThrow('Invalid facilitator response');
    });
  });

  // ---- Timeout ----

  describe('timeout', () => {
    it('should throw timeout error when request exceeds timeout', async () => {
      const client = new FacilitatorClient({
        baseUrl: 'http://localhost:3000',
        timeout: 1, // 1ms timeout -- will race against fetch
      });
      fetchSpy.mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (signal) {
              signal.addEventListener('abort', () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
              });
            }
          })
      );

      await expect(client.supported()).rejects.toThrow('timed out');
    });

    it('should respect custom timeout value', async () => {
      const client = new FacilitatorClient({
        baseUrl: 'http://localhost:3000',
        timeout: 50, // 50ms
      });
      fetchSpy.mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (signal) {
              signal.addEventListener('abort', () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
              });
            }
          })
      );

      await expect(client.supported()).rejects.toThrow('timed out after 50ms');
    });
  });
});
