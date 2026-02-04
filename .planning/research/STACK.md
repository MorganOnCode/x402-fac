# Stack Research: x402 Facilitator on Cardano

**Domain:** Blockchain Payment Facilitator (x402 Protocol on Cardano)
**Researched:** 2026-02-04
**Confidence:** MEDIUM (Cardano x402 is emerging; core Cardano tooling is well-established)

## Executive Summary

Building an x402 facilitator on Cardano requires combining established Cardano development tools with the emerging x402 protocol specification. The Cardano x402 ecosystem is actively being developed by **Masumi Network** (led by Patrick Tobler/NMKR) with a working proof-of-concept. The stack centers on **TypeScript** with **Lucid Evolution** for transaction building, **Blockfrost** for blockchain access, and **USDM** as the primary stablecoin for payments.

**Key insight:** Cardano's x402 implementation is unique in targeting smart contract integration (not just address-to-address transfers), making it "the most powerful x402 implementation" per Patrick Tobler.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **TypeScript** | 5.x | Primary language | Type safety, ecosystem alignment with x402 SDKs, Cardano tooling support | HIGH |
| **Node.js** | 20+ LTS | Runtime | Stable, long-term support, required by Cardano libraries | HIGH |
| **Lucid Evolution** | 0.4.29+ | Transaction building | Active maintenance by Anastasia Labs, CML 5 integration, Plutus V3/Conway support | HIGH |
| **Blockfrost** | API v0 | Blockchain provider | Managed infrastructure, TypeScript SDK, mainnet/testnet support | HIGH |
| **Express.js** or **Fastify** | 4.x / 5.x | HTTP server | x402 is HTTP-native; need middleware for 402 responses | HIGH |

### Cardano-Specific Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| `@lucid-evolution/lucid` | 0.4.29 | Transaction construction, signing, metadata | All transaction operations | HIGH |
| `@blockfrost/blockfrost-js` | latest | Blockchain queries, tx submission | UTXO queries, submit transactions, metadata queries | HIGH |
| `@dcspark/cardano-multiplatform-lib-nodejs` | 6.2.0 | Low-level serialization (if needed) | Advanced tx manipulation, direct CBOR access | MEDIUM |
| `@meshsdk/core` | 1.9.x | Alternative tx builder | If needing React components or simpler APIs | MEDIUM |

### x402 Protocol Components

| Component | Implementation | Purpose | Notes | Confidence |
|-----------|----------------|---------|-------|------------|
| **Facilitator Server** | Custom (TypeScript) | Verify payments, submit to chain | Reference: masumi-network/x402-cardano-examples | MEDIUM |
| **Payment Payload** | x402 spec | Base64-encoded payment data | X-PAYMENT header format | HIGH |
| **Verification** | Custom | Validate payment meets requirements | Check signature, amount, payTo address | MEDIUM |
| **Settlement** | Blockfrost API | Submit signed tx to Cardano | Use tx/submit endpoint | HIGH |

### Stablecoin Support

| Token | Policy ID | Decimals | Status | Notes | Confidence |
|-------|-----------|----------|--------|-------|------------|
| **USDM** | `c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad` | 6 | Primary | Fiat-backed, MiCA compliant, used in Masumi PoC | HIGH |
| **DJED** | (verify on-chain) | 6 | Secondary | Algorithmic, 400-800% collateralized | MEDIUM |
| **iUSD** | (verify on-chain) | 6 | Secondary | Indigo Protocol synthetic | MEDIUM |
| **ADA** | native | 6 | Always supported | Native asset, required for fees and minUTXO | HIGH |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Blockfrost** (Preview/Preprod) | Testnet development | Free tier available, separate API keys per network |
| **Cardano Testnet Faucet** | Get test ADA/tokens | Required for preprod/preview testing |
| **Lace/Eternl Wallet** | CIP-30 testing | Support preprod, preview, mainnet |
| **cardano-signer** | CLI key management | Generate keys, sign transactions server-side |

---

## Installation

