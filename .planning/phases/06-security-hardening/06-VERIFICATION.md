# Phase 6: Security Hardening -- Verification Report

## Summary

Phase 6 closed 30 security checklist items across Phases 1-6 (28 verified with code/test evidence, 2 documented as accepted risks), raised coverage thresholds from 0% to 80/65/75/80, added 52 new tests including 13 adversarial security tests across 6 attack categories, and addressed all audit-identified gaps from AUDIT-claude.md (error handler coverage, silent Redis failures, unbounded L1 cache, rate limiting, body size limits, dependency audit).

## Coverage Report

```
Test Files: 19 passed (19)
Tests:      298 passed (298)

Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   90.75 |    82.66 |   84.89 |   91.05 |
 src               |      50 |       30 |   33.33 |      52 |
  index.ts         |       0 |      100 |       0 |       0 | 7-40
  instrument.ts    |       0 |        0 |       0 |       0 | 6-19
  server.ts        |   92.85 |     37.5 |     100 |   92.85 | 106-110
 src/chain         |   90.51 |    80.58 |   88.15 |    90.6 |
  blockfrost-cl.ts |    93.1 |    86.66 |     100 |   92.45 | 55,77,137,198
  config.ts        |    90.9 |     87.5 |     100 |    90.9 | 107
  errors.ts        |     100 |      100 |     100 |     100 |
  index.ts         |       0 |        0 |       0 |       0 |
  lucid-provider.ts|   77.77 |       25 |     100 |   77.77 | 43-44
  provider.ts      |     100 |      100 |     100 |     100 |
  redis-client.ts  |      60 |    66.66 |   33.33 |      60 | 31,36,40,44
  types.ts         |   18.18 |        0 |      50 |   18.18 | 77-90
  utxo-cache.ts    |   98.03 |       95 |   91.66 |      98 | 165
  utxo-reserv.ts   |   91.93 |    92.85 |   76.92 |   93.33 | 79,97,175,198
 src/config        |     100 |    85.71 |     100 |     100 |
  index.ts         |     100 |    85.71 |     100 |     100 | 23
  schema.ts        |     100 |      100 |     100 |     100 |
 src/errors        |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 src/plugins       |   97.43 |    92.59 |     100 |   97.43 |
  error-handler.ts |     100 |      100 |     100 |     100 |
  request-logger.ts|   93.75 |       75 |     100 |   93.75 | 22
 src/routes        |   91.35 |    68.75 |   68.42 |   91.13 |
  health.ts        |   89.28 |    61.11 |      75 |   88.46 | 50-56,76
  settle.ts        |      90 |       75 |      50 |      90 | 53-55
  status.ts        |     100 |    83.33 |     100 |     100 | 55
  verify.ts        |   89.47 |       75 |      60 |   89.47 | 56-58
 src/settle        |   96.87 |       88 |     100 |   96.87 |
  index.ts         |       0 |        0 |       0 |       0 |
  settle-payment.ts|   96.66 |       88 |     100 |   96.66 | 237,270
  types.ts         |     100 |      100 |     100 |     100 |
 src/verify        |   98.23 |    90.62 |     100 |   98.76 |
  cbor.ts          |   95.91 |       75 |     100 |   97.72 | 127
  checks.ts        |   98.82 |    95.31 |     100 |    98.8 | 222
  errors.ts        |     100 |      100 |     100 |     100 |
  index.ts         |       0 |        0 |       0 |       0 |
  token-registry.ts|     100 |      100 |     100 |     100 |
  types.ts         |     100 |      100 |     100 |     100 |
  verify-payment.ts|     100 |    85.71 |     100 |     100 | 40,100
-------------------|---------|----------|---------|---------|-------------------

Thresholds enforced: 80% statements, 65% branches, 75% functions, 80% lines
```

## Security Checklist Closure

### Phase 1: Foundation

| Item | Status | Evidence |
|------|--------|----------|
| Dependency scanning enabled (Dependabot) | Closed | `.github/dependabot.yml` -- weekly scans, grouped PRs |
| No secrets in repository (config.json gitignored) | Closed | `.gitignore` lines 8-9: `config.json`, `config/config.json` |
| Security headers configured (helmet) | Closed | `src/server.ts` registers `@fastify/helmet` with CSP |
| Input validation on all endpoints (Zod) | Closed | `safeParse()` on /verify, /settle, /status, config loading |
| Error responses don't leak internal details in production | Closed | `error-handler.ts` sanitizeMessage() + 06-01 tests (100% coverage) + 06-03 adversarial tests |

