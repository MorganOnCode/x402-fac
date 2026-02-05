---
phase: 02-chain-provider
plan: 03
subsystem: database
tags: [redis, ioredis, caching, bigint, utxo, two-layer-cache, health-check]

# Dependency graph
requires:
  - phase: 02-01
    provides: CachedUtxo type with bigint lovelace, ChainConfig with redis/cache settings
  - phase: 01-05
    provides: Health endpoint with placeholder dependency checks
provides:
  - Redis client factory with lazy connect and retry strategy
  - Two-layer UTXO cache (in-memory L1 + Redis L2) with BigInt-safe serialization
  - Real Redis health check via redis.ping() in health endpoint
  - Fastify instance Redis decoration type
affects: [02-04, 02-05, 03-reservation, 07-ipfs]

# Tech tracking
tech-stack:
  added: [ioredis@5.9.2]
  patterns: [two-layer-cache, bigint-serialization, lazy-connect, fire-and-forget-delete]

key-files:
  created:
    - src/chain/redis-client.ts
    - src/chain/utxo-cache.ts
    - tests/unit/chain/utxo-cache.test.ts
  modified:
    - src/routes/health.ts
    - src/types/index.ts

key-decisions:
  - "ioredis with lazyConnect for explicit connection control"
  - "BigInt serialized as digit-string with 'n' suffix for Redis storage"
  - "L1 invalidateAll clears Map only; L2 expires naturally via TTL"
  - "Health check returns placeholder when Redis not decorated"

patterns-established:
  - "Two-layer cache: L1 in-memory Map with expiresAt, L2 Redis with EX TTL"
  - "BigInt serialization: JSON replacer/reviver pattern with 'n' suffix convention"
  - "Fire-and-forget: catch(() => {}) for non-critical Redis deletes"
  - "Optional Fastify decoration: redis? property for gradual wiring"

# Metrics
duration: 6min
completed: 2026-02-05
---

# Phase 2 Plan 3: Redis Client and UTXO Cache Summary

**Two-layer UTXO cache (in-memory Map + Redis) with BigInt-safe serialization and real Redis health checking via ioredis**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-05T01:52:42Z
- **Completed:** 2026-02-05T01:58:18Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Redis client factory with lazy connect, retry strategy (200ms backoff, 2s cap), and connection event logging
- UtxoCache class with L1 (in-memory Map) and L2 (Redis) read-through, BigInt-safe serialization, TTL-based expiry
- Health endpoint upgraded from placeholder to real redis.ping() with latency measurement
- 11 unit tests covering cache read/write/invalidate, BigInt roundtrip, L1 expiry fallthrough to L2

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Redis client factory and UTXO cache** - `b10869b` (feat)
2. **Task 2: Wire real Redis health check into health endpoint** - `f299cf1` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `src/chain/redis-client.ts` - Redis client factory with lazy connect, retry strategy, event logging
- `src/chain/utxo-cache.ts` - Two-layer UTXO cache with BigInt serialization helpers
- `tests/unit/chain/utxo-cache.test.ts` - 11 tests: serialization roundtrip, L1/L2 cache behavior, invalidation
- `src/routes/health.ts` - Real Redis ping check replacing placeholder
- `src/types/index.ts` - Optional redis property on FastifyInstance

## Decisions Made
- Used ioredis with `lazyConnect: true` so caller controls when connection happens (Plan 05 will call `.connect()`)
- BigInt serialized as `"123n"` string pattern -- regex `/^\d+n$/` ensures only pure digit-n strings are parsed back
- `invalidateAll()` only clears L1 Map; L2 entries expire naturally via Redis TTL (simpler, avoids SCAN)
- Health check uses optional `fastify.redis` -- backward compatible when Redis not yet decorated

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- ESLint import ordering rules required external package imports (ioredis, fastify) before internal imports -- fixed in both source and test files
- Pre-commit hook caught `@typescript-eslint/no-empty-function` on fire-and-forget `.catch(() => {})` -- added eslint-disable comment
- Parallel agent (02-02) committed package.json with both ioredis and blockfrost-js dependencies together

## User Setup Required

None - no external service configuration required. Redis connection uses Docker Compose service already configured.

## Next Phase Readiness
- Redis client factory ready for Plan 05 (ChainProvider orchestrator) to instantiate and decorate on Fastify
- UtxoCache ready for Plan 04 (UTXO manager) to use as caching layer
- Health endpoint will report real Redis status once `fastify.redis` is decorated in Plan 05
- All 11 cache tests pass, health integration tests backward compatible

---
*Phase: 02-chain-provider*
*Completed: 2026-02-05*
