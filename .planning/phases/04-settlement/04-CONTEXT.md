# Phase 4: Settlement - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Submit a client's pre-signed Cardano transaction to the blockchain via Blockfrost and confirm settlement. The client builds and signs the full transaction — the facilitator re-verifies, submits, and monitors confirmation. No transaction construction, no facilitator signing, no metadata embedding. Facilitator wallet is NOT required.

</domain>

<decisions>
## Implementation Decisions

### Settlement flow
- Synchronous: POST /settle blocks until on-chain confirmation or timeout
- Re-verify the transaction (call `verifyPayment()` again) before submitting as defense-in-depth
- Submit raw CBOR to Blockfrost `/tx/submit` via new `submitTransaction()` on BlockfrostClient
- Poll Blockfrost for tx confirmation every 5 seconds after submission
- 1 confirmation (tx appears in a block) = success — no multi-block depth required
- Timeout at 120 seconds (conservative, ~6 Cardano blocks, handles congestion)
- On timeout: return failure with reason `confirmation_timeout` — tx may still confirm later, client can poll /status

### Endpoint design
- **POST /settle** — accepts `{transaction: string, paymentRequirements: {...}}` (same shape as /verify)
  - Success (200): `{success: true, transaction: "<txHash>", network: "cardano:preprod"}`
  - Failure (200): `{success: false, reason: "<snake_case_reason>"}`
  - Timeout (200): `{success: false, reason: "confirmation_timeout", transaction: "<txHash>"}`
  - Always HTTP 200 (consistent with /verify pattern — application-level success/failure)
- **POST /status** — lightweight confirmation check
  - Accepts `{transaction: string, paymentRequirements: {...}}`
  - Returns `{status: "confirmed" | "pending" | "not_found", transaction: "<txHash>"}`
  - Queries Blockfrost for tx status without resubmitting
  - HTTP 200 always

### Response contract for X-PAYMENT-RESPONSE
- Success responses include `transaction` (tx hash) and `network` (CAIP-2 chain ID)
- Resource servers use these fields to construct the `X-PAYMENT-RESPONSE` header per x402 protocol
- Network value comes from config (e.g., `cardano:preprod` or `cardano:mainnet`)

### Idempotency & safety
- CBOR SHA-256 hash as dedup key in Redis: `settle:<sha256hex>`
- Value: `{txHash, status, submittedAt, confirmedAt?}` with 24-hour TTL
- On duplicate submission: skip Blockfrost submit, check current tx status instead
- Blockfrost also handles true double-submission gracefully (returns existing tx hash)
- Redis dedup survives facilitator restarts

### Confirmation strategy
- After submission, poll Blockfrost `/txs/<txHash>` every 5 seconds
- Tx found in a block = confirmed (1-depth, no multi-confirmation wait)
- Max poll duration: 120 seconds (24 polls)
- Blockfrost returns 404 for unconfirmed txs, 200 with block info for confirmed
- On timeout: record `confirmation_timeout` in Redis dedup entry — /status can continue checking

### BlockfrostClient extension
- Add `submitTransaction(cborBytes: Uint8Array): Promise<string>` to existing BlockfrostClient
- POST to `/tx/submit` with `Content-Type: application/cbor`
- Add `getTransaction(txHash: string): Promise<TxInfo | null>` for confirmation polling
- Reuse existing `withRetry` for transient failures
- Do NOT retry on 400 (invalid transaction) — fail immediately with reason

### Facilitator wallet
- Not needed for Phase 4 — client signs, facilitator just submits
- Both `seedPhrase` and `privateKey` config fields are already optional
- Wallet becomes relevant in Phase 6+ (batching/refunds)

### Claude's Discretion
- Internal settle service module structure
- Zod schema naming conventions (consistent with Phase 3 patterns)
- Exact Redis key serialization format
- Poll backoff strategy (fixed 5s vs exponential — fixed preferred for predictability)
- Error categorization for non-timeout failures (e.g., `invalid_transaction`, `submission_rejected`)

</decisions>

<specifics>
## Specific Ideas

- Follow the same always-HTTP-200 pattern from /verify — no HTTP error codes for application-level failures
- The /settle and /status request body should reuse the same shape as /verify for consistency
- ROADMAP.md Phase 4 deliverables need rewriting to match transaction-based model (todo #1)
- Masumi reference implementation uses the same re-verify-then-submit pattern (`.auditing/claude-masumi-plan.md` Section 2.4)

</specifics>

<deferred>
## Deferred Ideas

- HTTP 202 async pattern — decided sync for now; if timeout issues arise in production, can revisit as Phase 4.1
- Batch settlement (multiple txs in one call) — Phase 6
- Facilitator-signed transactions — Phase 6+ (batching/refunds)
- Webhook notifications for settlement status — future enhancement

</deferred>

---

*Phase: 04-settlement*
*Context gathered: 2026-02-06*
