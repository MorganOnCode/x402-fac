---
auditor: claude-opus-4-5-20251101
created: 2026-02-05
updated: 2026-02-11
focus: phase-6-micropayment-strategy-pre-execution-review
status: strong-with-open-items
phases-reviewed: [1, 2, 3-plan, 6-plan]
phase-1-score: 8/10
phase-2-score: 8/10
phase-3-plan-score: 6/10
phase-6-plan-score: 7/10
---

<!--
NOTE TO LLMS:
This file is the specific audit log for Claude.
If you are Gemini, please refer to and update [.auditing/AUDIT-gemini.md] instead.
-->

# Audit: Full Codebase & Planning Review (Post-Execution)

## Executive Summary

**Phase 1 (Foundation): Strong (8/10)**
Complete, well-documented, UAT passed 8/8. Established reusable patterns: Fastify server factory, Zod config schema, @fastify/error domain errors, request/response logging with correlation IDs, and a Docker-based dev environment. 18 tests, 62.93% coverage at time of Phase 1 verification. Security baseline in place (Dependabot, Sentry, Helmet, pre-commit hooks). Minor gaps (rate limiting, request body size limits) remain acceptable technical debt.

**Phase 2 (Chain Provider): Strong (8/10)**
Fully executed with 6 plans (including gap closure for libsodium ESM), 91 tests now passing across 8 suites, 0 type errors, 0 lint violations. Coverage improved to 81.36% statements / 81.62% lines. The research document (02-RESEARCH.md) resolved all 8 "Claude's discretion" items with documented rationale. TDD approach produced clean dependency injection via `ChainProviderDeps`, BigInt safety for all lovelace values, two-layer cache with crash recovery, and a UTXO reservation system with TTL. Upgraded from Gemini's pre-execution 4/10 to 8/10 based on delivered artifacts.

**Research Quality: 7/10**
Five research documents (SUMMARY, STACK, ARCHITECTURE, FEATURES, PITFALLS) at MEDIUM-HIGH confidence. Pitfalls document is unusually thorough (15 pitfalls with phase mappings, warning signs, recovery strategies). Phase-level research (01-RESEARCH.md HIGH, 02-RESEARCH.md HIGH) resolved all open questions before execution. Architecture research still contains Rust patterns for a TypeScript project — but actual code established clean TypeScript conventions that supersede it.

**Requirements & Roadmap: 7/10**
100% traceability (32/32 v1 requirements mapped). CARD-02 mapping still imprecise (infrastructure support vs. user-facing capability). Phase ordering debatable (stablecoins before batching). Several capabilities lack formal requirement IDs. 03-CONTEXT.md now exists, advancing Phase 3 readiness.

---

# Tools and Resources

## Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| **fastify** | ^5.7.4 | HTTP framework (core server) |
| **fastify-plugin** | ^5.1.0 | Plugin helper for Fastify |
| **@fastify/cors** | ^11.2.0 | Cross-origin request handling |
| **@fastify/helmet** | ^13.0.2 | Security headers (CSP, HSTS, etc.) |
| **@fastify/error** | ^4.2.0 | Structured error creation with error codes |
| **@lucid-evolution/lucid** | ^0.4.29 | Cardano transaction building, wallet management, signature verification |
| **@lucid-evolution/provider** | ^0.1.90 | Blockchain provider abstraction for Lucid |
| **@blockfrost/blockfrost-js** | ^6.1.0 | Direct Blockfrost API client (UTXO queries, protocol params) |
| **ioredis** | ^5.9.2 | Redis client (UTXO caching, reservation persistence) |
| **zod** | ^4.3.6 | Runtime schema validation for config and inputs |
| **pino** | ^10.3.0 | Structured JSON logging |
| **@sentry/node** | ^10.38.0 | Error tracking and monitoring (production) |

## Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| **vitest** | ^4.0.18 | Test framework (describe/it/expect, mocking, fake timers) |
| **@vitest/coverage-v8** | ^4.0.18 | Code coverage via V8 |
| **typescript** | ^5.9.3 | Type system (strict mode enabled) |
| **tsx** | ^4.21.0 | TypeScript execution with hot reload (`pnpm dev`) |
| **tsup** | ^8.5.1 | ESM bundler for production builds |
| **eslint** | ^9.39.2 | Linter with TypeScript and import plugins |
| **eslint-config-airbnb-extended** | ^3.0.1 | Airbnb-inspired style rules |
| **eslint-plugin-import** | ^2.32.0 | Import ordering and validation |
| **eslint-plugin-n** | ^17.23.2 | Node.js-specific lint rules |
| **typescript-eslint** | ^8.54.0 | ESLint TypeScript parser and rules |
| **prettier** | ^3.8.1 | Code formatting |
| **husky** | ^9.1.7 | Git hooks (pre-commit runs lint-staged + typecheck) |
| **lint-staged** | ^16.2.7 | Runs eslint --fix and prettier --write on staged .ts files |
| **pino-pretty** | ^13.1.3 | Human-readable log output in development |
| **@types/node** | ^25.2.0 | Node.js type definitions |

**pnpm Override:** `libsodium-wrappers-sumo` pinned to `0.8.2` via `pnpm.overrides` to fix ESM resolution failure in `v0.7.16` (broken relative import path in published package). Root cause documented in `.planning/debug/libsodium-esm-resolution-failure.md`.

## External APIs and Services

| Service | Purpose | Config Location |
|---------|---------|-----------------|
| **Blockfrost API** | Cardano blockchain data (UTXOs, protocol params, tx submission) | `chain.blockfrost.projectId` in `config/config.json` |
| **Redis** | L2 UTXO cache, reservation state persistence, crash recovery | `chain.redis` in `config/config.json` (default: `127.0.0.1:6379`) |
| **Sentry** | Production error tracking (500+ errors only) | `sentry.dsn` in `config/config.json` (optional) |
| **IPFS (Kubo)** | File storage — placeholder for Phase 7 | Docker Compose service, ports 4001/5001/8080 |

Blockfrost network URLs (set automatically by network selection):
- Preview: `https://cardano-preview.blockfrost.io/api/v0`
- Preprod: `https://cardano-preprod.blockfrost.io/api/v0`
- Mainnet: `https://cardano-mainnet.blockfrost.io/api/v0`

## Node.js Built-in Modules

- `node:crypto` — UUID generation for request IDs
- `node:fs` — config file loading
- `node:path` — path resolution

## Key Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts, pnpm 10.8.1, ESM type, engines >=20 |
| `tsconfig.json` | TypeScript: ES2022 target, ESNext modules, strict mode, `@/*` path alias |
| `tsconfig.build.json` | Build-specific TS config (excludes tests) |
| `vitest.config.ts` | Test config: node env, `tests/**/*.test.ts` pattern, V8 coverage, 0% thresholds |
| `eslint.config.js` | Linting: TS strict/stylistic, import ordering, Airbnb-extended |
| `.prettierrc` | Formatting: single quotes, trailing commas, 100 char width |
| `tsup.config.ts` | Build: ESM format, source maps, declaration files |
| `docker-compose.yml` | Local services: Redis 7-alpine (AOF persistence), IPFS Kubo |
| `.husky/pre-commit` | Pre-commit hook: `pnpm lint-staged && pnpm typecheck` |
| `.github/dependabot.yml` | Weekly dependency updates, grouped by ecosystem |
| `config/config.example.json` | Template for `config/config.json` (no chain section — stale) |
| `.claude/settings.local.json` | Claude Code CLI tool permissions |

## npm Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `tsx watch --inspect src/index.ts` | Development server with hot reload |
| `build` | `tsup` | Production ESM build to `dist/` |
| `typecheck` | `tsc --noEmit` | Type validation without emitting |
| `lint` / `lint:fix` | `eslint src` | Linting with optional auto-fix |
| `format` | `prettier --write "src/**/*.ts"` | Code formatting |
| `test` | `vitest run` | Run tests once |
| `test:watch` | `vitest` | Tests in watch mode |
| `test:coverage` | `vitest run --coverage` | Coverage report |
| `docker:up` / `docker:down` | `docker-compose up -d` / `down` | Start/stop local Redis + IPFS |
| `docker:logs` | `docker-compose logs -f` | Follow container logs |
| `prepare` | `husky` | Git hooks setup |

## Source Code Architecture

