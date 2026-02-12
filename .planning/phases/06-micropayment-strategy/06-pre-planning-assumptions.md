# Phase 6: Batching - Pre-Planning Assumptions

**Gathered:** 2026-02-10
**Status:** Pre-planning analysis (before CONTEXT.md)
**Confidence:** MEDIUM -- fundamental design questions remain open

## Summary

Phase 6 as originally scoped ("aggregate multiple payments into single transactions") is **architecturally incompatible** with the transaction-based verification model built in Phases 3-5. Clients pre-sign individual transactions referencing specific UTXOs with their own witnesses -- these cannot be naively merged. This was flagged by both auditors and captured in pending todo #5.

Deeper research into FluxPoint Studios' x402+Cardano implementation and the broader Cardano ecosystem confirms: **no one has published a working solution for sub-min-UTXO micropayments on Cardano L1**. FluxPoint sidesteps the problem entirely by pricing above the threshold (~0.2 ADA per anchor) and offering a dual-rail model (Base L2 for cheap payments, Cardano L1 for audit trails).

The core economic problem: Cardano's min UTXO (~1.0-1.4 ADA depending on output type) means every on-chain payment carries a minimum effective cost of ~$0.40-0.60 USD, regardless of the payment amount. This is a potential blocker for facilitator adoption when competing chains offer near-zero fees.

## Assumption 1: Technical Approach

### The Incompatibility

The current settlement flow accepts client-signed CBOR transactions and submits them as-is to Blockfrost. Each transaction:
- References specific UTXOs as inputs (signed over by the client)
- Has its own witness set (VKey signatures)
- Is independently valid and independently settled

You **cannot combine** pre-signed transactions into a batch. The signatures cover the full transaction body -- changing inputs/outputs invalidates the witnesses.

### Options Considered

| Approach | Description | Complexity | New Requirements |
|----------|-------------|------------|------------------|
| **Collect-then-redistribute** | Accept individual L1 txs, batch redistribute in a facilitator-signed tx | High | Facilitator wallet, key management, ADA float |
| **Threshold-only (deferred settlement)** | Queue small payments, settle individually on a schedule | Low | Queue persistence, timer |
| **Remove Phase 6** | Accept each payment as a separate L1 tx | None | Renumber phases |
| **L2 settlement (Hydra)** | Open payment channels for recurring pairs | Very High | Hydra node, channel lifecycle |
| **Dual-rail (FluxPoint model)** | Cheap payments on Base/EVM L2, Cardano for high-value + audit | High | EVM integration, second facilitator |
| **Midnight partner chain** | Settle micropayments on Midnight instead of Cardano L1 | Very High | Midnight SDK, new chain integration |
| **Prepaid credit accounts** | Off-chain ledger, periodic L1 settlement | Medium | Account system, trust model |

### Assumption

The most pragmatic near-term approach is either **threshold-only deferred settlement** (simplest) or **prepaid credit accounts** (most user-friendly). Collect-then-redistribute adds custodial complexity that may not be justified for a learning project. L2 solutions (Hydra, Midnight) are too early-stage for immediate adoption but should be tracked.

## Assumption 2: Cardano L1 Economics

### Current Protocol Parameters (Conway Era)

| Parameter | Value | Impact |
|-----------|-------|--------|
| `minFeeA` (txFeePerByte) | 44 lovelace/byte | ~0.17 ADA per simple transfer |
| `minFeeB` (txFeeFixed) | 155,381 lovelace | Fixed base fee |
| `coinsPerUtxoByte` | 4,310 lovelace/byte | Drives min UTXO calculation |
| `maxTxSize` | 16,384 bytes | ~40-60 outputs per batch tx |

### Min UTXO by Output Type

| Output Type | Min ADA | USD Equivalent (~$0.40/ADA) |
|-------------|---------|----------------------------|
| ADA-only | ~0.97 ADA | ~$0.39 |
| 1 native token (e.g., USDM) | ~1.17 ADA | ~$0.47 |
| 3 native tokens (3 policy IDs) | ~1.56 ADA | ~$0.62 |

### Transaction Fee Economics

