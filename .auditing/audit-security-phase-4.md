---
auditor: antigravity-gemini
created: 2026-02-08 13:50:00
updated: 2026-02-08 13:50:00
focus: security-hardening
status: strong-with-open-items
phases-reviewed: [1, 2, 3, 4]
phase-4-score: 9/10
---

<!--
NOTE TO LLMS:
This file is the audit template.
Anthropic Claude: update and work in .auditing/AUDIT-claude.md
Google Gemini: update and work in .auditing/AUDIT-gemini.md
xAI Grok: update and work in .auditing/AUDIT-grok.md
openAI chatGPT: update and work in .auditing/AUDIT-chatgpt.md
-->

# Audit: Security Hardening & Phase 5 Readiness

## Executive Summary

**Phase 4 (Security Hardening): Strong (9/10)**
The `x402-fac` codebase is a high-quality, disciplined implementation of a Cardano x402 payment facilitator. The use of strict TypeScript patterns, Zod validation, and TDD has resulted in a solid foundation. Security hardening (Phase 4.1) successfully addressed critical vulnerabilities: **rate limiting** and **payload size limits** are now enforced and verified. The primary remaining architectural limitation is the **single-instance UTXO reservation system**, which prevents horizontal scaling but does not compromise fund security.

**Research Quality: 9/10**
The assessment provided a clear, actionable roadmap for security improvements and stablecoin integration. Findings were well-supported by code analysis.

**Requirements & Roadmap: 8/10**
Phases 1-4 are effectively complete. Phase 5 (Stablecoins) requirements are well-understood but require significant schema refactoring.

---

# Tools and Resources

## Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| **fastify** | ^5.x | Web framework |
| **@fastify/rate-limit** | latest | DoS protection |
| **@fastify/helmet** | latest | Security headers |
| **@fastify/cors** | latest | CORS handling |
| **zod** | latest | Schema validation |
| **@blockfrost/blockfrost-js** | latest | Cardano chain data |
| **@lucid-evolution/lucid** | latest | Transaction building/verification |
| **ioredis** | latest | Persistence & idempotency |

## Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| **vitest** | latest | Testing framework |
| **typescript** | latest | Static typing |
| **tsx** | latest | TypeScript execution |

## External APIs and Services

| Service | Purpose | Config Location |
|---------|---------|-----------------|
| **Blockfrost** | Cardano Chain Data | `chain.blockfrost` in `config` |
| **Redis** | Persistence/Locks | `chain.redis` in `config` |
| **IPFS** | Storage (Metadata) | `storage` in `config` (Future) |

## Key Configuration Files

| File | Purpose |
|------|---------|
| `src/config/schema.ts` | Zod schema for app-wide config |
| `src/chain/config.ts` | Zod schema for chain-specific config |

## Source Code Architecture

```
src/
├── server.ts              Fastify server setup & plugins
├── config/                Configuration schemas & loading
├── chain/                 Blockchain interaction (Blockfrost, UTXO)
│   ├── blockfrost-client.ts
│   └── utxo-reservation.ts
├── verify/                Transaction verification logic (x402)
├── settle/                Payment settlement & idempotency
└── routes/                API endpoints
```

## Testing Infrastructure

- **Framework:** Vitest
- **Test location:** `tests/` (unit and integration)
- **Mocking approach:** `vi.mock()` for Redis, Blockfrost, and Lucid to avoid external dependencies in tests.
- **Test count:** >200 passing tests across unit and integration suites.

---

# Sensitive Secrets

## Developer/Operator Secrets

| Secret | Schema Path | Defined In | Purpose |
|--------|-------------|------------|---------|
| **Blockfrost Project ID** | `chain.blockfrost.projectId` | `src/chain/config.ts` | Authenticates with Blockfrost API |
| **Facilitator Seed** | `chain.facilitator.seedPhrase` | `src/chain/config.ts` | Signs settlement transactions |
| **Redis Password** | `chain.redis.password` | `src/chain/config.ts` | Authenticates with Redis (optional) |

