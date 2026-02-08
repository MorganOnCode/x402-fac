// Token registry for supported Cardano native tokens
//
// This file is the security gate: every supported token must be explicitly
// listed here, requiring a code change and review to add new tokens.
// Tests use mocked values; these are mainnet policy IDs.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A supported Cardano native token. */
export interface TokenEntry {
  /** Policy ID (28-byte hex, 56 chars) */
  policyId: string;
  /** Asset name in hex */
  assetNameHex: string;
  /** Human-readable ticker (for logging only, not for matching) */
  ticker: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Special constant for ADA payments (not a token). */
export const LOVELACE_UNIT = 'lovelace';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Supported tokens keyed by unit (policyId + assetNameHex concatenated).
 * Adding a token requires a code change + code review (security gate).
 */
export const SUPPORTED_TOKENS: ReadonlyMap<string, TokenEntry> = new Map([
  [
    'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d',
    {
      policyId: 'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad',
      assetNameHex: '0014df105553444d',
      ticker: 'USDM',
    },
  ],
  [
    '8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61446a65644d6963726f555344',
    {
      policyId: '8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61',
      assetNameHex: '446a65644d6963726f555344',
      ticker: 'DJED',
    },
  ],
  [
    'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069555344',
    {
      policyId: 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880',
      assetNameHex: '69555344',
      ticker: 'iUSD',
    },
  ],
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if an asset identifier represents a token payment (not ADA). */
export function isTokenPayment(asset: string): boolean {
  return asset !== LOVELACE_UNIT;
}

/** Look up a token by its unit string (policyId + assetNameHex concatenated). */
export function getToken(unit: string): TokenEntry | undefined {
  return SUPPORTED_TOKENS.get(unit);
}

/**
 * Convert API asset format (policyId.assetNameHex) to internal unit (concatenated).
 * Returns "lovelace" unchanged.
 */
export function assetToUnit(asset: string): string {
  if (asset === LOVELACE_UNIT) return asset;
  return asset.replace('.', '');
}