### Phase 2: Chain Provider

| Item | Status | Evidence |
|------|--------|----------|
| Blockfrost API key stored in config file, not code | Closed | `config/config.json` (gitignored), Zod-validated at `src/chain/config.ts` |
| API key not logged in any request/response logs | Closed | `blockfrost-client.ts` JSDoc "sensitive -- never log"; private field; 06-03 adversarial secret leakage test |
| UTXO state integrity verified (no phantom UTXOs) | Closed | UTXOs fetched fresh from Blockfrost, cached with TTL; no fabrication possible |
| Rate limiting prevents API key abuse | Closed | Global @fastify/rate-limit + per-endpoint sensitive limits (06-03) |
| Error messages don't expose API key or internal state | Closed | `error-handler.ts` sanitization + 06-03 adversarial tests |

### Phase 3: Verification

| Item | Status | Evidence |
|------|--------|----------|
| All verification failures logged with details (but not secrets) | Closed | `verify-payment.ts` logs failure reasons at INFO; no CBOR/secrets in logs |
| UTXO model provides inherent replay protection | Closed | Cardano UTXOs consumed on-chain; spent UTXO removed from UTXO set |
| Address comparison uses canonical CBOR hex | Closed | `checks.ts` checkRecipient uses `Address.to_hex()` |
| Raw transaction CBOR not logged | Closed | grep confirms zero CBOR logging in src/; only txHash logged |
| OWASP ZAP scan on /verify endpoint passes | Accepted Risk | See Accepted Risks table below |

### Phase 4: Settlement

| Item | Status | Evidence |
|------|--------|----------|
| No double-settlement possible (CBOR SHA-256 dedup in Redis) | Closed | `settle-payment.ts` computeDedupKey() + SET NX; 06-03 adversarial replay test |
| Transaction re-verified before submission | Closed | `settle-payment.ts` line 129 calls verifyPayment() before submit |
| 400 errors from Blockfrost not retried | Closed | `blockfrost-client.ts` isRetryableError() excludes 400 |
| Confirmation verified on correct network | Closed | checkNetwork() validates CAIP-2 chain ID in verification pipeline |
| Settlement errors don't expose internal state | Closed | error-handler.ts sanitization + 06-03 adversarial tests |

### Phase 5: Stablecoins

| Item | Status | Evidence |
|------|--------|----------|
| Token policy IDs validated against known-good list | Closed | `token-registry.ts` SUPPORTED_TOKENS ReadonlyMap |
| No token confusion attacks possible | Closed | `assetToUnit()` concatenation; 06-03 adversarial mixed policy/asset test |
| Decimal handling audited (no overflow/underflow) | Closed | BigInt throughout (types, checks, CBOR parsing); no floating point |
| Fake token rejection | Closed | `checkTokenSupported` validates against registry; unknown units rejected |
| Token metadata verified from on-chain source | Accepted Risk | See Accepted Risks table below |

### Phase 6: Security Hardening

| Item | Status | Evidence |
|------|--------|----------|
| Rate limiting prevents brute-force and DoS | Closed | Global 100 req/min + sensitive 20 req/min on /verify, /settle, /status (06-03) |
| Body size limits prevent memory exhaustion | Closed | `server.ts` bodyLimit: 51200 (50KB); 06-03 adversarial 40K string test |
| Error responses verified: no internal state leakage | Closed | 06-01 error handler 100% coverage; 06-03 adversarial production sanitization |
| Dependency audit clean (zero high/critical) | Closed | `pnpm audit` returns zero vulnerabilities (06-03) |
| Coverage thresholds enforce minimum quality bar | Closed | vitest.config.ts: 80/65/75/80 thresholds enforced (06-01) |

## Accepted Risks

