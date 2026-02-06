---
created: 2026-02-06T12:00
title: Phase 6 batching incompatible with transaction-based model
area: planning
priority: minor
phase: 6
files:
  - .planning/ROADMAP.md
---

## Problem

The transaction-based model makes naive batching impossible — you can't combine pre-signed transactions (each tx references specific UTXOs and is independently signed). Masumi doesn't do batching at all.

Options for Phase 6:
1. **Collect-then-distribute:** Accept individual payments, batch redistribute in a separate facilitator-signed tx (requires facilitator wallet + ADA float)
2. **Remove Phase 6:** Accept that each payment is a separate on-chain tx
3. **Threshold-only:** Large payments immediate, small payments queued with facilitator-managed redistribution

This is already noted in MEMORY.md and both auditors flagged it.

## Solution

Defer decision to Phase 6 planning. By then we'll have real usage data from Phases 3-5 to inform whether batching is worth the complexity. If removed, renumber subsequent phases.
