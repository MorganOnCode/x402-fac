# Phase 2: Chain Provider - Research

**Researched:** 2026-02-05
**Domain:** Cardano blockchain interaction (Blockfrost API, Lucid Evolution, UTXO management)
**Confidence:** HIGH

## Summary

This phase implements the internal Cardano chain layer: Blockfrost API interaction, UTXO querying/caching/reservation, and transaction builder foundation using Lucid Evolution. No HTTP endpoints are exposed; this is infrastructure that verification and settlement phases build upon.

Lucid Evolution (`@lucid-evolution/lucid` v0.4.29) provides a built-in Blockfrost provider, eliminating the need for the standalone `@blockfrost/blockfrost-js` SDK. Lucid Evolution's `Blockfrost` class makes HTTP calls directly to the Blockfrost REST API and implements the `Provider` interface with methods for UTXO queries, protocol parameters, datum lookups, and transaction submission. For operations beyond what Lucid's provider exposes (e.g., querying block details, epoch info for slot calculations), we use `@blockfrost/blockfrost-js` v6.1.0 as a supplementary client.

Redis (via ioredis v5.8.2) is already available in docker-compose for persistent UTXO caching. The reservation system is a custom in-memory data structure backed by Redis for restart persistence. Cardano's UTXO model means a single UTXO can only be spent once; the reservation system prevents double-spend attempts from concurrent payment requests by locking UTXOs during transaction construction.

**Primary recommendation:** Use Lucid Evolution's built-in Blockfrost provider as the primary chain interface, supplement with `@blockfrost/blockfrost-js` only for queries Lucid doesn't expose (slot/block lookups), and build a two-layer UTXO cache (in-memory Map + Redis) with a reservation system using TTL-based locks.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@lucid-evolution/lucid` | 0.4.29 | Transaction building, UTXO queries, Blockfrost provider | Standard Cardano off-chain framework; used by Cardano Foundation, Liqwid, Indigo, WingRiders, VESPR |
| `@blockfrost/blockfrost-js` | 6.1.0 | Supplementary Blockfrost API calls (blocks, slots, epochs) | Official Blockfrost SDK with built-in rate limiter, retry, TypeScript types |
| `ioredis` | 5.8.2 | Redis client for persistent caching and reservation state | Most popular Node.js Redis client; 100% TypeScript, built-in types, pipelining support |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.3.6 (already installed) | Config schema extension for chain settings | Validating Blockfrost/network config |
| `@fastify/error` | 4.2.0 (already installed) | Domain error creation | Creating CHAIN_* error types |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Lucid Evolution built-in Blockfrost | Standalone `@blockfrost/blockfrost-js` for everything | Loses Lucid's transaction builder integration; would need to map types manually |
| ioredis | `redis` (node-redis) | node-redis has official status but ioredis has better TypeScript support, autopipelining, and wider adoption |
| In-memory Map + Redis | Pure Redis | Pure Redis adds latency for every UTXO lookup during hot path; in-memory is ~1000x faster for reads |

**Installation:**
```bash
pnpm add @lucid-evolution/lucid @blockfrost/blockfrost-js ioredis
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  chain/
    provider.ts          # ChainProvider class - orchestrates Lucid + Blockfrost
    blockfrost-client.ts # Wrapped Blockfrost client with retry logic
    lucid-provider.ts    # Lucid Evolution initialization and wallet setup
    utxo-cache.ts        # Two-layer cache (in-memory + Redis)
    utxo-reservation.ts  # UTXO lock/unlock with TTL
    types.ts             # Chain-specific types (UTxO, Reservation, etc.)
    errors.ts            # Chain domain errors (CHAIN_*)
    config.ts            # Chain config schema extension
  config/
    schema.ts            # Extended with chain section (MODIFY existing)
  errors/
    index.ts             # Extended with chain errors (MODIFY existing)
```

### Pattern 1: Two-Layer UTXO Cache
**What:** In-memory Map as L1 cache, Redis as L2 persistent backing store. Reads check L1 first, then L2, then Blockfrost. Writes go to both layers.
**When to use:** Every UTXO query. The facilitator's own address UTXOs are the hot path.
**Example:**
```typescript
// Pattern: L1 (Map) -> L2 (Redis) -> L3 (Blockfrost)
class UtxoCache {
  private l1: Map<string, { utxos: UTxO[]; expiresAt: number }> = new Map();
  private redis: Redis;
  private ttlMs: number;

