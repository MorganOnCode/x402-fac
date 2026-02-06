---
created: 2026-02-06T12:00
title: Support X-PAYMENT-RESPONSE header in settle response
area: planning
priority: important
phase: 4
files:
  - .planning/ROADMAP.md
---

## Problem

Masumi's resource server returns `X-PAYMENT-RESPONSE` header on successful payment:

```python
payment_response = {"success": "true", "network": NETWORK, "transaction": tx_id}
resp.headers["X-PAYMENT-RESPONSE"] = b64_json_encode(payment_response)
```

This is an x402 protocol feature for communicating settlement results back to the client. Our facilitator's `/settle` response doesn't mention providing enough data for the resource server to construct this header.

## Solution

Phase 4 settle response should return `{success: true, transaction: txHash, network: "cardano:mainnet"}` — resource servers use this to build the `X-PAYMENT-RESPONSE` header. Document this in Phase 4 planning and Phase 8 API docs.
