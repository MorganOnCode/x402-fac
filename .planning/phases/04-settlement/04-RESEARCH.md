# Phase 4: Settlement - Research

**Researched:** 2026-02-06
**Domain:** Cardano transaction submission and on-chain confirmation via Blockfrost
**Confidence:** HIGH

## Summary

Phase 4 submits client-signed Cardano transactions to the blockchain and monitors for confirmation. The facilitator does NOT construct or sign transactions -- it re-verifies (defense-in-depth), submits raw CBOR to Blockfrost, polls for on-chain confirmation, and returns the result. Two new HTTP endpoints are needed: POST /settle (submit + wait) and POST /status (lightweight polling).

The standard stack is already in place. The `@blockfrost/blockfrost-js` library (v6.1.0, already installed) provides `txSubmit()` and `txs()` methods on the `BlockFrostAPI` class. No new dependencies are required. SHA-256 hashing for idempotency uses Node.js built-in `node:crypto`. Redis (ioredis, already installed) provides dedup persistence.

**Primary recommendation:** Extend `BlockfrostClient` with two new methods wrapping `this.api.txSubmit()` and `this.api.txs()`, create a `src/settle/` service module mirroring the `src/verify/` pattern, and add two new route plugins following the exact patterns from `src/routes/verify.ts`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Settlement flow**: Synchronous POST /settle blocks until on-chain confirmation or timeout
- **Re-verify before submit**: Call `verifyPayment()` again as defense-in-depth
- **Submit via Blockfrost**: POST raw CBOR to `/tx/submit` via new `submitTransaction()` on BlockfrostClient
- **Poll every 5 seconds** after submission for tx confirmation
- **1 confirmation** (tx appears in a block) = success -- no multi-block depth
- **120-second timeout** -- return failure with reason `confirmation_timeout`
- **POST /settle** endpoint: accepts `{transaction: string, paymentRequirements: {...}}`
  - Success (200): `{success: true, transaction: "<txHash>", network: "cardano:preprod"}`
  - Failure (200): `{success: false, reason: "<snake_case_reason>"}`
  - Timeout (200): `{success: false, reason: "confirmation_timeout", transaction: "<txHash>"}`
  - Always HTTP 200 (consistent with /verify pattern)
- **POST /status** endpoint: lightweight confirmation check
  - Accepts `{transaction: string, paymentRequirements: {...}}`
  - Returns `{status: "confirmed" | "pending" | "not_found", transaction: "<txHash>"}`
  - HTTP 200 always
- **Idempotency**: CBOR SHA-256 hash as dedup key in Redis: `settle:<sha256hex>`
  - Value: `{txHash, status, submittedAt, confirmedAt?}` with 24-hour TTL
  - On duplicate: skip submit, check current status
- **BlockfrostClient extension**: Add `submitTransaction(cborBytes: Uint8Array)` and `getTransaction(txHash: string)`
  - Reuse existing `withRetry` for transient failures
  - Do NOT retry on 400 (invalid transaction) -- fail immediately
- **Facilitator wallet**: Not needed for Phase 4
- **Response contract**: Success responses include `transaction` (tx hash) and `network` (CAIP-2 chain ID) for X-PAYMENT-RESPONSE header construction

### Claude's Discretion

- Internal settle service module structure
- Zod schema naming conventions (consistent with Phase 3 patterns)
- Exact Redis key serialization format
- Poll backoff strategy (fixed 5s vs exponential -- fixed preferred for predictability)
- Error categorization for non-timeout failures (e.g., `invalid_transaction`, `submission_rejected`)

### Deferred Ideas (OUT OF SCOPE)

