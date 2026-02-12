---
created: 2026-02-06T12:00
title: Document masumi native token format for Phase 5
area: planning
priority: moderate
phase: 5
files:
  - .planning/ROADMAP.md
  - .auditing/claude-masumi-plan.md
---

## Problem

Phase 5 (stablecoins) needs to verify native token outputs but doesn't have the exact Cardano format documented. Masumi shows exactly how:

- `asset` field = policy ID (56-char hex)
- `extra.assetNameHex` = CIP-67 label + ASCII hex (e.g., `0014df105553444d` for USDM)
- `extra.assetFingerprint` = CIP-14 fingerprint (e.g., `asset12ffdj...`)
- `extra.decimals` = decimal places (e.g., 6 for USDM)
- Full unit for verification: `policyId + assetNameHex` (concatenated)

USDM example:
- Policy: `c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad`
- Asset name hex: `0014df105553444d` (CIP-67 `0014df10` + hex of "USDM")
- Full unit: policy + assetNameHex

## Solution

Reference `.auditing/claude-masumi-plan.md` Sections 2.6 and 7.2 during Phase 5 planning. Our schema already supports this (`asset: z.string()`, `extra: z.record(z.unknown()).optional()`). Phase 3 `DeserializedTx` will include `assets` field (see todo #3) for forward compatibility.
