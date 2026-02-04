# Architecture Research: x402 Facilitator for Cardano

**Domain:** x402 Payment Facilitator - Cardano Blockchain
**Researched:** 2026-02-04
**Confidence:** MEDIUM (Cardano-specific patterns derived from x402-rs reference + EUTXO research)

## Standard Architecture

### System Overview

```
                                    ┌──────────────────────────────────────────────────────┐
                                    │                    HTTP Layer                         │
                                    │                 (Axum + CORS)                         │
                                    ├──────────────────────────────────────────────────────┤
                                    │  GET /           GET /health       GET /supported    │
                                    │  POST /verify    POST /settle                        │
                                    └───────────────────────┬──────────────────────────────┘
                                                            │
                                    ┌───────────────────────▼──────────────────────────────┐
                                    │              FacilitatorLocal                         │
                                    │         (Verification & Settlement)                   │
                                    │  - Routes requests by SchemeHandlerSlug               │
                                    │  - Aggregates supported() responses                   │
                                    └───────────────────────┬──────────────────────────────┘
                                                            │
                          ┌─────────────────────────────────┼─────────────────────────────────┐
                          │                                 │                                 │
              ┌───────────▼───────────┐       ┌─────────────▼─────────────┐       ┌──────────▼──────────┐
              │     ChainRegistry      │       │     SchemeBlueprints      │       │    SchemeRegistry   │
              │  (Provider Lookup)     │       │    (Scheme Factories)     │       │  (Handler Lookup)   │
              └───────────┬───────────┘       └───────────────────────────┘       └──────────┬──────────┘
                          │                                                                   │
              ┌───────────▼───────────┐                                         ┌─────────────▼─────────────┐
              │  CardanoChainProvider  │                                         │ V2CardanoExactFacilitator │
              │  - RPC client          │◄────────────────────────────────────────│ - verify()                │
              │  - Signing key(s)      │                                         │ - settle()                │
              │  - UTXO management     │                                         │ - supported()             │
              │  - Batch queue         │                                         └───────────────────────────┘
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │   Cardano Network      │
              │  (Preview/Mainnet)     │
              └───────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| HTTP Handlers | Accept verify/settle requests, return JSON responses | Axum routes with CORS middleware |
| FacilitatorLocal | Route requests to correct scheme handler by chain+scheme slug | Generic wrapper over SchemeRegistry |
| ChainRegistry | Store and lookup chain providers by ChainId or pattern | HashMap<ChainId, CardanoChainProvider> |
| SchemeBlueprints | Factory for creating scheme handlers from providers | HashMap<String, X402SchemeBlueprint> |
| SchemeRegistry | Runtime lookup of active handlers by SchemeHandlerSlug | HashMap<SchemeHandlerSlug, Box<dyn X402SchemeFacilitator>> |
| CardanoChainProvider | Cardano RPC interaction, transaction building, signing, UTXO management | Pallas/CML + custom UTXO tracking |
| V2CardanoExactFacilitator | Verify Cardano payment signatures, settle via transaction submission | Implements X402SchemeFacilitator trait |
| BatchQueue | Aggregate pending settlements for economic efficiency | In-memory queue with periodic flush |

## Recommended Project Structure

```
x402-cardano-facilitator/
├── Cargo.toml
├── src/
│   ├── main.rs                   # Entry point, server setup
│   ├── lib.rs                    # Public API exports
│   ├── config.rs                 # Configuration loading
│   ├── run.rs                    # Server initialization
│   │
│   ├── chain/                    # Cardano chain provider
│   │   ├── mod.rs
│   │   ├── provider.rs           # CardanoChainProvider implementation
│   │   ├── config.rs             # Cardano-specific configuration
│   │   ├── types.rs              # Address, Amount, ChainReference
│   │   ├── utxo.rs               # UTXO tracking and selection
│   │   └── rpc.rs                # Cardano node RPC client wrapper
│   │
│   ├── scheme/                   # Payment scheme implementations
│   │   ├── mod.rs
│   │   ├── v2_cardano_exact/     # V2 exact scheme for Cardano
│   │   │   ├── mod.rs            # X402SchemeId implementation
│   │   │   ├── types.rs          # Scheme-specific types
│   │   │   ├── facilitator.rs    # X402SchemeFacilitator implementation
│   │   │   ├── verify.rs         # Signature/payload verification
│   │   │   └── settle.rs         # Settlement transaction building
│   │   └── registry.rs           # Scheme registration helpers
│   │
│   ├── batch/                    # Settlement batching system
│   │   ├── mod.rs
│   │   ├── queue.rs              # Pending settlement queue
│   │   ├── aggregator.rs         # Batch transaction builder
│   │   └── scheduler.rs          # Periodic batch submission
│   │
│   └── handlers/                 # HTTP handlers (optional if using x402-facilitator-local)
│       ├── mod.rs
│       └── routes.rs
│
├── tests/
│   ├── integration/
│   │   ├── verify_test.rs
│   │   ├── settle_test.rs
│   │   └── batch_test.rs
│   └── fixtures/
│
└── config/
    ├── config.json.example
    └── preview.json              # Preview testnet config
