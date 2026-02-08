# Phase 5: Stablecoins - Context

**Gathered:** 2026-02-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Accept stablecoin payments (USDM, DJED, iUSD) in addition to ADA. Extends the existing verification and settlement pipeline to handle Cardano native tokens. Each payment uses a single currency (no mixed ADA + token payments). Token construction and multi-asset transaction building are NOT in scope here — the client builds and signs the transaction, the facilitator verifies and settles it.

</domain>

<decisions>
## Implementation Decisions

### Token registry design
- Hardcoded TypeScript constants, not config-driven — acts as a security gate; every token addition goes through code review
- All three tokens supported at launch: USDM, DJED, iUSD
- Mainnet policy IDs only in registry; tests use mocked values
- Tokens identified in API by canonical Cardano format: `policyId.assetNameHex` (not ticker symbols)
- Payments with unsupported/unknown tokens are rejected with a specific verification error
- One currency per payment — either ADA or a specific token, no mixed payments

### Amount & decimal handling
- All amounts in base units (like lovelace) — no human-readable decimals in the API
- No decimal metadata in token registry — optimize for machine-readable functionality first, human readability can be layered later
- Philosophy: machine-readable code first, human interpretation is a presentation concern

### Verification changes
- Token output must match recipient + token + amount (strictest matching: the specific output to the facilitator's recipient must contain the correct token at the correct amount)
- New dedicated "min_utxo" verification check in the pipeline (not folded into amount check)
- Facilitator calculates required min UTXO using real protocol parameters and rejects if insufficient
- Min UTXO error includes the required amount so clients can fix it (e.g., "min UTXO requires 1850000 lovelace, got 1000000")

### Claude's Discretion
- Internal amount representation (bigint vs string) — pick based on existing lovelace patterns
- Overpayment policy (allow vs exact) — pick based on existing ADA verification behavior
- How to adapt check pipeline (extend existing vs add new checks) — pick based on code structure
- API field design for distinguishing ADA vs token payments — pick based on x402 protocol patterns
- Error reason naming for unsupported tokens — pick based on existing snake_case conventions

</decisions>

<specifics>
## Specific Ideas

- Pending todo #4: "Document masumi native token format for Phase 5" — researcher should reference this for API format alignment
- Pending todo #1: "Support X-PAYMENT-RESPONSE header" — may interact with token payments (Phase 4 concern but check for impact)
- User philosophy: "optimize for the functionality first, humans later" — avoid premature human-readability in token APIs

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-stablecoins*
*Context gathered: 2026-02-08*
