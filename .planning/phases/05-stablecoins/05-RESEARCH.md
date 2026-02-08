# Phase 5: Stablecoins - Research

**Researched:** 2026-02-08
**Domain:** Cardano native token verification (multi-asset UTXO model)
**Confidence:** HIGH

## Summary

Phase 5 extends the existing verification and settlement pipeline to accept stablecoin payments (USDM, DJED, iUSD) alongside ADA. The critical finding is that **most infrastructure already exists**: the `DeserializedTx` interface already extracts multi-asset data from transactions (Phase 3 forward compatibility), the CML library provides `min_ada_required()` for precise min UTXO calculations, and the Blockfrost unit format matches our existing key format (`policyIdHex + assetNameHex` concatenated).

The primary work is: (1) a hardcoded token registry with the three mainnet policy IDs, (2) a token validation check and an adapted amount check in the verification pipeline, (3) a new `min_utxo` check using `CML.min_ada_required()`, and (4) minor changes to `VerifyContext` and route handlers to thread asset information through. Settlement requires zero changes -- it submits raw CBOR regardless of content.

**Primary recommendation:** Add a `src/verify/token-registry.ts` with hardcoded token entries, add two new verification checks (`token_supported` and `min_utxo`), modify the existing `checkAmount` to handle both ADA and token amounts, and use `CML.min_ada_required()` for precise min UTXO computation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Token registry design: Hardcoded TypeScript constants, not config-driven -- acts as a security gate; every token addition goes through code review
- All three tokens supported at launch: USDM, DJED, iUSD
- Mainnet policy IDs only in registry; tests use mocked values
- Tokens identified in API by canonical Cardano format: `policyId.assetNameHex` (not ticker symbols)
- Payments with unsupported/unknown tokens are rejected with a specific verification error
- One currency per payment -- either ADA or a specific token, no mixed payments
- All amounts in base units (like lovelace) -- no human-readable decimals in the API
- No decimal metadata in token registry
- Token output must match recipient + token + amount (strictest matching)
- New dedicated "min_utxo" verification check in the pipeline (not folded into amount check)
- Facilitator calculates required min UTXO using real protocol parameters
- Min UTXO error includes the required amount so clients can fix it

### Claude's Discretion
- Internal amount representation (bigint vs string) -- pick based on existing lovelace patterns
- Overpayment policy (allow vs exact) -- pick based on existing ADA verification behavior
- How to adapt check pipeline (extend existing vs add new checks) -- pick based on code structure
- API field design for distinguishing ADA vs token payments -- pick based on x402 protocol patterns
- Error reason naming for unsupported tokens -- pick based on existing snake_case conventions

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@lucid-evolution/lucid` | installed | CML re-export, Cardano types | Already used |
| CML (`@anastasia-labs/cardano-multiplatform-lib-nodejs`) | 6.0.2-3 | CBOR deserialization, `min_ada_required()` | Already used via Lucid re-export |
| `@blockfrost/blockfrost-js` | installed | Chain queries, tx submission | Already used |
| `zod` | installed | Schema validation | Already used |

### No New Dependencies
This phase requires **zero new npm packages**. Everything needed is already available through the existing CML (via Lucid Evolution) and Blockfrost stack.

## Architecture Patterns

### Token Registry Structure
```
src/
  verify/
    token-registry.ts    # NEW: Hardcoded token definitions
    checks.ts            # MODIFIED: token_supported + min_utxo checks, adapted amount check
    types.ts             # MODIFIED: VerifyContext additions
    cbor.ts              # NO CHANGES (already extracts multi-asset)
    verify-payment.ts    # MODIFIED: new failure messages
  routes/
    verify.ts            # MODIFIED: thread asset info into VerifyContext
    settle.ts            # MODIFIED: thread asset info into VerifyContext (for re-verify)
  settle/
    settle-payment.ts    # NO CHANGES (submits raw CBOR, asset-agnostic)
    types.ts             # NO CHANGES (SettleRequest already has PaymentRequirements)
  chain/
    provider.ts          # MODIFIED: use CML.min_ada_required() instead of manual formula
```

### Pattern 1: Token Registry as Hardcoded Map
**What:** A `Map<string, TokenEntry>` keyed by the `unit` string (policyId + assetNameHex) that defines supported tokens.
**When to use:** Always -- this is the security gate for which tokens the facilitator accepts.
**Example:**
```typescript
// Source: verified from CML type definitions + Cardano blockchain explorers

