# Phase 3: Verification - Research

**Researched:** 2026-02-05
**Domain:** x402 payment verification, CIP-8/CIP-30 Cardano signatures, replay protection, nonce tracking
**Confidence:** HIGH

## Summary

Phase 3 implements the `/verify` endpoint that validates Cardano payment signatures against x402 protocol requirements. The core challenge is bridging the x402 verification contract (designed for EVM chains using EIP-712/ERC-3009 signatures) to Cardano's CIP-8/CIP-30 message signing standard (based on COSE_Sign1/Ed25519).

Lucid Evolution already ships with `verifyData()` from `@lucid-evolution/sign_data` (re-exported from `@lucid-evolution/lucid`), which performs CIP-8/CIP-30 COSE_Sign1 signature verification using `@emurgo/cardano-message-signing-nodejs` and `@anastasia-labs/cardano-multiplatform-lib-nodejs`. This is our primary verification primitive -- no additional crypto libraries needed.

The nonce store follows the same two-layer (Map + Redis) pattern already established in Phase 2 for UTXO reservations and caching. The verification pipeline runs all checks (scheme, network, recipient, time window, balance, amount, signature) and collects all failures before returning, matching the user decision for complete error reporting.

**Primary recommendation:** Use Lucid Evolution's built-in `verifyData()` for CIP-8/CIP-30 signature verification. Build the nonce store as a new module following the Phase 2 `UtxoReservation` pattern (Map + Redis, TTL expiry, lazy cleanup). Structure the verification pipeline as an ordered array of check functions that accumulate errors.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@lucid-evolution/lucid` | 0.4.29 | `verifyData()` for CIP-8/CIP-30 signature verification | Already installed; wraps @emurgo/cardano-message-signing for COSE_Sign1 Ed25519 verification |
| `@lucid-evolution/sign_data` | 0.1.25 | Underlying sign/verify module (transitive dep) | Provides `signData()` for testing and `verifyData()` for production verification |
| `ioredis` | 5.9.2 | Redis backend for nonce store (L2) | Already installed; consistent with Phase 2 cache/reservation patterns |
| `zod` | 4.3.6 | Request/response schema validation | Already installed; project standard for all config and payload validation |
| `fastify` | 5.7.4 | HTTP server, route registration | Already installed; project framework |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@emurgo/cardano-message-signing-nodejs` | 1.1.0 | COSE_Sign1 parsing (transitive via sign_data) | Already available as transitive dep; used internally by verifyData |
| `@anastasia-labs/cardano-multiplatform-lib-nodejs` | 6.0.2-3 | Ed25519 public key/signature operations (transitive) | Already available; used internally by verifyData |
| `node:crypto` | built-in | `randomUUID()` for nonce random component | Already used in server.ts for request IDs |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Lucid `verifyData()` | `@cardano-foundation/cardano-verify-datasignature` | Cardano Foundation's library is lightweight but 3+ years stale (v1.0.11, Dec 2022), adds separate dependency tree (@stricahq/cbors, @stricahq/cip08, @stricahq/typhonjs). Lucid already installed and maintained. |
| Lucid `verifyData()` | Manual COSE_Sign1 + Ed25519 | Hand-rolling CBOR/COSE parsing is error-prone. Lucid's implementation already handles algorithm ID checks, curve validation, key type verification, address binding. |
| Map + Redis nonce store | Pure Redis (no in-memory) | Redis-only adds latency on every nonce check in the hot path. Two-layer is consistent with Phase 2 patterns. |
| Structured nonce format | HMAC-signed nonces | CONTEXT.md explicitly chose store-backed integrity over HMAC. Store lookup is simpler, no extra secret key management. |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
# Lucid Evolution re-exports verifyData from @lucid-evolution/sign_data
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── verify/                    # Verification domain module
│   ├── index.ts               # Barrel exports
│   ├── types.ts               # Verification types, Zod schemas, x402 wire format types
│   ├── nonce-store.ts         # NonceStore class (Map + Redis, TTL, structured format)
│   ├── checks.ts              # Individual verification check functions
│   ├── verify-payment.ts      # Verification orchestrator (runs all checks, collects errors)
│   └── errors.ts              # VERIFY_* domain errors
├── routes/
│   ├── health.ts              # Existing
│   └── verify.ts              # POST /verify endpoint + GET /nonce endpoint
```

