# Phase 8 Research: Resource Server SDK + Reference Implementation

**Date:** 2026-02-12
**Depends on:** Phase 7 (Production Infrastructure) -- COMPLETE
**Requirements:** PROT-03, STOR-01, STOR-02, STOR-03

---

## Table of Contents

1. [Research Objective](#1-research-objective)
2. [The x402 Payment Flow (End-to-End)](#2-the-x402-payment-flow-end-to-end)
3. [What Exists vs What We Build](#3-what-exists-vs-what-we-build)
4. [Component 1: Facilitator Client](#4-component-1-facilitator-client)
5. [Component 2: Payment Gate Middleware](#5-component-2-payment-gate-middleware)
6. [Component 3: 402 Response Builder](#6-component-3-402-response-builder)
7. [Component 4: /supported Endpoint (PROT-03)](#7-component-4-supported-endpoint-prot-03)
8. [Component 5: Storage Service (Reference Implementation)](#8-component-5-storage-service-reference-implementation)
9. [Component 6: Example Client](#9-component-6-example-client)
10. [SDK Design Decisions](#10-sdk-design-decisions)
11. [Storage Interface Design](#11-storage-interface-design)
12. [V2 Wire Format: Cardano Specifics](#12-v2-wire-format-cardano-specifics)
13. [Client-Side Transaction Construction](#13-client-side-transaction-construction)
14. [Testing Strategy](#14-testing-strategy)
15. [Risk Register](#15-risk-register)
16. [Plan Decomposition Recommendation](#16-plan-decomposition-recommendation)
17. [Key Decisions to Make During Planning](#17-key-decisions-to-make-during-planning)

---

## 1. Research Objective

Answer: "What do I need to know to PLAN Phase 8 well?"

Phase 8 bridges the facilitator (Phases 1-7) with the rest of the x402 ecosystem. The facilitator handles verify + settle. A resource server is the other actor -- it serves content, returns 402 Payment Required when payment is needed, and calls the facilitator to verify/settle. This phase builds:

1. **SDK components** (reusable by any resource server)
2. **Reference implementation** (file storage: pay-to-upload, free downloads)
3. **Example client** (demonstrates the complete payment cycle)

---

## 2. The x402 Payment Flow (End-to-End)

### V2 Protocol Flow (Cardano Transaction-Based)

```
Client                     Resource Server                  Facilitator              Cardano
  |                              |                              |                      |
  |  GET /upload                 |                              |                      |
  |----------------------------->|                              |                      |
  |                              |                              |                      |
  |  HTTP 402 Payment Required   |                              |                      |
  |  Header: Payment-Required    |                              |                      |
  |  (base64 JSON with accepts)  |                              |                      |
  |<-----------------------------|                              |                      |
  |                              |                              |                      |
  |  [Client builds Cardano tx:  |                              |                      |
  |   - select UTXOs             |                              |                      |
  |   - pay to payTo address     |                              |                      |
  |   - sign with wallet]        |                              |                      |
  |                              |                              |                      |
  |  GET /upload                 |                              |                      |
  |  Header: Payment-Signature   |                              |                      |
  |  (base64 signed tx payload)  |                              |                      |
  |----------------------------->|                              |                      |
  |                              |                              |                      |
  |                              |  POST /verify                |                      |
  |                              |  {paymentPayload,            |                      |
  |                              |   paymentRequirements}       |                      |
  |                              |----------------------------->|                      |
  |                              |                              |                      |
  |                              |  {isValid: true}             |                      |
  |                              |<-----------------------------|                      |
  |                              |                              |                      |
  |                              |  POST /settle                |                      |
  |                              |  {transaction, paymentReqs}  |                      |
  |                              |----------------------------->|                      |
  |                              |                              |  Submit CBOR         |
  |                              |                              |--------------------->|
  |                              |                              |  Confirm             |
  |                              |                              |<---------------------|
  |                              |  {success: true, txHash}     |                      |
  |                              |<-----------------------------|                      |
  |                              |                              |                      |
  |                              |  [Store file to IPFS/FS]     |                      |
  |                              |                              |                      |
  |  HTTP 200 {cid: "Qm..."}    |                              |                      |
  |  Header: X-Payment-Response  |                              |                      |
  |<-----------------------------|                              |                      |
```

### Key Protocol Details (V2)

**Request with payment (client -> resource server):**
- Header: `Payment-Signature: <base64-encoded JSON>`
- JSON structure:
  ```json
  {
    "x402Version": 2,
    "accepted": { /* the PaymentRequirements the client chose */ },
    "payload": {
      "transaction": "<base64 signed CBOR>",
      "payer": "addr1q..."
    },
    "resource": {
      "description": "File upload to x402 storage",
      "mimeType": "application/octet-stream",
      "url": "https://example.com/upload"
    }
  }
  ```

**402 response (resource server -> client):**
- Status: 402
- Header: `Payment-Required: <base64-encoded JSON>`
- JSON structure:
  ```json
  {
    "x402Version": 2,
    "error": null,
    "resource": {
      "description": "File upload to x402 storage",
      "mimeType": "application/octet-stream",
      "url": "https://example.com/upload"
    },
    "accepts": [{
      "scheme": "exact",
      "network": "cardano:preview",
      "amount": "2000000",
      "payTo": "addr_test1qz...",
      "maxTimeoutSeconds": 300,
      "asset": "lovelace",
      "extra": null
    }]
  }
  ```

**Settlement response header (resource server -> client):**
- Header: `X-Payment-Response: <base64-encoded JSON>`
- Contains the settle result (txHash, network, success).

---

## 3. What Exists vs What We Build

### Already Built (Phases 1-7)

| Component | Location | Status |
|-----------|----------|--------|
| POST /verify | `src/routes/verify.ts` | Working |
| POST /settle | `src/routes/settle.ts` | Working |
| POST /status | `src/routes/status.ts` | Working |
| GET /health | `src/routes/health.ts` | Working |
| VerifyRequestSchema | `src/verify/types.ts` | Zod validated |
| SettleRequestSchema | `src/settle/types.ts` | Zod validated |
| PaymentRequirementsSchema | `src/verify/types.ts` | Zod validated |
| Token registry | `src/verify/token-registry.ts` | USDM, DJED, iUSD |
| Docker (Redis, IPFS) | `docker-compose.yml` | Dev + prod profiles |
| Config schema | `src/config/schema.ts` | Zod validated |

### Needs Building (Phase 8)

| Component | Purpose | New Code |
|-----------|---------|----------|
| GET /supported | Return chains/schemes/addresses (PROT-03) | Route + types |
| FacilitatorClient class | HTTP client for /verify, /settle, /status, /supported | New module |
| PaymentGate middleware | Fastify preHandler that enforces x402 payment | New plugin |
| PaymentRequiredBuilder | Build 402 response with Cardano payment requirements | New helper |
| Storage interface | Abstract StorageBackend with put/get | New module |
| IPFS storage backend | Implements StorageBackend using Kubo HTTP API | New module |
| Upload route | POST /upload (payment-gated file storage) | New route |
| Download route | GET /files/:cid (free, no payment) | New route |
| Example client | CLI/script showing full payment cycle | New file |

---

## 4. Component 1: Facilitator Client

### What It Does

The FacilitatorClient is an HTTP client that resource servers use to communicate with the facilitator. It wraps the /verify, /settle, /status, and /supported endpoints.

### Design from x402-rs Reference

The x402-rs `FacilitatorClient` (in `crates/x402-axum/src/facilitator_client.rs`) provides:
- Base URL with derived endpoint URLs (/verify, /settle, /supported)
- Typed request/response with JSON serialization
- Configurable timeout
- Custom headers
- TTL-based caching for /supported response (10 min default)
- TryFrom<&str> constructor

### Our TypeScript Adaptation

```typescript
// src/sdk/facilitator-client.ts

interface FacilitatorClientOptions {
  baseUrl: string;
  timeout?: number;       // ms, default 30000
  headers?: Record<string, string>;
}

class FacilitatorClient {
  constructor(options: FacilitatorClientOptions);

  async verify(request: VerifyRequest): Promise<VerifyResponse>;
  async settle(request: SettleRequest): Promise<SettleResponse>;
  async status(request: StatusRequest): Promise<StatusResponse>;
  async supported(): Promise<SupportedResponse>;
}
```

### Implementation Notes

- Use native `fetch()` (Node 20+ built-in) -- no new dependencies needed
- Zod validate responses before returning (defense against facilitator bugs)
- Cache /supported response with configurable TTL
- Timeout using AbortController
- Retry on 5xx/network errors (2 retries with exponential backoff)

### Dependency Decision

**Option A: Native fetch (recommended)**
- Zero new dependencies
- Node 20+ has built-in fetch with AbortController timeout
- Sufficient for HTTP JSON APIs

**Option B: undici (Node's HTTP/1.1 client)**
- More control over connection pooling
- Already ships with Node, but explicit import adds a dependency

**Recommendation: Option A (native fetch).** Simplest, no new deps, sufficient for this use case.

---

## 5. Component 2: Payment Gate Middleware

### What It Does

A Fastify preHandler hook that intercepts requests to protected routes and enforces x402 payment. If no payment header is present, returns 402. If payment header is present, verifies and settles via the facilitator.

### Design from x402-rs Reference

The x402-rs `Paygate` (in `crates/x402-axum/src/paygate.rs`) handles:
1. Extract `Payment-Signature` header (V2) from request
2. Base64-decode and JSON-parse the payment payload
3. Match the `accepted` requirements against the route's configured price tags
4. Call facilitator.verify() with the matched requirements
5. Call facilitator.settle() (before or after route execution)
6. Set `X-Payment-Response` header on the response

The x402-rs middleware supports:
- Static pricing (same price for every request)
- Dynamic pricing (callback per request)
- Settle-before-execution vs settle-after-execution
- Resource info builder (description, mimeType, URL)

### Our Fastify Adaptation

```typescript
// src/sdk/payment-gate.ts

interface PaymentGateOptions {
  facilitator: FacilitatorClient;
  payTo: string;             // bech32 recipient address
  amount: string;            // lovelace amount (as string for BigInt safety)
  asset?: string;            // default: 'lovelace'
  network: string;           // CAIP-2 chain ID, e.g. 'cardano:preview'
  maxTimeoutSeconds?: number; // default: 300
  description?: string;      // for 402 response
  mimeType?: string;         // for 402 response, default: 'application/json'
  settleBeforeExecution?: boolean; // default: true (settle-then-work for uploads)
}
```

**As a Fastify preHandler:**

```typescript
function createPaymentGate(options: PaymentGateOptions): preHandlerHookHandler {
  return async (request, reply) => {
    // 1. Check for Payment-Signature header
    const paymentHeader = request.headers['payment-signature'];
    if (!paymentHeader) {
      return reply402(reply, options);
    }

    // 2. Decode and parse payment payload
    const payload = decodePaymentPayload(paymentHeader);
    if (!payload) {
      return reply402(reply, options, 'Invalid payment header');
    }

    // 3. Build verify request
    const verifyReq = buildVerifyRequest(payload, options);

    // 4. Verify with facilitator
    const verifyResult = await options.facilitator.verify(verifyReq);
    if (!verifyResult.isValid) {
      return reply402(reply, options, verifyResult.invalidReason);
    }

    // 5. Settle with facilitator
    const settleReq = buildSettleRequest(payload, options);
    const settleResult = await options.facilitator.settle(settleReq);
    if (!settleResult.success) {
      return reply402(reply, options, `Settlement failed: ${settleResult.reason}`);
    }

    // 6. Attach settlement info to request for route handler
    request.x402Settlement = settleResult;
  };
}
```

### Settle-Before vs Settle-After

For file uploads (our reference implementation): **settle-before-execution** is mandatory. This implements the SECU-04 requirement (settle-then-work pattern). The file is only stored AFTER payment is confirmed on-chain.

For read-only content: settle-after is acceptable (verify first, serve content, settle in background). But for our reference implementation, settle-before is correct.

### Fastify Plugin vs preHandler

**Option A: Fastify plugin (recommended)**
- Register once, decorate routes with payment options
- Clean separation: `server.register(paymentGatePlugin, options)`
- Can access server config for defaults

**Option B: Standalone preHandler function**
- More portable (works outside Fastify)
- But requires manual wiring

**Recommendation: Fastify plugin** wrapping a preHandler. The plugin registers decorations and the preHandler is applied per-route. This is consistent with the existing codebase pattern (all routes are plugins).

---

## 6. Component 3: 402 Response Builder

### What It Does

Builds the HTTP 402 Payment Required response with proper headers per the x402 V2 spec.

### V2 Format (from x402-rs)

In V2, the payment requirements are sent in the `Payment-Required` **header** (not the body), base64-encoded. The body is empty.

```
HTTP/1.1 402 Payment Required
Payment-Required: eyJ4NDAyVmVyc2lvbiI6MiwicmVzb3VyY2UiOnsiZGVzY3JpcH...
Content-Length: 0
```

The base64-decoded header value:
```json
{
  "x402Version": 2,
  "error": null,
  "resource": {
    "description": "File upload",
    "mimeType": "application/octet-stream",
    "url": "https://example.com/upload"
  },
  "accepts": [{
    "scheme": "exact",
    "network": "cardano:preview",
    "amount": "2000000",
    "payTo": "addr_test1qz...",
    "maxTimeoutSeconds": 300,
    "asset": "lovelace",
    "extra": null
  }]
}
```

### Implementation

```typescript
// src/sdk/payment-required.ts

interface PaymentRequiredOptions {
  scheme?: string;           // default: 'exact'
  network: string;           // CAIP-2 chain ID
  amount: string;            // in smallest unit (lovelace)
  payTo: string;             // bech32 address
  asset?: string;            // default: 'lovelace'
  maxTimeoutSeconds?: number; // default: 300
  description?: string;
  mimeType?: string;
  url?: string;
  error?: string;
}

function buildPaymentRequired(options: PaymentRequiredOptions): string {
  // Returns base64-encoded JSON for Payment-Required header
}

function reply402(reply: FastifyReply, options: PaymentRequiredOptions): void {
  const headerValue = buildPaymentRequired(options);
  reply.status(402).header('Payment-Required', headerValue).send();
}
```

### Key Detail: `maxAmountRequired` vs `amount`

Our existing `PaymentRequirementsSchema` uses `maxAmountRequired` (matching V2 spec field name from x402-rs). The x402-rs V2 `PaymentRequirements` struct uses `amount`. Our existing facilitator already accepts `maxAmountRequired`.

**Decision needed:** Keep `maxAmountRequired` in the schema for backward compatibility, or rename. The x402-rs V2 spec uses `amount`, but our verify/settle already expect `maxAmountRequired`. **Recommend keeping as-is** -- the SDK builder can map `amount` to `maxAmountRequired` internally.

---

## 7. Component 4: /supported Endpoint (PROT-03)

### What It Does

Returns the facilitator's capabilities: supported chains, schemes, and signer addresses. This endpoint is required by the x402 protocol for client/server discovery.

### x402-rs SupportedResponse Format

```json
{
  "kinds": [
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "cardano:preview"
    }
  ],
  "extensions": [],
  "signers": {
    "cardano:preview": ["addr_test1qz..."]
  }
}
```

### Our Implementation

```typescript
// src/routes/supported.ts

interface SupportedPaymentKind {
  x402Version: number;
  scheme: string;
  network: string;
  extra?: Record<string, unknown>;
}

interface SupportedResponse {
  kinds: SupportedPaymentKind[];
  extensions: unknown[];
  signers: Record<string, string[]>;
}
```

**What goes in it:**
- `kinds`: One entry per supported chain+scheme. We support `cardano:preview` (and optionally `cardano:preprod`, `cardano:mainnet`) with scheme `exact`.
- `signers`: The facilitator's payment address(es) per network. Derived from the configured facilitator wallet.
- `extensions`: Empty for now.

**Key consideration:** The facilitator address must be derived from the config's seed phrase/private key. The ChainProvider already has a Lucid instance that was initialized with the facilitator wallet. We need to expose `getLucid().wallet().address()` or derive it during server startup.

### Where to Put It

Add as a new route plugin alongside health.ts: `src/routes/supported.ts`. Register in `server.ts`.

---

## 8. Component 5: Storage Service (Reference Implementation)

### Use Case: Pay-to-Upload File Storage

This is the reference implementation demonstrating the complete x402 flow. The decision was already made (from PROJECT.md): **pay-to-upload, free downloads**.

- `POST /upload` -- protected by x402 payment gate. Client pays, file is stored, CID returned.
- `GET /files/:cid` -- free, no payment required. Serves file by content identifier.

### Requirements Mapping

| Requirement | Implementation |
|-------------|---------------|
| STOR-01 | POST /upload gated by PaymentGate middleware |
| STOR-02 | Returns CID/hash after upload |
| STOR-03 | GET /files/:cid serves without payment |
| SECU-04 | Settle-then-work: settle on-chain BEFORE storing file |

### Storage Interface Design

```typescript
// src/storage/types.ts

interface StorageBackend {
  /** Store data, return content identifier */
  put(data: Buffer, metadata?: Record<string, string>): Promise<string>;
  /** Retrieve data by content identifier */
  get(cid: string): Promise<Buffer | null>;
  /** Check if content exists */
  has(cid: string): Promise<boolean>;
  /** Health check */
  healthy(): Promise<boolean>;
}
```

### IPFS Backend (First Implementation)

Using the existing IPFS Kubo container from docker-compose.yml (port 5001 HTTP API):

```typescript
// src/storage/ipfs-backend.ts

class IpfsBackend implements StorageBackend {
  constructor(private apiUrl: string); // default: http://localhost:5001

  async put(data: Buffer): Promise<string> {
    // POST /api/v0/add with multipart form data
    // Returns: { Hash: "Qm...", Size: "..." }
    // Return the Hash as CID
  }

  async get(cid: string): Promise<Buffer | null> {
    // POST /api/v0/cat?arg={cid}
    // Returns raw file bytes
  }

  async has(cid: string): Promise<boolean> {
    // POST /api/v0/object/stat?arg={cid}
    // 200 = exists, error = not found
  }

  async healthy(): Promise<boolean> {
    // POST /api/v0/id
    // Returns peer info if healthy
  }
}
```

### Local Filesystem Backend (Simpler Alternative)

For development/testing without Docker IPFS:

```typescript
// src/storage/fs-backend.ts

class FsBackend implements StorageBackend {
  constructor(private dataDir: string); // default: ./data/files

  async put(data: Buffer): Promise<string> {
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    await fs.writeFile(path.join(this.dataDir, hash), data);
    return hash;
  }

  async get(cid: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(path.join(this.dataDir, cid));
    } catch { return null; }
  }
}
```

### Recommendation

**Start with FsBackend for simplicity**, add IpfsBackend as a second implementation. The abstract interface makes this easy. FsBackend needs zero dependencies and zero Docker. IpfsBackend can be added in a later plan or as a stretch goal.

**Why:** The goal is to demonstrate the x402 flow, not to build a production IPFS gateway. FsBackend eliminates IPFS complexity and lets us focus on the payment integration.

---

## 9. Component 6: Example Client

### What It Does

A standalone script/CLI that demonstrates the full client flow:
1. Request a protected resource -> get 402
2. Parse payment requirements
3. Build and sign a Cardano transaction (Lucid Evolution)
4. Retry with Payment-Signature header
5. Receive the resource (upload confirmation with CID)

### Client-Side Transaction Construction (Cardano)

From the Masumi reference (`resource_server/static/app.js`), the client builds a real Cardano transaction using Lucid:

```typescript
// Example client flow (simplified)
import { Lucid, Blockfrost } from '@lucid-evolution/lucid';

// 1. Initialize Lucid with client's Blockfrost key
const lucid = await Lucid(
  new Blockfrost('https://cardano-preview.blockfrost.io/api/v0', clientBfKey),
  'Preview'
);

// 2. Select wallet (from seed phrase for CLI, from CIP-30 for browser)
lucid.selectWallet.fromSeed(clientSeedPhrase);

// 3. Build transaction paying the required amount to the required address
const tx = await lucid
  .newTx()
  .pay.ToAddress(payTo, { lovelace: BigInt(amount) })
  .complete();

// 4. Sign
const signed = await tx.sign.withWallet().complete();

// 5. Encode as base64
const cborHex = signed.toCBOR();
const txBase64 = Buffer.from(cborHex, 'hex').toString('base64');

// 6. Build V2 payment payload
const paymentPayload = {
  x402Version: 2,
  accepted: paymentRequirements,  // from the 402 response
  payload: {
    transaction: txBase64,
    payer: await lucid.wallet().address()
  },
  resource: { description, mimeType, url }
};

// 7. Encode as base64 header value
const headerValue = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

// 8. Retry request with payment
const response = await fetch(resourceUrl, {
  headers: { 'Payment-Signature': headerValue }
});
```

### Client Dependencies

The example client needs:
- `@lucid-evolution/lucid` (already a project dependency)
- A Blockfrost API key (client's own, NOT the facilitator's)
- A funded wallet (seed phrase or private key)
- Native fetch (Node 20+)

### Client Location

**Option A: Separate file in project root** (e.g., `examples/client.ts`)
- Clean separation from facilitator code
- Easy to run: `tsx examples/client.ts`

**Option B: Separate npm package**
- Overkill for a learning project

**Recommendation: Option A.** A single `examples/client.ts` file with a companion `examples/README.md` explaining how to run it.

---

## 10. SDK Design Decisions

### Monorepo vs Same Package

**Decision: Same package.** The SDK code lives in `src/sdk/` within the existing project. Rationale:
- Learning project, not a library to publish
- Shares types with the facilitator (PaymentRequirements, VerifyRequest, etc.)
- No package boundary overhead
- The reference implementation (upload/download routes) is part of the same server

### Fastify-Specific vs Framework-Agnostic

**Decision: Fastify-specific with extractable core.**

The middleware is a Fastify preHandler plugin. The core logic (parse payment header, build verify/settle requests, build 402 response) is in pure functions that could be adapted to Express/Hono/etc. But we don't build framework adapters -- that's Phase 9+ if needed.

Rationale:
- Project uses Fastify exclusively
- The x402-rs approach is also framework-specific (Axum) with extractable core
- Framework-agnostic adds abstraction cost with no current consumer

### What Gets Exported

```
src/sdk/
  facilitator-client.ts     -- FacilitatorClient class
  payment-gate.ts           -- createPaymentGate() Fastify plugin
  payment-required.ts       -- buildPaymentRequired(), reply402()
  types.ts                  -- SDK-specific Zod schemas and types
  index.ts                  -- barrel export
```

The storage layer is separate from the SDK (it's application code, not reusable SDK):

```
src/storage/
  types.ts                  -- StorageBackend interface
  fs-backend.ts             -- Filesystem implementation
  ipfs-backend.ts           -- IPFS implementation (optional)
  index.ts                  -- barrel export
```

---

## 11. Storage Interface Design

### Abstract Interface Pattern

The storage interface follows the Strategy pattern. The server creates a backend at startup based on config. Routes receive the backend via Fastify decoration.

```typescript
// Config extension
storage: {
  backend: 'fs' | 'ipfs',
  fs?: { dataDir: string },
  ipfs?: { apiUrl: string }
}
```

### Fastify Integration

```typescript
// In server.ts
const storage = createStorageBackend(config.storage);
server.decorate('storage', storage);

// In upload route
const cid = await fastify.storage.put(fileBuffer);
```

### File Upload Handling

Fastify needs `@fastify/multipart` for file uploads (multipart/form-data). This is a new dependency.

**Alternative: Raw body upload** with `Content-Type: application/octet-stream`. Simpler, but less standard for file uploads.

**Recommendation: @fastify/multipart.** It's the standard Fastify approach for file uploads, well-maintained, and provides streaming support.

### Size Limits

The existing server has a 50KB body limit (for JSON). File uploads need a higher limit. Configure per-route:

```typescript
fastify.post('/upload', {
  config: { bodyLimit: 10 * 1024 * 1024 }  // 10MB per upload
}, handler);
```

---

## 12. V2 Wire Format: Cardano Specifics

### Our Existing Schema vs x402-rs V2

| Field | Our Schema (verify/types.ts) | x402-rs V2 | Match? |
|-------|------------------------------|------------|--------|
| scheme | `z.literal('exact')` | `String` | Yes |
| network | `z.string().regex(/^[a-z0-9]+:[a-z0-9]+$/)` | `ChainId` | Yes |
| maxAmountRequired | `z.string().min(1)` | `amount: String` | Name differs |
| payTo | `z.string().min(1)` | `pay_to: String` | Casing differs |
| maxTimeoutSeconds | `z.number().int().positive()` | `max_timeout_seconds: u64` | Match |
| asset | `z.string().default('lovelace')` | `asset: String` | Yes |
| extra | `z.record().optional()` | `extra: Option<Value>` | Yes |

**Key discrepancy:** Our schema uses `maxAmountRequired` and `payTo` (camelCase). The x402-rs V2 uses `amount` and `pay_to` (snake_case). Since our facilitator already expects `maxAmountRequired` and `payTo`, the SDK builder should use these field names. The client must match.

### Payment-Signature Header Format

The V2 client sends payment in the `Payment-Signature` header (not `X-PAYMENT` which was V1). Our resource server middleware must extract from this header.

### X-Payment-Response Header

After successful settlement, the resource server adds `X-Payment-Response` header with base64-encoded settle result. This is standard x402 V2 behavior per the x402-rs reference.

---

## 13. Client-Side Transaction Construction

### How the Client Builds a Cardano Payment

This is critical knowledge for the example client AND for understanding what the facilitator verifies.

**Step 1: Parse 402 response**
- Decode `Payment-Required` header (base64 -> JSON)
- Extract `accepts` array with payment options

**Step 2: Select payment option**
- Match by `network` (must support the chain) and `scheme` (must be "exact")
- Get `payTo` (recipient address), `amount` (lovelace/token amount), `asset` (lovelace or policyId.assetNameHex)

**Step 3: Build Cardano transaction**
- Initialize Lucid with the client's Blockfrost key and network
- Select wallet (seed phrase for CLI, CIP-30 `signTx()` for browser)
- Use `lucid.newTx().pay.ToAddress(payTo, value).complete()` which handles:
  - UTXO selection (coin selection algorithm)
  - Change address calculation
  - Fee estimation
  - Min UTXO for outputs
  - TTL setting

**Step 4: Sign and encode**
- `tx.sign.withWallet().complete()` signs with the wallet's key
- `.toCBOR()` returns hex-encoded signed CBOR
- Convert to base64 for the payment header

**Step 5: Build V2 payload**
- Wrap in `PaymentPayload` with `accepted` requirements
- Base64-encode the full JSON
- Set as `Payment-Signature` header

### Token Payment Differences

For token payments (USDM, DJED, iUSD):
```typescript
const value = {
  [assetUnit]: BigInt(amount),   // e.g. USDM token amount
  lovelace: 2_000_000n           // min UTXO ADA (always required with tokens)
};
lucid.newTx().pay.ToAddress(payTo, value).complete();
```

The client must include min UTXO ADA alongside the token. Our facilitator's `checkMinUtxo` verifies this.

---

## 14. Testing Strategy

### Unit Tests

| Component | What to Test | Mock Strategy |
|-----------|-------------|---------------|
| FacilitatorClient | HTTP calls, response parsing, error handling | Mock fetch responses |
| PaymentGate middleware | Header extraction, 402 flow, settlement flow | Mock FacilitatorClient |
| PaymentRequired builder | Correct header format, base64 encoding | Pure function tests |
| StorageBackend (FS) | put/get/has, error handling | Temp directories |
| StorageBackend (IPFS) | API calls, error handling | Mock IPFS HTTP API |

### Integration Tests

| Test | What It Covers |
|------|---------------|
| No payment -> 402 | Upload route returns 402 with Payment-Required header |
| Invalid payment -> 402 | Bad header format, invalid base64, wrong scheme |
| Valid payment -> 200 | Full mock flow: verify pass, settle pass, file stored |
| Settlement failure -> 402 | Verify passes but settle fails |
| Download without payment | GET /files/:cid returns file, no 402 |
| Download nonexistent | GET /files/:cid returns 404 |
| /supported endpoint | Returns correct chains, schemes, signer addresses |

### End-to-End Tests (Testnet)

This is aspirational for Phase 8 -- an actual testnet test would require:
- Funded preview testnet wallet
- Running facilitator with Blockfrost
- Running resource server
- Client script that builds + signs real transaction
- Real on-chain settlement

**Recommendation:** Document the testnet test procedure in a guide, but don't require it to pass in CI. The integration tests with mocked facilitator cover the logic.

### Estimated Test Count

Based on patterns from previous phases:
- ~15 FacilitatorClient unit tests
- ~15 PaymentGate middleware tests
- ~8 PaymentRequired builder tests
- ~8 Storage backend tests
- ~15 Route integration tests (upload, download, supported)
- **~61 tests total** (estimate)

---

## 15. Risk Register

### Risks We Must Address

| Risk | Severity | Mitigation |
|------|----------|------------|
| Race condition: file stored before payment confirmed | High | Settle-before-execution pattern (SECU-04) |
| Resource server trusts facilitator response blindly | Medium | Validate facilitator response with Zod before acting |
| Example client includes real credentials | Medium | Use placeholder values, .env file pattern, clear warnings |
| IPFS data persistence across Docker restarts | Low | Volume mount already configured in docker-compose.yml |
| Body size limit blocks file uploads | Low | Per-route bodyLimit override on upload route |
| @fastify/multipart dependency risk | Low | Well-maintained official Fastify plugin |

### Risks We Accept

| Risk | Severity | Notes |
|------|----------|-------|
| No encryption at rest | Low | Learning project, not production storage |
| Single storage backend at a time | Low | Abstract interface supports future backends |
| No file size pricing | Low | Fixed price per upload, size-based pricing deferred |
| Client needs own Blockfrost key | Inherent | Cardano UTXO model requires this for tx building |

---

## 16. Plan Decomposition Recommendation

### Recommended Plan Structure: 4 Plans in 3 Waves

**Wave 1 (Foundation):**

**08-01-PLAN: SDK Core + /supported endpoint**
- `src/sdk/types.ts` -- SDK-specific Zod schemas (SupportedResponse, PaymentRequiredResponse)
- `src/sdk/facilitator-client.ts` -- FacilitatorClient class (fetch-based)
- `src/sdk/payment-required.ts` -- buildPaymentRequired(), reply402()
- `src/routes/supported.ts` -- GET /supported route (PROT-03)
- Fastify type augmentation for storage decoration
- Tests: ~25 (client unit + builder unit + supported route integration)

**08-02-PLAN: Payment gate middleware + storage interface**
- `src/sdk/payment-gate.ts` -- createPaymentGate() Fastify preHandler plugin
- `src/storage/types.ts` -- StorageBackend interface
- `src/storage/fs-backend.ts` -- Filesystem implementation
- Config schema extension for storage section
- Tests: ~20 (middleware unit + storage unit)

**Wave 2 (Reference Implementation):**

**08-03-PLAN: Upload/download routes + server integration**
- `src/routes/upload.ts` -- POST /upload (payment-gated, multipart)
- `src/routes/download.ts` -- GET /files/:cid (free download)
- Server integration (register new routes + storage backend)
- @fastify/multipart dependency
- Health check: add storage backend to dependency checks
- Tests: ~20 (upload integration + download integration)

**Wave 3 (Example Client):**

**08-04-PLAN: Example client + end-to-end guide**
- `examples/client.ts` -- CLI demonstrating full payment cycle
- `examples/README.md` -- How to run the example (config, funded wallet, etc.)
- Config example updates
- Final integration testing

### Plan Dependencies

```
08-01 (SDK core + /supported)
  |
  +--enables--> 08-02 (payment gate + storage)
                  |
                  +--enables--> 08-03 (upload/download routes)
                                  |
                                  +--enables--> 08-04 (example client)
```

### Build Order Rationale

1. **SDK types and client first** (08-01) -- everything else depends on FacilitatorClient and the 402 response format
2. **Middleware + storage second** (08-02) -- the payment gate needs the client; routes need the gate + storage
3. **Routes third** (08-03) -- brings everything together in working endpoints
4. **Client last** (08-04) -- needs everything running to demonstrate the flow

---

## 17. Key Decisions to Make During Planning

### Decision 1: File Upload Mechanism

**Options:**
- A) `@fastify/multipart` (multipart/form-data) -- standard for file uploads
- B) Raw body (application/octet-stream) -- simpler, but filename/metadata lost
- C) Base64-encoded in JSON body -- wastes bandwidth, but fits existing JSON patterns

**Recommendation:** Option A. Standard approach, most compatible with clients.

### Decision 2: Storage Backend for v1

**Options:**
- A) Filesystem only (simplest, no Docker needed for storage)
- B) IPFS only (matches docker-compose, real CIDs)
- C) Both with config switch (most flexible)

**Recommendation:** Option C. Build both, default to filesystem. The abstract interface makes this cheap.

### Decision 3: Upload Pricing Model

**Options:**
- A) Fixed price per upload (e.g., 2 ADA) regardless of file size
- B) Size-based pricing (calculated per MB)
- C) Configurable in config.json

**Recommendation:** Option A for v1 (simplest). The PaymentRequirements amount is static, configured in config.json. Size-based pricing is deferred.

### Decision 4: Where to Store SDK Code

**Options:**
- A) `src/sdk/` directory within existing project
- B) `packages/sdk/` as workspace package
- C) Inline in routes (no separate SDK layer)

**Recommendation:** Option A. Separate directory, clear boundary, but same package. Shared types with existing code.

### Decision 5: Facilitator Address Derivation

The /supported endpoint needs the facilitator's address. Currently, the Lucid instance is inside ChainProvider but the wallet address isn't easily accessible.

**Options:**
- A) Derive address during server startup, store in config/decoration
- B) Add `getAddress()` method to ChainProvider
- C) Hardcode in config.json

**Recommendation:** Option B. Add a `getAddress()` method to ChainProvider that returns the Lucid wallet's address. Clean, testable.

### Decision 6: Resource Server as Same Process or Separate

**Options:**
- A) Same server process (facilitator + resource server + storage in one)
- B) Separate process (resource server calls facilitator over HTTP)

**Recommendation:** Option A for v1. Simplest deployment. The facilitator and resource server share the same Fastify instance. The FacilitatorClient calls localhost. This is actually the most realistic learning setup -- you can split later when scaling.

BUT: The FacilitatorClient should still make HTTP calls (even to localhost). This ensures the SDK works correctly when the facilitator is remote. It validates the full network path.

**Alternative consideration:** The resource server routes could call the verify/settle functions directly (bypassing HTTP). This is simpler but doesn't test the real integration. **Recommend HTTP calls via FacilitatorClient** to validate the full x402 flow as it would work in production.

---

## Sources

### Primary (HIGH confidence -- existing codebase)

- `src/verify/types.ts` -- PaymentRequirementsSchema, VerifyRequestSchema, VerifyContext
- `src/settle/types.ts` -- SettleRequestSchema, SettleResponseSchema, StatusRequestSchema
- `src/routes/verify.ts` -- POST /verify route implementation
- `src/routes/settle.ts` -- POST /settle route implementation
- `src/routes/status.ts` -- POST /status route implementation
- `src/server.ts` -- Server factory, plugin registration pattern
- `src/chain/provider.ts` -- ChainProvider orchestrator (public API surface)
- `src/config/schema.ts` -- Config schema with Zod validation
- `docker-compose.yml` -- IPFS (Kubo) and Redis containers

### Primary (HIGH confidence -- x402-rs reference)

- `x402-rs-main/crates/x402-axum/src/paygate.rs` -- Paygate, PaygateProtocol, PriceTagSource
- `x402-rs-main/crates/x402-axum/src/facilitator_client.rs` -- FacilitatorClient, SupportedCache
- `x402-rs-main/crates/x402-axum/src/layer.rs` -- X402Middleware, X402LayerBuilder
- `x402-rs-main/crates/x402-types/src/proto/v2.rs` -- V2 PaymentPayload, PaymentRequirements, PaymentRequired
- `x402-rs-main/crates/x402-types/src/facilitator.rs` -- Facilitator trait (verify, settle, supported)
- `x402-rs-main/examples/x402-axum-example/src/main.rs` -- Resource server example
- `x402-rs-main/examples/x402-reqwest-example/src/main.rs` -- Client example

### Secondary (MEDIUM confidence -- Masumi reference)

- `.planning/research/masumi/claude-masumi-plan.md` -- Transaction-based model analysis, wire format, client-side Lucid usage
- Masumi `resource_server/static/app.js` -- Client-side Cardano tx construction with Lucid

### Project Context

- `.planning/PROJECT.md` -- Market positioning, pay-to-upload model, abstract storage
- `.planning/ROADMAP.md` -- Phase 8 deliverables and success criteria
- `.planning/REQUIREMENTS.md` -- PROT-03, STOR-01-03, SECU-04 definitions
- `.planning/research/ARCHITECTURE.md` -- x402 system architecture patterns

---

*Research completed: 2026-02-12*
*Ready for planning: yes*
*Estimated plans: 4 (in 3 waves)*
*Estimated new tests: ~61*
*New dependencies: @fastify/multipart*