export interface TokenEntry {
  /** Policy ID (28-byte hex, 56 chars) */
  policyId: string;
  /** Asset name in hex (CIP-67 prefix + ASCII hex) */
  assetNameHex: string;
  /** Human-readable ticker (for logging only, not for matching) */
  ticker: string;
}

/**
 * Supported tokens keyed by unit (policyId + assetNameHex concatenated).
 * Adding a token requires a code change + code review (security gate).
 */
export const SUPPORTED_TOKENS: ReadonlyMap<string, TokenEntry> = new Map([
  [
    'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d',
    {
      policyId: 'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad',
      assetNameHex: '0014df105553444d',
      ticker: 'USDM',
    },
  ],
  [
    '8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61446a65644d6963726f555344',
    {
      policyId: '8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61',
      assetNameHex: '446a65644d6963726f555344',
      ticker: 'DJED',
    },
  ],
  [
    'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069555344',
    {
      policyId: 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880',
      assetNameHex: '69555344',
      ticker: 'iUSD',
    },
  ],
]);

/** Special constant for ADA payments */
export const LOVELACE_UNIT = 'lovelace';

/** Check if an asset identifier is a supported token (not ADA) */
export function isTokenPayment(asset: string): boolean {
  return asset !== LOVELACE_UNIT;
}

/** Look up a token by its unit string */
export function getToken(unit: string): TokenEntry | undefined {
  return SUPPORTED_TOKENS.get(unit);
}
```

### Pattern 2: Branching Amount Check (ADA vs Token)
**What:** The existing `checkAmount` verifies lovelace. For token payments, it must verify the token quantity in the matching output's `assets` map instead.
**When to use:** In the amount verification check, based on whether `ctx.asset` is `'lovelace'` or a token unit.
**Example:**
```typescript
export function checkAmount(ctx: VerifyContext): CheckResult {
  if (ctx._matchingOutputIndex === undefined) {
    return { check: 'amount', passed: false, reason: 'amount_insufficient', details: { error: 'no matching output found' } };
  }

  const output = ctx._parsedTx!.body.outputs[ctx._matchingOutputIndex];

  if (ctx.asset === LOVELACE_UNIT) {
    // ADA payment: check lovelace (existing behavior)
    if (output.lovelace >= ctx.requiredAmount) {
      return { check: 'amount', passed: true };
    }
    return {
      check: 'amount', passed: false, reason: 'amount_insufficient',
      details: { expected: ctx.requiredAmount.toString(), actual: output.lovelace.toString() },
    };
  }

  // Token payment: check token quantity in assets map
  const tokenAmount = output.assets[ctx.asset] ?? 0n;
  if (tokenAmount >= ctx.requiredAmount) {
    return { check: 'amount', passed: true };
  }
  return {
    check: 'amount', passed: false, reason: 'amount_insufficient',
    details: { expected: ctx.requiredAmount.toString(), actual: tokenAmount.toString(), asset: ctx.asset },
  };
}
```

### Pattern 3: Min UTXO Check Using CML
**What:** A dedicated check that verifies the recipient output contains enough ADA to satisfy Cardano's min UTXO requirement.
**When to use:** After recipient check, for ALL payments (ADA and token). Token outputs require more ADA than ADA-only outputs due to multi-asset serialization overhead.
**Example:**
```typescript
// Source: CML type definitions (min_ada_required), verified working

