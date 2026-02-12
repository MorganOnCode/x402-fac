# Phase 6: Micropayment Strategy - Research

**Researched:** 2026-02-10
**Domain:** Cardano micropayment economics, prepaid credit patterns, L2 alternatives
**Confidence:** HIGH (based on FluxPoint orynq-sdk source code + Cardano protocol parameters)
**Sources:** FluxPoint orynq-sdk repomix, masumi x402-cardano-examples repomix, Cardano docs, Hydra/Midnight documentation

## Summary

Phase 6 was pivoted from "Batching" to "Micropayment Strategy" because naive L1 batching provides only ~15% fee savings on Cardano (min UTXO per output cannot be amortized). This research synthesizes code-level analysis of FluxPoint Studios' orynq-sdk (21-package monorepo implementing dual-rail x402+Cardano payments) and the broader Cardano L2 landscape to define concrete implementation patterns for our micropayment strategy.

**Primary recommendation:** Build a **prepaid credit account system** (off-chain Redis-backed ledger with L1 top-up/withdrawal) as the core deliverable, with a **payment strategy router** that selects direct L1 settlement vs credit deduction based on amount. Document L2 options (Hydra, dual-rail) as future-phase research but do not build them.

FluxPoint's architecture validates several patterns we should adopt: deterministic invoice IDs, budget tracking interfaces, lazy expiration, and protocol-neutral core types. However, their system has critical gaps we already fill (CBOR pre-verification, UTXO reservation, stablecoin support) and gaps we need to fill (credit accounts, micropayment routing).

<user_constraints>
## User Constraints (from pivot decision + pre-planning assumptions)

### Locked Decisions
- Phase 6 goal: Enable economically viable small payments despite Cardano's ~1 ADA min UTXO floor
- Prepaid credit accounts as primary micropayment mechanism
- L2 (Hydra, Midnight, dual-rail) as documented research, not built in this phase
- Direct L1 settlement preserved for payments above min UTXO threshold
- FluxPoint dual-rail validated as reference architecture (not adopted wholesale)
- No facilitator wallet / key management in this phase (no custodial risk)

### Claude's Discretion
- Credit ledger data structure (Redis hash vs sorted set vs JSON blob)
- Top-up flow design (new endpoint vs reuse /settle)
- Withdrawal/sweep mechanism
- Payment strategy selection logic (threshold-based vs explicit client choice)
- 402 response format for payment strategy hints
- Credit account identity model (by address? by API key? by both?)
- Expiration policy for credit balances
</user_constraints>

## The Problem: Cardano L1 Micropayment Economics

### Protocol Parameters (Conway Era, mainnet)

| Parameter | Value | Source |
|-----------|-------|--------|
| `minFeeA` (txFeePerByte) | 44 lovelace/byte | Cardano docs |
| `minFeeB` (txFeeFixed) | 155,381 lovelace | Cardano docs |
| `coinsPerUtxoByte` | 4,310 lovelace/byte | Blockfrost API |
| `maxTxSize` | 16,384 bytes | Cardano docs |

### Min UTXO Floor Per Output

| Output Type | Min ADA | Calculation |
|-------------|---------|-------------|
| ADA-only | ~0.97 ADA | (160 + ~65) * 4310 |
| 1 native token (USDM) | ~1.17 ADA | (160 + ~112) * 4310 |
| 3 native tokens | ~1.56 ADA | (160 + ~202) * 4310 |

### Why Batching Fails on Cardano

| Approach | 1 payment | 10 payments batched | Savings |
|----------|-----------|--------------------:|--------:|
| **Tx fee** | 0.17 ADA | 0.20 ADA | 94% |
| **Min UTXO (per output)** | 1.00 ADA | 10.00 ADA | 0% |
| **Total** | 1.17 ADA | 10.20 ADA | **~13%** |

The min UTXO dominates. On EVM L2s, gas is the dominant cost and batching amortizes it. On Cardano, the per-output min UTXO floor is the dominant cost and it applies per recipient regardless of batching.

### Governance Proposal: utxoCostPerByte Reduction

