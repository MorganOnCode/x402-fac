// Verification check functions for x402 transaction-based model
//
// Eight individual checks that examine one aspect of a Cardano transaction
// against the payment requirements. Together they form the verification
// pipeline consumed by the orchestrator (Plan 03).
//
// Each check receives a VerifyContext and returns a CheckResult.
// Checks share pipeline state via mutable ctx fields (_parsedTx, etc.).

import { CML } from '@lucid-evolution/lucid';

import { deserializeTransaction } from './cbor.js';
import { CAIP2_TO_NETWORK_ID } from './types.js';
import type { CheckResult, VerifyCheck, VerifyContext } from './types.js';

// ---------------------------------------------------------------------------
// Check 1: CBOR validity
// ---------------------------------------------------------------------------

/**
 * Validate that the base64 CBOR can be deserialized into a transaction.
 * On success, stores the parsed transaction on ctx._parsedTx for later checks.
 */
export function checkCborValid(ctx: VerifyContext): CheckResult {
  try {
    ctx._parsedTx = deserializeTransaction(ctx.transactionCbor);
    return { check: 'cbor_valid', passed: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    // Distinguish base64 errors from CBOR parse errors
    if (message.toLowerCase().includes('base64')) {
      return { check: 'cbor_valid', passed: false, reason: 'invalid_base64' };
    }

    return {
      check: 'cbor_valid',
      passed: false,
      reason: 'invalid_cbor',
      details: { error: message },
    };
  }
}

// ---------------------------------------------------------------------------
// Check 2: Payment scheme
// ---------------------------------------------------------------------------

/**
 * Validate that the payment scheme is 'exact' (the only scheme we support).
 */
export function checkScheme(ctx: VerifyContext): CheckResult {
  if (ctx.scheme === 'exact') {
    return { check: 'scheme', passed: true };
  }
  return {
    check: 'scheme',
    passed: false,
    reason: 'unsupported_scheme',
    details: { scheme: ctx.scheme },
  };
}

// ---------------------------------------------------------------------------
// Check 3: Network match
// ---------------------------------------------------------------------------

/**
 * Validate that the request network matches the configured network and
 * that transaction output addresses target the expected Cardano network.
 */
export function checkNetwork(ctx: VerifyContext): CheckResult {
  if (!ctx._parsedTx) {
    return { check: 'network', passed: false, reason: 'cbor_required' };
  }

  // CAIP-2 chain ID must match configured network
  if (ctx.network !== ctx.configuredNetwork) {
    return {
      check: 'network',
      passed: false,
      reason: 'network_mismatch',
      details: { expected: ctx.configuredNetwork, actual: ctx.network },
    };
  }

  // Transaction network ID must match expected network ID for the CAIP-2 chain
  const expectedNetworkId = CAIP2_TO_NETWORK_ID[ctx.configuredNetwork];
  const txNetworkId = ctx._parsedTx.body.networkId;

  if (expectedNetworkId !== undefined && txNetworkId !== expectedNetworkId) {
    return {
      check: 'network',
      passed: false,
      reason: 'network_mismatch',
      details: {
        expected: expectedNetworkId,
        actual: txNetworkId,
        message: 'Transaction addresses target a different network',
      },
    };
  }

  return { check: 'network', passed: true };
}

// ---------------------------------------------------------------------------
// Check 4: Recipient output
// ---------------------------------------------------------------------------

/**
 * Validate that a transaction output pays to the required recipient address.
 * Uses canonical hex comparison (not bech32) per research pitfall #2.
 * Sets ctx._matchingOutputIndex and ctx._matchingOutputAmount on success.
 */
export function checkRecipient(ctx: VerifyContext): CheckResult {
  if (!ctx._parsedTx) {
    return { check: 'recipient', passed: false, reason: 'cbor_required' };
  }

  // Convert recipient bech32 to canonical hex for comparison
  const recipientAddr = CML.Address.from_bech32(ctx.payTo);
  const recipientHex = recipientAddr.to_hex();
  recipientAddr.free();

  // Find the first output matching the recipient
  const outputs = ctx._parsedTx.body.outputs;
  for (let i = 0; i < outputs.length; i++) {
    if (outputs[i].addressHex === recipientHex) {
      ctx._matchingOutputIndex = i;
      ctx._matchingOutputAmount = outputs[i].lovelace;
      return { check: 'recipient', passed: true };
    }
  }

  return {
    check: 'recipient',
    passed: false,
    reason: 'recipient_mismatch',
    details: { expected: ctx.payTo },
  };
}

// ---------------------------------------------------------------------------
// Check 5: Payment amount
// ---------------------------------------------------------------------------

/**
 * Validate that the matching output contains at least the required lovelace amount.
 */
export function checkAmount(ctx: VerifyContext): CheckResult {
  if (ctx._matchingOutputAmount === undefined) {
    return {
      check: 'amount',
      passed: false,
      reason: 'amount_insufficient',
      details: { error: 'no matching output found' },
    };
  }

  if (ctx._matchingOutputAmount >= ctx.requiredAmount) {
    return { check: 'amount', passed: true };
  }

  return {
    check: 'amount',
    passed: false,
    reason: 'amount_insufficient',
    details: {
      expected: ctx.requiredAmount.toString(),
      actual: ctx._matchingOutputAmount.toString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Check 6: Witness presence
// ---------------------------------------------------------------------------

/**
 * Validate that the transaction has at least one VKey witness (is signed).
 * Does NOT verify cryptographic signature validity -- that happens on-chain.
 */
export function checkWitness(ctx: VerifyContext): CheckResult {
  if (!ctx._parsedTx) {
    return { check: 'witness', passed: false, reason: 'cbor_required' };
  }

  if (ctx._parsedTx.hasWitnesses) {
    return { check: 'witness', passed: true };
  }

  return { check: 'witness', passed: false, reason: 'missing_witness' };
}

// ---------------------------------------------------------------------------
// Check 7: TTL (validity interval)
// ---------------------------------------------------------------------------

/**
 * Validate that the transaction TTL is not expired.
 * If TTL is not set in the transaction, this check passes (skip).
 * Async because it needs to query the current slot from ChainProvider.
 */
export async function checkTtl(ctx: VerifyContext): Promise<CheckResult> {
  if (!ctx._parsedTx) {
    return { check: 'ttl', passed: false, reason: 'cbor_required' };
  }

  const { ttl } = ctx._parsedTx.body;

  // No TTL set -- transaction is valid indefinitely
  if (ttl === undefined) {
    return { check: 'ttl', passed: true };
  }

  const currentSlot = await ctx.getCurrentSlot();

  if (BigInt(currentSlot) > ttl) {
    return {
      check: 'ttl',
      passed: false,
      reason: 'transaction_expired',
      details: {
        ttl: ttl.toString(),
        currentSlot: currentSlot.toString(),
      },
    };
  }

  return { check: 'ttl', passed: true };
}

// ---------------------------------------------------------------------------
// Check 8: Fee reasonableness
// ---------------------------------------------------------------------------

/**
 * Validate that the transaction fee is within configured bounds.
 * This is a sanity check, not a precise fee calculation.
 */
export function checkFee(ctx: VerifyContext): CheckResult {
  if (!ctx._parsedTx) {
    return { check: 'fee', passed: false, reason: 'cbor_required' };
  }

  const { fee } = ctx._parsedTx.body;

  if (fee >= ctx.feeMin && fee <= ctx.feeMax) {
    return { check: 'fee', passed: true };
  }

  return {
    check: 'fee',
    passed: false,
    reason: 'unreasonable_fee',
    details: {
      fee: fee.toString(),
      min: ctx.feeMin.toString(),
      max: ctx.feeMax.toString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Ordered check array
// ---------------------------------------------------------------------------

/**
 * All verification checks in execution order.
 * checkCborValid MUST be first (it populates ctx._parsedTx).
 * checkRecipient MUST precede checkAmount (it populates ctx._matchingOutputAmount).
 */
export const VERIFICATION_CHECKS: VerifyCheck[] = [
  checkCborValid,
  checkScheme,
  checkNetwork,
  checkRecipient,
  checkAmount,
  checkWitness,
  checkTtl,
  checkFee,
];