## Where Secrets Live

| Path | Status | Contains |
|------|--------|----------|
| `.env` | **Gitignored** | Environment variables |

## Security Controls in Place

- **Logging Exclusions:** Secrets are explicitly excluded from logs in `config` and `BlockfrostClient`.
- **Validation:** Zod schemas ensure secrets match expected formats (e.g., regex for Project ID).
- **No Hardcoded Secrets:** All secrets must be provided via env vars or config files (not in source).

---

## Phase 4: Security Hardening — Detailed Assessment

### What Was Built

| Plan | Scope | Duration | Tests |
|------|-------|----------|-------|
| 4.1 | Rate Limiting & Body Limits | ~1 hour | 2 new |

**Totals:** 1 plan, ~60 minutes, 206 tests passing.

### Architecture Quality

**Strong:**
- **Idempotency**: Redis `SET NX` with SHA-256 hash of CBOR prevents replay attacks effectively.
- **Validation**: Strict Zod schemas for all inputs.
- **Rate Limiting**: Integrated at the framework level (`@fastify/rate-limit`) for robust protection.

**Adequate:**
- **UTXO Reservation**: Currently single-instance (`Map` + Redis backup). Sufficient for current load but limits horizontal scaling.

### Gaps / Issues

| Gap | Risk | Severity |
|-----|------|----------|
| **Single-Instance Reservation** | Race conditions if multiple instances deployed | Medium (UX only, no fund loss) |

### Concerns

**1. UTXO Reservation Race Condition**
`UtxoReservation.reserve()` checks local memory but not Redis. In a multi-instance setup, two instances could reserve the same UTXO, leading to transaction build failures for one user.
**Verdict:** Acceptable for current phase. Documented as a constraint.

---

## Next Phase Readiness Assessment (Stablecoins)

### Needs Resolution Before Next Phase Planning

1.  **Refactor `PaymentAmount`**: `checkAmount` assumes `lovelace`. Must support `Asset` (`policyId` + `assetName`).
2.  **Token Registry**: Configuration needs a whitelist of supported stablecoins (USDM, DJED) to prevent spoofing.
3.  **Min-ADA Logic**: Token outputs require minimum ADA. Verification logic must account for this overhead.

### Recommended Action Items

### High Priority (Phase 5)

1.  **Update `ChainConfig`**: Add `tokenRegistry` schema.
2.  **Refactor Verification**: Make `checkAmount` polymorphic (Lovelace | Asset).
3.  **Implement Min-ADA**: Add logic to calculate required min-ADA for token bundles.

*Audit completed: 2026-02-08*
*Auditor: Antigravity (Google Deepmind)*
*Scope: Full Codebase*

---

## Phase 5 Planning (Appended from Implementation Plan)

### Goal: Stablecoins (Foundation)

#### [MODIFY] [src/chain/types.ts](file:///Users/morgan/Documents/CODE/x402-fac/src/chain/types.ts)
- Add `AssetId` type alias (PolicyID + AssetName).
- Add `PaymentUnit` type (`'lovelace' | AssetId`).

#### [MODIFY] [src/chain/config.ts](file:///Users/morgan/Documents/CODE/x402-fac/src/chain/config.ts)
- Add `supportedTokens` whitelist to [ChainConfig](file:///Users/morgan/Documents/CODE/x402-fac/src/chain/config.ts#93-94).
- Map common symbols (USDM, DJED) to PolicyIDs for the selected network (Preview vs Mainnet).

#### [MODIFY] [src/verify/checks.ts](file:///Users/morgan/Documents/CODE/x402-fac/src/verify/checks.ts)
- Update [checkAmount](file:///Users/morgan/Documents/CODE/x402-fac/src/verify/checks.ts#148-175) to handle non-lovelace assets.
- Add logic to verify "Min-ADA" is present alongside the token output (Cardano requirement).
