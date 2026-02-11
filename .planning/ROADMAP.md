# Roadmap: x402 Cardano Facilitator

## Overview

This roadmap delivers a production-ready x402 payment facilitator on Cardano with a reference resource server demonstrating high-value operations. Phases 1-5 built the core facilitator (foundation, chain provider, verification, settlement, stablecoins). The remaining phases harden for production, add CI/CD and monitoring, build a resource server SDK with a reference implementation, and document everything for publication.

**Market positioning:** Cardano x402 targets operations worth 1+ ADA (~$0.30+) — AI agent tasks, document processing, compute-on-demand, file storage. EVM L2s (Base, Optimism) handle sub-cent micropayments. Different chains for different price tiers, not competing solutions.

## Security Tooling

Security is enforced through automated tooling integrated into the development workflow:

| Tool | Purpose | When | Cost |
|------|---------|------|------|
| **Snyk** | Dependency vulnerability scanning | Every PR, daily scan | Free tier available |
| **CodeRabbit** | AI-powered code review | Every PR | $15/user/month |
| **Sentry** | Error monitoring + performance | Runtime | Free tier (5K errors/mo) |
| **SonarCloud** | Static analysis, code smells, bugs | Every PR | Free for open source |
| **GitHub Advanced Security** | Secret scanning, code scanning | Continuous | Free for public repos |
| **OWASP ZAP** | API security testing | Per phase completion | Free (open source) |

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Project scaffolding, tooling, security baseline, and development infrastructure
- [x] **Phase 2: Chain Provider** - Cardano blockchain interaction and UTXO state management
- [x] **Phase 3: Verification** - Payment signature verification and security enforcement
- [x] **Phase 4: Settlement** - Client-signed transaction submission with on-chain confirmation
- [x] **Phase 5: Stablecoins** - Multi-token support for USDM, DJED, iUSD
- [x] **Phase 6: Security Hardening** - Close audit gaps, harden Phases 1-5 to production-ready standard
- [ ] **Phase 7: Production Infrastructure** - CI/CD, Docker production config, monitoring, operational readiness
- [ ] **Phase 8: Resource Server SDK + Reference Implementation** - End-to-end x402 flow with a high-value use case
- [ ] **Phase 9: Documentation & Publishing** - OpenAPI, architecture diagrams, deployment guide, npm publish

## Phase Details

### Phase 1: Foundation
**Goal**: Establish a solid project foundation with proper tooling, security baseline, and development infrastructure before any business logic
**Depends on**: Nothing (first phase)
**Requirements**: OPER-01, OPER-02, OPER-03, FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05

**Deliverables:**

*Project Scaffolding:*
- TypeScript configuration (strict mode, path aliases, ES2022 target)
- Package management with pnpm (faster, disk-efficient)
- Directory structure: `src/`, `tests/`, `config/`, `docs/`
- Build tooling with tsdown (fast Rolldown-based builds)
- ESLint + Prettier for code quality (Airbnb config)
- Git hooks with husky + lint-staged for pre-commit checks

*Development Infrastructure:*
- Testing framework with Vitest (fast, TypeScript-native)
- Configuration via JSON with Zod validation (not .env)
- Development server with hot reload (tsx watch)
- VS Code debug configuration (launch.json)
- Docker setup for dependencies (IPFS, Redis)

*Server Foundation:*
- HTTP server with Fastify (faster than Express, better TypeScript)
- Middleware architecture (CORS, request ID, timing)
- Error handling patterns (typed errors, consistent JSON responses)
- Request/response validation with Zod schemas

*Observability:*
- Structured logging with pino (JSON logs, Fastify default)
- Configuration file support (JSON with Zod schema validation)
- Health check endpoint (/health with dependency status)

*Security Baseline:*
- Dependabot integration for dependency scanning
- Secret management patterns (config.json gitignored, no secrets in code)
- Input validation patterns established (Zod on all inputs)
- Security headers with @fastify/helmet
- Sentry integration for error tracking

