# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** A working x402 payment flow on Cardano that I understand end-to-end
**Current focus:** Phase 2 - Chain Provider

## Current Position

Phase: 2 of 8 (Chain Provider)
Plan: 1 of 5 in phase 2
Status: In progress
Last activity: 2026-02-05 - Completed 02-01-PLAN.md (Chain Foundation Types, Errors, Config)

Progress: [██████░░░░░░░░░░░░░░] 30% overall (6/20 plans complete)
Phase 2: [██░░░░░░░░] 1/5 plans complete

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 6 min
- Total execution time: 0.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 5 | 30 min | 6 min |
| 02-chain-provider | 1 | 4 min | 4 min |

**Recent Trend:**
- Last 5 plans: 8 min, 6 min, 5 min, 3 min, 4 min
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

### Pending Todos

None currently.

### Blockers/Concerns

None - chain foundation complete. Ready for 02-02 (Blockfrost client).

## Session Continuity

Last session: 2026-02-05T01:47:59Z
Stopped at: Completed 02-01-PLAN.md (Chain Foundation Types, Errors, Config)
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

Key artifacts available:
- `src/chain/types.ts` - Domain types with bigint values
- `src/chain/errors.ts` - CHAIN_* domain errors
- `src/chain/config.ts` - ChainConfigSchema + resolveBlockfrostUrl