  async getUtxos(address: string): Promise<UTxO[] | null> {
    // L1: Check in-memory
    const l1Entry = this.l1.get(address);
    if (l1Entry && l1Entry.expiresAt > Date.now()) {
      return l1Entry.utxos;
    }

    // L2: Check Redis
    const l2Data = await this.redis.get(`utxo:${address}`);
    if (l2Data) {
      const utxos = JSON.parse(l2Data) as UTxO[];
      // Warm L1
      this.l1.set(address, { utxos, expiresAt: Date.now() + this.ttlMs });
      return utxos;
    }

    return null; // Cache miss - caller fetches from Blockfrost
  }

  async setUtxos(address: string, utxos: UTxO[]): Promise<void> {
    const ttlSeconds = Math.ceil(this.ttlMs / 1000);
    // Write to both layers
    this.l1.set(address, { utxos, expiresAt: Date.now() + this.ttlMs });
    await this.redis.set(`utxo:${address}`, JSON.stringify(utxos), 'EX', ttlSeconds);
  }

  invalidate(address: string): void {
    this.l1.delete(address);
    // Fire-and-forget Redis delete
    this.redis.del(`utxo:${address}`).catch(() => {});
  }
}
```

### Pattern 2: UTXO Reservation with TTL
**What:** Lock UTXOs by txHash+outputIndex to prevent concurrent spending. Reservations have a TTL (recommended: 120 seconds, covering ~6 Cardano blocks for transaction propagation).
**When to use:** Before building any transaction that spends facilitator UTXOs.
**Example:**
```typescript
// Pattern: Reserve -> Build Tx -> Submit -> Release/Expire
interface Reservation {
  utxoRef: string;        // "txHash#outputIndex"
  reservedAt: number;     // Date.now()
  expiresAt: number;      // reservedAt + TTL
  requestId: string;      // For debugging
}

class UtxoReservation {
  private reservations: Map<string, Reservation> = new Map();
  private redis: Redis;
  private ttlMs: number = 120_000; // 120 seconds

  reserve(utxoRef: string, requestId: string): boolean {
    this.cleanExpired();
    if (this.reservations.has(utxoRef)) return false;

    const reservation: Reservation = {
      utxoRef,
      reservedAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
      requestId,
    };
    this.reservations.set(utxoRef, reservation);
    // Persist to Redis for restart recovery
    this.redis.set(
      `reservation:${utxoRef}`, JSON.stringify(reservation),
      'PX', this.ttlMs
    ).catch(() => {});
    return true;
  }

  release(utxoRef: string): void {
    this.reservations.delete(utxoRef);
    this.redis.del(`reservation:${utxoRef}`).catch(() => {});
  }
}
```

### Pattern 3: Blockfrost Client with Exponential Backoff
**What:** Wrap Blockfrost calls with custom retry logic per CONTEXT.md decisions: 500ms start, double each attempt, max 3 retries. On exhaustion, throw typed CHAIN_RATE_LIMITED error.
**When to use:** All Blockfrost API calls.
**Example:**
```typescript
// Source: CONTEXT.md locked decisions
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  log: FastifyBaseLogger,
): Promise<T> {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 500;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable = isRetryableError(error);
      if (!isRetryable || attempt === MAX_RETRIES) {
        if (isRateLimitError(error)) {
          throw new ChainRateLimitedError(label);
        }
        throw error;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      log.warn({ attempt, delay, label }, 'Retrying Blockfrost call');
      await sleep(delay);
    }
  }
  // Unreachable but TypeScript needs it
  throw new ChainRateLimitedError(label);
}
```

### Pattern 4: Lucid Evolution Initialization
**What:** Initialize Lucid with Blockfrost provider, configure for the correct network.
**When to use:** Application startup (create once, reuse).
**Example:**
```typescript
// Source: Lucid Evolution official docs
import { Lucid, Blockfrost } from "@lucid-evolution/lucid";

type CardanoNetwork = "Preview" | "Preprod" | "Mainnet";

