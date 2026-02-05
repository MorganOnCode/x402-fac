---
phase: 02-chain-provider
plan: 04
subsystem: concurrency
tags: [utxo, reservation, locking, ttl, redis, tdd, double-spend-prevention]

# Dependency graph
requires:
  - phase: 02-01
    provides: Reservation type, ChainConfig with reservation settings
  - phase: 02-03
    provides: Redis client factory, fire-and-forget pattern, ioredis
provides:
  - UtxoReservation class with TTL-based locking and Redis persistence
  - createUtxoReservation factory from ChainConfig
  - Crash recovery via loadFromRedis()
affects: [02-05, 04-settlement, 06-batching]

# Tech tracking
tech-stack:
  added: []
  patterns: [utxo-reservation, ttl-expiry, concurrent-cap, crash-recovery]

key-files:
  created:
    - src/chain/utxo-reservation.ts
    - tests/unit/chain/utxo-reservation.test.ts
  modified: []

key-decisions:
  - "In-memory Map + fire-and-forget Redis persistence for speed with durability"
  - "cleanExpired() called at start of reserve/isReserved/getActiveCount for lazy cleanup"
  - "loadFromRedis() is startup-only, not hot path -- uses keys() + mget() batch"
  - "releaseAll(requestId) for transaction failure cleanup"

patterns-established:
  - "TTL-based reservation: Map<utxoRef, Reservation> with expiresAt timestamp"
  - "Concurrent cap: check Map.size >= maxConcurrent before reserving"
  - "Crash recovery: Redis keys(pattern) + mget for batch load, skip expired"
  - "Fire-and-forget PX: redis.set(key, value, 'PX', ttlMs).catch(() => {})"

# Metrics
duration: 4min
completed: 2026-02-05
---

# Phase 2 Plan 4: UTXO Reservation System Summary

**UTXO reservation system with TTL-based locking, concurrent cap enforcement, and Redis crash recovery built via TDD**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-05T02:02:00Z
- **Completed:** 2026-02-05T02:05:29Z
- **TDD Phases:** RED (27 failing) -> GREEN (27 passing) -> REFACTOR (skipped, code clean)
- **Files created:** 2
- **Test count:** 27

## Accomplishments
- UtxoReservation class: reserve/release/releaseAll with Map-based locking
- TTL-based auto-expiry via cleanExpired() called lazily on each read/write operation
- Max concurrent reservations cap (default 20, configurable)
- Fire-and-forget Redis persistence with PX TTL for crash recovery
- loadFromRedis() startup recovery: keys() scan + mget() batch fetch, skip expired
- releaseAll(requestId) for transaction failure cleanup (frees all UTXOs for a request)
- createUtxoReservation() factory reads ChainConfig.reservation settings

## Task Commits

TDD cycle committed atomically:

1. **RED: Failing tests** - `9ec0c21` (test)
   - 27 tests covering all reservation behaviors
   - Stub source with throw 'Not implemented'
2. **GREEN: Implementation** - `9ff3eb7` (feat)
   - Full UtxoReservation class + factory
   - All 27 tests passing

**REFACTOR:** Skipped -- implementation clean, follows existing patterns.

## Files Created

- `src/chain/utxo-reservation.ts` (223 lines) - UtxoReservation class with Map + Redis persistence
- `tests/unit/chain/utxo-reservation.test.ts` (382 lines) - 27 tests with mock Redis and fake timers

## Test Coverage

| Area | Tests | Description |
|------|-------|-------------|
| reserve() | 7 | Success, conflict, Redis persistence, data correctness, cap, expiry cleanup |
| release() | 4 | Re-reservation, Redis delete, debug logging, graceful no-op |
| releaseAll() | 3 | By requestId, Redis deletes, isolation from other requests |
| isReserved() | 3 | Active, unreserved, expired |
| getActiveCount() | 3 | Zero, after reserve/release, after expiry |
| getReservation() | 2 | Active return, undefined for missing |
| loadFromRedis() | 4 | Recovery, skip expired, multiple valid, empty |
| Factory | 1 | createUtxoReservation from config |

## Decisions Made
- **Lazy cleanup over scheduled:** cleanExpired() runs at the start of reserve/isReserved/getActiveCount rather than on a timer. Simpler, no background tasks, sufficient for our expected throughput.
- **PX over EX for Redis TTL:** Using millisecond precision (PX) to match the in-memory ttlMs exactly. Redis auto-expires matching the in-memory cleanup.
- **loadFromRedis startup-only:** Uses `redis.keys('reservation:*')` which is O(N). Acceptable at startup, never called in hot path.
- **releaseAll by requestId:** When a transaction fails, all UTXOs reserved for that request must be freed atomically. Iterates Map once, calling release() for each match.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
- Pre-commit hook caught useless constructor in initial stub (ESLint `no-useless-constructor`). Fixed by storing redis field in stub constructor.
- Pre-commit hook caught non-null assertions (`!`) in tests. Replaced with optional chaining (`?.`) for lint compliance.

## Next Phase Readiness
- UtxoReservation ready for Plan 05 (ChainProvider orchestrator) to instantiate
- createUtxoReservation() factory takes ChainConfig and Redis client directly
- loadFromRedis() should be called during server startup in Plan 05
- releaseAll() integrates with settlement error handling in Phase 4

---
*Phase: 02-chain-provider*
*Completed: 2026-02-05*
