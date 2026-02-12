# x402 Cardano Payment Client Example

This example demonstrates the complete x402 payment cycle on Cardano: requesting a protected resource, receiving a 402 Payment Required response, building and signing a payment transaction, retrying with the payment, and downloading the stored file.

## Prerequisites

- **Node.js 20+** (for native `fetch` support)
- **pnpm** (package manager)
- **Running x402 facilitator server** (this project)
- **Blockfrost API key** (free tier works)
- **Funded Cardano preview testnet wallet** (24-word seed phrase)

## Setup

### 1. Get a Blockfrost API Key

1. Go to [blockfrost.io](https://blockfrost.io) and create a free account
2. Create a new project for the **Cardano Preview** testnet
3. Copy the project ID (starts with `preview...`)

### 2. Get a Funded Preview Wallet

1. Generate a wallet or use an existing one with a 24-word seed phrase
2. Get the wallet's receive address
3. Fund it using the [Cardano Testnet Faucet](https://docs.cardano.org/cardano-testnets/tools/faucet/)
4. You need at least 5 ADA (5,000,000 lovelace) -- 2 ADA for the upload payment plus fees and min UTXO

### 3. Start the Server

```bash
# Start Redis (required dependency)
pnpm docker:up

# Copy and configure config
cp config/config.example.json config/config.json
# Edit config/config.json with your Blockfrost project ID and seed phrase

# Start the development server
pnpm dev
```

### 4. Run the Example

```bash
BLOCKFROST_KEY=previewXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX \
SEED_PHRASE="word1 word2 word3 ... word24" \
npx tsx examples/client.ts
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BLOCKFROST_KEY` | Yes | -- | Blockfrost project ID for preview testnet |
| `SEED_PHRASE` | Yes | -- | 24-word seed phrase for a funded wallet |
| `SERVER_URL` | No | `http://localhost:3000` | Resource server URL |
| `FILE_PATH` | No | Generated test file | Path to a file to upload |

## Expected Output

```
  x402 Cardano Payment Client -- Example
  =======================================

  Server: http://localhost:3000
  Network: cardano:preview

[============================================================]
[STEP] 1/7
       Checking server health (GET /health)
[============================================================]
  Status: 200
  Server status: ok
  Dependencies: {"redis":"up","chain":"up","storage":"up"}

[============================================================]
[STEP] 2/7
       Querying facilitator capabilities (GET /supported)
[============================================================]
  Status: 200
  Supported kinds: [{"x402Version":2,"scheme":"exact","network":"cardano:preview"}]
  Signers: {"cardano:preview":["addr_test1..."]}

[============================================================]
[STEP] 3/7
       Requesting upload WITHOUT payment (POST /upload)
[============================================================]
  File: Generated test file (52 bytes)
  Status: 402

[============================================================]
[STEP] 4/7
       Parsing Payment-Required header from 402 response
[============================================================]
  Version: 2
  Network: cardano:preview
  Amount: 2000000 lovelace
  Pay to: addr_test1...
  Scheme: exact
  Max timeout: 300s
  Resource: File upload to x402 storage

[============================================================]
[STEP] 5/7
       Building and signing Cardano transaction with Lucid Evolution
[============================================================]
  Wallet address: addr_test1...
  Wallet balance: 10000000 lovelace (10 ADA)
  Building tx: Sending 2000000 lovelace to addr_test1...
  Tx hash: abc123...
  CBOR length: 500 hex chars
  Payment-Signature: eyJ4NDAyVmVyc2lvbiI6Miwi...

[============================================================]
[STEP] 6/7
       Retrying upload WITH payment (POST /upload + Payment-Signature)
[============================================================]
  Status: 200
  Response: {"success":true,"cid":"a1b2c3...","size":52}
  Payment response: {"success":true,"transaction":"abc123...","network":"cardano:preview"}
  File CID: a1b2c3...

[============================================================]
[STEP] 7/7
       Downloading the file for free (GET /files/:cid)
[============================================================]
  Status: 200
  Content-Type: application/octet-stream
  Content-Length: 52
  Downloaded: 52 bytes
  Round-trip match: YES -- file integrity verified


  x402 Payment Flow Complete
  ==========================
  Transaction: abc123...
  File CID:    a1b2c3...
  Cost:        2000000 lovelace
  Network:     cardano:preview

  The full x402 cycle worked:
    402 -> parse requirements -> build tx -> sign -> pay -> upload -> download
```

## What the Example Demonstrates

1. **Health Check** -- Verifies the server and its dependencies (Redis, chain, storage) are running
2. **Capabilities Query** -- Discovers what payment schemes and networks the facilitator supports
3. **402 Response** -- Shows the standard x402 payment-required flow when no payment is provided
4. **Payment Parsing** -- Decodes the base64 Payment-Required header to extract payment requirements
5. **Transaction Building** -- Uses Lucid Evolution to construct a Cardano payment transaction
6. **Payment Submission** -- Sends the signed transaction via the Payment-Signature header
7. **Free Download** -- Retrieves the stored file without payment (downloads are free)

## Security Notes

- **Never commit your seed phrase or API keys** to version control
- **Never share your seed phrase** -- it controls your wallet funds
- Use environment variables or a `.env` file (gitignored) for credentials
- The example uses the **preview testnet** -- test ADA has no real value
- The server's `config/config.json` is gitignored to prevent credential leaks

## Uploading a Custom File

```bash
BLOCKFROST_KEY=preview... \
SEED_PHRASE="word1 word2 ..." \
FILE_PATH=./my-document.pdf \
npx tsx examples/client.ts
```

The file size is limited to 10MB by the server's upload route.
