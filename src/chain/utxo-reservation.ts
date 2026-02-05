// UTXO reservation system - stub for TDD RED phase
// Implementation will follow in GREEN phase

import type { FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';

import type { ChainConfig } from './config.js';
import type { Reservation } from './types.js';

/**
 * UTXO reservation system to prevent double-spend during concurrent transactions.
 * Locks UTXOs with TTL-based expiry and persists to Redis for crash recovery.
 */
export class UtxoReservation {
  private readonly _redis: Redis;

  constructor(options: {
    redis: Redis;
    ttlMs: number;
    maxConcurrent: number;
    logger: FastifyBaseLogger;
  }) {
    this._redis = options.redis;
  }

  reserve(_utxoRef: string, _requestId: string): boolean {
    throw new Error('Not implemented');
  }

  release(_utxoRef: string): void {
    throw new Error('Not implemented');
  }

  releaseAll(_requestId: string): void {
    throw new Error('Not implemented');
  }

  isReserved(_utxoRef: string): boolean {
    throw new Error('Not implemented');
  }

  getActiveCount(): number {
    throw new Error('Not implemented');
  }

  getReservation(_utxoRef: string): Reservation | undefined {
    throw new Error('Not implemented');
  }

  async loadFromRedis(): Promise<void> {
    throw new Error('Not implemented');
  }
}

/**
 * Factory to create a UtxoReservation from chain config.
 */
export function createUtxoReservation(
  _redis: Redis,
  _config: ChainConfig,
  _logger: FastifyBaseLogger
): UtxoReservation {
  throw new Error('Not implemented');
}