| Risk | Rationale | Mitigation |
|------|-----------|------------|
| OWASP ZAP not yet run | Requires CI/CD infrastructure (Phase 7). OWASP ZAP is a runtime API security scanner that needs a deployed endpoint. | Manual API testing via adversarial test suite covers input validation, error sanitization, and malformed input handling across all endpoints (13 tests, 6 attack categories). Phase 7 CI/CD will integrate OWASP ZAP. |
| Token metadata not from on-chain source | Hardcoded token registry is an intentional security gate. On-chain metadata could be spoofed by deploying tokens with matching names but different policy IDs. | Adding new tokens requires code review and deployment. The registry validates full policy ID + asset name (not just display name), preventing metadata spoofing attacks. |
| libsodium-wrappers-sumo pinned to 0.8.2 | Required for ESM compatibility with @lucid-evolution/lucid. The pinned version has zero audit vulnerabilities. | Monitored via Dependabot. Override documented in `pnpm.overrides`. Will be removed when upstream Lucid Evolution updates its dependency. |

## Remaining Audit Items

Cross-reference with `.auditing/AUDIT-claude.md`:

| Audit Item | Status | Resolution |
|------------|--------|------------|
| Error handler at 42% coverage | **Resolved** | Now 100% coverage (06-01) |
| Health endpoint at 73% coverage | **Resolved** | Now 89% statements / 88% lines (06-01); remaining lines are provably unreachable |
| Coverage thresholds at 0% | **Resolved** | Thresholds set to 80/65/75/80 (06-01) |
| Silent Redis failures (4 locations) | **Resolved** | Structured debug logging in all 4 catch handlers (06-02) |
| Unbounded L1 cache growth | **Resolved** | maxL1Entries (default 10,000) with oldest-entry eviction (06-02) |
| No rate limiting middleware | **Resolved** | Global + per-endpoint @fastify/rate-limit (06-03) |
| No request body size limits | **Resolved** | 50KB bodyLimit on Fastify server (server.ts) |
| config.example.json missing chain section | **Resolved** | Updated with chain section including Redis db field (06-02) |
| Branch coverage at 57% | **Resolved** | Now 82.66% branches overall |
| Two Blockfrost clients (rate limit risk) | **Monitoring** | Architectural decision documented; no issues observed at current scale |
| No real Blockfrost integration test | **Deferred** | Phase 7 will add opt-in testnet connectivity validation |
| Lucid mocked in integration tests | **Accepted** | libsodium ESM incompatibility; runtime behavior tested manually on testnet |

## Test Summary

| Metric | Before Phase 6 | After Phase 6 | Delta |
|--------|---------------|--------------|-------|
| Total tests | 246 | 298 | +52 |
| Test files | 16 | 19 | +3 |
| Statements coverage | ~82% | 90.75% | +8.75% |
| Branch coverage | ~58% | 82.66% | +24.66% |
| Functions coverage | ~80% | 84.89% | +4.89% |
| Lines coverage | ~82% | 91.05% | +9.05% |
| Coverage thresholds | 0% (none) | 80/65/75/80 | Enforced |
| Rate limiting | None | Global + per-endpoint | Added |
| Body size limit | Fastify default | 50KB | Hardened |
| Silent Redis failures | 4 locations | 0 locations | Fixed |
| L1 cache | Unbounded | 10,000 max entries | Bounded |
| Dependency vulnerabilities | Not audited | 0 high/critical | Clean |

### New Test Files (Phase 6)

- `tests/unit/plugins/error-handler.test.ts` -- 16 tests (all error handler branches)
- `tests/unit/routes/health.test.ts` -- 15 tests (healthy/degraded/edge cases)
- `tests/security/controls.test.ts` -- 6 tests (rate limiting per endpoint)
- `tests/security/adversarial.test.ts` -- 13 tests (6 attack categories)
- `tests/unit/chain/utxo-cache.test.ts` -- 4 new tests (L1 eviction)

### Adversarial Test Categories

1. **Secret Leakage Prevention** (2 tests) -- API key and seed phrase never in error responses
2. **Malformed Input Handling** (3 tests) -- Invalid JSON, empty body, extremely long strings
3. **Replay Protection** (2 tests) -- Duplicate CBOR returns idempotent result
4. **Token Confusion Defense** (2 tests) -- Unknown policy ID and mixed policy/asset name rejected
5. **Production Error Sanitization** (2 tests) -- No stack traces, no internal state in production 500s
6. **Additional Security Edge Cases** (2 tests) -- Correct 404s, no internal paths leaked

---

*Verification completed: 2026-02-11*
*298 tests, 19 files, all passing*
*Coverage thresholds: 80/65/75/80 (enforced)*
*Security checklists: 28 closed, 2 accepted risk, 0 open*
