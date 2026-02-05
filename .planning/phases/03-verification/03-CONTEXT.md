# Phase 3: Verification - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Validate payment signatures and enforce security against replay attacks. Implements CIP-8/CIP-30 signature verification, nonce tracking, chain ID validation, timestamp/validity window checks, balance verification against UTXO state, and the /verify endpoint. Settlement (Phase 4) and stablecoins (Phase 5) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Verification response
- Match x402 spec response shape: `{ isValid, payer?, invalidReason? }`
- Add optional `extra: {}` bag for Cardano-specific details (follows the pattern x402 uses in PaymentRequirements)
- Informative success responses: echo back scheme, amount, address in `extra`
- Specific failure reasons in `invalidReason` (not generic "invalid")
- Always HTTP 200 — isValid: true/false conveys the verification result
- Stateless: no verification token passed to /settle — settlement re-verifies independently
- Accept both raw x402 PAYMENT-SIGNATURE header (Base64-encoded JSON) and parsed JSON body for direct API calls
- Debug details in `extra` on failure (e.g., expected vs actual values)

### Replay protection
- Facilitator generates nonces — issued in 402 response and via separate GET /nonce endpoint
- Nonce format: structured (includes timestamp + random) — enables server-side expiry check
- Store-backed integrity: nonce authenticity verified by Redis store lookup (no HMAC, no extra secret key)
- Nonce storage: in-memory + Redis (consistent with Phase 2 UTXO reservation pattern, survives restarts)
- Unused nonces auto-expire after timeout (same as validity window)
- Replay attempts: log at WARN level with payer address + reject with `invalidReason: "nonce_already_used"`

### Error granularity
- Distinguish crypto failures from content mismatches: "invalid_signature" vs "amount_mismatch" — helps client debug
- Run all verification checks and report all failures, not fail-fast
- Multiple failures: primary failure in `invalidReason`, complete list in `extra.errors`
- Log all failed verifications at INFO with full context: payer address, reason, payload details (excluding secrets)
- Track verification metrics: counters by result (success, each failure type) for monitoring and alerting

### Validity windows
- Work in both time domains: validate maxTimeoutSeconds as calendar time in Phase 3, slot translation deferred to Phase 4 settlement
- Grace buffer: 30 seconds (matches Cardano's realistic ~25-30s settlement time)
- Grace buffer configurable via config.json (default 30s) — operators can tune for network conditions
- Default maxTimeoutSeconds: 300 (5 minutes), matching x402 EVM reference

### Claude's Discretion
- Balance check at verify time: Claude decides whether to check payer UTXO balance during verification or defer to settlement
- Strict vs lenient parsing of unknown fields in payment payloads
- Error reason naming convention (match x402 snake_case style vs Cardano-prefixed)
- Malformed request handling (HTTP 400 vs 200 with invalidReason)
- Future payment handling (validAfter > now: reject vs accept)
- Timeout mismatch behavior (client signs different maxTimeoutSeconds than server advertised)
- Multi-error primary reason selection logic

</decisions>

<specifics>
## Specific Ideas

- "Follow x402 spec" — match the reference implementation's verify contract, extend via `extra` bag not by diverging from the spec shape
- x402 verify request format: `POST /verify` with `{ x402Version, paymentPayload, paymentRequirements }`
- x402 verify response format: `{ isValid: boolean, payer?: string, invalidReason?: string }` — our extension adds `extra?: {}`
- Reference EVM verification order: scheme check -> network match -> recipient match -> time window -> balance check -> amount check -> signature verification
- Known invalidReason values from spec: "unsupported_scheme", "network_mismatch", "insufficient_funds", "expired", "invalid_signature", "amount_mismatch"
- PAYMENT-SIGNATURE header (not X-Payment) — Base64-encoded JSON per x402 v2 spec

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-verification*
*Context gathered: 2026-02-05*
