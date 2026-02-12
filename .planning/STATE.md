# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-10)

**Core value:** A working x402 payment flow on Cardano that I understand end-to-end
**Current focus:** Roadmap restructured. Micropayment Strategy dropped — Cardano min UTXO accepted as market positioning (high-value operations ≥1 ADA). Phases 6-9 now: Security Hardening → Production Infrastructure → Resource Server SDK → Documentation & Publishing.

## Current Position

Phase: 9 of 9 (Documentation & Publishing) -- COMPLETE
Plan: 6 of 6 in phase 9 (wave 3) -- DONE
Status: Phase 9 complete -- All 6 plans executed, documentation and publishing ready
Last activity: 2026-02-12 - Plan 09-06 executed (Final verification + ROADMAP update)

Progress: [████████████████████████████████] Phase 9 complete
Phase 9: [██████████] 6/6 plans complete
Next: PROJECT COMPLETE -- All 9 phases delivered

## Performance Metrics

**Velocity:**
- Total plans completed: 37
- Average duration: 5 min
- Total execution time: 2.57 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 5 | 30 min | 6 min |
| 02-chain-provider | 6 | 31 min | 5 min |
| 03-verification | 4 | 24 min | 6 min |
| 04-settlement | 3 | 14 min | 5 min |
| 05-stablecoins | 3 | 13 min | 4 min |
| 06-security-hardening | 4 | 23 min | 6 min |
| 07-production-infrastructure | 3 | 7 min | 2 min |
| 08-resource-server-sdk | 6 | 33 min | 6 min |
| 09-documentation-publishing | 6 | 9 min | 2 min |

