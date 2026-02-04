# Feature Research: x402 Facilitator

**Domain:** x402 Payment Facilitator for Cardano
**Researched:** 2026-02-04
**Confidence:** MEDIUM (x402 protocol well-documented; Cardano-specific implementation less documented)

## Feature Landscape

### Table Stakes (Protocol Requirements)

Features the x402 protocol requires. Without these, the facilitator is non-functional.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `/verify` endpoint | x402 protocol spec requirement. Servers POST payment payloads here to validate before serving content. | MEDIUM | Must validate signatures, amounts, timestamps, and that payer has sufficient funds |
| `/settle` endpoint | x402 protocol spec requirement. Executes validated payments on-chain. | HIGH | Requires blockchain interaction, transaction building, submission, and confirmation monitoring |
| `/supported` endpoint | Protocol requirement. Returns supported schemes, networks, and facilitator signer addresses. | LOW | Returns static config, but important for client/server discovery |
| `/health` endpoint | Standard for any HTTP service. Enables load balancers and monitoring. | LOW | Can delegate to `/supported` or just return 200 OK |
| Signature verification | Core security requirement. Validates client signed the payment payload. | MEDIUM | Cardano uses Ed25519 signatures vs EVM's ECDSA |
| Payment scheme support | Must implement at least one scheme (e.g., `exact`). | MEDIUM | `exact` scheme: transfer specific amount. Each scheme has own verification/settlement logic |
| Chain provider | Blockchain connectivity for balance checks and transaction submission. | HIGH | Cardano requires Ogmios/Blockfrost API or local node connection |
| Signer/wallet management | Facilitator needs keys to submit settlement transactions. | MEDIUM | Secure key storage, single or multi-sig options |
| Amount validation | Verify payment amount meets requirements specified by resource server. | LOW | Part of verify logic |
| Timestamp validation | Verify payment is within valid time window (valid_after, valid_before). | LOW | Part of verify logic |

### Differentiators (Competitive Advantage)

Features that make this facilitator stand out. Not protocol-required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-token support | Accept ADA + stablecoins (DJED, iUSD). Gives users payment flexibility. | MEDIUM | Requires token-specific verification logic. ADA is simpler (native); stablecoins need policy ID validation |
| Transaction batching | Combine multiple payments into single on-chain tx. Critical for Cardano economics (min UTXO ~1.2 ADA). | HIGH | Essential for micropayments. Collect N payments, settle together. Needs queue management, timing logic |
| Webhooks | Notify servers when payments settle on-chain. | MEDIUM | POST to configured URL on settlement success/failure. Enables async workflows |
| OpenTelemetry/Observability | Distributed tracing, metrics collection. | MEDIUM | x402-rs supports this via `telemetry` feature. Important for debugging production issues |
| Dashboard/Analytics | Web UI showing transaction history, success rates, revenue. | HIGH | Nice for visibility but not core functionality. OpenFacilitator offers this on paid plans |
| Refund support (x402r) | Enable escrow-based refund flow for disputed payments. | HIGH | x402r protocol adds escrow contracts and arbiter selection. Emerging standard, not widely adopted yet |
| CORS support | Allow browser-based clients to interact directly. | LOW | Standard HTTP middleware. Already in x402-rs |
| Graceful shutdown | Clean server stop without losing in-flight requests. | LOW | Signal handling for SIGTERM/SIGINT. Already in x402-rs |
| Configuration file support | JSON/YAML config for chains, schemes, tokens. | LOW | Standard practice. Makes deployment flexible |
| Multiple RPC endpoints | Failover between blockchain nodes/APIs. | MEDIUM | Resilience feature. If Blockfrost is down, try Ogmios, etc. |
| Rate limiting | Protect facilitator from abuse. | LOW | Standard HTTP middleware |
| Double-spend prevention | Ensure same payment payload can't be submitted twice. | MEDIUM | Track processed payment IDs. Important for preventing replay attacks |
| Deferred settlement | Batch payments and settle on schedule (hourly/daily). | HIGH | Circle Gateway approach. High throughput without per-tx costs. Complex queue management |
| V1 and V2 protocol support | Support both x402 protocol versions. | MEDIUM | V1 is legacy but still used. V2 is current standard. Different payload formats |
| OFAC/KYT compliance | Screen transactions against sanctions lists. | HIGH | Enterprise requirement. Adds regulatory compliance. Coinbase facilitator includes this |

### Anti-Features (Deliberately NOT Building)

