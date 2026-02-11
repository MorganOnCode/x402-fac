---
phase: 06-security-hardening
plan: 01
subsystem: testing
tags: [coverage, error-handler, health-endpoint, security, testing, vitest]
dependency_graph:
  requires: [error-handler-plugin, health-routes-plugin, sentry-integration]
  provides: ["error handler 100% coverage", "health endpoint 89% coverage", "coverage thresholds 80/65/75/80"]
  affects: [vitest.config.ts]
tech_stack:
  added: []
  patterns: [vi.hoisted-for-mock-functions, minimal-fastify-server-for-plugin-tests, redis-mock-via-decorate]
key_files:
  created:
    - tests/unit/plugins/error-handler.test.ts
    - tests/unit/routes/health.test.ts
  modified:
    - vitest.config.ts
decisions:
  - vi.hoisted() required for mock functions referenced in vi.mock factories (Vitest hoisting)
  - Minimal Fastify server (no chain layer) for plugin-level testing avoids Redis/Lucid mock overhead
  - requestIdHeader option required on test server for x-request-id propagation testing
  - Health endpoint outer .catch() wrappers and unhealthy path are unreachable with current checkIpfs placeholder
  - Type assertion (as never) for Redis mock in Fastify decorator to satisfy strict typing
metrics:
  duration: 6 min
  completed: 2026-02-11
---

# Phase 6 Plan 1: Coverage Gap Closure Summary

Error handler plugin at 100% coverage (all sanitization branches, Sentry capture, dev/prod modes); health endpoint at 89% statements / 61% branches; coverage thresholds raised to 80/65/75/80 preventing regression.

## What Was Built

### Task 1: Error Handler Plugin Unit Tests (16 tests)

**tests/unit/plugins/error-handler.test.ts** -- Comprehensive tests using a minimal Fastify server with a configurable `/test-error` route:

**Production mode sanitization (6 tests):**
- Rate limit (429) messages pass through unchanged
- `INTERNAL_ERROR` code sanitized to "An internal error occurred"
- `SERVER_*` codes (e.g., `SERVER_TIMEOUT`) sanitized to generic message
- `CONFIG_*` codes pass through (startup issues visible to operators)
- Client errors (400-level) pass through with original message
- Default/unknown codes pass through (user-facing messages)

**Sentry capture (3 tests):**
- 500 errors captured with `requestId`, `url`, `method` context
- 400 errors excluded from Sentry
- 502+ errors captured (boundary test)

**Development mode (2 tests):**
- Stack trace included in response when `isDev: true`
- Raw messages returned without sanitization

**Not-found handler (2 tests):**
- Structured 404 with `code: 'NOT_FOUND'`, method and URL in message
- `requestId` and `timestamp` present in 404 responses

**Response structure (3 tests):**
- `requestId` and `timestamp` always present
- Defaults to 500/INTERNAL_ERROR when no status/code specified
- No stack trace in production mode

Coverage result: **100% statements, 100% branches, 100% functions, 100% lines**

### Task 2: Health Endpoint Unit Tests (15 tests)

**tests/unit/routes/health.test.ts** -- Tests all status determination paths using minimal Fastify with Redis mock decoration:

**Status paths (3 describe blocks, 8 tests):**
- All up (Redis ping succeeds) -> `healthy`, HTTP 200
- Redis down (ping rejects) -> `degraded`, HTTP 200, error message in Redis dependency
- Redis not configured (no decoration) -> `healthy` with placeholder `{ status: 'up', latency: 0 }`

**Edge cases (3 tests):**
- Slow Redis ping measures latency > 0
- Non-Error thrown by Redis ping -> `'Unknown error'` string
- Synchronous throw from Redis getter -> caught by checkRedis try/catch

**Response shape (4 tests):**
- ISO timestamp format validation
- Uptime positive number
- Version string present
- Both `redis` and `ipfs` dependency keys present

Coverage result: **89.28% statements, 61.11% branches, 75% functions, 88.46% lines**

Note: The 3 uncovered statements (lines 50-56, 76) are the outer `.catch()` wrappers on `Promise.all` and the `unhealthy` status path. These are provably unreachable with the current implementation because `checkRedis` has its own internal try/catch (so the outer `.catch()` never fires) and `checkIpfs()` always resolves with `{ status: 'up' }` (so `allDown` can never be true). These defensive wrappers will become testable when IPFS checking is implemented in Phase 7.

### Task 3: Coverage Threshold Increase

**vitest.config.ts** -- Thresholds raised from 60/40/60/60 to 80/65/75/80:

| Metric     | Old | New | Current Actual |
|------------|-----|-----|----------------|
| Statements | 60  | 80  | 90.57          |
| Branches   | 40  | 65  | 82.98          |
| Functions  | 60  | 75  | 84.78          |
| Lines      | 60  | 80  | 90.89          |

Set ~10% below current actuals to allow reasonable fluctuation while preventing significant regression.

## Deviations from Plan

None -- plan executed exactly as written.

## Test Results

- 281 tests pass (246 existing + 16 error handler + 15 health + 4 from security controls)
- 18 test suites, all passing
- Zero type errors, zero lint violations
- Build succeeds
- Coverage thresholds pass at 80/65/75/80

## Commits

| Task | Commit  | Description |
|------|---------|-------------|
| 1    | 28d6a87 | 16 error handler unit tests (all sanitization branches, Sentry, dev/prod) |
| 2    | 28d6a87 | 15 health endpoint unit tests (healthy/degraded/not-configured/edge cases) |
| 3    | 9143474 | Coverage thresholds raised to 80/65/75/80 |

Note: Tasks 1 and 2 were merged into commit 28d6a87 due to lint-staged stash operations during parallel execution. Task 3 thresholds were absorbed into 9143474 by a concurrent 06-02 commit. All code changes are present at HEAD.

## Self-Check: PASSED

- [x] tests/unit/plugins/error-handler.test.ts exists
- [x] tests/unit/routes/health.test.ts exists
- [x] 06-01-SUMMARY.md exists
- [x] Commit 28d6a87 exists in history
- [x] Commit 9143474 exists in history
- [x] 281 tests pass
- [x] Build succeeds
- [x] Coverage thresholds pass
