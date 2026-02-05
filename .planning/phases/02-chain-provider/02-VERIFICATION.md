---
phase: 02-chain-provider
verified: 2026-02-05T04:58:11Z
status: passed
score: 8/8 must-haves verified
re_verification:
  previous_status: passed
  previous_score: 5/5
  previous_verified: 2026-02-05T09:23:00Z
  gaps_closed: []
  new_must_haves:
    - "Server starts with `pnpm dev` without ESM module resolution errors (02-06)"
    - "Config validation rejects missing chain section (Zod error, not import crash) (02-06)"
    - "All 91+ tests pass (02-06)"
  gaps_remaining: []
  regressions: []
---

# Phase 2: Chain Provider Verification Report

**Phase Goal:** Implement Cardano blockchain interaction with UTXO tracking and reservation
**Verified:** 2026-02-05T04:58:11Z
**Status:** passed
**Re-verification:** Yes — after 02-06 gap closure (ESM fix)

## Re-Verification Summary

**Previous verification (2026-02-05T09:23:00Z):** 5/5 truths verified, status: passed
**This verification:** 8/8 truths verified (5 original + 3 from 02-06), status: passed

**Changes since previous verification:**
- Plan 02-06 added pnpm override for libsodium-wrappers-sumo@0.8.2 to fix ESM import crash
- Added 3 new must-haves from 02-06 plan
- All previous truths remain verified (regression check passed)
- No gaps found

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Facilitator queries and tracks UTXO state from Blockfrost | ✓ VERIFIED | `ChainProvider.getUtxos()` queries Blockfrost via `BlockfrostClient.getAddressUtxos()`, caches results in two-layer cache (L1 in-memory + L2 Redis), 91 tests passing |
| 2 | UTXOs can be reserved to prevent contention during concurrent operations | ✓ VERIFIED | `UtxoReservation` class with TTL-based locking (default 120s), Redis persistence, `ChainProvider.reserveUtxo()` delegates to reservation system, tested with 27 unit tests |
| 3 | Transactions include correct min UTXO ADA for outputs | ✓ VERIFIED | `ChainProvider.getMinUtxoLovelace()` calculates from protocol parameters using formula `(160 + 2 + 28*numAssets) * coinsPerUtxoByte`, floors at 1 ADA, caches params for 5 minutes |
| 4 | Transactions use proper slot-based validity intervals | ✓ VERIFIED | `ChainProvider.getCurrentSlot()` queries latest block from Blockfrost, returns slot number for validity window calculation |
| 5 | Blockfrost API key is never logged or exposed in errors | ✓ VERIFIED | `projectId` marked sensitive in config schema (config.ts:12, 21), never logged (grep confirms zero log statements), private property in `BlockfrostClient` (blockfrost-client.ts:156), errors use generic labels not API keys |
| 6 | Server starts with `pnpm dev` without ESM module resolution errors | ✓ VERIFIED | Server process runs for 3+ seconds without ERR_MODULE_NOT_FOUND, fails at Redis connection (expected when Docker down), import chain works: index.ts → server.ts → chain/provider.ts → lucid-provider.ts → @lucid-evolution/lucid → libsodium-wrappers-sumo@0.8.2 |
| 7 | Config validation rejects missing chain section (Zod error, not import crash) | ✓ VERIFIED | Config with missing chain section throws ConfigInvalidError: "Invalid configuration: chain: Invalid input: expected object, received undefined" — Zod validation error, not ERR_MODULE_NOT_FOUND |
| 8 | All 91+ tests pass | ✓ VERIFIED | Test suite: 8 files, 91 tests passed, 0 failed, duration 632ms — no regressions after libsodium override |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/chain/types.ts` | Chain domain types | ✓ VERIFIED | 91 lines, exports CardanoNetwork, UtxoRef, CachedUtxo, Reservation, bigint for lovelace values |
| `src/chain/errors.ts` | Domain errors | ✓ VERIFIED | 38 lines, 5 error types (CHAIN_RATE_LIMITED, CHAIN_CONNECTION_ERROR, etc.) using @fastify/error pattern |
| `src/chain/config.ts` | Config schema | ✓ VERIFIED | 86 lines, ChainConfigSchema with mainnet guardrail, sensitive field documentation (lines 12-14) |
| `src/chain/blockfrost-client.ts` | Blockfrost client with retry | ✓ VERIFIED | 213 lines, exponential backoff (500ms/1000ms/2000ms), 18 unit tests, API key never logged |
| `src/chain/redis-client.ts` | Redis client factory | ✓ VERIFIED | 49 lines, lazy connect, retry strategy, event logging |
| `src/chain/utxo-cache.ts` | Two-layer cache | ✓ VERIFIED | 158 lines, L1 in-memory + L2 Redis, BigInt-safe serialization, 11 unit tests |
| `src/chain/utxo-reservation.ts` | Reservation system | ✓ VERIFIED | 223 lines, TTL-based locking, Redis persistence, crash recovery, 27 unit tests |
| `src/chain/lucid-provider.ts` | Lucid initialization | ✓ VERIFIED | 50 lines, Blockfrost provider setup, wallet selection, network config, uses @lucid-evolution/lucid (depends on libsodium-wrappers-sumo) |
| `src/chain/provider.ts` | ChainProvider orchestrator | ✓ VERIFIED | 314 lines, combines all components, cache-first queries, 14 unit tests |
| `src/chain/index.ts` | Barrel exports | ✓ VERIFIED | 38 lines, clean module API |
| `src/server.ts` | Server integration | ✓ VERIFIED | 104 lines, Redis connect, ChainProvider init, decorates Fastify, shutdown hook |
| `src/types/index.ts` | Type augmentation | ✓ VERIFIED | 20 lines, extends Fastify with config/redis/chainProvider |
| `package.json` | pnpm override for libsodium | ✓ VERIFIED | Lines 8-10: pnpm.overrides section pins libsodium-wrappers-sumo to 0.8.2 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| ChainProvider | UtxoCache | cache.get/set | ✓ WIRED | Lines 120, 130 in provider.ts — checks cache before Blockfrost |
| ChainProvider | UtxoReservation | reservation.reserve/release/isReserved | ✓ WIRED | Lines 143, 153, 160, 168 in provider.ts |
| ChainProvider | BlockfrostClient | blockfrost.getAddressUtxos/getLatestBlock/getEpochParameters | ✓ WIRED | Lines 126, 175, 257 in provider.ts |
| BlockfrostClient | withRetry | wraps all API calls | ✓ WIRED | Lines 176, 181, 190 in blockfrost-client.ts |
| Server | Redis | createRedisClient, connect, decorate | ✓ WIRED | Lines 69-72 in server.ts |
| Server | ChainProvider | createChainProvider, decorate | ✓ WIRED | Lines 82-83 in server.ts |
| Server | Shutdown | disconnectRedis in onClose hook | ✓ WIRED | Lines 88-91 in server.ts |
| package.json (pnpm.overrides) | node_modules/.pnpm/libsodium-wrappers-sumo@0.8.2 | pnpm install resolves override | ✓ WIRED | pnpm-lock.yaml contains "libsodium-wrappers-sumo: 0.8.2" entries, installed package uses package import `import e from"libsodium-sumo"` (not broken relative `./libsodium-sumo.mjs`) |

### Requirements Coverage

| Requirement | Status | Supporting Truths | Notes |
|-------------|--------|-------------------|-------|
| CARD-01: UTXO state with reservation | ✓ SATISFIED | Truth #1, #2 | Two-layer cache + TTL-based reservation system |
| CARD-02: ADA as payment currency | ✓ SATISFIED | Truth #1 | UTXO queries track lovelace balances (bigint) |
| CARD-05: Min UTXO calculation | ✓ SATISFIED | Truth #3 | Protocol params-based calculation with 1 ADA floor |
| CARD-06: Slot-based validity intervals | ✓ SATISFIED | Truth #4 | getCurrentSlot() provides current chain tip |

### Anti-Patterns Found

No blocker anti-patterns detected.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| - | - | - | - | No anti-patterns found |

**Summary:** Zero TODOs, FIXMEs, placeholders, or stub patterns detected in src/chain/. All files substantive (38-314 lines). No console.log-only implementations. No empty returns. pnpm override in package.json is clean configuration (not a workaround — this is the intended fix pattern for transitive dependency ESM bugs).

### Security Verification

**Security Checks from Roadmap:**

| Check | Status | Evidence |
|-------|--------|----------|
| Blockfrost API key stored in environment, not code | ✓ VERIFIED | `config.chain.blockfrost.projectId` from config.json (gitignored), not hardcoded |
| API key not logged in any request/response logs | ✓ VERIFIED | Grep shows zero log statements containing projectId or API key, marked sensitive in config.ts:12-14 |
| UTXO state integrity verified (no phantom UTXOs) | ✓ VERIFIED | UTXOs mapped directly from Blockfrost response, no fabrication, cache invalidation available |
| Rate limiting prevents API key abuse | ✓ VERIFIED | Blockfrost SDK's built-in rate limiter enabled (blockfrost-client.ts:169), exponential backoff on 429 |
| Error messages don't expose API key or internal state | ✓ VERIFIED | Errors use generic labels ("getAddressUtxos"), domain errors (ChainRateLimitedError) don't include credentials |

**Additional Security Findings:**

- **Mainnet Guardrail:** Network config validates mainnet requires explicit `MAINNET=true` env var (config.ts:66-72)
- **Sensitive Field Documentation:** Config schema explicitly marks `projectId`, `seedPhrase`, `privateKey` as sensitive with "never log" comments (config.ts:12-14, 21, 31, 33)
- **BigInt for Lovelace:** All lovelace/asset values use bigint to prevent precision loss above 2^53
- **TTL-based Reservation Cleanup:** Expired reservations auto-cleaned to prevent memory leaks
- **Redis Fire-and-Forget:** Redis persistence failures don't crash the system (catch + empty function)
- **ESM Security:** pnpm override pins transitive dependency to specific version (0.8.2), preventing unintended upgrades that could introduce vulnerabilities

### Automated Test Coverage

**Test Results:**
```
✓ tests/unit/sample.test.ts (2 tests)
✓ tests/unit/chain/utxo-cache.test.ts (11 tests)
✓ tests/unit/chain/utxo-reservation.test.ts (27 tests)
✓ tests/unit/config.test.ts (10 tests)
✓ tests/unit/chain/blockfrost-client.test.ts (18 tests)
✓ tests/unit/chain/provider.test.ts (14 tests)
✓ tests/integration/health.test.ts (4 tests)
✓ tests/integration/server.test.ts (5 tests)