async function createLucidInstance(
  blockfrostUrl: string,
  projectId: string,
  network: CardanoNetwork,
): Promise<LucidEvolution> {
  const lucid = await Lucid(
    new Blockfrost(blockfrostUrl, projectId),
    network,
  );
  return lucid;
}
```

### Pattern 5: Mainnet Safety Guardrail
**What:** Require explicit MAINNET=true environment variable to connect to mainnet. Fail-safe prevents accidental mainnet usage.
**When to use:** During configuration loading, before any chain interaction.
**Example:**
```typescript
// In config validation
if (network === 'Mainnet' && process.env.MAINNET !== 'true') {
  throw new ConfigInvalidError(
    'Mainnet connection requires explicit MAINNET=true environment variable'
  );
}
```

### Anti-Patterns to Avoid
- **Querying Blockfrost on every request without caching:** Blockfrost free tier is 50K/day; even paid tier has 10 req/sec rate limit. Always cache UTXOs.
- **Storing UTXO amounts as JavaScript numbers:** Cardano lovelace values use BigInt (bigint). Never use `Number` for lovelace amounts; precision loss above 2^53.
- **Building transactions without reserving UTXOs first:** Concurrent requests will select the same UTXOs, causing one transaction to fail on-chain.
- **Hardcoding Blockfrost URLs:** Network-specific URLs differ (`cardano-preview`, `cardano-preprod`, `cardano-mainnet`). Derive from config.
- **Using the old `lucid-cardano` package:** It is unmaintained since late 2023. Use `@lucid-evolution/lucid` exclusively.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Min UTXO ADA calculation | Custom formula based on output size | Lucid's `.complete()` method | Handles all cases: tokens, datums, reference scripts. Formula changes with protocol parameters. |
| Transaction balancing | Manual input/output matching | Lucid's `.complete()` | Automatic coin selection, fee calculation, change output. |
| CBOR serialization | Custom serializer | Lucid's internal CML | Cardano serialization is complex with multiple eras. |
| Slot-to-POSIX conversion | Manual offset math | Lucid's built-in conversion / Blockfrost genesis params | Conversion depends on network genesis parameters and era boundaries. |
| Blockfrost rate limiting | Custom token bucket | `@blockfrost/blockfrost-js` built-in `rateLimiter: true` | SDK matches Blockfrost's exact limits (10/sec with 500 burst). |
| Transaction fee estimation | Manual calculation | Lucid's `.complete()` | Fees depend on transaction size, script execution units, and protocol parameters. |
| Address validation | Regex matching | Lucid's address utilities | Bech32 encoding, network discrimination bytes, payment/stake credential handling. |

**Key insight:** Cardano's EUTXO model has significant complexity in transaction construction that Lucid Evolution abstracts. The min UTXO calculation alone depends on the output size in bytes, which varies with tokens, datums, and scripts. Hand-rolling any of these will produce subtle bugs across different transaction types.

## Common Pitfalls

### Pitfall 1: BigInt Serialization in Redis/JSON
**What goes wrong:** Cardano lovelace values are `bigint`. `JSON.stringify()` throws on BigInt values: "TypeError: Do not know how to serialize a BigInt".
**Why it happens:** JavaScript's JSON serializer doesn't support BigInt natively.
**How to avoid:** Use a custom replacer/reviver for JSON serialization when caching UTXOs in Redis:
```typescript
const serialize = (data: unknown) =>
  JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? value.toString() + 'n' : value
  );

const deserialize = (json: string) =>
  JSON.parse(json, (_key, value) =>
    typeof value === 'string' && /^\d+n$/.test(value)
      ? BigInt(value.slice(0, -1))
      : value
  );