```bash
# Core framework
npm install typescript @types/node tsx

# Cardano transaction building (choose one primary)
npm install @lucid-evolution/lucid

# Blockchain provider
npm install @blockfrost/blockfrost-js

# HTTP server (pick one)
npm install express @types/express
# or
npm install fastify

# Optional: Low-level serialization
npm install @dcspark/cardano-multiplatform-lib-nodejs

# Dev dependencies
npm install -D typescript @types/node tsx vitest
```

### Environment Configuration

```bash
# .env
BLOCKFROST_PROJECT_ID_MAINNET=mainnetXXXXXXXXXX
BLOCKFROST_PROJECT_ID_PREPROD=preprodXXXXXXXXXX
BLOCKFROST_PROJECT_ID_PREVIEW=previewXXXXXXXXXX
NETWORK=preprod  # preprod | preview | mainnet

# Facilitator wallet (server-side signing)
FACILITATOR_PRIVATE_KEY=ed25519_sk_XXXX  # Or derive from seed phrase

# x402 configuration
PAYMENT_ADDRESS=addr1qXXXX  # Where payments are received
SUPPORTED_TOKENS=USDM,ADA
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Lucid Evolution** | MeshJS | If building frontend with React components; MeshJS has better React integration |
| **Lucid Evolution** | cardano-serialization-lib direct | If need absolute low-level control; Lucid abstracts CSL complexity |
| **Blockfrost** | Ogmios + own node | If running own infrastructure; Ogmios requires cardano-node |
| **Blockfrost** | Koios | Free community-run alternative; less reliability guarantees |
| **TypeScript** | Python (Flask) | If team prefers Python; Masumi examples use Flask for PoC |
| **TypeScript** | Rust | If extending x402-rs directly; would need new Cardano chain module |

### Lucid Evolution vs MeshJS Comparison

| Criterion | Lucid Evolution | MeshJS |
|-----------|-----------------|--------|
| Maintenance | Anastasia Labs (full-time) | Community + funding |
| TypeScript Native | Yes | Yes |
| CML Version | CML 5 (latest) | CSL-based |
| Plutus V3 | Supported | Supported |
| Conway/Governance | Supported | Supported |
| React Components | No | Yes |
| Documentation | Good | Excellent |
| Use Case Fit | Backend/services | Full-stack dApps |

**Recommendation:** Use **Lucid Evolution** for the facilitator (backend service). Consider **MeshJS** if building a frontend demo or user-facing components.

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `lucid-cardano` (original) | Deprecated, unmaintained since SpaceBudz handoff | `@lucid-evolution/lucid` |
| `cardano-serialization-lib` (Emurgo) | Lower-level than needed, Lucid abstracts this | Lucid Evolution (uses CML internally) |
| Direct cardano-node RPC | Requires running full node, complex setup | Blockfrost API |
| asm.js builds of CML | Legacy, poor performance | WASM builds (`-nodejs` or `-browser`) |
| Custom wallet implementations | Security risk, unnecessary complexity | CIP-30 wallets for users, seed-based for server |

---

## Cardano-Specific Considerations

### UTXO Model Implications

Unlike account-based chains (Ethereum), Cardano uses UTXOs:

1. **Coin Selection:** Transaction building must select input UTXOs that cover outputs + fees
2. **Change Outputs:** Excess value returns to sender as change UTXO
3. **Concurrency:** Same UTXO cannot be spent twice; affects high-throughput scenarios
4. **Transaction Size:** More inputs/outputs = larger tx = higher fees

**Lucid Evolution handles coin selection automatically.** The facilitator primarily:
- Receives signed transactions from clients
- Validates the signature and payment requirements
- Submits to chain via Blockfrost

### MinUTXO Requirements

Every UTXO must contain minimum ADA. Formula (Babbage era):
```
minADA = (160 + sizeInBytes(TxOut)) * coinsPerUTxOByte
```

**Practical implications:**
- ADA-only output: ~1 ADA minimum
- Output with native tokens: ~1.5-2 ADA minimum (depends on token count, name lengths)
- **USDM payments must include ADA** for minUTXO

**Example:** Paying 2 USDM requires sending ~1.5-2 ADA alongside the USDM tokens.

### Metadata Handling

Cardano transaction metadata uses numeric labels (0 to 2^64-1):

| Label | Standard | Use |
|-------|----------|-----|
| 674 | CIP-20 | Transaction messages/comments |
| 721 | CIP-25 | NFT metadata |
| 2222 | FluxPoint PoI | Proof-of-Inference anchoring |
| Custom | Your choice | x402 payment receipts |

**Metadata constraints:**
- Strings: max 64 bytes UTF-8
- Stored as CBOR, not JSON
- Top-level keys must be integers

**Recommendation:** Reserve a metadata label for x402 payment receipts (apply for CIP-10 registry if going to production).

### Native Assets vs Smart Contract Tokens

Cardano native assets (like USDM) are **not smart contracts**:
- No ERC-20-style approve/transferFrom
- Tokens travel with ADA in UTXOs
- Policy ID + Asset Name = unique identifier
- Minting controlled by minting policy scripts

**Implication for x402:** Payment verification checks:
1. Transaction sends correct token (policy ID + asset name)
2. Correct amount (accounting for decimals)
3. To correct address (payTo)
4. Includes sufficient ADA for minUTXO

---

## Existing Cardano x402 Work

### Masumi Network (Patrick Tobler / NMKR)

**Status:** Active development, proof-of-concept live
**GitHub:** [masumi-network/x402-cardano](https://github.com/masumi-network/x402-cardano)
**Examples:** [masumi-network/x402-cardano-examples](https://github.com/masumi-network/x402-cardano-examples)

**Key features:**
- Flask-based PoC (Python) with two services: Resource Server + Facilitator
- Uses Blockfrost for chain interaction
- Supports USDM payments (2 USDM in demo)
- CIP-30 wallet integration for user signing
- Plans to integrate with Masumi smart contracts

**Notable quote from Patrick Tobler:**
> "By not only doing Address-To-Address like most other blockchains do but actually writing the standard to work with the Masumi Smart Contract, we're making our x402 implementation the most powerful one out there."

### FluxPoint Studios

**Status:** Production (AI agent ecosystem)
**Focus:** Proof-of-Inference (PoI) anchoring, not x402 facilitator

**Relevant patterns:**
- Uses metadata label 2222 for on-chain anchoring
- Babel fees allow paying in $AGENT token (no ADA for users)
- Settlement patterns applicable to x402

**Not directly x402:** FluxPoint's work is about AI inference verification, not HTTP 402 payments. However, their metadata anchoring and Babel fee patterns are relevant.

### x402-rs (Rust Reference)

**Status:** Production-ready for EVM/Solana, no Cardano support
**GitHub:** [x402-rs/x402-rs](https://github.com/x402-rs/x402-rs)

**Architecture patterns to adopt:**
- Trait-based chain abstraction (`x402-types`)
- Separate verification and settlement concerns
- OpenTelemetry observability
- Docker deployment

**Limitation:** Would need to implement Cardano chain module from scratch in Rust. **Recommendation:** Build in TypeScript instead, leveraging existing Cardano TS tooling.

---

## Stack Patterns by Variant

### Variant A: Simple Facilitator (MVP)

**If building minimal viable facilitator:**
- TypeScript + Express
- Lucid Evolution for tx validation/submission
- Blockfrost provider
- Server-side wallet (seed phrase or private key)
- USDM + ADA support only

```typescript
// Simplified stack
import { Lucid, Blockfrost } from "@lucid-evolution/lucid";
import express from "express";

