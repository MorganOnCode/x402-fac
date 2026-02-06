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

// Future exports (Plans 02-04):
// export { deserializeCbor, ... } from './cbor.js';        // Plan 02
// export { checkScheme, checkNetwork, ... } from './checks.js';  // Plan 03
// export { verifyPayment } from './verify-payment.js';     // Plan 04
