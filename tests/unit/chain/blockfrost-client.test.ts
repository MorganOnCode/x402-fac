import { BlockfrostServerError } from '@blockfrost/blockfrost-js';
import type { FastifyBaseLogger } from 'fastify';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { withRetry, BlockfrostClient, createBlockfrostClient } from '@/chain/blockfrost-client.js';

// ---- mock BlockFrostAPI (vitest hoists vi.mock to top) ----

vi.mock('@blockfrost/blockfrost-js', async () => {
  const actual = await vi.importActual('@blockfrost/blockfrost-js');
  return {
    ...actual,
    BlockFrostAPI: vi.fn().mockImplementation(() => ({
      blocksLatest: vi.fn(),
      epochsLatestParameters: vi.fn(),
      addressesUtxos: vi.fn(),
    })),
  };
});

// ---- helpers to build mock errors ----

function makeServerError(statusCode: number): BlockfrostServerError {
  return new BlockfrostServerError({
    status_code: statusCode,
    message: `Error ${statusCode}`,
    error: `HTTP ${statusCode}`,
    url: 'https://cardano-preview.blockfrost.io/api/v0/test',
  });
}

function makeNetworkError(code: string): Error & { code: string } {
  const err = new Error(`connect ${code}`) as Error & { code: string };
  err.code = code;
  return err;
}

// ---- mock logger ----

function createMockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    silent: vi.fn(),
    level: 'info',
  } as unknown as FastifyBaseLogger;
}

