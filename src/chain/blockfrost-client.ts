import { BlockFrostAPI, BlockfrostServerError } from '@blockfrost/blockfrost-js';
import type { FastifyBaseLogger } from 'fastify';

import type { ChainConfig } from './config.js';
import { ChainConnectionError, ChainRateLimitedError } from './errors.js';
import type { CardanoNetwork } from './types.js';

// ---- Constants ----

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 20_000;

/** Status codes that warrant retry with backoff. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** Network error codes that warrant retry. */
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENETUNREACH',
]);

// ---- Retry helpers ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Determine whether an error is retryable.
 *
 * Retryable errors include Blockfrost server errors with certain status codes
 * (429, 500, 502, 503, 504) and network-level errors (ECONNREFUSED, etc.).
 */
function isRetryableError(error: unknown): boolean {
  // Blockfrost server error with retryable status code
  if (error instanceof BlockfrostServerError) {
    return RETRYABLE_STATUS_CODES.has(error.status_code);
  }

  // Network-level error with recognizable code
  if (error instanceof Error && 'code' in error) {
    const code = (error as Error & { code: string }).code;
    return RETRYABLE_NETWORK_CODES.has(code);
  }

  return false;
}

/**
 * Determine whether an error is a rate-limit response (HTTP 429).
 */
function isRateLimitError(error: unknown): boolean {
  return error instanceof BlockfrostServerError && error.status_code === 429;
}

/**
 * Determine whether an error is a network/connection error.
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof Error && 'code' in error) {
    const code = (error as Error & { code: string }).code;
    return RETRYABLE_NETWORK_CODES.has(code);
  }
  // Server errors 500-504 that exhaust retries are treated as connection issues
  if (error instanceof BlockfrostServerError) {
    return [500, 502, 503, 504].includes(error.status_code);
  }
  return false;
}

// ---- Public API ----

/**
 * Execute an async function with exponential backoff retry.
 *
 * Retry schedule: 500ms, 1000ms, 2000ms (base * 2^attempt).
 * Retries on: 429, 500, 502, 503, 504, and network errors.
 * Non-retryable errors are thrown immediately.
 *
 * After retry exhaustion:
 * - 429 errors throw ChainRateLimitedError
 * - Network errors throw ChainConnectionError
 * - Other retryable errors throw ChainConnectionError
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  log: FastifyBaseLogger
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Non-retryable errors are thrown immediately
      if (!isRetryableError(error)) {
        throw error;
      }

      // If we've exhausted retries, break out to throw mapped error
      if (attempt >= MAX_RETRIES) {
        break;
      }

      const delay = BASE_DELAY_MS * 2 ** attempt;
      log.warn(
        { attempt: attempt + 1, delay, label },
        'Retrying Blockfrost request after transient error'
      );

      await sleep(delay);
    }
  }

  // Map exhausted error to domain error
  if (isRateLimitError(lastError)) {
    throw new ChainRateLimitedError(label);
  }

  if (isNetworkError(lastError)) {
    throw new ChainConnectionError(label);
  }

  // Fallback: re-throw the last error (should not reach here for retryable errors)
  throw lastError;
}

// ---- BlockfrostClient ----

interface BlockfrostClientOptions {
  projectId: string;
  network: CardanoNetwork;
  logger: FastifyBaseLogger;
}

/**
 * Blockfrost API client with built-in exponential backoff retry logic.
 *
 * Wraps `@blockfrost/blockfrost-js` BlockFrostAPI with:
 * - Exponential backoff (500ms, 1000ms, 2000ms) on retryable errors
 * - Rate limit exhaustion mapped to ChainRateLimitedError
 * - Network errors mapped to ChainConnectionError
 * - 404 on unused addresses returns empty array
 *
 * SECURITY: The projectId (API key) is never stored as a public property,
 * never included in error messages, and never logged.
 */
export class BlockfrostClient {
  /** @internal */
  private readonly api: BlockFrostAPI;
  /** @internal */
  private readonly log: FastifyBaseLogger;

  constructor(options: BlockfrostClientOptions) {
    this.log = options.logger;
    this.api = new BlockFrostAPI({
      projectId: options.projectId,
      rateLimiter: true,
      requestTimeout: REQUEST_TIMEOUT_MS,
    });
  }

  /** Fetch the latest block on chain. */
  async getLatestBlock(): Promise<unknown> {
    return withRetry(() => this.api.blocksLatest(), 'getLatestBlock', this.log);
  }

  /** Fetch current epoch protocol parameters. */
  async getEpochParameters(): Promise<unknown> {
    return withRetry(() => this.api.epochsLatestParameters(), 'getEpochParameters', this.log);
  }

  /**
   * Fetch UTxOs for an address.
   * Returns empty array for unused addresses (Blockfrost returns 404).
   */
  async getAddressUtxos(address: string): Promise<unknown[]> {
    try {
      return await withRetry(() => this.api.addressesUtxos(address), 'getAddressUtxos', this.log);
    } catch (error) {
      // Blockfrost returns 404 for addresses with no UTxOs
      if (error instanceof BlockfrostServerError && error.status_code === 404) {
        return [];
      }
      throw error;
    }
  }
}

/**
 * Create a BlockfrostClient from the application's chain configuration.
 */
export function createBlockfrostClient(
  config: ChainConfig,
  logger: FastifyBaseLogger
): BlockfrostClient {
  return new BlockfrostClient({
    projectId: config.blockfrost.projectId,
    network: config.network as CardanoNetwork,
    logger,
  });
}