const lucid = await Lucid.new(
  new Blockfrost("https://cardano-preprod.blockfrost.io/api", projectId),
  "Preprod"
);
```

### Variant B: Full Production Facilitator

**If building production-grade service:**
- TypeScript + Fastify (better performance)
- Lucid Evolution + direct CML for edge cases
- Blockfrost with Ogmios fallback
- HSM or distributed key signing for wallet security
- Multiple stablecoin support (USDM, DJED, iUSD)
- Observability (OpenTelemetry)
- Rate limiting, caching

### Variant C: Smart Contract Integration (Masumi-style)

**If integrating with smart contracts:**
- All of Variant B, plus:
- Plutus V3 script interaction
- Datum/redeemer handling
- Script reference optimization
- On-chain state management

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@lucid-evolution/lucid@0.4.x` | Node.js 18+, 20+ | ES modules preferred |
| `@lucid-evolution/lucid@0.4.x` | `@dcspark/cardano-multiplatform-lib-nodejs@6.x` | CML 5 compatibility |
| `@blockfrost/blockfrost-js@latest` | All Lucid versions | Independent, REST API |
| `@meshsdk/core@1.9.x` | CSL-based (different from CML) | Don't mix Mesh + Lucid in same tx builder |

**Critical:** Do not mix Lucid Evolution and MeshJS for the same transaction building operations. Pick one as primary.