```

### Structure Rationale

- **chain/:** Isolates all Cardano-specific logic. CardanoChainProvider owns UTXO state and transaction building. This mirrors x402-rs pattern of chain-specific crates.
- **scheme/:** Each scheme gets its own module with types, verification, and settlement logic. Follows x402-rs pattern of `v{version}_{namespace}_{scheme}/` naming.
- **batch/:** Cardano-specific batching is a first-class concern due to min UTXO. Separated from chain to allow different batching strategies.
- **handlers/:** Optional - can reuse `x402-facilitator-local::handlers` if implementing standard `Facilitator` trait.

## Architectural Patterns

### Pattern 1: Registry Pattern (from x402-rs)

**What:** Separate blueprint registration from runtime handler lookup. Blueprints are factories; registry holds built instances.
**When to use:** Always - this is the x402-rs core pattern.
**Trade-offs:** Slightly more indirection, but enables configuration-driven scheme enabling and per-chain handlers.

**Example:**
```rust
// Blueprint registration at startup
let blueprints = SchemeBlueprints::new()
    .and_register(V2CardanoExact);

// Registry built from config + blueprints
let registry = SchemeRegistry::build(chain_registry, blueprints, &scheme_configs);

// Runtime lookup by slug
let handler = registry.by_slug(&SchemeHandlerSlug {
    chain_id: "cardano:preview".parse().unwrap(),
    x402_version: 2,
    name: "exact".to_string(),
});
```

### Pattern 2: Provider Abstraction (CardanoChainProviderLike trait)

**What:** Define trait for Cardano operations that facilitators need. Provider implements trait; facilitator depends on trait.
**When to use:** When building the chain provider to allow testing with mocks.
**Trade-offs:** More code, but enables unit testing without real network.

**Example:**
```rust
pub trait CardanoChainProviderLike: Send + Sync {
    fn get_utxos(&self, address: &Address) -> impl Future<Output = Result<Vec<Utxo>, Error>> + Send;
    fn submit_transaction(&self, tx: &Transaction) -> impl Future<Output = Result<TxHash, Error>> + Send;
    fn verify_signature(&self, payload: &SignedPayload) -> Result<Address, Error>;
    fn chain_id(&self) -> ChainId;
    fn signer_addresses(&self) -> Vec<String>;
}
```

### Pattern 3: Deferred Settlement via Batch Queue

**What:** Instead of immediate settlement, queue verified payments and batch-settle periodically.
**When to use:** Cardano requires this due to ~1.2 ADA min UTXO making per-payment settlement uneconomical for small amounts.
**Trade-offs:** Delayed finality (seconds to minutes), more complex state management, but economically viable micropayments.

**Example:**
```rust
pub struct BatchQueue {
    pending: RwLock<Vec<VerifiedPayment>>,
    max_batch_size: usize,     // e.g., 50 payments per tx
    flush_interval: Duration,   // e.g., 30 seconds
}

impl BatchQueue {
    pub async fn enqueue(&self, payment: VerifiedPayment) -> SettlementHandle {
        // Add to pending, return handle for status polling
    }

