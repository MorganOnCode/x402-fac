// Settlement orchestrator for x402 transaction submission and confirmation.
//
// Orchestrates the full settlement flow:
// 1. Re-verify the transaction (defense-in-depth)
// 2. Idempotency check via Redis SET NX (TOCTOU prevention)
// 3. Submit raw CBOR to Blockfrost
// 4. Poll for on-chain confirmation
// 5. Return typed SettleResult

import { createHash } from 'node:crypto';

import { BlockfrostServerError } from '@blockfrost/blockfrost-js';
import type { FastifyBaseLogger } from 'fastify';

import type { SettlementRecord, SettleResult } from './types.js';
import type { BlockfrostClient } from '../chain/blockfrost-client.js';
import type { VerifyContext } from '../verify/types.js';
import { verifyPayment } from '../verify/verify-payment.js';

// ---------------------------------------------------------------------------
// Constants (hardcoded per research recommendation)
// ---------------------------------------------------------------------------

/** Interval between confirmation polls (milliseconds). */
const POLL_INTERVAL_MS = 5_000;

/** Maximum time to wait for on-chain confirmation (milliseconds). */
const POLL_TIMEOUT_MS = 120_000;

/** Dedup record TTL in Redis (seconds). 24 hours. */
const DEDUP_TTL_SECONDS = 86_400;

// ---------------------------------------------------------------------------
// Redis interface (minimal subset of ioredis)
// ---------------------------------------------------------------------------

