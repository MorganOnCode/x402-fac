# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** A working x402 payment flow on Cardano that I understand end-to-end
**Current focus:** Phase 3 COMPLETE -- all 4 plans done, verification pipeline operational. Phase 4 next.

## Current Position

Phase: 3 of 8 (Verification) -- COMPLETE
Plan: 4 of 4 in phase 3
Status: Phase complete
Last activity: 2026-02-06 - Completed 03-04-PLAN.md (POST /verify route integration)

Progress: [███████████████░░░░░] 71% overall (15/21 plans complete)
Phase 3: [██████████] 4/4 plans complete

## Performance Metrics

**Velocity:**
- Total plans completed: 15
- Average duration: 5 min
- Total execution time: 1.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 5 | 30 min | 6 min |
| 02-chain-provider | 6 | 31 min | 5 min |
| 03-verification | 4 | 24 min | 6 min |

**Recent Trend:**
- Last 5 plans: 2 min, 5 min, 9 min, 5 min, 5 min
- Trend: Stable

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
| @lucid-evolution/provider separate dep | 02-05 | Blockfrost class not re-exported from main lucid package |
| Protocol params cached 5min in-memory | 02-05 | Changes once per epoch (~5 days), no Redis needed |
| Min UTXO floor at 1 ADA | 02-05 | Practical minimum on Cardano regardless of calculation |
| Chain init failure prevents startup | 02-05 | Facilitator useless without chain access, fail fast |
| Class-based ioredis mock for integration | 02-05 | vi.fn() doesn't work as constructor, class mock required |
| Override-only libsodium fix | 02-06 | Pin libsodium-wrappers-sumo@0.8.2 via pnpm.overrides, no upstream upgrades |
| Zod v4 regex requires error msg | 03-01 | z.string().regex() needs second arg in Zod v4 |
| Zod v4 record requires two args | 03-01 | z.record(key, value) not z.record(value) in Zod v4 |
| VERIFY errors use HTTP 200 | 03-01 | VerifyInvalidFormatError returns 200 per locked "always HTTP 200" decision |
| Verification config in ChainConfig | 03-01 | Chain-specific settings (fee bounds, grace buffer, timeouts) |
| Address comparison via hex not bech32 | 03-02 | Same address can have different bech32 representations; hex is canonical |
| CML Address.to_hex() not to_cbor_hex() | 03-02 | CML Address class has to_hex(), to_cbor_hex() exists on other types |
| Pipeline state on mutable VerifyContext | 03-02 | _parsedTx, _matchingOutputIndex, _matchingOutputAmount avoid redundant parsing |
| Base64 regex validation before decode | 03-02 | Catches invalid characters early with distinct error message |
| vi.resetModules() for mock isolation | 03-03 | Vitest caches modules; resetModules() required before doMock + dynamic import |
| Fallback ?? 'unknown' over non-null ! | 03-03 | ESLint no-non-null-assertion; defensive even though failed checks always have reason |
| vi.mock source-relative path for integration | 03-04 | Alias @/ doesn't match module IDs for relative imports in source files |
| beforeEach mockReset for test isolation | 03-04 | mockResolvedValueOnce state leaks across tests without explicit reset |
| HTTP 500 only for unexpected errors | 03-04 | CML WASM crash etc.; all validation/verification failures use HTTP 200 |

### Pending Todos

12 todos in `.planning/todos/pending/` (created 2026-02-06 from masumi gap analysis):

| # | Title | Priority | Phase |
|---|-------|----------|-------|
| 1 | Rewrite Phase 4 deliverables for tx-based model | Critical | 4 |
| 2 | Add /status endpoint for async settlement polling | Critical | 4 |
| 3 | Add multi-asset data to DeserializedTx output type | Critical | 3 |
| 4 | Implement settlement idempotency via CBOR hash | Important | 4 |
| 5 | Define HTTP 202 pending response format | Important | 4 |
| 6 | Add submitTransaction() to BlockfrostClient | Important | 4 |
| 7 | Support X-PAYMENT-RESPONSE header | Important | 4 |
| 8 | Rename amount to maxAmountRequired | Important | 3 |
| 9 | Note facilitator wallet not needed for settlement | Moderate | 4 |
| 10 | Consider moving /supported endpoint earlier | Moderate | 8 |
| 11 | Document masumi native token format for Phase 5 | Moderate | 5 |
| 12 | Phase 6 batching incompatibility confirmed | Minor | 6 |

Items 3 and 8 applied to Phase 3 plans before execution. Item 3 (multi-asset DeserializedTx) now implemented in 03-02. Items 1-2, 4-7, 9 captured in Phase 4 pre-planning note.

### Blockers/Concerns

None - Phase 3 complete. Ready for Phase 4 (Payment Flow).

## Session Continuity

Last session: 2026-02-06T13:22:34Z
Stopped at: Completed 03-04-PLAN.md (POST /verify route integration) -- Phase 3 complete
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

## Phase 2 Completion Summary

Phase 2 built the complete Cardano chain provider layer:

- **02-01**: Chain types (CachedUtxo, UtxoRef, Reservation), 5 CHAIN_* errors, ChainConfigSchema with mainnet guardrail
- **02-02**: BlockfrostClient with exponential backoff retry (withRetry, 404-as-empty, API key safety), @blockfrost/blockfrost-js v6.1.0
- **02-03**: Redis client factory (ioredis, lazy connect, retry), two-layer UTXO cache (L1 Map + L2 Redis), BigInt serialization, real Redis health check
- **02-04**: UTXO reservation system (Map + Redis, TTL expiry, concurrent cap, releaseAll, crash recovery via loadFromRedis)
- **02-05**: ChainProvider orchestrator (cache-first queries, Lucid Evolution, min UTXO), server lifecycle integration
- **02-06**: libsodium-wrappers-sumo ESM fix (pnpm override 0.7.16 -> 0.8.2, gap closure)

Key artifacts for Phase 3:
- `src/chain/index.ts` - Barrel exports for entire chain module
- `src/chain/provider.ts` - ChainProvider with getUtxos, getAvailableUtxos, reserveUtxo, getCurrentSlot, getBalance, getMinUtxoLovelace, getLucid
- `src/server.ts` - Server with chain layer initialization (fastify.chainProvider, fastify.redis)
- `src/types/index.ts` - Fastify augmented with redis and chainProvider

## Phase 3 Completion Summary

Phase 3 built the complete transaction-based verification pipeline:

- **03-01**: Zod schemas (VerifyRequest, PaymentPayload, PaymentRequirements), CAIP-2 constants, VerifyContext/CheckResult types, verification config extension
- **03-02**: CBOR deserialization (deserializeTransaction via CML), 8 check functions (cbor, scheme, network, recipient, amount, witness, ttl, fee), 44 tests
- **03-03**: verifyPayment() orchestrator with collect-all-errors pattern, describeFailure() lookup, BigInt-safe responses, 24 tests
- **03-04**: POST /verify route plugin, server integration, 10 integration tests

Key artifacts for Phase 4:
- `src/routes/verify.ts` - POST /verify endpoint (Zod validation, VerifyContext assembly, verifyPayment call)
- `src/verify/verify-payment.ts` - Orchestrator: runs all checks, builds VerifyResponse
- `src/verify/checks.ts` - 8 verification checks in VERIFICATION_CHECKS array
- `src/verify/cbor.ts` - deserializeTransaction() via @dcspark/cardano-multiplatform-lib
- `src/verify/types.ts` - All Zod schemas and TypeScript types
- `src/server.ts` - Server with verify route registered alongside health route
- 167 tests across 11 suites, all passing