### Pattern 1: Verification Pipeline (Ordered Check Array)

**What:** Run all verification checks and collect all failures, not fail-fast.
**When to use:** The `/verify` endpoint needs to report ALL issues so clients can debug effectively.
**Example:**

```typescript
// Source: x402-rs-main/crates/chains/x402-chain-eip155/src/v2_eip155_exact/facilitator.rs
// Adapted for TypeScript with multi-error collection per CONTEXT.md decisions

interface CheckResult {
  check: string;
  passed: boolean;
  reason?: string;  // snake_case per x402 convention
}

type VerifyCheck = (ctx: VerifyContext) => Promise<CheckResult>;

// Checks run in this order (matches EVM reference):
const VERIFICATION_CHECKS: VerifyCheck[] = [
  checkScheme,           // Is scheme "exact"?
  checkNetwork,          // Does chain ID match?
  checkRecipient,        // Does payTo match?
  checkTimeWindow,       // Is payment within validity window?
  checkBalance,          // Does payer have sufficient funds? (discretion item)
  checkAmount,           // Does amount match requirement?
  checkSignature,        // Is CIP-8/CIP-30 signature valid?
  checkNonce,            // Is nonce valid and unused?
];

async function verifyPayment(ctx: VerifyContext): Promise<VerifyResult> {
  const errors: CheckResult[] = [];
  let payer: string | undefined;

  for (const check of VERIFICATION_CHECKS) {
    const result = await check(ctx);
    if (!result.passed) {
      errors.push(result);
    }
  }

  if (errors.length === 0) {
    return {
      isValid: true,
      payer: ctx.payerAddress,
      extra: { scheme: ctx.scheme, amount: ctx.amount, address: ctx.recipientAddress },
    };
  }

  return {
    isValid: false,
    invalidReason: errors[0].reason,  // Primary failure
    payer: ctx.payerAddress,
    extra: { errors: errors.map(e => e.reason) },
  };
}
```

### Pattern 2: Nonce Store (Two-Layer with Structured Format)

**What:** Nonce generation, validation, and consumption following Phase 2's Map + Redis pattern.
**When to use:** Every verification request must consume a nonce exactly once.
**Example:**

```typescript
// Nonce format: structured with timestamp + random (per CONTEXT.md)
// Example: "1706745600000-a1b2c3d4e5f6"
// This enables server-side expiry check without HMAC

const NONCE_KEY_PREFIX = 'nonce:';

class NonceStore {
  private readonly issued = new Map<string, NonceEntry>();
  private readonly redis: Redis;
  private readonly ttlMs: number;
  private readonly logger: FastifyBaseLogger;

  generate(): string {
    this.cleanExpired();
    const timestamp = Date.now();
    const random = randomUUID().replace(/-/g, '').slice(0, 16);
    const nonce = `${timestamp}-${random}`;
    const entry: NonceEntry = { nonce, issuedAt: timestamp, expiresAt: timestamp + this.ttlMs, used: false };
    this.issued.set(nonce, entry);
    // Fire-and-forget Redis persistence
    this.redis.set(`${NONCE_KEY_PREFIX}${nonce}`, JSON.stringify(entry), 'PX', this.ttlMs).catch(() => {});
    return nonce;
  }

  consume(nonce: string): { valid: boolean; reason?: string } {
    this.cleanExpired();

    // Parse timestamp from structured format for quick expiry check
    const dashIdx = nonce.indexOf('-');
    if (dashIdx === -1) return { valid: false, reason: 'nonce_invalid_format' };
    const ts = Number(nonce.slice(0, dashIdx));
    if (Number.isNaN(ts) || Date.now() - ts > this.ttlMs) {
      return { valid: false, reason: 'nonce_expired' };
    }

    const entry = this.issued.get(nonce);
    if (!entry) return { valid: false, reason: 'nonce_unknown' };
    if (entry.used) return { valid: false, reason: 'nonce_already_used' };

    entry.used = true;
    this.issued.delete(nonce);
    // Fire-and-forget Redis deletion (consumed = removed)
    this.redis.del(`${NONCE_KEY_PREFIX}${nonce}`).catch(() => {});
    return { valid: true };
  }
}
```

