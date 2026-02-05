# Phase 2: Chain Provider - Context

**Gathered:** 2026-02-04
**Status:** Complete (all discretion items resolved in 02-RESEARCH.md and implemented code)

<domain>
## Phase Boundary

Implement Cardano blockchain interaction via Blockfrost with UTXO tracking, reservation, and transaction builder foundation using Lucid Evolution. This phase delivers the chain layer that verification and settlement phases build upon. No endpoints are exposed yet -- this is internal infrastructure.

</domain>

<decisions>
## Implementation Decisions

### Blockfrost handling
- Exponential backoff on errors: start at 500ms, double each attempt, max 3 retries
- On rate limit exhaustion (all retries failed): fail with typed domain error (CHAIN_RATE_LIMITED), caller decides what to do
- Support both free tier (50K/day) and paid tier: config-driven behavior where free tier enables more aggressive caching/batching, paid tier relaxes it
- Blockfrost tier specified in config, affects caching aggressiveness

### UTXO caching
- In-memory cache with Redis as persistent backing store
- Cache TTL: ~60 seconds (roughly 3 Cardano blocks)
- Cache invalidation triggers: Claude's discretion based on tx submissions and reservation lifecycle
- Cache scope (facilitator-only vs any address): Claude's discretion based on payment flow needs

### Reservation system
- UTXO lock/unlock with TTL: Claude picks appropriate TTL based on Cardano transaction lifecycle timing
- Contention handling (all UTXOs reserved): Claude's discretion on reject-immediately vs wait-with-timeout
- Reservation persistence across restarts: Claude's discretion (aligns with caching architecture)
- Max concurrent reservations cap: Claude's discretion

### Network configuration
- Primary development target: Cardano preview testnet
- Strict mainnet safety guardrail: require explicit MAINNET=true flag to connect to mainnet, fail-safe prevents accidental mainnet usage during development
- Include step-by-step Blockfrost registration and API key setup guide
- Dev/test mode for Blockfrost responses: Claude's discretion (mock for tests vs real for dev)

### Claude's Discretion (All Resolved)
*All items below were resolved in 02-RESEARCH.md and implemented. See STATE.md for rationale.*
- ~~API key management strategy~~ → Single key per network, stored in config
- ~~Cache invalidation trigger details~~ → L1 cleared on invalidateAll, L2 expires via Redis TTL
- ~~UTXO cache scope~~ → Facilitator address only (cache-first query)
- ~~Reservation TTL duration~~ → 120s default (configurable, covers ~6 blocks)
- ~~Contention handling strategy~~ → Reject-immediately with CHAIN_UTXO_EXHAUSTED (503)
- ~~Reservation persistence model~~ → In-memory Map + Redis persistence, loadFromRedis at startup
- ~~Concurrent reservation limits~~ → 20 max (configurable)
- ~~Test mocking approach~~ → Interface-based DI with vi.fn(), class-based mocks for constructors

</decisions>

<specifics>
## Specific Ideas

- Blockfrost keys are network-specific (separate key per network), so the config should accommodate that naturally
- The facilitator is intended to understand end-to-end, so implementation should prioritize clarity over abstraction

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 02-chain-provider*
*Context gathered: 2026-02-04*
