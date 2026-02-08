// Unit tests for token registry
//
// Tests cover: registry size, token lookup, unknown token rejection,
// ADA passthrough, asset format conversion, and entry validation.

import { describe, expect, it } from 'vitest';

import {
  SUPPORTED_TOKENS,
  LOVELACE_UNIT,
  isTokenPayment,
  getToken,
  assetToUnit,
} from '../../../src/verify/token-registry.js';

// ---------------------------------------------------------------------------
// Unit strings for the three supported tokens
// ---------------------------------------------------------------------------

const USDM_UNIT = 'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d';
const DJED_UNIT =
  '8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61446a65644d6963726f555344';
const IUSD_UNIT = 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069555344';

describe('token-registry', () => {
  // -------------------------------------------------------------------------
  // Registry size
  // -------------------------------------------------------------------------

  it('SUPPORTED_TOKENS has exactly 3 entries', () => {
    expect(SUPPORTED_TOKENS.size).toBe(3);
  });

  // -------------------------------------------------------------------------
  // getToken - known tokens
  // -------------------------------------------------------------------------

  it('getToken returns USDM entry for USDM unit string', () => {
    const entry = getToken(USDM_UNIT);
    expect(entry).toBeDefined();
    expect(entry!.ticker).toBe('USDM');
    expect(entry!.policyId).toBe('c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad');
    expect(entry!.assetNameHex).toBe('0014df105553444d');
  });

  it('getToken returns DJED entry for DJED unit string', () => {
    const entry = getToken(DJED_UNIT);
    expect(entry).toBeDefined();
    expect(entry!.ticker).toBe('DJED');
    expect(entry!.policyId).toBe('8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61');
    expect(entry!.assetNameHex).toBe('446a65644d6963726f555344');
  });

  it('getToken returns iUSD entry for iUSD unit string', () => {
    const entry = getToken(IUSD_UNIT);
    expect(entry).toBeDefined();
    expect(entry!.ticker).toBe('iUSD');
    expect(entry!.policyId).toBe('f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880');
    expect(entry!.assetNameHex).toBe('69555344');
  });

  // -------------------------------------------------------------------------
  // getToken - unknown tokens
  // -------------------------------------------------------------------------

  it('getToken returns undefined for unknown unit', () => {
    const unknownUnit = 'ff'.repeat(28) + 'aabb';
    expect(getToken(unknownUnit)).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // isTokenPayment
  // -------------------------------------------------------------------------

  it('isTokenPayment returns false for "lovelace"', () => {
    expect(isTokenPayment('lovelace')).toBe(false);
  });

  it('isTokenPayment returns true for a token unit string', () => {
    expect(isTokenPayment(USDM_UNIT)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // assetToUnit
  // -------------------------------------------------------------------------

  it('assetToUnit returns "lovelace" unchanged', () => {
    expect(assetToUnit('lovelace')).toBe('lovelace');
  });

  it('assetToUnit strips dot from policyId.assetNameHex format', () => {
    expect(assetToUnit('aabb.ccdd')).toBe('aabbccdd');
  });

  // -------------------------------------------------------------------------
  // LOVELACE_UNIT constant
  // -------------------------------------------------------------------------

  it('LOVELACE_UNIT equals "lovelace"', () => {
    expect(LOVELACE_UNIT).toBe('lovelace');
  });

  // -------------------------------------------------------------------------
  // Entry validation
  // -------------------------------------------------------------------------

  it('each token entry has a 56-char policyId', () => {
    for (const [, entry] of SUPPORTED_TOKENS) {
      expect(entry.policyId).toHaveLength(56);
    }
  });

  it('each token entry has a non-empty assetNameHex', () => {
    for (const [, entry] of SUPPORTED_TOKENS) {
      expect(entry.assetNameHex.length).toBeGreaterThan(0);
    }
  });
});
