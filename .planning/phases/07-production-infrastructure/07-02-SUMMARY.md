---
phase: 07-production-infrastructure
plan: 07-02
subsystem: docker
tags: [docker, containerization, production, infrastructure]
dependency-graph:
  requires: []
  provides: [Dockerfile, .dockerignore, docker-compose-production-profile]
  affects: [deployment, ci-cd]
tech-stack:
  added: [docker-multi-stage, alpine-node]
  patterns: [non-root-container, runtime-config-mount, compose-profiles]
key-files:
  created:
    - Dockerfile
    - .dockerignore
  modified:
    - docker-compose.yml
decisions:
  - "--ignore-scripts for prod pnpm install (husky prepare script not available without devDeps)"
  - "Alpine base for minimal image size (~180MB vs ~1GB)"
  - "Non-root user appuser:1001 for container security"
  - "Config mounted read-only at runtime, never baked into image"
  - "Production Redis on port 6380 to avoid conflict with dev Redis"
  - "Compose profiles separate dev (default) from production"
metrics:
  duration: 3 min
  completed: 2026-02-12
  tasks: 3
  files: 3
---

# Phase 7 Plan 02: Production Docker Configuration Summary

Multi-stage Dockerfile with Alpine Node 20 base, non-root runtime user, and Docker Compose production profile with Redis authentication.

## What Was Built

### .dockerignore
Excludes secrets (`config/config.json`, `.env`), dev artifacts (`tests`, `coverage`, `.planning`, `.auditing`), and build context noise (`node_modules`, `.git`, `*.md`). Prevents sensitive data from being baked into images.

### Dockerfile (multi-stage)
- **Build stage**: Installs all deps (including dev), runs `pnpm build` via tsup, produces `dist/index.js` bundle
- **Production stage**: Installs prod deps only (`--prod --ignore-scripts`), copies built output, runs as `appuser:1001`
- HEALTHCHECK probes `/health` endpoint via wget every 30s
- Entry point: `node dist/index.js` (no pnpm overhead in production)

### docker-compose.yml (updated)
- Existing dev services (`ipfs`, `redis`) unchanged -- `docker compose up` works exactly as before
- New `production` profile adds:
  - `facilitator` service: builds from Dockerfile, mounts `config/config.json:ro`, depends on healthy Redis
  - `redis-prod` service: Redis 7 Alpine with `--requirepass` from `REDIS_PASSWORD` env var, healthcheck included
- `redis_prod_data` named volume added

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added --ignore-scripts to production pnpm install**
- **Found during:** Task 2 (Docker build)
- **Issue:** `pnpm install --prod` triggers the `prepare` lifecycle script which runs `husky`, but husky is a devDependency and not installed in production stage
- **Fix:** Added `--ignore-scripts` flag to `pnpm install --frozen-lockfile --prod` in the production stage
- **Files modified:** Dockerfile
- **Commit:** 1638ccb

## Verification Results

- `docker build -t x402-fac .` -- succeeded
- `docker run --rm x402-fac whoami` -- returns `appuser` (non-root confirmed)
- `docker compose config` -- validates (dev profile unchanged)
- `docker compose --profile production config` -- validates
- `.dockerignore` excludes `config/config.json`, `node_modules`, `tests`
- Production image has 370 packages (prod deps only, no dev deps)

## Self-Check: PASSED

- [x] `.dockerignore` exists
- [x] `Dockerfile` exists
- [x] `docker-compose.yml` updated
- [x] Commit 1638ccb verified