Test Files: 8 passed (8)
Tests: 91 passed (91)
Duration: 632ms
```

**TypeCheck:** Zero errors
**Build:** Success (ESM + DTS in ~1800ms)

**Chain Layer Test Coverage:**
- BlockfrostClient: 18 tests (retry logic, error mapping, 404 handling)
- UtxoCache: 11 tests (L1/L2 hit/miss, BigInt serialization, invalidation)
- UtxoReservation: 27 tests (reserve/release, TTL expiry, Redis recovery, concurrency cap)
- ChainProvider: 14 tests (cache-first queries, balance calc, min UTXO, reservation delegation)

**No regressions after 02-06 libsodium override** — all 91 tests continue to pass.

### Human Verification Required

No human verification items needed — all truths verified programmatically.

---

## Verification Summary

**All must-haves verified.** Phase goal achieved. Gap closure (02-06) successful.

**Evidence:**

**Original Must-Haves (Truths 1-5):**
1. **UTXO Tracking:** `ChainProvider.getUtxos()` implements cache-first strategy (L1 in-memory → L2 Redis → Blockfrost), tested with 11 cache tests + 14 provider tests
2. **Reservation System:** `UtxoReservation` provides TTL-based locking (120s default), Redis persistence, crash recovery, tested with 27 unit tests
3. **Min UTXO Calculation:** `ChainProvider.getMinUtxoLovelace()` uses protocol parameters (coins_per_utxo_byte) with correct formula and 1 ADA floor
4. **Slot Queries:** `ChainProvider.getCurrentSlot()` queries latest block, returns slot for validity windows
5. **API Key Security:** Zero logs of projectId (grep verified), sensitive field documentation, domain errors use labels not credentials

**Gap Closure Must-Haves (Truths 6-8):**
6. **Dev Server Starts:** Server runs without ERR_MODULE_NOT_FOUND, libsodium import chain works end-to-end
7. **Config Validation:** Missing chain section throws Zod ConfigInvalidError, not import crash
8. **Tests Pass:** All 91 tests pass with no regressions after libsodium override

**Build Quality:**
- All 91 tests passing (100% success rate)
- Zero type errors
- Zero anti-patterns (no TODOs, placeholders, stubs)
- All files substantive (38-314 lines)
- Complete wiring (cache → reservation → Blockfrost → Lucid → libsodium)
- Security patterns enforced (mainnet guardrail, BigInt precision, fire-and-forget persistence, sensitive field documentation)
- pnpm override successfully pins libsodium-wrappers-sumo@0.8.2 (verified in lockfile and installed package)

**ESM Fix Verification:**
- package.json contains pnpm.overrides with libsodium-wrappers-sumo@0.8.2
- pnpm-lock.yaml resolves override correctly
- Installed 0.8.2 package uses package import (`import e from"libsodium-sumo"`), not broken relative import
- Server starts and imports Lucid without ESM errors
- Failure point is Redis connection (expected when Docker down), confirming import chain is intact

**Ready to proceed to Phase 3 (Verification).**

---

_Verified: 2026-02-05T04:58:11Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification after: Plan 02-06 (libsodium ESM fix)_
