---
phase: 05-stablecoins
plan: 03
subsystem: routes
tags: [routes, verify, settle, integration-tests, asset-threading, stablecoins]
dependency_graph:
  requires: [SUPPORTED_TOKENS, checkTokenSupported, checkMinUtxo, checkAmount, VerifyContext.asset, VerifyContext.getMinUtxoLovelace, PaymentRequirementsSchema.asset]
  provides: ["/verify token payment flow", "/settle token payment flow", "end-to-end stablecoin support"]
  affects: []
tech_stack:
  added: []
  patterns: [callback-injection-for-chain-queries, zod-schema-default-propagation]
key_files:
  created: []
  modified:
    - src/routes/verify.ts
    - src/routes/settle.ts
    - src/verify/index.ts
    - tests/integration/verify-route.test.ts
    - tests/integration/settle-route.test.ts
decisions:
  - asset field placed after maxTimeoutSeconds in VerifyContext assembly for logical grouping
  - getMinUtxoLovelace placed after getCurrentSlot as both are ChainProvider callbacks
  - Test helpers refactored to accept paymentRequirementsOverrides as first arg for clean token tests
  - settle-payment.ts unchanged (asset-agnostic by design, re-verify picks up token checks automatically)
metrics:
  duration: 4 min
  completed: 2026-02-08
---

# Phase 5 Plan 3: Route Integration and Token Payment Tests Summary

Route handlers thread paymentRequirements.asset and chainProvider.getMinUtxoLovelace into VerifyContext; 7 integration tests confirm end-to-end token flow through /verify and /settle.

## What Was Built

### Task 1: Route Handler Updates (3 files)

**src/routes/verify.ts** -- Added two fields to VerifyContext assembly:
- `asset: paymentRequirements.asset` -- propagates Zod-defaulted asset identifier (defaults to `'lovelace'` when omitted)
- `getMinUtxoLovelace: (numAssets) => fastify.chainProvider.getMinUtxoLovelace(numAssets)` -- callback for min UTXO calculation

**src/routes/settle.ts** -- Same two fields added to VerifyContext assembly. Settlement re-verification calls `verifyPayment()` which iterates `VERIFICATION_CHECKS` (now 10 checks including `checkTokenSupported`, modified `checkAmount`, and `checkMinUtxo`). No changes to `settle-payment.ts` -- it is asset-agnostic by design.

**src/verify/index.ts** -- Added `checkTokenSupported` and `checkMinUtxo` to barrel exports. Removed placeholder comment about Plan 05-02.

### Task 2: Integration Tests (7 new tests)

**tests/integration/verify-route.test.ts** (4 new tests):
1. Token asset (USDM) threaded into verifyPayment context via `ctx.asset`
2. Asset defaults to `'lovelace'` when omitted from paymentRequirements (Zod schema default)
3. `getMinUtxoLovelace` callback provided as a function in context
4. Token verification failure (`unsupported_token`) surfaced correctly in response body

**tests/integration/settle-route.test.ts** (3 new tests):
1. Token asset (USDM) threaded into settlePayment context via `ctx.asset`
2. Asset defaults to `'lovelace'` when omitted from settle request
3. `getMinUtxoLovelace` callback provided as a function in context

Test helper functions refactored: `createTestVerifyRequest(paymentRequirementsOverrides?, topLevelOverrides?)` and `createTestSettleRequest(paymentRequirementsOverrides?, topLevelOverrides?)` -- moved `...overrides` from top level into `paymentRequirements` as first arg for clean asset field testing.

## Deviations from Plan

None -- plan executed exactly as written.

## Test Results

- 246 tests pass (239 existing + 7 new integration tests)
- 16 test suites, all passing
- Zero type errors, zero lint violations
- Build succeeds

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | c33efdc | Thread asset and getMinUtxoLovelace into route VerifyContext + barrel exports |
| 2 | b22095e | 7 integration tests for token payment route threading |

## Phase 5 Complete

All three plans are done. The facilitator now supports stablecoin payments (USDM, DJED, iUSD) end-to-end:

- **Plan 01**: Token registry (hardcoded security gate), VerifyContext type extensions, Zod schema defaults
- **Plan 02**: checkTokenSupported, checkAmount token branching, checkMinUtxo, pipeline 8->10 checks
- **Plan 03**: Route handler wiring, integration tests confirming end-to-end flow

The pipeline: client sends `asset: "policyId.assetNameHex"` in PaymentRequirements -> Zod validates (defaults to `'lovelace'` if omitted) -> route threads into VerifyContext -> checkTokenSupported validates against registry -> checkAmount branches ADA/token -> checkMinUtxo validates min UTXO ADA -> settlement re-verifies automatically. ADA payments are fully backward compatible.