- HTTP 202 async pattern (decided sync for now)
- Batch settlement (Phase 6)
- Facilitator-signed transactions (Phase 6+)
- Webhook notifications for settlement status
</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@blockfrost/blockfrost-js` | 6.1.0 | Cardano API: tx submission + confirmation | Already installed; `BlockFrostAPI.txSubmit()` and `BlockFrostAPI.txs()` are the canonical methods |
| `ioredis` | 5.x | Redis for idempotency dedup records | Already installed; same client used for UTXO cache and reservations |
| `node:crypto` | built-in | SHA-256 hashing for CBOR dedup key | Node.js built-in, zero dependencies, `createHash('sha256')` |
| `zod` | 4.x | Request/response schema validation | Already installed; consistent with Phase 3 pattern |
| `fastify-plugin` | 5.x | Route plugin registration | Already installed; consistent with verify route pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@lucid-evolution/lucid` (CML) | 0.4.29 | CBOR parsing in re-verification | Indirectly via `verifyPayment()` -- no direct usage in settle module |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:crypto` SHA-256 | `@noble/hashes` | Unnecessary dep; node:crypto is fine for server-side |
| Fixed 5s poll interval | Exponential backoff | Fixed is simpler, predictable; 24 polls in 120s is reasonable |

**Installation:** No new packages needed. All dependencies are already in `package.json`.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── settle/
│   ├── types.ts           # SettleRequest, SettleResponse, StatusRequest, StatusResponse Zod schemas
│   ├── settle-payment.ts  # settlePayment() orchestrator (verify -> dedup -> submit -> poll)
│   └── index.ts           # Barrel exports
├── routes/
│   ├── settle.ts          # POST /settle route plugin
│   └── status.ts          # POST /status route plugin
├── chain/
│   └── blockfrost-client.ts  # Extended with submitTransaction() + getTransaction()
└── ...existing files...
```

### Pattern 1: Service Orchestrator (mirrors verifyPayment)

**What:** A `settlePayment()` function that orchestrates the full settle flow: verify -> dedup check -> submit -> poll -> return result.

**When to use:** Called by the /settle route handler after request validation.

**Example:**

```typescript
// src/settle/settle-payment.ts
import { createHash } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';

import type { BlockfrostClient } from '../chain/blockfrost-client.js';
import { verifyPayment } from '../verify/verify-payment.js';
import type { VerifyContext } from '../verify/types.js';
import type { SettleResult, SettlementRecord } from './types.js';

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 120_000;
const DEDUP_TTL_SECONDS = 86_400; // 24 hours

export async function settlePayment(
  ctx: VerifyContext,
  cborBytes: Uint8Array,
  blockfrost: BlockfrostClient,
  redis: Redis,
  network: string,  // CAIP-2 chain ID
  logger: FastifyBaseLogger,
): Promise<SettleResult> {
  // 1. Re-verify
  const verifyResult = await verifyPayment(ctx, logger);
  if (!verifyResult.isValid) {
    return { success: false, reason: verifyResult.invalidReason ?? 'verification_failed' };
  }

  // 2. Idempotency check
  const dedupKey = `settle:${createHash('sha256').update(cborBytes).digest('hex')}`;
  const existing = await redis.get(dedupKey);
  if (existing) {
    // ... check current status of existing submission
  }

  // 3. Submit to Blockfrost
  const txHash = await blockfrost.submitTransaction(cborBytes);

  // 4. Record submission in Redis
  // 5. Poll for confirmation
  // 6. Return result
}
```

### Pattern 2: BlockfrostClient Extension (consistent with existing methods)

**What:** Two new methods on `BlockfrostClient` delegating to the underlying `BlockFrostAPI`.

**When to use:** All Blockfrost calls go through this wrapper for retry, error mapping, and logging.

**Example:**

```typescript
// Added to src/chain/blockfrost-client.ts

/** Submit a signed transaction to Blockfrost. */
async submitTransaction(cborBytes: Uint8Array): Promise<string> {
  return withRetry(
    () => this.api.txSubmit(cborBytes),
    'submitTransaction',
    this.log,
  );
}

/** Fetch transaction details. Returns null if tx not found (404). */
async getTransaction(txHash: string): Promise<TxInfo | null> {
  try {
    return await withRetry(
      () => this.api.txs(txHash),
      'getTransaction',
      this.log,
    );
  } catch (error) {
    if (error instanceof BlockfrostServerError && error.status_code === 404) {
      return null;
    }
    throw error;
  }
}
```

### Pattern 3: Route Plugin (mirrors verify.ts exactly)

**What:** Fastify route plugin using `fastify-plugin` wrapper, Zod validation, HTTP 200 always.

**When to use:** All Phase 4 routes follow this pattern.

**Example:**

```typescript
// src/routes/settle.ts
import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import { SettleRequestSchema } from '../settle/types.js';

const settleRoutes: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.post('/settle', async (request, reply) => {
    const parsed = SettleRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(200).send({
        success: false,
        reason: 'invalid_request',
      });
    }
    // ... assemble context, call settlePayment(), return result
  });
  done();
};

export const settleRoutesPlugin = fp(settleRoutes, {
  name: 'settle-routes',
  fastify: '5.x',
});
```

### Pattern 4: Confirmation Polling Loop

