---
phase: 08-resource-server-sdk
plan: 08-05
subsystem: routes/upload, routes/download, server, routes/health
tags: [upload, download, multipart, payment-gate, storage, cors, health]
dependency-graph:
  requires: [08-02, 08-03, 08-04]
  provides: [POST /upload, GET /files/:cid, storage-wired-server]
  affects: [server.ts, health.ts, CORS headers]
tech-stack:
  added: [@fastify/multipart 9.4.0]
  patterns: [lazy-payment-gate-init, module-level-gate-mock, multipart-form-data]
key-files:
  created:
    - src/routes/upload.ts
    - src/routes/download.ts
    - tests/integration/upload-route.test.ts
    - tests/integration/download-route.test.ts
  modified:
    - src/server.ts
    - src/routes/health.ts
    - tests/unit/routes/health.test.ts
    - tests/integration/health.test.ts
    - package.json
    - pnpm-lock.yaml
decisions:
  - "Mock payment gate at module level for upload tests (full x402 flow tested in 08-04)"
  - "eslint-disable for no-empty-function on noop done callback (async hook ignores done)"
  - "Health check renamed ipfs -> storage to reflect actual backend used"
  - "gateMode variable pattern for controlling mock payment gate behavior per test"
metrics:
  duration: 9 min
  completed: 2026-02-12
  tasks: 3
  tests-added: 16
  tests-total: 383
  suites-total: 27
---

# Phase 8 Plan 5: Upload/Download Routes Summary

POST /upload with payment-gated multipart file storage via @fastify/multipart; GET /files/:cid for free downloads; storage backend wired into server; health check uses real storage.healthy().

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Install @fastify/multipart, create upload.ts + download.ts | a8a7978 |
| 2 | Wire storage, multipart, routes into server; update health check | 47bc0f0 |
| 3 | Integration tests for upload + download; fix health tests | 3471016 |

## What Was Built

### POST /upload (src/routes/upload.ts)
- Payment gate runs BEFORE file parsing (SECU-04: settle-before-execution)
- FacilitatorClient points to self (same process) via 127.0.0.1
- Lazy payment gate initialization (address resolved on first request)
- 10MB body limit (overrides global 50KB)
- Rate limit: sensitive tier from config
- Returns `{ success: true, cid, size }` on success
- Uses `request.file()` from @fastify/multipart

### GET /files/:cid (src/routes/download.ts)
- No payment gate (free downloads per STOR-03)
- Typed Params interface for CID parameter
- Returns 404 if content not found, 400 if CID empty
- Content-Type: application/octet-stream with Content-Length header

### Server Integration (src/server.ts)
- @fastify/multipart registered before routes
- Storage backend created from config and decorated on server
- Upload and download route plugins registered after existing routes
- CORS allowedHeaders: added Payment-Signature, Payment-Required
- CORS exposedHeaders: added Payment-Required, X-Payment-Response

### Health Check (src/routes/health.ts)
- Replaced placeholder checkIpfs() with checkStorage() using fastify.storage.healthy()
- Dependencies object reports `storage` instead of `ipfs`
- Includes latency measurement for storage health check

### Tests
- 10 upload route tests: 402 flow (3), successful upload (3), error handling (2), invalid payment (1), route existence (1)
- 6 download route tests: successful download (2), not found (2), edge cases (2)
- Health tests updated: ipfs -> storage naming across unit and integration tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] preHandlerHookHandler type requires this context and done callback**
- Found during: Task 1
- Issue: `createPaymentGate()` returns `preHandlerHookHandler` which has `this: FastifyInstance` and `done` callback in its type signature, but the implementation is async and ignores both
- Fix: Use `gate.call(fastify, request, reply, () => {})` with eslint-disable for no-empty-function
- Files modified: src/routes/upload.ts

**2. [Rule 3 - Blocking] @fastify/multipart type augmentation not loaded**
- Found during: Task 1
- Issue: `request.file()` not recognized by TypeScript because multipart's type augmentation wasn't imported
- Fix: Added `import '@fastify/multipart'` in upload.ts for type side-effects
- Files modified: src/routes/upload.ts

**3. [Rule 1 - Bug] Health tests referenced ipfs dependency after rename to storage**
- Found during: Task 3
- Issue: Unit and integration health tests checked `body.dependencies.ipfs` which no longer exists
- Fix: Updated all health test files to use `storage`, added storage mock to createHealthServer helper
- Files modified: tests/unit/routes/health.test.ts, tests/integration/health.test.ts

**4. [Rule 1 - Bug] Upload tests failed with 402 due to FacilitatorClient HTTP calls**
- Found during: Task 3
- Issue: Payment gate's FacilitatorClient makes real HTTP requests to /verify and /settle, which don't work with server.inject()
- Fix: Mocked createPaymentGate at module level with gateMode variable to control pass/reject behavior
- Files modified: tests/integration/upload-route.test.ts

## Requirements Satisfied

- STOR-01: POST /upload protected by payment gate (returns 402 without payment)
- STOR-02: POST /upload returns content identifier (CID) on success
- STOR-03: GET /files/:cid serves files freely without payment
- SECU-04: Payment gate runs before file parsing (settle-before-execution)

## Self-Check: PASSED

All created files exist, all modified files exist, all 3 commit hashes verified in git log.