**Recent Trend:**
- Last 5 plans: 3 min, 5 min, 9 min, 5 min, 2 min
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
| TxInfo as plain interface (not Zod) | 04-01 | Only used internally for Blockfrost response typing, never validated at runtime |
| chain/ imports settle/ for TxInfo | 04-01 | TxInfo is pure data interface with no logic; acceptable cross-module dependency |
| 425 added to RETRYABLE_STATUS_CODES | 04-01 | Blockfrost-specific mempool congestion code, transient condition |
| Hardcoded settlement constants (5s/120s/24h) | 04-02 | Per research -- unlikely to change, easy to extract to config later |
| RedisLike interface (not ioredis import) | 04-02 | Minimal dependency surface; only needs set()/get(); easier to mock |
| handleExistingRecord extracted as helper | 04-02 | Isolates dedup branch logic from happy path flow |
| Public blockfrostClient accessor on ChainProvider | 04-03 | Routes need BlockfrostClient; minimal getter avoids exposing private field |
| Mock settlePayment at function level for settle tests | 04-03 | Route tests focus on HTTP handling, not settlement orchestration |
| Mock blockfrost-client module for status tests | 04-03 | Gives clean control over getTransaction returns via module factory |
| Token registry as ReadonlyMap keyed by unit strings | 05-01 | Security gate: hardcoded tokens require code review to add |
| Optional VerifyContext.asset and getMinUtxoLovelace | 05-01 | Incremental rollout: existing routes compile without new fields until Plan 03 |
| PaymentRequirementsSchema.asset defaults to 'lovelace' | 05-01 | Backward compatibility for ADA-only clients that omit asset field |
| checkAmount ADA path uses _matchingOutputAmount | 05-02 | Backward compat with existing test mocks; token path uses assets map |
| checkMinUtxo skips when getMinUtxoLovelace absent | 05-02 | Allows existing routes to work before Plan 03 wires the callback |
| Overpayment allowed (>=) for ADA and tokens | 05-02 | Matches existing ADA behavior; exact matching rejects legitimate txs |
| VERIFICATION_CHECKS pipeline order (10 checks) | 05-02 | token_supported at 4 (before recipient), min_utxo at 7 (after amount) |
| asset + getMinUtxoLovelace in VerifyContext assembly | 05-03 | Both routes thread paymentRequirements.asset and ChainProvider callback |
| settle-payment.ts unchanged for token support | 05-03 | Asset-agnostic by design; re-verify picks up token checks automatically |
| Test helper refactored for paymentRequirements overrides | 05-03 | First arg = paymentRequirements overrides, second = top-level overrides |
| Phase 6 pivot: Batching → Micropayment Strategy | 06-pre | L1 batching saves only ~15% (min UTXO per output); prepaid credits + L2 research more impactful |
| FluxPoint dual-rail as reference architecture | 06-pre | Base L2 for cheap payments, Cardano L1 for high-value + audit; validates the pattern |
| Prepaid credit accounts as primary micropayment solution | 06-pre | Off-chain ledger amortizes L1 costs; no custodial key management needed |
| L2 (Hydra, Midnight) deferred to research deliverable | 06-pre | Both too early for production; document feasibility, don't build |
| Micropayment Strategy dropped entirely | 06-drop | Min UTXO is market positioning, not a problem. Cardano x402 targets high-value ops (≥1 ADA). Let EVM L2s handle micropayments. |
| Roadmap restructured: 4 new phases | 06-drop | Phase 6: Security Hardening, Phase 7: Production Infra, Phase 8: Resource Server SDK, Phase 9: Docs & Publish |
| maxL1Entries as constructor option (default 10,000) | 06-02 | Testability: tests use lower cap (e.g. 3) to verify eviction without creating 10K entries |
| Debug level for Redis fire-and-forget logging | 06-02 | Redis is not source of truth; failures are informational, not operational alerts |
| Redis db field default 0, password/username optional | 06-02 | Backward compatible; existing configs without auth fields work via Zod defaults |
| Route-level config.rateLimit for per-endpoint limits | 06-03 | Fastify 3-arg form with config.rateLimit overrides global @fastify/rate-limit |
| Adversarial tests mock at module level for isolation | 06-03 | verifyPayment + settlePayment mocked via vi.mock for HTTP-level testing |
| libsodium-wrappers-sumo 0.8.2 accepted risk | 06-03 | Zero audit vulnerabilities; required for ESM compat with @lucid-evolution/lucid |
| OWASP ZAP accepted risk, deferred to Phase 7 | 06-04 | Requires CI/CD infrastructure; adversarial tests provide interim coverage |
| Token metadata accepted risk (hardcoded registry) | 06-04 | Intentional security gate; prevents on-chain metadata spoofing |
| Phase 1 security items had evidence references added | 06-04 | Already [x] from prior execution; evidence traceability added |
| Single CI job (not parallel) | 07-01 | All steps are fast; parallel jobs add complexity without meaningful time savings |
| pnpm/action-setup@v4 auto-reads packageManager | 07-01 | No version pinning needed in workflow; reads from package.json |
| No separate coverage action | 07-01 | vitest thresholds enforce coverage in-process; no external action needed |
| pnpm audit --audit-level=high in CI | 07-01 | Fails CI on high/critical vulnerabilities; aligns with security hardening posture |
| --ignore-scripts for prod pnpm install | 07-02 | husky prepare script unavailable without devDeps; --ignore-scripts prevents lifecycle failure |
| Alpine base for Docker image | 07-02 | Minimal image size (~180MB vs ~1GB); wget available for healthcheck |
| Non-root appuser:1001 in container | 07-02 | Security best practice; container never runs as root |
| Runtime config mount (never baked in) | 07-02 | config/config.json bind-mounted :ro; secrets never in image layers |
| Compose profiles for dev/prod separation | 07-02 | `docker compose up` unchanged; `--profile production` adds facilitator + Redis auth |
| Production Redis on port 6380 | 07-02 | Avoids conflict with dev Redis on 6379 if both profiles run simultaneously |
| Sentry tracesSampleRate defaults 0.1 | 07-03 | 10% sampling prevents burning Sentry quota; was hardcoded 1.0 |
| Health version via readFileSync at module load | 07-03 | process.env.npm_package_version only set by pnpm scripts, not node dist/index.js |
| Config example shows production values | 07-03 | redis-prod host, auth, rate limits, JSON logs as production baseline |
| getAddress() delegates to lucid.wallet().address() | 08-02 | Single line, no caching needed; wallet address rarely changes |
| /supported try/catch on getAddress returns 500 | 08-02 | Generic error message; no internal details leaked |
| FacilitatorClient tests mock globalThis.fetch | 08-02 | Real Response objects; no HTTP library dependency in tests |
| Spread paymentRequiredOptions per request | 08-04 | Avoids shared state mutation between concurrent requests in payment gate |
| HandlerFn type alias in tests | 08-04 | Bypasses Fastify this-context constraint without mock FastifyInstance |
| FsBackend CID sanitization via hex regex | 08-03 | /^[a-f0-9]{64}$/ prevents path traversal on get() and has() |
| IpfsBackend uses native fetch (no client lib) | 08-03 | Kubo HTTP API is simple enough; avoids ipfs-http-client dependency |
| Storage config fully optional with Zod defaults | 08-03 | Existing configs work unchanged; defaults to FsBackend('./data/files') |
| Buffer to Blob via Uint8Array | 08-03 | TypeScript strict mode rejects Buffer as BlobPart; Uint8Array is compatible |
| Mock payment gate at module level for upload tests | 08-05 | FacilitatorClient makes HTTP calls incompatible with server.inject(); gateMode variable controls pass/reject |
| Health check ipfs -> storage rename | 08-05 | Reflects actual storage backend used; placeholder checkIpfs replaced with real checkStorage |
| eslint-disable for noop done callback in upload route | 08-05 | Async preHandlerHookHandler ignores done; TypeScript requires it for call signature |
| requireEnv() for type-safe env var validation | 08-06 | Avoids string\|undefined after process.exit(); returns string (never for exit path) |
| Uint8Array wrapping for Buffer-to-Blob compat | 08-06 | Same pattern as 08-03 IpfsBackend; TypeScript strict mode rejects Buffer as BlobPart |
| Add examples/ to tsconfig include | 08-06 | eslint projectService needs tsconfig coverage for pre-commit hook to lint examples |
| Mermaid for GitHub-native diagrams | 09-03 | Renders natively on GitHub without external tools; 4 diagram types for different views |
| attachValidation: true for safeParse routes | 09-01 | Preserves x402 protocol contract (HTTP 200 for all validation results); handler-level validation gives richer error responses |
| Object entry format for dual tsup entry points | 09-04 | Named entries (index + sdk) produce dist/index.js and dist/sdk.js; tsup auto-splits shared Zod schemas into chunk |
| files whitelist for npm security gate | 09-04 | Only dist/, LICENSE, README.md published; prevents .planning/, config/, tests/ leakage |
| Placeholder repository URLs | 09-04 | YOUR_USERNAME in repository/bugs/homepage for user to fill before first publish |
| Both Zod compilers set globally | 09-01 | Required for Fastify to handle Zod schemas in route schema declarations; serializerCompiler for response, validatorCompiler for body |
| z.object over z.record for health dependencies | 09-01 | Zod v4 z.record produces invalid JSON Schema for fast-json-stringify; explicit keys more precise |
| Explicit error response schemas per route | 09-01 | TypeScript requires all status codes in response schema; also documents error shapes in OpenAPI spec |

