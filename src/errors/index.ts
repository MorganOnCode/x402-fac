import createError from '@fastify/error';

// Configuration errors (CONFIG_*)
export const ConfigInvalidError = createError<[string]>(
  'CONFIG_INVALID',
  'Invalid configuration: %s',
  500
);

export const ConfigMissingError = createError<[string]>(
  'CONFIG_MISSING',
  'Missing configuration file: %s',
  500
);

export const ConfigParseError = createError<[string]>(
  'CONFIG_PARSE_ERROR',
  'Failed to parse configuration: %s',
  500
);

// Server errors (SERVER_*)
export const ServerStartError = createError<[string]>(
  'SERVER_START_ERROR',
  'Failed to start server: %s',
  500
);

// Generic internal error
export const InternalError = createError<[string]>('INTERNAL_ERROR', 'Internal error: %s', 500);

// Chain provider errors (CHAIN_*) - re-exported from chain domain
export {
  ChainRateLimitedError,
  ChainConnectionError,
  ChainUtxoExhaustedError,
  ChainTransactionError,
  ChainNetworkMismatchError,
} from '../chain/errors.js';

// Type for all application errors
export type AppError =
  | typeof ConfigInvalidError
  | typeof ConfigMissingError
  | typeof ConfigParseError
  | typeof ServerStartError
  | typeof InternalError;
