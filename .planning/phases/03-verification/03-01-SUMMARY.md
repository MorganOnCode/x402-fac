---
phase: 03-verification
plan: 01
subsystem: api
tags: [zod, x402, caip-2, cardano, verification, cbor, types]

# Dependency graph
requires:
  - phase: 02-chain-provider
    provides: ChainConfig schema, CardanoNetwork type, @fastify/error pattern
provides:
  - x402 V2 wire format Zod schemas (PaymentRequirements, CardanoPayload, PaymentPayload, VerifyRequest, VerifyResponse)
  - Verification internal types (CheckResult, VerifyContext, VerifyCheck)
  - CAIP-2 chain ID mapping constants
  - VERIFY_* domain errors
  - ChainConfig verification section with grace buffer, timeout, fee bounds
affects: [03-02 CBOR deserialization, 03-03 verification checks, 03-04 verify route, 04-payment-flow]

# Tech tracking
tech-stack:
  added: []
  patterns: [transaction-based verification model, CAIP-2 chain IDs, Zod passthrough for lenient parsing]

key-files:
  created:
    - src/verify/types.ts
    - src/verify/errors.ts
    - src/verify/index.ts
  modified:
    - src/chain/config.ts
    - src/errors/index.ts
    - tests/integration/health.test.ts
    - tests/integration/server.test.ts
    - tests/unit/chain/blockfrost-client.test.ts
    - tests/unit/chain/provider.test.ts

key-decisions:
  - "Zod v4 z.record() requires two args (key, value) -- used z.record(z.string(), z.unknown())"
  - "Zod v4 z.string().regex() requires error message as second arg"
  - "NETWORK_ID_EXPECTED kept as named alias of CAIP2_TO_NETWORK_ID for semantic clarity"
  - "VerifyInvalidFormatError returns HTTP 200 per locked decision (always HTTP 200 for verify)"

patterns-established:
  - "Transaction-based model: NO nonces, NO COSE/CIP-8, NO signData -- payload contains signed CBOR transaction"
  - "CAIP-2 chain ID format: cardano:preview, cardano:preprod, cardano:mainnet"
  - "VerifyCheck function signature: (ctx: VerifyContext) => CheckResult | Promise<CheckResult>"
  - "Verification config lives inside ChainConfigSchema (chain-specific settings)"

# Metrics
duration: 5min
completed: 2026-02-06
---

# Phase 3 Plan 01: Verification Domain Types Summary

**x402 V2 wire format Zod schemas, CAIP-2 chain ID constants, VERIFY_* errors, and ChainConfig verification extension for transaction-based model**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-06T12:45:41Z
- **Completed:** 2026-02-06T12:50:56Z
- **Tasks:** 2
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments
- Complete x402 V2 wire format type foundation with 5 Zod schemas and 5 inferred TS types
- CAIP-2 chain ID mapping constants for Preview, Preprod, Mainnet
- Internal verification types (CheckResult, VerifyContext, VerifyCheck) ready for check pipeline
- Config extended with verification section (grace buffer, timeout, fee bounds) with Zod defaults
- Zero nonce/COSE/CIP-8 artifacts -- clean transaction-based model

## Task Commits

Each task was committed atomically:

1. **Task 1: Create verification types and Zod schemas** - `e664fb3` (feat)
2. **Task 2: Create verification errors, barrel exports, and extend config** - `15897bc` (feat)

**Plan metadata:** pending

## Files Created/Modified
- `src/verify/types.ts` - x402 V2 Zod schemas, inferred types, CheckResult/VerifyContext/VerifyCheck, CAIP-2 constants
- `src/verify/errors.ts` - VerifyInvalidFormatError (200), VerifyInternalError (500) via @fastify/error
- `src/verify/index.ts` - Barrel exports with type-only re-exports for ESM
- `src/chain/config.ts` - Added verification section to ChainConfigSchema with defaults
- `src/errors/index.ts` - Re-export VERIFY_* errors alongside CHAIN_* errors
- `tests/integration/health.test.ts` - Added verification config defaults to test config
- `tests/integration/server.test.ts` - Added verification config defaults to test config
- `tests/unit/chain/blockfrost-client.test.ts` - Added verification config defaults to test config
- `tests/unit/chain/provider.test.ts` - Added verification config defaults to test config

## Decisions Made
- Zod v4 `.regex()` requires error message as second argument (unlike v3) -- added descriptive messages
- Zod v4 `z.record()` requires two arguments (key schema + value schema) -- used `z.record(z.string(), z.unknown())`
- NETWORK_ID_EXPECTED kept as named alias of CAIP2_TO_NETWORK_ID for semantic clarity in address verification
- VerifyInvalidFormatError uses HTTP 200 (not 400) per locked decision "always HTTP 200 for verify responses"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Zod v4 API differences for regex and record**
- **Found during:** Task 1 (types creation)
- **Issue:** Zod v4 `.regex()` expects 2 args and `z.record()` expects 2 args, unlike Zod v3
- **Fix:** Added error message to `.regex()` calls, added `z.string()` key schema to `z.record()` calls
- **Files modified:** src/verify/types.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** e664fb3 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed test type errors from ChainConfig extension**
- **Found during:** Task 2 (config extension)
- **Issue:** 4 test files construct ChainConfig objects directly (not via Zod parse), so the new required `verification` property was missing, failing typecheck in pre-commit hook
- **Fix:** Added `verification: { graceBufferSeconds: 30, maxTimeoutSeconds: 300, feeMinLovelace: 150000, feeMaxLovelace: 5000000 }` to all 4 test config objects
- **Files modified:** tests/integration/health.test.ts, tests/integration/server.test.ts, tests/unit/chain/blockfrost-client.test.ts, tests/unit/chain/provider.test.ts
- **Verification:** `pnpm build && pnpm lint && pnpm test` all pass (89 tests)
- **Committed in:** 15897bc (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes necessary for compilation and test correctness. No scope creep.

## Issues Encountered
None beyond the Zod v4 API differences documented as deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Type foundation complete for Plans 02-04
- Plan 02 (CBOR deserialization) can import VerifyContext and CheckResult directly
- Plan 03 (verification checks) can implement VerifyCheck functions against VerifyContext
- Plan 04 (verify route) can use VerifyRequestSchema for request validation
- Config verification section provides defaults for all plans (no config file changes needed)

## Self-Check: PASSED

---
*Phase: 03-verification*
*Completed: 2026-02-06*