### Pending Todos

0 todos in `.planning/todos/pending/`. All cleared 2026-02-12:

| # | Title | Resolution |
|---|-------|------------|
| 1 | Support X-PAYMENT-RESPONSE header | Redundant — settle response already returns {success, transaction, network} |
| 2 | Rename amount to maxAmountRequired | Already done — field is maxAmountRequired across 27 files |
| 3 | Consider moving /supported endpoint earlier | Already done — built in Phase 8 |
| 4 | Document masumi native token format | Already done — token registry uses policyId + assetNameHex format |

12 todos total completed (moved to `done/`).

### Blockers/Concerns

None - Roadmap restructured. Phase 6 micropayment plans exist in `.planning/phases/06-micropayment-strategy/` as historical reference but will not be executed.

## Session Continuity

Last session: 2026-02-12
Stopped at: Completed 09-06-PLAN.md (Final verification + Project complete)
Resume file: PROJECT COMPLETE -- all 9 phases delivered

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

## Phase 4 Completion Summary

Phase 4 built the complete settlement pipeline:

- **04-01**: Settlement types (SettleRequest/Response, StatusRequest/Response Zod schemas), TxInfo interface, BlockfrostClient extensions (submitTransaction, getTransaction), 425 retryable
- **04-02**: settlePayment() orchestrator (re-verify, SHA-256 dedup via Redis SET NX, Blockfrost submission, poll confirmation 5s/120s), 12 unit tests
- **04-03**: POST /settle and POST /status route plugins, server wiring, 16 integration tests

