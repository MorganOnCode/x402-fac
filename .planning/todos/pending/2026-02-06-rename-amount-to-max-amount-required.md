---
created: 2026-02-06T12:00
title: Rename PaymentRequirements.amount to maxAmountRequired
area: planning
priority: important
phase: 3
files:
  - .planning/phases/03-verification/03-01-PLAN.md
---

## Problem

Our `PaymentRequirementsSchema` in 03-01-PLAN uses `amount`:

```typescript
amount: z.string().min(1),  // lovelace as string
```

But the x402 spec and masumi both use `maxAmountRequired`:

```json
{"maxAmountRequired": "2000000"}
```

This naming mismatch would make our facilitator non-compliant with the x402 protocol spec and incompatible with any existing x402 client libraries.

## Solution

Rename `amount` to `maxAmountRequired` in `PaymentRequirementsSchema` and all references in 03-01 through 03-04 plans. Also update `VerifyContext.requiredAmount` construction in 03-04-PLAN to read from `paymentRequirements.maxAmountRequired`. **Update plan before execution.**
