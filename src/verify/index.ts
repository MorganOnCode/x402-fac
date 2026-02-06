// Barrel exports for the verify module

// Types and Zod schemas
export {
  // Zod schemas
  PaymentRequirementsSchema,
  CardanoPayloadSchema,
  PaymentPayloadSchema,
  VerifyRequestSchema,
  VerifyResponseSchema,
  // CAIP-2 constants
  CAIP2_CHAIN_IDS,
  CAIP2_TO_NETWORK_ID,
  NETWORK_ID_EXPECTED,
} from './types.js';

// Type-only exports (ESM requires explicit `export type` for TS-only exports)
export type {
  PaymentRequirements,
  CardanoPayload,
  PaymentPayload,
  VerifyRequest,
  VerifyResponse,
  CheckResult,
  VerifyContext,
  VerifyCheck,
} from './types.js';

// Domain errors
export { VerifyInvalidFormatError, VerifyInternalError } from './errors.js';

// CBOR deserialization (Plan 02)
export { deserializeTransaction } from './cbor.js';
export type { DeserializedTx } from './cbor.js';

// Verification checks (Plan 02)
export {
  checkCborValid,
  checkScheme,
  checkNetwork,
  checkRecipient,
  checkAmount,
  checkWitness,
  checkTtl,
  checkFee,
  VERIFICATION_CHECKS,
} from './checks.js';

// Future exports (Plans 03-04):
// export { verifyPayment } from './verify-payment.js';     // Plan 03
// export { verifyRoute } from '../routes/verify.js';       // Plan 04