export async function checkMinUtxo(ctx: VerifyContext): Promise<CheckResult> {
  if (ctx._matchingOutputIndex === undefined || !ctx._parsedTx) {
    return { check: 'min_utxo', passed: false, reason: 'cbor_required' };
  }

  const output = ctx._parsedTx.body.outputs[ctx._matchingOutputIndex];
  const requiredMinAda = await ctx.getMinUtxoLovelace(ctx.asset);

  if (output.lovelace >= requiredMinAda) {
    return { check: 'min_utxo', passed: true };
  }

  return {
    check: 'min_utxo',
    passed: false,
    reason: 'min_utxo_insufficient',
    details: {
      required: requiredMinAda.toString(),
      actual: output.lovelace.toString(),
      message: `min UTXO requires ${requiredMinAda.toString()} lovelace, got ${output.lovelace.toString()}`,
    },
  };
}
```

### Anti-Patterns to Avoid
- **Manual min UTXO formula:** Do NOT hand-roll the `(160 + size) * coinsPerUtxoByte` calculation. Use `CML.min_ada_required()` which correctly serializes the entire TransactionOutput and accounts for all edge cases (datum, script refs, etc.). The existing `getMinUtxoLovelace(numAssets)` in `provider.ts` is a rough approximation -- for verification, use the precise CML function.
- **String-based token matching:** Do NOT compare ticker names ("USDM"). Always use the full unit string (`policyIdHex + assetNameHex`).
- **Decimal conversion in API:** Do NOT divide by 10^6 or convert amounts to human-readable form. All amounts are in base units.
- **Mixed asset payments:** Do NOT attempt to verify outputs containing multiple different tokens as a single payment. One currency per payment.

## Mainnet Token Registry Data

### USDM (Mehen / Moneta Digital)
| Field | Value | Confidence |
|-------|-------|------------|
| Policy ID | `c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad` | HIGH (Cardanoscan verified) |
| Asset Name Hex | `0014df105553444d` | HIGH (CIP-67 label 333 + "USDM" ASCII) |
| Full Unit | `c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d` | HIGH (computed, verified) |
| Decimals | 6 | MEDIUM (from metadata, not used in API) |
| Type | Fiat-backed (USD) | HIGH |
| CIP Standard | CIP-67/CIP-68 (label 333 = fungible token) | HIGH |

### DJED (COTI / Djed Alliance)
| Field | Value | Confidence |
|-------|-------|------------|
| Policy ID | `8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61` | HIGH (Cardanoscan verified) |
| Asset Name Hex | `446a65644d6963726f555344` | HIGH ("DjedMicroUSD" ASCII hex) |
| Full Unit | `8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61446a65644d6963726f555344` | HIGH (computed, verified) |
| Decimals | 6 | MEDIUM (from metadata) |
| Type | Algorithmic, overcollateralized (ADA-backed) | HIGH |
| CIP Standard | Pre-CIP-67 (plain ASCII asset name) | HIGH |

### iUSD (Indigo Protocol)
| Field | Value | Confidence |
|-------|-------|------------|
| Policy ID | `f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880` | HIGH (Cardanoscan verified) |
| Asset Name Hex | `69555344` | HIGH ("iUSD" ASCII hex) |
| Full Unit | `f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069555344` | HIGH (computed, verified) |
| Decimals | 6 | MEDIUM (from metadata) |
| Type | Synthetic, overcollateralized (ADA-backed, pegged to median of USDC/TUSD/USDT) | HIGH |
| CIP Standard | Pre-CIP-67 (plain ASCII asset name) | HIGH |

### Unit Format Verification
All three tokens follow the standard Cardano/Blockfrost unit format:
- Policy ID: 56 hex chars (28 bytes, standard ScriptHash)
- Asset Name Hex: variable length (8-24 chars for these tokens)
- Unit = `policyId + assetNameHex` (concatenated, no separator)
- This matches the existing `assets` key format in `DeserializedTx.body.outputs[].assets`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Min UTXO calculation | Manual `(160 + size) * coinsPerUtxoByte` | `CML.min_ada_required(output, coinsPerUtxoByte)` | CML correctly serializes the full TxOut including datum/script refs; manual formula is approximate |
| Asset name encoding | Custom hex encoding | `CML.AssetName.from_hex()` / `.to_hex()` | Handles CIP-67 prefixes correctly, validates length |
| Policy ID parsing | String slicing (first 56 chars) | `CML.ScriptHash.from_hex()` / `.to_hex()` | Type-safe, validates 28-byte length |
| Token amount extraction from CBOR | Custom multi-asset traversal | Already done in `cbor.ts` lines 94-112 | Phase 3 forward compatibility code handles this |

**Key insight:** The existing `cbor.ts` already extracts multi-asset values into the `assets: Record<string, bigint>` format using the correct unit key. No CBOR-level changes are needed for Phase 5.

## CML Multi-Asset API Reference

### Key Types (from CML type definitions, verified in project)

```typescript
// Source: node_modules/.pnpm/@anastasia-labs+cardano-multiplatform-lib-nodejs@6.0.2-3

// Value: coin + optional multi-asset
class Value {
  coin(): bigint;
  multi_asset(): MultiAsset;
  has_multiassets(): boolean;
  static new(coin: bigint, multiasset: MultiAsset): Value;
  static from_coin(coin: bigint): Value;
  to_cbor_bytes(): Uint8Array;
}

// MultiAsset: map of policy IDs to asset maps
class MultiAsset {
  static new(): MultiAsset;
  keys(): PolicyIdList;                                    // Returns list of ScriptHash
  get_assets(key: ScriptHash): MapAssetNameToCoin | undefined;  // Assets for a policy
  get(policy_id: ScriptHash, asset: AssetName): bigint | undefined;  // Direct lookup
  insert_assets(policy_id: ScriptHash, assets: MapAssetNameToCoin): MapAssetNameToCoin | undefined;
  set(policy_id: ScriptHash, asset: AssetName, value: bigint): bigint | undefined;
  policy_count(): number;
}