---

## Network Configuration

### Preprod (Recommended for Development)

```typescript
const network = "Preprod";
const blockfrostUrl = "https://cardano-preprod.blockfrost.io/api";
```

**Why Preprod:**
- Mirrors mainnet parameters exactly
- Same epoch length (5 days)
- Hard forks match mainnet timing
- Best for final testing before mainnet

### Preview (For Rapid Iteration)

```typescript
const network = "Preview";
const blockfrostUrl = "https://cardano-preview.blockfrost.io/api";
```

**Why Preview:**
- 30-minute epochs (faster testing)
- Gets new features 4+ weeks before mainnet
- Good for testing new protocol features

**Recommendation:** Start with Preprod for stability. Use Preview only if testing bleeding-edge features.

---

## Sources

### HIGH Confidence (Official Documentation)
- [Lucid Evolution Documentation](https://anastasia-labs.github.io/lucid-evolution/) - Transaction building
- [Blockfrost API Documentation](https://docs.blockfrost.io/) - Blockchain provider
- [Cardano Developer Portal](https://developers.cardano.org/) - Official Cardano resources
- [CIP-30 Specification](https://cips.cardano.org/cip/CIP-30) - Wallet connector standard
- [CIP-10 Metadata Registry](https://cips.cardano.org/cip/CIP-10) - Transaction metadata labels
- [Cardano Docs - MinUTXO](https://docs.cardano.org/native-tokens/minimum-ada-value-requirement/) - UTXO requirements
- [x402 Protocol GitHub](https://github.com/coinbase/x402) - Official x402 specification

### MEDIUM Confidence (Verified Community Sources)
- [Masumi x402-cardano GitHub](https://github.com/masumi-network/x402-cardano) - Cardano x402 implementation
- [Masumi x402-cardano-examples](https://github.com/masumi-network/x402-cardano-examples) - Working PoC code
- [x402-rs GitHub](https://github.com/x402-rs/x402-rs) - Rust reference implementation
- [x402 GitBook - Facilitator](https://x402.gitbook.io/x402/core-concepts/facilitator) - Facilitator concepts
- [USDM on Cardanoscan](https://cardanoscan.io/token/c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d) - Token verification

### LOW Confidence (News/Community - Verify Before Use)
- [ZyCrypto - x402 on Cardano](https://zycrypto.com/x402-is-coming-to-cardano-and-charles-hoskinson-believes-its-a-big-deal-for-the-network/) - Announcement coverage
- [Cardano Forum - Stablecoins Overview](https://forum.cardano.org/t/overview-of-stablecoins-on-cardano/135672) - Stablecoin landscape
- [FluxPoint Studios Docs](https://docs.fluxpointstudios.com/) - PoI patterns (not directly x402)

---

## Open Questions for Phase Research

1. **Facilitator Wallet Security:** Best practices for server-side key management on Cardano? HSM integration?
2. **Babel Fees:** Can x402 payments be gasless for users (facilitator covers ADA fees)?
3. **Smart Contract Integration:** Should the facilitator interact with Masumi contracts, or stay address-to-address?
4. **Metadata Label:** What label to use for x402 payment receipts? Apply to CIP-10 registry?
5. **Concurrency:** How to handle multiple concurrent payments to same address (UTXO contention)?

---

*Stack research for: x402 Facilitator on Cardano*
*Researched: 2026-02-04*