### Pattern 3: x402 Wire Format Compliance

**What:** Match the exact x402 spec verify request/response shapes, extend via `extra` bag.
**When to use:** All /verify endpoint interactions.

```typescript
// Wire format from x402-rs reference: v1.rs VerifyResponseWire
// Our Cardano extension adds `extra` per CONTEXT.md

// Request (POST /verify body):
interface VerifyRequest {
  x402Version: 2;
  paymentPayload: {
    accepted: PaymentRequirements;
    payload: CardanoPayload;      // CIP-8/CIP-30 signed message
    resource?: ResourceInfo;
    x402Version: 2;
  };
  paymentRequirements: PaymentRequirements;
}

// Response:
interface VerifyResponse {
  isValid: boolean;
  payer?: string;               // Cardano address (bech32)
  invalidReason?: string;       // snake_case: "invalid_signature", "amount_mismatch", etc.
  extra?: {                     // Cardano-specific extension
    scheme?: string;
    amount?: string;
    address?: string;
    errors?: string[];          // All failure reasons when multiple
    expected?: Record<string, unknown>;  // Debug: expected vs actual on failure
    actual?: Record<string, unknown>;
  };
}

// CardanoPayload (what the client signs and sends):
interface CardanoPayload {
  signature: string;   // COSE_Sign1 hex (from CIP-30 signData)
  key: string;         // COSE_Key hex (from CIP-30 signData)
  nonce: string;       // Facilitator-issued nonce
}
```

### Pattern 4: Fastify Route with Inline Zod Validation

**What:** Use Zod schemas for request validation within route handlers (consistent with existing project pattern -- no type-provider plugin).
**When to use:** The /verify and /nonce routes.

```typescript
// Project does NOT use fastify-type-provider-zod -- validation is manual via Zod
// Consistent with existing health.ts and config/schema.ts patterns

const verifyRoutes: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.post('/verify', async (request, reply) => {
    const parsed = VerifyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(200).send({
        isValid: false,
        invalidReason: 'invalid_format',
        extra: { errors: parsed.error.issues.map(i => i.message) },
      });
    }
    // ... verification logic
  });

  fastify.get('/nonce', async (_request, reply) => {
    const nonce = fastify.nonceStore.generate();
    return reply.send({ nonce });
  });

  done();
};
```

### Anti-Patterns to Avoid

- **Fail-fast verification:** CONTEXT.md explicitly requires running all checks and reporting all failures. Do not return on first error.
- **HTTP error codes for verification failures:** CONTEXT.md specifies always HTTP 200, with `isValid: false` conveying the result. Only malformed requests (completely unparseable) might warrant 400.
- **HMAC-based nonce validation:** CONTEXT.md chose store-backed integrity. Do not add HMAC signing.
- **Separate crypto library:** Do not install `@cardano-foundation/cardano-verify-datasignature` when Lucid Evolution's `verifyData()` is already available and maintained.
- **Synchronous nonce generation in verify:** The nonce should be pre-generated (via GET /nonce or 402 response) and consumed during verification, not generated on-the-fly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CIP-8/CIP-30 signature verification | Custom COSE_Sign1 parser + Ed25519 verify | `verifyData()` from `@lucid-evolution/sign_data` | Handles algorithm ID validation, curve type check, key type check, address binding, COSE structure parsing. ~80 lines of verified code. |
| COSE_Sign1 CBOR parsing | Manual CBOR decode | `@emurgo/cardano-message-signing-nodejs` (transitive) | COSE is complex CBOR with protected/unprotected headers, payload, and signature layers |
| Ed25519 signature math | `tweetnacl` or manual | `@anastasia-labs/cardano-multiplatform-lib-nodejs` (transitive) | CML's `PublicKey.verify()` handles the actual Ed25519 verification |
| Base64 JSON decode (header) | Custom parser | `Buffer.from(header, 'base64')` + `JSON.parse()` | Standard Node.js, no library needed |
| Nonce uniqueness | UUID only | Structured `timestamp-random` format | Enables server-side expiry check from nonce string without store lookup |

