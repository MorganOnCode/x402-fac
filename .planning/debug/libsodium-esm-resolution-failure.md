---
status: diagnosed
trigger: "Investigate the root cause of a libsodium-wrappers-sumo ESM module resolution failure when running `pnpm dev` (tsx watch) in the x402-fac project."
created: 2026-02-05T00:00:00Z
updated: 2026-02-05T00:45:00Z
symptoms_prefilled: true
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED - libsodium-wrappers-sumo package.json "files" array does NOT include libsodium-sumo.mjs
test: Check package.json files field
expecting: Root cause is a packaging bug in libsodium-wrappers-sumo@0.7.16
next_action: Research fix strategies and workarounds

## Symptoms

expected: `pnpm dev` (tsx watch) should start the development server without import errors
actual: Crashes with ERR_MODULE_NOT_FOUND for libsodium-wrappers-sumo ESM module
errors: Cannot find module '/Users/morgan/Documents/CODE/x402-fac/node_modules/.pnpm/libsodium-wrappers-sumo@0.7.16/node_modules/libsodium-wrappers-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs'
reproduction: Run `pnpm dev` command
started: Current issue (pnpm build works, pnpm test works with mocks)

## Eliminated

## Evidence

- timestamp: 2026-02-05T00:10:00Z
  checked: libsodium-wrappers-sumo package structure
  found: |
    - dist/modules-sumo-esm/libsodium-wrappers.mjs exists
    - dist/modules-sumo-esm/libsodium-sumo.mjs does NOT exist (error path is correct - file is missing)
    - libsodium-wrappers.mjs contains: `import e from"./libsodium-sumo.mjs"`
  implication: The wrapper file tries to import from a file that doesn't exist in its own dist

- timestamp: 2026-02-05T00:15:00Z
  checked: libsodium-sumo package structure (the dependency)
  found: |
    - libsodium-sumo.mjs EXISTS at: node_modules/.pnpm/libsodium-sumo@0.7.16/node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs
    - libsodium-wrappers-sumo depends on libsodium-sumo (package.json: "dependencies": { "libsodium-sumo": "^0.7.16" })
    - There IS a symlink: libsodium-wrappers-sumo@0.7.16/node_modules/libsodium-sumo -> ../../libsodium-sumo@0.7.16/node_modules/libsodium-sumo
  implication: The file exists but in a DIFFERENT package. The relative import `./libsodium-sumo.mjs` is wrong - should be `libsodium-sumo` (package import)

- timestamp: 2026-02-05T00:20:00Z
  checked: Dependency chain to libsodium
  found: |
    @lucid-evolution/lucid depends on @cardano-sdk/crypto (via @lucid-evolution/utils)
    @cardano-sdk/crypto/dist/esm/index.js line 2: `import sodium from 'libsodium-wrappers-sumo';`
    This is a top-level import executed when Lucid is imported
  implication: The import happens at module load time, not lazily

- timestamp: 2026-02-05T00:25:00Z
  checked: libsodium-wrappers-sumo package.json "files" field
  found: |
    Only these files are published:
    - dist/modules-sumo/libsodium-wrappers.js
    - dist/modules-sumo/libsodium-wrappers.d.ts
    - dist/modules-sumo-esm/libsodium-wrappers.mjs
    - package.json

    Missing: dist/modules-sumo-esm/libsodium-sumo.mjs (even though it's imported)
  implication: THIS IS THE ROOT CAUSE - the package is missing the file it tries to import

- timestamp: 2026-02-05T00:30:00Z
  checked: Why pnpm build and vitest work but tsx doesn't
  found: |
    - tsup (build): Bundles dependencies, inlines libsodium into the output
    - vitest: Uses mocks for Lucid in tests, never actually imports libsodium
    - tsx: Tries to run the actual code with real imports, hits the missing file
  implication: tsx is the only one that actually exercises the broken import path

- timestamp: 2026-02-05T00:35:00Z
  checked: Compared 0.7.16 vs 0.8.2 published packages
  found: |
    0.7.16 wrapper: `import e from"./libsodium-sumo.mjs"` (relative - BROKEN)
    0.8.2 wrapper: `import e from"libsodium-sumo"` (package import - WORKS)

    Both versions have same "files" array (missing libsodium-sumo.mjs)
    But 0.8.2 imports from the libsodium-sumo PACKAGE instead of relative path

    Verified: https://unpkg.com/libsodium-wrappers-sumo@0.8.2/dist/modules-sumo-esm/libsodium-sumo.mjs returns 404
    Verified: https://unpkg.com/libsodium-sumo@0.8.2/dist/modules-sumo-esm/libsodium-sumo.mjs returns 200

  implication: The bug was fixed upstream in 0.8.0 by changing from relative to package import

## Resolution

root_cause: |
  libsodium-wrappers-sumo@0.7.16 has a packaging bug in its ESM build.

  The file dist/modules-sumo-esm/libsodium-wrappers.mjs contains:
    `import e from"./libsodium-sumo.mjs"`

  But the package.json "files" array does NOT include libsodium-sumo.mjs:
    - dist/modules-sumo/libsodium-wrappers.js ✓
    - dist/modules-sumo/libsodium-wrappers.d.ts ✓
    - dist/modules-sumo-esm/libsodium-wrappers.mjs ✓
    - dist/modules-sumo-esm/libsodium-sumo.mjs ✗ MISSING

  The file exists in the libsodium-sumo dependency package, but the relative import
  `./libsodium-sumo.mjs` doesn't work because:
  1. The file isn't published in libsodium-wrappers-sumo
  2. Cross-package relative imports don't work in ESM

  This was FIXED in version 0.8.0+ which changed to:
    `import e from"libsodium-sumo"` (package import instead of relative)

  Why it only fails in tsx:
  - tsup: Bundles dependencies, doesn't use runtime resolution
  - vitest: Uses mocks, never imports the real libsodium
  - tsx: Actually runs the code with real imports, hits the bug

fix: |
  Upgrade to libsodium-wrappers-sumo@0.8.x (currently 0.8.2)

  However, this is a transitive dependency through:
    @cardano-sdk/crypto@0.2.3 -> libsodium-wrappers-sumo@^0.7.16

  Options:
  1. Wait for @cardano-sdk/crypto to update their dependency
  2. Use pnpm overrides to force 0.8.2
  3. Use pnpm patch to fix the import in 0.7.16
  4. Make Lucid import lazy (dynamic import) so dev server starts without it

verification: Not applicable (diagnosis only)
files_changed: []