**What:** After submission, poll Blockfrost GET /txs/{hash} every 5 seconds until confirmed or timeout.

**When to use:** Inside `settlePayment()` after successful `submitTransaction()`.

**Example:**

```typescript
async function pollConfirmation(
  txHash: string,
  blockfrost: BlockfrostClient,
  timeoutMs: number,
  intervalMs: number,
  logger: FastifyBaseLogger,
): Promise<{ confirmed: boolean; blockHeight?: number }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const txInfo = await blockfrost.getTransaction(txHash);
    if (txInfo !== null) {
      // tx found in a block = confirmed
      return { confirmed: true, blockHeight: txInfo.block_height };
    }
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return { confirmed: false };
}
```

### Anti-Patterns to Avoid

- **Constructing transactions in the facilitator:** The client builds and signs the full tx. The facilitator NEVER modifies the CBOR.
- **Retrying 400 errors on submit:** A 400 from Blockfrost means the transaction is structurally invalid or already-spent UTXOs. Retrying won't help.
- **Using in-memory dict for dedup (like Masumi):** Must use Redis for crash recovery. Masumi uses a Python dict which is lost on restart.
- **Blocking the event loop during polling:** Use `setTimeout`-based async sleep, not busy-wait. The 5-second interval between polls naturally yields to the event loop.
- **Mixing HTTP status codes:** Stay consistent with the /verify pattern -- always HTTP 200 with application-level success/failure.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transaction submission | Custom HTTP POST to Blockfrost | `this.api.txSubmit(cborBytes)` | Library handles Content-Type: application/cbor, byte conversion, error mapping |
| Transaction query | Custom GET request | `this.api.txs(txHash)` | Library handles typed response, error handling |
| SHA-256 hashing | npm hash package | `createHash('sha256')` from `node:crypto` | Built into Node.js, zero dependencies |
| BigInt JSON serialization | Custom serializer | Reuse `serializeWithBigInt` from `utxo-cache.ts` | Already exists, tested pattern |
| Retry logic | Custom retry wrapper | Existing `withRetry()` from `blockfrost-client.ts` | Already handles all retry scenarios |

**Key insight:** All the infrastructure is already in place. Phase 4 is primarily about orchestration -- wiring existing components (BlockfrostClient, verifyPayment, Redis, withRetry) into a new flow. Almost zero new infrastructure to build.

## Common Pitfalls

### Pitfall 1: withRetry Retries 400 Errors on Submission

**What goes wrong:** If `withRetry` wraps the submit call, it might retry a 400 (invalid transaction), which will never succeed and wastes 3 retry cycles.

**Why it happens:** The existing `isRetryableError()` correctly returns false for 400, so `withRetry` will throw immediately. However, this means the error propagates as a raw `BlockfrostServerError` -- the settle orchestrator must catch it and map to a user-friendly reason.

**How to avoid:** Catch `BlockfrostServerError` with `status_code === 400` in `submitTransaction()` or in the orchestrator and map to `reason: "invalid_transaction"`. The existing `withRetry` already handles this correctly -- 400 is NOT in RETRYABLE_STATUS_CODES.

**Warning signs:** Tests should verify that a 400 from submit results in exactly 1 call (no retries) and a clear error reason.

### Pitfall 2: Mempool Full (425) Not Handled

**What goes wrong:** Blockfrost returns 425 when the Cardano mempool is full. This is not in the current `RETRYABLE_STATUS_CODES` set (429, 500, 502, 503, 504).

**Why it happens:** 425 is a Blockfrost-specific status code for Cardano mempool congestion. It's a transient condition that should be retried.

**How to avoid:** Add 425 to `RETRYABLE_STATUS_CODES` in `blockfrost-client.ts`. This is a legitimate transient failure that benefits from retry with backoff.

**Warning signs:** If 425 is not retryable, mempool congestion will cause immediate settlement failures during busy network periods.

### Pitfall 3: Duplicate Submission Race Condition

**What goes wrong:** Two concurrent /settle requests with the same CBOR arrive. Both pass the dedup check (Redis GET returns null for both), and both submit to Blockfrost.

**Why it happens:** Classic TOCTOU (time-of-check-time-of-use) between the Redis GET and the Blockfrost submit.

**How to avoid:** Use Redis `SET NX` (set-if-not-exists) for the dedup key BEFORE submitting. If SET NX returns false, another request is handling it. The window is small (milliseconds), and Blockfrost handles true double-submission gracefully (returns the same tx hash), so this is defense-in-depth rather than a critical mutex.

