# Phase 3: Verification - Research

**Researched:** 2026-02-06
**Domain:** x402 transaction-based verification, CBOR deserialization, Cardano transaction output verification
**Confidence:** HIGH

## Summary

Phase 3 implements the `/verify` endpoint that validates a pre-signed Cardano transaction against x402 payment requirements. The verification model has fundamentally changed from the previous CIP-8/CIP-30 message-signing approach to a **transaction-based model** following the masumi-network pattern: the client builds and signs a complete Cardano transaction using CIP-30 `signTx()`, encodes it as base64 CBOR, and sends it to the facilitator for verification and eventual submission.

The core technical challenge is CBOR transaction deserialization and output verification. CML (`@anastasia-labs/cardano-multiplatform-lib-nodejs`), already available as a re-export from `@lucid-evolution/lucid`, provides `CML.Transaction.from_cbor_hex()` for parsing signed transaction CBOR and full access to transaction body fields (inputs, outputs, fee, TTL, network_id). No additional dependencies are needed.

The UTXO model provides inherent replay protection -- each UTXO can only be spent once, so there is no need for nonces, NonceStore, or any separate replay tracking. This eliminates an entire subsystem from the old design. The verification pipeline checks: CBOR validity, scheme, network, recipient output, amount, and optionally TTL/fee/witness presence.

**Primary recommendation:** Use `CML.Transaction.from_cbor_hex()` (via `@lucid-evolution/lucid`) for CBOR deserialization. Parse transaction body outputs to verify correct recipient and amount. Use `Address.network_id()` from output addresses for network validation. No new dependencies needed.

<user_constraints>
## User Constraints (from CONTEXT.md and session decisions 2026-02-06)

### Locked Decisions

1. **Transaction-based verification model** -- follow masumi-network pattern
   - Client builds + signs full Cardano transaction via CIP-30 signTx()
   - Payload contains single `transaction` field (base64-encoded signed CBOR)
   - Facilitator parses CBOR, verifies outputs (recipient + amount), then submits
   - NO signData/CIP-8/COSE verification, NO nonces, NO NonceStore
   - UTXO model provides inherent replay protection (each UTXO spent once)

2. **x402 V2 wire format** -- keep V2 pin from PROJECT.md
   - CAIP-2 chain IDs, Payment-Signature header, x402Version: 2
   - Adapt masumi's transaction-based approach to V2 envelope

3. **Phase 6 batching deferred** -- figure it out when we get there
   - Transaction-based model is incompatible with naive batching
   - May need collect-then-distribute pattern or removal

4. **Phase 3 is verification only** -- does NOT submit the transaction
   - Settlement boundary with Phase 4 is clear: Phase 3 verifies, Phase 4 submits

### Claude's Discretion

- Whether to verify transaction inputs exist on-chain (adds Blockfrost call)
- Whether to check fee reasonableness
- Whether to verify payer has sufficient balance (inputs >= outputs + fee)
- How to handle multi-output transactions (reject? only check one output?)
- Whether to check validity interval (TTL) for the signed transaction
- Error granularity level for CBOR parsing failures
- Whether to attempt dry-run submission before actual submission

### Deferred Ideas (OUT OF SCOPE)

- Batching (Phase 6) -- transaction-based model may require redesign
- Actual transaction submission (Phase 4 settlement)
</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@lucid-evolution/lucid` | 0.4.29 | Re-exports CML for CBOR tx parsing, `getAddressDetails()`, `valueToAssets()`, `networkToId()` | Already installed; provides all Cardano primitives needed |
| CML (`@anastasia-labs/cardano-multiplatform-lib-nodejs`) | 6.0.2-3 | `Transaction.from_cbor_hex()`, `TransactionBody`, `TransactionOutput`, `Address`, `Value` | Transitive dep via lucid; the actual CBOR/WASM engine |
| `zod` | 4.3.6 | Request/response schema validation | Already installed; project standard |
| `fastify` | 5.7.4 | HTTP server, route registration | Already installed; project framework |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:buffer` | built-in | `Buffer.from(base64, 'base64').toString('hex')` for base64-to-hex conversion | Converting client's base64 CBOR to hex for CML |
| `ioredis` | 5.9.2 | Not needed for Phase 3 verification | Phase 3 does not add new Redis state; verification is stateless |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CML `Transaction.from_cbor_hex()` | `@harmoniclabs/cbor` (direct CBOR parsing) | CML handles Cardano-specific CBOR structure validation (CDDL compliance). Raw CBOR libraries parse bytes but don't understand Cardano transaction structure. |
| CML address comparison | Manual bech32 decode + byte comparison | CML `Address.from_bech32().to_bech32()` provides canonical form. Manual parsing is error-prone with Cardano's multiple address types. |
| Lucid `valueToAssets()` | Manual `Value.coin()` + `MultiAsset` iteration | `valueToAssets()` already handles the multiasset iteration pattern. For simple lovelace-only checks, `Value.coin()` is sufficient. |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
# CML is re-exported from @lucid-evolution/lucid as CML
# Lucid re-exports @lucid-evolution/utils (getAddressDetails, valueToAssets, networkToId)
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── verify/                    # Verification domain module
│   ├── index.ts               # Barrel exports
│   ├── types.ts               # Zod schemas, wire format types, VerifyContext
│   ├── checks.ts              # Individual verification check functions
│   ├── verify-payment.ts      # Verification orchestrator (runs checks, collects errors)
│   ├── cbor.ts                # CBOR deserialization + transaction parsing helpers
│   └── errors.ts              # VERIFY_* domain errors
├── routes/
│   ├── health.ts              # Existing
│   └── verify.ts              # POST /verify endpoint
```

Note: compared to the old design, there is NO `nonce-store.ts` and NO `GET /nonce` endpoint.

### Pattern 1: CBOR Transaction Deserialization

**What:** Parse a base64-encoded signed Cardano transaction into a structured object for verification.
**When to use:** The entry point of every verification request.
**Confidence:** HIGH -- verified from CML type definitions in `node_modules`.

```typescript
// Source: CML d.ts in node_modules/@anastasia-labs/cardano-multiplatform-lib-nodejs