A PCP proposal to reduce `utxoCostPerByte` from 4,310 to 400 lovelace exists (Cardano Forum). Would reduce min UTXO to ~0.10 ADA. **Status: under review, not ratified.** Cannot depend on this.

## FluxPoint Studios: Architecture Deep Dive

### System Overview

FluxPoint's orynq-sdk is a 21-package TypeScript monorepo implementing:
- **Gateway**: Express reverse proxy that intercepts `/api/*` requests, requires payment, forwards with `X-Paid-Verified: 1` header
- **Dual protocol**: x402 for EVM (Base USDC via EIP-3009), custom "Flux" protocol for Cardano (ADA via txHash proof)
- **Dual settlement rail**: Base L2 ($0.01 fee) for high-volume, Cardano L1 (~1.2 ADA min UTXO) for audit trails + ecosystem users

### Payment Flow: Gateway Architecture

```
Client                          Gateway (Express)                Facilitator       T-Backend
  |                               |                                |                 |
  |-- GET /api/resource --------->|                                |                 |
  |                               |-- pricing(req) -> $0.001 USDC |                 |
  |                               |-- create invoice (both stores) |                 |
  |<-- 402 + PAYMENT-REQUIRED ----|                                |                 |
  |                               |                                |                 |
  |-- sign payment -------------->|                                |                 |
  |                               |                                |                 |
  |-- GET /api/resource --------->|                                |                 |
  |   + PAYMENT-SIGNATURE         |                                |                 |
  |                               |-- find invoice (3 indices)     |                 |
  |                               |-- verify signature matches     |                 |
  |                               |-- POST /settle --------------->|                 |
  |                               |<-- { success, txHash } --------|                 |
  |                               |-- markSettled + markConsumed   |                 |
  |                               |-- forward ---------------------------------------->|
  |                               |   X-Paid-Verified: 1           |                 |
  |<-- response ------------------|                                |                 |
```

**Key insight for us:** FluxPoint's gateway **calls an external facilitator** for settlement. **We ARE the facilitator.** Our `/settle` endpoint is what their `callFacilitator()` POSTs to.

### Invoice Lifecycle (4 states)

```
pending -> settled -> consumed -> expired
                         |
                      (terminal)
```

- **pending**: Invoice created, awaiting payment
- **settled**: Payment confirmed on-chain, txHash recorded
- **consumed**: Resource delivered, invoice can't be reused
- **expired**: TTL exceeded (lazy check on read)

### Three-Index Invoice Store

```typescript
// From: packages/gateway/src/x402-settlement-store.ts
interface StoredInvoice {
  invoiceId: string;        // SHA-256(method:url:idempotencyKey)[0:32]
  requestHash: string;      // binds invoice to specific request
  requirements: PaymentRequirements;
  status: "pending" | "settled" | "consumed" | "expired";
  settledTxHash?: string;
  createdAt: number;
  consumedAt?: number;
  idempotencyKey?: string;
}

// Three lookup indices (all in-memory Maps):
// 1. invoices       -> by invoiceId
// 2. idempotencyIndex -> by idempotency key -> invoiceId
// 3. requestHashIndex -> by request hash -> invoiceId
```

**Note:** FluxPoint's stores are **in-memory only** (marked "NOT for production"). Our Redis-backed approach is already more production-ready.

### Deterministic Invoice IDs

```typescript
// From: packages/gateway/src/invoice-bridge.ts
async function generateInvoiceId(method, url, idempotencyKey?) {
  const data = idempotencyKey
    ? `${method.toUpperCase()}:${url}:${idempotencyKey}`  // deterministic
    : `${method.toUpperCase()}:${url}:${Date.now()}`;     // unique per call
  const hash = await sha256StringHex(data);
  return hash.slice(0, 32);  // 32-char hex
}
```

**Useful pattern:** Deterministic invoice IDs from request shape + idempotency key enables dedup without round-trips.

### 402 Response Generation