| Scenario | Cost | Per-Payment Cost |
|----------|------|-----------------|
| 1 payment, 1 tx | ~0.17 ADA fee + ~1.0 ADA min UTXO | ~1.17 ADA |
| 10 payments, 1 batch tx | ~0.20 ADA fee + 10 * ~1.0 ADA min UTXO | ~1.02 ADA |
| 50 payments, 1 batch tx | ~0.30 ADA fee + 50 * ~1.0 ADA min UTXO | ~1.01 ADA |

**Key insight:** Batching amortizes the *transaction fee* (~0.17 ADA) across N payments, but the *min UTXO* (~1.0 ADA) applies per output and cannot be amortized. This means batching provides marginal savings (~15%) on Cardano L1, unlike EVM L2s where batching can reduce per-payment costs by 90%+.

### Governance Proposal: Reduce utxoCostPerByte

A proposal exists to reduce `utxoCostPerByte` from 4,310 to 400 lovelace (~90% reduction). This would lower min UTXO from ~1.0 ADA to ~0.10 ADA, fundamentally changing the micropayment calculus. Status: under parameter committee review since 2024, **not yet ratified**. Arguments against include blockchain bloat and spam risk.

## Assumption 3: FluxPoint Studios Analysis

### What They Built

FluxPoint Studios operates a dual-rail x402 API service for AI inference:

| Rail | Chain | Fee | Use Case |
|------|-------|-----|----------|
| Base (USDC) | Base L2 (EVM) | ~$0.01 | High-volume, USD-native, batch target N=50 |
| Cardano (ADA) | Cardano L1 | ~1.2 ADA min UTXO | Cardano ecosystem, audit trails, Proof-of-Inference |

### Key Technical Findings (from `orynq-sdk` monorepo)

| Area | FluxPoint Approach | Our Approach |
|------|-------------------|--------------|
| **Library** | CSL (Emurgo cardano-serialization-lib) | Lucid Evolution + CML |
| **Protocol** | Custom "Flux" protocol + x402 bridge | Standard x402 V2 (Coinbase spec) |
| **Verification** | Post-settlement (query tx on-chain) | Pre-settlement (CBOR deserialization) |
| **UTXO management** | None (CSL handles) | L1 Map + L2 Redis + TTL reservation |
| **Stablecoins** | ADA only (`["ADA", "ada", "lovelace"]`) | USDM, DJED, iUSD (Phase 5 complete) |
| **Batching** | Not implemented on Cardano | Phase 6 (this analysis) |
| **Min UTXO handling** | Throws if output < min UTXO, prices above threshold | checkMinUtxo verification check |
| **Pricing** | Tiered 0.05-0.10 ADA (documented) but tx-builder rejects < min UTXO | Per-payment, amount in PaymentRequirements |

### What FluxPoint Does NOT Solve

- **Sub-min-UTXO payments**: Their tx-builder throws if output < `min_ada_for_output()`. No workaround.
- **Payment batching on Cardano**: No accumulation, pooling, or batch settlement. Only metadata batching (combining PoI anchors into one metadata payload).
- **Stablecoin payments**: Node payer is ADA-only.
- **Credit/prepaid model**: No mechanism for sub-threshold payments via account balances.

### What We Can Learn from FluxPoint

1. **Dual-rail is a valid pattern.** Cheap payments on an EVM L2, high-value payments on Cardano L1. This acknowledges Cardano's L1 economics rather than fighting them.
2. **Proof-of-Inference anchoring** uses Cardano metadata (label 2222) at ~0.2 ADA per anchor -- an example of Cardano L1 as an audit/proof layer rather than a payment rail.
3. **Split payments** (multi-party with roles like "platform", "creator", "referrer") are a useful extension for facilitator economics.
4. **Protocol bridging** (their gateway translates between Flux and x402 protocols) shows how to support multiple payment protocols behind a single API.

## Assumption 4: L2/Sidechain Alternatives

### Hydra (L2 State Channels)

- **Status:** Production-ready v1.2.0 (October 2025)
- **Fees:** Zero inside a head; ~0.19 ADA to open/close
- **Pros:** True micropayments, same tx format as L1 (isomorphic), Hydra Pay WebSocket API exists
- **Cons:** Requires both parties online, pre-funded channels, head lifecycle overhead only amortizes over many payments between same pair
- **x402 fit:** Poor for one-shot payments (current model). Good for recurring facilitator-merchant pairs with high volume.
- **Tooling:** Hydra Pay (obsidiansystems), Hydra SDK (npm), Hydrozoa (lightweight variant, Fund 14)

