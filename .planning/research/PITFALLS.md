# Pitfalls Research: x402 Facilitator for Cardano

**Domain:** x402 Payment Facilitator - Cardano Blockchain
**Researched:** 2026-02-04
**Confidence:** MEDIUM-HIGH (Cardano constraints verified with official docs; x402 security patterns from specification and community research)

## Critical Pitfalls

Mistakes that cause rewrites, security vulnerabilities, or economic losses.

### Pitfall 1: Authorization Replay Attack

**What goes wrong:**
An attacker signs one payment authorization (e.g., 1 ADA) and sends multiple simultaneous requests with the same signature. If the facilitator uses "verify-then-work" pattern without tracking used authorizations, the attacker pays once but receives service multiple times.

**Why it happens:**
The x402 protocol offers two patterns: verify-then-work (~100ms response) and settle-then-work (seconds of latency). Developers choose verify-then-work for speed without implementing replay protection, or implement it incorrectly with race conditions.

**How to avoid:**
1. For operations with side effects (file uploads, state changes), use settle-then-work: settle the payment on-chain BEFORE performing the operation
2. If using verify-then-work for read operations, track used authorization nonces in memory/database with atomic check-and-set
3. Implement distributed nonce tracking if running multiple facilitator instances (Redis, database)
4. Never reuse nonces; the x402 payload includes a unique 32-byte nonce for each authorization

**Warning signs:**
- Settlement logs show fewer settlements than service invocations
- Same payer address with unusually high service usage relative to payments
- Race condition bugs in nonce tracking code

**Phase to address:**
Phase 3 (Settlement) - Implement settle-then-work as default for all state-changing operations. Add replay tracking infrastructure.