```
**Warning signs:** Redis cache values silently losing precision, or JSON.stringify errors in logs.

### Pitfall 2: Blockfrost 404 on Unused Addresses
**What goes wrong:** Blockfrost returns HTTP 404 for addresses that have never received funds. This looks like an error but is normal behavior.
**Why it happens:** Blockfrost returns "Not Found" for any resource that doesn't exist on chain yet, including brand-new addresses.
**How to avoid:** Catch `BlockfrostServerError` with `status_code === 404` and return an empty UTXO array instead of throwing.
```typescript
if (error instanceof BlockfrostServerError && error.status_code === 404) {
  return []; // Address exists but has no on-chain history
}
```
**Warning signs:** Error logs showing "address not found" for valid addresses during initial setup.

### Pitfall 3: Stale Cache After Transaction Submission
**What goes wrong:** After submitting a transaction, the UTXO cache still contains spent UTXOs. Next request tries to spend already-spent UTXOs.
**Why it happens:** Cache TTL hasn't expired yet, and the transaction takes 1-2 blocks (~20-40 seconds) to confirm.
**How to avoid:** Immediately invalidate the facilitator's UTXO cache after successful transaction submission. Additionally, optimistically remove spent UTXOs and add expected change UTXOs.
**Warning signs:** "UTxO already spent" errors from transaction submission.

### Pitfall 4: Concurrent Reservation Exhaustion
**What goes wrong:** All facilitator UTXOs are reserved by concurrent requests, leaving no UTXOs for new requests.
**Why it happens:** Payment burst with slow transaction confirmation; reservations accumulate faster than they clear.
**How to avoid:** Implement a reject-immediately strategy with a clear error: if no unreserved UTXOs are available, return a CHAIN_UTXO_EXHAUSTED error. Set a reasonable max concurrent reservations cap (recommend: 10-20, matching expected concurrent payment volume). Use 120-second reservation TTL so stale reservations auto-expire.
**Warning signs:** Increasing reservation count without corresponding releases.

### Pitfall 5: Blockfrost API Key Per Network
**What goes wrong:** Using a mainnet API key with a preview testnet URL (or vice versa) produces authentication errors.
**Why it happens:** Blockfrost API keys are network-specific. A preview key works only with `cardano-preview.blockfrost.io`.
**How to avoid:** Config schema validates that the API key's network prefix matches the configured network URL. Store keys per-network in config.
**Warning signs:** HTTP 403 errors from Blockfrost despite having a valid key.

### Pitfall 6: Transaction Validity Interval Too Short
**What goes wrong:** Transaction expires before it can be included in a block.
**Why it happens:** Cardano blocks are produced on average every ~20 seconds. If the validity interval (TTL) is too tight, the transaction may miss its window.
**How to avoid:** Set transaction TTL to at least 600 slots (10 minutes). Lucid's `.complete()` sets a reasonable default, but verify it's sufficient. For payment transactions, 900 seconds (15 minutes) provides adequate margin.
**Warning signs:** Transactions that succeed locally but fail with "transaction expired" on chain.

## Code Examples

Verified patterns from official sources:

### Initialize Lucid Evolution with Blockfrost
```typescript
// Source: Lucid Evolution docs - https://anastasia-labs.github.io/lucid-evolution/
import { Lucid, Blockfrost, generateSeedPhrase } from "@lucid-evolution/lucid";

// Network-specific Blockfrost URLs
const BLOCKFROST_URLS: Record<string, string> = {
  Preview: "https://cardano-preview.blockfrost.io/api/v0",
  Preprod: "https://cardano-preprod.blockfrost.io/api/v0",
  Mainnet: "https://cardano-mainnet.blockfrost.io/api/v0",
};

const lucid = await Lucid(
  new Blockfrost(
    BLOCKFROST_URLS["Preview"],
    "previewProjectIdHere"
  ),
  "Preview",
);

// Select wallet from seed phrase (for facilitator's signing key)
lucid.selectWallet.fromSeed("your 24 word seed phrase here...");

// Or from a private key
lucid.selectWallet.fromPrivateKey("ed25519_sk1...");
```

### Query UTXOs via Lucid Provider
```typescript
// Source: Lucid Evolution docs
// Query UTXOs at an address
const utxos = await lucid.utxosAt("addr_test1qz...");

// Query wallet UTXOs (after selectWallet)
const walletUtxos = await lucid.wallet().getUtxos();

// Each UTxO has shape:
// { txHash: string, outputIndex: number, address: string,
//   assets: { lovelace: bigint, [policyId+assetName]: bigint },
//   datum?: string, datumHash?: string, scriptRef?: Script }
```

### Build and Submit a Transaction
```typescript
// Source: Lucid Evolution docs
const tx = await lucid
  .newTx()
  .pay.ToAddress("addr_test1qz...", { lovelace: 5_000_000n })
  .complete(); // Auto-balances, calculates fees, ensures min UTXO