### Midnight (Cardano Partner Chain)

- **Status:** NIGHT token launched December 2025, Kukolu phase (stable mainnet), first dApps Q1 2026
- **Fee model:** DUST (non-transferable, generated by holding NIGHT) -- fundamentally different from Cardano L1
- **Pros:** Privacy-preserving (ZK proofs), potentially lower effective fees, cross-chain bridges planned
- **Cons:** Very early stage, fee economics unproven, requires completely separate payment flow, limited tooling
- **x402 fit:** Too early to build on. Revisit late 2026 when fee economics are proven and developer tooling matures.

### Leios (L1 Consensus Upgrade)

- **Status:** CIP-0164, targeting Q1 2026 rollout
- **Impact:** 30-65x throughput increase (from ~4.5 to ~140-300 TxkB/s)
- **Does NOT** reduce per-transaction fees or min UTXO -- purely a throughput upgrade
- **x402 fit:** No direct impact on micropayment economics

### Summary: L2 Readiness

| Solution | Readiness | Effort | Min UTXO Impact | Recommendation |
|----------|-----------|--------|-----------------|----------------|
| Hydra channels | Production v1.2.0 | High | Eliminates (zero in-head) | Phase 8+ for recurring pairs |
| Hydrozoa (lightweight Hydra) | Prototype (Fund 14) | High | Eliminates | Watch, too early |
| Midnight | Early mainnet | Very High | Unknown | Revisit late 2026 |
| Leios | Q1 2026 | Zero | None | No action needed |
| utxoCostPerByte reduction | Under governance | Zero | ~90% reduction | Watch and hope |

## Assumption 5: Scope Boundaries

### What Phase 6 Could Realistically Deliver

**Option A: Deferred Settlement (Low Complexity)**
- Redis-backed payment queue
- Amount threshold: above threshold = immediate settlement (current flow), below = queued
- Timer-based flush: settle queued payments individually on a schedule (e.g., every 5 minutes)
- Individual payment status tracking through queue lifecycle
- No new key management, no custodial risk
- **Does not reduce min UTXO cost** -- just defers when the payment settles

**Option B: Prepaid Credit Accounts (Medium Complexity)**
- Off-chain account balance per payer address
- Payer tops up account with a single L1 payment (above min UTXO)
- Subsequent API calls deduct from account balance (off-chain)
- Periodic L1 settlement when account balance reaches threshold
- Requires trust model (facilitator holds funds)
- **Actually solves micropayment economics** -- many small payments, one L1 tx

**Option C: Dual-Rail (High Complexity, FluxPoint Model)**
- Add EVM L2 settlement alongside Cardano L1
- Cheap payments (~$0.01) on Base/Arbitrum
- High-value + audit payments on Cardano L1
- Requires EVM facilitator integration
- **Solves economics by choosing a different chain for micropayments**

### What Should Be Out of Scope

- Facilitator-signed transaction construction (key management is a major leap)
- Hydra channel integration (too complex for current phase)
- Midnight integration (too early)
- Dynamic threshold tuning
- Multi-asset batching (batch ADA separately from tokens)

## Assumption 6: Risk Areas

### Critical Risks

1. **Diminishing returns from L1 batching.** Unlike EVM where batching reduces gas costs dramatically, Cardano's min UTXO per output means batching only saves the ~0.17 ADA tx fee, not the ~1.0 ADA min UTXO. The ROI on building batch infrastructure may not justify the complexity.

2. **Custodial risk (if collect-then-redistribute).** The project currently has zero private key handling. Adding a facilitator wallet introduces custodial responsibility, even for a learning project. Loss of keys = loss of user funds.

3. **Phase 6 may need fundamental redesign.** The roadmap deliverables ("batch queue," "multi-output transaction construction," "threshold logic") assume batching is economically beneficial. On Cardano L1, it's marginal. The phase goal may need to shift from "batching for economics" to "payment UX for micropayments."

4. **User cost floor.** Regardless of approach, Cardano L1 imposes a ~1.0 ADA minimum per payment output. Users of this facilitator will pay at least ~$0.40 per payment. This is competitive for medium-value transactions ($5+) but not viable for true micropayments ($0.01-0.10).

### Open Questions Requiring User Decision