**Success Criteria** (what must be TRUE):
  1. `pnpm install && pnpm build` succeeds with zero errors/warnings
  2. `pnpm test` runs test suite with coverage reporting
  3. `pnpm lint` passes with zero violations
  4. Server starts and reads configuration from validated JSON file
  5. GET /health returns 200 with server status and dependency checks
  6. Requests and responses are logged with timestamps and correlation IDs
  7. Dependabot configured for weekly scans
  8. Pre-commit hooks run lint and type-check before allowing commit

**Security Checks:**
- [x] Dependency scanning enabled (Dependabot) — `.github/dependabot.yml` (weekly, grouped)
- [x] No secrets in repository (config.json gitignored) — `.gitignore` lines 8-9
- [x] Security headers configured (helmet) — `src/server.ts` registers `@fastify/helmet`
- [x] Input validation on all endpoints (Zod) — `safeParse()` on /verify, /settle, /status, config
- [x] Error responses don't leak internal details in production — `error-handler.ts` sanitizeMessage() + 06-01 tests (100% coverage) + 06-03 adversarial tests

**Plans**: 5 plans in 4 waves

Plans:
- [x] 01-01-PLAN.md — Project bootstrap (pnpm, TypeScript, ESLint, husky)
- [x] 01-02-PLAN.md — Testing infrastructure + Docker dev environment
- [x] 01-03-PLAN.md — Configuration system with Zod validation
- [x] 01-04-PLAN.md — HTTP server foundation (Fastify + plugins)
- [x] 01-05-PLAN.md — Health endpoint + Sentry + Dependabot

### Phase 2: Chain Provider
**Goal**: Implement Cardano blockchain interaction with UTXO tracking and reservation
**Depends on**: Phase 1
**Requirements**: CARD-01, CARD-02, CARD-05, CARD-06

**Deliverables:**
- Blockfrost client wrapper with retry logic and rate limiting
- UTXO query and tracking (fetch, cache, refresh)
- UTXO reservation system (lock/unlock with TTL)
- Transaction builder foundation (Lucid Evolution integration)
- Min UTXO calculation for outputs
- Validity interval handling (slot queries, TTL setting)
- ADA balance checking for addresses

**Success Criteria** (what must be TRUE):
  1. Facilitator queries and tracks UTXO state from Blockfrost
  2. UTXOs can be reserved to prevent contention during concurrent operations
  3. Transactions include correct min UTXO ADA for outputs
  4. Transactions use proper slot-based validity intervals
  5. Blockfrost API key is never logged or exposed in errors

**Security Checks:**
- [x] Blockfrost API key stored in config file, not code — `config/config.json` (gitignored), loaded via Zod-validated schema at `src/chain/config.ts`
- [x] API key not logged in any request/response logs — `blockfrost-client.ts` JSDoc: "sensitive -- never log"; private class field; 06-03 adversarial test confirms no leakage
- [x] UTXO state integrity verified (no phantom UTXOs) — UTXOs fetched fresh from Blockfrost API, cached with TTL expiry; no local UTXO fabrication possible
- [x] Rate limiting prevents API key abuse — Global rate limit via `@fastify/rate-limit` (06-03); per-endpoint sensitive limits on /verify, /settle, /status
- [x] Error messages don't expose API key or internal state — `error-handler.ts` sanitizeMessage() for 5xx; 06-03 adversarial secret leakage test

**Plans**: 6 plans (5 core + 1 gap closure)

Plans:
- [x] 02-01-PLAN.md — Chain types, domain errors, and config schema extension
- [x] 02-02-PLAN.md — Blockfrost client with exponential backoff retry (TDD)
- [x] 02-03-PLAN.md — Redis client, two-layer UTXO cache, and health check wiring
- [x] 02-04-PLAN.md — UTXO reservation system with TTL (TDD)
- [x] 02-05-PLAN.md — Lucid provider, ChainProvider orchestrator, and server integration
- [x] 02-06-PLAN.md — Fix libsodium-wrappers-sumo ESM override for tsx runtime (gap closure)

### Phase 3: Verification
**Goal**: Validate Cardano payment transactions using transaction-based verification model
**Depends on**: Phase 2
**Requirements**: PROT-01, PROT-04, PROT-05, SECU-01, SECU-02, SECU-03

