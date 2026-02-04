# Requirements: x402 Cardano Facilitator & Storage Service

**Defined:** 2026-02-04
**Core Value:** A working x402 payment flow on Cardano that I understand end-to-end — from signature verification to on-chain settlement — that I can build more sophisticated applications on top of.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Protocol

- [ ] **PROT-01**: Facilitator exposes `/verify` endpoint that validates payment signatures and payer balance
- [ ] **PROT-02**: Facilitator exposes `/settle` endpoint that submits payments to Cardano blockchain
- [ ] **PROT-03**: Facilitator exposes `/supported` endpoint that returns supported chains, schemes, and facilitator addresses
- [ ] **PROT-04**: Facilitator implements `exact` payment scheme for fixed amount transfers
- [ ] **PROT-05**: Facilitator verifies CIP-8/CIP-30 Cardano message signatures

### Cardano

- [ ] **CARD-01**: Facilitator maintains UTXO state with reservation system to prevent contention
- [ ] **CARD-02**: Facilitator accepts ADA as payment currency
- [ ] **CARD-03**: Facilitator batches multiple payments into single on-chain transactions for economic viability
- [ ] **CARD-04**: Facilitator accepts stablecoins (USDM, DJED, iUSD) as payment currencies
- [ ] **CARD-05**: Facilitator calculates and includes min UTXO ADA for token outputs
- [ ] **CARD-06**: Facilitator handles slot-based validity intervals correctly

### Security

- [ ] **SECU-01**: Facilitator tracks used authorization nonces to prevent double-spend/replay attacks
- [ ] **SECU-02**: Facilitator verifies chain ID binding in signatures to prevent cross-chain replay
- [ ] **SECU-03**: Facilitator validates payment amount and timestamp against requirements and validity window
- [ ] **SECU-04**: Storage service uses settle-then-work pattern for uploads (settle on-chain BEFORE storing file)

### Storage

- [ ] **STOR-01**: Service accepts file uploads gated by x402 payment verification
- [ ] **STOR-02**: Service returns content identifier (CID/hash) after successful upload
- [ ] **STOR-03**: Service serves files freely by content ID without payment required
- [ ] **STOR-04**: Service uses abstracted storage interface (swappable backends)
- [ ] **STOR-05**: Service implements IPFS as first storage backend

### Operations

- [ ] **OPER-01**: Facilitator supports JSON configuration file for server settings
- [ ] **OPER-02**: Facilitator exposes `/health` endpoint for monitoring
- [ ] **OPER-03**: Facilitator logs requests and responses for debugging
- [ ] **OPER-04**: Facilitator includes security testing and verification proofs in settlement

### Documentation

- [ ] **DOCS-01**: System includes architecture diagrams explaining component relationships
- [ ] **DOCS-02**: System includes knowledge graphs showing data and payment flows
- [ ] **DOCS-03**: System includes API documentation for all endpoints

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Protocol

- **PROT-06**: V2 x402 protocol support
- **PROT-07**: Additional payment schemes (streaming, escrow)

### Advanced Cardano

- **CARD-07**: Smart contract integration for advanced payment flows
- **CARD-08**: Babel fees for gasless user experience
- **CARD-09**: Midnight integration for privacy-preserving payments

### Advanced Security

- **SECU-05**: Hardware wallet compatibility testing (Ledger/Trezor)
- **SECU-06**: OFAC/KYT compliance screening

### Advanced Storage

- **STOR-06**: Arweave backend for permanent storage
- **STOR-07**: Sui Walrus backend
- **STOR-08**: Client-side encryption options
- **STOR-09**: Configurable retention policies

### Advanced Operations

- **OPER-05**: Webhooks for settlement completion notifications
- **OPER-06**: Dashboard/analytics UI
- **OPER-07**: OpenTelemetry distributed tracing
- **OPER-08**: Rate limiting per IP and per address

### Transactional Identity (Future Vision)

- **TXID-01**: Payment metadata includes KYC-type data fields
- **TXID-02**: ZK-proof verification for compliance claims
- **TXID-03**: DID integration for self-sovereign agent identity
- **TXID-04**: Payment serves as authorization proof ("Payment is the Passport")

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| EVM/Solana/Aptos support | Cardano-only for v1 to focus learning |
| Pay-to-download model | Model is pay-to-upload with free downloads |
| Production security hardening | Learning project first, harden for production later |
| Mobile apps | API/CLI focus for v1 |
| Multi-facilitator coordination | Single instance sufficient for learning |
| Refund support (x402r) | Requires escrow contracts, defer to v2 |
| File size pricing | Fixed pricing sufficient for v1 learning |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROT-01 | TBD | Pending |
| PROT-02 | TBD | Pending |
| PROT-03 | TBD | Pending |
| PROT-04 | TBD | Pending |
| PROT-05 | TBD | Pending |
| CARD-01 | TBD | Pending |
| CARD-02 | TBD | Pending |
| CARD-03 | TBD | Pending |
| CARD-04 | TBD | Pending |
| CARD-05 | TBD | Pending |
| CARD-06 | TBD | Pending |
| SECU-01 | TBD | Pending |
| SECU-02 | TBD | Pending |
| SECU-03 | TBD | Pending |
| SECU-04 | TBD | Pending |
| STOR-01 | TBD | Pending |
| STOR-02 | TBD | Pending |
| STOR-03 | TBD | Pending |
| STOR-04 | TBD | Pending |
| STOR-05 | TBD | Pending |
| OPER-01 | TBD | Pending |
| OPER-02 | TBD | Pending |
| OPER-03 | TBD | Pending |
| OPER-04 | TBD | Pending |
| DOCS-01 | TBD | Pending |
| DOCS-02 | TBD | Pending |
| DOCS-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 0
- Unmapped: 27 (will be mapped during roadmap creation)

---
*Requirements defined: 2026-02-04*
*Last updated: 2026-02-04 after initial definition*
