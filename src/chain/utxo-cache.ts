// Two-layer UTXO cache: L1 in-memory Map + L2 Redis
// BigInt-safe serialization for lovelace/asset values

import type { FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';

import type { ChainConfig } from './config.js';
import type { CachedUtxo } from './types.js';

// ---------------------------------------------------------------------------
// BigInt serialization helpers
// ---------------------------------------------------------------------------

/**
 * Serialize data containing bigint values to JSON.
 * BigInt values are encoded as `"123n"` strings.
 */
export function serializeWithBigInt(data: unknown): string {
  return JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? value.toString() + 'n' : (value as unknown)
  );
}

/**
 * Deserialize JSON that may contain bigint-encoded strings.
 * Strings matching `/^\d+n$/` are parsed back to BigInt.
 */
export function deserializeWithBigInt(json: string): unknown {
  return JSON.parse(json, (_key, value) =>
    typeof value === 'string' && /^\d+n$/.test(value)
      ? BigInt(value.slice(0, -1))
      : (value as unknown)
  );
}

// ---------------------------------------------------------------------------
// L1 cache entry
// ---------------------------------------------------------------------------

interface L1Entry {
  utxos: CachedUtxo[];
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// UTXO Cache
// ---------------------------------------------------------------------------

/**
 * Two-layer UTXO cache.
 *
 * - **L1 (in-memory Map):** Fastest reads, expires via timestamp check.
 * - **L2 (Redis):** Survives restarts, TTL-based expiry via Redis EX.
 *
 * Read path:  L1 hit -> return | L1 miss -> L2 hit -> warm L1 -> return | miss -> null
 * Write path: Write to both L1 and L2 simultaneously.
 */
export class UtxoCache {
  private readonly l1 = new Map<string, L1Entry>();
  private readonly redis: Redis;
  private readonly ttlMs: number;
  private readonly ttlSeconds: number;
  private readonly logger: FastifyBaseLogger;
  private readonly maxL1Entries: number;

  constructor(options: {
    redis: Redis;
    ttlMs: number;
    logger: FastifyBaseLogger;
    /** Maximum L1 cache entries before eviction (default 10,000). */
    maxL1Entries?: number;
  }) {
    this.redis = options.redis;
    this.ttlMs = options.ttlMs;
    this.ttlSeconds = Math.ceil(options.ttlMs / 1000);
    this.logger = options.logger;
    this.maxL1Entries = options.maxL1Entries ?? 10_000;
  }

  /**
   * Get cached UTXOs for an address.
   * Checks L1 first, then L2. Returns null on miss.
   */
  async get(address: string): Promise<CachedUtxo[] | null> {
    // L1 check
    const l1Entry = this.l1.get(address);
    if (l1Entry) {
      if (Date.now() < l1Entry.expiresAt) {
        this.logger.debug({ address }, 'UTXO cache L1 hit');
        return l1Entry.utxos;
      }
      // Expired - remove stale entry
      this.l1.delete(address);
    }

    // L2 check
    const redisKey = `utxo:${address}`;
    const raw = await this.redis.get(redisKey);
    if (raw !== null) {
      this.logger.debug({ address }, 'UTXO cache L2 hit');
      const utxos = deserializeWithBigInt(raw) as CachedUtxo[];
      // Warm L1
      this.l1.set(address, {
        utxos,
        expiresAt: Date.now() + this.ttlMs,
      });
      this.evictIfOverCap();
      return utxos;
    }

    this.logger.debug({ address }, 'UTXO cache miss');
    return null;
  }

  /**
   * Store UTXOs for an address in both L1 and L2.
   */
  async set(address: string, utxos: CachedUtxo[]): Promise<void> {
    // L1 write
    this.l1.set(address, {
      utxos,
      expiresAt: Date.now() + this.ttlMs,
    });
    this.evictIfOverCap();

    // L2 write
    const redisKey = `utxo:${address}`;
    const serialized = serializeWithBigInt(utxos);
    await this.redis.set(redisKey, serialized, 'EX', this.ttlSeconds);

    this.logger.debug({ address, count: utxos.length }, 'UTXO cache set');
  }

  /**
   * Evict the oldest L1 entry (by expiresAt) when the cache exceeds maxL1Entries.
   */
  private evictIfOverCap(): void {
    if (this.l1.size <= this.maxL1Entries) return;

    let oldestKey: string | null = null;
    let oldestExpiry = Infinity;
    for (const [key, entry] of this.l1) {
      if (entry.expiresAt < oldestExpiry) {
        oldestExpiry = entry.expiresAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.l1.delete(oldestKey);
      this.logger.debug(
        { evictedAddress: oldestKey, cacheSize: this.l1.size },
        'L1 cache entry evicted (max size)'
      );
    }
  }

  /**
   * Invalidate cached UTXOs for an address from both layers.
   */
  invalidate(address: string): void {
    this.l1.delete(address);
    // Fire-and-forget L2 deletion
    const redisKey = `utxo:${address}`;
    this.redis.del(redisKey).catch((err: Error) => {
      this.logger.debug({ err: err.message, redisKey }, 'Redis fire-and-forget failed');
    });
    this.logger.debug({ address }, 'UTXO cache invalidated');
  }

  /**
   * Clear all L1 entries. L2 entries expire naturally via TTL.
   */
  invalidateAll(): void {
    this.l1.clear();
    this.logger.debug('UTXO cache L1 cleared');
  }
}

/**
 * Factory to create a UtxoCache from chain config.
 */
export function createUtxoCache(
  redis: Redis,
  config: ChainConfig,
  logger: FastifyBaseLogger
): UtxoCache {
  return new UtxoCache({
    redis,
    ttlMs: config.cache.utxoTtlSeconds * 1000,
    logger,
  });
}
