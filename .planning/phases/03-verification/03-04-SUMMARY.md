---
phase: 03-verification
plan: 04
subsystem: verification
tags: [route, fastify-plugin, integration-tests, verify-endpoint, http-200, zod-validation]

# Dependency graph
requires:
  - phase: 03-01
    provides: VerifyRequestSchema, VerifyResponse, CAIP2_CHAIN_IDS, CardanoNetwork type
  - phase: 03-02
    provides: VERIFICATION_CHECKS array, check functions
  - phase: 03-03
    provides: verifyPayment() orchestrator
provides:
  - POST /verify HTTP endpoint as Fastify plugin
  - Request validation with Zod (invalid_request on failure)
  - VerifyContext assembly from parsed request + server config
  - Integration of verification pipeline into server
affects: [04-payment-flow settlement, future route middleware]

# Tech tracking
tech-stack:
  added: []
  patterns: [vi.mock with source-relative path for module mocking in Vitest integration tests]

key-files:
  created:
    - src/routes/verify.ts
    - tests/integration/verify-route.test.ts
  modified:
    - src/server.ts

key-decisions:
  - "vi.mock requires source-relative path (../../src/verify/verify-payment.js) not alias (@/verify/verify-payment.js) when mocking modules imported via relative paths in source code"
  - "beforeEach mockReset for test isolation -- mockResolvedValueOnce leaves state across tests"
  - "HTTP 500 only for unexpected errors (CML WASM crash) -- all validation/verification failures are HTTP 200"

patterns-established:
  - "Route plugin pattern: Zod safeParse -> assemble context -> call service -> return result"
  - "Source-relative vi.mock path resolution for integration test module mocking"

# Metrics
duration: 5min
completed: 2026-02-06
---

# Phase 3 Plan 04: POST /verify Route Integration Summary

**POST /verify Fastify plugin with Zod request validation, VerifyContext assembly from server state, verifyPayment() integration, and 10 integration tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-06T13:18:01Z
- **Completed:** 2026-02-06T13:22:34Z
- **Tests added:** 10 (integration)
- **Total tests:** 167 (from 157)
- **Files created:** 2
- **Files modified:** 1

## Accomplishments

- `POST /verify` route plugin created following the exact pattern of `src/routes/health.ts`
- Request body validated via `VerifyRequestSchema.safeParse()`:
  - Parse failure returns HTTP 200 with `{ isValid: false, invalidReason: 'invalid_request', extensions: { errors } }`
  - Zod issue messages included in extensions.errors array
- `VerifyContext` assembled from parsed request + `fastify.config.chain`:
  - `scheme`, `network`, `payTo`, `maxTimeoutSeconds` from PaymentRequirements
  - `transactionCbor`, `payerAddress` from CardanoPayload
  - `requiredAmount` as BigInt from string maxAmountRequired
  - `configuredNetwork` via CAIP2_CHAIN_IDS lookup from chain config network
  - `feeMin`/`feeMax` as BigInt from verification config
  - `getCurrentSlot` closure over `fastify.chainProvider.getCurrentSlot()`
  - `requestedAt` via `Date.now()`
- `verifyPayment(ctx, fastify.log)` called with assembled context + Fastify logger
- Try/catch wraps verification call: unexpected errors return HTTP 500 with generic message (no internal details leaked)
- Plugin registered in `server.ts` alongside healthRoutesPlugin
- 10 integration tests cover: valid pass, valid fail, context assembly, 4 invalid request variants, unexpected error, route exists, GET returns 404

## Task Commits

1. **Task 1: Create POST /verify route plugin** - `36b28c1` (feat)
2. **Task 2: Register verify route and add integration tests** - `99ae7fb` (feat)

## Files Created/Modified

- `src/routes/verify.ts` - POST /verify Fastify plugin: Zod validation, VerifyContext assembly, verifyPayment call, error handling
- `tests/integration/verify-route.test.ts` - 10 integration tests with mocked verifyPayment, 314 lines
- `src/server.ts` - Added verifyRoutesPlugin import and registration

## Decisions Made

- `vi.mock` with source-relative path (`../../src/verify/verify-payment.js`) required for mocking modules imported via relative paths in source files. The `@/` alias path does not match module IDs when the source file uses relative imports.
- `beforeEach(() => mockVerifyPayment.mockReset())` for test isolation -- `mockResolvedValueOnce` state persists across tests without explicit reset.
- HTTP 500 returned only for truly unexpected errors (CML WASM crash, etc.). All validation and verification failures return HTTP 200 per locked decision.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vi.mock path alias does not match source-relative imports**
- **Found during:** Task 2 test execution
- **Issue:** `vi.mock('@/verify/verify-payment.js')` does not intercept the module when the source file (`src/routes/verify.ts`) imports via relative path `../verify/verify-payment.js`. Vitest resolves these to different module IDs.
- **Fix:** Changed mock path to source-relative `../../src/verify/verify-payment.js` (relative from test file location)
- **Files modified:** tests/integration/verify-route.test.ts
- **Impact:** Mock pattern documented for future integration tests

**2. [Rule 1 - Bug] mockResolvedValueOnce state leaks across tests**
- **Found during:** Task 2 test execution
- **Issue:** `toHaveBeenCalledOnce()` assertion failed because mock call count accumulated across tests
- **Fix:** Added `beforeEach(() => mockVerifyPayment.mockReset())` for proper test isolation
- **Files modified:** tests/integration/verify-route.test.ts
- **Impact:** Standard test hygiene, no scope change

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both necessary for correct test execution. No scope changes.

## Issues Encountered

Vitest `vi.mock` path resolution is subtler than expected for source files using relative imports. When a source file imports `../verify/verify-payment.js`, the mock must use a path that resolves to the same absolute module ID. The `@/` alias works for direct imports in tests but not for intercepting imports made by other source modules via relative paths. Using source-relative paths from the test file (`../../src/...`) is the reliable approach.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3 (Verification) is COMPLETE:
  - 03-01: Zod schemas, CAIP-2 constants, config extension
  - 03-02: CBOR deserialization, 8 check functions
  - 03-03: verifyPayment() orchestrator with collect-all-errors
  - 03-04: POST /verify route + server integration
- The verification pipeline is fully operational: HTTP request -> Zod validation -> VerifyContext assembly -> verifyPayment() -> HTTP response
- Phase 4 (Payment Flow) can build on this endpoint for settlement
- 167 tests across 11 suites, all passing

## Self-Check: PASSED
