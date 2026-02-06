import createError from '@fastify/error';

// Verification errors (VERIFY_*)
//
// IMPORTANT: Most verification failures are NOT errors -- they return
// { isValid: false } as HTTP 200. These errors are for truly exceptional
// cases only (e.g., malformed request that fails Zod parsing, CML WASM crash).

/**
 * Invalid verification request format (e.g., Zod parse failure on request body).
 * Returns HTTP 200 per locked decision "always HTTP 200 for verify responses".
 */
export const VerifyInvalidFormatError = createError<[string]>(
  'VERIFY_INVALID_FORMAT',
  'Invalid verification request format: %s',
  200
);

/**
 * Internal error during verification (e.g., CML WASM crash, unexpected exception).
 * Returns HTTP 500 -- this indicates a server-side failure, not a client issue.
 */
export const VerifyInternalError = createError<[string]>(
  'VERIFY_INTERNAL_ERROR',
  'Verification internal error: %s',
  500
);
