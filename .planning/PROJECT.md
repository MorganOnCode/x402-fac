# x402 Cardano Facilitator & Storage Service

## What This Is

An x402 payment facilitator for Cardano paired with a file storage service. Users pay in ADA or Cardano stablecoins to upload files; downloads are free. This is a learning project to understand the x402 protocol deeply, creating a foundation for future agentic tools and the "Transactional Identity" vision where payments serve as both authorization and identity proof.

## Core Value

A working x402 payment flow on Cardano that I understand end-to-end — from signature verification to on-chain settlement — that I can build more sophisticated applications on top of.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Facilitator verifies x402 payment signatures on Cardano
- [ ] Facilitator settles payments on-chain (ADA and stablecoins)
- [ ] Facilitator batches settlements for economic viability (Cardano min UTXO ~1.2 ADA)
- [ ] Storage service accepts file uploads gated by x402 payment
- [ ] Storage service returns content identifier after successful upload
- [ ] Storage service serves files freely by content ID (no payment required)
- [ ] Storage backend is abstracted (swappable implementations)
- [ ] IPFS implemented as first storage backend
- [ ] Pricing calculates based on file size
- [ ] System produces diagrams and documentation that explain how it works

### Out of Scope

- EVM/Solana/Aptos chain support — Cardano only for v1
- Pay-to-download model — uploads paid, downloads free
- Production-grade security hardening — learning project first
- Mobile apps — API/CLI focus
- Midnight integration — future phase after core x402 understanding

## Context

**Why Cardano:**
- Personal preference and ecosystem alignment
- Midnight (Cardano's privacy sidechain) aligns with future ZK-KYC vision
- Less explored for x402, opportunity to contribute

**Prior art to research:**
- Patrick Tobler's Cardano x402 work
- FluxPoint Studios — ADA settlement, Proof-of-Inference anchoring to Cardano metadata (label 2222)
- Tiered pricing models (0.05–0.10 ADA) and min UTXO considerations

**Future vision (not in v1):**
- "Transactional Identity" / "Payment is the Passport" — x402 transactions as authorization with KYC metadata
- Agent tools that use x402 for service access
- Prediction markets, NFT creation mechanisms built on this infrastructure

**Learning approach:**
- Code written by Claude, understanding via diagrams, knowledge graphs, system blueprints
- Build to learn, then build to use

## Constraints

- **Blockchain**: Cardano only — ADA native token + stablecoins (DJED, iUSD)
- **Min UTXO**: ~1.2 ADA minimum on Cardano means true micro-payments need batching
- **x402-rs**: Doesn't support Cardano — custom implementation or research existing Cardano x402 work
- **Storage**: Abstract interface, IPFS first implementation
- **Audience**: Personal use + friends initially, not public production service

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cardano-first (not EVM) | Ecosystem preference, Midnight alignment, less explored territory | — Pending |
| Pay-to-upload model | Covers storage costs, simpler economics, enables free content distribution | — Pending |
| Abstract storage layer | Flexibility to swap IPFS for Arweave/Walrus later without rewrite | — Pending |
| Support ADA + stablecoins | Flexibility in payment (native token simplicity + stable pricing) | — Pending |
| Research before build | Understand Patrick Tobler/FluxPoint work before reinventing | — Pending |

---
*Last updated: 2026-02-04 after initialization*