```
src/                               1,829 lines total
├── index.ts              (41)     Entry point — loads config, inits Sentry, starts server
├── instrument.ts         (23)     Sentry initialization (conditional on DSN)
├── server.ts            (104)     Fastify server factory, chain layer wiring, shutdown hooks
├── chain/
│   ├── index.ts          (38)     Barrel exports
│   ├── types.ts          (91)     ChainNetwork, UtxoRef, CachedUtxo, Reservation
│   ├── config.ts         (86)     ChainConfigSchema (Zod), mainnet guardrail, URL resolver
│   ├── errors.ts         (38)     5 chain error types (CHAIN_RATE_LIMITED, etc.)
│   ├── blockfrost-client.ts (213) Blockfrost wrapper with exponential backoff retry
│   ├── redis-client.ts   (49)     Redis connection factory with retry strategy
│   ├── utxo-cache.ts    (158)     Two-layer cache: L1 in-memory Map → L2 Redis
│   ├── utxo-reservation.ts (223)  UTXO reservation with TTL, Redis persistence
│   ├── lucid-provider.ts (50)     Lucid Evolution singleton factory
│   └── provider.ts      (314)     ChainProvider orchestrator — 10 public methods
├── config/
│   ├── schema.ts         (35)     Top-level ConfigSchema (server, logging, sentry, env, chain)
│   └── index.ts          (37)     loadConfig() — reads and validates config.json
├── errors/
│   └── index.ts          (47)     Application error factory + chain error re-exports
├── plugins/
│   ├── error-handler.ts (108)     Fastify error handler (Sentry, sanitization)
│   └── request-logger.ts (54)     Request/response logging plugin
├── routes/
│   └── health.ts        (101)     GET /health — server, Redis, IPFS status
└── types/
    └── index.ts          (19)     Fastify type augmentation (config, redis, chainProvider)
```

## Testing Infrastructure

- **Framework:** Vitest 4.0.18 with `vi.fn()`, `vi.mock()`, `vi.importActual()`, fake timers
- **Test location:** `tests/unit/**/*.test.ts`, `tests/integration/**/*.test.ts`
- **Setup file:** `tests/setup.ts` (minimal — nearly empty)
- **Test count:** 91 tests passing across 8 suites
- **Source lines:** 1,829 (src), 1,721 (tests) — 0.94:1 test-to-source ratio
- **Coverage:** 81.36% statements, 57.93% branches, 80.41% functions, 81.62% lines
- **Coverage thresholds:** All set to 0% (no enforcement)
- **Mocking approach:** Interface-based DI with class-based mocks for constructors; custom Map-based Redis mock
- **Known limitation:** Lucid Evolution mocked at package level in integration tests due to `libsodium-wrappers-sumo` ESM incompatibility with Vitest. Integration tests verify server wiring but not actual Lucid behavior.

---

# Sensitive Secrets

All secrets are loaded from `config/config.json` (file-based, not environment variables). This file is gitignored and must never be committed.

## Developer/Operator Secrets

