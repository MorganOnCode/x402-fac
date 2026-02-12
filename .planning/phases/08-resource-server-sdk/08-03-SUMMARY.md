---
phase: 08-resource-server-sdk
plan: 08-03
subsystem: storage
tags: [storage, fs-backend, ipfs-backend, content-addressing, sha256, kubo-api]
dependency_graph:
  requires: [08-01]
  provides: [StorageBackend, FsBackend, IpfsBackend, createStorageBackend, StorageConfig]
  affects: [08-05, 08-06]
tech_stack:
  added: []
  patterns: [content-addressed storage, SHA-256 hashing, Kubo HTTP API, CID sanitization]
key_files:
  created:
    - src/storage/types.ts
    - src/storage/fs-backend.ts
    - src/storage/ipfs-backend.ts
    - src/storage/index.ts
    - tests/unit/storage/fs-backend.test.ts
    - tests/unit/storage/ipfs-backend.test.ts
  modified:
    - src/config/schema.ts
    - config/config.example.json
    - tests/integration/health.test.ts
    - tests/integration/server.test.ts
    - tests/integration/verify-route.test.ts
    - tests/integration/settle-route.test.ts
    - tests/integration/status-route.test.ts
    - tests/security/adversarial.test.ts
decisions:
  - FsBackend CID sanitization via /^[a-f0-9]{64}$/ regex prevents path traversal
  - IpfsBackend uses native fetch to Kubo HTTP API (no IPFS client library)
  - Storage config section fully optional with Zod factory defaults (backward compatible)
  - Buffer to Blob conversion via Uint8Array for TypeScript strict mode compatibility
metrics:
  duration: 5 min
  completed: 2026-02-12
  tests_added: 19
  files_created: 6
  files_modified: 8
---

# Phase 8 Plan 03: Storage Layer Summary

Content-addressed storage layer with FsBackend (SHA-256) and IpfsBackend (Kubo HTTP API), factory function, config extension, and 19 unit tests.

## What Was Built

### src/storage/types.ts
- `StorageBackend` interface: `put(data, metadata?)`, `get(cid)`, `has(cid)`, `healthy()`
- Minimal interface supporting filesystem, IPFS, S3, or any content-addressed backend

### src/storage/fs-backend.ts
- `FsBackend` class implementing StorageBackend
- SHA-256 content addressing: `createHash('sha256').update(data).digest('hex')` returns 64-char hex
- `get()` and `has()` sanitize CID to `/^[a-f0-9]{64}$/` preventing path traversal attacks
- Lazy directory creation via `ensureDir()` with `mkdir({ recursive: true })`
- Zero external dependencies (node:crypto, node:fs/promises, node:path)

### src/storage/ipfs-backend.ts
- `IpfsBackend` class implementing StorageBackend
- Native `fetch` to Kubo HTTP API endpoints:
  - `POST /api/v0/add` (multipart/form-data) for put
  - `POST /api/v0/cat?arg={cid}` for get
  - `POST /api/v0/object/stat?arg={cid}` for has
  - `POST /api/v0/id` for healthy
- `encodeURIComponent()` on CID for query parameter safety
- Trailing slash stripping on API URL constructor

### src/storage/index.ts
- `createStorageBackend(config)` factory: switches on `config.backend` ('fs' | 'ipfs')
- Barrel exports: StorageBackend (type), FsBackend, IpfsBackend, StorageConfig, createStorageBackend

### Config Extension (src/config/schema.ts)
- `storage` section added to ConfigSchema with full Zod defaults:
  - `backend`: 'fs' | 'ipfs' (default: 'fs')
  - `fs.dataDir`: string (default: './data/files')
  - `ipfs.apiUrl`: URL string (default: 'http://localhost:5001')
- Entire section optional via `.default()` factory -- existing configs work unchanged

### Tests (19 total)
- **fs-backend.test.ts** (10 tests): put hash format, content addressing, get/has with valid/invalid CIDs, path traversal protection, healthy
- **ipfs-backend.test.ts** (9 tests): Kubo API mocking via `vi.spyOn(globalThis, 'fetch')`, put/get/has/healthy, error handling, trailing slash stripping

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Buffer to Blob type incompatibility in IpfsBackend**
- **Found during:** Task 1
- **Issue:** `new Blob([data])` failed TypeScript strict mode because Buffer is not directly assignable to BlobPart
- **Fix:** Changed to `new Blob([new Uint8Array(data)])`
- **Files modified:** src/storage/ipfs-backend.ts
- **Commit:** aa039b4

**2. [Rule 3 - Blocking] Test configs missing storage field after schema extension**
- **Found during:** Task 2
- **Issue:** 6 test files construct Config objects directly (not via Zod parsing), missing the new storage field caused TypeScript errors
- **Fix:** Added `storage: { backend: 'fs' as const, fs: { dataDir: './data/files' }, ipfs: { apiUrl: 'http://localhost:5001' } }` to all test config objects
- **Files modified:** 5 integration tests + 1 security test
- **Commit:** 4550d03

## Verification

- `pnpm typecheck` passes (0 errors in storage module)
- `pnpm lint` passes (0 violations)
- `pnpm vitest run` passes (367 tests, 25 suites)
- FsBackend path traversal tests confirm `../../../etc/passwd` returns null
- Existing config tests (10) pass unchanged (backward compatibility confirmed)

## Self-Check: PASSED

All 6 created files verified on disk. All 3 task commits (aa039b4, 4550d03, 18a5822) verified in git log.
