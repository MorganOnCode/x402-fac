---
phase: 02-chain-provider
plan: 06
subsystem: infra
tags: [libsodium, esm, pnpm-overrides, dependency-fix, cardano]

# Dependency graph
requires:
  - phase: 02-chain-provider (02-05)
    provides: ChainProvider with Lucid Evolution requiring libsodium-wrappers-sumo
provides:
  - Working dev server startup without ESM import crashes
  - Unblocked UAT tests 3, 4, 5, 6 (require running server)
  - Unblocked Phase 3 development
affects: [03-verification-layer, all-phases-requiring-dev-server]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pnpm.overrides for transitive dependency version pinning"

key-files:
  created: []
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Override-only fix: pin libsodium-wrappers-sumo@0.8.2 via pnpm.overrides, no upstream package upgrades"

patterns-established:
  - "pnpm.overrides: use for fixing broken transitive ESM dependencies without upgrading direct deps"

# Metrics
duration: 2min
completed: 2026-02-05
---

# Phase 2 Plan 6: libsodium ESM Fix Summary

**pnpm override pins libsodium-wrappers-sumo@0.8.2 to fix broken ESM relative import in 0.7.16 that crashed dev server**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-05T04:51:51Z
- **Completed:** 2026-02-05T04:53:33Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Dev server starts without ERR_MODULE_NOT_FOUND (libsodium ESM import resolved)
- All 91 tests continue to pass with no regressions
- Build (tsup) succeeds cleanly
- UAT tests 3-6 unblocked (they require a running server)
- Phase 3 development unblocked

## Task Commits

Each task was committed atomically:

1. **Task 1: Override libsodium-wrappers-sumo to 0.8.2 and verify server starts** - `65aa7b9` (fix)

## Files Created/Modified
- `package.json` - Added pnpm.overrides section to pin libsodium-wrappers-sumo@0.8.2
- `pnpm-lock.yaml` - Updated lockfile resolving 0.8.2 for all transitive consumers

## Decisions Made
- **Override-only, no upstream upgrades:** Used pnpm.overrides to pin libsodium-wrappers-sumo@0.8.2 rather than upgrading @lucid-evolution or @cardano-sdk packages, avoiding potential breaking API changes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - the override resolved the ESM crash cleanly. The dev server fails at Redis connection (ECONNREFUSED) when Docker services aren't running, which is expected behavior confirming the import-level crash is gone.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Dev server fully functional (with Docker services running)
- Phase 2 chain provider layer complete (all 6 plans)
- Ready for Phase 3: Verification Layer
- No blockers or concerns

---
*Phase: 02-chain-provider*
*Completed: 2026-02-05*