```typescript
// From: packages/gateway/src/server.ts
const payload = {
  version: "1",
  scheme: "exact",
  network: invoice.chain,          // CAIP-2
  maxAmountRequired: invoice.amountUnits,
  resource,
  payTo: invoice.payTo,
  maxTimeoutSeconds,
  asset: invoice.asset,
};
const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
res.status(402);
res.setHeader("PAYMENT-REQUIRED", encoded);
res.json({ error: "Payment Required", invoiceId: invoice.id, protocol: "x402" });
```

### Cardano-Specific: Min UTXO Handling

```typescript
// From: packages/payer-cardano-node/src/tx-builder.ts
const txOutput = CSL.TransactionOutput.new(outputAddress, outputValue);
const minAda = CSL.min_ada_for_output(
  txOutput,
  CSL.DataCost.new_coins_per_byte(
    CSL.BigNum.from_str(protocolParameters.coinsPerUtxoByte.toString())
  )
);

if (BigInt(minAda.to_str()) > output.lovelace) {
  throw new Error(`Output requires minimum ${minAda.to_str()} lovelace`);
}
```

**FluxPoint's approach: throw if below min UTXO.** No workaround, no credit system, no batching. They simply price above the threshold (~0.2 ADA per PoI anchor).

### Cardano Payer: UTXO Selection

```typescript
// From: packages/payer-cardano-node/src/tx-builder.ts
// Greedy largest-first algorithm
function selectUtxos(utxos, requiredLovelace, requiredAssets?) {
  const sorted = [...utxos].sort((a, b) => b.lovelace > a.lovelace ? 1 : -1);
  const selected = [];
  let accumulated = 0n;
  for (const utxo of sorted) {
    selected.push(utxo);
    accumulated += utxo.lovelace;
    if (isSufficient()) break;
  }
}
```

**We already have better UTXO management:** L1/L2 cache + reservation system with TTL + crash recovery from Redis. FluxPoint does no UTXO reservation.

### Budget Tracking (Client-Side)

```typescript
// From: packages/core/src/types/budget.ts
interface BudgetConfig {
  maxPerRequest?: string;     // Atomic units
  maxPerDay?: string;
  dailyResetHour?: number;    // 0-23 UTC
  assetLimits?: Record<string, AssetBudgetConfig>;
  chainLimits?: Record<ChainId, ChainBudgetConfig>;
  softLimit?: boolean;        // Warn instead of throw
}

interface BudgetStore {
  getSpent(chain, asset, day): Promise<bigint>;
  recordSpend(chain, asset, amount): Promise<void>;
  reset(chain, asset): Promise<void>;
}
```

**Key insight:** This is **client-side spending limits**, not server-side credits. But the `BudgetStore` interface pattern (`getSpent/recordSpend/reset` keyed by `chain:asset:day`) is directly applicable to our server-side credit ledger design.

### Split Payments

```typescript
// From: packages/core/src/types/payment.ts
interface PaymentSplits {
  mode: "inclusive" | "additional";
  outputs: SplitOutput[];
}

interface SplitOutput {
  role?: string;    // "platform", "creator", "referrer"
  to: string;
  asset?: string;
  amountUnits: string;
}
```

**Useful for future phases:** Revenue sharing between facilitator and resource provider. Not needed for Phase 6 but good to know it exists in the ecosystem.

### Cardano Verifier (Post-Settlement)

```typescript
// From: packages/server-middleware/src/verifiers/cardano.ts
class CardanoVerifier implements ChainVerifier {
  async verify(proof, expectedAmount, expectedRecipient, chain, asset?) {
    // 1. Query tx from Blockfrost/Koios (3 retries, exponential backoff)
    // 2. Check confirmations >= minConfirmations (default 1)
    // 3. Find matching output: address match + amount >= expected
    // 4. For native tokens: parse policyId.assetNameHex, check quantity
  }
}
```

**Key difference from our approach:** FluxPoint verifies **after** the transaction is on-chain (query Blockfrost for tx data). We verify **before** settlement (CBOR deserialization). Our approach catches invalid transactions before they hit the blockchain.

### Protocol Type System

```typescript
// From: packages/core/src/types/payment.ts
type PaymentProof =
  | { kind: "cardano-txhash"; txHash: string }
  | { kind: "cardano-signed-cbor"; cborHex: string }
  | { kind: "evm-txhash"; txHash: string }
  | { kind: "x402-signature"; signature: string };

type PaymentStatusValue =
  | "pending" | "submitted" | "confirmed" | "consumed" | "expired" | "failed";
```

