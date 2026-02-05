// UTXO reservation system to prevent double-spend during concurrent transactions.
// Locks UTXOs with TTL-based expiry and persists to Redis for crash recovery.

import type { FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';

import type { ChainConfig } from './config.js';
import type { Reservation } from './types.js';

const REDIS_KEY_PREFIX = 'reservation:';

/**
 * UTXO reservation system to prevent double-spend during concurrent transactions.
 *
 * Each UTXO can only be spent in one transaction. When multiple payment requests
 * arrive concurrently, this system locks UTXOs during transaction construction
 * with a configurable TTL (default 120s, ~6 Cardano blocks).
 *
 * Reservations are stored in an in-memory Map for fast access and persisted
 * to Redis (fire-and-forget) for crash recovery via `loadFromRedis()`.
 */
export class UtxoReservation {
  private readonly reservations = new Map<string, Reservation>();
  private readonly redis: Redis;
  private readonly ttlMs: number;
  private readonly maxConcurrent: number;
  private readonly logger: FastifyBaseLogger;

  constructor(options: {
    redis: Redis;
    ttlMs: number;
    maxConcurrent: number;
    logger: FastifyBaseLogger;
  }) {
    this.redis = options.redis;
    this.ttlMs = options.ttlMs;
    this.maxConcurrent = options.maxConcurrent;
    this.logger = options.logger;
  }

  /**
   * Reserve a UTXO for exclusive use during transaction construction.
   *
   * @param utxoRef - UTXO reference in "txHash#outputIndex" format
   * @param requestId - Request ID for tracing/debugging
   * @returns true if reserved successfully, false if already reserved or cap exceeded
   */
  reserve(utxoRef: string, requestId: string): boolean {
    this.cleanExpired();

    // Check if already reserved
    if (this.reservations.has(utxoRef)) {
      this.logger.debug({ utxoRef, requestId }, 'UTXO already reserved');
      return false;
    }

    // Check concurrent cap
    if (this.reservations.size >= this.maxConcurrent) {
      this.logger.debug(
        { utxoRef, requestId, activeCount: this.reservations.size },
        'Max concurrent reservations reached'
      );
      return false;
    }

    const now = Date.now();
    const reservation: Reservation = {
      utxoRef,
      reservedAt: now,
      expiresAt: now + this.ttlMs,
      requestId,
    };

    this.reservations.set(utxoRef, reservation);

    // Fire-and-forget Redis persistence
    const redisKey = `${REDIS_KEY_PREFIX}${utxoRef}`;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this.redis.set(redisKey, JSON.stringify(reservation), 'PX', this.ttlMs).catch(() => {});

    this.logger.debug({ utxoRef, requestId, expiresAt: reservation.expiresAt }, 'UTXO reserved');
    return true;
  }

  /**
   * Release a reservation, making the UTXO immediately available.
   *
   * @param utxoRef - UTXO reference to release
   */
  release(utxoRef: string): void {
    this.reservations.delete(utxoRef);

    // Fire-and-forget Redis deletion
    const redisKey = `${REDIS_KEY_PREFIX}${utxoRef}`;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this.redis.del(redisKey).catch(() => {});

    this.logger.debug({ utxoRef }, 'UTXO reservation released');
  }

  /**
   * Release all reservations matching a given request ID.
   * Used when a transaction fails and all its reserved UTXOs should be freed.
   *
   * @param requestId - Request ID whose reservations should be released
   */
  releaseAll(requestId: string): void {
    for (const [utxoRef, reservation] of this.reservations) {
      if (reservation.requestId === requestId) {
        this.release(utxoRef);
      }
    }
  }

  /**
   * Check if a UTXO is currently reserved.
   * Cleans expired reservations first.
   *
   * @param utxoRef - UTXO reference to check
   * @returns true if actively reserved, false otherwise
   */
  isReserved(utxoRef: string): boolean {
    this.cleanExpired();
    return this.reservations.has(utxoRef);
  }

  /**
   * Get the count of active (non-expired) reservations.
   * Cleans expired reservations first.
   */
  getActiveCount(): number {
    this.cleanExpired();
    return this.reservations.size;
  }

  /**
   * Get the reservation object for a UTXO, if active.
   *
   * @param utxoRef - UTXO reference to look up
   * @returns Reservation object or undefined if not reserved
   */
  getReservation(utxoRef: string): Reservation | undefined {
    return this.reservations.get(utxoRef);
  }

  /**
   * Recover reservations from Redis after a crash/restart.
   * Scans for `reservation:*` keys, parses values, and loads non-expired ones.
   * Called once at startup.
   */
  async loadFromRedis(): Promise<void> {
    const keys = await this.redis.keys(`${REDIS_KEY_PREFIX}*`);
    if (keys.length === 0) {
      this.logger.debug('No reservations found in Redis');
      return;
    }

    const values = await this.redis.mget(...keys);
    const now = Date.now();
    let loaded = 0;

    for (let i = 0; i < keys.length; i++) {
      const raw = values[i];
      if (!raw) continue;

      try {
        const reservation = JSON.parse(raw) as Reservation;
        if (reservation.expiresAt > now) {
          this.reservations.set(reservation.utxoRef, reservation);
          loaded++;
        }
      } catch {
        this.logger.warn({ key: keys[i] }, 'Failed to parse reservation from Redis');
      }
    }

    this.logger.info(
      { total: keys.length, loaded, skipped: keys.length - loaded },
      'Reservations loaded from Redis'
    );
  }

  /**
   * Remove expired reservations from internal Map.
   * Fire-and-forget Redis deletes for cleaned entries.
   */
  private cleanExpired(): void {
    const now = Date.now();
    for (const [utxoRef, reservation] of this.reservations) {
      if (reservation.expiresAt <= now) {
        this.reservations.delete(utxoRef);

        // Fire-and-forget Redis cleanup
        const redisKey = `${REDIS_KEY_PREFIX}${utxoRef}`;
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        this.redis.del(redisKey).catch(() => {});

        this.logger.debug({ utxoRef }, 'Expired reservation cleaned');
      }
    }
  }
}

/**
 * Factory to create a UtxoReservation from chain config.
 *
 * @param redis - Redis client instance
 * @param config - Chain configuration with reservation settings
 * @param logger - Fastify logger
 * @returns Configured UtxoReservation instance
 */
export function createUtxoReservation(
  redis: Redis,
  config: ChainConfig,
  logger: FastifyBaseLogger
): UtxoReservation {
  return new UtxoReservation({
    redis,
    ttlMs: config.reservation.ttlSeconds * 1000,
    maxConcurrent: config.reservation.maxConcurrent,
    logger,
  });
}
