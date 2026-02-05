---
phase: 02-chain-provider
plan: 01
subsystem: chain-foundation
tags: [types, errors, config, zod, cardano, bigint]
depends_on:
  requires: [01-03, 01-04]
  provides: [chain-types, chain-errors, chain-config-schema]
  affects: [02-02, 02-03, 02-04, 02-05]
tech-stack:
  added: []
  patterns: [domain-errors-fastify, zod-config-extension, bigint-values, mainnet-guardrail]
key-files:
  created:
    - src/chain/types.ts
    - src/chain/errors.ts
    - src/chain/config.ts
  modified:
    - src/config/schema.ts
    - src/errors/index.ts
    - tests/unit/config.test.ts
    - tests/integration/server.test.ts
    - tests/integration/health.test.ts
    - config/config.json
decisions:
  - id: bigint-lovelace
    decision: "Use bigint for all lovelace and native asset values"
    rationale: "Cardano lovelace can exceed 2^53, causing precision loss with Number"
  - id: utxo-ref-format
    decision: "UTXO references formatted as 'txHash#outputIndex' string"
    rationale: "Standard Cardano convention, natural Redis key format"
  - id: mainnet-env-guard
    decision: "Mainnet requires MAINNET=true env var via Zod superRefine"
    rationale: "Fail-safe prevents accidental mainnet usage during development"
  - id: chain-config-required
    decision: "chain section is required (not optional) in ConfigSchema"
    rationale: "Facilitator cannot operate without chain configuration"
metrics:
  duration: 4 min
  completed: 2026-02-05
---

# Phase 2 Plan 1: Chain Foundation Types, Errors, and Config Summary

Chain domain foundation with types (CachedUtxo, UtxoRef, Reservation using bigint for lovelace), 5 CHAIN_* domain errors following @fastify/error pattern, and Zod config schema for Blockfrost/network/cache/reservation/Redis with mainnet safety guardrail.

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | 65be675 | feat | Chain types (CardanoNetwork, CachedUtxo, UtxoRef, Reservation, BLOCKFROST_URLS) and 5 CHAIN_* domain errors with re-export from errors barrel |
| 2 | 1ae360a | feat | ChainConfigSchema with Blockfrost/facilitator/cache/reservation/Redis sections, mainnet guardrail, ConfigSchema extension, test updates |

## What Was Built

### src/chain/types.ts
- `CardanoNetwork` type: `'Preview' | 'Preprod' | 'Mainnet'`
- `BlockfrostTier` type: `'free' | 'paid'`
- `UtxoRef` interface: `{ txHash, outputIndex }`
- `CachedUtxo` interface: simplified UTXO with `bigint` for lovelace and assets
- `Reservation` interface: UTXO lock with TTL and request tracking
- `BLOCKFROST_URLS` const record: network-to-URL mapping
- `utxoRefToString()` / `stringToUtxoRef()` helper functions

### src/chain/errors.ts
- `ChainRateLimitedError` (CHAIN_RATE_LIMITED, 503)
- `ChainConnectionError` (CHAIN_CONNECTION_ERROR, 503)
- `ChainUtxoExhaustedError` (CHAIN_UTXO_EXHAUSTED, 503)
- `ChainTransactionError` (CHAIN_TX_ERROR, 500)
- `ChainNetworkMismatchError` (CHAIN_NETWORK_MISMATCH, 500)

### src/chain/config.ts
- `ChainConfigSchema`: Zod schema validating network, blockfrost (projectId, url, tier), facilitator (seedPhrase or privateKey required), cache (utxoTtlSeconds), reservation (ttlSeconds, maxConcurrent), redis (host, port)
- Mainnet guardrail via `superRefine`: rejects Mainnet without `MAINNET=true` env var
- `resolveBlockfrostUrl()`: derives Blockfrost URL from network or uses explicit override
- `ChainConfig` type exported

### src/config/schema.ts
- Added `chain: ChainConfigSchema` as required field
- Config type now includes full chain configuration

### src/errors/index.ts
- Re-exports all 5 chain errors from `../chain/errors.js`

## Test Results

- 21/21 tests pass (up from 18)
- 3 new tests added: missing chain section rejection, missing facilitator credentials rejection, mainnet guardrail rejection
- All existing tests updated with minimal chain config fixtures

## Deviations from Plan

None -- plan executed exactly as written. Test fixture updates were anticipated in the plan.

## Decisions Made

1. **bigint for lovelace**: All ADA/lovelace values use `bigint` to prevent precision loss above 2^53.
2. **UTXO ref format**: String format `"txHash#outputIndex"` matches Cardano convention and works as natural Redis key.
3. **Mainnet guardrail via superRefine**: Integrated directly into Zod schema validation rather than a separate function, so it's enforced at config load time.
4. **Chain config required**: Made `chain` field required (not optional) since the facilitator cannot operate without it.
5. **Facilitator refine**: Uses Zod `.refine()` to ensure at least one of seedPhrase or privateKey is provided.

## Verification

- `pnpm typecheck`: 0 errors
- `pnpm test`: 21/21 pass
- `pnpm lint`: clean

## Next Phase Readiness

All plans in wave 2+ of phase 02 can now import from:
- `src/chain/types.ts` for domain types
- `src/chain/errors.ts` for CHAIN_* errors
- `src/chain/config.ts` for ChainConfigSchema and resolveBlockfrostUrl

No blockers for subsequent plans.
