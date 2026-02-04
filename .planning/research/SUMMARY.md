# Project Research Summary

**Project:** x402 Payment Facilitator for Cardano
**Domain:** Blockchain Payment Infrastructure (HTTP 402 Protocol Implementation)
**Researched:** 2026-02-04
**Confidence:** MEDIUM

## Executive Summary

Building an x402 facilitator on Cardano requires combining established Cardano development patterns with the emerging x402 payment protocol. Unlike account-based chains (Ethereum, Solana) where x402 implementations are mature, Cardano's UTXO model introduces unique challenges and opportunities. The key insight: **Cardano's UTXO architecture fundamentally changes payment economics** — transaction batching isn't an optimization, it's required for micropayment viability due to ~1.2 ADA minimum UTXO requirements and ~0.17-0.2 ADA transaction fees.

The recommended approach centers on TypeScript with Lucid Evolution for transaction building and Blockfrost for blockchain access, implementing the x402-rs architectural patterns (registry-based scheme handlers, provider abstraction) while adding Cardano-specific components (UTXO state management, batch aggregation queue). The Masumi Network proof-of-concept validates this approach and demonstrates smart contract integration potential. This is a learning project that will become foundation for agent tools and "Transactional Identity" vision, making it ideal for understanding both x402 protocol mechanics and Cardano transaction engineering.

The critical risk is UTXO contention and batching economics. Unlike EVM chains where immediate per-payment settlement works, Cardano requires either high-value payments (>5 ADA) for immediate settlement or batching for micropayments. Getting UTXO management wrong causes transaction failures under load. Getting batching wrong makes the service economically unviable. Both issues must be addressed from Phase 2 onward, not deferred to "optimization" phases.

## Key Findings

### Recommended Stack

TypeScript emerges as the clear choice due to ecosystem alignment with x402 SDKs and mature Cardano tooling. The stack centers on Lucid Evolution (transaction building with CML 5 and Plutus V3 support), Blockfrost (managed blockchain provider), and standard HTTP server framework (Express or Fastify). USDM is the recommended stablecoin (fiat-backed, MiCA compliant, used in Masumi PoC) with ADA always supported as fallback.

**Core technologies:**
- **TypeScript + Node.js 20+ LTS**: Type safety, ecosystem alignment, all Cardano libraries support TS
- **Lucid Evolution 0.4.29+**: Transaction building with CML 5, actively maintained by Anastasia Labs
- **Blockfrost API**: Managed infrastructure for UTXO queries and transaction submission, testnet support
- **Express or Fastify**: HTTP server with 402 response middleware capabilities
- **USDM stablecoin**: Primary payment token (fiat-backed, policy ID: c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad)

**Critical version requirements:**
- Lucid Evolution 0.4.29+ for Conway/Plutus V3 support
- Node.js 20+ LTS for library compatibility
- Blockfrost API v0 for stable endpoints

**What NOT to use:**
- Original lucid-cardano (deprecated, unmaintained)
- Direct cardano-serialization-lib (too low-level, Lucid abstracts this)
- Direct cardano-node RPC without experience (complex setup, use Blockfrost instead)

### Expected Features

**Must have (table stakes - x402 protocol requirements):**
- `/verify` endpoint — validates payment signatures and payer balance before service provision
- `/settle` endpoint — submits validated payments to Cardano blockchain
- `/supported` endpoint — returns supported chains, schemes, and facilitator signer addresses
- `exact` payment scheme — fixed amount transfers (simplest scheme, start here)
- Signature verification — CIP-8/CIP-30 message signing validation (Cardano-specific)
- Double-spend prevention — track used authorization nonces to prevent replay attacks
- Amount and timestamp validation — ensure payment meets requirements and validity window

**Should have (Cardano-essential, not optional):**
- **Transaction batching** — combine multiple payments into single on-chain transaction (CRITICAL for micropayment economics)
- Multi-token support — ADA + stablecoins (USDM, DJED, iUSD) for payment flexibility
- UTXO reservation system — prevent concurrent settlement conflicts in UTXO model
- Webhooks — notify servers of settlement completion (async workflow support)
- OpenTelemetry observability — distributed tracing for debugging production issues

**Defer (v2+):**
- Refund support (x402r protocol) — requires escrow contracts and dispute resolution
- Dashboard/analytics UI — visibility feature, not core functionality
- Multi-chain support — focus Cardano-only for v1, use x402-rs patterns for future expansion
- OFAC/KYT compliance — only if targeting enterprise users
- V2 protocol support — V1 sufficient for learning project

### Architecture Approach

