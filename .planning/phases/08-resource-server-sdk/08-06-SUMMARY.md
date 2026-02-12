---
phase: 08-resource-server-sdk
plan: 08-06
subsystem: examples, roadmap
tags: [example-client, lucid-evolution, payment-flow, 402, documentation, phase-completion]
dependency-graph:
  requires: [08-01, 08-02, 08-03, 08-04, 08-05]
  provides: [example-client, example-readme, phase-8-complete]
  affects: [ROADMAP.md, tsconfig.json]
tech-stack:
  added: []
  patterns: [requireEnv-validation, step-logging, round-trip-verification, Uint8Array-blob-compat]
key-files:
  created:
    - examples/client.ts
    - examples/README.md
  modified:
    - tsconfig.json
    - .planning/ROADMAP.md
decisions:
  - "requireEnv() helper for type-safe environment variable validation (avoids string|undefined after process.exit)"
  - "Uint8Array wrapping for Buffer-to-Blob compatibility (same pattern as 08-03 IpfsBackend)"
  - "Add examples/ to tsconfig include for eslint projectService compatibility"
  - "Phase 8 security checks closed with evidence references"
metrics:
  duration: 5 min
  completed: 2026-02-12
  tasks: 3
  tests-added: 0
  tests-total: 383
  suites-total: 27
---

# Phase 8 Plan 6: Example Client and Phase Completion Summary

Standalone CLI example demonstrating the full x402 Cardano payment cycle (402 -> parse -> build tx -> sign -> pay -> download) using Lucid Evolution, plus README with setup instructions and ROADMAP update marking Phase 8 complete.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Create example client with 7-step x402 payment flow | 4a55aa7 |
| 2 | Create example README with setup and running instructions | 25bf1a9 |
| 3 | Update ROADMAP, close security checks, final verification | 97f880b |

## What Was Built

### Example Client (examples/client.ts)

A standalone CLI script runnable with `tsx examples/client.ts` that demonstrates:

1. **Health check** (GET /health) -- Verifies server and dependencies are running
2. **Capabilities query** (GET /supported) -- Discovers facilitator's supported schemes and networks
3. **402 response** (POST /upload without payment) -- Shows standard x402 payment-required flow
4. **Payment parsing** -- Decodes base64 Payment-Required header to extract payment requirements
5. **Transaction building** -- Uses Lucid Evolution to construct a Cardano payment transaction
6. **Payment submission** (POST /upload with Payment-Signature) -- Sends signed transaction via header
7. **Free download** (GET /files/:cid) -- Retrieves stored file and verifies round-trip integrity

Key design:
- Uses `requireEnv()` helper for type-safe environment variable validation
- Environment variables: BLOCKFROST_KEY, SEED_PHRASE (required); SERVER_URL, FILE_PATH (optional)
- Step-by-step console output with clear section headers for learning
- Creates a generated test file if no FILE_PATH provided
- Buffer-to-Blob via Uint8Array for TypeScript strict mode compatibility
- Uses native fetch (Node 20+), no HTTP library dependency

### Example README (examples/README.md)

- Prerequisites (Node.js 20+, running server, funded wallet, Blockfrost key)
- Step-by-step setup guide: Blockfrost API key, funded wallet, server startup
- Environment variables table with descriptions
- Full expected output showing all 7 steps
- Security notes about credential handling
- Custom file upload instructions

### ROADMAP Update

- Phase 8 marked complete with 6/6 plans (6 plans in 4 waves)
- All 4 Phase 8 security checks closed with evidence references
- Progress table updated: 6/6 Complete, 2026-02-12

### Final Verification

- `pnpm typecheck`: 0 errors
- `pnpm lint`: 0 violations
- `pnpm vitest run`: 383 tests, 27 suites, all passing

## Phase 8 Success Criteria Verification

- [x] Resource server returns 402 with Cardano payment requirements (upload route + payment gate)
- [x] Client can construct, sign, and submit payment (example client steps 5-6)
- [x] Resource server grants access after facilitator confirms settlement (payment gate middleware)
- [x] End-to-end flow demonstrated (example client, 7 steps)
- [x] SDK pattern is reusable (FacilitatorClient + createPaymentGate + buildPaymentRequired)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] eslint projectService could not find examples/client.ts**
- Found during: Task 1
- Issue: Pre-commit hook runs eslint on all staged .ts files, but tsconfig.json `include` only had src/ and tests/
- Fix: Added `"examples/**/*"` to tsconfig.json include array
- Files modified: tsconfig.json

**2. [Rule 1 - Bug] Buffer not assignable to BlobPart in strict TypeScript**
- Found during: Task 1
- Issue: `new Blob([fileBuffer])` fails type check because Buffer's ArrayBufferLike is not ArrayBuffer
- Fix: Wrap with `new Uint8Array(fileBuffer)` (same pattern used in 08-03 IpfsBackend)
- Files modified: examples/client.ts

**3. [Rule 1 - Bug] string|undefined not assignable to string after process.exit() guard**
- Found during: Task 1
- Issue: TypeScript doesn't narrow types after `process.exit(1)` -- BLOCKFROST_KEY and SEED_PHRASE remain `string|undefined`
- Fix: Created `requireEnv()` helper that returns `string` (never type for exit path)
- Files modified: examples/client.ts

## Self-Check: PASSED

All created files exist, all modified files exist, all 3 commit hashes verified in git log.
