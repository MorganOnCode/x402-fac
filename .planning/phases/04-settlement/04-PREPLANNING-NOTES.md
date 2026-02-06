# Phase 4: Settlement — Pre-Planning Notes

**Created:** 2026-02-06
**Source:** Masumi reference gap analysis (see `.auditing/claude-masumi-plan.md`)
**Status:** Notes for when Phase 4 planning begins. NOT a plan — these are inputs to the planner.

---

## Critical: Rewrite Phase 4 Deliverables

The ROADMAP.md Phase 4 deliverables are WRONG — they describe the old authorization-based model. The transaction-based model (decided 2026-02-06) changes everything:

### What ROADMAP Says (Wrong)

- Transaction construction for single-output settlement
- Transaction signing with facilitator key
- Verification proof in transaction metadata

### What Phase 4 Actually Needs

1. **Re-verify the pre-signed transaction** — call `verifyPayment()` from Phase 3
2. **Submit the client's raw CBOR** to Blockfrost `/tx/submit` (Content-Type: application/cbor)
3. **Monitor for on-chain confirmation** — poll Blockfrost for tx status
4. **Return settlement result** with tx hash, network, and status

The facilitator does NOT:
- Construct transactions (client already did this)
- Sign transactions (client already signed)
- Embed metadata (can't modify a signed transaction)
- Hold ADA for fees (fees are in the client's transaction)

### Masumi's Settle Pattern (Reference)

```python
@app.post("/settle")
def settle():
    # 1. Decode the transaction from the payload
    raw_cbor = base64.b64decode(tx_b64)

    # 2. Idempotency check via CBOR hash
    key = hashlib.sha256(raw_cbor).hexdigest()
    if key in SUBMITTED:
        tx_hash = SUBMITTED[key]
        ok_now = check_tx_output(tx_hash, pay_to, unit, min_amt, wait_seconds=1)
        if ok_now:
            return jsonify({"success": True, "transaction": tx_hash}), 200
        return jsonify({"pending": True, "transaction": tx_hash}), 202

    # 3. Submit to Blockfrost
    ok, tx_hash, err = submit_tx_blockfrost(raw_cbor)
    if not ok:
        return jsonify({"success": False, "errorReason": err}), 200

    # 4. Return pending (async confirmation)
    SUBMITTED[key] = tx_hash
    return jsonify({"pending": True, "transaction": tx_hash}), 202
```

---

## Critical: Add /status Endpoint

Masumi has `POST /status` for polling settlement progress. This is essential because Cardano block confirmation takes ~20 seconds.

### The Async Settlement Flow

```
Client → POST /settle → 202 {pending: true, transaction: "abc...", retryAfterSeconds: 10}
Client → POST /status → 202 {pending: true, transaction: "abc..."}  (not confirmed yet)
Client → POST /status → 200 {success: true, transaction: "abc...", network: "cardano:mainnet"}
```

### Masumi's Status Pattern

```python
@app.post("/status")
def status():
    tx = body.get("transaction")
    reqs = body.get("payment_requirements") or {}
    # ...extract pay_to, unit, min_amt from requirements...

    ok = check_tx_output(tx, pay_to, unit, min_amt, wait_seconds=1)
    if ok:
        return jsonify({"success": True, "transaction": tx, "network": NETWORK}), 200
    return jsonify({"pending": True, "transaction": tx}), 202
```

### Our Design Considerations

- Should `/status` just check Blockfrost, or also check our Redis settlement record?
- Response format should align with settle response format
- Consider: should status check also verify outputs post-confirmation (belt and suspenders)?

---

## Important: Idempotency via CBOR Hash

Prevent double-submission of the same transaction using SHA-256 of raw CBOR bytes as a dedup key.

**Implementation pattern:**
- Key: `settle:${sha256(cborBytes)}` in Redis
- Value: `{txHash: string, status: 'submitted' | 'confirmed' | 'failed', submittedAt: number}`
- Check before submission — if key exists, return current status
- Set after submission — store tx hash and status
- Survives restarts (Redis, not in-memory dict like masumi)

---

## Important: BlockfrostClient.submitTransaction()

The existing `BlockfrostClient` needs a new method for Phase 4:

```typescript
async submitTransaction(cborBytes: Uint8Array): Promise<string> {
  // POST to Blockfrost /tx/submit
  // Content-Type: application/cbor
  // Body: raw CBOR bytes
  // Returns: tx hash string on success
  // Uses existing retry logic (withRetry)
}
```

This should be added as part of Phase 4 execution, not as a separate prerequisite.

---

## Important: HTTP 202 Pending Response Format

Define a consistent response format for pending settlements:

```typescript
// Success (200)
{ success: true, transaction: string, network: string }

// Pending (202)
{ success: false, pending: true, transaction: string, retryAfterSeconds: number }

// Failed (200)
{ success: false, errorReason: string, transaction?: string }
```

Resource servers use these to:
- Show progress UI on 202 (masumi shows a countdown bar)
- Construct `X-PAYMENT-RESPONSE` header on success
- Display error messages on failure

---

## Important: X-PAYMENT-RESPONSE Header

Masumi's resource server returns this on successful payment:

```python
payment_response = {"success": "true", "network": NETWORK, "transaction": tx_id}
resp.headers["X-PAYMENT-RESPONSE"] = b64_json_encode(payment_response)
```

Our `/settle` response should include all fields the resource server needs to build this header. The settle success response (`{success: true, transaction, network}`) already covers this — document it explicitly.

---

## Moderate: Facilitator Wallet Not Required

In the transaction-based model, the facilitator doesn't sign anything for Phases 3-5. The `chain.facilitator.seedPhrase` and `chain.facilitator.privateKey` config fields (both already optional) are NOT prerequisites for Phase 4.

The facilitator wallet becomes relevant only in:
- Phase 6 batching (if collect-then-distribute pattern is used)
- Future refund processing

Phase 4 planning should not block on facilitator wallet setup.

---

## Post-Submission Output Verification

Even with pre-submission checks (Phase 3), transactions can fail on-chain for reasons we can't detect locally:
- UTXOs already spent (race condition)
- Double-spend attempt
- Insufficient funds (UTXOs consumed between verify and settle)

Masumi's `check_tx_output` pattern queries Blockfrost for confirmed tx UTXOs:

```python
def check_tx_output(tx_hash, pay_to, unit, min_amount, wait_seconds=20):
    """Poll Blockfrost GET /txs/{hash}/utxos, verify correct output exists."""
    deadline = time.time() + wait_seconds
    while time.time() < deadline:
        r = requests.get(f"{BF_BASE}/txs/{tx_hash}/utxos", ...)
        if r.status_code == 404:
            time.sleep(1.0)  # Not yet visible
            continue
        for out in data.get("outputs", []):
            if out.get("address") == pay_to:
                for amt in out.get("amount", []):
                    if amt.get("unit") == unit and int(amt["quantity"]) >= min_amount:
                        return True
        time.sleep(1.0)
    return False
```

Our Phase 4 confirmation should:
1. Submit transaction
2. Poll Blockfrost for tx confirmation (not just submission acceptance)
3. Optionally verify outputs match requirements (belt and suspenders)
4. Update Redis settlement record with final status

---

## Reference Endpoints from Masumi

| Endpoint | Method | Our Phase | Notes |
|----------|--------|-----------|-------|
| `/verify` | POST | Phase 3 | Done (with CBOR verification, unlike masumi) |
| `/settle` | POST | Phase 4 | Submit + async confirmation |
| `/status` | POST | Phase 4 | Poll settlement progress |
| `/supported` | GET | Phase 8 (consider earlier) | Capability discovery |
| `/health` | GET | Phase 1 | Already implemented |

---

## Checklist for Phase 4 Planner

- [ ] Rewrite ROADMAP.md Phase 4 section
- [ ] Define SettleRequest/SettleResponse schemas
- [ ] Define StatusRequest/StatusResponse schemas
- [ ] Add `submitTransaction()` to BlockfrostClient
- [ ] Implement CBOR hash idempotency in Redis
- [ ] Define confirmation polling strategy (interval, max wait, timeout)
- [ ] Decide: synchronous wait vs async 202 pattern (recommend async)
- [ ] Document X-PAYMENT-RESPONSE header construction
- [ ] Update REQUIREMENTS.md PROT-02 for transaction-based model
- [ ] Note: facilitator wallet NOT required

---

*These notes will be consumed by `/gsd:plan-phase 04` when the time comes.*
