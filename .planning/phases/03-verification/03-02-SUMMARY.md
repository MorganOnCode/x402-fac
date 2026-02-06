---
phase: 03-verification
plan: 02
subsystem: verification
tags: [cbor, cml, deserialization, verification-checks, tdd, cardano, transaction]

# Dependency graph
requires:
  - phase: 03-01
    provides: VerifyContext, CheckResult, VerifyCheck types, CAIP-2 constants, ChainConfig verification section
  - phase: 02-chain-provider
    provides: ChainProvider.getCurrentSlot() for TTL check, CardanoNetwork type
provides:
  - CBOR transaction deserialization (DeserializedTx, deserializeTransaction)
  - Eight verification check functions (checkCborValid through checkFee)
  - VERIFICATION_CHECKS ordered array for pipeline execution
  - Pipeline state sharing via ctx._parsedTx, _matchingOutputIndex, _matchingOutputAmount
affects: [03-03 verification orchestrator, 03-04 verify route, 04-payment-flow settlement]

# Tech tracking
tech-stack:
  added: []
  patterns: [CML Transaction.from_cbor_hex for CBOR parsing, canonical hex address comparison, pipeline state on mutable context, try/finally WASM memory cleanup]

key-files:
  created:
    - src/verify/cbor.ts
    - src/verify/checks.ts
    - tests/unit/verify/cbor.test.ts
    - tests/unit/verify/checks.test.ts
  modified:
    - src/verify/types.ts
    - src/verify/index.ts

key-decisions:
  - "Address comparison uses canonical hex (to_hex()), NOT bech32 string comparison -- same address can have different bech32 representations"
  - "CML Address has to_hex() not to_cbor_hex() -- API spike discovered this deviation from research"
  - "Value.new(coin, multiAsset) instead of set_multi_asset() -- CML Value is immutable after creation"
  - "MultiAsset.get_assets() may return undefined -- added null guard"
  - "NetworkId.network() returns bigint -- cast to Number() for interface compatibility"
  - "VKey witness detection via JSON parse of witness_set().to_json() -- checking vkeywitnesses array"
  - "Base64 validation via regex before Buffer.from() decode -- catches invalid characters early"
  - "Pipeline state fields (_parsedTx, _matchingOutputIndex, _matchingOutputAmount) on mutable VerifyContext"

patterns-established:
  - "TDD RED-GREEN cycle for verification primitives"
  - "CML test fixtures built from real CML objects (not hardcoded hex)"
  - "Mock DeserializedTx on ctx._parsedTx to test checks independently from CML"
  - "try/finally with tx.free() for WASM memory cleanup"

# Metrics
duration: 9min
completed: 2026-02-06
---

# Phase 3 Plan 02: CBOR Deserialization and Verification Checks Summary

**CML-based CBOR transaction deserialization with multi-asset extraction and eight verification check functions using TDD RED-GREEN cycle**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-06T12:57:04Z
- **Completed:** 2026-02-06T13:05:45Z
- **TDD Cycles:** 2 (Feature 1: CBOR, Feature 2: Checks)
- **Tests added:** 44 (14 CBOR + 30 checks)
- **Total tests:** 133 (from 89)
- **Files created:** 4
- **Files modified:** 2

## Accomplishments

- `deserializeTransaction()` converts base64 CBOR to structured `DeserializedTx` with inputs, outputs (addressHex, bech32, lovelace, assets, networkId), fee, TTL, networkId, witnesses, txHash
- Multi-asset extraction via CML MultiAsset iteration for Phase 5 forward compatibility
- Eight verification checks with consistent `CheckResult` return format
- Pipeline state sharing via mutable `VerifyContext` fields avoids redundant CBOR parsing
- `VERIFICATION_CHECKS` array defines the execution order for the orchestrator
- Base64 validation with distinct error messages (invalid_base64 vs invalid_cbor)
- CML WASM memory management via try/finally with tx.free()

## Task Commits

TDD RED-GREEN commits:

1. **RED: CBOR tests** - `5d51ad1` (test) - 14 failing tests + stub
2. **GREEN: CBOR implementation** - `1d97648` (feat) - All 14 tests pass
3. **RED: Checks tests** - `aa1b4d1` (test) - 28 failing tests + stubs + types update
4. **GREEN: Checks implementation** - `4ec6547` (feat) - All 30 tests pass, barrel exports updated

**Plan metadata:** pending

## Files Created/Modified