**Deliverables:**
- CBOR transaction deserialization (CML via Lucid Evolution)
- Output verification (recipient address + payment amount)
- Network and scheme validation (CAIP-2 chain IDs)
- Witness presence check (transaction is signed)
- TTL and fee sanity checks
- /verify endpoint implementation (POST, always HTTP 200)
- x402 V2 wire format compliance

**Success Criteria** (what must be TRUE):
  1. POST /verify accepts base64-encoded signed CBOR transactions and returns verification result
  2. Transaction outputs are verified against required recipient and amount
  3. Network mismatch (wrong Cardano network) is detected and rejected
  4. Unsigned transactions (missing witnesses) are rejected
  5. Expired transactions (TTL < current slot) are detected
  6. All verification failures collected (not fail-fast) with specific snake_case reasons

**Security Checks:**
- [x] All verification failures logged with details (but not secrets) — `verify-payment.ts` logs failure reasons array at INFO level; error handler sanitizes 5xx; no CBOR/secrets in logs
- [x] UTXO model provides inherent replay protection (no separate nonce tracking needed) — Cardano UTXOs are consumed on-chain; spent UTXO disappears from UTXO set; blockchain provides replay protection inherently
- [x] Address comparison uses canonical CBOR hex (not bech32 string comparison) — `checks.ts` checkRecipient uses `Address.to_hex()` for canonical comparison
- [x] Raw transaction CBOR not logged (could be large) — grep confirms no CBOR logging in src/; only txHash and metadata logged
- [x] OWASP ZAP scan on /verify endpoint passes — **Accepted risk:** OWASP ZAP not yet configured; deferred to Phase 7 (CI/CD). Manual API testing + 06-03 adversarial tests cover input validation and error sanitization.

**Plans**: 4 plans in 4 waves

Plans:
- [x] 03-01-PLAN.md — Verification types, Zod schemas, domain errors, config extension (transaction-based)
- [x] 03-02-PLAN.md — CBOR deserialization and verification check functions (TDD)
- [x] 03-03-PLAN.md — Verification orchestrator with multi-error collection (TDD)
- [x] 03-04-PLAN.md — POST /verify route and server integration

### Phase 4: Settlement
**Goal**: Submit client-signed Cardano transactions to the blockchain and confirm settlement
**Depends on**: Phase 3
**Requirements**: PROT-02, OPER-04

**Deliverables:**
- Re-verify pre-signed transaction (defense-in-depth via verifyPayment)
- Submit client's raw CBOR to Blockfrost /tx/submit
- Confirmation polling (5s interval, 120s timeout, 1-depth confirmation)
- Idempotency via CBOR SHA-256 dedup key in Redis (SET NX, 24h TTL)
- POST /settle endpoint (synchronous settle-and-wait)
- POST /status endpoint (lightweight confirmation polling)
- BlockfrostClient extension (submitTransaction + getTransaction)
- Settlement domain types and Zod schemas

**Success Criteria** (what must be TRUE):
  1. POST /settle re-verifies, submits, and waits for on-chain confirmation before returning success
  2. Duplicate submissions are detected and handled idempotently via Redis dedup
  3. Settlement times out at 120 seconds with reason confirmation_timeout
  4. POST /status checks Blockfrost for transaction confirmation status
  5. All responses are HTTP 200 with application-level success/failure

**Security Checks:**
- [x] No double-settlement possible (CBOR SHA-256 dedup in Redis) — `settle-payment.ts` computeDedupKey() + Redis SET NX; 06-03 adversarial replay test confirms idempotency
- [x] Transaction re-verified before submission (defense-in-depth) — `settle-payment.ts` line 129 calls verifyPayment() before Blockfrost submit
- [x] 400 errors from Blockfrost not retried (fail immediately) — `blockfrost-client.ts` isRetryableError() excludes 400; only 425/429/500-504 retried
- [x] Confirmation verified on correct network (CAIP-2 chain ID) — Verification pipeline checkNetwork() validates CAIP-2 chain ID against configured network before settlement
- [x] Settlement errors don't expose internal state — error-handler.ts sanitizeMessage() for 5xx; 06-03 adversarial production error sanitization tests

