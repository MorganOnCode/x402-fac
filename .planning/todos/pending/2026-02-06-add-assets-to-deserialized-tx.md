---
created: 2026-02-06T12:00
title: Add multi-asset data to DeserializedTx output type
area: planning
priority: critical
phase: 3
files:
  - .planning/phases/03-verification/03-02-PLAN.md
---

## Problem

The `DeserializedTx` output type in 03-02-PLAN only extracts `lovelace` from outputs:

```typescript
body.outputs: Array<{
  addressCborHex: string;
  addressBech32: string;
  lovelace: bigint;
  networkId: number;
}>
```

No `assets` field. Phase 5 (stablecoins) needs to verify native token outputs — USDM, DJED, iUSD all use `policyId + assetNameHex → quantity`. Adding this field now is trivial (CML provides it during CBOR parsing) and prevents a breaking change to `DeserializedTx` in Phase 5.

## Solution

Add `assets: Record<string, bigint>` to the output type in 03-02-PLAN. Extract during CBOR parsing using CML's `Value.multi_asset()` or equivalent. Key format: `policyId + assetNameHex` (concatenated hex strings). This matches masumi's `unit` format. **Update plan before execution.**