Features that seem appealing but should be avoided for v1.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Multi-chain support (EVM, Solana, etc.) | "Support all the chains!" | Massive complexity explosion. Each chain has unique signing, tx building, APIs. | Cardano-only for v1. Chain abstraction in x402-rs exists if needed later |
| Custodial wallet | "Hold funds for users" | Regulatory nightmare. Requires money transmitter licenses. Security liability. | Non-custodial only. Facilitator signs transactions but doesn't custody funds |
| Complex payment schemes (upto, subscription) | "Flexible pricing models" | Adds verification complexity. `upto` scheme isn't fully specified yet. | Start with `exact` scheme only. Add schemes incrementally when needed |
| Real-time everything | "Instant settlement notifications" | WebSockets add complexity. Most use cases don't need sub-second updates. | Use webhooks (async HTTP). Poll `/health` for status. |
| Full node requirement | "Run your own Cardano node" | Massive ops overhead (100GB+ storage, sync time, maintenance). | Use Blockfrost API or hosted Ogmios. Local node optional for advanced users |
| GUI wallet integration | "Connect MetaMask/Nami" | Out of scope for backend facilitator. Client responsibility. | Provide clear API docs. Let clients handle wallet UX |
| Fiat settlement | "Pay out in USD" | Requires banking integration, KYC, regulatory compliance. | Crypto-native only. Fiat offramps are separate concern |
| AI/LLM integration | "Auto-price based on token count" | Couples facilitator to specific use case. | Keep facilitator generic. Pricing logic in resource server |
| Proof-of-Inference anchoring | "Cryptographic receipts on Cardano metadata" | Cool future feature (FluxPoint does this) but orthogonal to core facilitator. | Defer to v2. Focus on basic payment flow first |

## Feature Dependencies

```
[Signature Verification]
    |
    +--requires--> [Chain Provider] (to verify payer has funds)
    |
    +--enables--> [/verify endpoint]
                      |
                      +--enables--> [/settle endpoint]
                                        |
                                        +--requires--> [Signer/Wallet]
                                        |
                                        +--enhanced-by--> [Transaction Batching]
                                        |
                                        +--enhanced-by--> [Webhooks]

[Multi-token Support]
    |
    +--requires--> [Token Registry] (policy IDs, decimals)
    |
    +--requires--> [Chain Provider] (token balance queries)

[Transaction Batching]
    |
    +--requires--> [Settlement Queue]
    |
    +--requires--> [Timing Logic] (when to flush batch)
    |
    +--conflicts-with--> [Immediate Settlement] (mutually exclusive modes)

[Refund Support (x402r)]
    |
    +--requires--> [Escrow Smart Contract]
    |
    +--requires--> [Arbiter Selection]
    |
    +--requires--> [Dispute Resolution Logic]
```

### Dependency Notes

- **Signature verification requires chain provider:** Must check on-chain state (UTxO availability, token balances) to fully verify payment is possible.
- **Settlement requires signer/wallet:** Facilitator must have keys to sign the on-chain transaction.
- **Batching conflicts with immediate settlement:** Choose one mode or implement switching logic. Batching better for micropayments; immediate better for high-value.
- **x402r refund support requires escrow contracts:** Not just facilitator code but on-chain Plutus smart contracts.

## MVP Definition

### Launch With (v1)

Minimum viable facilitator that works for the file storage use case.

- [x] `/verify` endpoint - Validate Cardano payment signatures and requirements
- [x] `/settle` endpoint - Submit payment transaction to Cardano
- [x] `/supported` endpoint - Return supported schemes and networks
- [x] `/health` endpoint - Basic health check
- [x] `exact` payment scheme - Fixed amount payments
- [x] ADA native token support - Simplest payment path
- [x] Blockfrost chain provider - Easiest Cardano API integration
- [x] Single signer wallet - One facilitator key for settlements
- [x] Basic configuration file - JSON config for chain/scheme setup
- [x] Double-spend prevention - Track processed payment IDs
- [x] CORS support - Enable web clients

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Stablecoin support (DJED, iUSD) - Add when users request it
- [ ] Transaction batching - Add when micropayment economics become painful
- [ ] Webhooks - Add when async notification needed
- [ ] OpenTelemetry tracing - Add when debugging production issues
- [ ] Multiple RPC fallback - Add when Blockfrost reliability becomes issue

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] V2 protocol support - When V2 becomes dominant
- [ ] Refund support (x402r) - When disputes become common
- [ ] Dashboard/analytics - When visibility becomes important
- [ ] Deferred settlement - When high-volume batching needed
- [ ] OFAC/KYT compliance - Only if targeting enterprise users

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `/verify` endpoint | HIGH | MEDIUM | P1 |
| `/settle` endpoint | HIGH | HIGH | P1 |
| `/supported` endpoint | HIGH | LOW | P1 |
| `/health` endpoint | MEDIUM | LOW | P1 |
| `exact` scheme | HIGH | MEDIUM | P1 |
| ADA support | HIGH | MEDIUM | P1 |
| Blockfrost provider | HIGH | MEDIUM | P1 |
| Double-spend prevention | HIGH | LOW | P1 |
| CORS support | MEDIUM | LOW | P1 |
| Basic config file | MEDIUM | LOW | P1 |
| Stablecoin support | MEDIUM | MEDIUM | P2 |
| Transaction batching | HIGH | HIGH | P2 |
| Webhooks | MEDIUM | MEDIUM | P2 |
| OpenTelemetry | LOW | MEDIUM | P2 |
| RPC failover | MEDIUM | MEDIUM | P2 |
| V2 protocol | LOW | MEDIUM | P3 |
| Refund support | LOW | HIGH | P3 |
| Dashboard | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (core x402 facilitator functionality)
- P2: Should have, add when needed (operational improvements)
- P3: Nice to have, future consideration (enterprise/advanced features)

