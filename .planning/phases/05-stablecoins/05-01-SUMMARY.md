---
phase: 05-stablecoins
plan: 01
subsystem: verify
tags: [token-registry, types, stablecoins, foundation]
dependency_graph:
  requires: []
  provides: [SUPPORTED_TOKENS, TokenEntry, LOVELACE_UNIT, isTokenPayment, getToken, assetToUnit, VerifyContext.asset, VerifyContext.getMinUtxoLovelace, FAILURE_MESSAGES.unsupported_token, FAILURE_MESSAGES.min_utxo_insufficient]
  affects: [src/verify/checks.ts, src/routes/verify.ts, src/routes/settle.ts]
tech_stack:
  added: []
  patterns: [hardcoded-registry-as-security-gate, optional-fields-for-incremental-rollout]
key_files:
  created:
    - src/verify/token-registry.ts
    - tests/unit/verify/token-registry.test.ts
  modified:
    - src/verify/types.ts
    - src/verify/verify-payment.ts
    - src/verify/index.ts
decisions:
  - Token registry uses ReadonlyMap keyed by concatenated unit strings (policyId + assetNameHex)
  - VerifyContext.asset and getMinUtxoLovelace are optional for incremental rollout between Plan 01 and Plan 03
  - PaymentRequirementsSchema.asset defaults to 'lovelace' for backward compatibility
metrics:
  duration: 3 min
  completed: 2026-02-08
---

# Phase 5 Plan 1: Token Registry, Type Extensions, and Failure Messages Summary

Hardcoded token registry with USDM, DJED, iUSD mainnet policy IDs; VerifyContext extended with optional asset and getMinUtxoLovelace fields; two new failure messages for token checks.

## What Was Built

### Task 1: Token Registry (src/verify/token-registry.ts)
Created `SUPPORTED_TOKENS` as a `ReadonlyMap<string, TokenEntry>` with three entries keyed by concatenated unit strings:

- **USDM**: `c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad` + `0014df105553444d` (CIP-67 label 333)
- **DJED**: `8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61` + `446a65644d6963726f555344` (ASCII "DjedMicroUSD")
- **iUSD**: `f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880` + `69555344` (ASCII "iUSD")

Helper functions: `isTokenPayment()` (check if not lovelace), `getToken()` (registry lookup), `assetToUnit()` (strip dot from API format).

12 unit tests cover: registry size, individual token lookups, unknown token rejection, ADA passthrough, format conversion, and entry validation (56-char policyId, non-empty assetNameHex).

### Task 2: Type Extensions and Failure Messages
- **VerifyContext**: Added optional `asset?: string` and `getMinUtxoLovelace?: (numAssets: number) => Promise<bigint>` after `feeMax`, before pipeline state. Both optional so existing route handlers (verify.ts, settle.ts) continue to compile between Plan 01 and Plan 03.
- **PaymentRequirementsSchema**: Changed `asset: z.string()` to `asset: z.string().default('lovelace')` for backward compatibility with ADA-only clients.
- **FAILURE_MESSAGES**: Added `unsupported_token` and `min_utxo_insufficient` entries.
- **Barrel exports**: Token registry symbols exported from `src/verify/index.ts`.

## Deviations from Plan

None -- plan executed exactly as written.

## Test Results

- 218 tests pass (206 existing + 12 new token registry tests)
- 16 test suites, all passing
- Zero type errors, zero lint violations
- Build succeeds

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 27c39f5 | Token registry with USDM, DJED, iUSD entries + 12 tests |
| 2 | 82fcacc | VerifyContext extension, failure messages, barrel exports |

## What's Next

- **Plan 05-02**: New check functions (`checkTokenSupported`, `checkMinUtxo`, modified `checkAmount`) that consume the registry and type extensions built here.
- **Plan 05-03**: Route handler updates to thread `asset` and `getMinUtxoLovelace` into VerifyContext, plus end-to-end token payment tests.
