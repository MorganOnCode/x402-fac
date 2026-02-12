---
created: 2026-02-06T12:00
title: Consider moving /supported endpoint earlier than Phase 8
area: planning
priority: moderate
phase: 8
files:
  - .planning/ROADMAP.md
---

## Problem

Masumi has a trivial `GET /supported` endpoint:

```python
@app.get("/supported")
def supported():
    return jsonify({"kinds": [{"x402Version": 1, "scheme": "exact", "network": NETWORK}]})
```

We defer this to Phase 8, but it's ~10 lines and useful for client integration testing during development. Clients need it for capability discovery.

## Solution

Consider adding `/supported` as a quick-add during Phase 4 or even Phase 3 execution. It's a simple static response from config. Could be added alongside the /verify route with minimal effort.