Key artifacts for Phase 5:
- `src/routes/settle.ts` - POST /settle endpoint (Zod validation, VerifyContext assembly, settlePayment call)
- `src/routes/status.ts` - POST /status endpoint (lightweight Blockfrost confirmation query)
- `src/settle/settle-payment.ts` - Settlement orchestrator with dedup and polling
- `src/settle/types.ts` - All settlement Zod schemas and TypeScript types
- `src/server.ts` - Server with 4 route plugins: health, verify, settle, status
- 204 tests across 14 suites, all passing

## Phase 5 Completion Summary

Phase 5 added end-to-end stablecoin payment support (USDM, DJED, iUSD):

- **05-01**: Token registry (hardcoded ReadonlyMap as security gate), VerifyContext type extensions (optional asset + getMinUtxoLovelace), PaymentRequirementsSchema.asset with Zod default, failure messages
- **05-02**: checkTokenSupported (registry-based validation), checkAmount token branching (ADA/token), checkMinUtxo (async min UTXO check via callback), pipeline expanded 8->10 checks
- **05-03**: Route handler wiring (asset + getMinUtxoLovelace threaded into VerifyContext), barrel exports, 7 integration tests

Key artifacts for Phase 6:
- `src/verify/token-registry.ts` - Hardcoded token definitions (SUPPORTED_TOKENS, LOVELACE_UNIT, assetToUnit)
- `src/verify/checks.ts` - 10 verification checks including token_supported, token amount branching, min_utxo
- `src/verify/types.ts` - VerifyContext with asset and getMinUtxoLovelace fields
- `src/routes/verify.ts` - /verify with full token threading
- `src/routes/settle.ts` - /settle with full token threading (re-verify picks up token checks)
- 246 tests across 16 suites, all passing

## Phase 6 Completion Summary

Phase 6 hardened the facilitator to production-ready security standard:

- **06-01**: Coverage gap closure -- error handler 100% coverage, health endpoint 89%, thresholds raised to 80/65/75/80
- **06-02**: Operational resilience -- structured Redis error logging (4 locations), L1 cache bounded at 10K entries, Redis auth config
- **06-03**: Security controls -- per-endpoint rate limits on /verify, /settle, /status; adversarial test suite (13 tests, 6 categories); clean dependency audit
- **06-04**: Security checklist closure -- 30 items closed across Phases 1-6 (28 verified, 2 accepted risk); 06-VERIFICATION.md produced

Key artifacts for Phase 7:
- `.planning/phases/06-security-hardening/06-VERIFICATION.md` - Security posture verification report
- `.planning/ROADMAP.md` - All Phase 1-6 security items closed
- `vitest.config.ts` - Coverage thresholds enforced at 80/65/75/80
- `tests/security/` - 19 security-focused tests (6 controls + 13 adversarial)
- 298 tests across 19 suites, all passing

