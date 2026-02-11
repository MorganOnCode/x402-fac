---
phase: 06-security-hardening
plan: 06-03
subsystem: routes, security
tags: [rate-limit, security, adversarial-testing, audit]
dependency-graph:
  requires: [06-01, 06-02]
  provides:
    - "Per-endpoint rate limiting on /verify, /settle, /status (sensitive < global)"
    - "Adversarial security test suite (13 tests, 6 categories)"
    - "Clean dependency audit (zero vulnerabilities)"
  affects:
    - src/routes/verify.ts
    - src/routes/settle.ts
    - src/routes/status.ts
    - tests/security/controls.test.ts
    - tests/security/adversarial.test.ts
tech-stack:
  added: []
  patterns:
    - "Fastify route-level config for per-route rate limit override"
    - "3-arg form: fastify.post(url, { config: { rateLimit } }, handler)"
    - "Adversarial test patterns: secret leakage scan, token confusion, replay idempotency"
key-files:
  created:
    - tests/security/adversarial.test.ts
  modified:
    - src/routes/verify.ts
    - src/routes/settle.ts
    - src/routes/status.ts
    - tests/security/controls.test.ts
decisions:
  - "Route-level config.rateLimit overrides global @fastify/rate-limit per route"
  - "sensitive=1 in test config proves per-endpoint limits are enforced independently of global=10"
  - "/health stays on global limit (no sensitive override) as intended"
  - "Adversarial tests mock verifyPayment/settlePayment at module level for isolation"
  - "Production-mode describe block creates separate server with env: 'production'"
  - "libsodium-wrappers-sumo 0.8.2 override accepted risk: zero audit vulnerabilities"
metrics:
  duration: "4 min"
  completed: "2026-02-11"
  tasks: 3
  tests-added: 17
  tests-total: 298
  files-modified: 5
---

# Phase 6 Plan 03: Security Controls and Adversarial Testing Summary

Per-endpoint rate limiting via Fastify route-level config on /verify, /settle, /status with config.rateLimit.sensitive (default 20 req/min vs global 100), adversarial test suite covering 13 security scenarios across 6 categories, and clean dependency audit with zero vulnerabilities.

## Task 1: Per-endpoint rate limiting on sensitive routes

Restructured all three payment-critical route files from 2-arg form (`fastify.post(url, handler)`) to 3-arg form (`fastify.post(url, { config: { rateLimit: { max, timeWindow } } }, handler)`) to apply tighter rate limits using the existing but previously unused `config.rateLimit.sensitive` field.

The `@fastify/rate-limit` plugin supports per-route overrides via `FastifyContextConfig.rateLimit`. Each sensitive route now enforces `sensitive` (default 20 req/min) instead of `global` (default 100 req/min), while `/health` remains on the global limit.

**4 new tests in controls.test.ts:**
- /verify rate limited at sensitive=1 (2nd request returns 429)
- /settle rate limited at sensitive=1
- /status rate limited at sensitive=1
- /health still works at request 2 (under global=10)

**Commit:** `45467c7`

## Task 2: Adversarial security test suite

Created `tests/security/adversarial.test.ts` with 13 tests across 6 describe blocks:

**1. Secret Leakage Prevention (2 tests):**
- Blockfrost API key (`test-project-id-secret`) never appears in any error response across all routes
- Seed phrase never appears in any error response across all routes

**2. Malformed Input Handling (3 tests):**
- Invalid JSON returns 400 (not crash/500)
- Empty body on /verify returns 200 with `isValid: false`
- Extremely long strings (40K chars) handled without crash

**3. Replay Protection (2 tests):**
- Duplicate CBOR submission returns idempotent result (same txHash)
- Consistent result across multiple resubmissions (no double-settlement)

**4. Token Confusion Defense (2 tests):**
- Unknown policy ID rejected with `unsupported_token`
- Mixed USDM policy ID + DJED asset name rejected (concatenated unit not in registry)

**5. Production Error Sanitization (2 tests):**
- No stack traces in production 500 responses (no `at `, `.ts:`, `.js:` patterns)
- Internal error messages sanitized (no `Redis`, `connection` in body)

**6. Additional Security Edge Cases (2 tests):**
- GET on POST-only routes returns 404
- Unknown routes return proper 404 with NOT_FOUND code, no internal paths leaked

**Commit:** `5795aa0`

## Task 3: Dependency vulnerability audit

Ran `pnpm audit` and `pnpm audit --prod`:

```
No known vulnerabilities found
```

**Dependency overview:**
- 13 production dependencies, 12 dev dependencies
- Zero high/critical/moderate/low vulnerabilities
- `libsodium-wrappers-sumo` pinned to 0.8.2 via `pnpm.overrides` (ESM compatibility fix from Phase 2-06): no known vulnerabilities in this version

**Accepted risk:** The libsodium override is a pinned version rather than latest, but has zero audit findings and is required for ESM compatibility with `@lucid-evolution/lucid`.

No files modified -- audit results documented here for security checklist closure in Plan 06-04.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `pnpm build` -- success, zero errors
- `pnpm test` -- 19 files, 298 tests, all passing (281 existing + 17 new)
- Per-endpoint rate limits confirmed on /verify, /settle, /status (sensitive=1 test proves it)
- /health still uses global rate limit (10 requests before 429)
- Adversarial test suite covers 13 security scenarios across 6 categories
- `pnpm audit` returns zero vulnerabilities for all dependencies
- No regressions in existing tests

## Self-Check: PASSED

All key files verified present. All 2 task commits (45467c7, 5795aa0) verified in git log.