**Warning signs:** Two settlement records for the same transaction in Redis with slightly different timestamps.

### Pitfall 4: CBOR Bytes vs Base64 String Confusion

**What goes wrong:** The request payload contains base64-encoded CBOR (`transaction: string`), but `txSubmit` needs `Uint8Array` bytes. Converting incorrectly produces garbled submission.

**Why it happens:** The verify flow works with base64 strings, but submission needs raw bytes.

**How to avoid:** Convert explicitly in the route handler: `Buffer.from(transaction, 'base64')` produces the `Uint8Array` for `submitTransaction()`. Document this conversion clearly.

**Warning signs:** Blockfrost returns 400 with "CBOR deserialization error" message.

### Pitfall 5: Poll Loop Blocks Other Requests

**What goes wrong:** The synchronous poll loop (up to 120s) ties up a Fastify handler. Under load, many concurrent settles could exhaust connection limits.

**Why it happens:** Each /settle request holds a connection for up to 120 seconds during polling.

**How to avoid:** This is an accepted tradeoff per the locked decision (synchronous POST /settle). The async 202 pattern was explicitly deferred. For production under heavy load, the 120s timeout and the fixed number of concurrent Fastify connections provide natural backpressure. No immediate mitigation needed -- document the limitation for future Phase 4.1 if needed.

**Warning signs:** Fastify connection pool exhaustion under load testing. Monitor with `/health` endpoint and Fastify connection metrics.

### Pitfall 6: Redis TTL Mismatch With Poll Timeout

**What goes wrong:** If the dedup record TTL is too short, a record could expire during an active poll loop, causing a duplicate submission if a second request arrives.

**Why it happens:** Using a short TTL (e.g., matching the 120s poll timeout) means the record disappears before confirmation is recorded.

**How to avoid:** Use 24-hour TTL (86,400 seconds) per the locked decision. This is far longer than any poll timeout, so the record persists through the entire settle lifecycle and serves as a settlement audit log.

**Warning signs:** None likely with 24h TTL, but test that the TTL is set correctly.

### Pitfall 7: facilitator.seedPhrase/privateKey Validation

**What goes wrong:** The current ChainConfigSchema requires at least one of `seedPhrase` or `privateKey` via a `.refine()`. Phase 4 does NOT need a facilitator wallet, but config validation still requires it.

**Why it happens:** The refine rule was written before the transaction-based model was adopted.

**How to avoid:** Make the facilitator refinement conditional or remove it entirely. Since Phase 4 does not use the facilitator wallet, the config should be valid without either field. However, changing this affects existing config files -- assess whether to change it now or defer to Phase 6.

**Warning signs:** Tests fail with "Either seedPhrase or privateKey must be provided" when using a minimal config without facilitator credentials.

## Code Examples

### BlockfrostClient.submitTransaction()

```typescript
// Source: @blockfrost/blockfrost-js txs/index.js (verified in node_modules)
// The underlying API accepts Uint8Array | string (hex)
// Our wrapper standardizes on Uint8Array

async submitTransaction(cborBytes: Uint8Array): Promise<string> {
  return withRetry(
    () => this.api.txSubmit(cborBytes),
    'submitTransaction',
    this.log,
  );
}
```

**Key detail:** The `@blockfrost/blockfrost-js` `txSubmit` function internally converts to `Buffer.from(transaction)` and sets `Content-Type: application/cbor`. It returns the tx hash as a string on success.

### BlockfrostClient.getTransaction()

```typescript
// Source: @blockfrost/blockfrost-js txs/index.js (verified in node_modules)
// Returns components['schemas']['tx_content'] which includes:
//   hash, block, block_height, block_time, slot, fees, valid_contract, ...
// Returns 404 (BlockfrostServerError) when tx not yet in a block

async getTransaction(txHash: string): Promise<TxInfo | null> {
  try {
    return await withRetry(
      () => this.api.txs(txHash) as Promise<TxInfo>,
      'getTransaction',
      this.log,
    );
  } catch (error) {
    if (error instanceof BlockfrostServerError && error.status_code === 404) {
      return null;
    }
    throw error;
  }
}
```

**Key detail:** The 404 -> null pattern matches the existing `getAddressUtxos()` convention in this codebase.

### TxInfo Type (from Blockfrost OpenAPI)

