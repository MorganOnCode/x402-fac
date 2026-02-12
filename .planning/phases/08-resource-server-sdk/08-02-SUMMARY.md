---
phase: 08-resource-server-sdk
plan: 08-02
subsystem: sdk-routes
tags: [sdk, supported-endpoint, chain-provider, unit-tests, integration-tests]
dependency-graph:
  requires: [08-01]
  provides: [/supported endpoint, ChainProvider.getAddress(), SDK test coverage]
  affects: [src/chain/provider.ts, src/server.ts, src/routes/supported.ts]
tech-stack:
  added: []
  patterns: [fastify-plugin route pattern, globalThis.fetch mocking, Zod schema validation in tests]
key-files:
  created:
    - src/routes/supported.ts
    - tests/unit/sdk/facilitator-client.test.ts
    - tests/unit/sdk/payment-required.test.ts
    - tests/integration/supported-route.test.ts
  modified:
    - src/chain/provider.ts
    - src/server.ts
decisions:
  - "getAddress() delegates to lucid.wallet().address() -- single line, no caching needed"
  - "/supported error handling: try/catch on getAddress() returns 500 with generic message"
  - "Mock strategy for FacilitatorClient: vi.spyOn(globalThis, 'fetch') with real Response objects"
  - "/supported integration tests mock Lucid wallet().address at module level for address control"
metrics:
  duration: ~5 min
  completed: 2026-02-12
  tasks: 3
  files-created: 4
  files-modified: 2
  tests-added: 34
---

# Phase 8 Plan 02: /supported Endpoint + SDK Tests Summary

GET /supported endpoint (PROT-03) serving facilitator capabilities with ChainProvider.getAddress(), plus comprehensive unit and integration tests for all SDK core components.

## What Was Built

### ChainProvider.getAddress()
Added `async getAddress(): Promise<string>` to the ChainProvider class. Delegates to `this.lucid.wallet().address()` to return the facilitator's bech32 wallet address. Used by the /supported endpoint to report signer addresses.

### GET /supported Route (PROT-03)
Created `src/routes/supported.ts` implementing the x402 V2 /supported endpoint. Returns:
- `kinds`: array with one entry (x402Version: 2, scheme: 'exact', network: configured CAIP-2 chain ID)
- `extensions`: empty array (reserved for future use)
- `signers`: object keyed by network with array of facilitator wallet addresses

Includes error handling for getAddress() failures (500 with generic message, no internal details leaked).

### FacilitatorClient Unit Tests (17 tests)
- Constructor: strips trailing slash, default timeout, custom headers
- verify(): POST with correct body, parsed response, non-200 error, Zod validation failure
- settle(): POST with correct body, parsed response, error handling
- status(): POST with correct body, parsed response
- supported(): GET to /supported, parsed response, invalid response error
- Timeout: AbortController timeout with custom values

### Payment-Required Builder Unit Tests (10 tests)
- Valid base64 output, x402Version: 2, correct accepts array structure
- Defaults: scheme='exact', asset='lovelace', maxTimeoutSeconds=300
- Custom: error field, mimeType, description, scheme override, asset override

### /supported Integration Tests (7 tests)
- Happy path: HTTP 200, correct kinds/extensions/signers structure
- Content-Type: application/json
- Error handling: 500 when getAddress() throws
- Schema validation: response validates against SupportedResponseSchema

## Verification Results

- `pnpm typecheck`: 0 errors
- `pnpm lint`: 0 violations
- `pnpm vitest run`: 367 tests passing across 25 suites

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 4069754 | feat(08-02): add /supported endpoint, SDK tests, ChainProvider.getAddress |

## Self-Check: PASSED

All 4 created files exist. All 2 modified files exist. Commit 4069754 verified in git log.
