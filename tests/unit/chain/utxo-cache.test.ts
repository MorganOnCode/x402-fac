import type { FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { CachedUtxo } from '@/chain/types.js';
import { UtxoCache, serializeWithBigInt, deserializeWithBigInt } from '@/chain/utxo-cache.js';

// ---------------------------------------------------------------------------
// Mock Redis
// ---------------------------------------------------------------------------

function createMockRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();

  return {
    get: vi.fn(async (key: string): Promise<string | null> => {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    }),
    set: vi.fn(async (key: string, value: string, _ex: string, ttl: number): Promise<'OK'> => {
      store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return 'OK';
    }),
    del: vi.fn(async (key: string): Promise<number> => {
      const had = store.has(key);
      store.delete(key);
      return had ? 1 : 0;
    }),
    _store: store,
  };
}

// ---------------------------------------------------------------------------
// Mock logger
// ---------------------------------------------------------------------------

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
} as unknown as FastifyBaseLogger;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const testAddress = 'addr_test1qz...abc';

const testUtxos: CachedUtxo[] = [
  {
    txHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    outputIndex: 0,
    address: testAddress,
    lovelace: 5_000_000n,
    assets: { '0x.policyId.assetName': 100n },
  },
  {
    txHash: 'def789abc012def789abc012def789abc012def789abc012def789abc012def7',
    outputIndex: 1,
    address: testAddress,
    lovelace: 10_000_000_000n,
    assets: {},
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('serializeWithBigInt / deserializeWithBigInt', () => {
  it('should roundtrip objects containing bigint values', () => {
    const original = {
      name: 'test',
      lovelace: 5_000_000n,
      assets: { token: 999_999_999_999_999n },
      nested: { deep: 42n },
    };
    const json = serializeWithBigInt(original);
    const parsed = deserializeWithBigInt(json);

    expect(parsed).toEqual(original);
  });

  it('should handle zero bigint', () => {
    const original = { value: 0n };
    const parsed = deserializeWithBigInt(serializeWithBigInt(original));
    expect(parsed).toEqual({ value: 0n });
  });

  it('should not convert regular number strings ending with n', () => {
    // A string like "hello" should stay "hello"
    const original = { note: 'transaction' };
    const parsed = deserializeWithBigInt(serializeWithBigInt(original));
    expect(parsed).toEqual({ note: 'transaction' });
  });

  it('should handle very large bigint values (> 2^53)', () => {
    const large = 9_007_199_254_740_993n; // Number.MAX_SAFE_INTEGER + 2
    const parsed = deserializeWithBigInt(serializeWithBigInt({ v: large })) as {
      v: bigint;
    };
    expect(parsed.v).toBe(large);
    expect(typeof parsed.v).toBe('bigint');
  });
});

describe('UtxoCache', () => {
  let cache: UtxoCache;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = createMockRedis();
    cache = new UtxoCache({
      redis: mockRedis as unknown as Redis,
      ttlMs: 60_000,
      logger: mockLogger,
    });
  });

  it('should return null on empty cache (both layers miss)', async () => {
    const result = await cache.get(testAddress);
    expect(result).toBeNull();
    expect(mockRedis.get).toHaveBeenCalledWith(`utxo:${testAddress}`);
  });

  it('should return cached data from L1 after set (no Redis call for second get)', async () => {
    await cache.set(testAddress, testUtxos);

    // Reset mock to track subsequent calls
    mockRedis.get.mockClear();

    const result = await cache.get(testAddress);
    expect(result).toEqual(testUtxos);
    // L1 hit - should NOT call Redis get
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it('should preserve BigInt values through set/get cycle', async () => {
    await cache.set(testAddress, testUtxos);
    const result = await cache.get(testAddress);

    expect(result).not.toBeNull();
    const utxos = result as CachedUtxo[];
    expect(typeof utxos[0].lovelace).toBe('bigint');
    expect(utxos[0].lovelace).toBe(5_000_000n);
    expect(utxos[1].lovelace).toBe(10_000_000_000n);
    expect(typeof utxos[0].assets['0x.policyId.assetName']).toBe('bigint');
    expect(utxos[0].assets['0x.policyId.assetName']).toBe(100n);
  });

  it('should return null after invalidate', async () => {
    await cache.set(testAddress, testUtxos);
    cache.invalidate(testAddress);

    // L1 is cleared, so it should fall through to L2
    // But our mock Redis also had del called, clearing L2
    const result = await cache.get(testAddress);
    expect(result).toBeNull();
  });

  it('should fall through to L2 when L1 entry is expired', async () => {
    // Create cache with very short TTL
    const shortCache = new UtxoCache({
      redis: mockRedis as unknown as Redis,
      ttlMs: 1, // 1ms TTL - will expire almost immediately
      logger: mockLogger,
    });

    await shortCache.set(testAddress, testUtxos);

    // Wait for L1 to expire
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    // L1 should be expired, falls through to L2
    // L2 still has the data (Redis TTL is 1 second minimum from Math.ceil)
    const result = await shortCache.get(testAddress);
    expect(result).not.toBeNull();
    expect(mockRedis.get).toHaveBeenCalledWith(`utxo:${testAddress}`);
    // Verify BigInt survived the L2 roundtrip
    const utxos = result as CachedUtxo[];
    expect(typeof utxos[0].lovelace).toBe('bigint');
    expect(utxos[0].lovelace).toBe(5_000_000n);
  });

  it('should write to both L1 and L2 on set', async () => {
    await cache.set(testAddress, testUtxos);

    expect(mockRedis.set).toHaveBeenCalledWith(
      `utxo:${testAddress}`,
      expect.any(String),
      'EX',
      60 // ttlMs 60000 / 1000
    );
  });

  it('should clear all L1 entries on invalidateAll', async () => {
    await cache.set(testAddress, testUtxos);
    await cache.set('addr_other', testUtxos);

    cache.invalidateAll();
    mockRedis.get.mockClear();

    // Both should miss L1 now
    const r1 = await cache.get(testAddress);
    const r2 = await cache.get('addr_other');

    // L2 still has them
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    // Verify Redis was called (L1 was cleared)
    expect(mockRedis.get).toHaveBeenCalledTimes(2);
  });
});
