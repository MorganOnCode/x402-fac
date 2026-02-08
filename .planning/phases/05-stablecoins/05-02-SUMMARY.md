---
phase: 05-stablecoins
plan: 02
subsystem: verify
tags: [checks, token-amount, min-utxo, pipeline, tdd]
dependency_graph:
  requires: [SUPPORTED_TOKENS, LOVELACE_UNIT, assetToUnit, VerifyContext.asset, VerifyContext.getMinUtxoLovelace]
  provides: [checkTokenSupported, checkMinUtxo, "checkAmount (token branching)", "VERIFICATION_CHECKS (10 items)"]
  affects: [src/verify/verify-payment.ts, src/routes/verify.ts, src/routes/settle.ts]
tech_stack:
  added: []
  patterns: [tdd-red-green, branching-check-by-asset-type, optional-callback-skip-pattern]
key_files:
  created: []
  modified:
    - src/verify/checks.ts
    - tests/unit/verify/checks.test.ts
decisions:
  - checkAmount ADA path uses _matchingOutputAmount (set by checkRecipient) for backward compat with existing test mocks
  - checkAmount token path uses _parsedTx.body.outputs[index].assets[unit] via assetToUnit() conversion
  - checkMinUtxo skips (returns passed:true) when getMinUtxoLovelace callback not provided
  - checkMinUtxo counts Object.keys(output.assets).length and passes numAssets to callback
  - Overpayment allowed (>=) for both ADA and token amounts
  - VERIFICATION_CHECKS order: cbor, scheme, network, token_supported, recipient, amount, min_utxo, witness, ttl, fee
metrics:
  duration: 6 min
  completed: 2026-02-08
---

# Phase 5 Plan 2: Token Verification Checks (TDD) Summary

Three verification check changes via TDD: checkTokenSupported rejects unsupported tokens, checkAmount branches ADA/token amounts via assets map, checkMinUtxo validates min UTXO ADA with optional callback skip.

## What Was Built

### Task 1: checkTokenSupported (TDD -- 7 tests)
New check function at pipeline position 4 (before recipient) for fast rejection of unsupported tokens.

- ADA payments (`ctx.asset === 'lovelace'`) always pass without registry lookup
- Token payments convert dot-separated API format (`policyId.assetNameHex`) to concatenated unit via `assetToUnit()`, then check `SUPPORTED_TOKENS.has(unit)`
- Unknown tokens fail with `reason: 'unsupported_token'` and `details: { asset }`
- Verified against all three real registry entries (USDM, DJED, iUSD) plus mock unknown tokens
- Imported `SUPPORTED_TOKENS`, `LOVELACE_UNIT`, `assetToUnit` from `token-registry.ts`

### Task 2: checkAmount Token Branching + checkMinUtxo + Pipeline Update (TDD -- 14 tests)

**checkAmount modifications (6 new tests):**
- When `ctx.asset` is `'lovelace'` (or absent/undefined): uses existing `ctx._matchingOutputAmount` path -- zero change to ADA behavior, full backward compatibility with existing mocks
- When `ctx.asset` is a token: looks up `output.assets[assetToUnit(asset)]` from `ctx._parsedTx.body.outputs[ctx._matchingOutputIndex]`
- Token failure details include `asset` field for diagnostics
- Missing token in assets map treated as `0n` (fails amount check)
- Overpayment allowed (`>=`) for both paths

**checkMinUtxo (8 new tests):**
- Async check at pipeline position 7 (after amount, before witness)
- Skips with `passed: true` when `ctx.getMinUtxoLovelace` callback not provided (backward compat for existing routes before Plan 03 wires it)
- Counts `Object.keys(output.assets).length` to determine `numAssets` parameter
- Calls `ctx.getMinUtxoLovelace(numAssets)` and compares against `output.lovelace`
- Failure includes `required`, `actual` (as strings), and human-readable `message`: `"min UTXO requires X lovelace, got Y"`
- Returns `reason: 'cbor_required'` when `_matchingOutputIndex` is undefined

**VERIFICATION_CHECKS pipeline (10 checks):**
1. `checkCborValid` -- parse CBOR
2. `checkScheme` -- validate "exact"
3. `checkNetwork` -- validate CAIP-2 chain ID
4. `checkTokenSupported` -- **NEW**: validate asset is supported
5. `checkRecipient` -- find matching output
6. `checkAmount` -- **MODIFIED**: check ADA or token amount
7. `checkMinUtxo` -- **NEW**: check min UTXO ADA
8. `checkWitness` -- check signatures present
9. `checkTtl` -- check TTL not expired
10. `checkFee` -- check fee bounds

## Deviations from Plan

None -- plan executed exactly as written.

## Test Results

- 239 tests pass (218 existing + 21 new: 7 checkTokenSupported + 6 token amount + 8 checkMinUtxo)
- 16 test suites, all passing
- Zero type errors, zero lint violations
- Build succeeds

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 676f48c | checkTokenSupported with 7 TDD tests |
| 2 | 78e1c06 | checkAmount token branching + checkMinUtxo + pipeline 8->10 |

## What's Next

- **Plan 05-03**: Route handler updates to thread `asset` and `getMinUtxoLovelace` into VerifyContext, plus end-to-end token payment tests.
