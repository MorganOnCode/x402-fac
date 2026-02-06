---
phase: 04-settlement
plan: 03
subsystem: routes
tags: [fastify, settle, status, http, integration-tests]
requires: ["04-01", "04-02"]
provides: ["POST /settle endpoint", "POST /status endpoint", "Phase 4 feature-complete"]
affects: ["05-stablecoins", "07-integration-tests"]
tech-stack:
  added: []
  patterns: ["fastify-plugin route pattern", "Zod safeParse validation", "HTTP 200 for all application outcomes"]
key-files:
  created:
    - src/routes/settle.ts
    - src/routes/status.ts
    - tests/integration/settle-route.test.ts
    - tests/integration/status-route.test.ts
  modified:
    - src/server.ts
    - src/chain/provider.ts
key-decisions:
  - decision: "Public blockfrostClient accessor on ChainProvider"
    rationale: "Routes need BlockfrostClient for settlement submission and status queries; minimal 2-line getter avoids exposing internal field"
  - decision: "Mock settlePayment at function level for settle route tests"
    rationale: "Route integration tests focus on HTTP handling, not settlement orchestration; mocking at function boundary matches verify-route pattern"
  - decision: "Mock blockfrost-client.js module for status route tests"
    rationale: "Status route accesses blockfrostClient via chain provider; mocking the module factory gives control over getTransaction returns"
duration: "4 min"
completed: 2026-02-06
---

# Phase 4 Plan 3: Settlement Route Wiring Summary

**POST /settle and POST /status routes with server integration and 16 integration tests**

## Performance

| Metric | Value |
|--------|-------|
| Duration | 4 min |
| Tasks | 2/2 |
| Tests added | 16 (9 settle + 7 status) |
| Tests total | 204 across 14 suites |
| Lines added | ~710 |
| Build | Clean |
| Lint | Clean |
| Types | Clean |

## Accomplishments

### Task 1: POST /settle and POST /status Route Plugins
- Created `src/routes/settle.ts` following exact pattern from POST /verify
- Zod safeParse validation -> VerifyContext assembly -> settlePayment() call -> HTTP 200
- Created `src/routes/status.ts` for lightweight confirmation polling
- Zod safeParse validation -> Blockfrost getTransaction() query -> HTTP 200
- Added `blockfrostClient` public getter to ChainProvider (2-line addition)
- Both routes return HTTP 200 for all application outcomes, HTTP 500 for unexpected errors

### Task 2: Server Wiring and Integration Tests
- Registered `settleRoutesPlugin` and `statusRoutesPlugin` in `createServer`
- Server now has 4 route plugins: health, verify, settle, status
- 9 settle integration tests: success, verification failure, confirmation timeout, missing transaction, missing paymentRequirements, empty body, context assembly verification, unexpected error (500), route existence
- 7 status integration tests: confirmed tx, pending tx, invalid hash format, empty body, missing paymentRequirements, unexpected error (500), route existence

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | aa9afa8 | feat(04-03): create POST /settle and POST /status route plugins |
| 2 | b21258d | feat(04-03): wire settle/status routes into server with integration tests |

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| src/routes/settle.ts | POST /settle route plugin | 82 |
| src/routes/status.ts | POST /status route plugin | 58 |
| tests/integration/settle-route.test.ts | Settle route integration tests | 243 |
| tests/integration/status-route.test.ts | Status route integration tests | 212 |

## Files Modified

| File | Change |
|------|--------|
| src/chain/provider.ts | Added public `blockfrostClient` getter |
| src/server.ts | Imported and registered settleRoutesPlugin and statusRoutesPlugin |

## Decisions Made

1. **Public blockfrostClient accessor on ChainProvider** -- Routes need BlockfrostClient for settlement submission and status queries. Adding a 2-line public getter is the minimal change that avoids exposing the private field directly.

2. **Mock settlePayment at function level for settle route tests** -- Route integration tests focus on HTTP request/response handling, not the settlement orchestration pipeline. Mocking at the settlePayment() function boundary matches the established pattern from verify-route.test.ts (which mocks verifyPayment).

3. **Mock blockfrost-client.js module for status route tests** -- The status route accesses `chainProvider.blockfrostClient.getTransaction()`. Mocking the entire blockfrost-client module factory at import time gives clean control over getTransaction return values without needing to reach into the chain provider internals.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added blockfrostClient accessor to ChainProvider**
- **Found during:** Task 1
- **Issue:** `blockfrost` property is private on ChainProvider; routes need access for settlement submission and status queries
- **Fix:** Added `get blockfrostClient(): BlockfrostClient` public accessor (2 lines)
- **Files modified:** src/chain/provider.ts
- **Commit:** aa9afa8

**2. [Rule 3 - Blocking] Test file location adjusted**
- **Found during:** Task 2
- **Issue:** Plan specified `tests/integration/routes/settle.test.ts` but existing integration tests are flat in `tests/integration/` (e.g., `verify-route.test.ts`, `health.test.ts`)
- **Fix:** Created tests at `tests/integration/settle-route.test.ts` and `tests/integration/status-route.test.ts` to match existing convention
- **Files created:** tests/integration/settle-route.test.ts, tests/integration/status-route.test.ts

## Issues Encountered

None.

## Next Phase Readiness

Phase 4 is now feature-complete:
- **POST /settle**: Accepts signed CBOR transaction, re-verifies, deduplicates via Redis, submits to Blockfrost, polls for on-chain confirmation, returns typed result
- **POST /status**: Accepts tx hash, queries Blockfrost for confirmation status, returns confirmed/pending/not_found
- **All endpoints**: HTTP 200 for application outcomes, HTTP 500 for unexpected errors
- **204 tests** passing across 14 suites

Ready for:
- Phase 4 verification/UAT
- Phase 5 (Stablecoins/Multi-asset)

## Self-Check: PASSED