The architecture follows x402-rs reference patterns adapted for Cardano's UTXO model. Three-layer design: HTTP handlers route requests to FacilitatorLocal coordinator, which delegates to scheme-specific handlers (V2CardanoExactFacilitator), which interact with CardanoChainProvider for blockchain operations. The key Cardano-specific addition is a BatchQueue component that aggregates pending settlements and periodically flushes as multi-output transactions.

**Major components:**
1. **HTTP Layer (Axum/Express + CORS)** — handle /verify, /settle, /supported endpoints with 402 response middleware
2. **FacilitatorLocal** — route requests to handlers by scheme slug, aggregate supported() responses
3. **SchemeRegistry + Blueprints** — factory pattern for creating scheme handlers, runtime lookup by chain+scheme
4. **CardanoChainProvider** — UTXO tracking, transaction building, signature verification, blockchain submission
5. **V2CardanoExactFacilitator** — implements verify/settle for exact payment scheme, uses provider for chain ops
6. **BatchQueue** — Cardano-specific component for aggregating verified payments into periodic multi-output transactions

**Critical patterns:**
- **Provider abstraction** — define CardanoChainProviderLike trait to enable testing with mocks
- **UTXO state management** — maintain in-memory UTXO tracking with reservation/locking to avoid contention
- **Deferred settlement via batching** — queue verified payments, batch-settle periodically to amortize fees

### Critical Pitfalls

**1. Authorization Replay Attack** — Attacker reuses signed payment authorization multiple times to receive service without paying. For state-changing operations (file uploads), use settle-then-work pattern: settle on-chain BEFORE providing service. For read operations, implement atomic nonce tracking. Address in Phase 3 (Verification).

**2. UTXO Contention Under Load** — Multiple concurrent settlements try to spend same facilitator UTXO, causing transaction failures. Implement in-memory UTXO reservation with TTL, pre-split UTXOs for parallelism, retry logic for conflicts. Address in Phase 2 (Chain Provider) from the start, not as later optimization.

**3. Ignoring Min UTXO for Token Outputs** — Attempting to send stablecoin without accompanying ADA fails because Cardano requires ~1.2 ADA minimum per UTXO. Always calculate and include min UTXO ADA with token outputs. Factor into pricing. Address in Phase 2 (Chain Provider) transaction building.

**4. Single-Payment-Per-Transaction Economics** — Settling every 0.05 ADA micropayment individually costs more in fees (~0.17 ADA) than payment value. Service becomes economically unviable. Implement batching with thresholds: immediate settlement only for payments >5 ADA, batch smaller ones. Address in Phase 5 (Batching) which is Cardano-essential, not optional enhancement.

**5. CIP-8/CIP-30 Signature Replay Across Chains** — Signature from testnet replayed on mainnet, or from different facilitator. Include chain_id, facilitator_id, and validity_until in signed payload. Verify all context fields match, not just signature validity. Address in Phase 3 (Verification).

## Implications for Roadmap

Based on research, suggested phase structure follows dependency order while frontloading Cardano-specific challenges:

### Phase 1: Foundation & Types
**Rationale:** Type system and core abstractions must be defined before implementation begins. Cardano's Lovelace-based amounts, CAIP-2 chain IDs, and address formats are foundational to all subsequent work.

**Delivers:** Type definitions for Address, Amount (enforces Lovelace internally), ChainId, transaction validity, configuration structures. CardanoChainProviderLike trait definition (enables testability).