import { CML } from '@lucid-evolution/lucid';

interface ParsedTransaction {
  body: CML.TransactionBody;
  witnessSet: CML.TransactionWitnessSet;
  isValid: boolean;
  raw: CML.Transaction;
}

function deserializeTransaction(base64Cbor: string): ParsedTransaction {
  // 1. Base64 -> hex
  const cborHex = Buffer.from(base64Cbor, 'base64').toString('hex');

  // 2. Parse CBOR hex -> CML.Transaction (throws on invalid CBOR)
  const tx = CML.Transaction.from_cbor_hex(cborHex);

  return {
    body: tx.body(),
    witnessSet: tx.witness_set(),
    isValid: tx.is_valid(),
    raw: tx,
  };
}
```

### Pattern 2: Output Verification

**What:** Check that a transaction output pays the correct recipient the correct amount.
**When to use:** Core verification check -- does the tx actually pay what's required?
**Confidence:** HIGH -- verified from CML type definitions.

```typescript
// Source: CML TransactionOutput, TransactionOutputList, Value, Address type definitions

function findMatchingOutput(
  outputs: CML.TransactionOutputList,
  recipientBech32: string,
  requiredLovelace: bigint
): { found: boolean; index: number; actualAmount: bigint } {
  const recipientAddr = CML.Address.from_bech32(recipientBech32);
  const recipientHex = recipientAddr.to_cbor_hex();

  for (let i = 0; i < outputs.len(); i++) {
    const output = outputs.get(i);
    const outputAddrHex = output.address().to_cbor_hex();

    if (outputAddrHex === recipientHex) {
      const coin = output.amount().coin();
      return { found: true, index: i, actualAmount: coin };
    }
  }

  return { found: false, index: -1, actualAmount: 0n };
}
```

### Pattern 3: Network Verification from Address

**What:** Extract the network ID from a transaction output address to verify it targets the correct Cardano network.
**When to use:** Network mismatch check.
**Confidence:** HIGH -- verified from CML Address.network_id() and TransactionBody.network_id().

```typescript
// Source: CML Address class, TransactionBody class

// Cardano network IDs:
// 0 = testnet (Preview, Preprod)
// 1 = mainnet

// Two sources for network ID:
// 1. TransactionBody.network_id() -- optional field, may not be set
// 2. Address.network_id() -- always available in Shelley-era addresses (bits 3-0 of header byte)

function getNetworkFromAddress(address: CML.Address): number {
  return address.network_id();  // 0 for testnet, 1 for mainnet
}

// Our CardanoNetwork -> expected network ID mapping
const NETWORK_IDS: Record<string, number> = {
  'Preview': 0,
  'Preprod': 0,
  'Mainnet': 1,
};
```

### Pattern 4: Verification Pipeline (Ordered Check Array)

**What:** Run all verification checks and collect all failures, not fail-fast.
**When to use:** The /verify endpoint.
**Confidence:** HIGH -- pattern carried forward from old research, still applies.

```typescript
interface CheckResult {
  check: string;
  passed: boolean;
  reason?: string;  // snake_case per x402 convention
}

type VerifyCheck = (ctx: VerifyContext) => CheckResult | Promise<CheckResult>;

// Checks run in this order:
const VERIFICATION_CHECKS: VerifyCheck[] = [
  checkCborValid,        // Can we parse the CBOR at all?
  checkScheme,           // Is scheme "exact"?
  checkNetwork,          // Do addresses target the right network?
  checkRecipient,        // Does an output pay to the required address?
  checkAmount,           // Does the output contain the required amount?
  checkWitness,          // Does the tx have at least one witness (it's signed)?
  checkTtl,              // Optional: is the TTL reasonable?
  checkFee,              // Optional: is the fee reasonable?
];

