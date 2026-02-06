---
phase: 03-verification
plan: 03
subsystem: verification
tags: [orchestrator, verify-payment, tdd, collect-all-errors, bigint-safety, logging]

# Dependency graph
requires:
  - phase: 03-01
    provides: VerifyContext, CheckResult, VerifyCheck types, VerifyResponse Zod schema
  - phase: 03-02
    provides: VERIFICATION_CHECKS array, 8 check functions, DeserializedTx
provides:
  - verifyPayment() orchestrator that runs all checks and builds VerifyResponse
  - describeFailure() maps snake_case reasons to human-readable messages
  - Collect-all-errors pattern (not fail-fast)
  - BigInt-safe response objects ready for JSON serialization
affects: [03-04 verify route integration, 04-payment-flow settlement]

# Tech tracking
tech-stack:
  added: []
  patterns: [collect-all-errors orchestrator, vi.resetModules for dynamic mock imports in Vitest]

key-files:
  created:
    - src/verify/verify-payment.ts
    - tests/unit/verify/verify-payment.test.ts
  modified:
    - src/verify/index.ts

key-decisions:
  - "vi.resetModules() required before vi.doMock() + dynamic import in Vitest -- module cache prevents mock from applying otherwise"
  - "Non-null assertion replaced with fallback (e.reason ?? 'unknown') to satisfy ESLint no-non-null-assertion rule"
  - "BigInt converted to string via .toString() in extensions.amount for JSON safety"
  - "Optional logger via ?. chaining -- no crash when logger not provided"

patterns-established:
  - "Collect-all-errors orchestrator: loop ALL checks, collect failures, first failure is primary invalidReason"
  - "describeFailure lookup table for human-readable error messages"
  - "Dynamic mock imports with vi.resetModules() + vi.doMock() for testing modules with static imports"

# Metrics
duration: 5min
completed: 2026-02-06
---

# Phase 3 Plan 03: Verification Orchestrator Summary

**verifyPayment() orchestrator with collect-all-errors pattern, describeFailure() reason mapping, BigInt-safe responses, and optional structured logging**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-06T13:09:38Z
- **Completed:** 2026-02-06T13:14:37Z
- **TDD Cycles:** 1 (Feature: verifyPayment orchestrator)
- **Tests added:** 24 (11 describeFailure + 13 verifyPayment)
- **Total tests:** 157 (from 133)
- **Files created:** 2
- **Files modified:** 1

## Accomplishments

- `verifyPayment(ctx, logger?)` iterates all VERIFICATION_CHECKS, awaiting each result (supports async checks like checkTtl)
- Collect-all-errors behavior: every check runs even after first failure
- Success response: `{ isValid: true, payer, extensions: { scheme, amount, payTo, txHash } }`
- Failure response: `{ isValid: false, invalidReason, invalidMessage, payer, extensions: { errors, expected? } }`
- `describeFailure()` maps 10 known reason codes to human-readable messages with fallback for unknown
- All BigInt values converted to strings before inclusion in response objects
- Optional Fastify logger: logs success/failure with structured context (no raw CBOR)
- Barrel exports updated: `verifyPayment` and `describeFailure` exported from `src/verify/index.ts`

## Task Commits

TDD RED-GREEN commits:

1. **RED: Orchestrator tests** - `206ff6b` (test) - 24 tests + stub returning `{ isValid: false }`
2. **GREEN: Orchestrator implementation** - `d2f2805` (feat) - All 24 tests pass, barrel exports updated

**Plan metadata:** pending

## Files Created/Modified

- `src/verify/verify-payment.ts` - verifyPayment() orchestrator, describeFailure() lookup, FAILURE_MESSAGES map
- `tests/unit/verify/verify-payment.test.ts` - 24 tests: describeFailure mappings, all-pass, single/multi failure, CBOR cascading, BigInt safety, payer handling, logging, details passthrough
- `src/verify/index.ts` - Added barrel exports for verifyPayment and describeFailure

## Decisions Made

- `vi.resetModules()` required before `vi.doMock()` + dynamic import in Vitest -- without it, cached module ignores the mock
- Non-null assertion `e.reason!` replaced with `e.reason ?? 'unknown'` to satisfy ESLint no-non-null-assertion rule
- BigInt converted via `.toString()` in `extensions.amount` for JSON serialization safety
- Logger optional via `?.` chaining -- no crash when omitted (tested explicitly)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest module mock caching with vi.doMock**
- **Found during:** RED phase test execution
- **Issue:** `vi.doMock` + dynamic `import()` returns cached module, ignoring the mock. Multiple `vi.hoisted()` calls with same variable name cause `SyntaxError: Identifier already declared`.
- **Fix:** Used `vi.resetModules()` before each `vi.doMock()` + dynamic import. Removed `vi.hoisted()` in favor of inline mock construction per test.
- **Files modified:** tests/unit/verify/verify-payment.test.ts
- **Impact:** Clean test pattern established for mocking modules with static imports

**2. [Rule 1 - Bug] ESLint no-non-null-assertion warning on e.reason!**
- **Found during:** GREEN phase lint check
- **Issue:** `errors.map((e) => e.reason!)` triggers ESLint warning for non-null assertion
- **Fix:** Changed to `errors.map((e) => e.reason ?? 'unknown')` with safe fallback
- **Files modified:** src/verify/verify-payment.ts
- **Impact:** None -- failed checks always have a reason, fallback is defensive only

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both necessary for correct test execution and clean lint. No scope changes.

## Issues Encountered

Vitest module caching is the main gotcha when testing modules that import other modules at the top level. The `vi.resetModules()` + `vi.doMock()` + dynamic import pattern is the correct approach. This is documented in Vitest's mocking guide but easy to miss.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 (verify route) can import `verifyPayment` from `src/verify/index.ts`
- Route handler assembles `VerifyContext` from parsed request + config, calls `verifyPayment(ctx, log)`
- Response is already JSON-safe (no BigInt values) -- Fastify can serialize directly
- Error responses use HTTP 200 per locked decision -- route just returns `result`

## Self-Check: PASSED