// MapAssetNameToCoin: map of asset names to quantities
class MapAssetNameToCoin {
  static new(): MapAssetNameToCoin;
  keys(): AssetNameList;
  get(key: AssetName): bigint | undefined;
  insert(key: AssetName, value: bigint): bigint | undefined;
  len(): number;
}

// PolicyIdList: ordered list of policy IDs
class PolicyIdList {
  len(): number;
  get(index: number): ScriptHash;
}

// ScriptHash: 28-byte hash (policy ID)
class ScriptHash {
  to_hex(): string;          // Raw hex, NOT CBOR-wrapped
  static from_hex(input: string): ScriptHash;
}

// AssetName: up to 32 bytes
class AssetName {
  to_hex(): string;          // Raw hex, NOT CBOR-wrapped
  static from_hex(input: string): AssetName;
  static from_str(utf8_str: string): AssetName;  // From UTF-8 string
  to_str(): string;          // To UTF-8 (errors if not valid UTF-8)
}

// TransactionOutput: address + value + optional datum/script
class TransactionOutput {
  address(): Address;
  amount(): Value;
  to_cbor_bytes(): Uint8Array;  // For min UTXO size calculation
  static new(address: Address, amount: Value, datum_option?: DatumOption, script_reference?: Script): TransactionOutput;
}

// Top-level utility function
function min_ada_required(output: TransactionOutput, coins_per_utxo_byte: bigint): bigint;
```

### Critical API Notes
1. **`ScriptHash.to_hex()` and `AssetName.to_hex()`** return raw hex, NOT CBOR-wrapped hex. This is the correct format for unit string construction.
2. **`MultiAsset.get_assets()` returns `MapAssetNameToCoin | undefined`** -- the `undefined` case means no assets exist under that policy ID.
3. **`MapAssetNameToCoin.get()` returns `bigint | undefined`** -- the amount is already a bigint, not a string.
4. **`CML.min_ada_required()` takes a `TransactionOutput` and `coinsPerUtxoByte`** -- it computes `max(serializedSize * coinsPerUtxoByte, ...)` using the actual CBOR serialization.
5. All CML objects allocated from WASM **must be freed** with `.free()` in try/finally blocks.

## Min UTXO Calculation

### Babbage Era Formula (Current)
```
minUTxoVal = (160 + sizeInBytes(TxOut)) * coinsPerUTxOByte
```
- `160` = constant overhead (20 words * 8 bytes) for UTxO map entry
- `sizeInBytes(TxOut)` = CBOR serialized size of the entire TransactionOutput
- `coinsPerUTxOByte` = protocol parameter, currently **4310** lovelace on mainnet

### Measured Values (verified with CML.min_ada_required, coinsPerUtxoByte = 4310)

| Output Type | Min ADA (lovelace) | Min ADA (ADA) |
|-------------|-------------------|---------------|
| ADA-only (no tokens) | 969,750 | ~0.97 |
| 1 token (USDM, 1 policy ID) | 1,172,320 | ~1.17 |
| 3 tokens (3 different policy IDs) | 1,560,220 | ~1.56 |

### Implementation Strategy for Min UTXO Check
Instead of using the existing rough `ChainProvider.getMinUtxoLovelace(numAssets)`, the min_utxo check should:

1. Reconstruct a CML `TransactionOutput` from the deserialized data (address + value)
2. Call `CML.min_ada_required(output, coinsPerUtxoByte)` for the exact minimum
3. Compare against the actual lovelace in the output

**However**, reconstructing a full CML TransactionOutput just for the check is wasteful since we already deserialized it. Alternative approaches:

**Option A (Recommended): Use the existing `ChainProvider.getMinUtxoLovelace()` with asset count.**
- Already works, already caches protocol params
- Good enough for verification (we only need a lower bound -- if the tx was built correctly by the client, it will exceed the minimum)
- The current formula `(160 + 2 + 28 * numAssets) * coinsPerUtxoByte` gives a reasonable estimate
- Advantage: No CML WASM allocation needed in the check

**Option B: Reconstruct CML TransactionOutput for exact calculation.**
- More precise but requires CML WASM allocation (address + value + multi-asset)
- Heavier per-request cost
- Only matters for edge cases where the client sends exactly the minimum

**Recommendation:** Use Option A (existing `getMinUtxoLovelace` method) for Phase 5. The formula-based approach is a conservative lower bound -- any properly built transaction will exceed it. If precision issues arise later, we can upgrade to Option B.

To use the existing method: count the number of distinct assets in the recipient output's `assets` map and pass that count to `getMinUtxoLovelace()`.

## Verification Pipeline Changes

### Current Pipeline (8 checks)
```
1. cbor_valid   -> parses CBOR, sets ctx._parsedTx
2. scheme       -> validates "exact"
3. network      -> validates CAIP-2 chain ID
4. recipient    -> finds matching output, sets ctx._matchingOutputIndex
5. amount       -> checks lovelace >= required
6. witness      -> checks VKey witnesses present
7. ttl          -> checks TTL not expired
8. fee          -> checks fee bounds
```

### Proposed Pipeline (10 checks)
```
1. cbor_valid       -> parses CBOR, sets ctx._parsedTx (UNCHANGED)
2. scheme           -> validates "exact" (UNCHANGED)
3. network          -> validates CAIP-2 chain ID (UNCHANGED)
4. token_supported  -> NEW: validates asset is "lovelace" or in SUPPORTED_TOKENS
5. recipient        -> finds matching output, sets ctx._matchingOutputIndex (UNCHANGED)
6. amount           -> MODIFIED: checks lovelace OR token amount >= required
7. min_utxo         -> NEW: checks output has sufficient ADA for min UTXO requirement
8. witness          -> checks VKey witnesses present (UNCHANGED)
9. ttl              -> checks TTL not expired (UNCHANGED)
10. fee             -> checks fee bounds (UNCHANGED)
```

### New Check: `token_supported` (position 4)
**Purpose:** Early rejection of unsupported tokens before expensive output scanning.
**Logic:**
- If `ctx.asset === 'lovelace'` -> PASS (ADA payment)
- If `SUPPORTED_TOKENS.has(ctx.asset)` -> PASS (known token)
- Otherwise -> FAIL with reason `unsupported_token`

**Must come before `recipient`** so that unsupported token requests fail fast.

### Modified Check: `amount` (position 6)
**Change:** Branch on `ctx.asset`:
- `'lovelace'`: existing behavior (compare `output.lovelace >= ctx.requiredAmount`)
- Token: compare `output.assets[ctx.asset] >= ctx.requiredAmount`

**Overpayment recommendation:** Allow overpayment (use `>=` not `===`). This matches existing ADA behavior where `checkAmount` uses `>=`. Exact matching would reject legitimate transactions where change computation results in slightly more than requested.

### New Check: `min_utxo` (position 7)
**Purpose:** Verify the recipient output contains enough ADA to satisfy Cardano's min UTXO requirement.
**Logic:** Call `ctx.getMinUtxoLovelace(asset)` and compare against `output.lovelace`.
**Applies to:** ALL payments (ADA and token). For ADA-only outputs, the min is ~0.97 ADA. For token outputs, it's higher (~1.17+ ADA).

### VerifyContext Changes
```typescript
// Additions to VerifyContext interface:
interface VerifyContext {
  // ... existing fields ...