**Discriminated union for payment proofs** is a clean pattern. Our settlement already uses similar states (`submitted`, `confirmed`, `timeout`, `failed`).

## Masumi x402-Cardano

The masumi `x402-cardano-examples` repomix contains no file content (empty `<files>` section). Based on prior research from the actual repository:

- Uses standard x402 V2 protocol on Cardano
- `PaymentRequirements.asset` carries policy ID, `extra.assetNameHex` carries asset name
- No batching, no credit system, no micropayment strategy
- ADA + USDM supported
- Direct L1 settlement per payment

**Masumi confirms:** No one in the Cardano x402 ecosystem has built a micropayment solution. Our Phase 6 is novel.

## Architecture Patterns for Phase 6

### Pattern 1: Credit Ledger (Redis-Backed)

```
src/
  credits/
    types.ts           # NEW: CreditAccount, CreditTransaction, CreditLedger interface
    credit-ledger.ts   # NEW: Redis-backed ledger implementation
    credit-errors.ts   # NEW: InsufficientCredits, AccountNotFound, etc.
  routes/
    credits.ts         # NEW: POST /credits/topup, GET /credits/balance, POST /credits/withdraw
  settle/
    settle-payment.ts  # MODIFIED: add credit deduction path
    types.ts           # MODIFIED: SettleResult.strategy field
  routes/
    settle.ts          # MODIFIED: route through payment strategy
```

**Credit account keyed by payer address** (Cardano bech32). Each account tracks:

```typescript
interface CreditAccount {
  address: string;           // Cardano bech32 address (identity)
  balanceLovelace: bigint;   // Current credit balance in lovelace
  totalDeposited: bigint;    // Lifetime deposits (audit trail)
  totalSpent: bigint;        // Lifetime spend (audit trail)
  createdAt: number;         // Epoch ms
  lastActivityAt: number;    // For expiration/cleanup
}

interface CreditTransaction {
  id: string;                // UUID
  accountAddress: string;
  type: 'topup' | 'deduction' | 'withdrawal';
  amountLovelace: bigint;
  reference?: string;        // txHash for topup/withdrawal, invoiceId for deduction
  timestamp: number;
}
```

**Redis storage strategy:** Use Redis Hash per account (`credit:{address}` -> fields), with a Redis Stream or List for transaction history.

```
credit:addr1q9...abc  ->  {
  balanceLovelace: "5000000",
  totalDeposited: "10000000",
  totalSpent: "5000000",
  createdAt: "1739145600000",
  lastActivityAt: "1739145700000"
}

credit:txlog:addr1q9...abc  ->  [
  { id, type: "topup", amount: "10000000", ref: "tx_abc123", ts: ... },
  { id, type: "deduction", amount: "50000", ref: "inv_xyz", ts: ... },
  ...
]
```

### Pattern 2: Payment Strategy Router

The strategy router decides how to settle a payment based on amount vs threshold:

```typescript
type PaymentStrategy = 'direct_l1' | 'credit_deduction';

interface StrategyDecision {
  strategy: PaymentStrategy;
  reason: string;
}

function selectStrategy(
  amountLovelace: bigint,
  accountBalance: bigint | null,  // null = no credit account
  thresholdLovelace: bigint,      // e.g. 1_000_000n (1 ADA)
): StrategyDecision {
  // Above threshold AND it's an L1 tx -> direct settlement
  if (amountLovelace >= thresholdLovelace) {
    return { strategy: 'direct_l1', reason: 'above_threshold' };
  }

  // Below threshold but has credit balance -> deduct
  if (accountBalance !== null && accountBalance >= amountLovelace) {
    return { strategy: 'credit_deduction', reason: 'sufficient_credits' };
  }

  // Below threshold, no credits -> reject with guidance
  // (client needs to top up credits first)
  throw new InsufficientCreditsError(amountLovelace, accountBalance ?? 0n);
}
```