const signedTx = await tx.sign.withWallet().complete();
const txHash = await signedTx.submit();
// txHash: "abc123..." (64-char hex string)
```

### Supplementary Blockfrost Client for Slot Queries
```typescript
// Source: @blockfrost/blockfrost-js docs
import { BlockFrostAPI, BlockfrostServerError } from "@blockfrost/blockfrost-js";

const blockfrostClient = new BlockFrostAPI({
  projectId: "previewProjectIdHere",
  rateLimiter: true,          // Match Blockfrost rate limits
  requestTimeout: 20_000,     // 20 second timeout
  retrySettings: {
    limit: 3,
    methods: ["GET"],
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
});

// Get latest block (for current slot)
const latestBlock = await blockfrostClient.blocksLatest();
// latestBlock.slot: number (current slot)
// latestBlock.time: number (Unix timestamp)

// Get protocol parameters
const params = await blockfrostClient.epochsLatestParameters();
// params.coins_per_utxo_byte: string ("4310")
// params.min_fee_a: number
// params.min_fee_b: number

// Get block at specific slot
const block = await blockfrostClient.blocks(slotNumber);
```

### ioredis Connection Setup
```typescript
// Source: ioredis docs - https://github.com/redis/ioredis
import { Redis } from "ioredis";

const redis = new Redis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
  lazyConnect: true, // Don't connect immediately; call .connect() explicitly
});

// Set with TTL (60 seconds for UTXO cache)
await redis.set("utxo:addr_test1...", serializedUtxos, "EX", 60);

// Get
const cached = await redis.get("utxo:addr_test1...");

// Set with millisecond TTL (for reservations: 120000ms)
await redis.set("reservation:txHash#0", data, "PX", 120_000);

// Check health
const pong = await redis.ping(); // "PONG"
```

### Domain Error Creation (following existing pattern)
```typescript
// Source: existing src/errors/index.ts pattern
import createError from '@fastify/error';

// Chain provider errors
export const ChainRateLimitedError = createError<[string]>(
  'CHAIN_RATE_LIMITED',
  'Blockfrost rate limit exceeded for: %s',
  503
);

export const ChainConnectionError = createError<[string]>(
  'CHAIN_CONNECTION_ERROR',
  'Failed to connect to Cardano chain: %s',
  503
);

export const ChainUtxoExhaustedError = createError(
  'CHAIN_UTXO_EXHAUSTED',
  'No unreserved UTXOs available for transaction',
  503
);

export const ChainTransactionError = createError<[string]>(
  'CHAIN_TX_ERROR',
  'Transaction failed: %s',
  500
);

export const ChainNetworkMismatchError = createError<[string]>(
  'CHAIN_NETWORK_MISMATCH',
  'Network configuration mismatch: %s',
  500
);
```

### Config Schema Extension
```typescript
// Extending existing src/config/schema.ts
const CardanoNetworkSchema = z.enum(['Preview', 'Preprod', 'Mainnet']);

const BlockfrostTierSchema = z.enum(['free', 'paid']);

