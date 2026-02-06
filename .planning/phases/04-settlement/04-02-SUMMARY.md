---
phase: "04-settlement"
plan: "02"
subsystem: "settlement-orchestrator"
tags: ["settlement", "tdd", "redis", "dedup", "blockfrost", "polling"]

dependency-graph:
  requires: ["04-01"]
  provides: ["settle-payment-orchestrator", "poll-confirmation", "dedup-key"]
  affects: ["04-03"]

tech-stack:
  added: []
  patterns: ["redis-set-nx-dedup", "poll-with-async-sleep", "defense-in-depth-reverify", "tdd-red-green"]

key-files:
  created:
    - "src/settle/settle-payment.ts"
    - "tests/unit/settle/settle-payment.test.ts"
  modified:
    - "src/settle/index.ts"

key-decisions:
  - decision: "Hardcoded constants for poll interval (5s), timeout (120s), dedup TTL (24h)"
    rationale: "Per research recommendation -- unlikely to change, easy to extract to config later"
  - decision: "RedisLike interface instead of importing ioredis type"
    rationale: "Minimal dependency surface; only needs set() and get(); easier to mock in tests"
  - decision: "handleExistingRecord extracted as private helper"
    rationale: "Keeps settlePayment() focused on happy path; dedup branch logic isolated"
  - decision: "Import order: type imports before value imports within groups"
    rationale: "ESLint import/order requires type imports to precede value imports in parent-relative group"

metrics:
  duration: "6 min"
  completed: "2026-02-06"
  tests-added: 12
  tests-total: 188
---

# Phase 4 Plan 2: Settlement Orchestrator Summary

**One-liner:** TDD-built settlePayment() orchestrator with SHA-256 Redis NX dedup, Blockfrost submit/poll, and 12-test state machine coverage

## Performance

| Metric | Value |
|--------|-------|
| Duration | 6 min |
| Tests added | 12 |
| Tests total | 188 (all passing) |
| Build | Clean |
| Lint | Clean |
| Type check | Clean |

## Accomplishments

### Task 1 (TDD): Settlement orchestrator

**RED phase (commit f261002):**
- 12 test cases covering the full settlePayment() state machine
- Tests for: happy path, verification failure, 4 dedup scenarios, 2 submit errors, poll timeout, poll retry, dedup key format
- Stub implementation that throws "Not implemented"

**GREEN phase (commit 620042c):**
- `computeDedupKey(cborBytes)` -- SHA-256 hash with `settle:` prefix
- `pollConfirmation(txHash, blockfrost, timeoutMs, intervalMs, logger)` -- async poll loop with setTimeout-based sleep
- `settlePayment(ctx, cborBytes, blockfrost, redis, network, logger)` -- full orchestrator
- `handleExistingRecord()` -- private helper for dedup branch logic
- `RedisLike` interface exported for route handler usage
- Barrel export updated in `src/settle/index.ts`

**State machine flow:**
1. Re-verify via `verifyPayment()` (defense-in-depth)
2. Compute dedup key, claim via Redis SET NX with 24h TTL
3. If dedup hit: check existing record (confirmed/submitted/timeout/failed)
4. Submit CBOR to Blockfrost via `submitTransaction()`
5. Poll `getTransaction()` every 5s, timeout at 120s
6. Update Redis record at each state transition
7. Return typed `SettleResult`

## Task Commits

| Phase | Commit | Description |
|-------|--------|-------------|
| RED | f261002 | test(04-02): add failing tests for settlement orchestrator |
| GREEN | 620042c | feat(04-02): implement settlement orchestrator |

## Files Created

| File | Purpose |
|------|---------|
| `src/settle/settle-payment.ts` | Settlement orchestrator: settlePayment(), pollConfirmation(), computeDedupKey() (272 lines) |
| `tests/unit/settle/settle-payment.test.ts` | 12 unit tests covering full state machine (460 lines) |

## Files Modified

| File | Changes |
|------|---------|
| `src/settle/index.ts` | Added settlePayment and RedisLike exports, removed future-export comment |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Hardcoded constants (5s poll, 120s timeout, 24h TTL) | Per research -- unlikely to change, easy to extract later |
| RedisLike interface (not ioredis import) | Minimal dependency surface; easier to mock |
| handleExistingRecord() extracted | Isolates dedup branch logic from happy path |
| Import order: type before value in parent group | ESLint import/order rule requirement |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Import order lint violations**
- **Found during:** GREEN phase
- **Issue:** ESLint import/order requires type imports before value imports within the parent-relative group
- **Fix:** Reordered imports: `type { VerifyContext }` before `{ verifyPayment }` in the `../verify/` group
- **Files modified:** `src/settle/settle-payment.ts`
- **Commit:** 620042c

**2. [Rule 3 - Blocking] Test type compatibility with vi.fn() mocks**
- **Found during:** RED phase
- **Issue:** TypeScript couldn't match `vi.fn()` return type to `RedisLike` interface in test file
- **Fix:** Used `any[]` typed settlePayment variable in tests to avoid mock type friction
- **Files modified:** `tests/unit/settle/settle-payment.test.ts`
- **Commit:** f261002

## Issues Encountered

None.

## Next Phase Readiness

Plan 04-03 (route wiring) has all prerequisites:
- `settlePayment()` exported from `src/settle/index.ts`
- `RedisLike` interface exported for route handler to pass Redis client
- `SettleRequestSchema` from Plan 01 ready for request validation
- All 188 tests passing, build and lint clean

No blockers for Plan 04-03.

## Self-Check: PASSED