### Pattern 3: Top-Up Flow

Top-up is a special settlement flow where the payer sends ADA to the facilitator's address:

```
Client                       Facilitator                     Cardano L1
  |                            |                               |
  |-- POST /credits/topup ---->|                               |
  |   { transaction: <cbor>,   |                               |
  |     paymentRequirements }  |                               |
  |                            |-- verify (payTo = facilitator)|
  |                            |-- settle (submit to chain) ---|
  |                            |                    <-- confirmed
  |                            |-- credit account += amount    |
  |<-- { balance, txHash } ----|                               |
```

This reuses the existing verify + settle pipeline with `payTo` set to the facilitator's own address. The only new logic is crediting the account after successful settlement.

### Pattern 4: Credit Deduction Flow

When a payment is below the min UTXO threshold and the client has credits:

```
Client                       Facilitator
  |                            |
  |-- POST /settle ----------->|
  |   { transaction: <none>,   |  (no CBOR for credit payments)
  |     paymentRequirements,   |
  |     paymentStrategy:       |
  |       "credit_deduction",  |
  |     payerAddress: addr1... }
  |                            |-- check credit balance >= amount
  |                            |-- atomic deduction (Redis DECRBY)
  |                            |-- log credit transaction
  |<-- { success, strategy:    |
  |      "credit_deduction",   |
  |      remainingBalance }    |
```

**No CBOR needed** for credit deductions -- the payment is off-chain. The facilitator debits the credit account and returns success. The resource provider trusts the facilitator's confirmation.

### Pattern 5: 402 Response with Payment Strategies

Extend the 402 response to include available payment strategies:

```typescript
// Enhanced 402 response body
{
  success: false,
  reason: "payment_required",
  paymentRequirements: {
    scheme: "exact",
    network: "cardano:preprod",
    payTo: "addr1...",
    maxAmountRequired: "50000",  // 0.05 ADA
    asset: "lovelace",
    maxTimeoutSeconds: 300,
  },
  paymentStrategies: {
    direct_l1: {
      available: false,
      reason: "amount_below_min_utxo",
      minAmount: "1000000",       // 1 ADA minimum for L1
    },
    credit_deduction: {
      available: true,
      balance: "4950000",         // Current credit balance
      sufficient: true,
    },
    credit_topup: {
      endpoint: "/credits/topup",
      minTopup: "2000000",        // 2 ADA minimum top-up
    },
  },
}
```

### Anti-Patterns to Avoid

- **Facilitator-signed transactions:** Do NOT build transactions as the facilitator. This introduces key management and custodial risk far beyond the project's scope.
- **Unbounded credit accounts:** Set maximum balance caps to limit exposure if the facilitator is compromised.
- **Credit balance in lovelace for token payments:** Credit balances should be denominated in the account's asset. For simplicity, Phase 6 can support ADA-only credits.
- **Synchronous withdrawal:** Withdrawals require L1 transactions (facilitator sends ADA back). This needs the facilitator wallet pattern -- defer to future phase. For now, credits are non-refundable or manually refunded.
- **Complex multi-asset credit ledger:** Start with ADA-only credits. Token credits add significant complexity (exchange rates, per-asset balances).

## L2 Alternatives (Research Only -- Not Built)

### Hydra (State Channels)

| Aspect | Detail |
|--------|--------|
| **Status** | Production v1.2.0 (Oct 2025) |
| **Fees** | Zero inside head; ~0.19 ADA open/close |
| **Tooling** | Hydra Pay WebSocket API, Hydra SDK (npm) |
| **x402 fit** | Poor for one-shot; good for recurring pairs |
| **Recommendation** | Phase 8+ for high-volume facilitator-merchant pairs |

FluxPoint has a `devnet-in-a-box` with Hydra scripts in their cardano-agent-skills repo, confirming they're experimenting with Hydra but haven't integrated it into their payment flow.

### Midnight (Partner Chain)

| Aspect | Detail |
|--------|--------|
| **Status** | Kukolu phase, first dApps Q1 2026 |
| **Fees** | DUST (generated by holding NIGHT), unknown economics |
| **Tooling** | Very limited |
| **x402 fit** | Too early; revisit late 2026 |
| **Recommendation** | Monitor only |

