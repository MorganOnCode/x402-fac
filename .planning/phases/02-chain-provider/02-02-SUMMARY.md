---
phase: 02-chain-provider
plan: 02
subsystem: blockfrost-client
tags: [blockfrost, retry, exponential-backoff, error-handling, tdd]
depends_on:
  requires: [02-01]
  provides: [blockfrost-client, withRetry, createBlockfrostClient]
  affects: [02-03, 02-04, 02-05]
tech-stack:
  added: ["@blockfrost/blockfrost-js@6.1.0"]
  patterns: [exponential-backoff-retry, error-mapping, 404-as-empty, api-key-safety]
key-files:
  created:
    - src/chain/blockfrost-client.ts
    - tests/unit/chain/blockfrost-client.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml
decisions:
  - id: retry-3-max
    decision: "Max 3 retries with 500ms base exponential backoff (500, 1000, 2000ms)"
    rationale: "Balances recovery from transient failures without excessive delay; matches CONTEXT.md locked decisions"
  - id: 404-empty-array
    decision: "Blockfrost 404 on address UTxOs returns empty array, not error"
    rationale: "Unused addresses are normal in Cardano; 404 is Blockfrost's way of saying no UTxOs exist"
  - id: api-key-never-logged
    decision: "projectId is private, never appears in error messages or log output"
    rationale: "API keys in logs are a common security vulnerability; enforced by test"
  - id: mock-class-for-constructor
    decision: "Mock BlockFrostAPI with class (not vi.fn) to support new operator"
    rationale: "vi.fn().mockImplementation() returns a function, not a constructor; class mock works with new"
metrics:
  duration: 8 min
  completed: 2026-02-05
---

# Phase 2 Plan 2: BlockfrostClient with Exponential Backoff Summary

Retry-wrapped Blockfrost API client using TDD with 18 tests covering exponential backoff timing (500ms/1000ms/2000ms), rate limit exhaustion to ChainRateLimitedError, network errors to ChainConnectionError, 404-as-empty-array for unused addresses, and API key safety.

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | cf2d9d4 | test | Failing tests for withRetry, BlockfrostClient, API key safety (RED phase) |
| 2 | 05f9614 | feat | Full implementation passing all 18 tests (GREEN phase) |

## What Was Built

### src/chain/blockfrost-client.ts (213 lines)

**withRetry<T> function (exported):**
- Accepts async function, label string, Fastify logger
- Exponential backoff: 500ms * 2^attempt (500, 1000, 2000ms delays)
- Max 3 retries (4 total attempts including initial)
- Retryable: 429, 500, 502, 503, 504, ECONNREFUSED, ETIMEDOUT, ECONNRESET, ECONNABORTED, EPIPE, EAI_AGAIN, ENETUNREACH
- Non-retryable errors thrown immediately without retry
- Rate limit exhaustion (429 after all retries) -> ChainRateLimitedError
- Network error exhaustion -> ChainConnectionError
- Structured logger.warn on each retry: `{ attempt, delay, label }`

**BlockfrostClient class (exported):**
- Constructor: `{ projectId, network, logger }` -- projectId is private
- Creates internal BlockFrostAPI with `rateLimiter: true`, `requestTimeout: 20_000`
- `getLatestBlock()` -- wraps `blocksLatest()` with retry
- `getEpochParameters()` -- wraps `epochsLatestParameters()` with retry
- `getAddressUtxos(address)` -- wraps `addressesUtxos(address)` with retry, catches 404 and returns `[]`

**createBlockfrostClient factory (exported):**
- Takes ChainConfig + logger, returns BlockfrostClient

### tests/unit/chain/blockfrost-client.test.ts (389 lines, 18 tests)

**withRetry tests (12):**
- Immediate success returns result, no retries
- 429 retry-then-success
- 500 server error retry
- 502, 503, 504 server error retries
- ECONNREFUSED network error retry
- ETIMEDOUT network error retry
- Precise exponential backoff timing verification (499ms no trigger, 500ms triggers)
- Rate limit exhaustion after 3 retries -> ChainRateLimitedError
- Network error exhaustion -> ChainConnectionError
- Non-retryable error (400) no retry
- 404 not retried
- Structured log warning with attempt/delay/label

**BlockfrostClient tests (4):**
- getAddressUtxos returns empty array on 404
- getAddressUtxos retries on 429 then returns result
- getLatestBlock returns block data
- getEpochParameters returns params

**Factory and safety tests (2):**
- createBlockfrostClient returns BlockfrostClient instance
- API key never in error messages or log output

## Test Results

- 18/18 tests pass
- All use fake timers for instant execution (no real delays)
- All use mocked BlockFrostAPI (no real Blockfrost calls)
- Zero unhandled promise rejections

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Mock class pattern**: Used class-based mock for BlockFrostAPI (instead of `vi.fn().mockImplementation`) because the constructor pattern requires `new` support.
2. **Early rejection handler pattern**: Attached `.catch()` before timer advances to prevent Node.js unhandled rejection warnings in retry exhaustion tests.
3. **Removed resolveBlockfrostUrl from client**: BlockFrostAPI derives URL from projectId prefix internally, so explicit URL resolution is not needed in the client constructor.

## Verification

- `pnpm test tests/unit/chain/blockfrost-client.test.ts`: 18/18 pass
- `pnpm typecheck`: 0 errors
- `pnpm lint` (on modified files): clean

## Next Phase Readiness

All subsequent plans can now import:
- `BlockfrostClient` class for Blockfrost API access with automatic retry
- `withRetry` function for custom retry-wrapped operations
- `createBlockfrostClient` factory for config-based instantiation

No blockers for 02-03 (UTxO cache), 02-04 (reservation), or 02-05 (provider plugin).