**Plans**: 3 plans in 3 waves

Plans:
- [x] 04-01-PLAN.md -- Settlement types, Zod schemas, and BlockfrostClient extension
- [x] 04-02-PLAN.md -- Settlement orchestrator with TDD (settlePayment + pollConfirmation)
- [x] 04-03-PLAN.md -- POST /settle and POST /status routes + server integration

### Phase 5: Stablecoins
**Goal**: Accept stablecoin payments (USDM, DJED, iUSD) in addition to ADA
**Depends on**: Phase 4
**Requirements**: CARD-04

**Deliverables:**
- Hardcoded token policy ID registry (USDM, DJED, iUSD) as security gate
- Token validation check in verification pipeline (reject unknown tokens)
- Modified amount check branching on ADA vs token payments
- Min UTXO ADA check for all output types
- Extended VerifyContext with asset and getMinUtxoLovelace
- Updated /verify and /settle routes for token payment threading
- Backward-compatible PaymentRequirements (asset defaults to 'lovelace')

**Success Criteria** (what must be TRUE):
  1. Facilitator accepts USDM as payment currency
  2. Facilitator accepts DJED as payment currency
  3. Facilitator accepts iUSD as payment currency
  4. Unsupported/unknown tokens are rejected with 'unsupported_token' reason
  5. Token amounts verified from transaction output assets map
  6. Min UTXO ADA validated for all payment types (ADA and token)
  7. Existing ADA payments continue to work unchanged (backward compatible)

**Security Checks:**
- [x] Token policy IDs validated against known-good list — `token-registry.ts` SUPPORTED_TOKENS ReadonlyMap with hardcoded policy IDs for USDM, DJED, iUSD
- [x] No token confusion attacks possible (policy ID + asset name verified) — `assetToUnit()` concatenates policyId+assetName; 06-03 adversarial test: mixed USDM policy + DJED asset name rejected
- [x] Decimal handling audited (no overflow/underflow) — All lovelace/token amounts use BigInt throughout (verify types, checks, CBOR parsing); no floating point for monetary values
- [x] Fake token rejection (only whitelisted policy IDs accepted) — `checkTokenSupported` in checks.ts validates against SUPPORTED_TOKENS registry; unknown units fail with 'unsupported_token'
- [x] Token metadata verified from on-chain source — **Accepted risk:** Token registry is hardcoded, not fetched from on-chain. This is an intentional security gate -- adding tokens requires code review and deployment. Hardcoded approach prevents on-chain metadata spoofing.

**Plans**: 3 plans in 3 waves

Plans:
- [x] 05-01-PLAN.md — Token registry, VerifyContext extension, failure messages
- [x] 05-02-PLAN.md — Token verification checks with TDD (token_supported, amount branching, min_utxo)
- [x] 05-03-PLAN.md — Route integration and end-to-end token payment tests

### Phase 6: Security Hardening
**Goal**: Close all audit-identified gaps and harden Phases 1-5 to a standard suitable for production deployment and public sharing
**Depends on**: Phase 5
**Requirements**: SECU-01, SECU-02, SECU-03, SECU-04

**Background:** The Claude audit (AUDIT-claude.md) identified specific gaps across Phases 1-5: unchecked security items per phase, low coverage on security-critical code paths (error handler at 42%, health endpoint at 73%), silent Redis failures, no rate limiting, no body size limits, and 0% coverage thresholds. This phase closes all of them.

**Deliverables:**

*Attack Surface Reduction:*
- Rate limiting (global + per-endpoint, @fastify/rate-limit)
- Request body size limits (Fastify bodyLimit configuration)
- Input validation hardening audit across all endpoints

*Coverage & Testing:*
- Error handler plugin coverage from 42% to >90%
- Health endpoint coverage from 73% to >90%
- Branch coverage improvement (57% overall → >75%)
- Coverage threshold enforcement (set minimums that prevent regression)
- Integration test Blockfrost warning suppression

*Operational Resilience:*
- Redis failure logging (replace silent .catch(() => {}) with structured logging)
- L1 cache bounded size (LRU eviction or max entries)
- config.example.json updated with chain section