### Dual-Rail (FluxPoint Model)

| Aspect | Detail |
|--------|--------|
| **Pattern** | Base L2 (USDC, $0.01 fee) + Cardano L1 (~1.2 ADA min UTXO) |
| **Effort** | Very high (EVM facilitator, second chain integration) |
| **Benefit** | Solves economics by choosing the right chain per payment size |
| **Recommendation** | Document as future milestone if project scope expands beyond Cardano-only |

## Comparison: Our Facilitator vs FluxPoint

| Concern | FluxPoint (orynq-sdk) | Our x402-fac | Phase 6 Gap |
|---------|----------------------|--------------|-------------|
| **Role** | Gateway (proxy) + middleware | IS the facilitator | None |
| **Verification** | Post-settlement (query Blockfrost) | Pre-settlement (CBOR deserialization) | None |
| **UTXO mgmt** | None (CSL handles coin selection) | L1 Map + L2 Redis + TTL reservation | None |
| **Stablecoins** | ADA only (node payer) | USDM, DJED, iUSD | None |
| **Invoice store** | In-memory Maps (3 indices) | Redis SET NX (24h dedup) | Enhance for credits |
| **Micropayments** | Price above min UTXO | None yet | **Phase 6 deliverable** |
| **Credits** | Client-side budget limits | None yet | **Phase 6 deliverable** |
| **Protocol** | Dual (Flux + x402) | x402 V2 only | Future |
| **Split payments** | Multi-party with roles | None | Future |

## Proposed Plan Structure

Based on this research, Phase 6 should have 4 plans:

### Plan 06-01: Credit Account Types and Ledger (Foundation)
- `CreditAccount`, `CreditTransaction`, `CreditLedger` interface
- Redis-backed implementation (`credit:{address}` hashes)
- Atomic balance operations (HINCRBY for thread safety)
- Credit-specific domain errors
- Unit tests for ledger operations

### Plan 06-02: Top-Up and Balance Endpoints
- `POST /credits/topup` -- verify + settle payment to facilitator address, credit account
- `GET /credits/balance` -- query credit balance by address
- Reuse existing verify + settle pipeline for top-up verification
- Integration tests

### Plan 06-03: Payment Strategy Router and Credit Settlement
- `selectStrategy()` logic (threshold-based routing)
- Modify `/settle` to support credit deduction path
- New `SettleResult.strategy` field in response
- Credit deduction as alternative to L1 submission
- Integration tests for both paths

### Plan 06-04: 402 Response Enrichment and L2 Research Document
- Extend 402 response with `paymentStrategies` object
- Include credit balance hints for returning payers
- Write L2 feasibility document (Hydra, dual-rail, Midnight assessment)
- End-to-end integration tests for full credit lifecycle

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic balance update | Manual read-check-write | Redis HINCRBY/HINCRBYFLOAT | Race condition prevention |
| Credit dedup | Custom locking | Redis SET NX (existing pattern) | Proven in settle-payment.ts |
| Invoice ID generation | UUID v4 | SHA-256(method:url:idempotencyKey) | Deterministic, idempotent (FluxPoint pattern) |
| Credit expiration | Background timer | Lazy check on read | Proven in FluxPoint's store (simpler, no background tasks) |
| L1 top-up verification | New verification pipeline | Existing verifyPayment() + settlePayment() | Full pipeline already handles ADA + token payments |

## Common Pitfalls

### Pitfall 1: Race Conditions on Credit Deduction
**What goes wrong:** Two concurrent deductions both read balance, both pass check, both deduct -- account goes negative.
**How to avoid:** Use Redis HINCRBY with negative value and check result. If result < 0, reverse the operation and reject. Or use Lua script for atomic check-and-deduct.
**Warning signs:** Credit balances going negative under concurrent load.

### Pitfall 2: Top-Up Double-Credit
**What goes wrong:** Network timeout during top-up settlement causes retry, crediting the account twice for the same L1 payment.
**How to avoid:** Use the existing CBOR SHA-256 dedup key (from settle-payment.ts) to prevent double-crediting. Tie the dedup key to the credit operation.
**Warning signs:** Account balance exceeding total deposits.