**Key insight:** The CIP-8/CIP-30 verification stack is already fully available through Lucid Evolution's transitive dependencies. The `verifyData()` function performs 7 distinct checks (address match, key hash match, algorithm ID match, curve type, key type, payload match, cryptographic signature verification). Hand-rolling any of this is unnecessary and risky.

## Common Pitfalls

### Pitfall 1: COSE_Sign1 Address vs Cardano Address Format Mismatch

**What goes wrong:** `verifyData()` expects `addressHex` (raw hex of the address bytes from the COSE_Sign1 protected header), but the payment requirements contain a bech32 address (e.g., `addr_test1qz...`). If you pass the bech32 string directly, verification will always fail.
**Why it happens:** CIP-30 `signData()` embeds the raw address bytes in the COSE_Sign1 protected header. The verifier must compare against the same raw hex representation.
**How to avoid:** Use Lucid/CML utilities to convert bech32 addresses to hex for comparison. `CML.Address.from_bech32(addr).to_hex()` or Lucid's address utilities.
**Warning signs:** All signature verifications return false even with valid signatures.

### Pitfall 2: KeyHash Derivation for verifyData()

**What goes wrong:** `verifyData(addressHex, keyHash, payload, signedMessage)` requires a `keyHash` parameter. This is the blake2b-224 hash of the public key, NOT the public key itself. If you pass the wrong value, verification fails silently (returns false).
**Why it happens:** Cardano uses blake2b-224 hashes of public keys as key credentials in addresses. The `verifyData` function checks that the public key from the COSE_Key matches this hash.
**How to avoid:** Extract the public key from the COSE_Key, hash it with blake2b-224, and pass the resulting hex as `keyHash`. Alternatively, derive it from the payer's address credential.
**Warning signs:** `verifyData` returns false but no exception is thrown.

### Pitfall 3: Nonce Race Condition in Concurrent Requests

**What goes wrong:** Two requests with the same nonce arrive nearly simultaneously. Both check in-memory Map, both see nonce as unused, both mark it as used.
**Why it happens:** JavaScript is single-threaded for CPU but async I/O creates interleaving. The check-then-mark is not atomic.
**How to avoid:** Since Node.js is single-threaded, in-memory Map operations are synchronous and effectively atomic within a single `consume()` call. The nonce is deleted from Map immediately on consumption. This is safe for single-process deployments. For multi-process, Redis `DEL` returns 1 only for the first caller (atomic).
**Warning signs:** Replay attacks succeeding in multi-process deployment without Redis atomic check.

### Pitfall 4: BigInt Serialization in Verify Response

**What goes wrong:** JSON.stringify silently drops BigInt values or throws `TypeError: Do not know how to serialize a BigInt`.
**Why it happens:** Cardano lovelace amounts are BigInt (project decision from Phase 2). If verification results include amounts, they need serialization.
**How to avoid:** Use the existing `serializeWithBigInt` from `utxo-cache.ts`, or convert BigInt to string before including in response JSON.
**Warning signs:** `TypeError` in response serialization, or missing amount fields in responses.

### Pitfall 5: Emurgo WASM Module Loading (Node vs Browser)

**What goes wrong:** `@emurgo/cardano-message-signing-nodejs` is the Node.js WASM binding. If ESM resolution picks up the browser variant, it crashes at startup.
**Why it happens:** The `@lucid-evolution/sign_data` package has conditional imports for nodejs vs browser. ESM bundlers might resolve incorrectly.
**How to avoid:** Ensure the `-nodejs` variant is resolved. The existing Phase 2 libsodium ESM fix (pnpm override) provides the pattern. If issues arise, add a similar override. Test that `import { verifyData } from '@lucid-evolution/lucid'` works in the test environment.
**Warning signs:** `WASM module not found` or `Cannot use import statement outside a module` errors at test/startup time.

### Pitfall 6: Validity Window Clock Skew