*Dependency Security:*
- npm audit / Snyk scan with zero high/critical vulnerabilities
- Review and pin critical chain dependencies (lucid-evolution, blockfrost-js)
- Verify libsodium override still necessary

*Phase 1-5 Security Checklist Closure:*
- Close all unchecked security items from Phases 1-5 in this roadmap

**Success Criteria** (what must be TRUE):
  1. Rate limiting active on all public endpoints (configurable limits)
  2. Request body size limits enforced (413 on excess)
  3. All security checklist items from Phases 1-5 either closed or documented as accepted risk
  4. Coverage thresholds enforced — no silent regression possible
  5. Error handler and health endpoint adequately covered (>90%)
  6. Zero high/critical dependency vulnerabilities
  7. Redis failures logged (not silently swallowed)

**Security Checks:**
- [x] Rate limiting prevents brute-force and DoS on all endpoints — Global @fastify/rate-limit (100 req/min) + per-endpoint sensitive limits (20 req/min) on /verify, /settle, /status (06-03)
- [x] Body size limits prevent memory exhaustion attacks — `server.ts` bodyLimit: 51200 (50KB); 06-03 adversarial test: 40K string handled without crash
- [x] Error responses verified: no internal state leakage in production mode — 06-01: error handler 100% coverage; 06-03: adversarial production sanitization tests (no stack traces, no Redis/connection strings)
- [x] Dependency audit clean (zero high/critical) — `pnpm audit` returns zero vulnerabilities (06-03); libsodium-wrappers-sumo 0.8.2 override has zero audit findings
- [x] Coverage thresholds enforce minimum quality bar — vitest.config.ts thresholds: 80% statements, 65% branches, 75% functions, 80% lines (06-01)

**Plans**: 4 plans in 3 waves

Plans:
- [x] 06-01-PLAN.md — Coverage gap closure: error handler + health endpoint tests, raise thresholds (wave 1)
- [x] 06-02-PLAN.md — Operational resilience: silent failure logging, L1 cache bounding, Redis auth config (wave 1)
- [x] 06-03-PLAN.md — Security controls: per-endpoint rate limits, adversarial test suite, dependency audit (wave 2)
- [x] 06-04-PLAN.md — Security checklist closure: close all Phase 1-6 items, verification document (wave 3)

### Phase 7: Production Infrastructure
**Goal**: CI/CD pipeline, production Docker config, monitoring, and operational readiness
**Depends on**: Phase 6
**Requirements**: OPER-01, OPER-02, OPER-03, OPER-04

**Deliverables:**

*CI/CD:*
- GitHub Actions workflow (lint, typecheck, test, build on every PR)
- Coverage reporting in CI (fail on threshold violation)
- Dependency scanning in CI (npm audit or Snyk)

*Production Deployment:*
- Multi-stage Dockerfile (build → production image)
- Docker Compose production profile (Redis with auth, no IPFS)
- Environment-specific configuration guidance (dev/staging/prod)
- Redis authentication support in config schema

*Monitoring & Operations:*
- Health check monitoring guidance (what to alert on)
- Structured logging review (ensure all operational events are queryable)
- Operational runbook (startup, shutdown, common issues, recovery)

**Success Criteria** (what must be TRUE):
  1. Every PR runs lint + typecheck + test + build automatically
  2. CI fails on coverage threshold violations
  3. Production Docker image builds and runs correctly
  4. Redis authentication configurable (not hardcoded localhost)
  5. Operational runbook covers common failure scenarios

**Security Checks:**
- [ ] CI pipeline doesn't expose secrets in logs
- [ ] Production Docker image runs as non-root user
- [ ] Redis authentication enforced in production config
- [ ] No dev dependencies in production image
- [ ] Health endpoint doesn't expose sensitive state

**Plans**: TBD

Plans:
- [ ] 07-01: TBD

### Phase 8: Resource Server SDK + Reference Implementation
**Goal**: Build a resource server that demonstrates the complete x402 payment flow end-to-end with a high-value use case
**Depends on**: Phase 7
**Requirements**: PROT-03, STOR-01, STOR-02, STOR-03