- `src/verify/cbor.ts` - DeserializedTx interface, deserializeTransaction() with CML parsing, multi-asset extraction, WASM cleanup
- `src/verify/checks.ts` - 8 check functions (checkCborValid, checkScheme, checkNetwork, checkRecipient, checkAmount, checkWitness, checkTtl, checkFee) + VERIFICATION_CHECKS array
- `tests/unit/verify/cbor.test.ts` - 14 tests: round-trip, multi-output, TTL, witnesses, multi-asset, network ID, error handling
- `tests/unit/verify/checks.test.ts` - 30 tests: all 8 checks with pass/fail/dependency-failed cases + VERIFICATION_CHECKS order
- `src/verify/types.ts` - Added DeserializedTx import, pipeline state fields (_parsedTx, _matchingOutputIndex, _matchingOutputAmount) to VerifyContext
- `src/verify/index.ts` - Added barrel exports for deserializeTransaction, DeserializedTx, all 8 checks, VERIFICATION_CHECKS

## Decisions Made

- CML `Address.to_hex()` used for canonical comparison (not `to_cbor_hex()` which does not exist on CML Address)
- CML `Value.new(coin, multiAsset)` for constructing multi-asset values (Value is immutable, no set_multi_asset)
- `MultiAsset.get_assets()` returns undefined for unknown policies -- added null guard
- `NetworkId.network()` returns bigint, cast to `Number()` for interface compatibility
- VKey witness detection via JSON parse: `Array.isArray(witnessJson.vkeywitnesses) && length > 0`
- Base64 validation regex `^[A-Za-z0-9+/]*={0,2}$` applied before Buffer.from decode
- Pipeline state on mutable VerifyContext (not return values) -- matches plan spec and avoids redundant parsing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CML Address API: to_hex() instead of to_cbor_hex()**
- **Found during:** Feature 1 CML spike
- **Issue:** Plan specified `address.to_cbor_hex()` but CML Address only has `to_hex()`. The `to_cbor_hex()` method exists on other CML types (Vkeywitness, TransactionBody) but not Address.
- **Fix:** Used `address.to_hex()` throughout. Named field `addressHex` instead of `addressCborHex` in DeserializedTx.
- **Files modified:** src/verify/cbor.ts, tests/unit/verify/cbor.test.ts, tests/unit/verify/checks.test.ts
- **Impact:** None -- canonical hex comparison is correct regardless of method name

**2. [Rule 3 - Blocking] CML Value API: no set_multi_asset(), use Value.new(coin, ma)**
- **Found during:** Feature 1 test fixture construction
- **Issue:** Plan research showed `value.set_multi_asset(ma)` but CML Value is immutable. Must use `Value.new(coin, multiAsset)`.
- **Fix:** Updated test helper to use `CML.Value.new(outputLovelace, ma)` for multi-asset outputs
- **Files modified:** tests/unit/verify/cbor.test.ts
- **Impact:** None -- test fixture only

**3. [Rule 3 - Blocking] CML MultiAsset.get_assets() possibly undefined**
- **Found during:** TypeScript strict mode typecheck in pre-commit hook
- **Issue:** `multiAsset.get_assets(policyId)` may return undefined. TypeScript strict mode caught this.
- **Fix:** Added `if (!assetMap) continue;` guard
- **Files modified:** src/verify/cbor.ts
- **Committed in:** 1d97648

**4. [Rule 3 - Blocking] CML NetworkId.network() returns bigint, not number**
- **Found during:** TypeScript strict mode typecheck in pre-commit hook
- **Issue:** `bodyNetworkId.network()` returns bigint but DeserializedTx.body.networkId is `number | undefined`
- **Fix:** Applied `Number()` cast: `networkId = Number(bodyNetworkId.network())`
- **Files modified:** src/verify/cbor.ts
- **Committed in:** 1d97648

---

**Total deviations:** 4 auto-fixed (all Rule 3 blocking issues from CML API differences)
**Impact on plan:** All fixes necessary for correct CML interaction. No scope changes.

## Issues Encountered

All issues were CML API surface differences from what the research document predicted. The spike tests before implementation caught all 4 issues early, preventing wasted time during the TDD cycle.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 (verification orchestrator) can import all checks and `VERIFICATION_CHECKS` array
- Pipeline state sharing via ctx._parsedTx is ready for orchestrator loop
- Plan 04 (verify route) can import `deserializeTransaction` for any additional needs
- DeserializedTx.txHash available for Phase 4 settlement tracking
- Multi-asset extraction ready for Phase 5 stablecoin support

## Self-Check: PASSED