| Secret | Schema Path | Defined In | Purpose |
|--------|-------------|------------|---------|
| **Blockfrost API Key** | `chain.blockfrost.projectId` | `src/chain/config.ts:22` | Authenticates with Blockfrost API. Network-specific (Preview key won't work on Preprod). Free tier: 10 req/sec. |
| **Wallet Seed Phrase** | `chain.facilitator.seedPhrase` | `src/chain/config.ts:32` | 24-word BIP-39 mnemonic for the facilitator wallet. Provides ONE of seedPhrase or privateKey. |
| **Wallet Private Key** | `chain.facilitator.privateKey` | `src/chain/config.ts:34` | Hex-encoded private key. Alternative to seedPhrase. Provides ONE of seedPhrase or privateKey. |
| **Sentry DSN** | `sentry.dsn` | `src/config/schema.ts:23` | Error tracking endpoint URL. Optional — omit to disable Sentry. |

## Where Secrets Live

| Path | Status | Contains |
|------|--------|----------|
| `config/config.json` | **Gitignored** | All runtime secrets (Blockfrost key, wallet credentials, Sentry DSN) |
| `config/config.example.json` | Committed (safe) | Placeholder template — no real values |
| `.env` / `.env.*` | **Gitignored** | Not currently used, but excluded as a safeguard |

## Where Secrets Are Used in Code

| File | What It Reads | What It Does |
|------|---------------|--------------|
| `src/config/index.ts:9` | `config/config.json` | Loads and validates all config via Zod |
| `src/chain/lucid-provider.ts:36` | `blockfrost.projectId` | Passes to Lucid's Blockfrost provider constructor |
| `src/chain/lucid-provider.ts:42-44` | `seedPhrase` or `privateKey` | Selects facilitator wallet in Lucid |
| `src/chain/blockfrost-client.ts:168` | `projectId` | Stored as private field, passed in API headers |
| `src/instrument.ts:11` | `sentry.dsn` | Initializes Sentry SDK |

## Security Controls in Place

- **Never logged:** All three chain secrets have explicit `"sensitive — never log"` JSDoc comments. Verified by grep — no secret values appear in any log statements.
- **Private storage:** `BlockfrostClient` stores projectId as a private class field, never exposed in errors. Test verifies API key does not leak in error messages.
- **Mainnet guardrail:** Setting `network: "Mainnet"` requires `MAINNET=true` environment variable (`src/chain/config.ts:66`). This is the only `process.env` check with security implications.
- **Zod validation:** Config is validated at startup — missing or malformed secrets cause an immediate, clear error before the server starts.
- **No hardcoded secrets:** Zero hardcoded credentials anywhere in source code. Test files use obvious fakes like `"test_project_id"`.
- **Error sanitization:** Production error responses use generic messages for 5xx errors (`src/plugins/error-handler.ts:26-62`). Stack traces only in development.
- **Helmet headers:** CSP, HSTS, X-Content-Type-Options, X-Frame-Options, etc. CSP disabled in dev mode only.

## End-User Secrets

This is a facilitator service, not a user-facing wallet. End users (payers) interact via the x402 protocol and do not provide secrets to this service directly. Their transaction signatures are verified on-chain. No end-user secrets are stored or managed by this codebase.

## Redis Authentication

Redis currently runs without authentication (`127.0.0.1:6379`). Acceptable for local development. For production deployment, Redis authentication should be added — the schema at `src/chain/config.ts` would need a `redis.password` field. Docker Compose runs Redis with AOF persistence (`--appendonly yes`).

---

## Phase 1: Foundation — Detailed Assessment

### Context

Phase 1 was the first executed phase. No prior audit existed. Research (01-RESEARCH.md) was HIGH confidence and resolved all stack decisions.

### What Was Built

| Plan | Scope | Duration | Tests |
|------|-------|----------|-------|
| 01-01 | Project bootstrap (pnpm, TypeScript, ESLint, husky) | — | 0 |
| 01-02 | Testing infrastructure + Docker dev environment | — | 2 |
| 01-03 | Configuration system with Zod validation | — | 8 |
| 01-04 | HTTP server foundation (Fastify + plugins) | — | 5 |
| 01-05 | Health endpoint + Sentry + Dependabot | — | 3 |

**Totals:** 5 plans, 18 tests passing, 0 type errors, 0 lint violations.

### Architecture Quality

**Strong:**
- Fastify server factory pattern with dependency injection — clean separation of concerns
- Zod config validation with fail-fast startup — prevents silent misconfiguration
- Domain error codes using @fastify/error — structured, machine-readable errors
- Request/response logging with correlation IDs (UUID v4) — full traceability
- Pre-commit hooks (lint-staged + typecheck) — prevents broken code from entering git

**Adequate:**
- IPFS health check returns 'up' unconditionally — placeholder for Phase 7, no false negatives in prod since IPFS isn't used yet
- CORS permissive in dev (boolean flag) — acceptable pre-production, needs domain whitelist before deployment

### Strengths

- UAT concrete and passing: 8/8 tests (curl commands, header checks, Docker lifecycle)
- Decisions documented with rationale in STATE.md (12 decisions from Phase 1)
- Established reusable patterns that Phase 2 built upon cleanly
- Security baseline: Dependabot (weekly, grouped), Sentry (500+ only), Helmet, input validation

### Gaps / Issues

| Gap | Risk | Severity |
|-----|------|----------|
| No rate limiting middleware | Blockfrost wrapper and future endpoints exposed to abuse | Medium |
| No request body size limits | Fastify defaults may be too generous before file upload phase | Low |
| `config/config.example.json` missing `chain` section | New developer won't know chain config is required | Low |
| `sample.test.ts` still exists | Placeholder test (1+1=2) pollutes suite | Info |

**Verdict:** Solid bedrock. No action required before Phase 3.

---

## Phase 2: Chain Provider — Detailed Assessment

### Context: Pre-Execution vs Post-Execution

The Gemini audit (`.auditing/AUDIT-gemini.md`) was conducted before Phase 2 execution and rated it 4/10, recommending "do not write Phase 2 code yet." That assessment was correct at the time — the 02-CONTEXT.md was thin and left critical decisions unresolved.

Between that audit and execution, Phase 2 research (02-RESEARCH.md, HIGH confidence) was conducted, resolving all open questions. The phase then executed successfully with a gap closure plan (02-06) for the libsodium ESM issue. This audit reflects the post-execution state.

### What Was Built

| Plan | Scope | Duration | Tests |
|------|-------|----------|-------|
| 02-01 | Chain types, domain errors, config schema with mainnet guardrail | 4 min | 3 |
| 02-02 | BlockfrostClient with exponential backoff retry (TDD) | 8 min | 18 |
| 02-03 | Redis client, two-layer UTXO cache, health check wiring | 6 min | 11 |
| 02-04 | UTXO reservation system with TTL (TDD) | 4 min | 27 |
| 02-05 | Lucid provider, ChainProvider orchestrator, server integration | 9 min | 14 |
| 02-06 | Fix libsodium-wrappers-sumo ESM override (gap closure) | — | 0 |

**Totals:** 6 plans, ~31 minutes execution, 91 tests passing, 0 type errors, 0 lint violations.

### Architecture Quality

**Strong:**
- Clean dependency injection via `ChainProviderDeps` interface — all components injected, fully testable
- Factory function `createChainProvider()` handles wiring and startup recovery (`loadFromRedis`)
- Cache-first query strategy: L1 in-memory Map → L2 Redis → Blockfrost API
- Shutdown hook for Redis disconnect in `server.ts`
- BigInt for all lovelace values — prevents precision loss above 2^53
- Custom JSON replacer/reviver for BigInt serialization in Redis (uses "n" suffix convention)
- API key never logged — verified by both grep and explicit test (`blockfrost-client.test.ts`)
- Mainnet guardrail via Zod `superRefine` — requires explicit `MAINNET=true` env var
- Fire-and-forget Redis persistence — non-critical Redis failures don't crash the app
- Blockfrost 404 treated as empty array (unused address), not an error

**Adequate:**
- Reject-immediately contention strategy (`CHAIN_UTXO_EXHAUSTED`, 503) — simpler than wait-with-timeout, appropriate for single-instance v1
- In-memory reservation locks (correct for single Node.js process, no need for Redlock at this scale)
- Protocol parameter caching (5 min in-memory, changes once per epoch ~5 days)
- Redis client with lazy connect and retry strategy — adequate for dev, needs auth for prod

### Strengths

- TDD approach for BlockfrostClient (02-02) and UTXO Reservation (02-04)
- Crash recovery: `loadFromRedis()` restores reservation state after restart
- TTL-based reservation cleanup: expired entries cleaned on every access
- Comprehensive test coverage for chain layer: 90.24% statements across `src/chain/`
- `ChainProvider.provider.ts` at 100% coverage — orchestrator fully tested
- No dead code — all exports have clear usage paths
- Zero TODO/FIXME/HACK comments in codebase

### Gaps / Issues

| Gap | Risk | Severity |
|-----|------|----------|
| Error handler at 42.85% coverage | Sanitization logic untested in prod-like conditions | Medium |
| Health endpoint at 73.07% coverage, only happy path tested | Degraded/unhealthy states untested | Medium |
| `index.ts` and `instrument.ts` at 0% coverage | Entry point and Sentry init have no tests | Low |
| `redis-client.ts` at 60% coverage | Connection events and retry strategy untested | Low |
| `types.ts` at 18.18% coverage | `stringToUtxoRef()` parsing untested | Low |
| Branch coverage at 57.93% overall | Error/edge paths underexercised | Medium |
| Coverage thresholds all at 0% | No enforcement — coverage can regress silently | Low |

### Concerns

**1. Hand-Rolled Min UTXO Calculation**
`ChainProvider.getMinUtxoLovelace()` at `src/chain/provider.ts` implements formula: `(160 + 2 + 28*numAssets) * coinsPerUtxoByte` with 1 ADA floor. The Phase 2 research document says under "Don't Hand-Roll": *"Use Lucid's `.complete()` method."* A comment in code acknowledges this is for "pre-validation." Risk: formula could drift from Lucid's actual calculation, especially for complex outputs with datums/scripts in Phase 5+.

**2. Two Blockfrost Clients**
Architecture uses both Lucid Evolution's built-in Blockfrost provider AND `@blockfrost/blockfrost-js` directly. Two separate HTTP connections to the same API, potentially with different rate limiting behavior. Under load in Phase 3/4 when both are active simultaneously, they could collectively exhaust the free tier rate limit (10 req/sec) faster than either alone.

**3. libsodium ESM Workaround**
Lucid Evolution's `libsodium-wrappers-sumo` fails to load in Vitest ESM environment. Resolved by (a) overriding to v0.8.2 via `pnpm.overrides` for runtime and (b) mocking Lucid at the package level in integration tests. Integration tests don't actually verify Lucid works correctly — they only verify the mock works. Runtime behavior is untested in CI. Root cause thoroughly documented in `.planning/debug/libsodium-esm-resolution-failure.md`.

**4. No Real Blockfrost Integration Test**
All 91 tests use mocks. No test validates that the Blockfrost client actually works against the preview testnet API. Acceptable for CI but there should be a manual or opt-in test for real connectivity validation.

**5. Unbounded L1 Cache Growth**
`UtxoCache` L1 (in-memory Map) has no size limit. If many unique addresses are queried, the Map grows without bound. TTL-based expiry only removes entries on access (lazy cleanup), not proactively. For v1 with limited facilitator-only queries, this is low risk. For future multi-address scenarios, an LRU eviction strategy would be needed.

**6. Silent Redis Failures**
Fire-and-forget pattern (`.catch(() => {})`) used in 4 locations across utxo-cache.ts and utxo-reservation.ts. Intentional design (don't block requests), but failures are completely silent — no metrics, no logging, no retry. A Redis outage would silently degrade durability without any operator visibility.

**7. Integration Test Warning**
Integration tests emit: `WARNING: Old token was used without network parameter. Switching to mainnet network`. This comes from the Blockfrost mock in `tests/integration/`. Not a production issue but indicates the mock doesn't perfectly simulate the real provider. Should be suppressed or fixed in the mock setup.

**Verdict:** Strong implementation. Concerns #1-2 are architecture risks to monitor. Concerns #3-4 are test gaps that don't block Phase 3. Concerns #5-7 are minor debt. No action required before Phase 3.

---

## Cross-Cutting Issues

### Documents Out of Sync

| Document | Issue | Impact |
|----------|-------|--------|
| `02-CONTEXT.md` | Still lists 8 "Claude's discretion" items, all resolved in 02-RESEARCH.md and code | Misleading to anyone reading context in isolation |
| `PROJECT.md` | Key Decisions table shows all outcomes as "— Pending" despite 31 decisions in STATE.md | Stale; doesn't reflect 2 phases of completed work |
| `PROJECT.md` | Requirements still show "(None yet — ship to validate)" | CARD-01, CARD-02, CARD-05, CARD-06 are complete |
| `REQUIREMENTS.md` | Last updated "2026-02-04 after roadmap creation" | Doesn't reflect Phase 2 completion marking |
| `config/config.example.json` | Missing `chain` section entirely | New developer won't know chain config is required; will get confusing Zod error |
| `research/ARCHITECTURE.md` | Contains Rust patterns (`trait`, `impl`, Cargo features) for a TypeScript project | Could confuse new contributors; code has established TS conventions |

### Requirement Mapping Issues

**CARD-02 ("Facilitator accepts ADA as payment currency") mapped to Phase 2.**
Verification report marks this SATISFIED because "UTXO queries track lovelace balances (bigint)." This is infrastructure support — the facilitator can query ADA balances but doesn't accept ADA payments yet (no `/verify` or `/settle` endpoint). The requirement reads as user-facing capability. Defensible but imprecise — should be marked as "infrastructure ready" not "satisfied."

**Missing formal requirement IDs:**

| Capability | Where It Exists | Missing ID |
|-----------|----------------|------------|
| Facilitator loads and validates signing key | Config schema accepts seedPhrase/privateKey | No requirement ID |
| System supports configurable Cardano network selection | ChainConfigSchema with network field | No requirement ID |
| Pricing calculation based on file size | Mentioned in PROJECT.md | No requirement ID |
| Testnet integration testing infrastructure | Needed from Phase 2 onward | No requirement ID |
| Crash recovery for UTXO reservations | `loadFromRedis()` in chain-provider | No requirement ID |

### Phase Ordering Concerns

**Stablecoins (Phase 5) before Batching (Phase 6).**
Research explicitly states batching is "Cardano-essential, not optional" and that "single-payment-per-transaction economics" makes the service "economically unviable." Meanwhile, stablecoins add payment flexibility but aren't required for a working facilitator. A facilitator that only supports ADA but can batch is usable. A facilitator that supports DJED/iUSD but can't batch is economically unviable for micropayments.

Both auditors (Claude and Gemini) agree on this. **Recommendation:** Consider reordering — batching first ensures economic viability of the base currency before adding multi-token complexity.

### Protocol / Spec Ambiguity

**x402 Protocol Version**
Architecture research names the scheme "V2CardanoExact" (x402 protocol v2). Requirements mention V1 protocol. Features research lists "V1 + V2 protocol support" as a competitor feature. Which x402 protocol version is this project implementing? This should be clarified in PROJECT.md before Phase 3 (Verification) begins, since scheme naming and payload format depend on it.

### Other Cross-Cutting Issues

**Stablecoin Viability**
Pitfall #9 in research explicitly documents DJED liquidity and unmintability problems. USDM is recommended as primary. Phase 5 still lists DJED and iUSD as equal deliverables with dedicated success criteria. Consider: USDM as primary (must-have), DJED/iUSD as secondary (best-effort, documented if unstable).

**Test Setup File Underutilized**
`tests/setup.ts` is nearly empty — no shared mock factories, global error matchers, or test utilities. As the test suite grows through Phases 3-8, shared infrastructure would reduce duplication and improve consistency.

**Dependency Version Strategy**
All dependencies use caret ranges (`^`). This is standard but allows minor version bumps that could introduce breaking changes. The `libsodium-wrappers-sumo` override demonstrates this risk. Dependabot mitigates somewhat, but consider pinning critical chain dependencies (lucid-evolution, blockfrost-js) to exact versions once stabilized.

---

## Prior Audit Cross-Reference

### Gemini Audit (`.auditing/AUDIT-gemini.md`) — Reconciliation

| Gemini Issue | Resolution Status |
|-------------|-------------------|
| "Translation gap between Rust research and TS implementation" | **Resolved in code.** TypeScript patterns established (classes, DI, Fastify decorators). Architecture doc still shows Rust but code is clean TS. |
| "Provider Interface undefined" | **Resolved.** `ChainProvider` class with 10 public methods, clean `ChainProviderDeps` injection interface. |
| "Lucid Lifecycle undefined" | **Resolved.** Singleton at startup via `createLucidInstance()`, decorated on Fastify. |
| "Wallet Source undefined" | **Resolved.** Config schema accepts `seedPhrase` or `privateKey` with Zod `refine` validation. |
| "Redis Client missing" | **Resolved.** ioredis with lazy connect, retry strategy, health check wiring, shutdown hook. |
| "Distributed Locking (Redlock) needed" | **Not needed.** Single Node.js process uses in-memory Map locks with Redis persistence for crash recovery. Redlock is for multi-instance, which is out of v1 scope. Correct architectural decision. |
| "Pre-splitting missing" | **Still missing.** Not implemented. Not in any phase deliverables. Low risk for v1 volume. |
| "VCR/Replay testing needed" | **Alternative chosen.** Interface-based mocking with `vi.fn()` + class-based mocks. Works well for 91 tests. VCR would add accuracy for Blockfrost API compatibility but increases fixture maintenance. Acceptable trade-off. |
| "Phase ordering (batching before stablecoins)" | **Still open.** Both audits agree on this recommendation. |
| "CARD-02 mapping issue" | **Still open.** Both audits agree — infrastructure support vs. user-facing capability. |

### Claude Previous Audit — Reconciliation

| Previous Issue | Resolution Status |
|---------------|-------------------|
| "No Phase 2 UAT" | **Resolved.** `02-UAT.md` exists with test results (3 passed initially, issues documented, then resolved via gap closure 02-06). |
| "Phase 3 readiness: x402 protocol version unclear" | **Still open.** 03-CONTEXT.md exists and defines verify endpoint shape but doesn't resolve V1 vs V2 protocol version. |
| "Phase 3 readiness: CIP-8 vs CIP-30 signatures" | **Still open.** 03-CONTEXT.md mentions "PAYMENT-SIGNATURE header (Base64-encoded)" but doesn't specify CIP standard. Needs Phase 3 research. |
| "Phase 3 readiness: Nonce persistence strategy" | **Partially resolved.** 03-CONTEXT.md specifies: in-memory + Redis (like Phase 2 reservations), structured nonce format (timestamp + random). |
| "Phase 3 readiness: Endpoint scope" | **Resolved.** 03-CONTEXT.md confirms `/verify` endpoint ships in Phase 3 plus optional `GET /nonce`. |

---

## Next Phase Readiness Assessment

### Ready

- `ChainProvider.getUtxos()` — payer balance checking for verification
- `ChainProvider.getBalance()` — ADA balance verification
- `ChainProvider.getCurrentSlot()` — validity window checking
- `ChainProvider.getLucid()` — Lucid-based signature verification
- Domain error patterns — extensible for verification-specific errors (add VERIFY_* codes)
- Config schema — extensible for verification settings (maxTimeoutSeconds, nonce TTL)
- Testing infrastructure — proven mock patterns, TDD approach, 91 tests, 81% coverage
- 03-CONTEXT.md — Phase 3 boundary, response shape, nonce strategy, and error granularity defined
- Redis persistence pattern — reusable for nonce tracking (same TTL + crash recovery approach)

### Needs Resolution Before Phase 3 Planning

1. **x402 protocol version** — affects scheme naming (`V1CardanoExact` vs `V2CardanoExact`) and payload format. Clarify in PROJECT.md.
2. **CIP-8 vs CIP-30 signature verification** — research flagged as "NEEDS RESEARCH" for Phase 3. Must determine which CIP standard the payer wallet uses to sign the payment authorization.
3. **Lucid Evolution Effect library dependency** — research noted "verify during implementation" whether Lucid's API exposes Effect types that need handling.

### Watch Items

- libsodium ESM compatibility in tests — mocking works but may mask issues when Lucid is used for real signature verification in Phase 3
- Dual Blockfrost client rate limit interaction under load — could surface in Phase 3/4 when both are active simultaneously
- Branch coverage at 57.93% — error paths are underexercised and could hide bugs in edge cases

---

## Recommended Action Items

### High Priority (Before Phase 3 Planning)

1. **Clarify x402 protocol version** in PROJECT.md — V1 or V2? This determines the scheme handler interface.
2. **Research CIP-8/CIP-30 verification patterns** for Cardano — Phase 3 research document must resolve this.
3. **Decide nonce persistence model** — recommend mirroring Phase 2's reservation pattern (in-memory + Redis with TTL).

### Medium Priority (Document Hygiene)

4. **Update PROJECT.md** — Key Decisions table (all "Pending"), active requirements marking.
5. **Update 02-CONTEXT.md** — reflect resolved decisions or add pointer to 02-RESEARCH.md.
6. **Update `config/config.example.json`** — add `chain` section so new developers can onboard.
7. **Set coverage thresholds** — even modest thresholds (60% statements, 40% branches) prevent regression.

### Low Priority (Strategic, Deferrable)

8. **Consider reordering Phase 5/6** — batching before stablecoins for economic viability.
9. **Add missing requirement IDs** — wallet management, testnet support, pricing, crash recovery.
10. **Plan opt-in Blockfrost integration test** — not CI, manual validation against preview testnet.
11. **Add Redis failure logging** — replace silent `.catch(() => {})` with at minimum a debug-level log.
12. **Remove `tests/unit/sample.test.ts`** — placeholder test with no value.
13. **Suppress integration test Blockfrost warning** — "Old token was used without network parameter."

---

## Appendix: Coverage Detail

```
File                    | Stmts  | Branch | Funcs  | Lines  | Uncovered Lines
------------------------|--------|--------|--------|--------|------------------
All files               | 81.36% | 57.93% | 80.41% | 81.62% |
  src/index.ts          |  0.00% |    100 |  0.00% |  0.00% | 7-40
  src/instrument.ts     |  0.00% |      0 |  0.00% |  0.00% | 6-19
  src/server.ts         | 91.66% |  37.50 |    100 | 91.66% | 93-97
  chain/blockfrost.ts   | 88.00% |  76.92 |    100 | 86.95% | 54,73-76,136,196
  chain/config.ts       | 90.00% |  87.50 |    100 | 90.00% | 83
  chain/errors.ts       |    100 |    100 |    100 |    100 |
  chain/index.ts        |  0.00% |      0 |  0.00% |  0.00% |
  chain/lucid-provider  | 77.77% |  25.00 |    100 | 77.77% | 43-44
  chain/provider.ts     |    100 |    100 |    100 |    100 |
  chain/redis-client.ts | 60.00% |    100 |  33.33 | 60.00% | 25,30,34,38
  chain/types.ts        | 18.18% |      0 |  50.00 | 18.18% | 77-90
  chain/utxo-cache.ts   |    100 |    100 |  90.90 |    100 |
  chain/utxo-reserv.ts  | 96.61% |  92.85 |  76.92 | 98.24% | 173
  config/index.ts       |    100 |  85.71 |    100 |    100 | 23
  config/schema.ts      |    100 |    100 |    100 |    100 |
  errors/index.ts       |    100 |    100 |    100 |    100 |
  plugins/error-handler | 42.85% |      0 |  50.00 | 42.85% | 26-62,94-102
  plugins/request-log   | 87.50% |  62.50 |    100 | 87.50% | 22,40
  routes/health.ts      | 75.00% |  22.22 |  75.00 | 73.07% | 24,31,50-56,75-78
```

---

## Appendix: Planning Document Inventory

43 documents across `.planning/`:

| Category | Count | Key Files |
|----------|-------|-----------|
| Project-level | 4 | PROJECT.md, STATE.md, REQUIREMENTS.md, ROADMAP.md |
| Research (global) | 5 | SUMMARY.md, STACK.md, ARCHITECTURE.md, FEATURES.md, PITFALLS.md |
| Phase 1 artifacts | 12 | 01-CONTEXT, 01-RESEARCH, 5 PLANs, 5 SUMMARYs, 01-VERIFICATION, 01-UAT |
| Phase 2 artifacts | 16 | 02-CONTEXT, 02-RESEARCH, 6 PLANs, 6 SUMMARYs, 02-VERIFICATION, 02-UAT |
| Phase 3 (pre-planning) | 1 | 03-CONTEXT.md |
| Debug documents | 1 | libsodium-esm-resolution-failure.md |
| Config | 1 | config.json (planning workflow settings) |
| **Total** | **43** | |

STATE.md tracks 31 decisions with rationale across both phases.

---

*Audit completed: 2026-02-05*
*Auditor: Claude (claude-opus-4-5-20251101)*
*Scope: Full codebase — .planning/ (43 docs), src/ (20 files, 1,829 lines), tests/ (9 files, 1,721 lines), config files, .auditing/, .github/, docker-compose.yml*

---

## Phase 3: Verification — Pre-Execution Plan Review

**Reviewed:** 2026-02-05 (plan complete, pre-execution)
**Documents:** 03-CONTEXT.md, 03-RESEARCH.md, 03-01 through 03-05-PLAN.md
**Plan Quality: 6/10**

### Overview

Phase 3 is decomposed into 5 plans across 4 waves:
- **03-01** (wave 1): Types, Zod schemas, domain errors, config extension
- **03-02** (wave 2): NonceStore with Map + Redis persistence (TDD)
- **03-03** (wave 2): 8 verification check functions pipeline (TDD)
- **03-04** (wave 3): Verification orchestrator with multi-error collection (TDD)
- **03-05** (wave 4): Routes (/verify, /nonce) and server integration

The mechanical structure is sound — wave dependencies are correct, patterns follow Phase 2 conventions, and the research document (HIGH confidence) resolved library choices. However, the plan has **critical conceptual gaps** in the security-sensitive signature verification layer.

### Critical Gaps

**1. Signed payload content is undefined (Security)**

Plan 03-03 `checkSignature` uses:
```typescript
const payloadHex = Buffer.from(ctx.nonce).toString('hex');
```

If the payer only signs the nonce, the signature does not bind to payment parameters (amount, recipient, network). An attacker could take a valid nonce-signature and replay it in a different payment context — different amount, different recipient. For the signature to provide payment authorization (not just identity proof), the signed payload MUST include the payment details.

This is not an implementation detail — it's a protocol design question that determines whether Phase 3 provides actual payment security or only identity verification. The EVM x402 reference uses ERC-3009 which cryptographically binds amount + recipient + nonce in the signed message. The Cardano equivalent must do the same.

**Status:** Unresolved. Neither CONTEXT.md nor RESEARCH.md define the payload structure. The masumi-network x402-cardano reference was listed as a source but only partially extracted.

**2. Nonce consumption breaks settlement re-verification**

CONTEXT.md states: *"Stateless: no verification token passed to /settle — settlement re-verifies independently."*

The nonce is consumed at `/verify` time (check 8, last in pipeline). When Phase 4 `/settle` attempts to re-verify, the nonce will return `nonce_already_used`. Settlement cannot reuse the same verification pipeline without special handling (skip nonce check, use a separate verification token, or not call verifyPayment at all).

This creates an implicit contract between Phase 3 and Phase 4 that is nowhere documented. Phase 4 planning will need to decide how to handle this, but the decision should be made now since it affects the nonce consumption design.

**Status:** Contradiction between "stateless re-verification" and single-use nonces. Must be resolved before execution.

**3. `verifyData()` parameters are speculative**

Plan 03-03 contains two alternative implementation paths for `checkSignature` and explicitly defers resolution to the executor:

> *"Practical recommendation for executor: Read the actual verifyData() source before implementing."*

The function requires 4 parameters (`addressHex`, `keyHash`, `payloadHex`, `signedMessage`) and the plan is uncertain about how to derive the first two. The COSE parameter extraction is acknowledged as "the hardest part" but is not spike-tested. Given the libsodium ESM issues from Phase 2, the transitive WASM dependencies (`@emurgo/cardano-message-signing-nodejs`, `@anastasia-labs/cardano-multiplatform-lib-nodejs`) may have similar compatibility problems.

**Status:** Deferred to implementation. High risk of discovery during execution.

### Significant Gaps

**4. Unbounded nonce memory**

Same architectural issue as the L1 UTXO cache (flagged in Phase 2 audit concern #5). GET /nonce creates Map entries with no upper bound. An attacker can exhaust server memory by requesting millions of nonces. Lazy cleanup only removes expired nonces. No maximum active nonce count is enforced.

**Severity:** Medium. Mitigated by TTL expiry but no cap on active count.

**5. No integration test for CIP-8 signature verification**

All tests in plans 03-03 and 03-04 mock `verifyData()`. No test produces a real COSE_Sign1 signature (via `signData()`) and verifies it end-to-end. The research document identifies 6 pitfalls in the signature verification path — 3 of which (address format mismatch, keyHash derivation, WASM module loading) can only be caught by integration testing.

The libsodium ESM incompatibility from Phase 2 (mocking Lucid at package level in tests) suggests the WASM-heavy transitive deps may also fail in test environments. If so, the signature verification path cannot be validated until runtime — unacceptable for a security-critical component.

**Severity:** High. The most complex and security-critical part of the phase has no end-to-end test coverage.

**6. Balance check is optimistic**

`checkBalance` uses `deps.chainProvider.getBalance()` which sums all UTXO lovelace. In Cardano, not all UTXOs are spendable — script-locked UTXOs, UTXOs with datum requirements, and UTXOs already reserved by other transactions may inflate the apparent balance. A payer could pass the balance check but fail at settlement.

**Severity:** Low for v1 (naive sum is acceptable early-stage). Should be documented as a known limitation.

**7. Verification metrics not implemented**

CONTEXT.md decision: *"Track verification metrics: counters by result (success, each failure type) for monitoring and alerting."* None of the 5 plans implement metrics counters. The ROADMAP security checks also require logging of all verification failures.

**Severity:** Low. Can be added post-execution but represents a gap between decisions and plans.

**8. facilitatorAddress derived on every request**

Plan 03-05 calls `await lucid.wallet().address()` inside the POST /verify handler on every verification request. This is an async call for a value that never changes during the server lifecycle. Should be cached once at startup or during NonceStore initialization.

**Severity:** Low. Performance concern, not correctness.

### Minor Gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| PAYMENT-SIGNATURE header precedence undefined when both header and body present | Low | Plan 03-05 uses header only when body is falsy; no defined behavior for both |
| Constant-time signature verification unverified | Low | ROADMAP requires timing attack resistance; `verifyData()` not audited for this |
| No rate limiting on /verify or /nonce | Medium | Both endpoints unprotected; nonce endpoint particularly vulnerable to memory exhaustion |
| CAIP-2 chain IDs for Cardano unconfirmed | Low | Research rates this LOW confidence; hardcoded values may not match ecosystem usage |
| Missing 402 response generation | Info | Phase 3 builds /verify and /nonce but not the 402 response that triggers the flow; presumably Phase 7/8 |

### What's Good

- **Wave decomposition is correct.** Types first, parallel nonce store + checks, orchestrator, then routes. Dependencies flow cleanly.
- **Research is thorough on library selection.** `verifyData()` from Lucid Evolution is the right choice over hand-rolled COSE parsing or the stale Cardano Foundation library.
- **Nonce store follows proven Phase 2 patterns.** Map + Redis, lazy cleanup, fire-and-forget persistence, `loadFromRedis()` for crash recovery.
- **Multi-error collection is well-designed.** Run all checks, report all failures, first failure as primary — good UX for client developers.
- **Nonce-last ordering is well-reasoned.** Code comment explaining why nonce consumption (side effect) runs after signature verification. Allows client retry without burning nonces.
- **Lenient Zod parsing with `.passthrough()`.** Correct for protocol extensibility.

### Recommendations

**Before execution (must-do):**

1. **Define the signed payload structure.** What does the payer sign? Just the nonce, or a structured message containing amount + recipient + nonce + network? This is a security-critical protocol design decision. Review the masumi-network x402-cardano reference to see what they do.

2. **Resolve the nonce/settlement contradiction.** How will Phase 4 re-verify if the nonce is consumed? Options: (a) settlement skips nonce check, (b) verification returns a token that settlement uses, (c) settlement doesn't call verifyPayment. Document the decision in CONTEXT.md.

3. **Spike-test `verifyData()` in this runtime.** Before committing to the full 5-plan execution, validate that (a) `verifyData()` works with the libsodium override, (b) the COSE parameter extraction is understood, (c) the function can be called in Vitest without mocking Lucid entirely. If it can't, the mock-only test strategy needs to be acknowledged as a known limitation.

**Before execution (should-do):**

4. **Add a max nonce count** to the NonceStore (e.g., 10,000 active nonces). Reject new nonce requests when the cap is reached with a 503.

5. **Cache facilitatorAddress** at startup in server.ts rather than deriving it per-request.

6. **Add rate limiting** to GET /nonce at minimum. Even a simple in-memory rate limiter (e.g., @fastify/rate-limit) would prevent memory exhaustion attacks.

**After execution:**

7. Add verification metrics counters per CONTEXT.md decision.
8. Add an integration test for CIP-8 signature verification (even if it requires a separate test runner outside Vitest).

---

*Phase 3 plan review: 2026-02-05*
*Auditor: Claude (claude-opus-4-5-20251101)*
*Scope: .planning/phases/03-verification/ (7 documents), cross-referenced with ROADMAP.md, STATE.md, src/server.ts, src/chain/provider.ts*

---

## Phase 6: Micropayment Strategy — Pre-Execution Plan Review

**Reviewed:** 2026-02-11 (plans complete, pre-execution)
**Documents:** 06-pre-planning-assumptions.md, 06-RESEARCH.md, 06-01 through 06-04-PLAN.md
**Plan Quality: 7/10**

### Context: The Pivot

Phase 6 was originally "Batching" — aggregating multiple payments into single Cardano transactions. Pre-planning research revealed this is **architecturally incompatible** with the transaction-based verification model:

1. **Client-signed transactions can't be merged.** Each client signs over their full transaction body. Changing inputs/outputs invalidates witnesses.
2. **Min UTXO dominates costs, not fees.** Batching amortizes the ~0.17 ADA tx fee across N payments, but the ~1.0 ADA min UTXO applies per output and cannot be amortized. Net savings: ~15%.
3. **No published solution exists.** Neither FluxPoint nor Masumi implements sub-min-UTXO micropayments on Cardano L1.

The pivot to "Micropayment Strategy" with prepaid credit accounts is pragmatic and well-reasoned. The research documents are thorough (HIGH confidence), with code-level analysis of FluxPoint's 21-package orynq-sdk monorepo providing concrete implementation patterns.

### Overview

Phase 6 is decomposed into 4 plans across 4 waves:

- **06-01** (wave 1): Credit types, Redis-backed CreditLedger, domain errors, config extension
- **06-02** (wave 2): `processTopup()` orchestrator, POST /credits/topup and GET /credits/balance, server wiring
- **06-03** (wave 3): Payment strategy router, `settleWithCredits()`, dual-path /settle
- **06-04** (wave 4): 402 response enrichment, credit lifecycle integration tests, L2 feasibility document

Wave dependencies are correct. The plan structure follows proven Phase 2-5 patterns (types → implementation → routes → integration).

### What's Good

- **Research quality is excellent.** The pre-planning assumptions doc honestly confronts the batching incompatibility instead of pushing a broken approach. FluxPoint code analysis goes deep enough to produce actionable patterns (deterministic invoice IDs, budget store interface, lazy expiration).
- **Lua-based atomic debit** (Plan 06-01, Task 4) is the correct approach for preventing race conditions on credit deductions. Reading balance, checking, and decrementing must be one atomic operation — a Lua script executed by Redis guarantees this.
- **Top-up flow reuses existing infrastructure.** `processTopup()` delegates to `settlePayment()` which already handles verify → submit → poll → confirm. No duplicated settlement logic.
- **Backward compatibility is maintained.** All new fields in SettleRequestSchema and SettleResult are optional. Existing clients that send `{ transaction, paymentRequirements }` see no changes. Credits default to disabled.
- **Strategy router is a pure function.** `selectStrategy()` has no side effects, no async, and is trivially testable. Clean separation between decision logic and execution.
- **The anti-patterns section is valuable.** Explicitly calling out "don't build facilitator-signed transactions" and "start with ADA-only credits" prevents scope creep into dangerous territory.

### The Centralization Concern: Deep Analysis

**This is the most important section of this audit.**

The prepaid credit system introduces a **fundamental philosophical tension** with the project's blockchain context. Let's be precise about what this means:

#### What the Credit System Actually Is

The credit system is an **off-chain custodial ledger** operated by the facilitator:

1. User sends ADA to the facilitator's Cardano address (standard L1 transaction)
2. Facilitator records this deposit in Redis (off-chain database)
3. User makes micropayments by telling the facilitator to deduct from their Redis balance
4. No L1 transaction occurs for micropayments — the facilitator simply updates a number in a database

**The facilitator holds the user's funds.** Once ADA is sent to the facilitator address, the user has no on-chain claim to those funds. The only thing preventing the facilitator from disappearing with the money is trust.

#### How This Compares to Traditional Finance

| Property | Cardano L1 | Credit System | Traditional Bank |
|----------|-----------|---------------|-----------------|
| Custody | User controls keys | **Facilitator controls** | Bank controls |
| Settlement | Cryptographic proof | **Trust in facilitator** | Trust in bank |
| Transparency | Public blockchain | **Private Redis instance** | Private database |
| Dispute resolution | On-chain finality | **None (Phase 6)** | FDIC, courts |
| User recourse on loss | N/A (user controls) | **Manual refund (out-of-band)** | Insurance, regulation |

**The credit system is economically identical to a centralized payment processor.** The facilitator is essentially acting as a bank, holding deposits and processing debits on an internal ledger. The only difference from PayPal is that deposits arrive via Cardano instead of ACH.

#### Is This a Problem?

**It depends on what the project is trying to be.**

**If the goal is "a Cardano-native payment system that preserves decentralization"** → The credit system is a significant compromise. You're routing payments through a centralized intermediary, which is exactly what blockchain was designed to eliminate.

**If the goal is "a pragmatic x402 facilitator that works on Cardano today"** → The credit system is an honest acknowledgment that Cardano L1 economics don't support micropayments, and prepaid credits are the most practical near-term solution.

**Your PROJECT.md states:** *"A working x402 payment flow on Cardano that I understand end-to-end — from signature verification to on-chain settlement — that I can build more sophisticated applications on top of."*

This is a learning project. The credit system teaches you about payment system design, trust models, and the economic realities of building on Cardano. **The centralization is a feature of the learning, not a bug.** But it should be documented honestly, not hidden.

#### What Makes This Acceptable (Conditions)

1. **The L1 path is preserved.** Payments above min UTXO (~1 ADA) still settle directly on Cardano L1. The credit system is additive, not replacement.
2. **The trust boundary is explicit.** Users opt into the credit system by choosing to top up. Nobody is forced off-chain.
3. **The scope is constrained.** Personal use + friends, not public production service. The trust radius is small.
4. **Automated withdrawal is deferred.** Phase 6 explicitly does NOT build "get my money back" infrastructure (requires facilitator wallet/key management). This is the right call — it limits the custodial surface.
5. **It's a stepping stone.** The L2 research deliverable (06-04) documents paths to decentralize later (Hydra channels, Midnight, governance-level min UTXO reduction).

#### What Would Make This Unacceptable

1. **No audit trail.** The credit transaction log (CREDIT_TXLOG) provides a paper trail, but it's controlled by the facilitator. There's no way for the user to independently verify their balance.
2. **No withdrawal.** If a user can never get their ADA back, the system is a one-way funnel into the facilitator's wallet. This is mitigated by "manual refund" but that's a trust-me-bro mechanism.
3. **Silent loss.** The `processTopup()` catch block handles "settlement succeeded but crediting failed" by logging CRITICAL and returning failure with txHash. But the user's ADA is already on-chain — the facilitator received the payment but didn't credit the account. Manual recovery is the only path.
4. **Scaling beyond trust radius.** If this ever becomes a public service, the credit system needs formal custody controls, auditing, and potentially regulatory compliance.

#### Recommendations for the Centralization Concern

**Must-do (before deployment, even for personal use):**

1. **Add an explicit trust model section** to the L2 feasibility document or a standalone document. State clearly: "The credit system requires users to trust the facilitator with their funds. There is no on-chain recourse if the facilitator is compromised or acts maliciously."

2. **Consider on-chain receipts for top-up deposits.** When a top-up settles, the facilitator could publish a Cardano metadata record (like FluxPoint's label 2222) anchoring proof that address X deposited Y lovelace at time Z. This doesn't prevent fraud but creates an immutable audit trail that the user can independently verify.

3. **Document the refund process.** Even if it's manual ("email the operator"), users need to know how to recover funds. Phase 8 docs should include this.

**Should-do (for future phases):**

4. **Hydra channels for trusted recurring pairs.** This is the correct decentralized solution for micropayments between the same facilitator-merchant pair. Document as Phase 8+ priority.

5. **Credit balance attestation.** The facilitator could periodically publish a Merkle root of all credit balances to Cardano metadata, allowing any user to verify their balance was correctly included. This is a lightweight proof-of-reserves mechanism.

6. **Smart contract escrow.** A Plutus script could hold top-up deposits in escrow with a time-locked withdrawal mechanism. The facilitator gets access to spend the funds for settlements, but the user can reclaim after a timeout. Complex but eliminates custody risk.

### Plan-Level Assessment

#### Plan 06-01: Credit Ledger Foundation — Assessment: Strong (8/10)

**Strengths:**
- Lua-based atomic debit prevents race conditions (TOCTOU vulnerability addressed)
- Redis Hash per account (`credit:{address}`) is the correct data structure — O(1) lookups, HINCRBY atomicity
- Lazy expiration (check on read) matches Phase 2 UTXO reservation pattern — consistent architecture
- Transaction log capped at 1000 entries — prevents unbounded memory growth
- BigInt for all lovelace values — maintains project convention
- Serialization helpers (serializeAccount/deserializeAccount) with round-trip tests

**Concerns:**

| Concern | Severity | Detail |
|---------|----------|--------|
| TOCTOU in credit operation | Medium | `credit()` reads balance, checks max, then HINCRBY. Two concurrent top-ups could both pass the max balance check. Not security-critical (over-crediting, not under) but breaks the invariant. Should use Lua script for credit too. |
| No backup/export for credit data | Low | Redis AOF provides crash recovery, but there's no mechanism to export credit state for manual auditing or migration. |
| `CREDIT_TXLOG_MAX_ENTRIES = 1000` may be insufficient | Low | For a busy account with many micropayments, 1000 entries could represent only a few days of history. Transaction log trimming silently drops old entries. |

#### Plan 06-02: Top-Up and Balance Endpoints — Assessment: Good (7/10)

**Strengths:**
- Reuses settlePayment() — no duplicated settlement logic
- CRITICAL log for settle-success-credit-failure edge case — operator awareness
- payTo validation prevents crediting to wrong address
- Credits-disabled guard at route level — clean feature flag pattern

**Concerns:**

| Concern | Severity | Detail |
|---------|----------|--------|
| Sender address from `paymentRequirements.extra?.payer` is client-declared | Medium | The sender address is what the client says it is, not extracted from the transaction. A client could top up address A with a transaction paid by address B. For a learning project this is acceptable (the credit goes to whoever the client declares). For production, the sender should be extracted from transaction inputs. |
| No minimum balance enforcement on balance queries | Low | GET /credits/balance returns accounts with zero balance. Not a bug, but clients may need guidance on when an account is "useful." |
| processTopup failure after settlement has no automated recovery | High | If `ledger.credit()` throws after settlement succeeds, the user's ADA is on-chain in the facilitator's wallet but their credit account is not updated. The only recovery is manual. The CRITICAL log helps but there's no retry mechanism. |

**Recommendation for Concern #3 (processTopup failure after settlement):**

Add a retry loop with exponential backoff for the credit operation. If the L1 settlement succeeded (irreversible), the crediting must eventually succeed:

```
// Pseudocode
for attempt in [1, 2, 3]:
  try:
    await ledger.credit(...)
    return success
  catch:
    wait(500ms * 2^attempt)
    
// All retries failed — log CRITICAL and write to a recovery queue
await redis.lpush('credit:recovery', JSON.stringify({ address, amount, txHash }))
```

This adds a recovery queue that an operator can process later.

#### Plan 06-03: Payment Strategy Router — Assessment: Strong (8/10)

**Strengths:**
- `selectStrategy()` as a pure function is clean, testable, and side-effect-free
- Explicit client strategy override (`paymentStrategy: 'direct_l1'`) gives clients control
- buildPaymentStrategies() provides actionable guidance in failure responses — tells clients exactly what options exist
- `settleWithCredits()` is separate from `settlePayment()` — L1 path completely untouched
- Backward compatible: omitting paymentStrategy uses auto-selection

**Concerns:**

| Concern | Severity | Detail |
|---------|----------|--------|
| Transaction field now optional in SettleRequestSchema | Medium | Changing `z.string().min(1)` to `z.string().min(1).optional()` is a schema change that could affect existing validation tests. The route handler compensates with a runtime check, but the schema no longer enforces the invariant. |
| No audit trail for credit deductions via /settle | Medium | Credit deductions from /settle use `credit-settle:${Date.now()}` as the reference. This is not deterministic — if the request is retried, a different reference is generated. No idempotency for credit deductions. |
| Threshold source is `getMinUtxoLovelace(0)` (ADA-only) | Low | Token payments have higher min UTXO (~1.17 ADA for 1 token). The threshold should vary by asset type. Phase 6 credits are ADA-only so this is correct now but will need adjustment for token credits. |

**Recommendation for Concern #2 (credit deduction idempotency):**

Credit deductions should have a deterministic reference tied to the request. Use a hash of (payerAddress + amount + paymentRequirements) or accept a client-provided `idempotencyKey`. Multiple identical requests should produce the same deduction (not two deductions).

#### Plan 06-04: 402 Enrichment, Lifecycle Tests, L2 Research — Assessment: Adequate (6/10)

**Strengths:**
- Lifecycle tests cover the full flow (topup → balance → micropayment → balance decrease)
- Strategy auto-selection tested end-to-end
- L2 feasibility document fulfills a roadmap requirement with clear timelines

**Concerns:**

| Concern | Severity | Detail |
|---------|----------|--------|
| Lifecycle tests mock settlePayment | Medium | The "end-to-end" tests mock the L1 settlement. This means the top-up flow is never tested against real verification + settlement. The integration is partial — it proves the credit system works but not that L1 → credit flow works. |
| 402 response enrichment scope unclear | Low | The Phase 6 plan enriches GET /credits/balance and /settle failure responses, but the actual 402 Payment Required response (returned by the resource server when no payment is included) isn't built until Phase 7/8. The enrichment is useful but won't be visible to clients until the full flow is assembled. |
| L2 feasibility document is the last task | Info | Writing research documentation as the final wave task means it's done under execution pressure. Research quality could suffer. Consider front-loading or writing alongside Plans 01-03. |

### Cross-Cutting Issues Specific to Phase 6

#### 1. CARD-03 Requirement Mismatch

REQUIREMENTS.md defines **CARD-03** as: *"Facilitator batches multiple payments into single on-chain transactions for economic viability."*

Phase 6 no longer does this. It implements prepaid credits, which are completely different. The requirement should be updated to reflect the pivot:

**Suggested:** *"CARD-03: Facilitator enables economically viable small payments despite Cardano's min UTXO floor."*

The traceability table in REQUIREMENTS.md still says CARD-03 → Phase 6 → Pending, which is correct but the requirement text is stale.

#### 2. Missing Requirement: Credit System

The credit system introduces several capabilities that have no formal requirement IDs:

| Capability | Where It Exists | Missing ID |
|-----------|----------------|------------|
| Prepaid credit accounts per address | Phase 6 core feature | No requirement ID |
| Credit top-up via L1 payment | POST /credits/topup | No requirement ID |
| Credit balance query | GET /credits/balance | No requirement ID |
| Automatic payment strategy routing | Phase 6 Plan 03 | No requirement ID |
| Credit transaction audit trail | Transaction log in Redis | No requirement ID |

#### 3. Facilitator Address is Not a Wallet

Plan 06-01 adds `facilitatorAddress` to ChainConfig. The research doc explicitly states: *"This is NOT a wallet (no private key) — it's the address where top-up payments are sent."*

But there's an implicit assumption: the facilitator must **already control this address** to eventually spend the deposited funds. If nobody controls the address, top-up payments are burned ADA. If someone controls it but it's not configured in the system, there's no automated access.

**Question:** Where does the facilitator address come from? Is it derived from the existing `chain.facilitator.seedPhrase` / `chain.facilitator.privateKey` in ChainConfig? If so, the relationship should be documented. If it's a separate watch-only address, who controls the funds?

#### 4. Token Credits Are Explicitly Deferred

Phase 6 credits are ADA-only (lovelace denominated). The research anti-patterns section correctly identifies that token credits "add significant complexity (exchange rates, per-asset balances)." This means:

- A user holding USDM who wants to make micropayments must first acquire ADA to top up
- Credit balances cannot be used for token payments (USDM, DJED, iUSD)
- The strategy router only works for lovelace-denominated payments

This is a reasonable scope cut for v1 but should be documented as a known limitation.

#### 5. Redis as Sole Source of Truth for Real Money

The credit ledger stores real monetary value in Redis. A Redis failure, data corruption, or misconfigured persistence could result in loss of user funds (in the form of lost credit balances). Current mitigations:

- Redis runs with AOF persistence (`--appendonly yes` in docker-compose.yml)
- Fire-and-forget pattern for transaction log writes (non-blocking but failures are silent)
- No backup strategy documented

For a learning project with a small trust radius, this is acceptable. For any deployment involving real funds, Redis should be:
- Running with both RDB snapshots AND AOF
- Backed up regularly to a separate location
- Monitored for replication lag (if replicated)

### Risk Register for Phase 6

#### Risks We Accept

| Risk | Severity | Mitigation |
|------|----------|------------|
| Credit TOCTOU in top-up (over-crediting) | Medium | Max balance cap limits exposure; single-instance deployment reduces concurrency |
| processTopup credit failure after settlement | High | CRITICAL log + manual recovery; no automated retry |
| Client-declared sender address for top-up | Medium | Acceptable for personal use; extract from tx inputs for production |
| Redis data loss = lost credit balances | Medium | AOF persistence; small trust radius; documented risk |
| No withdrawal mechanism | Medium | Explicit design decision; manual refund out-of-band; limits custodial scope |

#### Risks the Plans Don't Address

| Risk | Severity | Current State |
|------|----------|---------------|
| No credit deduction idempotency | Medium | Same request retried = double deduction. Needs deterministic reference or dedup key. |
| No user-facing balance verification | Medium | User cannot independently verify their balance — must trust the facilitator's API response. |
| Credit system abuse (spam account creation) | Low | Rate limiting on credit endpoints listed in ROADMAP security checks but not in plans. |
| Facilitator address funding lifecycle | Medium | Who funds this address? How are accumulated top-ups managed? Not documented. |
| Data privacy | Low | Credit balances and transaction history stored in plaintext Redis. No encryption at rest. |

### Verdict

**Phase 6 Plan Quality: 7/10**

The plans are well-structured, follow established project patterns, and honestly confront the Cardano micropayment problem. The pivot from batching to prepaid credits is the right call — it solves a real economic problem that no other Cardano x402 implementation has addressed.

The centralization concern is **valid and important**, but it's also **inherent to the problem space.** Cardano L1 does not support sub-1-ADA payments. The options are:

1. **Accept the min UTXO floor** (FluxPoint approach) — price above ~1 ADA
2. **Go off-chain** (credit system) — centralized but functional
3. **Use L2** (Hydra/Midnight) — decentralized but immature
4. **Wait for governance** (utxoCostPerByte reduction) — uncertain timeline

Option 2 is the pragmatic choice for a learning project. The plans correctly defer Options 3 and 4 to research documentation. Option 1 is what exists today in the Cardano x402 ecosystem.

**The credit system should be built with eyes open.** Document the trust model. Build in audit mechanisms where possible. And treat it as a stepping stone toward the decentralized alternatives that will mature over 2026-2027.

### Recommended Action Items for Phase 6

#### High Priority (Before Execution)

1. **Update CARD-03 requirement text** to reflect the pivot from batching to micropayment strategy.
2. **Clarify facilitator address provenance.** Is it derived from seedPhrase? A separate address? Who controls the funds?
3. **Add credit operation retry** in processTopup for the settlement-succeeded-but-credit-failed edge case.

#### Medium Priority (During Execution)

4. **Use Lua script for credit() too**, not just debit(). The TOCTOU window on max balance check is a real concern under concurrent top-ups.
5. **Add deterministic reference for credit deductions** in settleWithCredits(). Use a hash of (payerAddress + amount + requestHash) as the dedup key.
6. **Log credit deduction events at INFO level** with enough context for manual auditing.

#### Low Priority (After Execution)

7. **Write the trust model document** — either standalone or as a section in the L2 feasibility document. Be honest about what the credit system is and isn't.
8. **Add requirement IDs** for credit system capabilities (top-up, balance, strategy routing, audit trail).
9. **Consider on-chain metadata anchoring** for top-up deposits (FluxPoint label 2222 pattern) — provides user-verifiable proof of deposit.
10. **Plan Redis backup strategy** for credit data — even a simple `BGSAVE` cron job would help.

---

*Phase 6 plan review: 2026-02-11*
*Auditor: Claude (claude-opus-4-5-20251101)*
*Scope: .planning/phases/06-micropayment-strategy/ (6 documents), cross-referenced with ROADMAP.md, STATE.md, REQUIREMENTS.md, PROJECT.md, src/settle/, src/chain/, 06-pre-planning-assumptions.md, 06-RESEARCH.md*