1. **Should Phase 6 remain "Batching" or pivot to "Micropayment Strategy"?** The original goal (economic viability via batching) may be better served by prepaid accounts or dual-rail than by L1 batching.

2. **Is the ~1.0 ADA minimum acceptable for the facilitator's target use case?** If the primary use case is file storage (Phase 7), what's the expected price per upload? If it's >1 ADA, the min UTXO is a non-issue.

3. **Should we invest in L2 research (Hydra/Midnight) now, or defer?** Both are early-stage but could fundamentally change the architecture.

4. **Is the FluxPoint dual-rail model appealing?** Adding an EVM L2 rail would solve economics but adds significant scope.

## Assumption 7: Dependencies

### Existing (Ready)

| Dependency | Status | Used For |
|------------|--------|----------|
| Redis (ioredis) | Wired in Phase 2 | Queue persistence, dedup |
| Lucid Evolution | Integrated in Phase 2 | Potential tx building (if facilitator-signed) |
| BlockfrostClient | Extended in Phase 4 | submitTransaction, getTransaction |
| UTXO reservation | Built in Phase 2 | Could extend for batch reservation |
| Verification pipeline | Complete (Phase 5) | Re-verify before any settlement |
| Settlement orchestrator | Complete (Phase 4) | Base for deferred settlement |

### Missing (Would Need to Build)

| Dependency | Needed For | Complexity |
|------------|-----------|------------|
| Facilitator wallet | Collect-then-redistribute | High (key management, address derivation, funding) |
| Payment queue | Deferred settlement | Low (Redis list/sorted set) |
| Account ledger | Prepaid credits | Medium (off-chain balance tracking, reconciliation) |
| EVM facilitator | Dual-rail | Very High (entire second chain integration) |
| Hydra node | L2 channels | Very High (infrastructure, channel lifecycle) |

## FluxPoint Reference Materials

### Source Documents
- FluxPoint Docs: https://docs.fluxpointstudios.com/
- FluxPoint GitHub: https://github.com/Flux-Point-Studios (21 repos, `orynq-sdk` is the main monorepo)
- Proof-of-Inference: Cryptographic receipts anchored to Cardano metadata label 2222

### Architecture Highlights
- Gateway bridges x402 (EVM) and custom Flux protocol (Cardano)
- `payer-cardano-node` uses CSL for tx building with greedy coin selection
- `server-middleware` verifies payments post-settlement via Blockfrost/Koios
- Split payments support multi-party roles (platform, creator, referrer)
- Anchor worker processes PoI anchors sequentially (no batching)

### Pricing Model
- Base (USDC): ~$0.01 fee, batch target N=50 requests
- Cardano (ADA): ~1.2 ADA min UTXO, tiered pricing 0.05-0.10 ADA (documented but tx-builder rejects < min UTXO)
- AI inference pricing: 92-97% cheaper than direct provider APIs (via x402 settlement)

## Sources

### Primary (HIGH confidence)
- FluxPoint `orynq-sdk` monorepo: `payer-cardano-node/src/tx-builder.ts`, `server-middleware/src/verifiers/cardano.ts`, `gateway/` package
- Cardano protocol parameters: `coinsPerUtxoByte` = 4,310, `minFeeA` = 44, `minFeeB` = 155,381 (from Cardano docs + Blockfrost)
- Hydra v1.2.0 production announcement: IOG blog, October 2025
- Midnight NIGHT token launch: midnight.network, December 2025
- Existing codebase: `src/settle/settle-payment.ts`, `src/chain/provider.ts`, `src/verify/checks.ts`

### Secondary (MEDIUM confidence)
- Hydra Pay WebSocket API: github.com/obsidiansystems/hydra-pay
- Hydrozoa lightweight heads: Catalyst Fund 12/14 proposals
- utxoCostPerByte reduction proposal: Cardano Forum (under review)
- Leios CIP-0164: cardano-scaling.org
- Multi-output tx economics: Cexplorer article (217 outputs, 0.78 ADA fee)

### Tertiary (LOW confidence)
- Midnight fee economics: DUST/NIGHT tokenomics whitepaper (unproven in practice)
- Cardano Lightning Network: Catalyst Fund 12 (specs only, no production code)

---

*Phase: 06-batching*
*Pre-planning assumptions gathered: 2026-02-10*
*Next step: User decision on phase direction before CONTEXT.md*
