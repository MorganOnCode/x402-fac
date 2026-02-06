# Requirements: x402 Cardano Facilitator & Storage Service

**Defined:** 2026-02-04
**Core Value:** A working x402 payment flow on Cardano that I understand end-to-end — from signature verification to on-chain settlement — that I can build more sophisticated applications on top of.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01**: Project uses TypeScript with strict mode and proper tooling (pnpm, tsup, ESLint, Prettier)
- [x] **FOUND-02**: Project has testing infrastructure with Vitest and coverage reporting
- [x] **FOUND-03**: Project has pre-commit hooks enforcing lint and type-check
- [x] **FOUND-04**: Project has dependency vulnerability scanning (Snyk or Dependabot)
- [x] **FOUND-05**: Project has error tracking integration (Sentry)

### Protocol

- [x] **PROT-01**: Facilitator exposes `/verify` endpoint that validates payment transactions and required outputs
- [ ] **PROT-02**: Facilitator exposes `/settle` endpoint that submits payments to Cardano blockchain
- [ ] **PROT-03**: Facilitator exposes `/supported` endpoint that returns supported chains, schemes, and facilitator addresses
- [x] **PROT-04**: Facilitator implements `exact` payment scheme for fixed amount transfers
- [x] **PROT-05**: Facilitator verifies signed Cardano transactions (CBOR deserialization, output verification, witness check)

### Cardano

- [x] **CARD-01**: Facilitator maintains UTXO state with reservation system to prevent contention
- [x] **CARD-02**: Facilitator accepts ADA as payment currency
- [ ] **CARD-03**: Facilitator batches multiple payments into single on-chain transactions for economic viability
- [ ] **CARD-04**: Facilitator accepts stablecoins (USDM, DJED, iUSD) as payment currencies
- [x] **CARD-05**: Facilitator calculates and includes min UTXO ADA for token outputs
- [x] **CARD-06**: Facilitator handles slot-based validity intervals correctly

### Security

- [x] **SECU-01**: Facilitator relies on UTXO model for inherent replay protection (each UTXO spent once, no nonce tracking needed)
- [x] **SECU-02**: Facilitator verifies CAIP-2 chain ID and transaction network ID to prevent cross-chain replay
- [x] **SECU-03**: Facilitator validates payment amount, TTL, and fee bounds against requirements and configuration
- [ ] **SECU-04**: Storage service uses settle-then-work pattern for uploads (settle on-chain BEFORE storing file)

### Storage

- [ ] **STOR-01**: Service accepts file uploads gated by x402 payment verification
- [ ] **STOR-02**: Service returns content identifier (CID/hash) after successful upload
- [ ] **STOR-03**: Service serves files freely by content ID without payment required
- [ ] **STOR-04**: Service uses abstracted storage interface (swappable backends)
- [ ] **STOR-05**: Service implements IPFS as first storage backend

### Operations

- [x] **OPER-01**: Facilitator supports JSON configuration file for server settings
- [x] **OPER-02**: Facilitator exposes `/health` endpoint for monitoring
- [x] **OPER-03**: Facilitator logs requests and responses for debugging
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
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| FOUND-05 | Phase 1 | Complete |
| PROT-01 | Phase 3 | Complete |
| PROT-02 | Phase 4 | Pending |
| PROT-03 | Phase 8 | Pending |
| PROT-04 | Phase 3 | Complete |
| PROT-05 | Phase 3 | Complete |
| CARD-01 | Phase 2 | Complete |
| CARD-02 | Phase 2 | Complete |
| CARD-03 | Phase 6 | Pending |
| CARD-04 | Phase 5 | Pending |
| CARD-05 | Phase 2 | Complete |
| CARD-06 | Phase 2 | Complete |
| SECU-01 | Phase 3 | Complete |
| SECU-02 | Phase 3 | Complete |
| SECU-03 | Phase 3 | Complete |
| SECU-04 | Phase 7 | Pending |
| STOR-01 | Phase 7 | Pending |
| STOR-02 | Phase 7 | Pending |
| STOR-03 | Phase 7 | Pending |
| STOR-04 | Phase 7 | Pending |
| STOR-05 | Phase 7 | Pending |
| OPER-01 | Phase 1 | Complete |
| OPER-02 | Phase 1 | Complete |
| OPER-03 | Phase 1 | Complete |
| OPER-04 | Phase 4 | Pending |
| DOCS-01 | Phase 8 | Pending |
| DOCS-02 | Phase 8 | Pending |
| DOCS-03 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-02-04*
*Last updated: 2026-02-06 after Phase 3 completion*
