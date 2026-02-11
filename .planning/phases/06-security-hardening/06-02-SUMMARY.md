---
phase: 06-security-hardening
plan: 06-02
subsystem: chain
tags: [redis, cache, security, logging, config]
dependency-graph:
  requires: []
  provides:
    - "Structured Redis error logging (4 locations)"
    - "Bounded L1 UTXO cache (maxL1Entries with eviction)"
    - "Redis auth config (password, username, db)"
  affects:
    - src/chain/utxo-cache.ts
    - src/chain/utxo-reservation.ts
    - src/chain/config.ts
    - src/chain/redis-client.ts
    - config/config.example.json
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget with structured debug logging"
    - "Oldest-entry eviction for bounded in-memory cache"
    - "Optional config fields with Zod defaults for backward compatibility"
key-files:
  created: []
  modified:
    - src/chain/utxo-cache.ts
    - src/chain/utxo-reservation.ts
    - src/chain/config.ts
    - src/chain/redis-client.ts
    - config/config.example.json
    - tests/unit/chain/utxo-cache.test.ts
    - tests/integration/health.test.ts
    - tests/integration/server.test.ts
    - tests/integration/verify-route.test.ts
    - tests/integration/settle-route.test.ts
    - tests/integration/status-route.test.ts
    - tests/unit/chain/blockfrost-client.test.ts
    - tests/unit/chain/provider.test.ts
decisions:
  - "maxL1Entries as constructor option (not static constant) for testability"
  - "Debug level for fire-and-forget failures (not warn/error) since Redis is not source of truth"
  - "Redis db field has Zod default 0, password/username are optional with no default"
  - "config.example.json omits password field (optional, operators add when needed)"
metrics:
  duration: "9 min"
  completed: "2026-02-11"
  tasks: 3
  tests-added: 4
  tests-total: 281
  files-modified: 13
---

# Phase 6 Plan 02: Operational Resilience Gaps Summary

Structured Redis error logging at 4 fire-and-forget locations, bounded L1 UTXO cache at 10,000 entries with oldest-entry eviction, and Redis auth support (password, username, db) in config schema and client factory.

## Task 1: Replace silent Redis .catch() with structured logging

Replaced all 4 silent `.catch(() => {})` error swallowing patterns with debug-level structured logging across `utxo-cache.ts` and `utxo-reservation.ts`. Each catch handler now logs `{ err: err.message, redisKey }` with the message `'Redis fire-and-forget failed'`. Removed the associated `eslint-disable-next-line @typescript-eslint/no-empty-function` comments since handlers are no longer empty.

**Locations fixed:**
1. `utxo-cache.ts` `invalidate()` -- Redis DEL
2. `utxo-reservation.ts` `reserve()` -- Redis SET
3. `utxo-reservation.ts` `release()` -- Redis DEL
4. `utxo-reservation.ts` `cleanExpired()` -- Redis DEL

**Commit:** `7e2e698`

## Task 2: Bound L1 UTXO cache size

Added `maxL1Entries` constructor option to `UtxoCache` (default 10,000). When the L1 Map exceeds this cap, the entry with the oldest `expiresAt` timestamp is evicted. Eviction runs in both `set()` (after L1 write) and `get()` (after L2-to-L1 warming). A private `evictIfOverCap()` method performs the linear scan and logs evictions at debug level.

**4 new tests:**
- Eviction triggers on set() when cap exceeded (oldest entry removed)
- Eviction triggers on get() L2 warming when cap exceeded
- Debug logging on eviction with evictedAddress and cacheSize
- Default 10,000 cap when maxL1Entries not specified

**Commit:** `28d6a87`

## Task 3: Add Redis auth fields to config schema

Extended the `ChainConfigSchema.redis` object with three new fields: `password` (optional string), `username` (optional string), and `db` (integer 0-15, default 0). Updated `createRedisClient()` to spread auth fields into the ioredis constructor options when present. Updated `config.example.json` to show the `db` field. Password and username are omitted from the example since they are optional.

Updated 7 test files that construct `ChainConfig` objects directly (not through Zod parsing) to include `db: 0` for type compatibility with the new required `db` field on the parsed type.

**Commit:** `aa03500`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Update 7 test files with db: 0 for type compatibility**
- **Found during:** Task 3
- **Issue:** Adding `db` with Zod `.default(0)` to the redis schema made the parsed TypeScript type require `db` as a non-optional field. Test files constructing `ChainConfig` objects directly (bypassing Zod parsing) failed typecheck.
- **Fix:** Added `db: 0` to all 7 test files that construct redis config objects inline.
- **Files modified:** tests/integration/health.test.ts, tests/integration/server.test.ts, tests/integration/verify-route.test.ts, tests/integration/settle-route.test.ts, tests/integration/status-route.test.ts, tests/unit/chain/blockfrost-client.test.ts, tests/unit/chain/provider.test.ts
- **Commit:** `aa03500` (included in Task 3 commit)

**2. [Rule 3 - Blocking] Pre-existing unstaged files swept into commits by lint-staged**
- **Found during:** Task 1 and Task 2
- **Issue:** lint-staged pre-commit hook picked up previously staged files (error-handler.test.ts, health.test.ts, vitest.config.ts) from the working tree, including them in task commits. Commit messages were occasionally overridden by cached `.git/COMMIT_EDITMSG`.
- **Fix:** Amended commit messages where possible. The extra files are from the user's own prior work on 06-01 and are correct/passing. No code changes needed.
- **Impact:** Commits `7e2e698` and `28d6a87` contain a few extra files beyond the plan scope.

## Verification Results

- `pnpm build` -- success, zero errors
- `pnpm test` -- 18 files, 281 tests, all passing
- `grep -r 'catch(() => {})' src/chain/` -- zero results
- L1 cache has configurable maxL1Entries (default 10,000) with eviction
- Redis auth fields present in ChainConfigSchema and createRedisClient
- config.example.json updated with db field
- No regressions in existing tests

## Self-Check: PASSED

All 6 key files verified present. All 3 commits (7e2e698, 28d6a87, aa03500) verified in git log.