describe('withRetry', () => {
  let logger: FastifyBaseLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns result immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, 'test-op', logger);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('retries on 429 and succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeServerError(429)).mockResolvedValue('recovered');

    const promise = withRetry(fn, 'test-op', logger);
    // Advance past the 500ms first retry delay
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 server error and succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeServerError(500)).mockResolvedValue('recovered');

    const promise = withRetry(fn, 'test-op', logger);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 502, 503, 504 server errors', async () => {
    for (const code of [502, 503, 504]) {
      vi.restoreAllMocks();
      vi.useFakeTimers();
      const log = createMockLogger();
      const fn = vi.fn().mockRejectedValueOnce(makeServerError(code)).mockResolvedValue('ok');

      const promise = withRetry(fn, 'test-op', log);
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    }
  });

  it('retries on network errors (ECONNREFUSED)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeNetworkError('ECONNREFUSED'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, 'test-op', logger);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on ETIMEDOUT network errors', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeNetworkError('ETIMEDOUT')).mockResolvedValue('ok');

    const promise = withRetry(fn, 'test-op', logger);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses exponential backoff delays: 500ms, 1000ms, 2000ms', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeServerError(429))
      .mockRejectedValueOnce(makeServerError(429))
      .mockRejectedValueOnce(makeServerError(429))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, 'test-op', logger);

    // After 499ms, should still be on attempt 1 retry wait
    await vi.advanceTimersByTimeAsync(499);
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance to 500ms -> triggers retry 1
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    // Advance 999ms more (not enough for 1000ms second delay)
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(2);

    // Advance 1ms more -> triggers retry 2
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);

    // Advance 1999ms (not enough for 2000ms third delay)
    await vi.advanceTimersByTimeAsync(1999);
    expect(fn).toHaveBeenCalledTimes(3);

    // Advance 1ms more -> triggers retry 3
    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('throws ChainRateLimitedError after 3 retries of 429', async () => {
    const fn = vi.fn().mockRejectedValue(makeServerError(429));

    const promise = withRetry(fn, 'getAddressUtxos', logger);

    // Advance through all 3 retry delays: 500 + 1000 + 2000 = 3500ms
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).rejects.toThrow();
    await expect(promise).rejects.toMatchObject({
      code: 'CHAIN_RATE_LIMITED',
    });
    // 1 initial + 3 retries = 4 total attempts
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('throws ChainConnectionError after retries of network errors', async () => {
    const fn = vi.fn().mockRejectedValue(makeNetworkError('ECONNREFUSED'));

    const promise = withRetry(fn, 'getLatestBlock', logger);

    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).rejects.toThrow();
    await expect(promise).rejects.toMatchObject({
      code: 'CHAIN_CONNECTION_ERROR',
    });
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('does NOT retry non-retryable errors (e.g. 400)', async () => {
    const fn = vi.fn().mockRejectedValue(makeServerError(400));

    await expect(withRetry(fn, 'test-op', logger)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does NOT retry 404 errors', async () => {
    const fn = vi.fn().mockRejectedValue(makeServerError(404));

    await expect(withRetry(fn, 'test-op', logger)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('logs warning on each retry with attempt, delay, and label', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeServerError(429)).mockResolvedValue('ok');

    const promise = withRetry(fn, 'getLatestBlock', logger);
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const warnCall = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    // Should include structured data about the retry
    expect(warnCall[0]).toMatchObject({
      attempt: 1,
      delay: 500,
      label: 'getLatestBlock',
    });
  });
});

describe('BlockfrostClient', () => {
  let logger: FastifyBaseLogger;
  let client: BlockfrostClient;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
    client = new BlockfrostClient({
      projectId: 'previewSecretKey123',
      network: 'Preview',
      logger,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('getAddressUtxos', () => {
    it('returns empty array on 404 (unused address)', async () => {
      // Access mock internals
      const { BlockFrostAPI } = await import('@blockfrost/blockfrost-js');
      const mockInstance = (BlockFrostAPI as unknown as ReturnType<typeof vi.fn>).mock.results[0]
        ?.value;
      if (mockInstance) {
        mockInstance.addressesUtxos.mockRejectedValue(makeServerError(404));
      }

      const result = await client.getAddressUtxos('addr_test1unused');
      expect(result).toEqual([]);
    });

    it('retries on 429 and returns result', async () => {
      const { BlockFrostAPI } = await import('@blockfrost/blockfrost-js');
      const mockInstance = (BlockFrostAPI as unknown as ReturnType<typeof vi.fn>).mock.results.at(
        -1
      )?.value;
      if (mockInstance) {
        mockInstance.addressesUtxos
          .mockRejectedValueOnce(makeServerError(429))
          .mockResolvedValue([{ tx_hash: 'abc', tx_index: 0 }]);
      }

      const promise = client.getAddressUtxos('addr_test1used');
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(result).toEqual([{ tx_hash: 'abc', tx_index: 0 }]);
    });
  });

  describe('getLatestBlock', () => {
    it('returns block data on success', async () => {
      const { BlockFrostAPI } = await import('@blockfrost/blockfrost-js');
      const mockInstance = (BlockFrostAPI as unknown as ReturnType<typeof vi.fn>).mock.results.at(
        -1
      )?.value;
      const blockData = { slot: 12345, time: 1234567890, hash: 'abc123' };
      if (mockInstance) {
        mockInstance.blocksLatest.mockResolvedValue(blockData);
      }

      const result = await client.getLatestBlock();
      expect(result).toEqual(blockData);
    });
  });

  describe('getEpochParameters', () => {
    it('returns epoch parameters on success', async () => {
      const { BlockFrostAPI } = await import('@blockfrost/blockfrost-js');
      const mockInstance = (BlockFrostAPI as unknown as ReturnType<typeof vi.fn>).mock.results.at(
        -1
      )?.value;
      const params = { min_fee_a: 44, min_fee_b: 155381 };
      if (mockInstance) {
        mockInstance.epochsLatestParameters.mockResolvedValue(params);
      }

      const result = await client.getEpochParameters();
      expect(result).toEqual(params);
    });
  });
});

describe('createBlockfrostClient', () => {
  it('creates a BlockfrostClient from ChainConfig', () => {
    const logger = createMockLogger();
    const config = {
      network: 'Preview' as const,
      blockfrost: {
        projectId: 'testProjectId',
        tier: 'free' as const,
      },
      facilitator: { seedPhrase: 'test seed' },
      cache: { utxoTtlSeconds: 60 },
      reservation: { ttlSeconds: 120, maxConcurrent: 20 },
      redis: { host: '127.0.0.1', port: 6379 },
    };

    const client = createBlockfrostClient(config, logger);
    expect(client).toBeInstanceOf(BlockfrostClient);
  });
});

describe('API key safety', () => {
  it('does not expose projectId in error messages', async () => {
    const logger = createMockLogger();
    const secretKey = 'previewSuperSecretApiKey999';
    const client = new BlockfrostClient({
      projectId: secretKey,
      network: 'Preview',
      logger,
    });

    // Trigger a rate limit exhaustion
    const { BlockFrostAPI } = await import('@blockfrost/blockfrost-js');
    const mockInstance = (BlockFrostAPI as unknown as ReturnType<typeof vi.fn>).mock.results.at(
      -1
    )?.value;
    if (mockInstance) {
      mockInstance.blocksLatest.mockRejectedValue(makeServerError(429));
    }

    vi.useFakeTimers();
    const promise = client.getLatestBlock();
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    try {
      await promise;
      expect.fail('Expected error');
    } catch (error) {
      const errMsg = (error as Error).message;
      expect(errMsg).not.toContain(secretKey);
    }

    // Check logger calls don't contain the key
    const allLogCalls = [
      ...(logger.warn as ReturnType<typeof vi.fn>).mock.calls,
      ...(logger.info as ReturnType<typeof vi.fn>).mock.calls,
      ...(logger.error as ReturnType<typeof vi.fn>).mock.calls,
    ];
    const logOutput = JSON.stringify(allLogCalls);
    expect(logOutput).not.toContain(secretKey);

    vi.useRealTimers();
  });
});
