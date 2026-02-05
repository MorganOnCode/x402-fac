# x402 Cardano Facilitator & Storage Service

## What This Is

An x402 payment facilitator for Cardano paired with a file storage service. Users pay in ADA or Cardano stablecoins to upload files; downloads are free. This is a learning project to understand the x402 protocol deeply, creating a foundation for future agentic tools and the "Transactional Identity" vision where payments serve as both authorization and identity proof.

## Core Value

A working x402 payment flow on Cardano that I understand end-to-end — from signature verification to on-chain settlement — that I can build more sophisticated applications on top of.

## Protocol

**x402 Protocol Version: V2** (pinned 2026-02-05)

Using x402 v2 protocol with CAIP-2 network identifiers, `PaymentRequirements` with `extra` bag, and `accepted` field in payment payload. V1 backward compatibility is not a goal — Cardano is a new chain for x402 and starts fresh on V2.

## Requirements

### Validated

(None yet — ship to validate)

### Infrastructure Complete

- [x] Facilitator queries and tracks Cardano UTXO state (Phase 2)
- [x] UTXOs can be reserved to prevent contention (Phase 2)
- [x] Blockfrost API key stored securely and never logged (Phase 2)

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
| x402 Protocol V2 | Cardano is new to x402, no V1 legacy to support | Pinned V2, CAIP-2 network IDs |
| Cardano-first (not EVM) | Ecosystem preference, Midnight alignment, less explored territory | Confirmed |
| Pay-to-upload model | Covers storage costs, simpler economics, enables free content distribution | Confirmed |
| Abstract storage layer | Flexibility to swap IPFS for Arweave/Walrus later without rewrite | Confirmed |
| Support ADA + stablecoins | Flexibility in payment (native token simplicity + stable pricing) | Confirmed |
| tsup over tsdown | rolldown native bindings failed on Darwin arm64 | Phase 1 |
| Zod v4 config validation | Runtime schema validation with factory defaults for nested objects | Phase 1 |
| Fastify server factory | Dependency injection pattern, clean separation of concerns | Phase 1 |
| Docker for deps only | App runs locally with hot reload, containers for IPFS/Redis | Phase 1 |
| bigint for lovelace | Cardano lovelace can exceed 2^53, prevents precision loss | Phase 2 |
| ioredis with lazyConnect | Explicit connection control, caller decides when to connect | Phase 2 |
| Two-layer UTXO cache | L1 in-memory Map + L2 Redis, cache-first query strategy | Phase 2 |
| Mainnet env var guardrail | Fail-safe prevents accidental mainnet usage during development | Phase 2 |
| Override-only libsodium fix | Pin libsodium-wrappers-sumo@0.8.2 for ESM compat | Phase 2 |

*Full decision log with rationale: see STATE.md (31 decisions)*

---
*Last updated: 2026-02-05 after Phase 2 completion and audit review*
