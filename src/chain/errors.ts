import createError from '@fastify/error';

// Chain provider errors (CHAIN_*)

/** Blockfrost rate limit exceeded after retry exhaustion (503) */
export const ChainRateLimitedError = createError<[string]>(
  'CHAIN_RATE_LIMITED',
  'Blockfrost rate limit exceeded for: %s',
  503
);

/** Failed to connect to Cardano chain provider (503) */
export const ChainConnectionError = createError<[string]>(
  'CHAIN_CONNECTION_ERROR',
  'Failed to connect to Cardano chain: %s',
  503
);

/** No unreserved UTXOs available - all locked by concurrent transactions (503) */
export const ChainUtxoExhaustedError = createError(
  'CHAIN_UTXO_EXHAUSTED',
  'No unreserved UTXOs available for transaction',
  503
);

/** Transaction construction or submission failed (500) */
export const ChainTransactionError = createError<[string]>(
  'CHAIN_TX_ERROR',
  'Transaction failed: %s',
  500
);

/** Network configuration does not match chain state (500) */
export const ChainNetworkMismatchError = createError<[string]>(
  'CHAIN_NETWORK_MISMATCH',
  'Network configuration mismatch: %s',
  500
);