async function verifyPayment(ctx: VerifyContext): Promise<VerifyResponse> {
  const errors: CheckResult[] = [];

  for (const check of VERIFICATION_CHECKS) {
    const result = await check(ctx);
    if (!result.passed) {
      errors.push(result);
    }
  }

  if (errors.length === 0) {
    return { isValid: true, payer: ctx.payerAddress };
  }

  return {
    isValid: false,
    invalidReason: errors[0].reason,
    payer: ctx.payerAddress,
    extensions: { errors: errors.map(e => e.reason) },
  };
}
```

### Pattern 5: Fastify Route with Inline Zod Validation

**What:** Use Zod schemas for request validation within route handlers.
**When to use:** The /verify route.
**Confidence:** HIGH -- consistent with existing health.ts pattern.

```typescript
// Project does NOT use fastify-type-provider-zod -- validation is manual via Zod
// Consistent with existing health.ts and config/schema.ts patterns

import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

const verifyRoutes: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.post('/verify', async (request, reply) => {
    const parsed = VerifyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(200).send({
        isValid: false,
        invalidReason: 'invalid_request',
        extensions: { errors: parsed.error.issues.map(i => i.message) },
      });
    }
    const result = await verifyPayment(parsed.data, fastify);
    return reply.status(200).send(result);
  });

  done();
};