**What goes wrong:** Server clock differs from client clock, causing valid payments to be rejected as expired or future.
**Why it happens:** CONTEXT.md specifies a 30-second grace buffer, but if the server clock is more than 30 seconds off, this doesn't help.
**How to avoid:** The 30-second grace buffer (configurable) should handle normal network/processing delays. For clock skew, use NTP-synced servers. Log the current time alongside the validity window in failed verification debug output so operators can diagnose.
**Warning signs:** Intermittent "expired" rejections that work on retry.

## Code Examples

### CIP-8/CIP-30 Signature Verification with Lucid Evolution

```typescript
// Source: node_modules/@lucid-evolution/sign_data/dist/index.js (verified in codebase)
// The verifyData function performs these checks:
// 1. Parse COSE_Sign1 from signature hex
// 2. Extract address from protected headers
// 3. Verify address matches expected addressHex
// 4. Verify keyHash matches blake2b-224(publicKey)
// 5. Check algorithm IDs match (EdDSA)
// 6. Check curve is Ed25519 (type 6)
// 7. Check key type is OKP (type 1)
// 8. Check payload matches expected payload hex
// 9. Verify Ed25519 signature over signed data

import { verifyData } from '@lucid-evolution/lucid';

function verifyCip30Signature(
  addressHex: string,
  keyHash: string,
  payloadHex: string,
  signedMessage: { signature: string; key: string }
): boolean {
  return verifyData(addressHex, keyHash, payloadHex, signedMessage);
}
```

### Nonce Generation (Structured Format)

```typescript
// Per CONTEXT.md: structured nonce with timestamp + random
// Format: "{unix_ms}-{random_hex_16}"
// Enables server-side expiry check from nonce string itself

import { randomUUID } from 'node:crypto';

function generateNonce(): string {
  const timestamp = Date.now();
  const random = randomUUID().replace(/-/g, '').slice(0, 16);
  return `${timestamp}-${random}`;
}

function isNonceExpired(nonce: string, ttlMs: number): boolean {
  const dashIdx = nonce.indexOf('-');
  if (dashIdx === -1) return true;
  const ts = Number(nonce.slice(0, dashIdx));
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > ttlMs;
}
```

### Verify Response Construction

```typescript
// Source: x402-rs-main/crates/x402-types/src/proto/v1.rs (VerifyResponseWire)
// Our extension adds `extra` per CONTEXT.md

// Success response:
{
  isValid: true,
  payer: "addr_test1qz...",
  extra: {
    scheme: "exact",
    amount: "2000000",
    address: "addr_test1qx..."
  }
}

// Failure response (single error):
{
  isValid: false,
  payer: "addr_test1qz...",
  invalidReason: "invalid_signature",
  extra: {
    errors: ["invalid_signature"]
  }
}

// Failure response (multiple errors):
{
  isValid: false,
  invalidReason: "amount_mismatch",    // Primary (first failure in check order)
  extra: {
    errors: ["amount_mismatch", "nonce_already_used"],
    expected: { amount: "2000000" },
    actual: { amount: "1000000" }
  }
}
```

### Fastify Route Registration Pattern

