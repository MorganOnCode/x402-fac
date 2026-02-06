// Settlement domain types for x402 transaction submission and confirmation.
//
// Key design: The client builds and signs the full Cardano transaction;
// the facilitator re-verifies, submits raw CBOR to Blockfrost, polls for
// on-chain confirmation, and returns the result. No facilitator signing.

import { z } from 'zod';

import { PaymentRequirementsSchema } from '../verify/types.js';

// ---------------------------------------------------------------------------
// x402 Settlement Wire Format Schemas (Zod)
// ---------------------------------------------------------------------------

/**
 * SettleRequest -- POST /settle request body.
 * Same shape as /verify: base64 signed CBOR + payment requirements.
 */
export const SettleRequestSchema = z.object({
  /** Base64-encoded signed CBOR transaction */
  transaction: z.string().min(1),
  /** Payment requirements (same shape as /verify) */
  paymentRequirements: PaymentRequirementsSchema,
});

/**
 * SettleResponse -- POST /settle response.
 * Used for documentation and test assertions; not validated at runtime.
 */
export const SettleResponseSchema = z.object({
  /** Whether settlement succeeded */
  success: z.boolean(),
  /** Transaction hash (present on success and timeout) */
  transaction: z.string().optional(),
  /** CAIP-2 chain ID (present on success) */
  network: z.string().optional(),
  /** Snake_case reason code (present on failure) */
  reason: z.string().optional(),
});

/**
 * StatusRequest -- POST /status request body.
 * Accepts a tx hash (64-char hex) and payment requirements for context.
 */
export const StatusRequestSchema = z.object({
  /** Transaction hash (hex string, always 64 chars) */
  transaction: z.string().length(64),
  /** Payment requirements for context */
  paymentRequirements: PaymentRequirementsSchema,
});

/**
 * StatusResponse -- POST /status response.
 */
export const StatusResponseSchema = z.object({
  /** Confirmation status */
  status: z.enum(['confirmed', 'pending', 'not_found']),
  /** Transaction hash (echo) */
  transaction: z.string(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types from Zod schemas
// ---------------------------------------------------------------------------

export type SettleRequest = z.infer<typeof SettleRequestSchema>;
export type SettleResponse = z.infer<typeof SettleResponseSchema>;
export type StatusRequest = z.infer<typeof StatusRequestSchema>;
export type StatusResponse = z.infer<typeof StatusResponseSchema>;

// ---------------------------------------------------------------------------
// Internal Types (plain TypeScript -- no Zod)
// ---------------------------------------------------------------------------

/**
 * Settlement record persisted in Redis for idempotency/dedup.
 * Key: `settle:<sha256hex>` with 24-hour TTL.
 */
export interface SettlementRecord {
  /** Transaction hash returned by Blockfrost on submission */
  txHash: string;
  /** Current settlement status */
  status: 'submitted' | 'confirmed' | 'timeout' | 'failed';
  /** Unix ms timestamp when submitted to Blockfrost */
  submittedAt: number;
  /** Unix ms timestamp when confirmed on-chain (set on confirmation) */
  confirmedAt?: number;
  /** Failure reason if status is 'failed' */
  reason?: string;
}

/**
 * Return type of the settlePayment() orchestrator.
 * Maps directly to the SettleResponse wire format.
 */
export interface SettleResult {
  /** Whether settlement succeeded */
  success: boolean;
  /** Transaction hash (present on success and timeout) */
  transaction?: string;
  /** CAIP-2 chain ID (present on success) */
  network?: string;
  /** Snake_case failure reason */
  reason?: string;
}

/**
 * Subset of Blockfrost tx_content response needed for settlement confirmation.
 * Derived from @blockfrost/openapi components['schemas']['tx_content'].
 */
export interface TxInfo {
  /** Transaction hash */
  hash: string;
  /** Block hash */
  block: string;
  /** Block height */
  block_height: number;
  /** Block time (Unix timestamp) */
  block_time: number;
  /** Slot number */
  slot: number;
  /** Transaction index within block */
  index: number;
  /** Fee in lovelace (as string) */
  fees: string;
  /** Whether the contract executed successfully */
  valid_contract: boolean;
}