export const verifyRoutesPlugin = fp(verifyRoutes, {
  name: 'verify-routes',
  fastify: '5.x',
});
```

### Anti-Patterns to Avoid

- **Fail-fast verification:** Run ALL checks and report ALL failures. Do not return on first error.
- **HTTP error codes for verification failures:** Always return HTTP 200. `isValid: false` conveys the result. Only truly malformed HTTP (unparseable body, wrong content-type) warrants 400.
- **Installing separate CBOR libraries:** CML (via Lucid) already handles all Cardano CBOR. Do not add `cbor`, `cbor-x`, or `@harmoniclabs/cbor`.
- **Using verifyData() or signData():** These are CIP-8/CIP-30 message-signing functions. The transaction-based model does not use them.
- **Building a NonceStore:** UTXO model provides replay protection inherently. No nonces.
- **Submitting the transaction in Phase 3:** Verification only. Submission is Phase 4.
- **Attempting CML Transaction.from_cbor_bytes() with base64:** Must convert to hex first. CML expects hex strings, not raw bytes from base64.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CBOR transaction parsing | Custom CBOR decode | `CML.Transaction.from_cbor_hex()` | CML validates against Cardano CDDL spec, handles all eras (Alonzo/Babbage/Conway format outputs) |
| Address comparison | String comparison of bech32 | `CML.Address.from_bech32().to_cbor_hex()` and compare hex | Same address can have different bech32 representations; canonical CBOR hex is authoritative |
| Network ID extraction | Parse bech32 header byte manually | `CML.Address.network_id()` | Handles all address types (base, enterprise, pointer, reward) |
| Value decomposition | Manual CBOR multiasset parsing | `CML.Value.coin()` for lovelace, `valueToAssets()` for full decomposition | Handles all value representations including multiasset bundles |
| Base64 to hex conversion | Manual byte manipulation | `Buffer.from(b64, 'base64').toString('hex')` | Standard Node.js, no library needed |

**Key insight:** CML is a comprehensive Cardano serialization library that handles the full complexity of Cardano transaction formats across eras. It is already installed as a transitive dependency and re-exported from `@lucid-evolution/lucid`. There is zero reason to implement any Cardano-specific parsing manually.

## Discretion Recommendations

### 1. Verify transaction inputs exist on-chain?

**Recommendation: NO (defer to Phase 4 settlement)**

**Rationale:**
- Adds a Blockfrost API call per input UTXO (could be 5-20 calls for a multi-input tx)
- Inputs may have been spent between verification and settlement anyway
- The actual submission to the Cardano node will reject spent inputs atomically
- Phase 4 settlement is the correct place for on-chain state checks
- Keeps Phase 3 fast and stateless

### 2. Check fee reasonableness?

**Recommendation: YES, lightweight check only**

**Rationale:**
- The fee is already set in the signed transaction (cannot be changed)
- A fee of 0 or > 5 ADA is clearly wrong and worth catching early
- Simple bounds check: `fee >= 150_000n && fee <= 5_000_000n` (150K lovelace min fee, 5 ADA max reasonable)
- This is a sanity check, not a precise calculation
- Return `invalidReason: 'unreasonable_fee'` on failure

### 3. Verify payer has sufficient balance (inputs >= outputs + fee)?

**Recommendation: NO (defer to Phase 4)**

**Rationale:**
- Same issue as input existence -- requires Blockfrost calls, state may change
- The Cardano node performs this check during submission
- Transaction-based model means the payer already built the tx with their UTXOs
- If UTXOs are invalid, submission will fail with a clear error

### 4. How to handle multi-output transactions?

**Recommendation: Verify at least ONE output matches requirements. Ignore others.**

**Rationale:**
- Cardano transactions commonly have 2+ outputs (payment + change)
- The payer's change output will go back to their own address
- Only one output needs to match `payTo` + required amount
- Rejecting multi-output txs would break normal Cardano usage
- Iterate all outputs, find the one matching the recipient address, verify its value

### 5. Check validity interval (TTL)?

**Recommendation: YES, warn but do not reject**

**Rationale:**
- TTL is the absolute slot after which the transaction is invalid
- If TTL has already passed, the tx cannot be submitted (Cardano node rejects)
- We can check: `if (ttl !== undefined && currentSlot > ttl) -> expired`
- But getting `currentSlot` requires a Blockfrost call
- **Compromise:** Check TTL only if it's set in the transaction body. If expired, return `invalidReason: 'transaction_expired'`. If not set, skip (Cardano allows txs without TTL).
- This requires `getCurrentSlot()` which already exists on ChainProvider

### 6. Error granularity for CBOR parsing failures?

**Recommendation: Two-level granularity**

**Rationale:**
- Level 1 (base64 decode failure): `invalidReason: 'invalid_base64'`
- Level 2 (CBOR parse failure): `invalidReason: 'invalid_cbor'` with CML error message in extensions
- The CML error message from `from_cbor_hex()` is informative but potentially revealing -- include it in `extensions` for debugging but not in the top-level `invalidReason`

### 7. Dry-run submission before actual submission?

**Recommendation: NO**

**Rationale:**
- This is a Phase 4 concern (submission)
- Cardano nodes don't have a standard dry-run/simulation endpoint like EVM's `eth_call`
- The closest equivalent is Ogmios `evaluateTx`, which is not available through Blockfrost
- Phase 3 is verification only; Phase 4 handles submission mechanics

## Common Pitfalls

### Pitfall 1: Base64 vs Hex CBOR Encoding Mismatch

**What goes wrong:** CML's `Transaction.from_cbor_hex()` expects a hex string, but the client sends base64-encoded CBOR. Passing base64 directly to `from_cbor_hex()` produces a WASM panic or garbage data.
**Why it happens:** The masumi reference and x402 payload use base64 encoding for the transaction, but CML's API surface uses hex strings (matching CIP-30's convention of hex-encoded CBOR).
**How to avoid:** Always convert: `Buffer.from(base64Str, 'base64').toString('hex')` before calling CML.
**Warning signs:** `RuntimeError: unreachable` or `Error: invalid cbor` from WASM.

### Pitfall 2: Address Comparison Normalization

**What goes wrong:** Comparing bech32 address strings directly fails because the same address can have different bech32 representations (different HRP prefixes, different encodings of the same bytes).
**Why it happens:** Bech32 encoding allows variation. A mainnet address starts with `addr1`, testnet with `addr_test1`. Enterprise addresses have no staking part. Byron addresses use base58.
**How to avoid:** Parse both addresses with `CML.Address.from_bech32()`, convert to canonical form via `.to_cbor_hex()`, and compare the hex strings. Or compare the raw bytes via `.to_raw_bytes()`.
**Warning signs:** Valid transactions where recipient matches fail the recipient check.

### Pitfall 3: CML WASM Memory Management (free())

**What goes wrong:** CML objects are backed by WASM memory. If you create many CML objects in a loop without calling `.free()`, WASM memory grows unboundedly.
**Why it happens:** JavaScript garbage collection does not automatically free WASM memory. CML objects have a `free()` method that must be called when done.
**How to avoid:** Call `.free()` on CML objects when done, especially in loops iterating over outputs/inputs. Use try/finally to ensure cleanup on error paths. For verification (which processes a single tx), this is unlikely to be a practical issue -- but good practice.
**Warning signs:** WASM memory growing over time in long-running server.

### Pitfall 4: BigInt JSON Serialization in Verify Response

**What goes wrong:** `JSON.stringify()` throws `TypeError: Do not know how to serialize a BigInt` when the response includes lovelace amounts from CML (which are bigint).
**Why it happens:** CML's `Value.coin()`, `TransactionBody.fee()`, `TransactionBody.ttl()` all return `bigint`. Including these in the JSON response without conversion causes serialization failure.
**How to avoid:** Convert all BigInt values to strings before including in response JSON: `fee.toString()`, `amount.toString()`. Consistent with the existing `serializeWithBigInt` pattern from `utxo-cache.ts`.
**Warning signs:** `TypeError` during response serialization, 500 errors from the verify endpoint.

### Pitfall 5: Conway vs Alonzo Output Format

**What goes wrong:** CML `TransactionOutput` has two internal formats: `AlonzoFormatTxOut` (pre-Conway) and `ConwayFormatTxOut` (Conway era). Assuming one format and casting fails.
**Why it happens:** Cardano hard forks change the transaction output structure. Conway added inline datum and reference script support with a different CBOR encoding.
**How to avoid:** Use the high-level `TransactionOutput.address()` and `TransactionOutput.amount()` methods, which work regardless of era format. Do NOT call `as_alonzo_format_tx_out()` or `as_conway_format_tx_out()` unless you specifically need era-specific fields.
**Warning signs:** `undefined` returned from format-specific accessors.

### Pitfall 6: Transaction Without Witnesses

**What goes wrong:** A client could send a transaction with an empty witness set (unsigned). The CBOR is valid, outputs look correct, but the transaction would be rejected by the Cardano node because it lacks signatures.
**Why it happens:** CIP-30 `signTx()` adds witnesses, but a malicious client could construct unsigned CBOR.
**How to avoid:** Check that `tx.witness_set()` contains at least one VKey witness. This is a lightweight check that the transaction appears to be signed. Full cryptographic signature verification happens on-chain during submission.
**Warning signs:** Verification passes but settlement always fails with "missing required signatures".

### Pitfall 7: Payer Address Extraction

**What goes wrong:** Unlike CIP-8/CIP-30 signData which includes the signer's address in the COSE structure, a raw Cardano transaction CBOR does not contain an explicit "from" address. The inputs reference UTXOs by txHash#index, not by address.
**Why it happens:** Cardano's UTXO model doesn't have a "from" field. Inputs are UTXO references; the addresses come from the UTXOs being spent (which requires looking them up on-chain).
**How to avoid:** Two options:
  1. **Require payer address in the x402 payload envelope** (alongside the transaction). The client declares their address; verification checks it's consistent with the transaction.
  2. **Look up input UTXOs on-chain** to determine the payer address (expensive, Phase 4 concern).
  Recommendation: Option 1. Add a `payer` field to the payload schema. The verification response includes this `payer` field. The on-chain validation (input ownership) happens during Phase 4 settlement.
**Warning signs:** No payer address available for the VerifyResponse.

## Code Examples

### Complete CBOR Deserialization Pipeline

```typescript
// Source: CML type definitions verified in node_modules

