# Roadmap: x402 Cardano Facilitator & Storage Service

## Overview

This roadmap delivers a working x402 payment facilitator on Cardano with an integrated file storage service. The journey begins with a solid foundation — proper TypeScript setup, tooling, testing infrastructure, and security baseline — before progressing through blockchain integration (UTXO management, verification, settlement), Cardano-specific optimizations (stablecoins, batching), and finally the storage service that demonstrates the facilitator in action. Security checks are built into every phase, not bolted on at the end.

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
- [ ] **Phase 5: Stablecoins** - Multi-token support for USDM, DJED, iUSD
- [ ] **Phase 6: Batching** - Multi-payment transaction aggregation for micropayment economics
- [ ] **Phase 7: Storage Service** - File upload/download service gated by x402 payments
- [ ] **Phase 8: Integration** - Supported endpoint, documentation, and production readiness

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
- [x] Dependency scanning enabled (Dependabot)
- [x] No secrets in repository (config.json gitignored)
- [x] Security headers configured (helmet)
- [x] Input validation on all endpoints (Zod)
- [x] Error responses don't leak internal details in production

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
- [ ] Blockfrost API key stored in environment, not code
- [ ] API key not logged in any request/response logs
- [ ] UTXO state integrity verified (no phantom UTXOs)
- [ ] Rate limiting prevents API key abuse
- [ ] Error messages don't expose API key or internal state

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
- [ ] All verification failures logged with details (but not secrets)
- [ ] UTXO model provides inherent replay protection (no separate nonce tracking needed)
- [ ] Address comparison uses canonical CBOR hex (not bech32 string comparison)
- [ ] Raw transaction CBOR not logged (could be large)
- [ ] OWASP ZAP scan on /verify endpoint passes

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
- [ ] No double-settlement possible (CBOR SHA-256 dedup in Redis)
- [ ] Transaction re-verified before submission (defense-in-depth)
- [ ] 400 errors from Blockfrost not retried (fail immediately)
- [ ] Confirmation verified on correct network (CAIP-2 chain ID)
- [ ] Settlement errors don't expose internal state

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
- [ ] Token policy IDs validated against known-good list
- [ ] No token confusion attacks possible (policy ID + asset name verified)
- [ ] Decimal handling audited (no overflow/underflow)
- [ ] Fake token rejection (only whitelisted policy IDs accepted)
- [ ] Token metadata verified from on-chain source

**Plans**: 3 plans in 3 waves

Plans:
- [ ] 05-01-PLAN.md — Token registry, VerifyContext extension, failure messages
- [ ] 05-02-PLAN.md — Token verification checks with TDD (token_supported, amount branching, min_utxo)
- [ ] 05-03-PLAN.md — Route integration and end-to-end token payment tests

### Phase 6: Batching
**Goal**: Aggregate multiple payments into single transactions for economic viability
**Depends on**: Phase 5
**Requirements**: CARD-03

**Deliverables:**
- Batch queue with payment aggregation
- Threshold logic (immediate vs batched based on amount)
- Periodic flush scheduler
- Multi-output transaction construction
- Transaction size management (stay under 16KB)
- Individual payment status tracking within batch
- Batch settlement handle for polling

**Success Criteria** (what must be TRUE):
  1. Small payments queue for batched settlement instead of immediate submission
  2. Large payments (above threshold) settle immediately
  3. Batch flushes periodically, combining multiple outputs in one transaction
  4. Individual payment status is trackable through batch settlement

**Security Checks:**
- [ ] Queue integrity maintained (no payment loss on restart)
- [ ] Batch operations are atomic (all or nothing)
- [ ] No payment can be settled twice (deduplication)
- [ ] Queue persistence secure (if using Redis/DB)
- [ ] Batch size limits prevent DoS via queue flooding

**Plans**: TBD

Plans:
- [ ] 06-01: TBD

### Phase 7: Storage Service
**Goal**: Deliver file storage service that demonstrates x402 payment flow end-to-end
**Depends on**: Phase 6
**Requirements**: STOR-01, STOR-02, STOR-03, STOR-04, STOR-05, SECU-04

**Deliverables:**
- Storage interface abstraction (provider pattern)
- IPFS backend implementation (via Kubo or Pinata)
- File upload endpoint with x402 payment gate
- 402 Payment Required response generation
- Settle-then-work flow (settle on-chain before storing)
- Content ID return after successful storage
- File download endpoint (free, by CID)
- File validation (size limits, type checking)

**Success Criteria** (what must be TRUE):
  1. File upload requires valid x402 payment (402 response without payment)
  2. Payment settles on-chain BEFORE file is stored (settle-then-work)
  3. Successful upload returns content identifier (CID)
  4. Files are retrievable by CID without payment required
  5. Storage backend is IPFS (swappable via interface)

**Security Checks:**
- [ ] File size limits enforced (prevent storage DoS)
- [ ] File type validation (no executable uploads unless intended)
- [ ] Path traversal attacks prevented (sanitize CID/paths)
- [ ] Settle-then-work verified (no file stored before payment confirms)
- [ ] IPFS CID integrity verified on retrieval
- [ ] Rate limiting on upload endpoint

**Plans**: TBD

Plans:
- [ ] 07-01: TBD

### Phase 8: Integration
**Goal**: Complete the facilitator API and document the system for understanding
**Depends on**: Phase 7
**Requirements**: PROT-03, DOCS-01, DOCS-02, DOCS-03

**Deliverables:**
- /supported endpoint implementation
- Architecture diagrams (Mermaid or D2)
- Knowledge graphs (data flow, payment flow)
- API documentation (OpenAPI/Swagger)
- README with getting started guide
- Example client code
- Deployment guide (Docker, environment setup)

**Success Criteria** (what must be TRUE):
  1. GET /supported returns supported chains, schemes, and facilitator addresses
  2. Architecture diagrams explain component relationships clearly
  3. Knowledge graphs show data and payment flows visually
  4. API documentation covers all endpoints with examples

**Security Checks:**
- [ ] /supported doesn't expose sensitive configuration
- [ ] API documentation doesn't include real API keys in examples
- [ ] Rate limiting on all public endpoints
- [ ] Final OWASP ZAP scan on all endpoints
- [ ] Security documentation covers threat model

**Plans**: TBD

Plans:
- [ ] 08-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 5/5 | Complete | 2026-02-04 |
| 2. Chain Provider | 6/6 | Complete | 2026-02-05 |
| 3. Verification | 4/4 | Complete | 2026-02-06 |
| 4. Settlement | 3/3 | Complete | 2026-02-06 |
| 5. Stablecoins | 0/3 | Planned | - |
| 6. Batching | 0/? | Not started | - |
| 7. Storage Service | 0/? | Not started | - |
| 8. Integration | 0/? | Not started | - |

---
*Roadmap created: 2026-02-04*
*Phase 1 planned: 2026-02-04*
*Phase 2 planned: 2026-02-05*
*Phase 3 planned: 2026-02-05*
*Phase 5 planned: 2026-02-08*
*Depth: comprehensive (8 phases)*
*Requirements: 27+ v1 mapped (foundation requirements added)*
