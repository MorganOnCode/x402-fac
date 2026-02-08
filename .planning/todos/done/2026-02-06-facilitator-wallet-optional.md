---
created: 2026-02-06T12:00
title: Note facilitator wallet not needed for settlement
area: planning
priority: moderate
phase: 4
files:
  - src/config/schema.ts
  - .planning/ROADMAP.md
---

## Problem

Our config has `chain.facilitator.seedPhrase` and `chain.facilitator.privateKey`. In the transaction-based model, the facilitator doesn't sign transactions for Phases 3-5. The facilitator wallet is only needed for:
- Phase 6 batching (collect-then-distribute, if implemented)
- Future refund processing

Phase 4 planning should not require facilitator wallet setup as a prerequisite.

## Solution

Both config fields are already optional. Note in Phase 4 planning that settlement doesn't require a facilitator wallet — just Blockfrost access for submission. Clarify in docs that facilitator wallet becomes relevant in Phase 6+.