```typescript
// Derived from @blockfrost/openapi components['schemas']['tx_content']
// Only the fields we need for settlement confirmation

export interface TxInfo {
  hash: string;
  block: string;          // block hash
  block_height: number;
  block_time: number;     // UNIX timestamp
  slot: number;
  index: number;          // tx index within block
  fees: string;           // lovelace as string
  valid_contract: boolean;
}
```

### SHA-256 Dedup Key Generation

```typescript
import { createHash } from 'node:crypto';

function computeDedupKey(cborBytes: Uint8Array): string {
  return `settle:${createHash('sha256').update(cborBytes).digest('hex')}`;
}
```

### Redis Dedup Record

```typescript
interface SettlementRecord {
  txHash: string;
  status: 'submitted' | 'confirmed' | 'timeout' | 'failed';
  submittedAt: number;    // Unix ms timestamp
  confirmedAt?: number;   // Unix ms timestamp (set on confirmation)
  reason?: string;        // failure reason if status is 'failed'
}

// Write with NX (set-if-not-exists) for atomicity
const didSet = await redis.set(
  dedupKey,
  JSON.stringify(record),
  'EX', 86400,    // 24h TTL
  'NX',           // Only set if key doesn't exist
);

// Read existing record
const raw = await redis.get(dedupKey);
const record: SettlementRecord | null = raw ? JSON.parse(raw) : null;
```

### Settle Zod Schemas (matching Phase 3 conventions)

```typescript
import { z } from 'zod';

// Reuses PaymentRequirementsSchema from verify/types.ts
import { PaymentRequirementsSchema } from '../verify/types.js';

export const SettleRequestSchema = z.object({
  /** Base64-encoded signed CBOR transaction */
  transaction: z.string().min(1),
  /** Payment requirements (same shape as /verify) */
  paymentRequirements: PaymentRequirementsSchema,
});

export const SettleResponseSchema = z.object({
  success: z.boolean(),
  transaction: z.string().optional(),
  network: z.string().optional(),
  reason: z.string().optional(),
});

export const StatusRequestSchema = z.object({
  /** Transaction hash (hex string, 64 chars) */
  transaction: z.string().length(64),
  /** Payment requirements for context */
  paymentRequirements: PaymentRequirementsSchema,
});

export const StatusResponseSchema = z.object({
  status: z.enum(['confirmed', 'pending', 'not_found']),
  transaction: z.string(),
});
```

### SettlePayment Error Categories