```typescript
// Source: existing src/routes/health.ts pattern in codebase

import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

const verifyRoutes: FastifyPluginCallback = (fastify, _options, done) => {
  // POST /verify - validate payment signature
  fastify.post<{ Body: unknown }>('/verify', async (request, reply) => {
    const parsed = VerifyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(200).send({
        isValid: false,
        invalidReason: 'invalid_format',
        extra: { errors: parsed.error.issues.map(i => i.message) },
      });
    }
    const result = await verifyPayment(parsed.data, fastify);
    fastify.log.info(
      { payer: result.payer, isValid: result.isValid, reason: result.invalidReason },
      'Verification result'
    );
    return reply.status(200).send(result);
  });

  // GET /nonce - issue a fresh nonce
  fastify.get('/nonce', async (_request, reply) => {
    const nonce = fastify.nonceStore.generate();
    return reply.send({ nonce });
  });

  done();
};

export const verifyRoutesPlugin = fp(verifyRoutes, {
  name: 'verify-routes',
  fastify: '5.x',
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| V1: `X-PAYMENT` header | V2: `Payment-Signature` header | x402 V2 (2025) | Our facilitator should accept both for compat; CONTEXT.md says accept Base64 header AND JSON body |
| `@cardano-foundation/cardano-verify-datasignature` | `@lucid-evolution/sign_data` `verifyData()` | Lucid Evolution matured 2024-2025 | No new dependency needed; integrated into our existing Lucid installation |
| CIP-30 `signData()` single format | CIP-8/CIP-30 unified | CIP-8 refined 2023-2024 | Hardware wallets may have limitations; our facilitator verifies server-side regardless of signing source |

**Deprecated/outdated:**
- `lucid-cardano` (original Lucid by SpaceBudz): Superseded by `@lucid-evolution/lucid` by Anastasia Labs. We already use the evolution version.
- `@cardano-foundation/cardano-verify-datasignature` v1.0.11: Last published Dec 2022, depends on older Stricahq libraries. Still functional but unmaintained.

## Open Questions

1. **Cardano CAIP-2 chain ID for x402**
   - What we know: x402 V2 uses CAIP-2 chain IDs (e.g., `eip155:8453`). Cardano has CIP-34 which defines a chain ID registry with format `cip34:NetworkId-NetworkMagic`. The masumi-network x402-cardano implementation exists but its exact chain ID format was not fully extracted.
   - What's unclear: The exact CAIP-2 string for Cardano Preview/Preprod/Mainnet in the x402 ecosystem. Is it `cardano:preview`, `cip34:0-2`, or something else?
   - Recommendation: Use `cardano:preview`, `cardano:preprod`, `cardano:mainnet` as human-readable chain IDs for now (matching our existing `CardanoNetwork` type). This can be refined when the x402 Cardano chain adapter spec stabilizes. The chain ID is validated but not used for cryptographic binding (unlike EVM chain ID in EIP-712 domain).

2. **Balance check at verify time (Claude's Discretion)**
   - What we know: EVM facilitators check balance during verification (`assert_enough_balance`). The `ChainProvider.getBalance(address)` method already exists in our codebase.
   - What's unclear: Whether checking balance adds value when settlement re-verifies independently (CONTEXT.md: "Stateless: no verification token passed to /settle -- settlement re-verifies independently").
   - Recommendation: **Check balance during verification.** It provides early feedback to clients ("insufficient_funds" before attempting settlement), costs only a cached UTXO lookup, and matches the EVM reference implementation order. The small overhead is worth the UX improvement.

3. **Malformed request handling (Claude's Discretion)**
   - What we know: CONTEXT.md says "Always HTTP 200 -- isValid: true/false conveys the verification result."
   - What's unclear: What about completely unparseable requests (not JSON, missing required fields)?
   - Recommendation: Return HTTP 200 with `{ isValid: false, invalidReason: "invalid_format" }` for all verification failures including parse failures. Only return HTTP 400 for truly malformed HTTP (e.g., Content-Type not application/json, body too large). This is more lenient but consistent with the "always 200" principle.

4. **Future payment handling (Claude's Discretion)**
   - What we know: EVM has `validAfter` and `validBefore` timestamps. `assert_time()` in the reference rejects if `validAfter > now`.
   - Recommendation: **Reject payments with validAfter > now** (matching EVM reference). Future-dated authorizations could be a replay vector. Return `invalidReason: "payment_not_yet_valid"`.

5. **Timeout mismatch behavior (Claude's Discretion)**
   - What we know: The client may sign with a different `maxTimeoutSeconds` than what the server advertised.
   - Recommendation: **Reject if client's maxTimeoutSeconds differs from requirements.** This prevents clients from extending validity windows beyond what the server intends. Return `invalidReason: "timeout_mismatch"`.

6. **Strict vs lenient parsing of unknown fields (Claude's Discretion)**
   - Recommendation: **Lenient.** Use Zod's `.passthrough()` for the outer request schema so unknown fields in `extra` or payload extensions don't cause validation failures. This matches x402's extensibility philosophy and the `extra` bag pattern.

7. **Error reason naming convention (Claude's Discretion)**
   - Recommendation: **Use x402 snake_case style** (e.g., `invalid_signature`, `amount_mismatch`, `insufficient_funds`). This matches the `ErrorReason` enum in `x402-rs-main/crates/x402-types/src/proto/mod.rs` which uses `#[serde(rename_all = "snake_case")]`. Add Cardano-specific reasons with descriptive names: `nonce_already_used`, `nonce_expired`, `nonce_unknown`, `payment_not_yet_valid`, `timeout_mismatch`.