## Competitor Feature Analysis

| Feature | Coinbase CDP | OpenFacilitator | Mogami | PayAI | Our Approach |
|---------|--------------|-----------------|--------|-------|--------------|
| Networks | Base, Solana | EVM, Solana | EVM, Solana | Multi-chain | Cardano only |
| Free tier | 1000 tx/month | Unlimited (shared) | Unknown | Unknown | Self-hosted (free) |
| Tokens | USDC | Multi-token | USDC | Multi-token | ADA + stablecoins |
| Batching | Via Circle Gateway | Unknown | Unknown | Unknown | Yes (for micropayments) |
| Webhooks | Unknown | Yes (paid plan) | Unknown | Unknown | Future (v1.x) |
| Dashboard | Yes | Yes (paid plan) | Yes | Yes | Future (v2) |
| Refunds | Unknown | Yes (x402r) | Unknown | Unknown | Future (v2) |
| OFAC/KYT | Yes | Unknown | Unknown | Unknown | No (learning project) |
| V1 + V2 | Yes | Yes | Yes | Yes | V1 only initially |

## Cardano-Specific Considerations

### Min UTXO Challenge

Cardano requires minimum ~1.2 ADA per UTXO. This affects micropayment viability:

| Payment Size | Individual Settlement | Batched (N=50) |
|--------------|----------------------|----------------|
| 0.05 ADA | Not viable (< min UTXO) | Viable (2.5 ADA total) |
| 0.10 ADA | Not viable | Viable (5 ADA total) |
| 1.00 ADA | Viable | More efficient |
| 5.00 ADA | Viable | Similar efficiency |

**Implication:** Transaction batching is not optional for micropayments on Cardano. Plan for it from the start even if v1 doesn't implement it.

### Signature Scheme

Cardano uses Ed25519 (not ECDSA like EVM). Verification logic must use appropriate crypto libraries:
- Rust: `ed25519-dalek` or `cardano-serialization-lib`
- Reference: Patrick Tobler's Cardano x402 work

### Transaction Building

Cardano transactions are UTxO-based, not account-based:
- Must select input UTxOs
- Must calculate change
- Must handle native tokens separately from ADA
- More complex than EVM `transferWithAuthorization`

## Sources

**Official Documentation:**
- [x402 Protocol](https://www.x402.org/)
- [Coinbase x402 Docs](https://docs.cdp.coinbase.com/x402/welcome)
- [x402 Gitbook](https://x402.gitbook.io/x402/core-concepts/facilitator)

**Reference Implementations:**
- [coinbase/x402 GitHub](https://github.com/coinbase/x402)
- [x402-rs/x402-rs (Rust)](https://github.com/x402-rs/x402-rs)
- [OpenFacilitator](https://www.openfacilitator.io/)
- [Mogami Facilitator](https://github.com/mogami-tech/x402-facilitator)

**Cardano-Specific:**
- FluxPoint Studios - ADA settlement, Proof-of-Inference (metadata label 2222)
- Patrick Tobler - Cardano x402 implementation research

**Additional Resources:**
- [x402r Refund Protocol](https://www.x402r.org/)
- [x402 V2 Launch Announcement](https://www.x402.org/writing/x402-v2-launch)
- [x402station - Analytics Platform](https://x402station.com)

---
*Feature research for: x402 Payment Facilitator on Cardano*
*Researched: 2026-02-04*
