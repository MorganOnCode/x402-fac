# Phase 1: Foundation - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Project scaffolding, tooling, security baseline, and development infrastructure before any business logic. This phase establishes TypeScript configuration, build tools, testing framework, HTTP server foundation, logging, and security scanning. No x402 protocol logic — just the foundation everything else builds on.

</domain>

<decisions>
## Implementation Decisions

### Code Style & Conventions
- ESLint with Airbnb configuration (strict, opinionated)
- Imports organized in groups with gaps: external packages → internal modules → relative imports
- File naming: kebab-case (e.g., `chain-provider.ts`)
- Export naming: camelCase (e.g., `chainProvider`)

### Claude's Discretion: Code Style
- Semicolon usage (pick based on Airbnb defaults)

### Error Handling Patterns
- Error responses: verbose in development (stack traces), minimal in production (sanitized)
- Error categorization: domain-prefixed codes (e.g., `VERIFY_INVALID_SIG`, `SETTLE_INSUFFICIENT_FUNDS`, `CHAIN_UTXO_NOT_FOUND`)
- Logging level: info by default for normal operation
- Body logging: full request/response bodies in development, metadata only in production

### Configuration Structure
- Single `config.json` with defaults, environment variables override specific values
- Secrets stored in config file (gitignored) — no separate .env file
- Fail fast on startup if config is invalid or missing required values

### Claude's Discretion: Configuration
- Config file location (project root vs config/ directory)

### Docker Dev Workflow
- Docker for dependencies only (IPFS, Redis) — app runs locally with hot reload
- Services needed: IPFS (Kubo) + Redis
- App iterates locally with `pnpm dev`, containers provide external services

### Claude's Discretion: Docker
- Whether `pnpm dev` auto-starts containers or requires manual `docker-compose up`
- Production Dockerfile timing (now vs Phase 8)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches that follow the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-04*
