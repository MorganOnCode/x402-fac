---
phase: 08-resource-server-sdk
plan: 08-04
subsystem: sdk
tags: [middleware, payment-gate, prehandler, x402, settle-before-execution]
dependency_graph:
  requires: [08-01]
  provides: [createPaymentGate, PaymentGateOptions, FastifyRequest.x402Settlement, FastifyInstance.storage]
  affects: [08-05, 08-06]
tech_stack:
  added: []
  patterns: [Fastify preHandler, base64 header encoding/decoding, settle-before-execution]
key_files:
  created:
    - src/sdk/payment-gate.ts
    - tests/unit/sdk/payment-gate.test.ts
  modified:
    - src/sdk/index.ts
    - src/types/index.ts
decisions:
  - Spread paymentRequiredOptions instead of mutating (avoids shared state between requests)
  - HandlerFn type alias in tests to bypass Fastify this-context constraint for unit testing
  - Cast handler return to remove this binding rather than creating mock FastifyInstance
metrics:
  duration: 4 min
  completed: 2026-02-12
  tests_added: 16
  files_created: 2
  files_modified: 2
---

# Phase 8 Plan 04: Payment Gate Middleware Summary

Fastify preHandler middleware enforcing x402 settle-before-execution (SECU-04) with 16 unit tests covering all error and success paths.

## What Was Built

### src/sdk/payment-gate.ts
- `createPaymentGate(options: PaymentGateOptions)` returns a Fastify `preHandlerHookHandler`
- `PaymentGateOptions` interface: facilitator, payTo, amount, network, asset?, maxTimeoutSeconds?, description?, mimeType?
- `decodePaymentSignature()` helper: base64 decode -> JSON parse -> Zod safeParse
- Flow: check header -> decode -> verify -> settle -> attach result -> allow through
- On missing/invalid header: returns 402 with Payment-Required header via `reply402()`
- On verify failure: returns 402 with invalidReason
- On settle failure: returns 402 with settlement error
- On success: attaches `PaymentResponseHeader` to `request.x402Settlement` and sets `X-Payment-Response` header

### src/sdk/index.ts
- Added exports: `createPaymentGate` (value) and `PaymentGateOptions` (type)

### src/types/index.ts
- Augmented `FastifyInstance` with `storage: StorageBackend`
- Augmented `FastifyRequest` with `x402Settlement?: PaymentResponseHeader`
- Added imports for `PaymentResponseHeader` from sdk/types and `StorageBackend` from storage/types

### tests/unit/sdk/payment-gate.test.ts
- 16 tests across 6 describe blocks
- No header: 402 with Payment-Required (2 tests)
- Invalid header: invalid base64, invalid JSON, schema mismatch (3 tests)
- Verification failure: isValid false, verify throws (3 tests)
- Settlement failure: success false, settle throws (2 tests)
- Success flow: no reply sent, x402Settlement on request, X-Payment-Response header (3 tests)
- Field mapping: amount->maxAmountRequired, transaction pass-through, custom asset/timeout (3 tests)

## Decisions Made

1. **Spread paymentRequiredOptions**: Each reply402 call spreads the base options with url/error overrides, avoiding mutation of shared state between concurrent requests.
2. **HandlerFn type alias in tests**: Fastify's `preHandlerHookHandler` requires `this: FastifyInstance`. Unit tests use a type alias without the `this` binding to avoid creating mock FastifyInstance objects.
3. **Cast to remove this binding**: `createHandler()` helper casts via `unknown` to `HandlerFn` -- simpler than constructing a mock Fastify instance for every test.

## Deviations from Plan

None -- plan executed exactly as written.

## Commit Log

| Hash | Message |
|------|---------|
| fd35ea2 | feat(08-04): add payment gate middleware with settle-before-execution |

## Self-Check: PASSED

- [x] src/sdk/payment-gate.ts exists
- [x] tests/unit/sdk/payment-gate.test.ts exists
- [x] src/sdk/index.ts exists
- [x] src/types/index.ts exists
- [x] Commit fd35ea2 exists in git history