    pub async fn flush(&self, provider: &impl CardanoChainProviderLike) -> Result<TxHash, Error> {
        // Build single transaction with multiple outputs
        // Submit and return tx hash
    }
}
```

## Data Flow

### Verify Flow

```
Client sends POST /verify
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ HTTP Handler                                                     │
│ - Parse JSON body into proto::VerifyRequest                      │
│ - Extract scheme_handler_slug from request                       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ FacilitatorLocal.verify()                                        │
│ - Lookup handler by slug in SchemeRegistry                       │
│ - Delegate to handler.verify()                                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ V2CardanoExactFacilitator.verify()                               │
│ 1. Parse request into Cardano-typed VerifyRequest                │
│ 2. Verify accepted == requirements (buyer agreed to terms)       │
│ 3. Verify chain_id matches provider                              │
│ 4. Verify signature: recover signer address from payload         │
│    - For Cardano: CIP-8/CIP-30 message signing verification      │
│ 5. Check balance: query UTXOs for payer address                  │
│    - For ADA: sum Lovelace values                                │
│    - For tokens: filter by policy_id + asset_name                │
│ 6. Return VerifyResponse with payer address                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
                    Return JSON { isValid: true, payer: "addr1..." }
```

### Settle Flow (Immediate - For High-Value Payments)

```
Client sends POST /settle
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ V2CardanoExactFacilitator.settle() [immediate mode]              │
│ 1. Re-verify payment (same as verify flow)                       │
│ 2. Build Cardano transaction:                                    │
│    a. Select facilitator UTXOs for fees                          │
│    b. Create output to payTo address with amount                 │
│    c. Add change output to facilitator address                   │
│    d. Set TTL, calculate fees                                    │
│    e. Add payload metadata (tx label)                            │
│ 3. Sign transaction with facilitator key                         │
│ 4. Submit to Cardano node                                        │
│ 5. Wait for confirmation (or return immediately with tx hash)    │
│ 6. Return SettleResponse with tx hash                            │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
                    Return JSON { success: true, transaction: "tx_hash...", network: "cardano:preview" }