export interface RedisLike {
  set(...args: unknown[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a dedup key for idempotency checking.
 * Returns `settle:<sha256hex>` from the raw CBOR bytes.
 */
export function computeDedupKey(cborBytes: Uint8Array): string {
  return `settle:${createHash('sha256').update(cborBytes).digest('hex')}`;
}

/**
 * Poll Blockfrost for transaction confirmation.
 *
 * Checks `blockfrost.getTransaction(txHash)` in a loop with async sleep
 * intervals. Returns when the transaction appears in a block or the
 * timeout is reached.
 *
 * @param txHash - Transaction hash to poll for
 * @param blockfrost - BlockfrostClient with getTransaction method
 * @param timeoutMs - Maximum time to poll (milliseconds)
 * @param intervalMs - Time between polls (milliseconds)
 * @param logger - Fastify logger for debug output
 * @returns `{ confirmed: true, blockHeight }` or `{ confirmed: false }`
 */
export async function pollConfirmation(
  txHash: string,
  blockfrost: BlockfrostClient,
  timeoutMs: number,
  intervalMs: number,
  logger: FastifyBaseLogger
): Promise<{ confirmed: boolean; blockHeight?: number }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const txInfo = await blockfrost.getTransaction(txHash);
    if (txInfo !== null) {
      logger.info({ txHash, blockHeight: txInfo.block_height }, 'Transaction confirmed on-chain');
      return { confirmed: true, blockHeight: txInfo.block_height };
    }

    // Check if we'll exceed deadline after sleeping
    if (Date.now() + intervalMs >= deadline) {
      break;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  return { confirmed: false };
}

// ---------------------------------------------------------------------------
// Settlement orchestrator
// ---------------------------------------------------------------------------

/**
 * Settle a payment by re-verifying, deduplicating, submitting, and polling.
 *
 * Full flow:
 * 1. Re-verify the transaction via verifyPayment() (defense-in-depth)
 * 2. Compute SHA-256 dedup key and claim via Redis SET NX
 * 3. If dedup hit: check existing record status and return appropriately
 * 4. Submit raw CBOR to Blockfrost
 * 5. Poll for on-chain confirmation
 * 6. Return typed SettleResult
 *
 * @param ctx - Verification context (same shape as /verify)
 * @param cborBytes - Raw CBOR bytes of the signed transaction
 * @param blockfrost - BlockfrostClient for submission and confirmation
 * @param redis - Redis client for idempotency dedup
 * @param network - CAIP-2 chain ID (e.g. "cardano:preprod")
 * @param logger - Fastify logger
 * @returns SettleResult with success/failure and reason
 */
export async function settlePayment(
  ctx: VerifyContext,
  cborBytes: Uint8Array,
  blockfrost: BlockfrostClient,
  redis: RedisLike,
  network: string,
  logger: FastifyBaseLogger
): Promise<SettleResult> {
  // ---- 1. Re-verify ----
  const verifyResult = await verifyPayment(ctx, logger);
  if (!verifyResult.isValid) {
    logger.info({ reason: verifyResult.invalidReason }, 'Settlement rejected: verification failed');
    return { success: false, reason: 'verification_failed' };
  }

  // ---- 2. Idempotency / dedup check ----
  const dedupKey = computeDedupKey(cborBytes);
  const initialRecord: SettlementRecord = {
    txHash: '',
    status: 'submitted',
    submittedAt: Date.now(),
  };

  const didClaim = await redis.set(
    dedupKey,
    JSON.stringify(initialRecord),
    'EX',
    DEDUP_TTL_SECONDS,
    'NX'
  );

  if (didClaim === null) {
    // Key already exists -- handle existing record
    return handleExistingRecord(dedupKey, blockfrost, redis, network, logger);
  }

  // ---- 3. Submit to Blockfrost ----
  let txHash: string;
  try {
    txHash = await blockfrost.submitTransaction(cborBytes);
  } catch (error) {
    if (error instanceof BlockfrostServerError && error.status_code === 400) {
      // Update dedup record to failed
      const failedRecord: SettlementRecord = {
        ...initialRecord,
        status: 'failed',
        reason: 'invalid_transaction',
      };
      await redis.set(dedupKey, JSON.stringify(failedRecord), 'EX', DEDUP_TTL_SECONDS);
      return { success: false, reason: 'invalid_transaction' };
    }

    // Other errors: update dedup record to failed
    const failedRecord: SettlementRecord = {
      ...initialRecord,
      status: 'failed',
      reason: 'submission_rejected',
    };
    await redis.set(dedupKey, JSON.stringify(failedRecord), 'EX', DEDUP_TTL_SECONDS);
    logger.error({ err: error }, 'Transaction submission failed');
    return { success: false, reason: 'submission_rejected' };
  }

  // ---- 4. Update dedup record with txHash ----
  const submittedRecord: SettlementRecord = {
    ...initialRecord,
    txHash,
  };
  await redis.set(dedupKey, JSON.stringify(submittedRecord), 'EX', DEDUP_TTL_SECONDS);

  // ---- 5. Poll for confirmation ----
  const pollResult = await pollConfirmation(
    txHash,
    blockfrost,
    POLL_TIMEOUT_MS,
    POLL_INTERVAL_MS,
    logger
  );

  if (pollResult.confirmed) {
    // Update dedup record to confirmed
    const confirmedRecord: SettlementRecord = {
      ...submittedRecord,
      status: 'confirmed',
      confirmedAt: Date.now(),
    };
    await redis.set(dedupKey, JSON.stringify(confirmedRecord), 'EX', DEDUP_TTL_SECONDS);
    return { success: true, transaction: txHash, network };
  }

  // Timeout: update dedup record
  const timeoutRecord: SettlementRecord = {
    ...submittedRecord,
    status: 'timeout',
  };
  await redis.set(dedupKey, JSON.stringify(timeoutRecord), 'EX', DEDUP_TTL_SECONDS);
  return { success: false, reason: 'confirmation_timeout', transaction: txHash };
}

// ---------------------------------------------------------------------------
// Dedup record handler
// ---------------------------------------------------------------------------

/**
 * Handle an existing dedup record found during SET NX.
 * Checks the current status of the record and returns the appropriate result.
 */
async function handleExistingRecord(
  dedupKey: string,
  blockfrost: BlockfrostClient,
  redis: RedisLike,
  network: string,
  logger: FastifyBaseLogger
): Promise<SettleResult> {
  const raw = await redis.get(dedupKey);
  if (!raw) {
    // Record expired between SET NX and GET -- treat as internal error
    return { success: false, reason: 'internal_error' };
  }

  const record = JSON.parse(raw) as SettlementRecord;

  switch (record.status) {
    case 'confirmed':
      logger.info({ txHash: record.txHash }, 'Duplicate submission: already confirmed');
      return { success: true, transaction: record.txHash, network };

    case 'submitted':
    case 'timeout': {
      // Check if it's confirmed now
      const txInfo = await blockfrost.getTransaction(record.txHash);
      if (txInfo !== null) {
        // Update record to confirmed
        const confirmedRecord: SettlementRecord = {
          ...record,
          status: 'confirmed',
          confirmedAt: Date.now(),
        };
        await redis.set(dedupKey, JSON.stringify(confirmedRecord), 'EX', DEDUP_TTL_SECONDS);
        logger.info({ txHash: record.txHash }, 'Duplicate submission: now confirmed on-chain');
        return { success: true, transaction: record.txHash, network };
      }
      // Still not confirmed
      return { success: false, reason: 'confirmation_timeout', transaction: record.txHash };
    }

    case 'failed':
      return { success: false, reason: record.reason ?? 'internal_error' };

    default:
      return { success: false, reason: 'internal_error' };
  }
}