```typescript
// Recommended error reason codes for non-timeout failures
const SETTLE_REASONS = {
  // From re-verification
  verification_failed: 'Transaction failed re-verification',

  // From Blockfrost submission
  invalid_transaction: 'Transaction is structurally invalid (400)',
  submission_rejected: 'Blockfrost rejected the transaction',
  mempool_full: 'Network mempool is full (425), try again later',

  // From polling
  confirmation_timeout: 'Transaction not confirmed within timeout',

  // From dedup
  already_settled: 'Transaction was already submitted and confirmed',

  // Generic
  internal_error: 'Unexpected error during settlement',
} as const;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Facilitator constructs + signs tx | Client signs, facilitator submits raw CBOR | Phase 3 decision (2026-02-06) | No facilitator wallet needed; simpler, more secure |
| Async 202 with polling | Sync 200 with blocking wait | Phase 4 context decision | Simpler client integration; long-lived connections |
| In-memory dedup dict (Masumi pattern) | Redis dedup with NX + TTL | Phase 4 design | Crash recovery, distributed deployments |

**Deprecated/outdated:**
- ROADMAP.md Phase 4 deliverables are WRONG -- they describe the old authorization-based model. The preplanning notes document this explicitly. Update ROADMAP when Phase 4 is planned.

## Open Questions

1. **Duplicate submission behavior from Blockfrost**
   - What we know: Blockfrost `txSubmit` returns 200 with tx hash on first successful submit. The preplanning notes say "Blockfrost also handles true double-submission gracefully (returns existing tx hash)."
   - What's unclear: Whether a duplicate submission returns 200 with the same hash or 400 with an error. My search did not find definitive documentation on this specific case.
   - Recommendation: Our Redis NX dedup prevents most duplicates. For the race condition window, wrap `submitTransaction` in a try-catch that handles both 200 (success) and 400 (check if it's a "already submitted" error vs truly invalid). Test with preprod to verify the actual behavior.
   - Confidence: LOW

2. **425 (Mempool Full) in RETRYABLE_STATUS_CODES**
   - What we know: 425 is a legitimate transient failure specific to Cardano via Blockfrost. The current `RETRYABLE_STATUS_CODES` does not include it.
   - What's unclear: Whether adding 425 should be done as part of Phase 4 or as a prerequisite patch.
   - Recommendation: Add 425 to `RETRYABLE_STATUS_CODES` in the same PR as Phase 4. It's a one-line change with a corresponding test.
   - Confidence: HIGH

3. **facilitator config validation**
   - What we know: `ChainConfigSchema` requires at least one of seedPhrase/privateKey via a `.refine()` rule. Phase 4 does not need these.
   - What's unclear: Whether to relax this now (potentially breaking existing configs that rely on the validation) or defer to Phase 6.
   - Recommendation: Defer. The existing test configs include a dummy seedPhrase. Adding a real facilitator wallet is a Phase 6 concern. The validation protects users from accidental misconfiguration for wallet-dependent operations.
   - Confidence: MEDIUM

4. **Settlement config section**
   - What we know: The poll interval (5s), timeout (120s), and dedup TTL (24h) are locked decisions.
   - What's unclear: Whether these should be in a new `chain.settlement` config section or hardcoded as constants.
   - Recommendation: Hardcode as named constants in `settle-payment.ts` (like `PROTOCOL_PARAMS_TTL_MS` in `provider.ts`). These values are unlikely to change and don't need user configuration. If they do need to be configurable later, extracting constants to config is trivial.
   - Confidence: MEDIUM

## Sources

### Primary (HIGH confidence)

- `@blockfrost/blockfrost-js` v6.1.0 source code in `node_modules`:
  - `lib/endpoints/api/txs/index.js` -- `txSubmit()` accepts `Uint8Array | string`, returns tx hash as `string`
  - `lib/endpoints/api/txs/index.d.ts` -- TypeScript declarations showing `txs(hash)` returns `components['schemas']['tx_content']`
  - `lib/BlockFrostAPI.d.ts` -- Confirms both `txSubmit` and `txs` are public methods
  - `lib/utils/errors.d.ts` -- `BlockfrostServerError` has `status_code`, `error`, `url`, `body` fields
- `@blockfrost/openapi` v0.1.84 `generated-types.d.ts`:
  - `tx_content` schema: `hash`, `block`, `block_height`, `block_time`, `slot`, `index`, `fees`, `valid_contract`, etc.
- Blockfrost OpenAPI spec (fetched via WebFetch from raw GitHub):
  - POST /tx/submit: Content-Type `application/cbor`, returns 200 with tx hash string
  - GET /txs/{hash}: Returns `tx_content` on 200, 404 when tx not in a block
  - Error codes: 400 (invalid), 403 (auth), 425 (mempool full), 429 (rate limit), 500 (server)
- Existing codebase (verified by reading source files):
  - `src/chain/blockfrost-client.ts` -- `withRetry`, `BlockfrostClient` class, `RETRYABLE_STATUS_CODES`
  - `src/verify/verify-payment.ts` -- `verifyPayment()` signature and return type
  - `src/verify/types.ts` -- Zod schemas, `VerifyContext`, `PaymentRequirementsSchema`
  - `src/routes/verify.ts` -- Route plugin pattern with Zod validation
  - `src/chain/utxo-cache.ts` -- `serializeWithBigInt`, Redis usage patterns
  - `src/chain/redis-client.ts` -- Redis client factory, ioredis config
  - `src/server.ts` -- Route registration pattern
  - `src/types/index.ts` -- Fastify type augmentation pattern

### Secondary (MEDIUM confidence)

- Blockfrost API documentation (https://docs.blockfrost.io/) -- confirmed error codes 400, 425, 429, 500 for tx/submit
- Cardano Forum discussion on Blockfrost submit (https://forum.cardano.org/t/blockfrost-api-submit-function/89078)

### Tertiary (LOW confidence)

- Blockfrost duplicate transaction submission behavior -- could not find definitive documentation; the preplanning notes assert it returns the existing tx hash but this was not independently verified
- Cardano Updates commit on 425 mempool full error (https://cardanoupdates.com/commits/4c264b68c27aa7a7303e9239ca878341c176ab1b)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and verified in node_modules
- Architecture: HIGH -- follows established codebase patterns exactly (verify route, BlockfrostClient, Redis)
- Pitfalls: HIGH -- derived from actual codebase analysis and Blockfrost API behavior
- Blockfrost duplicate tx behavior: LOW -- not independently verified

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days -- stable domain, no fast-moving APIs)