  /** Asset identifier: "lovelace" for ADA, or policyId+assetNameHex for tokens */
  asset: string;

  /** Calculate min UTXO lovelace for an output carrying the given asset */
  getMinUtxoLovelace: (asset: string) => Promise<bigint>;

  // Pipeline state additions:
  /** Token amounts in the matching output (for token amount checks) */
  _matchingOutputAssets?: Record<string, bigint>;
}
```

### Route Handler Changes
Both `/verify` and `/settle` route handlers need to:
1. Read `paymentRequirements.asset` and pass it as `ctx.asset`
2. Provide `ctx.getMinUtxoLovelace` callback (from `ChainProvider`)

## Settlement Pipeline Changes

### No Changes Required
Settlement is **asset-agnostic** by design:
- `settlePayment()` re-verifies (which now handles tokens via updated checks)
- Dedup key is SHA-256 of raw CBOR bytes (unchanged -- same CBOR regardless of assets)
- Blockfrost `submitTransaction()` accepts raw CBOR bytes (unchanged)
- `pollConfirmation()` checks tx hash existence (unchanged)
- `/status` endpoint returns confirmation status by tx hash (unchanged)

### Validation
The re-verification in `settlePayment()` will automatically pick up the new token checks because it calls `verifyPayment()`, which iterates `VERIFICATION_CHECKS`. No settlement code changes needed.

## x402 Protocol Token Format

### PaymentRequirements Asset Field
Based on the existing schema and masumi reference (todo #4):

| Payment Type | `asset` Field Value | `extra` Fields |
|-------------|-------------------|----------------|
| ADA | `"lovelace"` | (none needed) |
| USDM | `"c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad"` (policy ID) | `{ "assetNameHex": "0014df105553444d" }` |
| DJED | `"8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61"` (policy ID) | `{ "assetNameHex": "446a65644d6963726f555344" }` |
| iUSD | `"f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880"` (policy ID) | `{ "assetNameHex": "69555344" }` |

**Masumi format:** `asset` = policy ID (56-char hex), `extra.assetNameHex` = asset name hex

**HOWEVER**, the CONTEXT.md locked decision says: "Tokens identified in API by canonical Cardano format: `policyId.assetNameHex`". This implies a dot-separated format in the `asset` field itself, not split across `asset` and `extra`.

### Recommended Format (honoring locked decision)
Use `policyId.assetNameHex` in the `asset` field (dot separator for readability, easy to split):

| Payment Type | `asset` Field Value |
|-------------|-------------------|
| ADA | `"lovelace"` |
| USDM | `"c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad.0014df105553444d"` |
| DJED | `"8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61.446a65644d6963726f555344"` |
| iUSD | `"f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880.69555344"` |

**Internal conversion:** When looking up tokens in the registry or checking transaction outputs, strip the dot to get the concatenated unit string (which matches Blockfrost/CML format). The dot is purely for the API wire format.

```typescript
/** Convert API asset format (policyId.assetNameHex) to internal unit (concatenated) */
function assetToUnit(asset: string): string {
  if (asset === LOVELACE_UNIT) return asset;
  return asset.replace('.', '');  // Remove dot separator
}
```

## Common Pitfalls

### Pitfall 1: Confusing Asset Naming Conventions
**What goes wrong:** CIP-67 assets (USDM) have a 4-byte prefix in their asset name hex (`0014df10`), while pre-CIP-67 assets (DJED, iUSD) have plain ASCII hex. Treating them the same "by name" will fail.
**Why it happens:** USDM's on-chain name is `0014df105553444d` (not just `5553444d`).
**How to avoid:** Always use the full asset name hex from the registry, never try to encode/decode the human-readable name.
**Warning signs:** Token lookup failures for USDM but not DJED/iUSD.

### Pitfall 2: CML WASM Memory Leaks
**What goes wrong:** CML objects allocated in WASM are not garbage collected by V8.
**Why it happens:** Every `CML.ScriptHash.from_hex()`, `CML.AssetName.from_hex()`, `CML.TransactionOutput.new()` etc. allocates WASM memory.
**How to avoid:** Use try/finally blocks with `.free()` calls. The existing `cbor.ts` pattern is the correct model.
**Warning signs:** Memory growth under load in production.

### Pitfall 3: `to_hex()` vs `to_cbor_hex()` Confusion
**What goes wrong:** Using `to_cbor_hex()` instead of `to_hex()` produces CBOR-wrapped hex, which adds extra bytes and doesn't match the expected unit format.
**Why it happens:** CML has both methods on most types; CBOR hex includes the CBOR tag/length prefix.
**How to avoid:** Always use `to_hex()` for raw hex (as the existing `cbor.ts` code does). `to_cbor_hex()` is only for CBOR encoding/decoding workflows.
**Warning signs:** Policy IDs appearing longer than 56 chars, or token lookups failing.

### Pitfall 4: Ignoring Min UTXO for ADA Payments
**What goes wrong:** Only checking min UTXO for token payments, not ADA payments.
**Why it happens:** Assumption that ADA-only outputs always have enough ADA.
**How to avoid:** The min_utxo check should run for ALL payments. An ADA-only output needs ~0.97 ADA minimum. A payment of exactly 0.5 ADA would fail on-chain even though the amount check passes.
**Warning signs:** ADA payments under 1 ADA failing at settlement but passing verification.

### Pitfall 5: Using Integer Division for Amounts
**What goes wrong:** JavaScript's `Number` type loses precision above 2^53. Token amounts with 6 decimals can be large.
**Why it happens:** Converting bigint to number for comparison or arithmetic.
**How to avoid:** All amount comparisons use `bigint` exclusively (the existing codebase already does this correctly).
**Warning signs:** Amounts appearing to be equal when they're not, or rounding errors.

## Code Examples

### Example 1: Extracting Token Amount from Deserialized Output
```typescript
// Source: existing cbor.ts output format + verified CML API

