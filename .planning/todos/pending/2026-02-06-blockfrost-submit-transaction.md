---
created: 2026-02-06T12:00
title: Add submitTransaction() to BlockfrostClient
area: planning
priority: important
phase: 4
files:
  - src/chain/blockfrost-client.ts
---

## Problem

Our existing `BlockfrostClient` has `getLatestBlock()`, `getEpochParameters()`, and `getAddressUtxos()`. Phase 4 settlement requires submitting raw CBOR to Blockfrost's `/tx/submit` endpoint.

Masumi does this directly:
```python
url = f"{BF_BASE}/tx/submit"
headers = {"project_id": BLOCKFROST_PROJECT_ID, "Content-Type": "application/cbor"}
r = requests.post(url, headers=headers, data=raw_cbor, timeout=30)
```

## Solution

Add `submitTransaction(cborBytes: Uint8Array): Promise<string>` to BlockfrostClient. POST to `/tx/submit` with `Content-Type: application/cbor`. Use existing retry logic. Returns tx hash string on success. Should be flagged as Phase 4 prerequisite during planning.
