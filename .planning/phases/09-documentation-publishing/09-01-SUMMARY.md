---
phase: 09-documentation-publishing
plan: 01
subsystem: api-documentation
tags: [openapi, swagger, documentation, fastify]
dependency-graph:
  requires: []
  provides: [openapi-spec, swagger-ui]
  affects: [src/server.ts, src/routes/*, tests/unit/routes/health.test.ts]
tech-stack:
  added: ["@fastify/swagger@9.7.0", "@fastify/swagger-ui@5.2.5", "fastify-type-provider-zod@6.1.0"]
  patterns: [zod-to-openapi-transform, attachValidation-hybrid-validation, explicit-error-response-schemas]
key-files:
  created: []
  modified:
    - package.json
    - pnpm-lock.yaml
    - src/server.ts
    - src/routes/health.ts
    - src/routes/verify.ts
    - src/routes/settle.ts
    - src/routes/status.ts
    - src/routes/supported.ts
    - src/routes/upload.ts
    - src/routes/download.ts
    - tests/unit/routes/health.test.ts
decisions:
  - "attachValidation: true for routes with handler-level safeParse (preserves HTTP 200 error contract)"
  - "Both validatorCompiler and serializerCompiler set (Zod schemas require Zod-aware compilers)"
  - "z.object with explicit keys for health dependencies instead of z.record (Zod v4 record compat issue)"
  - "Error response schemas (400/402/500) explicitly declared per route for type safety and OpenAPI docs"
  - "jsonSchemaTransform for Swagger plugin converts Zod schemas to JSON Schema for OpenAPI spec"
metrics:
  duration: "10 min"
  completed: "2026-02-12"
  tasks: 2
  files-modified: 11
---

# Phase 9 Plan 1: OpenAPI/Swagger Integration Summary

Runtime OpenAPI 3.0.3 spec generation from existing Zod schemas via fastify-type-provider-zod, with interactive Swagger UI at /docs.

## What Was Built

### Task 1: Install Swagger deps and register plugins in server.ts
- Added `@fastify/swagger`, `@fastify/swagger-ui`, `fastify-type-provider-zod` dependencies
- Set `validatorCompiler` and `serializerCompiler` from fastify-type-provider-zod on Fastify instance
- Registered `@fastify/swagger` with OpenAPI 3.0.3 metadata (title, description, version, license, tags)
- Registered `@fastify/swagger-ui` at `/docs` route prefix
- Used `jsonSchemaTransform` to convert Zod schemas to JSON Schema for the OpenAPI spec

### Task 2: Add schema declarations to all 7 route handlers
- **GET /health** -- description, tags (Health), response schemas (200/503) with explicit dependency keys
- **POST /verify** -- description, tags (Facilitator), body (VerifyRequestSchema), response (200/500), attachValidation: true
- **POST /settle** -- description, tags (Facilitator), body (SettleRequestSchema), response (200/500), attachValidation: true
- **POST /status** -- description, tags (Facilitator), body (StatusRequestSchema), response (200/500), attachValidation: true
- **GET /supported** -- description, tags (Health), response (200/500) with SupportedResponseSchema
- **POST /upload** -- description, tags (Storage), response (200/400/402/500) with upload and payment-required schemas
- **GET /files/:cid** -- description, tags (Storage), params, response (200/400/404/500)
- Updated health unit test to set Zod compilers (standalone Fastify instance needs them for route schemas)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Zod validatorCompiler intercepted request bodies before handler safeParse**
- **Found during:** Task 2
- **Issue:** Setting validatorCompiler caused Fastify to reject invalid bodies with HTTP 400 before the handler could run its own safeParse and return HTTP 200 (x402 protocol contract). Tests expected HTTP 200 with failure payloads, not 400.
- **Fix:** Added `attachValidation: true` to POST routes (/verify, /settle, /status) so Fastify attaches validation errors to the request instead of sending 400, preserving handler-level validation behavior.
- **Files modified:** src/routes/verify.ts, src/routes/settle.ts, src/routes/status.ts
- **Commit:** a0eca6e

**2. [Rule 3 - Blocking] Zod v4 z.record() produced invalid JSON Schema for serialization**
- **Found during:** Task 2
- **Issue:** `z.record(z.string(), DependencyStatusSchema)` in health response generated JSON Schema where `required` was not an array, causing `fast-json-stringify` to reject with "schema is invalid: data/required must be array".
- **Fix:** Replaced `z.record()` with `z.object({ redis: ..., storage: ... })` using explicit keys. Health endpoint always returns these two known dependencies, so z.object is more precise.
- **Files modified:** src/routes/health.ts
- **Commit:** a0eca6e

**3. [Rule 1 - Bug] Health unit test missing Zod compilers**
- **Found during:** Task 2
- **Issue:** Health test creates standalone Fastify instance without `createServer()`. After adding Zod response schemas, the route requires Zod-aware serializer compiler. Default Fastify serializer couldn't handle Zod schemas.
- **Fix:** Added `server.setValidatorCompiler(validatorCompiler)` and `server.setSerializerCompiler(serializerCompiler)` to the test's `createHealthServer()` helper.
- **Files modified:** tests/unit/routes/health.test.ts
- **Commit:** a0eca6e

**4. [Rule 2 - Missing critical] Error response schemas needed for TypeScript type safety**
- **Found during:** Task 2
- **Issue:** Declaring `response: { 200: schema }` in route options made TypeScript reject `reply.status(500).send(...)` since 500 was not a documented status code. Routes legitimately send 500/400/402 errors.
- **Fix:** Added explicit error response schemas (z.object({ error, message })) for 500, 400, 402 as appropriate to each route. This also improves OpenAPI documentation by documenting error responses.
- **Files modified:** All 7 route files
- **Commit:** a0eca6e

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| attachValidation: true for safeParse routes | Preserves x402 protocol contract (HTTP 200 for all validation results); handler-level validation gives richer error responses |
| Both Zod compilers set globally | Required for Fastify to handle Zod schemas in route schema declarations; serializerCompiler needed for response, validatorCompiler needed for body |
| Explicit z.object for health dependencies | z.record produces invalid JSON Schema with Zod v4; health always has exactly 2 known dependencies |
| Error response schemas declared explicitly | TypeScript requires all used status codes in response schema; also documents error shapes in OpenAPI spec |

## Verification

- 383 tests passing (0 regressions)
- Build succeeds (tsup)
- TypeScript typecheck passes (tsc --noEmit)
- All 7 endpoints documented with descriptions, tags, and request/response schemas
- Swagger UI accessible at GET /docs
- OpenAPI 3.0.3 spec generated at runtime from existing Zod schemas

## Self-Check: PASSED

- All 9 modified files exist on disk
- Both commits found: c89abb1 (Task 1), a0eca6e (Task 2)
- All 7 route files contain `schema:` declarations
- `@fastify/swagger` present in server.ts
