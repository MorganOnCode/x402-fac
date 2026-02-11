---
phase: 07-production-infrastructure
plan: 07-03
subsystem: operations
tags: [sentry, health, config, runbook, operational-readiness]
dependency-graph:
  requires: [07-01, 07-02]
  provides: [configurable-sentry-tracing, reliable-health-version, operational-runbook]
  affects: [monitoring, deployment, troubleshooting]
tech-stack:
  added: []
  patterns: [module-level-file-read, configurable-sampling]
key-files:
  created:
    - docs/operations.md
  modified:
    - src/instrument.ts
    - src/config/schema.ts
    - src/index.ts
    - src/routes/health.ts
    - config/config.example.json
decisions:
  - "Sentry tracesSampleRate defaults to 0.1 (10%) instead of 1.0 (100%)"
  - "Health version read from package.json via readFileSync at module load (not per-request)"
  - "process.cwd() resolves package.json -- works in both dev (tsx) and Docker (WORKDIR /app)"
  - "Config example shows production values (redis-prod host, auth, rate limits, JSON logs)"
metrics:
  duration: 3 min
  completed: 2026-02-12
  tasks: 4
  files: 6
---

# Phase 7 Plan 03: Operational Readiness & Monitoring Summary

Configurable Sentry trace sampling (10% default, was 100%), health endpoint version from package.json (not npm_package_version env var), production config example, and operational runbook.

## What Was Built

### Task 1: Configurable Sentry trace sample rate
- Added `tracesSampleRate` to sentry config schema (`z.number().min(0).max(1).default(0.1)`)
- Updated `initSentry()` signature to accept rate as third parameter (default 0.1)
- Call site in `src/index.ts` threads `config.sentry?.tracesSampleRate` through
- Production cost savings: 10% sampling vs 100% prevents burning through Sentry quota

### Task 2: Health endpoint version fix
- Replaced `process.env.npm_package_version ?? '0.0.0'` with `readFileSync` of `package.json`
- Version read once at module load, stored in `APP_VERSION` constant
- Works in dev (`tsx watch`), production (`node dist/index.js`), and Docker (`WORKDIR /app`)

### Task 3: Production config example
- `env` set to `"production"` (was `"development"`)
- `logging.pretty` set to `false` (JSON logs for log aggregation)
- Added `sentry.tracesSampleRate: 0.1` and `sentry.environment: "production"`
- Added `rateLimit` section (global: 100, sensitive: 20, windowMs: 60000)
- Redis host as `"redis-prod"` with `password` field for Docker Compose

### Task 4: Operational runbook
- `docs/operations.md` covering 9 sections:
  - Prerequisites, Quick Start (dev), Production Deployment (Docker)
  - Startup sequence, Graceful Shutdown, Health Check monitoring
  - Common Issues (config validation, Redis, mainnet block, rate limits, version 0.0.0)
  - Monitoring (structured logs, Sentry, Redis metrics)
  - Recovery (after crash, after Redis data loss)

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `pnpm typecheck` -- passed (0 errors)
- `pnpm test` -- passed (298 tests, 19 suites)
- `pnpm build` -- succeeded (60.91 KB ESM bundle)
- `config/config.example.json` -- valid JSON with production values
- `docs/operations.md` -- covers all required sections

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | df482ce | feat(07-03): make Sentry trace sample rate configurable |
| 2 | e2500e4 | fix(07-03): health endpoint reads version from package.json |
| 3 | 035be95 | chore(07-03): update config example with production defaults |
| 4 | bed76c7 | docs(07-03): create operational runbook |

## Self-Check: PASSED

- [x] `src/instrument.ts` exists
- [x] `src/config/schema.ts` exists
- [x] `src/index.ts` exists
- [x] `src/routes/health.ts` exists
- [x] `config/config.example.json` exists
- [x] `docs/operations.md` exists
- [x] Commit df482ce verified
- [x] Commit e2500e4 verified
- [x] Commit 035be95 verified
- [x] Commit bed76c7 verified
