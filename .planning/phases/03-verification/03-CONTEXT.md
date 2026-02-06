# Phase 3: Verification - Context

**Gathered:** 2026-02-05
**Revised:** 2026-02-06 (transaction-based model)
**Status:** Ready for execution

<domain>
## Phase Boundary

Validate pre-signed Cardano transactions against x402 payment requirements. The client builds and signs a complete Cardano transaction via CIP-30 `signTx()`, encodes it as base64 CBOR, and sends it to the facilitator. The facilitator parses the CBOR, verifies that an output pays the required recipient the required amount, and returns a verification result. Phase 3 does NOT submit the transaction — that is Phase 4 (Settlement). Settlement (Phase 4) and stablecoins (Phase 5) are separate phases.

UTXO model provides inherent replay protection — each UTXO can only be spent once, so there are no nonces, no NonceStore, and no separate replay tracking.

</domain>

<decisions>
## Implementation Decisions

### Verification model (LOCKED — 2026-02-06)
- **Transaction-based verification** — follow masumi-network pattern
- Client builds + signs full Cardano transaction via CIP-30 signTx()
- Payload contains single `transaction` field (base64-encoded signed CBOR) + optional `payer` field
- Facilitator parses CBOR via CML, verifies outputs (recipient + amount)
- NO signData/CIP-8/COSE verification, NO nonces, NO NonceStore
- UTXO model provides inherent replay protection (each UTXO spent once)

### Wire format (LOCKED — 2026-02-06)
- **x402 V2 wire format** — CAIP-2 chain IDs, Payment-Signature header, x402Version: 2
- Adapt masumi's transaction-based approach to V2 envelope
- V1 backward compatibility is not a goal

### Verification response
- Match x402 V2 spec response shape: `{ isValid, payer?, invalidReason?, invalidMessage?, extensions? }`
- `extensions` bag (not `extra`) for Cardano-specific details per x402 V2 naming
- Informative success responses: echo back scheme, amount, payTo, txHash in `extensions`
- Specific failure reasons in `invalidReason` (not generic "invalid")
- Always HTTP 200 — isValid: true/false conveys the verification result
- Debug details in `extensions` on failure (expected vs actual values)

### Error granularity
- Run all verification checks and report all failures, not fail-fast
- Multiple failures: primary failure in `invalidReason` (first in check order), complete list in `extensions.errors`
- Two-level CBOR errors: `invalid_base64` vs `invalid_cbor` (with CML error in extensions)
- Log all failed verifications at INFO with full context: payer address, reasons (excluding raw CBOR)
- Snake_case error reasons matching x402 convention

### Verification checks (ordered)
1. checkCborValid — parse base64 CBOR via CML.Transaction.from_cbor_hex()
2. checkScheme — scheme must be "exact"
3. checkNetwork — address network ID matches configured network
4. checkRecipient — at least one output pays to required address (via canonical CBOR hex comparison)
5. checkAmount — matching output contains required lovelace amount (or more)
6. checkWitness — transaction has at least one VKey witness (signed, not empty)
7. checkTtl — if TTL is set and expired, reject (requires getCurrentSlot from ChainProvider)
8. checkFee — fee within configurable bounds (150K-5M lovelace default)

### Validity windows
- TTL check: reject if TTL is set and currentSlot > TTL; skip if TTL not set
- Grace buffer: 30 seconds (configurable via config.json, default 30s)
- Default maxTimeoutSeconds: 300 (5 minutes)

### Phase boundary with Phase 4
- Phase 3 verifies ONLY — does NOT submit the transaction
- Phase 4 settlement will receive the verified transaction for submission
- No input existence check in Phase 3 (Phase 4 concern)
- No balance check in Phase 3 (Phase 4 concern)

### Claude's Discretion (resolved)
- Balance check at verify time: **NO** — defer to Phase 4 settlement
- Input existence check: **NO** — defer to Phase 4 (would require Blockfrost calls)
- Fee reasonableness: **YES** — lightweight bounds check (configurable)
- Multi-output handling: Find first matching output, ignore others (change outputs are normal)
- TTL check: **YES** — reject if expired, skip if not set
- Lenient parsing: **YES** — use Zod .passthrough() for extensibility
- Error reason naming: **snake_case** matching x402 convention
- Malformed request handling: **HTTP 200** with invalidReason: 'invalid_request' (consistent with "always 200")
- Multi-error primary reason: **First failure in check order** is primary
- Dry-run submission: **NO** — Phase 4 concern

</decisions>

<specifics>
## Specific Ideas

- Follow x402 V2 spec — match reference implementation's verify contract, extend via `extensions` bag
- x402 verify request format: `POST /verify` with `{ paymentPayload, paymentRequirements }`
- CardanoPayload: `{ transaction: string, payer?: string }` — transaction is base64-encoded signed CBOR
- CAIP-2 chain IDs: cardano:preview, cardano:preprod, cardano:mainnet
- PAYMENT-SIGNATURE header — Base64-encoded JSON per x402 V2 spec
- Transaction hash computed via CML.hash_transaction() and returned in extensions
- Address comparison via canonical CBOR hex (not bech32 string comparison)
- CML objects need .free() for WASM memory management
- BigInt values converted to strings before JSON serialization

</specifics>

<deferred>
## Deferred Ideas

- Batching (Phase 6) — transaction-based model may need collect-then-distribute pattern
- Actual transaction submission — Phase 4 settlement
- Input UTXO existence check — Phase 4 (requires on-chain lookups)
- Payer balance verification — Phase 4 (state may change between verify and settle)
- Stablecoin/native token verification — Phase 5

</deferred>

---

*Phase: 03-verification*
*Context gathered: 2026-02-05*
*Revised for transaction-based model: 2026-02-06*