// DeserializedTx.body.outputs[i].assets already contains the multi-asset map
// Key format: policyIdHex + assetNameHex (concatenated, no separator)
// This was built in Phase 3 (cbor.ts lines 94-112)

const output = ctx._parsedTx.body.outputs[ctx._matchingOutputIndex];

// For ADA:
const adaAmount = output.lovelace; // bigint

// For a token (e.g., USDM):
const unit = 'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d';
const tokenAmount = output.assets[unit] ?? 0n; // bigint, 0n if not present
```

### Example 2: Token Registry Lookup
```typescript
// Source: designed based on CONTEXT.md decisions

import { SUPPORTED_TOKENS, LOVELACE_UNIT, isTokenPayment } from './token-registry.js';

function checkTokenSupported(ctx: VerifyContext): CheckResult {
  // ADA payments always supported
  if (ctx.asset === LOVELACE_UNIT) {
    return { check: 'token_supported', passed: true };
  }

  // Convert API format (policyId.assetNameHex) to unit format
  const unit = ctx.asset.replace('.', '');

  if (SUPPORTED_TOKENS.has(unit)) {
    return { check: 'token_supported', passed: true };
  }

  return {
    check: 'token_supported',
    passed: false,
    reason: 'unsupported_token',
    details: { asset: ctx.asset },
  };
}
```

### Example 3: Building CML TransactionOutput for Precise Min UTXO (Option B)
```typescript
// Source: CML type definitions, verified with runtime test