## Phase 7 Completion Summary

Phase 7 established production infrastructure:

- **07-01**: GitHub Actions CI/CD pipeline (lint, typecheck, test+coverage, build, dependency audit)
- **07-02**: Production Docker: multi-stage Dockerfile, .dockerignore, production compose profile
- **07-03**: Operational readiness: Sentry config, health version fix, config examples, runbook

Key artifacts for Phase 8:
- `.github/workflows/ci.yml` - CI pipeline (lint, typecheck, test, build, audit)
- `Dockerfile` - Multi-stage production image (Alpine, non-root)
- `docker-compose.yml` - Dev and production profiles
- `docs/runbook.md` - Operational runbook
- 305 tests across 20 suites, all passing

## Phase 8 Completion Summary

Phase 8 built the Resource Server SDK and reference implementation:

- **08-01**: SDK core: types (PaymentRequiredResponse, PaymentSignaturePayload), FacilitatorClient, 402 builder, barrel exports
- **08-02**: ChainProvider.getAddress(), GET /supported endpoint, FacilitatorClient tests with mock fetch
- **08-03**: Storage layer: StorageBackend interface, FsBackend (SHA-256 CID), IpfsBackend (Kubo HTTP), config schema
- **08-04**: Payment gate middleware (createPaymentGate), Fastify type augmentation, settle-before-execution
- **08-05**: POST /upload (payment-gated multipart), GET /files/:cid (free download), server integration, health check
- **08-06**: Example client (7-step x402 payment flow), README, ROADMAP update

Key artifacts for Phase 9:
- `src/sdk/` - Complete SDK: types, FacilitatorClient, payment-required, payment-gate, barrel
- `src/storage/` - StorageBackend interface with FsBackend and IpfsBackend
- `src/routes/upload.ts` - Payment-gated file upload
- `src/routes/download.ts` - Free file download by CID
- `src/routes/supported.ts` - GET /supported (PROT-03)
- `examples/client.ts` - Full x402 payment cycle example
- `examples/README.md` - Setup and running instructions
- 383 tests across 27 suites, all passing

## Phase 9 Completion Summary

Phase 9 documented the system for public sharing and prepared for open-source publication:

- **09-01**: OpenAPI/Swagger integration -- @fastify/swagger + fastify-type-provider-zod, schema declarations on all 7 routes, Swagger UI at /docs
- **09-02**: README, LICENSE (Apache-2.0), CONTRIBUTING.md, SECURITY.md
- **09-03**: Architecture diagrams -- 4 Mermaid diagrams (component, payment flow, internal, data flow)
- **09-04**: npm publishing setup -- dual tsup entry points (server + SDK), exports map, files whitelist
- **09-05**: Deployment guide and Cardano x402 positioning document
- **09-06**: Final verification, security checklist closure, ROADMAP update

Key artifacts:
- `README.md` -- Quick start, API reference, SDK usage
- `LICENSE` -- Apache-2.0 (matches upstream x402 protocol)
- `CONTRIBUTING.md` -- Dev setup, coding standards, PR process
- `SECURITY.md` -- Responsible disclosure process
- `docs/architecture.md` -- 4 Mermaid diagrams
- `docs/deployment.md` -- Docker + bare metal deployment guide
- `docs/cardano-x402.md` -- Why Cardano for x402
- `/docs` endpoint -- Interactive Swagger UI
- `package.json` -- exports map with ./sdk subpath, files whitelist
- 383 tests across 27 suites, all passing

## Project Complete

All 9 phases delivered. The x402 Cardano payment facilitator is production-ready with:
- 37 plans executed across 9 phases
- 383 tests, 27 suites, 0 failures
- 0 type errors, 0 lint violations
- Full security hardening (30+ checklist items closed)
- CI/CD pipeline, Docker production config, operational runbook
- Resource server SDK with reference implementation
- Complete documentation for public open-source publication
