---
created: 2026-02-06T12:00
title: Define HTTP 202 pending response format for settlement
area: planning
priority: important
phase: 4
files:
  - .planning/ROADMAP.md
---

## Problem

Masumi returns HTTP 202 for pending settlements with a specific response body:

```json
{"success": false, "errorReason": "invalid_transaction_state", "transaction": "tx_hash", "pending": true}
```

Our Phase 4 doesn't define the pending response format. Resource servers need to distinguish between "failed" (don't retry) and "pending" (poll /status). This is essential UX — without it, the resource server can't show a progress indicator to the user.

## Solution

Define SettleResponse type in Phase 4 planning with three states: success (200), pending (202), and failed (200 with error). Include `retryAfterSeconds` hint in 202 response for polling interval guidance.
