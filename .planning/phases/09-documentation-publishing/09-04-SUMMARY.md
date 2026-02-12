---
phase: 09-documentation-publishing
plan: 04
subsystem: build-publishing
tags: [npm, tsup, dual-entry, exports-map, publishing]
dependency_graph:
  requires: [09-01, 09-02]
  provides: [npm-publishing-config, sdk-subpath-export]
  affects: [package.json, tsup.config.ts]
tech_stack:
  added: []
  patterns: [dual-entry-tsup, exports-map-subpath, files-whitelist]
key_files:
  created: []
  modified:
    - tsup.config.ts
    - package.json
decisions:
  - Object entry format in tsup for named outputs (index + sdk)
  - Shared chunk auto-created by tsup for common Zod schemas between entry points
  - SDK bundle only imports zod (634 bytes); no Fastify, ioredis, or Sentry
  - files whitelist prevents .planning/, config/, tests/ from npm publish
  - Placeholder repository URLs (YOUR_USERNAME) for user to fill in
metrics:
  duration: 2 min
  completed: 2026-02-12
  tasks: 1/1
  files_modified: 2
---

# Phase 9 Plan 4: NPM Publishing Configuration Summary

Dual tsup entry points (server + SDK) with package.json exports map, files whitelist, and prepublishOnly script for npm-ready publishing.

## What Was Built

### tsup.config.ts

Changed from single array entry `['./src/index.ts']` to named object entry:
- `index: './src/index.ts'` -> `dist/index.js` (72.99 KB) -- server binary
- `sdk: './src/sdk/index.ts'` -> `dist/sdk.js` (634 B) -- SDK for resource servers

tsup automatically creates a shared chunk (`dist/chunk-*.js`, 12.69 KB) for Zod schemas used by both entry points.

### package.json

Six changes:
1. **exports map**: `.` (server) and `./sdk` (SDK) with `import` and `types` conditions
2. **files whitelist**: `["dist/", "LICENSE", "README.md"]` -- security gate preventing secret publication
3. **prepublishOnly**: `pnpm build` ensures fresh build before every publish
4. **description**: Updated to "Cardano x402 payment facilitator with resource server SDK"
5. **repository/bugs/homepage**: Placeholder URLs for GitHub (YOUR_USERNAME)
6. **main/types**: Kept for backward compatibility alongside exports map

### SDK Bundle Analysis

The SDK entry point (`dist/sdk.js`) is 634 bytes and only imports from the shared chunk, which only depends on `zod`. No server dependencies (Fastify, ioredis, @sentry/node, @blockfrost/blockfrost-js, @lucid-evolution/*) are pulled into the SDK bundle. Fastify imports in payment-gate.ts and payment-required.ts are type-only and erased at compile time.

### npm Pack Verification

`npm pack --dry-run` confirms the package contains only:
- `dist/` (all JS, DTS, and sourcemap files)
- `LICENSE`
- `README.md`
- `package.json`

Total package size: 80.9 KB unpacked to 334.6 KB.

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `66b0bd0` | Dual entry points, exports map, files whitelist, npm metadata |

## Verification

- [x] `pnpm build` produces both `dist/index.js` and `dist/sdk.js` with matching `.d.ts` files
- [x] `npm pack --dry-run` shows only dist/, LICENSE, README.md, package.json (11 files total)
- [x] `pnpm test` -- 383 tests pass across 27 suites
- [x] package.json has `exports` map with `.` and `./sdk` subpaths
- [x] SDK bundle does not import Fastify, ioredis, or Sentry (only zod via shared chunk)
- [x] Pre-commit hooks pass (eslint, prettier, typecheck)

## Self-Check: PASSED

- FOUND: tsup.config.ts
- FOUND: package.json
- FOUND: dist/index.js
- FOUND: dist/index.d.ts
- FOUND: dist/sdk.js
- FOUND: dist/sdk.d.ts
- FOUND: commit 66b0bd0