8. **Multi-error primary reason selection logic (Claude's Discretion)**
   - Recommendation: **First failure in check order is primary.** Since checks run in a defined order (scheme -> network -> recipient -> time -> balance -> amount -> signature -> nonce), the first failure is the most fundamental issue. E.g., if both scheme and signature fail, "unsupported_scheme" is more useful as the primary reason than "invalid_signature".

## Sources

### Primary (HIGH confidence)
- `@lucid-evolution/sign_data` v0.1.25 source code -- verified `verifyData()` function signature and implementation in `node_modules/.pnpm/@lucid-evolution+sign_data@0.1.25/node_modules/@lucid-evolution/sign_data/dist/index.js`
- `@lucid-evolution/core-types` v0.1.22 -- verified `SignedMessage = { signature: string; key: string }` type definition
- x402-rs reference implementation (local at `x402-rs-main/`) -- verified VerifyRequest, VerifyResponse wire formats, verification order, error reasons, handler architecture
- Existing codebase (`src/chain/`, `src/server.ts`, `src/routes/health.ts`) -- verified patterns for modules, factories, route plugins, error handling, BigInt serialization, two-layer caching

### Secondary (MEDIUM confidence)
- [Cardano Foundation cardano-verify-datasignature](https://github.com/cardano-foundation/cardano-verify-datasignature) -- npm registry confirms v1.0.11, Dec 2022, dependencies on @stricahq/* libraries
- [CIP-8 Message Signing Specification](https://cips.cardano.org/cip/CIP-8) -- COSE_Sign1 structure, algorithm requirements
- [CIP-30 dApp-Wallet Web Bridge](https://cips.cardano.org/cip/CIP-30) -- signData() API, return format
- [CIP-34 Chain ID Registry](https://cips.cardano.org/cip/CIP-34) -- Cardano network identification, CAIP-2 compatibility
- [x402 V2 Protocol](https://www.x402.org/writing/x402-v2-launch) -- Payment-Signature header, protocol modernization
- [masumi-network/x402-cardano](https://github.com/masumi-network/x402-cardano) -- Existing x402 Cardano implementation using Lucid + Blockfrost
- [x402 Cardano Developer Portal](https://developers.cardano.org/docs/build/integrate/payments/x402-standard/) -- Official Cardano x402 documentation (in development)
- [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod) -- Considered but not recommended; project uses inline Zod validation

### Tertiary (LOW confidence)
- [masumi-network/x402-cardano-examples](https://github.com/masumi-network/x402-cardano-examples) -- Demo of CIP-30 wallet + Lucid + Blockfrost for x402 on Cardano; uses X-PAYMENT header and transaction-based (not message-signing) approach
- CAIP-2 Cardano chain ID format -- exact format not fully confirmed from sources; CIP-34 defines the registry approach but the specific CAIP-2 strings for Cardano networks need validation against actual ecosystem usage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and verified in node_modules. `verifyData()` source code read and understood.
- Architecture: HIGH - Patterns directly derived from x402-rs reference implementation and existing Phase 2 codebase patterns.
- Pitfalls: HIGH - Verified against actual `verifyData()` source code. Address format and keyHash derivation pitfalls confirmed by reading the implementation.
- Wire format: HIGH - x402 VerifyRequest/VerifyResponse shapes confirmed from multiple x402-rs source files.
- Cardano chain ID: LOW - CAIP-2 format for Cardano not definitively confirmed.

**Research date:** 2026-02-05
**Valid until:** 2026-03-07 (30 days -- stack is stable, x402 V2 spec is recent)