import { CML } from '@lucid-evolution/lucid';

function computeMinAdaForOutput(
  recipientBech32: string,
  asset: string,       // "lovelace" or "policyId.assetNameHex"
  amount: bigint,
  coinsPerUtxoByte: bigint,
): bigint {
  const address = CML.Address.from_bech32(recipientBech32);
  try {
    let value: CML.Value;
    if (asset === 'lovelace') {
      value = CML.Value.from_coin(amount);
    } else {
      const [policyIdHex, assetNameHex] = asset.split('.');
      const policyId = CML.ScriptHash.from_hex(policyIdHex);
      const assetName = CML.AssetName.from_hex(assetNameHex);
      const multiAsset = CML.MultiAsset.new();
      const assets = CML.MapAssetNameToCoin.new();
      assets.insert(assetName, amount);
      multiAsset.insert_assets(policyId, assets);
      value = CML.Value.new(0n, multiAsset);
      // Note: free intermediate objects
      policyId.free(); assetName.free(); assets.free(); multiAsset.free();
    }
    const output = CML.TransactionOutput.new(address, value);
    try {
      return CML.min_ada_required(output, coinsPerUtxoByte);
    } finally {
      output.free();
      value.free();
    }
  } finally {
    address.free();
  }
}
```

## Discretion Recommendations

### Internal Amount Representation: `bigint`
**Recommendation:** Use `bigint` throughout (matching existing lovelace patterns).
**Rationale:** The existing codebase uses `bigint` for all lovelace amounts (`requiredAmount`, `feeMin`, `feeMax`, `_matchingOutputAmount`). Token amounts from CML are also `bigint`. Consistency wins. Amounts are converted from string (JSON-safe) to bigint at the route handler boundary.

### Overpayment Policy: Allow (>=)
**Recommendation:** Allow overpayment using `>=` comparison.
**Rationale:** The existing `checkAmount` already uses `>=` for ADA (line 161 of `checks.ts`). Exact matching would reject legitimate transactions where wallet coin selection produces slightly higher amounts. Apply the same `>=` policy to token amounts.

### Check Pipeline Adaptation: Add New Checks + Modify Existing
**Recommendation:** Add `checkTokenSupported` and `checkMinUtxo` as new check functions. Modify `checkAmount` to branch on ADA vs token. Do NOT create entirely separate check pipelines for ADA vs token.
**Rationale:** The existing pipeline architecture (ordered array of check functions, context threading) is clean and extensible. Adding 2 checks and modifying 1 is simpler and less error-prone than duplicating the pipeline.

### API Field Design: `policyId.assetNameHex` in `asset`
**Recommendation:** Use `policyId.assetNameHex` (dot-separated) in the `asset` field of PaymentRequirements.
**Rationale:** Aligns with the CONTEXT.md locked decision. The dot separator makes it human-readable while remaining trivially splittable. Internally, strip the dot to get the concatenated Blockfrost/CML unit format.

### Error Reason Naming: `unsupported_token`
**Recommendation:** Use `unsupported_token` as the reason code.
**Rationale:** Follows existing `snake_case` pattern: `invalid_cbor`, `unsupported_scheme`, `network_mismatch`, `recipient_mismatch`, `amount_insufficient`, `missing_witness`, `transaction_expired`, `unreasonable_fee`. New reasons: `unsupported_token`, `min_utxo_insufficient`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|-------------|------------------|--------------|--------|
| `coinsPerUTxOWord` (Alonzo) | `coinsPerUTxOByte` (Babbage) | Babbage HF (Sep 2022) | Min UTXO = `(160 + sizeInBytes(TxOut)) * coinsPerUTxOByte` |
| Manual min UTXO estimation | `CML.min_ada_required()` | CML 6.x | Precise calculation using actual serialization |
| Simple lovelace-only Value | Multi-asset Value model | Mary HF (Mar 2021) | Outputs carry both ADA and native tokens |

**Current mainnet coinsPerUTxOByte:** 4310 lovelace (HIGH confidence)

## Open Questions

1. **Masumi `asset` field format divergence**
   - What we know: Masumi puts policy ID in `asset` and asset name hex in `extra.assetNameHex`. Our CONTEXT.md says `policyId.assetNameHex` in the `asset` field.
   - What's unclear: Whether future interoperability with the broader x402 ecosystem requires matching the masumi format exactly.
   - Recommendation: Follow the CONTEXT.md decision (`policyId.assetNameHex`). We can add masumi-compatible parsing later if needed (they're both easily derivable from the same data).

2. **Token registry testnet equivalents**
   - What we know: USDM, DJED, iUSD have mainnet policy IDs. Tests use mocked values.
   - What's unclear: Whether any of these tokens have official preprod/preview deployments with different policy IDs.
   - Recommendation: Tests should use fake policy IDs (`"aa".repeat(28)` etc.). If testnet deployment is needed later, add separate testnet entries to the registry gated by network config.

3. **`ChainProvider.getMinUtxoLovelace()` accuracy**
   - What we know: The current formula `(160 + 2 + 28 * numAssets) * coinsPerUtxoByte` is an approximation. `CML.min_ada_required()` gives the exact value.
   - What's unclear: Whether the approximation is always a safe lower bound (it should be, but edge cases with very long asset names could theoretically exceed 28 bytes per asset).
   - Recommendation: Use the existing approximation for Phase 5. It's conservative enough for verification. Log a warning if the actual output lovelace is between the approximate and exact thresholds.

## Sources

### Primary (HIGH confidence)
- CML type definitions: `@anastasia-labs/cardano-multiplatform-lib-nodejs@6.0.2-3` (read directly from project `node_modules`)
- CML runtime verification: `CML.min_ada_required()` tested with actual values, confirmed working
- Existing codebase: `src/verify/cbor.ts` (multi-asset extraction), `src/verify/checks.ts` (check pipeline), `src/verify/types.ts` (VerifyContext), `src/chain/provider.ts` (getMinUtxoLovelace)
- [Cardanoscan USDM token page](https://cardanoscan.io/token/c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d) - policy ID and unit verified
- [Cardanoscan DJED token page](https://cardanoscan.io/token/8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61446a65644d6963726f555344) - policy ID and unit verified
- [Cardanoscan iUSD token page](https://cardanoscan.io/token/f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069555344) - policy ID and unit verified

### Secondary (MEDIUM confidence)
- [CIP-67 Asset Name Label Registry](https://cips.cardano.org/cip/CIP-67) - USDM CIP-67 prefix (label 333 = `0014df10`) verified
- [CIP-55 Protocol Parameters (Babbage Era)](https://cips.cardano.org/cip/CIP-55) - coinsPerUTxOByte formula
- [Cardano min UTXO docs](https://docs.cardano.org/native-tokens/minimum-ada-value-requirement/) - formula reference
- [Blockfrost API docs](https://docs.blockfrost.io/) - unit format (policyId + assetNameHex concatenated)
- [masumi-network/x402-cardano](https://github.com/masumi-network/x402-cardano) - PaymentRequirements.asset format reference
- [masumi-network/x402-cardano-examples](https://github.com/masumi-network/x402-cardano-examples) - USDM payment example

### Tertiary (LOW confidence)
- Token decimal values (6 for all three) -- from community sources, not critical since decimals are not used in the API per locked decision

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all verified in existing project
- Architecture (token registry): HIGH -- simple Map lookup, hardcoded data verified from blockchain
- Architecture (check pipeline): HIGH -- straightforward extension of existing pattern
- Min UTXO calculation: HIGH -- CML.min_ada_required() verified working at runtime
- Token policy IDs: HIGH -- cross-referenced with Cardanoscan URLs and hex encoding
- x402 asset format: MEDIUM -- follows CONTEXT.md decision, slight divergence from masumi format

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (token policy IDs are permanent; protocol params change slowly)
