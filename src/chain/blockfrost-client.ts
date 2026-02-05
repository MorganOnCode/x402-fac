// Stub: BlockfrostClient - to be implemented in GREEN phase
// This stub satisfies TypeScript compilation for TDD RED phase

import type { FastifyBaseLogger } from 'fastify';

import type { ChainConfig } from './config.js';
import type { CardanoNetwork } from './types.js';

/** Retry wrapper with exponential backoff (stub - not yet implemented) */
export async function withRetry<T>(
  _fn: () => Promise<T>,
  _label: string,
  _log: FastifyBaseLogger
): Promise<T> {
  throw new Error('withRetry not implemented');
}

interface BlockfrostClientOptions {
  projectId: string;
  network: CardanoNetwork;
  logger: FastifyBaseLogger;
}

/** Blockfrost API client with retry logic (stub - not yet implemented) */
export class BlockfrostClient {
  constructor(_options: BlockfrostClientOptions) {
    throw new Error('BlockfrostClient not implemented');
  }

  async getLatestBlock(): Promise<unknown> {
    throw new Error('Not implemented');
  }

  async getEpochParameters(): Promise<unknown> {
    throw new Error('Not implemented');
  }

  async getAddressUtxos(_address: string): Promise<unknown[]> {
    throw new Error('Not implemented');
  }
}

/** Factory function to create BlockfrostClient from config */
export function createBlockfrostClient(
  _config: ChainConfig,
  _logger: FastifyBaseLogger
): BlockfrostClient {
  throw new Error('createBlockfrostClient not implemented');
}
