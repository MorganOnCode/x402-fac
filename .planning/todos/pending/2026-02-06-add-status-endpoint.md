---
created: 2026-02-06T12:00
title: Add /status endpoint for async settlement polling
area: planning
priority: critical
phase: 4
files:
  - .planning/ROADMAP.md
---

## Problem

No `/status` endpoint is planned anywhere in the roadmap. Masumi has `POST /status` for polling settlement progress — essential because Cardano block confirmation takes ~20 seconds. A synchronous `/settle` that blocks for 20+ seconds is bad API design.

The masumi async flow:
1. `/settle` → 202 `{pending: true, transaction: "abc..."}`
2. Client polls `/status` → 202 `{pending: true}` or 200 `{success: true}`

ROADMAP.md mentions "Settlement status tracking" but never defines a route.

## Solution

Add `POST /status` to Phase 4 deliverables. Accepts `{transaction: string, paymentRequirements: {...}}`, queries Blockfrost for tx confirmation, returns success/pending/failed status. See masumi `facilitator_server/app.py` `/status` endpoint and `.auditing/claude-masumi-plan.md` Section 2.4.
