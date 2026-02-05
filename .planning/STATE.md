# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** A working x402 payment flow on Cardano that I understand end-to-end
**Current focus:** Phase 2 - Chain Provider

## Current Position

Phase: 2 of 8 (Chain Provider)
Plan: 4 of 5 in phase 2
Status: In progress
Last activity: 2026-02-05 - Completed 02-04-PLAN.md (UTXO Reservation System)

Progress: [████████░░░░░░░░░░░░] 45% overall (9/20 plans complete)
Phase 2: [████████░░] 4/5 plans complete

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: 5 min
- Total execution time: 0.7 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 5 | 30 min | 6 min |
| 02-chain-provider | 4 | 20 min | 5 min |

**Recent Trend:**
- Last 5 plans: 3 min, 4 min, 6 min, 6 min, 4 min
- Trend: Stable/fast

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

| Decision | Phase | Rationale |
|----------|-------|-----------|
| tsup over tsdown | 01-01 | rolldown native bindings failed on Darwin arm64 |
| Simplified ESLint config | 01-01 | eslint-config-airbnb-extended had plugin issues, used typescript-eslint directly |
| Semicolons enabled | 01-01 | Airbnb default per CONTEXT.md |
| Zod v4 factory defaults | 01-03 | Zod v4 requires factory functions for nested object defaults |
| Error code property checking | 01-03 | Use error.code instead of message matching for reliable identification |
| v8 coverage provider | 01-02 | Faster native coverage over istanbul |
| Docker for deps only | 01-02 | App runs locally with hot reload, containers for IPFS/Redis |
| setNotFoundHandler for 404s | 01-04 | Fastify default 404 format doesn't match our error spec |
| Type-only re-exports | 01-04 | ESM requires `export type { X }` for TypeScript-only exports |
| Placeholder dependency checks | 01-05 | Redis/IPFS return 'up' until implemented in later phases |
| Sentry captures 500+ only | 01-05 | Client errors excluded to reduce noise |
| Grouped Dependabot PRs | 01-05 | Dev and Fastify dependencies grouped for manageable updates |
| bigint for lovelace values | 02-01 | Cardano lovelace can exceed 2^53, causing precision loss with Number |
| UTXO ref format txHash#index | 02-01 | Standard Cardano convention, natural Redis key format |
| Mainnet env var guardrail | 02-01 | Fail-safe prevents accidental mainnet usage during development |
| Chain config required | 02-01 | Facilitator cannot operate without chain configuration |
| ioredis with lazyConnect | 02-03 | Explicit connection control -- caller decides when to connect |
| BigInt 'n' suffix serialization | 02-03 | JSON replacer/reviver with digit-n pattern for Redis storage |
| L2 natural TTL expiry | 02-03 | invalidateAll clears L1 only; Redis entries expire via EX TTL |
| Optional Fastify redis decoration | 02-03 | Health check backward compatible when Redis not yet wired |
| Retry 3x with 500ms exponential backoff | 02-02 | Balances recovery from transient failures without excessive delay |
| 404 on address UTxOs returns empty array | 02-02 | Unused addresses are normal in Cardano; 404 means no UTxOs |
| API key never in errors or logs | 02-02 | Prevents common security vulnerability of leaking API keys |
| Lazy cleanup over scheduled timer | 02-04 | cleanExpired() at start of operations, no background tasks needed |
| PX millisecond TTL for reservations | 02-04 | Matches in-memory ttlMs exactly for consistent expiry |
| loadFromRedis startup-only | 02-04 | keys() is O(N), acceptable at startup, never in hot path |
| releaseAll by requestId | 02-04 | Transaction failure frees all UTXOs for that request atomically |

### Pending Todos

None currently.

### Blockers/Concerns

None - UTXO reservation system complete. One plan remaining: 02-05 (ChainProvider orchestrator + server integration).

## Session Continuity

Last session: 2026-02-05T02:05:29Z
Stopped at: Completed 02-04-PLAN.md (UTXO Reservation System)
Resume file: None

## Phase 1 Completion Summary

Phase 1 established the complete development foundation:

- **01-01**: TypeScript project with ESLint, Prettier, tsup build
- **01-02**: Vitest testing, Docker services, pre-commit hooks
- **01-03**: Zod config validation, domain errors
- **01-04**: Fastify server with helmet, CORS, error handling, request logging
- **01-05**: Health endpoint, Sentry integration, Dependabot scanning

Key artifacts ready for Phase 2:
- `src/server.ts` - Server factory for route registration
- `src/config/schema.ts` - Config schema to extend
- `src/errors/index.ts` - Error creation pattern
- `src/routes/health.ts` - Route plugin pattern

## Phase 2 Progress

- **02-01**: Chain types (CachedUtxo, UtxoRef, Reservation), 5 CHAIN_* errors, ChainConfigSchema with mainnet guardrail
- **02-02**: BlockfrostClient with exponential backoff retry (withRetry, 404-as-empty, API key safety), @blockfrost/blockfrost-js v6.1.0
- **02-03**: Redis client factory (ioredis, lazy connect, retry), two-layer UTXO cache (L1 Map + L2 Redis), BigInt serialization, real Redis health check
- **02-04**: UTXO reservation system (Map + Redis, TTL expiry, concurrent cap, releaseAll, crash recovery via loadFromRedis)

Key artifacts available:
- `src/chain/types.ts` - Domain types with bigint values
- `src/chain/errors.ts` - CHAIN_* domain errors
- `src/chain/config.ts` - ChainConfigSchema + resolveBlockfrostUrl
- `src/chain/blockfrost-client.ts` - BlockfrostClient with retry, error mapping, 404 handling
- `src/chain/redis-client.ts` - Redis client factory with lazy connect
- `src/chain/utxo-cache.ts` - Two-layer UTXO cache with BigInt serialization
- `src/chain/utxo-reservation.ts` - UTXO reservation with TTL, cap, Redis persistence
- `src/routes/health.ts` - Health endpoint with real Redis ping check
- `src/types/index.ts` - Fastify instance augmentation with optional redis