const ChainConfigSchema = z.object({
  network: CardanoNetworkSchema.default('Preview'),
  blockfrost: z.object({
    // Per-network keys (user decision: keys are network-specific)
    projectId: z.string().min(1),
    // Derived from network, but can be overridden
    url: z.string().url().optional(),
    tier: BlockfrostTierSchema.default('free'),
  }),
  facilitator: z.object({
    // Seed phrase or private key (one required)
    seedPhrase: z.string().optional(),
    privateKey: z.string().optional(),
  }).refine(
    (d) => d.seedPhrase || d.privateKey,
    'Either seedPhrase or privateKey must be provided'
  ),
  cache: z.object({
    utxoTtlSeconds: z.number().int().min(10).max(300).default(60),
  }).default(() => ({ utxoTtlSeconds: 60 })),
  redis: z.object({
    host: z.string().default('127.0.0.1'),
    port: z.number().int().default(6379),
  }).default(() => ({ host: '127.0.0.1', port: 6379 })),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `lucid-cardano` (SpaceBudz) | `@lucid-evolution/lucid` (Anastasia Labs) | Late 2023 | New API shape: `Lucid()` not `Lucid.new()`, `pay.ToAddress` not `payToAddress`, `tx.sign.withWallet()` not `tx.sign()` |
| `coinsPerUTxOWord` (Alonzo) | `coinsPerUTxOByte` (Babbage) | Vasil HF 2022 | Min UTXO calculation changed from word-based to byte-based; value is 4,310 lovelace per byte |
| `@blockfrost/blockfrost-js` v5 (Axios) | v6 (Got) | v6.0.0 | Different retry configuration; `retrySettings` replaces old `retryCount`/`retryDelay` |
| `@types/ioredis` (separate package) | Built-in types in ioredis v5+ | v5.0.0 | No separate `@types/ioredis` needed |
| Manual Plutus V1/V2 | Plutus V3 + Conway features | Chang HF 2024 | Lucid Evolution supports Plomin (Chang 2) hardfork |

**Deprecated/outdated:**
- `lucid-cardano`: Unmaintained since late 2023. Use `@lucid-evolution/lucid`.
- `coinsPerUTxOWord`: Replaced by `coinsPerUTxOByte` in Babbage era.
- `@types/ioredis`: Stub package; ioredis v5+ includes its own types.
- `@blockfrost/blockfrost-js` retryCount/retryDelay options: Replaced by `retrySettings` in v6.

## Discretionary Decisions (Recommendations)

These areas were marked as "Claude's Discretion" in CONTEXT.md. Here are researched recommendations:

### API Key Management: Per-Network Keys
**Recommendation:** Store one Blockfrost project ID per network in config. Blockfrost keys are network-specific (a preview key does not work with preprod). Config should have a single `blockfrost.projectId` field, and the URL is derived from the `network` field. This keeps config simple while being correct.

### Cache Invalidation Triggers
**Recommendation:** Invalidate the facilitator address cache on:
1. Successful transaction submission (immediate - spent UTXOs are gone)
2. Reservation release (the UTXO may have changed state)
3. TTL expiry (natural, 60 seconds)
Do NOT invalidate on failed transactions (UTXOs are unchanged).

### UTXO Cache Scope: Facilitator-Only
**Recommendation:** Cache only the facilitator's own address UTXOs. Payment verification involves checking the *payer's* transaction, not their UTXO set. The facilitator needs its own UTXOs for building settlement transactions. Caching arbitrary addresses wastes memory and complicates invalidation.

### Reservation TTL: 120 Seconds
**Recommendation:** 120 seconds (6 Cardano blocks). A Cardano transaction typically confirms within 1-2 blocks (~20-40 seconds). The extra buffer accounts for: network propagation, mempool delays, and retry scenarios. After 120 seconds, if the transaction hasn't been submitted, the reservation auto-expires.

### Contention Handling: Reject Immediately
**Recommendation:** When all facilitator UTXOs are reserved, immediately reject with `CHAIN_UTXO_EXHAUSTED` error (HTTP 503). Reasoning:
- The caller (future payment endpoint) can retry with exponential backoff
- Wait-with-timeout adds complexity and blocks request threads
- The facilitator should consolidate UTXOs proactively rather than queue requests
- 503 with Retry-After header lets the caller make informed retry decisions

### Reservation Persistence: Redis-Backed
**Recommendation:** Persist reservations to Redis with the same TTL. On restart, load active reservations from Redis. This prevents UTXOs from being double-spent if the facilitator crashes mid-transaction. Redis `PX` (millisecond TTL) ensures natural expiry even if the facilitator never restarts.

### Concurrent Reservation Cap: 20
**Recommendation:** Maximum 20 concurrent reservations. This provides headroom for burst payment scenarios while preventing runaway reservation accumulation. The cap should be configurable in the chain config. If exceeded, reject with `CHAIN_UTXO_EXHAUSTED`.

### Test Mocking: Interface-Based with Vitest Mocks
**Recommendation:** Define a `ChainProvider` interface that abstracts all chain operations. Tests mock this interface using `vi.fn()`. For integration tests, use recorded Blockfrost responses (fixture files). Do not call real Blockfrost in unit tests. For development, use real Blockfrost calls against preview testnet (API key in `.env.local`, never committed).

## Open Questions

Things that couldn't be fully resolved:

1. **Lucid Evolution v0.4.29 vs @evolution-sdk/lucid v2.0.1**
   - What we know: There appear to be two package lineages. `@lucid-evolution/lucid` at 0.4.29 and `@evolution-sdk/lucid` at 2.0.1.
   - What's unclear: Whether `@evolution-sdk/lucid` v2.0.1 is the recommended successor or a separate fork.
   - Recommendation: Use `@lucid-evolution/lucid` v0.4.29, which has 41 dependents and clear documentation. Verify at implementation time if `@evolution-sdk` is a better choice. The API patterns should be similar.

2. **Lucid Evolution's Blockfrost Provider Internal Retry Behavior**
   - What we know: Lucid Evolution's built-in Blockfrost provider makes HTTP calls to the Blockfrost REST API.
   - What's unclear: Whether it has its own retry/rate-limiting logic, or if errors propagate raw to the caller.
   - Recommendation: Wrap Lucid provider calls with our own retry logic regardless. This gives us control over the retry behavior as specified in CONTEXT.md decisions.

3. **Effect Library Dependency in Lucid Evolution**
   - What we know: Lucid Evolution internally uses the Effect library for error handling. Functions may return Effect types.
   - What's unclear: Whether the public API exposes Effect types that consumers must handle, or wraps them.
   - Recommendation: The `TxSignBuilder` and public API appear to use Promises, not raw Effect types. Verify during implementation. If Effect types surface, use `Effect.runSync()` or `Effect.runPromise()` to convert.

## Sources

### Primary (HIGH confidence)
- [Lucid Evolution official docs](https://anastasia-labs.github.io/lucid-evolution/) - instantiation, providers, transaction building
- [Lucid Evolution GitHub](https://github.com/Anastasia-Labs/lucid-evolution) - package structure, version info
- [@lucid-evolution/lucid npm](https://www.npmjs.com/package/@lucid-evolution/lucid) - v0.4.29, 41 dependents
- [@blockfrost/blockfrost-js npm](https://www.npmjs.com/package/@blockfrost/blockfrost-js) - v6.1.0, SDK methods
- [Blockfrost JS GitHub](https://github.com/blockfrost/blockfrost-js) - error types, retry config, rate limiter
- [Blockfrost API docs](https://docs.blockfrost.io/) - endpoints, rate limits, error codes
- [Blockfrost plans and billing](https://blockfrost.dev/overview/plans-and-billing) - tier limits
- [Blockfrost start building](https://blockfrost.dev/start-building/cardano/) - network URLs
- [ioredis GitHub](https://github.com/redis/ioredis) - v5.8.2, TypeScript types
- [Cardano docs - time handling](https://docs.cardano.org/about-cardano/explore-more/time) - slot timing
- [Cardano docs - min UTXO](https://docs.cardano.org/native-tokens/minimum-ada-value-requirement/) - coinsPerUTxOByte
- [Cardano ledger docs](https://cardano-ledger.readthedocs.io/en/latest/explanations/min-utxo-mary.html) - min UTXO formula

### Secondary (MEDIUM confidence)
- [Lucid Evolution community docs](https://ariady-putra.github.io/lucid-evolution-docs/) - API examples verified against official docs
- [Cardano forum - TTL discussion](https://forum.cardano.org/t/is-there-a-default-and-max-ttl-for-transactions/93633) - TTL defaults and limits
- [Blockfrost JS wiki](https://github.com/blockfrost/blockfrost-js/wiki) - complete method list
- [IOG blog - concurrency](https://iohk.io/en/blog/posts/2021/09/10/concurrency-and-all-that-cardano-smart-contracts-and-the-eutxo-model/) - UTXO contention patterns

### Tertiary (LOW confidence)
- [MELD batching paper](https://medium.com/meld-labs/concurrent-deterministic-batching-on-the-utxo-ledger-99040f809706) - reservation pattern inspiration (smart contract focused, adapted for off-chain)
- [@evolution-sdk/lucid v2.0.1](https://www.npmjs.com/package/@evolution-sdk/lucid) - possible successor package, unverified relationship

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via npm, official docs, GitHub repos
- Architecture: HIGH - Patterns derived from official documentation and Cardano domain knowledge, verified against codebase
- Pitfalls: HIGH - BigInt serialization is well-documented; Blockfrost 404 behavior confirmed in official docs; UTXO contention is fundamental to Cardano's model
- Discretionary decisions: MEDIUM - Recommendations are well-reasoned but based on domain judgment, not prescriptive documentation

**Research date:** 2026-02-05
**Valid until:** 2026-03-07 (30 days - libraries are stable)
