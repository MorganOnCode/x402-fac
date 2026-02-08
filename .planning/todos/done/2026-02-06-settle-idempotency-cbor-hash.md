---
created: 2026-02-06T12:00
title: Implement settlement idempotency via CBOR hash
area: planning
priority: important
phase: 4
files:
  - .planning/ROADMAP.md
---

## Problem

Masumi uses `sha256(raw_cbor)` as a dedup key to prevent double-submission of the same transaction. Our Phase 4 has no idempotency mechanism specified.

```python
key = hashlib.sha256(raw_cbor).hexdigest()
if key in SUBMITTED:
    tx_hash = SUBMITTED[key]
    # Check status instead of resubmitting
```

Without idempotency, a retry from the resource server could resubmit the same transaction, wasting Blockfrost API quota and potentially confusing status tracking.

## Solution

Phase 4 should implement CBOR hash dedup using Redis (not in-memory dict like masumi). Key: `settle:${sha256(cborBytes)}`, value: `{txHash, status, submittedAt}`. Check before submission, update after. Survives restarts.