**Sources:**
- [x402 Authorization Replay Risk Analysis](https://x.com/pieverse_io/status/1987028393309946309) (MEDIUM confidence)
- [Securing the X402 Protocol](https://dev.to/l_x_1/securing-the-x402-protocol-why-autonomous-agent-payments-need-spending-controls-a90) (MEDIUM confidence)

---

### Pitfall 2: UTXO Contention Under Load

**What goes wrong:**
Multiple concurrent settlement requests try to spend the same UTXO from the facilitator wallet. All but one fail. Under high load, transaction failure rate spikes, causing service degradation and angry users.

**Why it happens:**
Developers familiar with account-based chains (Ethereum) assume they can submit multiple transactions simultaneously from one address. Cardano's UTXO model requires each UTXO to be spent exactly once. Querying UTXOs fresh for each transaction ignores in-flight transactions.

**How to avoid:**
1. Maintain in-memory UTXO state; track "reserved" UTXOs during transaction building
2. Implement UTXO locking with TTL (e.g., 60 seconds) - if transaction doesn't confirm, release lock
3. Use transaction chaining: submit batches where second transaction spends outputs of first
4. For high throughput, pre-split UTXOs into multiple ~10 ADA outputs for parallelism
5. Implement retry logic with exponential backoff for UTXO consumption failures

**Warning signs:**
- High rate of "UTXO already spent" errors in logs
- Transaction success rate drops during traffic spikes
- Settlement latency varies wildly (some instant, some timeout)

**Phase to address:**
Phase 2 (Chain Provider) - Build UTXO tracking and reservation into CardanoChainProvider from the start. Add UTXO health monitoring.

**Sources:**
- [Architecting DApps on the EUTXO Ledger](https://www.iog.io/news/architecting-dapps-on-the-eutxo-ledger) (HIGH confidence)
- [Concurrency and Cardano](https://builtoncardano.com/blog/concurrency-and-cardano-a-problem-a-challenge-or-nothing-to-worry-about) (MEDIUM confidence)
- [Understanding Cardano Batchers](https://forum.cardano.org/t/understanding-cardano-batchers/121850) (MEDIUM confidence)

---

### Pitfall 3: Ignoring Min UTXO for Token Outputs

**What goes wrong:**
Facilitator attempts to settle a stablecoin payment (e.g., 10 DJED) by creating an output with only the token. Transaction fails at submission because Cardano requires minimum ADA (~1.2 ADA) for every UTXO, including token-carrying UTXOs.

**Why it happens:**
Developers think "I'm sending DJED, not ADA" and don't include ADA in the output. This works on account-based chains where tokens are separate balances, but fails on Cardano where tokens must ride along with ADA.

**How to avoid:**
1. Always calculate min UTXO requirement for each output using `utxoCostPerByte` parameter
2. For token outputs, add `max(min_utxo, calculated_min)` ADA alongside the token
3. Factor min UTXO cost into pricing - either absorb it as facilitator cost or require payers to cover it
4. Use the current formula: `min_ada = (160 + serialized_output_size) * utxoCostPerByte`
5. For native assets, output size increases with policy ID and asset name length

**Warning signs:**
- "Output too small" or "Min UTXO not met" errors in transaction submission
- Token settlement failures while ADA settlements work
- Incorrect pricing that doesn't account for min UTXO overhead

**Phase to address:**
Phase 2 (Chain Provider) - Build min UTXO calculation into transaction builder. Test with token outputs early.

**Sources:**
- [Minimum Ada Value Requirement - Cardano Docs](https://docs.cardano.org/native-tokens/minimum-ada-value-requirement/) (HIGH confidence)
- [Cardano Ledger Min UTXO Alonzo](https://cardano-ledger.readthedocs.io/en/latest/explanations/min-utxo-alonzo.html) (HIGH confidence)

---

### Pitfall 4: Single-Payment-Per-Transaction Economics

**What goes wrong:**
Facilitator settles every 0.05 ADA micropayment as a separate transaction. With ~0.17-0.2 ADA transaction fee plus min UTXO overhead, each settlement costs more than the payment itself. Service becomes economically unviable.

**Why it happens:**
EVM patterns where gas fees are low relative to payments. x402-rs reference implementation does immediate settlement, which works for Base/Solana with sub-cent fees but fails for Cardano. Developers port patterns without understanding cost structure.

**How to avoid:**
1. Implement batching: queue verified payments, settle many in single transaction
2. Set batching thresholds: immediate settlement only for payments > 5 ADA, batch smaller ones
3. Batch transaction can include 50+ outputs at marginal cost per output
4. Communicate settlement delay to users (e.g., "Payments settle within 5 minutes")
5. Track pending settlements and provide status API for users to check

**Warning signs:**
- Facilitator wallet draining faster than revenue
- Per-payment fee percentage exceeds 50%
- Users complaining about "unprofitable" pricing

**Phase to address:**
Phase 5 (Batching) - Implement BatchQueue with configurable flush interval and size thresholds. This phase is Cardano-essential, not optional.

**Sources:**
- [Cardano Protocol Parameters Guide](https://docs.cardano.org/about-cardano/explore-more/parameter-guide) (HIGH confidence)
- [Smart Transaction Batching for Cardano](https://projectcatalyst.io/funds/13/cardano-open-developers/smart-transaction-batching-for-optimized-cardano-network-efficiency) (MEDIUM confidence)

---

### Pitfall 5: CIP-8/CIP-30 Signature Replay Across Chains/Dapps

**What goes wrong:**
A user signs a payment message for the facilitator on testnet. An attacker captures this signature and replays it on mainnet, or another attacker captures a signature from one dapp and replays it on another dapp. The signature verifies, but it's being used in an unintended context.

**Why it happens:**
CIP-8 message signing doesn't inherently include chain ID or dapp identifier in the signed payload. If the facilitator only verifies the signature is valid and matches the address, it doesn't verify the message was intended for this specific facilitator on this specific network.

**How to avoid:**
1. Include chain_id in the signed payload (e.g., `cardano:2` for preview, `cardano:764824073` for mainnet)
2. Include facilitator URL or identifier in the signed payload
3. Include timestamp/expiry in the signed payload and enforce validity window
4. Verify all context fields match expected values, not just signature validity
5. Consider using CIP-30 `signData` with structured payload that includes domain binding

**Warning signs:**
- Payments being processed for wrong network
- Same signature appearing across different facilitator instances
- Unexpected payments from addresses that shouldn't have access

**Phase to address:**
Phase 3 (Verification) - Define strict payload schema including chain_id, facilitator_id, and validity_until. Verify all fields during signature verification.

**Sources:**
- [CIP-8 Message Signing Specification](https://cips.cardano.org/cip/CIP-8) (HIGH confidence)
- [CIP-30 dApp-Wallet Bridge](https://cips.cardano.org/cip/CIP-30) (HIGH confidence)
- [Hardware Wallet CIP-30 Signing Issues](https://forum.cardano.org/t/cryptographic-message-signing-cip-8-to-sign-in-with-cip-30-wallets-doesnt-work-for-hardware-wallets/122709) (MEDIUM confidence)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or degraded user experience.

### Pitfall 6: Transaction Validity Interval Misconfiguration

**What goes wrong:**
Transaction is built with a validity interval that expires before it reaches the network (TTL too short), or is set so far in the future that time-sensitive payments can be exploited. Transaction fails with "outside validity interval" error.

**Why it happens:**
Developers hardcode TTL values without understanding slot timing. Cardano uses slots (1 second each) not block numbers. Network congestion or mempool delays can push transaction past its validity window. Conversely, overly long validity windows create security risks.

**How to avoid:**
1. Query current slot from node before building transaction
2. Set validity interval to current_slot + 300-600 (5-10 minutes)
3. For batched settlements, use longer validity but implement re-signing if batch takes too long
4. Never use real wall-clock time for slot calculation without querying network parameters
5. Handle validity expiry gracefully: rebuild and resubmit transaction with fresh interval

**Warning signs:**
- "Transaction outside validity interval" errors
- Transactions stuck in "pending" state indefinitely
- Time-based exploits where old authorizations are accepted

**Phase to address:**
Phase 2 (Chain Provider) - Build slot-aware transaction building. Implement transaction rebuild on expiry.

**Sources:**
- [Time Handling on Cardano](https://docs.cardano.org/about-cardano/explore-more/time) (HIGH confidence)
- [Cardano Vulnerabilities: Time Handling](https://medium.com/@vacuumlabs_auditing/cardano-vulnerabilities-time-handling-3b0925df7fc2) (MEDIUM confidence)

---

### Pitfall 7: Transaction Size Limit Exceeded in Batches

**What goes wrong:**
Batch grows to include many payments. Combined transaction exceeds 16KB limit. Transaction submission fails. All payments in batch fail together.

**Why it happens:**
Developers don't track cumulative transaction size as they add outputs. Metadata or complex outputs (many tokens, long addresses) consume more space than expected. Batch "fits" based on payment count but exceeds byte limit.

**How to avoid:**
1. Track serialized transaction size as you build; stop adding outputs before 14KB (safety margin)
2. Limit batch to ~50 outputs as default cap
3. For token payments with metadata, estimate ~300-500 bytes per output
4. Split oversized batches into multiple transactions
5. Test with maximum-size metadata and multi-token outputs to find real limits

**Warning signs:**
- "Transaction too large" errors on batch submission
- Successful small batches, failed large batches
- Batch failure causing retry storm

**Phase to address:**
Phase 5 (Batching) - Implement size-aware batch aggregation with automatic splitting.

**Sources:**
- [Cardano Transaction Size Limit](https://www.lidonation.com/en/posts/max-transaction-size/) (MEDIUM confidence)
- [Transaction Too Big Due to Too Many Inputs](https://iohk.zendesk.com/hc/en-us/articles/360017733353-Transaction-too-big-due-to-too-many-inputs) (MEDIUM confidence)

---

### Pitfall 8: Metadata String Truncation

**What goes wrong:**
Facilitator includes payment reference or URL in transaction metadata. String exceeds 64-byte limit for individual metadata text fields. Transaction builds but metadata is silently truncated or transaction fails entirely depending on library.

**Why it happens:**
16KB total metadata limit sounds generous, but individual text/byte string fields are limited to 64 bytes. URLs, file hashes, or payment references easily exceed this. Different libraries handle overflow differently (truncate, error, split).

**How to avoid:**
1. For strings > 64 bytes, split into array of 64-byte chunks
2. For file hashes, use raw bytes (32 bytes for SHA256) not hex string (64 chars)
3. Use shortened URLs or URL hashes instead of full URLs
4. Test metadata encoding with maximum-length strings before production
5. Consider off-chain metadata (CIP-26) for large payment references, store hash on-chain

**Warning signs:**
- Metadata appears truncated when viewing transactions on explorer
- Different behavior between testnet and mainnet (library version differences)
- Payment audit trail incomplete due to missing metadata

**Phase to address:**
Phase 4 (Settlement) - Define metadata schema early. Implement chunked string encoding helper.

**Sources:**
- [Build with Transaction Metadata - Cardano Docs](https://developers.cardano.org/docs/transaction-metadata/) (HIGH confidence)
- [Cardano Node Transaction Metadata Reference](https://github.com/input-output-hk/cardano-node-wiki/blob/main/docs/reference/tx-metadata.md) (HIGH confidence)

---

### Pitfall 9: Stablecoin Liquidity/Availability Assumptions

**What goes wrong:**
Facilitator advertises DJED support. User tries to pay with DJED. DJED is currently unmintable due to reserve ratio issues, or user can't acquire DJED at $1 due to DEX premium. User can't complete payment.

**Why it happens:**
Cardano stablecoins (DJED, iUSD) have smaller markets and different mechanics than USDC/USDT. DJED is algorithmic and can become unmintable when reserve ratio falls below threshold. Assuming stablecoin availability like on Ethereum leads to broken user flows.

**How to avoid:**
1. Always support ADA as fallback payment method
2. Monitor stablecoin health: check if DJED reserve ratio is healthy, if iUSD is liquid
3. Display multiple payment options with real-time availability status
4. Price services in ADA with optional stablecoin conversion, not stablecoin-only
5. Consider USDA or USDM (backed stablecoins) as more stable alternatives to DJED

**Warning signs:**
- Users complaining they can't acquire the required stablecoin
- Payment failures when stablecoin is technically supported
- Pricing confusion when stablecoin is trading off-peg

**Phase to address:**
Phase 4 (Settlement) - Implement multi-asset support with ADA as primary. Add stablecoin availability checking.

**Sources:**
- [DJED Stablecoin Liquidity Problems](https://u.today/cardanos-djed-stablecoin-faces-critical-liquidity-problem) (MEDIUM confidence)
- [DJED Depegging Challenges](https://crypto.news/cardanos-djed-stablecoin-faces-unminting-and-depegging-challenges-amid-reserve-ratio-decline/) (MEDIUM confidence)
- [Cardano Stablecoin Strategy Discussion](https://cexplorer.io/article/cardano-needs-a-strategy-for-stablecoins) (MEDIUM confidence)

---

### Pitfall 10: Mempool Full / Transaction Dropped

**What goes wrong:**
During network congestion, facilitator submits transaction but it's dropped from mempool before being included in a block. User thinks payment succeeded (facilitator returned success), but on-chain settlement never happened.

**Why it happens:**
Cardano mempool is intentionally small (~2 blocks worth). During high demand, lower-fee transactions get evicted. If facilitator returns success immediately after submission without confirmation, users may receive service without actual payment settlement.

**How to avoid:**
1. Don't return settlement success until at least 1 confirmation (or implement pending status)
2. Implement transaction monitoring: watch for inclusion within expected time
3. If transaction not included after TTL, rebuild and resubmit with higher priority
4. Track submission vs confirmation status separately in settlement responses
5. For batched settlements, monitor batch transaction and update all pending payments

**Warning signs:**
- Settlement "success" responses but transaction hash not found on explorer
- Discrepancy between settlement count and on-chain transactions
- Higher settlement failures during epoch boundaries or popular NFT mints

**Phase to address:**
Phase 4 (Settlement) - Implement proper transaction lifecycle tracking. Never report success without confirmation.

**Sources:**
- [Understanding the Cardano Mempool](https://cexplorer.io/article/understanding-the-cardano-mem-pool) (MEDIUM confidence)
- [Transaction Resubmission After Expiry](https://github.com/cardano-foundation/cardano-wallet/issues/1839) (MEDIUM confidence)

---

## Minor Pitfalls

Mistakes that cause annoyance but are recoverable.

### Pitfall 11: Incorrect Decimal Handling for Lovelace

**What goes wrong:**
API accepts "1.5 ADA" but stores/processes as integer. Calculation errors cause payments to be 1000000x too large or too small. Users charged 1.5 million ADA instead of 1.5 ADA.

**How to avoid:**
1. Internal representation: always use Lovelace (integer, 1 ADA = 1,000,000 Lovelace)
2. API can accept ADA with conversion: `lovelace = ada * 1_000_000`
3. Validate converted amounts are within reasonable bounds
4. Use fixed-point or decimal libraries for price calculation, convert to Lovelace at boundaries

**Phase to address:**
Phase 1 (Types) - Define Amount type that enforces Lovelace internally.

---

### Pitfall 12: Network Configuration Mismatch

**What goes wrong:**
Facilitator configured for preview testnet but using mainnet wallet address. Transactions build but fail on submission or, worse, succeed and send real ADA to wrong addresses.

**How to avoid:**
1. Validate wallet address prefix matches network (addr_test1 for testnet, addr1 for mainnet)
2. Store network configuration and wallet together, validate consistency at startup
3. Use CAIP-2 chain IDs consistently: `cardano:2` (preview), `cardano:764824073` (mainnet)
4. Test on preview before preprod, preprod before mainnet

**Phase to address:**
Phase 2 (Config) - Implement startup validation of network/address consistency.

---

### Pitfall 13: Hardware Wallet Signature Incompatibility

**What goes wrong:**
User tries to sign payment authorization with Ledger/Trezor. Signature format differs from software wallet. Facilitator verification fails even though signature is technically valid.

**How to avoid:**
1. Test signature verification with multiple wallet types: Nami, Eternl, Lace, Ledger, Trezor
2. Handle both CIP-8 and CIP-30 signature formats
3. Trezor CIP-8/30 support was added later - check for firmware version requirements
4. Document supported wallets for users

**Phase to address:**
Phase 3 (Verification) - Test with hardware wallets early. Document compatibility.

**Sources:**
- [Hardware Wallet CIP-8/30 Signing Issues](https://forum.cardano.org/t/cryptographic-message-signing-cip-8-to-sign-in-with-cip-30-wallets-doesnt-work-for-hardware-wallets/122709) (MEDIUM confidence)

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| No batching (immediate settlement only) | Simpler implementation | Economically unviable for micropayments | Never for payments < 5 ADA |
| Stateless UTXO queries | No state management | UTXO contention failures under load | Only for < 10 settlements/hour |
| Single facilitator wallet | Simple key management | UTXO bottleneck, single point of failure | MVP only, migrate before production |
| Polling for tx confirmation | Simpler than webhooks | Wasted requests, delayed detection | Acceptable, but implement timeout |
| Hardcoded token policy IDs | Faster integration | Breaks when tokens migrate or new ones added | Development only |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Blockfrost API | Using free tier rate limits in production | Self-hosted node or paid tier; implement rate limit handling |
| Ogmios | Not handling connection drops | Implement reconnection logic with backoff |
| Wallet connection (CIP-30) | Assuming wallet always available | Handle wallet disconnect, prompt reconnection |
| IPFS pinning | Not pinning after upload | Explicitly pin content; use pinning service with persistence guarantees |
| Price oracle | Assuming instant updates | Cache prices with TTL, handle stale data gracefully |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Query UTXOs per settlement | Response time increases linearly | Cache UTXOs, update on submission/confirmation | > 100 settlements/day |
| Single UTXO output | Transaction contention | Pre-split UTXOs for parallelism | > 10 concurrent settlements |
| In-memory batch queue | Data loss on restart | Persist queue to database | Any production use |
| Synchronous tx confirmation wait | API timeout on congestion | Async confirmation with webhooks/polling | Network congestion events |
| Full transaction metadata | Large transaction size | Minimal on-chain, full off-chain with hash | > 50 payments per batch |

## Security Mistakes

Domain-specific security issues for payment facilitators.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Not verifying payment amount matches request | User underpays, service provided anyway | Verify `accepted.amount >= requirements.amount` in verify/settle |
| Accepting unconfirmed settlements as final | Double-spend or mempool drop, service without payment | Wait for 1+ confirmation before marking settled |
| Exposing facilitator private key in logs | Complete fund loss | Never log keys; use secure key storage (HSM, encrypted at rest) |
| No rate limiting on verify endpoint | Resource exhaustion attack | Implement per-IP and per-address rate limits |
| Trusting user-provided chain_id | Cross-chain replay attacks | Validate chain_id matches facilitator configuration |
| No amount validation bounds | Integer overflow or precision loss | Validate amount is within u64 bounds and reasonable for service |

## UX Pitfalls

Common user experience mistakes in payment flows.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Settlement takes minutes, no feedback | User thinks payment failed, retries | Show "Payment received, settling..." status |
| Only stablecoin option when supply constrained | User can't complete payment | Always offer ADA as fallback |
| Error messages show technical details | User confused and frustrated | Map technical errors to user-friendly messages |
| No transaction hash provided | User can't verify payment | Always return tx hash and explorer link |
| Immediate timeout on slow networks | Payment lost from user perspective | Long timeouts with progress indication |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Signature Verification:** Often missing chain_id binding - verify message includes network identifier
- [ ] **Settlement:** Often missing confirmation wait - verify tx is actually in a block
- [ ] **Batching:** Often missing size limits - verify batch respects 16KB transaction limit
- [ ] **UTXO Management:** Often missing reservation - verify concurrent builds don't conflict
- [ ] **Token Support:** Often missing min UTXO - verify token outputs include sufficient ADA
- [ ] **Error Handling:** Often missing retry logic - verify transient failures are retried
- [ ] **Monitoring:** Often missing settlement tracking - verify you can reconcile payments vs settlements

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Authorization replay attack | HIGH | Audit logs, identify exploited payments, implement nonce tracking, potentially refund affected users |
| UTXO contention | LOW | Restart with fresh UTXO state, implement proper tracking, re-queue failed settlements |
| Min UTXO failure | LOW | Fix transaction builder, resubmit failed settlements |
| Batch size exceeded | LOW | Split batch, resubmit as multiple transactions |
| Transaction dropped | MEDIUM | Monitor for inclusion, rebuild with fresh TTL, resubmit |
| Stablecoin unavailable | MEDIUM | Add ADA support, migrate existing priced inventory |
| Double-spend (unconfirmed) | HIGH | Implement confirmation wait, audit for service abuse, potentially revoke access |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Authorization replay | Phase 3 (Verification) | Test: same auth fails on second request |
| UTXO contention | Phase 2 (Chain Provider) | Test: 10 concurrent settlements succeed |
| Min UTXO for tokens | Phase 2 (Chain Provider) | Test: DJED/iUSD settlement succeeds |
| Single payment economics | Phase 5 (Batching) | Test: batch 50 micropayments in one tx |
| Signature replay across chains | Phase 3 (Verification) | Test: testnet sig rejected on mainnet config |
| Validity interval | Phase 2 (Chain Provider) | Test: expired tx rebuilt and succeeds |
| Transaction size limit | Phase 5 (Batching) | Test: batch auto-splits at size limit |
| Metadata truncation | Phase 4 (Settlement) | Test: long metadata chunks correctly |
| Stablecoin availability | Phase 4 (Settlement) | Test: graceful fallback to ADA |
| Mempool drop | Phase 4 (Settlement) | Test: dropped tx detected and resubmitted |

## Phase-Specific Warnings

Summary of which pitfalls are most relevant to each development phase.

| Phase | Critical Pitfalls to Avoid |
|-------|---------------------------|
| Phase 1 (Types) | Decimal handling, chain ID format |
| Phase 2 (Chain Provider) | UTXO contention, min UTXO, validity interval, network mismatch |
| Phase 3 (Verification) | Authorization replay, signature chain binding, hardware wallet compat |
| Phase 4 (Settlement) | Mempool drop, confirmation wait, metadata limits, stablecoin availability |
| Phase 5 (Batching) | Transaction size limit, single-payment economics, batch queue persistence |
| Phase 6 (Integration) | Rate limiting, error messages, monitoring |

## Sources

**x402 Protocol Security:**
- [Securing the X402 Protocol - DEV.to](https://dev.to/l_x_1/securing-the-x402-protocol-why-autonomous-agent-payments-need-spending-controls-a90) (MEDIUM confidence)
- [x402 Authorization Replay Risk](https://x.com/pieverse_io/status/1987028393309946309) (MEDIUM confidence)
- [PaymentShield Security Suite](https://mpost.io/agentlisa-unveils-paymentshield-the-first-complete-security-suite-for-x402-autonomous-payments/) (MEDIUM confidence)

**Cardano UTXO Model:**
- [Architecting DApps on EUTXO Ledger - IOG](https://www.iog.io/news/architecting-dapps-on-the-eutxo-ledger) (HIGH confidence)
- [Concurrency and Cardano](https://builtoncardano.com/blog/concurrency-and-cardano-a-problem-a-challenge-or-nothing-to-worry-about) (MEDIUM confidence)
- [Sundae Labs: Concurrency, State & Cardano](https://sundae.fi/posts/concurrency-state-cardano) (MEDIUM confidence)

**Cardano Protocol Constraints:**
- [Minimum Ada Value Requirement - Cardano Docs](https://docs.cardano.org/native-tokens/minimum-ada-value-requirement/) (HIGH confidence)
- [Transaction Metadata - Cardano Developer Portal](https://developers.cardano.org/docs/transaction-metadata/) (HIGH confidence)
- [Transaction Size Limit](https://www.lidonation.com/en/posts/max-transaction-size/) (MEDIUM confidence)
- [Time Handling on Cardano](https://docs.cardano.org/about-cardano/explore-more/time) (HIGH confidence)
- [Understanding Cardano Mempool](https://cexplorer.io/article/understanding-the-cardano-mem-pool) (MEDIUM confidence)

**Cardano Signature Verification:**
- [CIP-8 Message Signing](https://cips.cardano.org/cip/CIP-8) (HIGH confidence)
- [CIP-30 dApp-Wallet Bridge](https://cips.cardano.org/cip/CIP-30) (HIGH confidence)
- [Hardware Wallet Signing Issues](https://forum.cardano.org/t/cryptographic-message-signing-cip-8-to-sign-in-with-cip-30-wallets-doesnt-work-for-hardware-wallets/122709) (MEDIUM confidence)

**Cardano Stablecoins:**
- [DJED Liquidity Problems - U.Today](https://u.today/cardanos-djed-stablecoin-faces-critical-liquidity-problem) (MEDIUM confidence)
- [Cardano Stablecoin Strategy - CExplorer](https://cexplorer.io/article/cardano-needs-a-strategy-for-stablecoins) (MEDIUM confidence)

**Double-Spend Prevention:**
- [Double-Spending in Blockchain - Hacken](https://hacken.io/discover/double-spending/) (MEDIUM confidence)
- [Double-Spending - Wikipedia](https://en.wikipedia.org/wiki/Double-spending) (HIGH confidence)

---
*Pitfalls research for: x402 Cardano Facilitator*
*Researched: 2026-02-04*