```

### Settle Flow (Batched - For Micropayments)

```
Client sends POST /settle
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ V2CardanoExactFacilitator.settle() [batched mode]                │
│ 1. Re-verify payment                                             │
│ 2. Enqueue to BatchQueue, get settlement handle                  │
│ 3. Return SettleResponse with "pending" status + handle_id       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼ (later, on flush interval or batch full)
┌─────────────────────────────────────────────────────────────────┐
│ BatchQueue.flush()                                               │
│ 1. Collect all pending payments                                  │
│ 2. Build single transaction with N outputs (one per payment)     │
│    - Each output: (payTo_address, amount, asset)                 │
│    - Single change output for facilitator                        │
│    - One fee for entire batch                                    │
│ 3. Submit transaction                                            │
│ 4. Update all settlement handles with tx hash                    │
└─────────────────────────────────────────────────────────────────┘
```

### Key Data Flows

1. **Signature Verification:** PaymentPayload contains CIP-8/CIP-30 signed message. Facilitator recovers public key from signature, derives address, confirms it matches claimed payer.

2. **Balance Check:** Query Cardano node for UTXOs at payer address. For ADA, sum Lovelace values. For tokens (DJED, iUSD), filter by policy ID and asset name, sum quantities.

3. **Transaction Building:** Use Pallas or CML to construct valid Cardano transaction. Key considerations:
   - Min UTXO requirement (~1.2 ADA per output)
   - Fee calculation (based on tx size)
   - UTXO selection (avoid dust, prefer consolidation)
   - Metadata attachment (for audit trail, payload reference)

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 payments/day | Single instance, immediate settlement, no batching needed |
| 100-1000 payments/day | Single instance, batching enabled, batch every 1-5 minutes |
| 1000-10000 payments/day | Multiple facilitator instances, shared batch queue (Redis), batch every 30 seconds |
| 10000+ payments/day | Horizontal scaling, dedicated batch workers, consider L2 (Midgard) for settlement |

### Scaling Priorities

1. **First bottleneck: Transaction building CPU** - Pallas/CML transaction building is CPU-bound. For high throughput, pre-build transaction templates.

2. **Second bottleneck: UTXO fragmentation** - Many small payments create many UTXOs. Implement periodic UTXO consolidation transactions.

3. **Third bottleneck: Cardano block space** - ~20 second block time, limited transactions per block. Batch aggressively to fit more payments per transaction.

## Anti-Patterns

### Anti-Pattern 1: Immediate Settlement for All Payments

**What people do:** Submit a Cardano transaction for every /settle call, regardless of payment size.
**Why it's wrong:** With ~1.2 ADA min UTXO and ~0.17-0.2 ADA fees, settling a 0.05 ADA micropayment costs more than the payment value. Uneconomical and wasteful.
**Do this instead:** Implement batching. Queue payments below a threshold (e.g., 5 ADA), batch-settle periodically. Settle immediately only for high-value payments.

### Anti-Pattern 2: Stateless UTXO Handling

**What people do:** Query UTXOs fresh for every transaction, assume UTXOs from query are available.
**Why it's wrong:** Cardano UTXO model means UTXOs can only be spent once. Between query and submission, another transaction (or batch) may have consumed a UTXO, causing transaction failure.
**Do this instead:** Maintain UTXO state in memory. Track "reserved" UTXOs during transaction building. Implement UTXO locking with TTL. Handle UTXO consumption failures gracefully with retry.

### Anti-Pattern 3: Single Output Per Transaction

**What people do:** Build one transaction per payment, each with one output.
**Why it's wrong:** Pays full transaction overhead (fee, min UTXO) for every payment. Wasteful when batching is possible.
**Do this instead:** Batch multiple payments into single transaction with multiple outputs. One fee covers entire batch. Amortizes min UTXO overhead across payments.

### Anti-Pattern 4: Ignoring Min UTXO for Tokens

**What people do:** Try to send only the token amount (e.g., 10 DJED) without accompanying ADA.
**Why it's wrong:** Cardano requires min UTXO (~1.2 ADA) for any output, including token outputs. Transaction will fail.
**Do this instead:** Always include min UTXO ADA with token outputs. Factor this into pricing or require payer to cover it.

## Cardano-Specific Design Decisions

### CAIP-2 Chain ID for Cardano

Use CAIP-2 format: `cardano:{network_magic}`

| Network | Chain ID |
|---------|----------|
| Mainnet | `cardano:764824073` |
| Preview | `cardano:2` |
| Preprod | `cardano:1` |

### Signature Scheme

Use CIP-8 / CIP-30 message signing for payment authorization:

- Client signs payment payload with wallet private key
- Payload includes: amount, asset, payTo, validUntil
- Facilitator verifies signature, recovers public key, derives payment address
- Supports hardware wallets, browser wallets (Nami, Eternl, etc.)

### Transaction Metadata for Audit Trail

Use Cardano transaction metadata to store x402 payment reference:

- Metadata label: Custom (e.g., `402`) or align with FluxPoint (label `2222`)
- Contents: Hash of PaymentPayload, resource URL reference, facilitator ID
- Enables on-chain audit trail, proof of payment

### Token Support

| Asset Type | Cardano Representation | Amount Handling |
|------------|------------------------|-----------------|
| ADA (native) | Lovelace (1 ADA = 1,000,000 Lovelace) | Integer, no decimals |
| DJED | Native asset with policy_id | Integer quantity, policy defines decimals |
| iUSD | Native asset with policy_id | Integer quantity, policy defines decimals |

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Cardano Node | JSON-RPC or Ogmios | Blockfrost API as fallback, but prefer own node for reliability |
| UTXO Query | Query by address | Pagination for wallets with many UTXOs |
| Transaction Submit | Submit and monitor | Webhooks or polling for confirmation |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| HTTP Layer to FacilitatorLocal | Direct function call | Same process, Arc<FacilitatorLocal> shared state |
| FacilitatorLocal to Scheme Handler | Trait method via dyn X402SchemeFacilitator | Handler selected by slug lookup |
| Scheme Handler to Chain Provider | Trait method via CardanoChainProviderLike | Enables testing, mocking |
| Scheme Handler to Batch Queue | Async channel or shared state | For batched settlements |

## Build Order Dependencies

Based on the architecture, suggested build order:

### Phase 1: Foundation
1. **chain/types.rs** - Address, ChainId, Amount types
2. **chain/config.rs** - Configuration structures
3. **chain/provider.rs** - CardanoChainProviderLike trait definition
4. **chain/rpc.rs** - Basic Cardano node RPC client

**Rationale:** Types and traits first. No external dependencies yet.

### Phase 2: Chain Provider Implementation
1. **chain/utxo.rs** - UTXO tracking, selection algorithms
2. **chain/provider.rs** - Full CardanoChainProvider implementation

**Rationale:** Needs types from Phase 1. Core building block for all subsequent work.

### Phase 3: Scheme Verification
1. **scheme/v2_cardano_exact/types.rs** - Scheme-specific types
2. **scheme/v2_cardano_exact/verify.rs** - Signature verification, balance check
3. **scheme/v2_cardano_exact/mod.rs** - X402SchemeId implementation

**Rationale:** Verification can work standalone. No settlement yet.

### Phase 4: Settlement (Immediate)
1. **scheme/v2_cardano_exact/settle.rs** - Transaction building, submission

**Rationale:** Requires working chain provider from Phase 2.

### Phase 5: Batching
1. **batch/queue.rs** - Pending payment queue
2. **batch/aggregator.rs** - Multi-output transaction building
3. **batch/scheduler.rs** - Periodic flush logic

**Rationale:** Enhancement to settlement. Can be added after basic settlement works.

### Phase 6: Integration
1. **scheme/v2_cardano_exact/facilitator.rs** - X402SchemeFacilitator implementation
2. **scheme/registry.rs** - Registration helpers
3. **main.rs**, **run.rs**, **config.rs** - Server setup

**Rationale:** Brings all components together.

## Sources

**x402-rs Reference Implementation:**
- [x402-rs GitHub Repository](https://github.com/x402-rs/x402-rs) - Source code analysis (HIGH confidence)
- [Build Your Own Facilitator Guide](https://github.com/x402-rs/x402-rs/blob/main/docs/build-your-own-facilitator.md) (HIGH confidence)
- [How to Write a Scheme Guide](https://github.com/x402-rs/x402-rs/blob/main/docs/how-to-write-a-scheme.md) (HIGH confidence)

**Cardano EUTXO Model:**
- [Extended UTXO Model - Cardano Docs](https://docs.cardano.org/about-cardano/learn/eutxo-explainer) (HIGH confidence)
- [Concurrent & Deterministic Batching on UTXO Ledger](https://medium.com/meld-labs/concurrent-deterministic-batching-on-the-utxo-ledger-99040f809706) (MEDIUM confidence)
- [Architecting DApps on the EUTXO Ledger](https://www.iog.io/news/architecting-dapps-on-the-eutxo-ledger) (HIGH confidence)

**Cardano Rust SDKs:**
- [Pallas - Rust-native Cardano building blocks](https://github.com/txpipe/pallas) (HIGH confidence)
- [cardano-serialization-lib](https://docs.rs/cardano-serialization-lib) (HIGH confidence)
- [Cardano Multiplatform Lib (CML)](https://dcspark.github.io/cardano-multiplatform-lib/) (HIGH confidence)

**Cardano Signature Verification:**
- [CIP-8 Message Signing](https://cips.cardano.org/cip/CIP-8) (HIGH confidence)
- [cardano-verify-datasignature](https://github.com/cardano-foundation/cardano-verify-datasignature) (MEDIUM confidence - TypeScript, pattern reference)
- [cardano-signer CLI](https://github.com/gitmachtl/cardano-signer) (MEDIUM confidence - CLI, pattern reference)

**x402 on Cardano:**
- [Patrick Tobler x402 demo](https://x.com/Padierfind) (MEDIUM confidence - referenced in resources)
- [FluxPoint Studios x402 API](https://x.com/fluxpointstudio/status/2014786872502038541) (MEDIUM confidence - pricing/architecture reference)

---
*Architecture research for: x402 Cardano Facilitator*
*Researched: 2026-02-04*
