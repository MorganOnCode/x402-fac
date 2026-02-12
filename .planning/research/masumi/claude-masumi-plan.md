# Phase 3 Analysis: Masumi Reference, Our Value-Add, and Verification Architecture

**Date:** 2026-02-06 (revised)
**Context:** Comprehensive analysis of masumi-network x402-cardano reference, our Phase 3 transaction-based verification model, and architectural decisions for building the most capable x402 facilitator on Cardano.

**Reference repo:** https://github.com/masumi-network/x402-cardano-examples

---

## Table of Contents

1. [Discovery: Model Mismatch](#1-discovery-model-mismatch)
2. [Masumi Deep Dive with Code](#2-masumi-deep-dive-with-code)
3. [Security Model Comparison](#3-security-model-comparison)
4. [Our Value-Add: What We Build Better](#4-our-value-add-what-we-build-better)
5. [Architectural Decisions (Locked)](#5-architectural-decisions-locked)
6. [Code Architecture: How Our Verification Works](#6-code-architecture-how-our-verification-works)
7. [Masumi Gaps We Exploit](#7-masumi-gaps-we-exploit)
8. [Risk Register](#8-risk-register)

---

## 1. Discovery: Model Mismatch

### What We Originally Planned (INVALIDATED)

Phase 3 was designed around CIP-8/CIP-30 message signing:
- Client calls `signData()` to sign a nonce
- Facilitator verifies COSE signature, checks nonce freshness
- Facilitator constructs and submits the on-chain transaction

This mirrors the EVM model where the payer authorizes a transfer and the facilitator executes it.

### What Masumi Actually Implements

**The payer signs a complete Cardano transaction, NOT a nonce.**

The client builds the real payment transaction in-browser using Lucid + CIP-30 `signTx()`, then sends the signed CBOR to the facilitator for submission. There is no separate authorization step.

### Why Transaction-Based Is Correct for Cardano

Cardano's UTXO model is fundamentally different from EVM's account model:

| Property | EVM Account Model | Cardano UTXO Model |
|----------|-------------------|---------------------|
| State | Global mutable balances | Immutable transaction outputs |
| Replay protection | Nonce counter per account | Each UTXO consumed exactly once |
| Who builds tx | Anyone with authorization | Must know specific UTXOs to spend |
| Fee payment | Separate from authorization | Embedded in transaction |

An authorization-based model (sign a message, facilitator builds tx) would require the facilitator to:
1. Know the payer's UTXOs (privacy concern)
2. Hold ADA for transaction fees (capital requirement)
3. Manage a novel authorization scheme with no reference implementation

The transaction-based model avoids all three problems.

---

## 2. Masumi Deep Dive with Code

### 2.1 Client Side: Building the Payment Transaction

From `resource_server/static/app.js`, the `buildPaymentTxB64()` function constructs a real Cardano transaction:

```javascript
// Step 1: Initialize Lucid with Blockfrost provider
const { Lucid, Blockfrost, C } = await getLucidLib();
const bf = new Blockfrost('https://cardano-mainnet.blockfrost.io/api/v0', bfKey);
const lucid = await Lucid.new(bf, network);

// Step 2: Connect CIP-30 wallet
walletApi = await window.cardano[chosen.id].enable();
lucid.selectWallet(walletApi);

// Step 3: Gather UTXOs across all wallet addresses
const addresses = await getWalletBech32Addresses();
let allUtxos = [];
for (const a of addresses) {
  const utx = await lucid.utxosAt(a);
  allUtxos.push(...utx);
}

// Step 4: Select token UTXOs (USDM in this case)
const tokenUtxos = allUtxos
  .filter((u) => BigInt((u.assets && u.assets[unit]) || 0) > 0n)
  .sort((a, b) => /* descending by amount */);

let tokenSelected = [];
let tokenSum = 0n;
for (const u of tokenUtxos) {
  if (tokenSum >= qty) break;
  tokenSelected.push(u);
  tokenSum += BigInt((u.assets && u.assets[unit]) || 0);
}

// Step 5: Build, sign, encode
const tx = await lucid
  .newTx()
  .collectFrom(selected)
  .payToAddress(payTo, { [unit]: qty, lovelace: 2_000_000n })
  .complete();

const signed = await tx.sign().complete();
const cborHex = signed.toString();
const b64 = bytesToBase64(hexToBytes(cborHex));
```

**Key observations:**
- Client does ALL the heavy lifting (UTXO selection, coin selection, fee estimation)
- Client needs its own Blockfrost API key to query UTXOs (masumi leaks this to browser)
- The `2_000_000n` lovelace is the minimum ADA required for a native token output
- Fallback logic tries alternative asset name hex if the primary one has insufficient balance
- InputsExhausted retry loop incrementally adds ADA-only UTXOs for fee coverage

### 2.2 Wire Format: X-PAYMENT Header

The signed transaction is wrapped in an x402 V1 envelope:

```javascript
const headerObj = {
  x402Version: 1,
  scheme: 'exact',
  network: 'cardano',        // NOT CAIP-2, just a string
  payload: {
    transaction: txB64        // base64-encoded signed CBOR
  }
};
const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(headerObj))));
// Sent as: X-PAYMENT: <encoded>
```

**Our V2 adaptation will use:**
```typescript
// x402 V2 wire format (our implementation)
{
  x402Version: 2,
  scheme: 'exact',
  network: 'cardano:mainnet',   // CAIP-2 chain ID
  payload: {
    transaction: txB64,          // base64-encoded signed CBOR
    payer?: 'addr1q...'          // Optional: payer address for receipt tracking
  }
}
// Sent as: Payment-Signature: <base64-encoded JSON>
```

### 2.3 Facilitator /verify: Envelope-Only Validation

Masumi's verify does the absolute minimum:

```python
@app.post("/verify")
def verify():
    body = request.get_json(silent=True) or {}
    x_payment_b64 = body.get("x_payment_b64")
    reqs = body.get("payment_requirements") or {}

    try:
        x_payment = decode_x_payment_b64(x_payment_b64)      # JSON decode
    except Exception as e:
        return jsonify({"isValid": False, "invalidReason": "invalid_payload"}), 200

    # Check 1: x402 version
    if x_payment.get("x402Version") != 1:
        return jsonify({"isValid": False, "invalidReason": "invalid_x402_version"}), 200

    # Check 2: scheme
    if x_payment.get("scheme") != "exact":
        return jsonify({"isValid": False, "invalidReason": "invalid_scheme"}), 200

    # Check 3: network
    net = x_payment.get("network")
    if net not in {"cardano", "cardano-mainnet"}:
        return jsonify({"isValid": False, "invalidReason": "invalid_network"}), 200

    # Check 4: payload.transaction exists
    payload = x_payment.get("payload") or {}
    tx_b64 = payload.get("transaction")
    if not isinstance(tx_b64, str) or not tx_b64.strip():
        return jsonify({"isValid": False, "invalidReason": "invalid_payload"}), 200

    # Check 5: base64 decodes (but NOT parsed as CBOR!)
    try:
        base64.b64decode(tx_b64)
    except Exception:
        return jsonify({"isValid": False, "invalidReason": "invalid_payload"}), 200

    return jsonify({"isValid": True}), 200
```

**What masumi does NOT check at verify time:**
- Transaction CBOR validity (could be garbage bytes)
- Output addresses (could pay to wrong recipient)
- Output amounts (could be 1 lovelace instead of required amount)
- Witness presence (could be unsigned)
- Network ID in transaction body/addresses
- TTL/validity interval
- Fee reasonableness

### 2.4 Facilitator /settle: Submit-Then-Poll

```python
@app.post("/settle")
def settle():
    # Parse the transaction from the payload
    x_payment = decode_x_payment_b64(x_payment_b64)
    tx_b64 = (x_payment.get("payload") or {}).get("transaction")
    raw_cbor = base64.b64decode(tx_b64)

    # Idempotency: hash the raw CBOR as a dedup key
    key = hashlib.sha256(raw_cbor).hexdigest()
    if key in SUBMITTED:
        tx_hash = SUBMITTED[key]
        # Quick check if already confirmed
        ok_now = check_tx_output(tx_hash, pay_to, unit, min_amt, wait_seconds=1)
        if ok_now:
            return jsonify({"success": True, "transaction": tx_hash, ...}), 200
        return jsonify({"success": False, ..., "pending": True}), 202

    # Submit raw CBOR to Blockfrost
    ok, tx_hash, err = submit_tx_blockfrost(raw_cbor)
    if not ok:
        return jsonify({"success": False, "errorReason": err, ...}), 200

    SUBMITTED[key] = tx_hash
    return jsonify({"success": False, ..., "pending": True}), 202
```

**Critical: payment correctness is only checked AFTER submission:**

```python
def check_tx_output(tx_hash, pay_to, unit, min_amount, wait_seconds=20):
    """Poll Blockfrost for tx UTXOs, check if correct output exists."""
    deadline = time.time() + wait_seconds
    while time.time() < deadline:
        r = requests.get(f"{BF_BASE}/txs/{tx_hash}/utxos", headers=headers, timeout=15)
        if r.status_code == 404:
            time.sleep(1.0)
            continue
        data = r.json()
        for out in data.get("outputs", []):
            if out.get("address") != pay_to:
                continue
            for amt in out.get("amount", []):
                if amt.get("unit") == unit and int(amt.get("quantity", 0)) >= int(min_amount):
                    return True
        time.sleep(1.0)
    return False
```

This means masumi will happily submit a transaction that pays the wrong person or wrong amount. It will only discover the error after wasting a blockchain submission.

### 2.5 Resource Server: The 402 Flow

```python
@app.route("/", methods=["GET"])
def protected_root():
    x_payment_b64 = request.headers.get("X-PAYMENT")
    if not x_payment_b64:
        return make_payment_required_page("missing")   # HTTP 402

    reqs = payment_requirements()
    valid, reason = facilitator_verify(x_payment_b64, reqs)  # POST to facilitator
    if not valid:
        return make_payment_required_page(reason)      # HTTP 402

    settled, tx_id, err = facilitator_settle(x_payment_b64, reqs)  # POST to facilitator
    if not settled:
        body = {"pending": True, "transaction": tx_id, "retryAfterSeconds": 10}
        return make_response(jsonify(body), 202)       # HTTP 202

    # Success
    content = {"message": "You've unlocked the protected resource via x402.", ...}
    resp = make_response(jsonify(content), 200)        # HTTP 200
    resp.headers["X-PAYMENT-RESPONSE"] = b64_json_encode(payment_response)
    return resp
```

### 2.6 PaymentRequirements Structure

```python
{
    "x402Version": 1,
    "error": "X-PAYMENT header is required",
    "accepts": [{
        "scheme": "exact",
        "network": "cardano-mainnet",
        "maxAmountRequired": "2000000",        # 2 USDM (6 decimals)
        "asset": "c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad",  # policy ID
        "payTo": "addr1q9m755p8q86d5rntr4wgn946jnz3uzt0a3p6028y4rpyjlh7k8...",
        "resource": "/",
        "description": "Access to premium market data",
        "mimeType": "application/json",
        "outputSchema": None,
        "maxTimeoutSeconds": 600,
        "extra": {
            "assetNameHex": "0014df105553444d",   # (333) USDM CIP-67 label
            "assetFingerprint": "asset12ffdj8kk2w485sr7a5ekmjjdyecz8ps2cm5zed",
            "decimals": 6
        }
    }]
}
```

**Notable:** The `extra.assetNameHex` uses CIP-67 label format `0014df10` + ASCII hex of "USDM". This is how the client constructs the full Cardano asset unit: `policyId + assetNameHex`.

---

## 3. Security Model Comparison

### 3.1 Trust Assumptions

| Trust Property | Masumi | Our Facilitator |
|---------------|--------|-----------------|
| Transaction well-formed | Trusted (no CBOR check) | **Verified** (CML parse) |
| Correct recipient | Trusted until post-submit poll | **Verified** (output address check) |
| Correct amount | Trusted until post-submit poll | **Verified** (output amount check) |
| Transaction signed | Trusted | **Verified** (witness presence check) |
| Network match | Envelope string only | **Verified** (address network ID) |
| Fee reasonable | Not checked | **Verified** (bounds check) |
| TTL valid | Not checked | **Verified** (slot comparison) |
| Replay protection | UTXO model (inherent) | UTXO model (inherent) |

### 3.2 Attack Vectors Masumi Is Vulnerable To

**1. Resource theft via unsigned transaction**
An attacker submits a valid CBOR transaction that is NOT signed (empty witness set). Masumi's `/verify` returns `isValid: true`. The `/settle` submits it to Blockfrost, which rejects it — but the resource server may have already returned content in a race condition depending on implementation.

Our check: `checkWitness` verifies at least one VKey witness exists before declaring validity.

**2. Wrong-recipient transaction**
An attacker builds a transaction paying themselves instead of the resource owner. Masumi's `/verify` passes because it never checks outputs. `/settle` submits it, the transaction confirms, but the payment went to the wrong address. `check_tx_output` catches this — but only after a successful blockchain submission.

Our check: `checkRecipient` compares output addresses using canonical CBOR hex before any submission.

**3. Dust amount attack**
An attacker sends 1 lovelace instead of the required amount. Same flow as above — masumi only catches it post-submission via polling.

Our check: `checkAmount` verifies the output to the recipient contains at minimum the required lovelace.

**4. Wrong-network transaction**
A preprod transaction submitted to a mainnet facilitator. Masumi checks the envelope `network` string but not the transaction's actual network ID.

Our check: `checkNetwork` extracts the network ID from output addresses (always present) and compares against configured CAIP-2 chain ID.

### 3.3 What the UTXO Model Gives Us for Free

**Replay protection without nonces.** This is the single biggest security advantage of the transaction-based model on Cardano:

- Each UTXO (unspent transaction output) has a unique identifier: `txHash#outputIndex`
- A transaction specifies exact UTXOs as inputs
- Once a UTXO is consumed by a confirmed transaction, it cannot be spent again
- Therefore: the same signed transaction can never be submitted twice successfully
- This is enforced at the protocol level by every Cardano node

Compare to EVM where replay protection requires explicit nonces (EIP-3009) managed by the application layer.

---

## 4. Our Value-Add: What We Build Better

### 4.1 Pre-Submission Verification (The Core Differentiator)

Masumi submits first, checks later. We verify first, submit only when correct.

```
Masumi flow:
  verify(envelope) → isValid ← envelope only, no CBOR parse
  settle(envelope) → submit to Blockfrost → poll for confirmation → check outputs

Our flow:
  verify(envelope) → parse CBOR → check 8 properties → isValid ← full verification
  settle(envelope) → re-verify → submit to Blockfrost → confirm
```

This prevents:
- Wasted blockchain submissions (fees paid for invalid transactions)
- Race conditions between verify and settle
- Post-hoc discovery of payment errors

### 4.2 Eight Verification Checks (Ordered Pipeline)

Our Phase 3 implements these checks in order:

| # | Check | What It Catches | Masumi Equivalent |
|---|-------|----------------|-------------------|
| 1 | `checkCborValid` | Malformed CBOR, corrupted bytes | base64 decode only |
| 2 | `checkScheme` | Wrong payment scheme | Envelope check |
| 3 | `checkNetwork` | Mainnet tx on preprod, vice versa | Envelope string only |
| 4 | `checkRecipient` | Payment to wrong address | Post-submit poll |
| 5 | `checkAmount` | Insufficient payment | Post-submit poll |
| 6 | `checkWitness` | Unsigned transactions | Not checked |
| 7 | `checkTtl` | Expired transactions | Not checked |
| 8 | `checkFee` | Absurd fees (potential attack) | Not checked |

All 8 checks run regardless of earlier failures, collecting all errors. The response includes the primary failure (first in order) plus the complete error list.

### 4.3 Production Infrastructure Masumi Lacks

| Capability | Masumi | Our Facilitator |
|-----------|--------|-----------------|
| Persistence | `SUBMITTED: dict[str, str] = {}` (in-memory, lost on restart) | Redis-backed with crash recovery |
| UTXO caching | None (direct Blockfrost per request) | L1 in-memory + L2 Redis + Blockfrost |
| UTXO reservation | None | TTL-based with concurrent limit |
| Rate limit handling | None | Exponential backoff with retry |
| Config validation | Manual env vars | Zod schema validation |
| Error handling | try/except pass | Typed domain errors + Sentry |
| Request tracing | `print()` statements | Structured logging with request IDs |
| Network safety | `NETWORK` env var | Mainnet guardrail (`MAINNET=true`) |
| Type safety | Python with no type checking | Strict TypeScript, 0 type errors |
| Test coverage | No tests | 91 tests, 81.36% coverage |

### 4.4 x402 V2 Wire Format

Masumi implements x402 V1. We implement V2 with:

- **CAIP-2 chain IDs:** `cardano:mainnet`, `cardano:preview`, `cardano:preprod` (not bare strings)
- **Payment-Signature header:** instead of `X-PAYMENT`
- **x402Version: 2** field
- **`extensions` bag** in VerifyResponse (not `extra`)

This positions us as the first V2-compliant Cardano facilitator.

---

## 5. Architectural Decisions (Locked)

All decisions below are locked as of 2026-02-06.

### 5.1 Transaction-Based Model (follow masumi pattern)

- Client builds + signs full Cardano transaction via CIP-30 `signTx()`
- Payload contains single `transaction` field (base64-encoded signed CBOR)
- Facilitator parses CBOR, verifies outputs, then submits
- NO `signData()`/CIP-8/COSE verification
- NO nonces, NO NonceStore
- UTXO model provides inherent replay protection

### 5.2 x402 V2 Wire Format

- CAIP-2 chain IDs, Payment-Signature header, x402Version: 2
- Adapt masumi's transaction-based approach to V2 envelope

### 5.3 Phase 3 Scope: Verification Only

- Parse CBOR, verify 8 checks, return isValid
- No transaction submission (Phase 4)
- No native token verification (Phase 5, ADA/lovelace only for now)
- No batching (Phase 6)

### 5.4 CBOR Parsing via CML (Lucid transitive dependency)

- `CML.Transaction.from_cbor_hex()` for deserialization
- No new dependencies needed (CML ships with @lucid-evolution/lucid)
- Address comparison via canonical CBOR hex (not bech32)
- Must free CML WASM objects after use

### 5.5 Error Collection (Not Fail-Fast)

- Run ALL 8 checks, collect ALL failures
- Primary failure = first in check order
- Response always HTTP 200 (isValid conveys result)
- Two-level CBOR errors: `invalid_base64` vs `invalid_cbor`

---

## 6. Code Architecture: How Our Verification Works

### 6.1 Integration Points in Our Codebase

```
src/
  verify/
    types.ts          ← Zod schemas, domain types (NEW)
    errors.ts         ← VerifyInvalidFormatError, VerifyInternalError (NEW)
    cbor.ts           ← deserializeTransaction() using CML (NEW)
    checks.ts         ← 8 check functions (NEW)
    verify-payment.ts ← orchestrator: run checks, collect errors (NEW)
    index.ts          ← barrel export (NEW)
  routes/
    verify.ts         ← POST /verify Fastify route (NEW)
  server.ts           ← register verify route (MODIFIED)
  config/
    schema.ts         ← add verification config section (MODIFIED)
```

### 6.2 How It Connects to Existing Architecture

```
POST /verify
  ↓
verify.ts route handler
  ↓ validates request body with VerifyRequestSchema (Zod)
  ↓ accesses fastify.config.chain for network config
  ↓ accesses fastify.chainProvider.getCurrentSlot() for TTL check
  ↓
verify-payment.ts orchestrator
  ↓ calls deserializeTransaction() (cbor.ts)
  ↓ runs VERIFICATION_CHECKS array (checks.ts)
  ↓ collects all check results
  ↓
Returns VerifyResponse { isValid, invalidReason?, errors?, extensions? }
```

### 6.3 Projected Verification Pipeline (Pseudocode)

```typescript
// src/verify/cbor.ts
interface DeserializedTx {
  body: CML.TransactionBody;
  witnesses: CML.TransactionWitnessSet;
  txHash: string;               // CML.hash_transaction()
  cborHex: string;              // preserved for re-encoding
}

function deserializeTransaction(base64Cbor: string): DeserializedTx {
  // Step 1: base64 → hex
  const hex = Buffer.from(base64Cbor, 'base64').toString('hex');

  // Step 2: CML parse (throws on invalid CBOR/CDDL)
  const tx = CML.Transaction.from_cbor_hex(hex);

  // Step 3: extract components
  const body = tx.body();
  const witnesses = tx.witness_set();
  const txHash = CML.hash_transaction(body).to_hex();

  return { body, witnesses, txHash, cborHex: hex };
}

// src/verify/checks.ts
type CheckFn = (ctx: VerifyContext) => CheckResult;

const VERIFICATION_CHECKS: CheckFn[] = [
  checkCborValid,    // Parse base64 CBOR via CML
  checkScheme,       // scheme === 'exact'
  checkNetwork,      // address network ID matches configured chain
  checkRecipient,    // output pays to required address (CBOR hex comparison)
  checkAmount,       // matching output has sufficient lovelace
  checkWitness,      // at least one VKey witness present
  checkTtl,          // TTL not expired (requires getCurrentSlot)
  checkFee,          // fee within bounds (150K-5M lovelace)
];

// src/verify/verify-payment.ts
async function verifyPayment(ctx: VerifyContext): Promise<VerifyResponse> {
  const errors: CheckError[] = [];

  for (const check of VERIFICATION_CHECKS) {
    const result = check(ctx);
    if (!result.ok) {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      invalidReason: errors[0].reason,  // primary = first failure
      errors,
    };
  }

  return {
    isValid: true,
    extensions: {
      txHash: ctx.parsedTx.txHash,      // computed transaction hash
    },
  };
}
```

### 6.4 Address Comparison: The Subtle Part

Cardano addresses can be represented multiple ways. Two bech32 strings can encode the same address. The only reliable comparison is canonical CBOR hex:

```typescript
function checkRecipient(ctx: VerifyContext): CheckResult {
  const requiredAddr = ctx.paymentRequirements.payTo;

  // Normalize required address to canonical CBOR hex
  const requiredCborHex = CML.Address.from_bech32(requiredAddr).to_cbor_hex();

  // Check each output
  const outputs = ctx.parsedTx.body.outputs();
  for (let i = 0; i < outputs.len(); i++) {
    const output = outputs.get(i);
    const outputCborHex = output.address().to_cbor_hex();

    if (outputCborHex === requiredCborHex) {
      ctx.matchingOutputIndex = i;  // Save for amount check
      return { ok: true };
    }
  }

  return {
    ok: false,
    error: { reason: 'recipient_mismatch', check: 'checkRecipient' },
  };
}
```

### 6.5 Network Check: Address-Level Verification

Cardano embeds the network ID in every address. This is more reliable than checking an envelope string:

```typescript
function checkNetwork(ctx: VerifyContext): CheckResult {
  const expectedNetworkId = CAIP2_TO_NETWORK_ID[ctx.chainId];
  // cardano:mainnet → 1, cardano:preview → 0, cardano:preprod → 0

  const outputs = ctx.parsedTx.body.outputs();
  for (let i = 0; i < outputs.len(); i++) {
    const addr = outputs.get(i).address();
    const addrNetworkId = addr.network_id();
    if (addrNetworkId !== expectedNetworkId) {
      return {
        ok: false,
        error: {
          reason: 'network_mismatch',
          check: 'checkNetwork',
          detail: `output[${i}] has network ${addrNetworkId}, expected ${expectedNetworkId}`,
        },
      };
    }
  }

  return { ok: true };
}
```

---

## 7. Masumi Gaps We Exploit

### 7.1 Gap: No CBOR Verification (Critical)

**Masumi:** `base64.b64decode(tx_b64)` — confirms it's valid base64, nothing more.

**Our approach:** Full CML deserialization catches:
- Truncated CBOR
- Invalid CDDL structure
- Unsupported era transactions
- Malformed output addresses

**Impact:** We reject invalid transactions before they hit Blockfrost's submission endpoint, saving API quota and preventing confusing error messages.

### 7.2 Gap: No Output Verification (Critical)

**Masumi:** Submits the transaction, then polls `GET /txs/{hash}/utxos` for up to 20 seconds to check if the right output exists.

```python
# This is masumi's ONLY payment correctness check — and it happens AFTER submission
def check_tx_output(tx_hash, pay_to, unit, min_amount, wait_seconds=20):
    deadline = time.time() + wait_seconds
    while time.time() < deadline:
        r = requests.get(f"{BF_BASE}/txs/{tx_hash}/utxos", ...)
        # ...poll loop...
```

**Our approach:** Parse CBOR outputs BEFORE submission. If the transaction doesn't pay the right address the right amount, reject immediately.

### 7.3 Gap: In-Memory State (Moderate)

**Masumi:** `SUBMITTED: dict[str, str] = {}` — a Python dict that vanishes on process restart.

```python
SUBMITTED: dict[str, str] = {}  # Lost on restart

if key in SUBMITTED:
    tx_hash = SUBMITTED[key]
    # ...but what if we restarted?
```

**Our approach:** Redis-backed persistence with crash recovery. UTXO reservations survive restarts.

### 7.4 Gap: No Request Tracing (Moderate)

**Masumi:** Uses `print()` statements wrapped in try/except:

```python
try:
    print("[/verify] body keys=", list((body or {}).keys()))
except Exception:
    pass
```

**Our approach:** Structured Pino logging with request IDs, log levels, production sanitization, and Sentry error capture.

### 7.5 Gap: API Key in Browser (Moderate)

**Masumi:** Passes the Blockfrost project ID to the browser for client-side transaction building:

```python
# resource_server/app.py
bf_key = os.environ.get("BLOCKFROST_PROJECT_ID", "")
resp = make_response(render_template("index.html", requirements=reqs, bf_key=bf_key), 402)
```

```html
<!-- Embedded in HTML, visible to anyone -->
<script>
  window.__BF_PROJECT_ID = {{ (bf_key or '') | tojson | safe }};
</script>
```

**Impact:** Anyone viewing the page source gets the Blockfrost API key. On the free tier this enables 50k requests/day against the resource owner's quota.

**Our approach:** The facilitator holds the Blockfrost key server-side. The client builds transactions using their own infrastructure (their own Blockfrost key, or a light wallet that handles UTXO queries internally).

### 7.6 Gap: Duplicate Exception Handlers (Minor)

Masumi has unreachable code due to duplicate exception handlers:

```python
# facilitator_server/app.py lines 191-205
try:
    base64.b64decode(tx_b64)
except Exception:                    # ← catches all exceptions
    return jsonify(...)
except Exception:                    # ← UNREACHABLE (duplicate except clause)
    return jsonify(...)
```

The second `except Exception` block can never execute. This is a bug.

### 7.7 Gap: No Rate Limiting or Backoff (Minor)

Masumi makes direct `requests.get/post` calls to Blockfrost with no retry logic:

```python
r = requests.post(url, headers=headers, data=raw_cbor, timeout=30)
```

**Our approach:** Exponential backoff (500ms → 1s → 2s), automatic retry on 429/5xx, rate limit error propagation.

---

## 8. Risk Register

### 8.1 Risks We Accept

| Risk | Severity | Mitigation |
|------|----------|------------|
| CML WASM memory leaks | Medium | `.free()` calls in finally blocks; documented in RESEARCH.md pitfalls |
| Payer address not in transaction | Low | Optional `payer` field in payload; transaction inputs don't reveal sender address directly |
| Conway-era transaction format differences | Low | CML handles all eras transparently |
| BigInt JSON serialization | Low | Convert to strings before JSON.stringify |

### 8.2 Risks Masumi Ignores That We Address

| Risk | Masumi Impact | Our Mitigation |
|------|---------------|----------------|
| Submit-then-discover wrong payment | Wasted blockchain submission, confused UX | Pre-submission output verification |
| Unsigned transaction submission | Blockfrost rejects, but verify returned true | Witness presence check |
| Expired transaction submission | Blockfrost rejects TTL-expired tx | TTL check against current slot |
| Absurd fee extraction | Could drain payer's ADA | Fee bounds check (150K-5M lovelace) |
| Process restart loses settlement state | `SUBMITTED` dict cleared, re-submission possible | Redis persistence |

### 8.3 Open Questions for Future Phases

| Question | Phase | Notes |
|----------|-------|-------|
| How does batching work with pre-signed transactions? | Phase 6 | May need collect-then-distribute or removal |
| Should we support V1 + V2 simultaneously? | Future | Currently V2-only |
| Stablecoin output verification (native tokens) | Phase 5 | Need to match policy ID + asset name + amount |
| Should we verify transaction inputs exist? | Phase 4 | Adds Blockfrost query but catches already-spent UTXOs |

---

## Appendix A: Masumi Code Statistics

| Component | Lines | Files |
|-----------|-------|-------|
| Facilitator server | 306 | 1 (Python) |
| Resource server (backend) | 538 | 1 (Python) |
| Resource server (frontend JS) | 980 | 1 (JavaScript) |
| Resource server (HTML) | 204 | 1 (Jinja2) |
| Resource server (CSS) | 30 | 1 |
| Configuration | 11 | 3 (.env.example, .gitignore, requirements.txt) |
| **Total** | **~2,069** | **8** |

Our facilitator (Phase 1-2 only, before verification): 1,829 src lines + 1,721 test lines across 20 source files.

## Appendix B: Masumi Endpoints Summary

| Endpoint | Method | Purpose | Auth | Response |
|----------|--------|---------|------|----------|
| `/verify` | POST | Validate x402 envelope | None | `{isValid, invalidReason}` |
| `/settle` | POST | Submit tx + return pending/success | None | `{success, transaction, errorReason, pending}` |
| `/supported` | GET | List supported payment kinds | None | `{kinds: [{x402Version, scheme, network}]}` |
| `/status` | POST | Check settlement status by tx hash | None | `{success, transaction, network, errorReason, pending}` |
| `/health` | GET | Health check | None | `{ok: true}` |

---

*Revised: 2026-02-06*
*Topics: masumi-network reference analysis, transaction-based verification, security gap analysis, Phase 3 architecture*