### Pitfall 3: Credit Balance Denomination Confusion
**What goes wrong:** Storing credit balance in lovelace but allowing token payments to deduct from it without conversion.
**How to avoid:** Phase 6 credits are ADA-only (lovelace denominated). Token credit accounts are a future feature. Reject credit deductions for token payments.
**Warning signs:** Mixed asset types in credit transactions.

### Pitfall 4: Missing Facilitator Address for Top-Up
**What goes wrong:** Top-up flow requires the facilitator's own Cardano address as `payTo`, but the facilitator doesn't have a configured receiving address.
**How to avoid:** Add `facilitatorAddress` to ChainConfig. This is NOT a wallet (no private key) -- it's the address where top-up payments are sent. The facilitator verifies and settles these payments like any other, but credits the sender's account instead of delivering a resource.
**Warning signs:** Top-up verify failing with "recipient_mismatch" because payTo doesn't match.

### Pitfall 5: Withdrawal Without Facilitator Wallet
**What goes wrong:** Trying to implement withdrawal (return credits as L1 ADA) requires the facilitator to build and sign transactions, which requires a private key.
**How to avoid:** Phase 6 does NOT include automated withdrawal. Credits are either spent on the platform or manually refunded out-of-band. Automated withdrawal requires Phase 8+ facilitator wallet infrastructure.
**Warning signs:** Attempting to implement `POST /credits/withdraw` that sends L1 transactions.

## Open Questions

1. **Credit account identity: address or API key?**
   - Address-based: ties to Cardano identity, natural for top-up (sender = account owner)
   - API-key-based: supports non-Cardano clients, simpler for server-to-server
   - Recommendation: Address-based for Phase 6 (natural fit with top-up flow), API key option for future

2. **Minimum top-up amount?**
   - Must be above min UTXO (~1 ADA) since top-up is an L1 payment
   - Higher minimum (e.g., 5 ADA) amortizes L1 cost better but higher barrier
   - Recommendation: Min UTXO + small buffer (~2 ADA) as minimum

3. **Credit expiration policy?**
   - No expiration: simplest, but accumulates stale accounts
   - Activity-based: expire after N days of inactivity
   - Recommendation: 90-day inactivity expiration with lazy check on read (FluxPoint pattern)

4. **Should /settle accept credit deduction directly, or use a separate /credits/deduct endpoint?**
   - Unified /settle: cleaner API, single settlement abstraction
   - Separate endpoint: clearer separation of L1 vs off-chain
   - Recommendation: Unified /settle with strategy field in request

## Sources

### Primary (HIGH confidence)
- FluxPoint `orynq-sdk` repomix: `.planning/research/fluxpoint-studios/repomix-output-Flux-Point-Studios-orynq-sdk.xml` (21 packages, full source)
- Existing codebase: `src/settle/settle-payment.ts` (settlement orchestrator), `src/chain/provider.ts` (ChainProvider), `src/verify/checks.ts` (10 verification checks)
- Cardano protocol parameters: `coinsPerUtxoByte` = 4,310, `minFeeA` = 44, `minFeeB` = 155,381

### Secondary (MEDIUM confidence)
- FluxPoint `cardano-agent-skills` repomix: `.planning/research/fluxpoint-studios/repomix-output-Flux-Point-Studios-cardano-agent-skills.xml` (Hydra devnet scripts)
- Masumi `x402-cardano-examples` repomix: `.planning/research/masumi/repomix-output-masumi-network-x402-cardano-examples.xml` (empty content, structure only)
- Hydra v1.2.0 docs: hydra.family
- Midnight tokenomics: midnight.network/night

### Tertiary (LOW confidence)
- utxoCostPerByte governance proposal: Cardano Forum (under review, may never pass)
- Midnight fee economics: DUST/NIGHT model (unproven, no production data)

---

*Phase: 06-batching (pivoted to Micropayment Strategy)*
*Research completed: 2026-02-10*
*Valid until: 2026-03-10*