import { CML } from '@lucid-evolution/lucid';

interface DeserializedTx {
  cborHex: string;
  body: {
    inputs: Array<{ txHash: string; index: bigint }>;
    outputs: Array<{ addressBech32: string; lovelace: bigint; hasMultiassets: boolean }>;
    fee: bigint;
    ttl: bigint | undefined;
    networkId: number | undefined;
  };
  hasWitnesses: boolean;
}

function deserializeTx(base64Cbor: string): DeserializedTx {
  const cborHex = Buffer.from(base64Cbor, 'base64').toString('hex');
  const tx = CML.Transaction.from_cbor_hex(cborHex);
  const body = tx.body();

  // Parse inputs
  const inputList = body.inputs();
  const inputs: DeserializedTx['body']['inputs'] = [];
  for (let i = 0; i < inputList.len(); i++) {
    const input = inputList.get(i);
    inputs.push({
      txHash: input.transaction_id().to_hex(),
      index: input.index(),
    });
  }

  // Parse outputs
  const outputList = body.outputs();
  const outputs: DeserializedTx['body']['outputs'] = [];
  for (let i = 0; i < outputList.len(); i++) {
    const output = outputList.get(i);
    // Extract multi-asset map for Phase 5 forward compatibility
    const assets: Record<string, bigint> = {};
    const multiAsset = output.amount().multi_asset();
    if (multiAsset) {
      // Iterate policies and asset names to build policyId+assetNameHex → quantity map
      // CML API: multiAsset.keys() → PolicyIdList, then multiAsset.get(policyId) → AssetNameMap
    }
    outputs.push({
      addressCborHex: output.address().to_cbor_hex(),
      addressBech32: output.address().to_bech32(),
      lovelace: output.amount().coin(),
      assets,
      networkId: output.address().network_id(),
    });
  }

  // Network ID from body (optional field) or from first output address
  let networkId: number | undefined = undefined;
  const bodyNetworkId = body.network_id();
  if (bodyNetworkId) {
    networkId = Number(bodyNetworkId.network());
  } else if (outputs.length > 0) {
    const firstOutputAddr = outputList.get(0).address();
    networkId = firstOutputAddr.network_id();
  }

  // Check for witnesses
  const witnessSet = tx.witness_set();
  // TransactionWitnessSet doesn't expose a simple "has vkeys" check
  // Use to_json() and check for vkeywitnesses field
  const witnessJson = JSON.parse(witnessSet.to_json());
  const hasWitnesses = Array.isArray(witnessJson.vkeywitnesses) && witnessJson.vkeywitnesses.length > 0;

  return {
    cborHex,
    body: { inputs, outputs, fee: body.fee(), ttl: body.ttl(), networkId },
    hasWitnesses,
  };
}
```

### x402 V2 Verify Request/Response Schemas

```typescript
// Source: x402 coinbase/x402 types (facilitator.ts, payments.ts)
// Adapted for Cardano transaction-based model with V2 wire format

import { z } from 'zod';

// CAIP-2 network format: "cardano:preview", "cardano:preprod", "cardano:mainnet"
const Caip2NetworkSchema = z.string().regex(/^[a-z0-9]+:[a-z0-9]+$/);

// PaymentRequirements from resource server
const PaymentRequirementsSchema = z.object({
  scheme: z.literal('exact'),
  network: Caip2NetworkSchema,
  asset: z.string(),              // "lovelace" or policyId+assetName hex
  maxAmountRequired: z.string(),  // uint as string (bigint-safe), named per x402 spec
  payTo: z.string(),              // bech32 Cardano address
  maxTimeoutSeconds: z.number().int().positive(),
  extra: z.record(z.unknown()).optional(),
});

// Cardano-specific payload (transaction-based)
const CardanoPayloadSchema = z.object({
  transaction: z.string().min(1),  // base64-encoded signed CBOR
  payer: z.string().optional(),    // bech32 address of payer (declared by client)
});

