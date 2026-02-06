// Verification orchestrator for x402 transaction-based model
//
// Runs all VERIFICATION_CHECKS, collects errors (not fail-fast),
// and builds the x402 V2 VerifyResponse.

import type { FastifyBaseLogger } from 'fastify';

import type { CheckResult, VerifyContext, VerifyResponse } from './types.js';

/**
 * Map a CheckResult reason to a human-readable description.
 */
export function describeFailure(_result: CheckResult): string {
  // Stub: not implemented
  return '';
}

/**
 * Run all verification checks and build the VerifyResponse.
 */
export async function verifyPayment(
  _ctx: VerifyContext,
  _logger?: FastifyBaseLogger
): Promise<VerifyResponse> {
  // Stub: not implemented
  return { isValid: false };
}
