---
phase: 02-chain-provider
plan: 05
subsystem: chain
tags: [lucid-evolution, blockfrost, cardano, chain-provider, redis, utxo, server-lifecycle]

# Dependency graph
requires:
  - phase: 02-02
    provides: BlockfrostClient with retry logic
  - phase: 02-03
    provides: Redis client factory, two-layer UTXO cache
  - phase: 02-04
    provides: UTXO reservation system with TTL
provides:
  - ChainProvider orchestrator combining cache, reservation, Blockfrost, and Lucid
  - Lucid Evolution initialization with Blockfrost provider
  - Server lifecycle integration (Redis connect, chain init, shutdown hook)
  - Barrel exports for entire chain module
affects: [03-verification, 04-settlement, 05-stablecoins]

# Tech tracking
tech-stack:
  added: ["@lucid-evolution/lucid@0.4.29", "@lucid-evolution/provider@0.1.90"]
  patterns: ["cache-first query strategy", "orchestrator pattern", "server lifecycle hooks", "protocol parameter caching"]

key-files:
  created:
    - src/chain/lucid-provider.ts
    - src/chain/provider.ts
    - src/chain/index.ts
    - tests/unit/chain/provider.test.ts
  modified:
    - src/server.ts
    - src/types/index.ts
    - tests/integration/server.test.ts
    - tests/integration/health.test.ts
    - package.json

key-decisions:
  - "Mock ioredis and lucid in integration tests to avoid real connections"
  - "Lucid Blockfrost from @lucid-evolution/provider separate package"
  - "Protocol params cached 5min in-memory (no Redis needed, changes once per epoch)"
  - "Min UTXO floor at 1 ADA (1_000_000 lovelace) regardless of calculation"
  - "Chain init failure throws and prevents server startup"

patterns-established:
  - "ChainProvider orchestrator: single interface for all chain operations"
  - "Cache-first UTXO queries: cache.get -> blockfrost on miss -> cache.set"
  - "Server lifecycle hooks: Redis connect on startup, disconnect on close"
  - "Integration test mocking: vi.mock ioredis + lucid packages with class-based mocks"

# Metrics
duration: 9min
completed: 2026-02-05
---

# Phase 2 Plan 5: ChainProvider Orchestrator and Server Integration Summary

**ChainProvider orchestrator with cache-first UTXO queries, Lucid Evolution integration, and Fastify server lifecycle hooks for Redis and chain initialization**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-05T02:10:39Z
- **Completed:** 2026-02-05T02:19:59Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- ChainProvider orchestrates all chain components (Blockfrost, cache, reservation, Lucid) through a single interface
- Lucid Evolution initialized with Blockfrost provider for transaction building in future phases
- Server startup creates Redis connection, initializes ChainProvider, decorates Fastify instance
- All 91 tests pass (14 new provider tests, 77 existing tests including updated integration tests)
- Min UTXO lovelace calculation with protocol parameter caching for pre-validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Lucid provider, ChainProvider orchestrator, and barrel exports** - `8ade6f7` (feat)
2. **Task 2: Wire chain layer into server lifecycle** - `f11614f` (feat)

## Files Created/Modified
- `src/chain/lucid-provider.ts` - Lucid Evolution initialization with Blockfrost provider
- `src/chain/provider.ts` - ChainProvider orchestrating cache, reservation, Blockfrost, Lucid
- `src/chain/index.ts` - Barrel exports for entire chain module
- `src/server.ts` - Chain layer initialization and shutdown hooks
- `src/types/index.ts` - Fastify augmentation with redis and chainProvider
- `tests/unit/chain/provider.test.ts` - 14 unit tests for ChainProvider
- `tests/integration/server.test.ts` - Updated with chain layer mocks
- `tests/integration/health.test.ts` - Updated with chain layer mocks
- `package.json` - Added @lucid-evolution/lucid and @lucid-evolution/provider

## Decisions Made
- **@lucid-evolution/provider as separate dependency**: Blockfrost class is not re-exported from @lucid-evolution/lucid; required separate install
- **Protocol parameter caching in-memory (5 min)**: Params change once per epoch (~5 days), no need for Redis storage
- **Min UTXO floor at 1 ADA**: Regardless of calculation, minimum is 1,000,000 lovelace (practical minimum on Cardano)
- **Chain init failure prevents server startup**: Facilitator is useless without chain access, so fail fast
- **Class-based ioredis mock in integration tests**: `vi.fn().mockImplementation()` doesn't work as constructor; class mock required
- **Mock Lucid at package level in integration tests**: Prevents libsodium native module loading in test environment

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed @lucid-evolution/provider as separate dependency**
- **Found during:** Task 1 (Lucid provider creation)
- **Issue:** Blockfrost class is exported from @lucid-evolution/provider, not @lucid-evolution/lucid
- **Fix:** Added @lucid-evolution/provider@0.1.90 as direct dependency
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** Import resolves, tests pass
- **Committed in:** 8ade6f7 (Task 1 commit)

**2. [Rule 3 - Blocking] Integration tests required comprehensive mocking for chain layer**
- **Found during:** Task 2 (Server integration)
- **Issue:** Integration tests called createServer() which now initializes Redis and Lucid, causing libsodium native module errors and real Redis connection attempts
- **Fix:** Added vi.mock for @lucid-evolution/lucid, @lucid-evolution/provider, and ioredis with class-based mocks in both integration test files
- **Files modified:** tests/integration/server.test.ts, tests/integration/health.test.ts
- **Verification:** All 91 tests pass
- **Committed in:** f11614f (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for correct test execution. No scope creep.

## Issues Encountered
- libsodium-wrappers-sumo ESM import fails in vitest when loading Lucid Evolution transitively; resolved by mocking at package level
- vi.fn().mockImplementation() does not work as a constructor for ioredis; switched to class-based mock

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 2 (Chain Provider) is fully complete
- ChainProvider available as `fastify.chainProvider` in all route handlers
- Redis available as `fastify.redis` for health checks and direct access
- Lucid Evolution ready for transaction building in Phase 4 (Settlement)
- Min UTXO calculation ready for Phase 5 (Stablecoins) multi-asset support
- No blockers for Phase 3 (Verification Layer)

---
*Phase: 02-chain-provider*
*Completed: 2026-02-05*
