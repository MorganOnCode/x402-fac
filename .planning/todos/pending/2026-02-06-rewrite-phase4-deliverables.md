---
created: 2026-02-06T12:00
title: Rewrite Phase 4 deliverables for transaction-based model
area: planning
priority: critical
phase: 4
files:
  - .planning/ROADMAP.md
---

## Problem

Phase 4 deliverables in ROADMAP.md still describe the old authorization-based model where the facilitator constructs and signs transactions. In the transaction-based model (decided 2026-02-06), the client builds and signs the full transaction. The facilitator just submits the client's pre-signed CBOR.

Current (wrong) deliverables:
- "Transaction construction for single-output settlement"
- "Transaction signing with facilitator key"
- "Verification proof in transaction metadata"

Correct deliverables should be:
- Re-verify pre-signed transaction (call verifyPayment() again)
- Submit client's raw CBOR to Blockfrost /tx/submit
- Monitor for on-chain confirmation
- Return tx hash and settlement status

No transaction construction, no facilitator signing, no metadata embedding.

## Solution

Rewrite Phase 4 section of ROADMAP.md when planning Phase 4. Update deliverables, success criteria, and security checks to reflect transaction-based model. See `.auditing/claude-masumi-plan.md` Section 2.4 for masumi's settlement pattern.