// x402 V2 PaymentPayload
const PaymentPayloadSchema = z.object({
  x402Version: z.literal(2),
  resource: z.object({
    url: z.string(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
  }).optional(),
  accepted: PaymentRequirementsSchema,
  payload: CardanoPayloadSchema,
  extensions: z.record(z.unknown()).optional(),
});

// POST /verify request body
const VerifyRequestSchema = z.object({
  paymentPayload: PaymentPayloadSchema,
  paymentRequirements: PaymentRequirementsSchema,
});

// POST /verify response body
// isValid: boolean -- always HTTP 200
// payer: bech32 address of the payer (if determinable)
// invalidReason: snake_case string (first/primary failure)
// invalidMessage: human-readable message (optional)
// extensions: { errors: string[], expected?: {}, actual?: {} }
```

### Verify Response Construction

```typescript
// Source: x402 V2 VerifyResponse spec

// Success response:
{
  isValid: true,
  payer: "addr_test1qz...",
  extensions: {
    scheme: "exact",
    maxAmountRequired: "2000000",
    payTo: "addr_test1qx...",
    txHash: "abc123..."   // hash of the verified transaction
  }
}

// Failure response (single error):
{
  isValid: false,
  invalidReason: "recipient_mismatch",
  payer: "addr_test1qz...",
  extensions: {
    errors: ["recipient_mismatch"],
    expected: { payTo: "addr_test1qx..." },
    actual: { payTo: "addr_test1qy..." }
  }
}

// Failure response (multiple errors):
{
  isValid: false,
  invalidReason: "invalid_cbor",           // Primary (first failure in check order)
  invalidMessage: "Failed to parse transaction CBOR",
  extensions: {
    errors: ["invalid_cbor", "network_mismatch"]
  }
}
```

### CAIP-2 Network Mapping

```typescript
// Cardano CAIP-2 chain IDs for x402 V2
// Format: "cardano:{network_name}"

const CAIP2_TO_CONFIG: Record<string, { network: CardanoNetwork; networkId: number }> = {
  'cardano:preview':  { network: 'Preview',  networkId: 0 },
  'cardano:preprod':  { network: 'Preprod',  networkId: 0 },
  'cardano:mainnet':  { network: 'Mainnet',  networkId: 1 },
};

const CONFIG_TO_CAIP2: Record<CardanoNetwork, string> = {
  'Preview':  'cardano:preview',
  'Preprod':  'cardano:preprod',
  'Mainnet':  'cardano:mainnet',
};
```

## State of the Art

| Old Approach (invalidated) | Current Approach | When Changed | Impact |
|---------------------------|------------------|--------------|--------|
| CIP-8/CIP-30 `signData()` message signing | CIP-30 `signTx()` full transaction signing | Phase 3 replan 2026-02-06 | No COSE parsing, no `verifyData()`, no separate crypto |
| Nonce-based replay protection | UTXO-based replay protection (inherent) | Phase 3 replan 2026-02-06 | No NonceStore, no GET /nonce, no Redis state for nonces |
| Facilitator-generated nonce + signed payload | Client-built full transaction | Phase 3 replan 2026-02-06 | Client bears all tx construction complexity; facilitator only verifies |
| `@lucid-evolution/sign_data` `verifyData()` | `CML.Transaction.from_cbor_hex()` + output inspection | Phase 3 replan 2026-02-06 | Different Lucid submodule, same dependency tree |
| V1: `X-PAYMENT` header | V2: `Payment-Signature` header | x402 V2 (2025) | Using V2 exclusively; no V1 support needed |
| `@emurgo/cardano-message-signing-nodejs` | Not needed | Phase 3 replan 2026-02-06 | Was a transitive dep for COSE parsing; no longer relevant |

**Deprecated/obsoleted for Phase 3:**
- `verifyData()` from `@lucid-evolution/sign_data` -- not used in transaction-based model
- `signData()` -- client uses `signTx()` instead
- NonceStore concept -- UTXO model provides replay protection
- Canonical signed payload format (`x402-cardano|{nonce}|{amount}|...`) -- not needed; transaction body IS the signed payload

## Open Questions

1. **Exact CAIP-2 chain ID format for Cardano**
   - What we know: x402 V2 uses CAIP-2 chain IDs. EVM uses `eip155:{chainId}`. Cardano has CIP-34 which defines `cip34:NetworkId-NetworkMagic`. Masumi used plain strings: `"cardano"`, `"cardano-mainnet"`.
   - What's unclear: Whether the ecosystem will standardize on `cardano:preview` (human-readable) or `cip34:0-2` (technical CIP-34 format) or something else.
   - Recommendation: Use `cardano:preview`, `cardano:preprod`, `cardano:mainnet` for now. These are intuitive, match our `CardanoNetwork` type, and can be mapped to CIP-34 format later if needed. The CAIP-2 format requires `namespace:reference` -- `cardano` is the namespace. **Confidence: MEDIUM** -- this is an emerging convention, not yet standardized.

2. **Asset identification in PaymentRequirements**
   - What we know: EVM uses contract addresses for asset identification. Cardano uses `policyId + assetName` (hex concatenated) for native tokens, and the keyword `"lovelace"` for ADA.
   - What's unclear: How the `asset` field in PaymentRequirements should represent Cardano native tokens. Options: `"lovelace"` for ADA, `"{policyId}{assetNameHex}"` for tokens (matches Lucid/Blockfrost convention).
   - Recommendation: Use `"lovelace"` for ADA payments. For native tokens (Phase 5 stablecoins), use `"{policyId}{assetNameHex}"` (the Lucid `Unit` format). This is consistent with how the existing codebase handles asset identifiers. **Confidence: HIGH** for lovelace, **MEDIUM** for native tokens (Phase 5 concern).

3. **Witness presence vs witness validity**
   - What we know: We can check that the witness set contains VKey witnesses (the tx appears signed). We cannot efficiently verify the Ed25519 signatures in the witness set without reimplementing Cardano node logic.
   - What's unclear: Whether checking witness presence is sufficient, or if we need to verify signatures.
   - Recommendation: **Check witness presence only.** The Cardano node performs full signature verification during submission (Phase 4). Our value-add is output/amount verification, not signature verification. Checking that witnesses exist catches the trivial attack of sending unsigned CBOR. **Confidence: HIGH** -- this aligns with masumi's approach (they don't verify signatures either) and is pragmatically correct.

4. **x402 `extensions` vs `extra` naming**
   - What we know: The old CONTEXT.md used `extra`. The x402 V2 TypeScript types use `extensions` (in `PaymentPayload`) and `extra` (in `PaymentRequirements`). The `VerifyResponse` type has `extensions?: Record<string, unknown>`.
   - Recommendation: Use `extensions` in VerifyResponse (matching x402 V2 types). Use `extra` only in PaymentRequirements (matching the spec). **Confidence: HIGH** -- this matches the official x402 V2 type definitions.

5. **Transaction hash for tracking**
   - What we know: CML provides `hash_transaction(tx_body)` which returns the Cardano transaction hash. This is useful for tracking the tx through settlement.
   - Recommendation: Compute and return `txHash` in the verify response `extensions` on success. Phase 4 settlement can use this hash to track submission. **Confidence: HIGH** -- `hash_transaction()` is a simple, pure function.

## Sources

### Primary (HIGH confidence)
- CML type definitions: `node_modules/@anastasia-labs/cardano-multiplatform-lib-nodejs@6.0.2-3/cardano_multiplatform_lib.d.ts` -- Transaction, TransactionBody, TransactionOutput, TransactionOutputList, Value, Address, NetworkId classes verified with exact method signatures
- `@lucid-evolution/lucid` v0.4.29 re-exports: `index.d.ts` confirms `export { CML }` from `@anastasia-labs/cardano-multiplatform-lib-nodejs`, plus `export * from '@lucid-evolution/utils'` (getAddressDetails, valueToAssets, networkToId, addressFromHexOrBech32)
- `@lucid-evolution/core-types` v0.1.22: `AddressDetails` type (networkId, address.bech32, address.hex, paymentCredential), `Transaction = string` (hex CBOR)
- `@lucid-evolution/utils` v0.1.66: `getAddressDetails()`, `addressFromHexOrBech32()`, `valueToAssets()`, `networkToId()` confirmed in dist/index.d.ts
- Existing codebase: `src/chain/provider.ts` (ChainProvider.getCurrentSlot, getBalance), `src/routes/health.ts` (route plugin pattern), `src/errors/index.ts` (error creation pattern), `src/config/schema.ts` (Zod schema pattern), `src/types/index.ts` (Fastify augmentation pattern)

### Secondary (MEDIUM confidence)
- x402 V2 type definitions: [coinbase/x402 TypeScript types](https://github.com/coinbase/x402/tree/main/typescript/packages/core/src/types) -- VerifyRequest, VerifyResponse, PaymentPayload, PaymentRequirements shapes confirmed via WebFetch of `facilitator.ts` and `payments.ts`
- x402 V2 EVM exact scheme spec: [scheme_exact_evm.md](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md) -- verification check order, settlement model, trust properties confirmed via WebFetch
- x402 V2 Zod schemas: [coinbase/x402 schemas/index.ts](https://github.com/coinbase/x402/tree/main/typescript/packages/core/src/schemas) -- CAIP-2 network format validation pattern confirmed
- masumi-network/x402-cardano analysis: [.auditing/claude-masumi-plan.md](/.auditing/claude-masumi-plan.md) -- transaction-based model, payload structure, /verify minimal checks, gap analysis documented
- [Introducing x402 V2](https://www.x402.org/writing/x402-v2-launch) -- V2 protocol changes, Payment-Signature header, CAIP-2 adoption
- [Cardano x402 integration announcements](https://www.dlnews.com/articles/defi/cardano-ada-founder-charles-hoskinson-praises-x402-integration/) -- Masumi Network implementing x402 on Cardano, October 2025

### Tertiary (LOW confidence)
- CAIP-2 Cardano chain ID format -- not yet standardized for x402. `cardano:preview` is our best guess based on CAIP-2 `namespace:reference` pattern. CIP-34 defines `cip34:0-2` format but this hasn't been adopted by x402 ecosystem.
- Cardano network ID in transaction body -- the `TransactionBody.network_id()` field is optional per CDDL spec. Not all transactions include it. Address-based network detection is more reliable.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries verified in node_modules. CML API confirmed from type definitions.
- Architecture: HIGH -- Patterns adapted from existing codebase (health.ts, provider.ts) and x402 V2 reference types.
- CBOR deserialization: HIGH -- CML `Transaction.from_cbor_hex()` verified, method signatures confirmed, output/value/address accessors documented.
- Network identification: HIGH -- `Address.network_id()` confirmed, network ID values (0=testnet, 1=mainnet) verified.
- x402 V2 wire format: MEDIUM -- Types confirmed from GitHub source, but Cardano-specific adaptations (CAIP-2 chain ID, asset format) are not yet standardized.
- Pitfalls: HIGH -- Based on CML type definitions, known WASM/BigInt issues from Phase 2 experience, and Cardano transaction structure knowledge.

**Research date:** 2026-02-06
**Valid until:** 2026-03-08 (30 days -- stack is stable, x402 V2 spec is recent but evolving for Cardano)

## Appendix: Spike Test Script

Run this script with `pnpm tsx spike-cbor-deser.ts` BEFORE executing plans. It validates that CML transaction parsing works in our runtime and documents the exact API surface.

```typescript
// spike-cbor-deser.ts -- run with: pnpm tsx spike-cbor-deser.ts
// Purpose: validate CML Transaction.from_cbor_hex() works, document parameter formats
//
// Prerequisites:
//   - pnpm install (CML available via lucid)
//
// Expected output: transaction structure, output addresses/amounts, witness presence

import { CML } from '@lucid-evolution/lucid';

async function spike() {
  console.log('=== Spike: CML Transaction Deserialization ===\n');

  // 1. Test that CML is importable and functional
  console.log('CML imported successfully');
  console.log('CML.Transaction available:', typeof CML.Transaction);

  // 2. Create a minimal test transaction (unsigned) to verify parsing
  //    In production, this would come from the client's base64 payload
  //    For spike, build a minimal tx using CML directly
  const inputList = CML.TransactionInputList.new();
  const txHash = CML.TransactionHash.from_hex('0'.repeat(64));
  inputList.add(CML.TransactionInput.new(txHash, 0n));

  const outputList = CML.TransactionOutputList.new();
  // Use a testnet address
  const testAddr = CML.Address.from_bech32(
    'addr_test1qzrqkfm3v2kp74ewtxyynvj3jz9nm56q6htdyaak52tq9cjlj0ry3ayndhfqpjqt0vp8uf4rr2s5rxyahg80mklf8cq0pfxg7'
  );
  const testValue = CML.Value.from_coin(2_000_000n);
  outputList.add(CML.TransactionOutput.new(testAddr, testValue));

  const txBody = CML.TransactionBody.new(inputList, outputList, 200_000n);
  const witnessSet = CML.TransactionWitnessSet.from_json('{}');
  const tx = CML.Transaction.new(txBody, witnessSet, true);

  // 3. Serialize to CBOR hex and then to base64
  const cborHex = tx.to_cbor_hex();
  const base64 = Buffer.from(cborHex, 'hex').toString('base64');
  console.log('\nCBOR hex length:', cborHex.length);
  console.log('Base64 length:', base64.length);

  // 4. Deserialize back (simulating what the facilitator does)
  const reconvertedHex = Buffer.from(base64, 'base64').toString('hex');
  console.log('Round-trip hex match:', reconvertedHex === cborHex);

  const parsedTx = CML.Transaction.from_cbor_hex(reconvertedHex);
  const parsedBody = parsedTx.body();

  // 5. Extract and display transaction body fields
  console.log('\n--- Transaction Body ---');
  console.log('Inputs count:', parsedBody.inputs().len());
  console.log('Outputs count:', parsedBody.outputs().len());
  console.log('Fee:', parsedBody.fee().toString());
  console.log('TTL:', parsedBody.ttl()?.toString() ?? 'not set');
  console.log('Network ID:', parsedBody.network_id()?.network()?.toString() ?? 'not set');

  // 6. Extract output details
  const outputs = parsedBody.outputs();
  for (let i = 0; i < outputs.len(); i++) {
    const output = outputs.get(i);
    console.log(`\n--- Output ${i} ---`);
    console.log('Address (bech32):', output.address().to_bech32());
    console.log('Address network ID:', output.address().network_id());
    console.log('Lovelace:', output.amount().coin().toString());
    console.log('Has multiassets:', output.amount().has_multiassets());
  }

  // 7. Check witness set
  const ws = parsedTx.witness_set();
  const wsJson = JSON.parse(ws.to_json());
  console.log('\n--- Witness Set ---');
  console.log('Witness JSON keys:', Object.keys(wsJson));
  console.log('Has VKey witnesses:', Array.isArray(wsJson.vkeywitnesses) && wsJson.vkeywitnesses.length > 0);

  // 8. Compute transaction hash
  const txHashResult = CML.hash_transaction(parsedBody);
  console.log('\nTransaction hash:', txHashResult.to_hex());

  console.log('\n=== Spike complete ===');
}

spike().catch(console.error);
```