**Background:** The facilitator (Phases 1-5) handles verify + settle. A resource server is the other actor in x402 — it serves content, returns 402 Payment Required when payment is needed, and calls the facilitator to verify/settle. This phase builds both the SDK pattern and a working example.

**Deliverables:**

*Resource Server SDK:*
- x402 middleware pattern for Fastify (or framework-agnostic)
- 402 Payment Required response builder (Cardano payment requirements)
- Facilitator client (calls /verify, /settle, /status)
- Payment gate decorator/middleware (wrap any route with x402 payment)

*Reference Implementation:*
- One compelling high-value use case (file storage, AI task, document processing — TBD during planning)
- Complete client → resource server → facilitator → Cardano flow
- Example client code showing the full payment cycle

**Success Criteria** (what must be TRUE):
  1. Resource server returns 402 with Cardano payment requirements when no payment provided
  2. Client can construct, sign, and submit payment to complete the flow
  3. Resource server grants access after facilitator confirms settlement
  4. End-to-end flow works on Cardano preview testnet
  5. SDK pattern is reusable for other resource server use cases

**Security Checks:**
- [ ] Resource server validates facilitator responses (don't trust blindly)
- [ ] Payment confirmed before resource access (no race conditions)
- [ ] Example code doesn't include real credentials
- [ ] Rate limiting on resource endpoints

**Plans**: TBD

Plans:
- [ ] 08-01: TBD

### Phase 9: Documentation & Publishing
**Goal**: Document the system for public sharing and publish as open-source
**Depends on**: Phase 8
**Requirements**: DOCS-01, DOCS-02, DOCS-03

**Deliverables:**
- GET /supported endpoint implementation
- OpenAPI/Swagger specification for all endpoints
- Architecture diagrams (Mermaid or D2) — component relationships, data flow, payment flow
- README with getting started guide and quick-start example
- Deployment guide (Docker, configuration, testnet setup)
- Cardano x402 positioning document (why Cardano for high-value operations, how it complements EVM L2 micropayments)
- npm package publication (if applicable)
- License selection and CONTRIBUTING.md

**Success Criteria** (what must be TRUE):
  1. GET /supported returns supported chains, schemes, and facilitator capabilities
  2. A new developer can clone, configure, and run the facilitator within 30 minutes using the README
  3. Architecture diagrams explain the system clearly to someone unfamiliar with x402
  4. API documentation covers all endpoints with request/response examples

**Security Checks:**
- [ ] /supported doesn't expose sensitive configuration
- [ ] Documentation doesn't include real API keys or secrets
- [ ] Final security scan (OWASP ZAP) on all endpoints
- [ ] SECURITY.md with responsible disclosure process
- [ ] License reviewed for liability implications

**Plans**: TBD

Plans:
- [ ] 09-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 5/5 | Complete | 2026-02-04 |
| 2. Chain Provider | 6/6 | Complete | 2026-02-05 |
| 3. Verification | 4/4 | Complete | 2026-02-06 |
| 4. Settlement | 3/3 | Complete | 2026-02-06 |
| 5. Stablecoins | 3/3 | Complete | 2026-02-08 |
| 6. Security Hardening | 4/4 | Complete | 2026-02-11 |
| 7. Production Infrastructure | 0/? | Not started | - |
| 8. Resource Server SDK | 0/? | Not started | - |
| 9. Documentation & Publishing | 0/? | Not started | - |

---
*Roadmap created: 2026-02-04*
*Phase 1 planned: 2026-02-04*
*Phase 2 planned: 2026-02-05*
*Phase 3 planned: 2026-02-05*
*Phase 5 planned: 2026-02-08*
*Phase 6 pivoted from "Batching" to "Micropayment Strategy": 2026-02-10*
*Phase 6 replaced: "Micropayment Strategy" dropped, roadmap restructured: 2026-02-11*
*Reason: Cardano min UTXO floor accepted as market positioning (high-value ops), not a problem to solve*
*Depth: comprehensive (9 phases)*
*Requirements: 27+ v1 mapped (foundation requirements added)*