**Addresses:**
- Decimal handling pitfall (Pitfall #11) — enforce Lovelace internally
- Network configuration mismatch (Pitfall #12) — validate address prefix matches network

**Research flag:** SKIP RESEARCH — standard Cardano types, well-documented in official sources

### Phase 2: Chain Provider & UTXO Management
**Rationale:** The CardanoChainProvider is the foundation for all blockchain interaction. UTXO management complexity must be solved early because it affects architecture decisions in later phases. This is where Cardano diverges most from account-based chains.

**Delivers:** Full CardanoChainProvider implementation with Blockfrost client, UTXO tracking/reservation system, transaction building with min UTXO calculation, signature verification (CIP-8), fee calculation, validity interval management.

**Uses:** Lucid Evolution for transaction construction, Blockfrost for queries/submission

**Avoids:**
- UTXO contention (Pitfall #2) — implement reservation system from start
- Min UTXO failure (Pitfall #3) — build into transaction builder
- Validity interval issues (Pitfall #6) — query current slot, set appropriate TTL

**Research flag:** NEEDS RESEARCH — Lucid Evolution API patterns, UTXO selection algorithms, CIP-8 verification with different wallet types

### Phase 3: Verification (Scheme Foundation)
**Rationale:** Verification can be implemented and tested independently before settlement. This phase establishes the scheme handler pattern and implements core security (signature verification, replay prevention).

**Delivers:** V2CardanoExact scheme types, signature verification with chain binding, balance checking, replay/nonce tracking, /verify endpoint integration.

**Addresses:**
- Authorization replay (Pitfall #1) — implement nonce tracking with atomic check-and-set
- Signature replay across chains (Pitfall #5) — verify chain_id, facilitator_id in payload
- Hardware wallet compatibility (Pitfall #13) — test with Ledger/Trezor

**Implements:** X402SchemeId trait, verify() method, registry integration

**Research flag:** NEEDS RESEARCH — CIP-30 signData payload structure, hardware wallet signature format differences

### Phase 4: Settlement (Immediate Mode)
**Rationale:** Start with immediate settlement (one payment = one transaction) to validate end-to-end flow before adding batching complexity. Only works economically for payments >5 ADA, which is fine for initial testing and high-value use cases.

**Delivers:** Transaction building for single-output settlements, on-chain submission, confirmation monitoring, settle() method implementation, /settle endpoint integration.

**Addresses:**
- Mempool drop detection (Pitfall #10) — monitor for inclusion, rebuild/resubmit on expiry
- Metadata truncation (Pitfall #8) — implement chunked string encoding for payment references
- Stablecoin availability (Pitfall #9) — support ADA + USDM, graceful degradation

**Implements:** X402SchemeFacilitator trait fully, settlement lifecycle tracking

**Research flag:** SKIP RESEARCH — standard Lucid Evolution patterns, straightforward implementation

### Phase 5: Batching (Cardano-Essential)
**Rationale:** Batching transforms the facilitator from "demo" to "economically viable for micropayments." This is where Cardano's UTXO model becomes an advantage — one transaction can contain 50+ outputs, amortizing fees across many payments.

**Delivers:** BatchQueue with pending payment aggregation, multi-output transaction builder, periodic flush scheduler, configurable thresholds (immediate vs batched), size-aware batch splitting.

**Addresses:**
- Single-payment economics (Pitfall #4) — batch small payments, immediate for large
- Transaction size limits (Pitfall #7) — auto-split at ~14KB safety margin
- Queue persistence (Technical Debt) — persist to database to survive restarts

**Implements:** Batch aggregation with payment status tracking, settlement handles for polling

**Research flag:** NEEDS RESEARCH — optimal batch sizing for Cardano (outputs vs tx size), queue persistence patterns

### Phase 6: Integration & Production Readiness
**Rationale:** Once core functionality works, add operational concerns: configuration management, server setup, monitoring, error handling, rate limiting.

**Delivers:** Configuration file support (JSON), server initialization (main.rs/run.ts), CORS middleware, rate limiting, health checks, error mapping (technical to user-friendly), logging/telemetry.

**Addresses:**
- Rate limiting on verify endpoint (Security Mistakes) — per-IP and per-address limits
- Error message UX (Pitfall #15) — map technical errors to user-friendly messages
- Monitoring gaps (Looks Done But Isn't) — settlement tracking, reconciliation

**Research flag:** SKIP RESEARCH — standard HTTP server patterns, OpenTelemetry integration well-documented

### Phase Ordering Rationale

- **Types before implementation** (Phase 1) — prevents rework from incorrect abstractions
- **Chain provider before schemes** (Phase 2 → 3) — schemes depend on provider abstraction
- **Verification before settlement** (Phase 3 → 4) — can test verify independently, settlement needs working verify
- **Immediate before batched** (Phase 4 → 5) — validate core flow before adding batching complexity
- **Core before operational** (Phase 5 → 6) — server setup last ensures it's configured for production patterns

This order **avoids major pitfalls** by:
- Addressing UTXO contention in Phase 2 (before it causes production issues)
- Implementing security (replay prevention, signature binding) in Phase 3 (before first settlement)
- Making batching essential (Phase 5) not optional, ensuring economic viability

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 2 (Chain Provider):** Lucid Evolution API patterns for UTXO queries, CIP-8 signature verification with different wallet implementations, UTXO selection algorithms
- **Phase 3 (Verification):** CIP-30 signData payload structure, hardware wallet signature format differences
- **Phase 5 (Batching):** Optimal batch sizing (how many outputs before hitting 16KB limit), queue persistence patterns for production

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** Standard Cardano types and abstractions, well-documented
- **Phase 4 (Settlement):** Straightforward Lucid Evolution transaction building
- **Phase 6 (Integration):** Standard HTTP server, observability patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | TypeScript + Lucid Evolution + Blockfrost is proven path (Masumi PoC validates). Official docs comprehensive. |
| Features | MEDIUM | x402 protocol well-specified, but Cardano-specific requirements (batching, UTXO management) less documented. Inferred from EUTXO research. |
| Architecture | MEDIUM | x402-rs patterns are HIGH confidence, but adaptation to Cardano UTXO model required custom analysis. No production Cardano facilitator to reference. |
| Pitfalls | MEDIUM-HIGH | Cardano constraints (min UTXO, concurrency) verified with official docs (HIGH). x402 security patterns from spec and community (MEDIUM). |

**Overall confidence:** MEDIUM

The stack and core architecture are well-supported by documentation and reference implementations. The challenge is adapting patterns from account-based chains (where most x402 work exists) to Cardano's UTXO model. The Masumi proof-of-concept validates the approach but production patterns require extrapolation.

### Gaps to Address

**UTXO selection algorithms:** Research identified the need for UTXO reservation but not specific algorithms for optimal UTXO selection under different conditions (many small UTXOs vs few large UTXOs). Lucid Evolution provides coin selection, but custom logic may be needed for facilitator use case. **Handle during Phase 2 planning:** Research Lucid Evolution's coin selection API, evaluate if custom logic needed.

**Batch timing optimization:** What's the optimal batch flush interval? Too frequent = wasted transactions, too long = poor UX. Research didn't find specific recommendations. **Handle during Phase 5 planning:** Start with configurable intervals (30s, 1m, 5m), instrument with metrics, tune based on actual usage patterns.

**Payment nonce persistence:** Research identified need for nonce tracking but didn't specify persistence strategy (in-memory only? database? Redis?). **Handle during Phase 3 planning:** Start with in-memory for MVP (acceptable for single instance), add Redis/database when scaling to multiple instances.

**Hardware wallet compatibility:** Research flagged CIP-8/CIP-30 signature differences between software and hardware wallets but didn't provide specific verification code patterns. **Handle during Phase 3 implementation:** Test early with Ledger/Trezor, document any signature format adjustments needed.

**Smart contract integration:** Masumi's vision includes smart contract interaction (not just address-to-address transfers). Research captured this but didn't detail implementation. **Defer to v2:** This is advanced feature, not needed for file storage use case. Learning v1 provides foundation for v2 smart contract work.

## Sources

### PRIMARY (HIGH confidence - Official Documentation)
- **STACK.md sources:**
  - Lucid Evolution Documentation — Transaction building APIs, CML integration
  - Blockfrost API Documentation — Endpoint specifications, rate limits
  - Cardano Developer Portal — Official Cardano resources, protocol parameters
  - CIP-30 Specification — Wallet connector standard for signature verification
  - x402 Protocol GitHub — Official x402 specification

- **ARCHITECTURE.md sources:**
  - x402-rs GitHub Repository — Source code analysis for registry pattern, provider abstraction
  - Extended UTXO Model - Cardano Docs — EUTXO mechanics, UTXO selection
  - Pallas - Rust-native Cardano building blocks — Low-level transaction construction reference

- **PITFALLS.md sources:**
  - Minimum Ada Value Requirement - Cardano Docs — Min UTXO calculations
  - Transaction Metadata - Cardano Developer Portal — Metadata constraints, label registry
  - CIP-8 Message Signing Specification — Signature verification requirements
  - Time Handling on Cardano — Slot-based validity intervals

### SECONDARY (MEDIUM confidence - Verified Community Sources)
- **STACK.md sources:**
  - Masumi x402-cardano GitHub — Cardano x402 implementation PoC
  - Masumi x402-cardano-examples — Working PoC code (Flask-based)
  - x402-rs GitHub — Rust reference implementation architecture
  - USDM on Cardanoscan — Token verification, policy ID confirmation

- **FEATURES.md sources:**
  - x402 Gitbook - Facilitator — Facilitator concepts, scheme definitions
  - OpenFacilitator — Feature comparison, webhook patterns
  - Mogami Facilitator — Alternative implementation reference

- **ARCHITECTURE.md sources:**
  - Concurrent & Deterministic Batching on UTXO Ledger — Batching patterns for EUTXO
  - Cardano Multiplatform Lib (CML) Documentation — Transaction serialization reference

- **PITFALLS.md sources:**
  - x402 Authorization Replay Risk Analysis — Security considerations for verify-then-work
  - Architecting DApps on the EUTXO Ledger — UTXO contention patterns
  - Concurrency and Cardano — UTXO consumption strategies
  - Understanding Cardano Mempool — Transaction lifecycle, confirmation monitoring

### TERTIARY (LOW confidence - News/Community, verify during implementation)
- Patrick Tobler x402 demo — Announcement coverage, smart contract integration vision
- FluxPoint Studios x402 API — Pricing patterns, Proof-of-Inference anchoring (not directly x402)
- Cardano Forum discussions — Stablecoin landscape, batching strategies

---
*Research completed: 2026-02-04*
*Ready for roadmap: yes*
