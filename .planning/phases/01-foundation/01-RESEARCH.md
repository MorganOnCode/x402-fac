# Phase 1: Foundation - Research

**Researched:** 2026-02-04
**Domain:** TypeScript project scaffolding, HTTP server foundation, testing infrastructure, security baseline
**Confidence:** HIGH

## Summary

This research covers the foundational stack for a TypeScript-based HTTP server project with modern tooling. The ecosystem has matured significantly, with clear winners emerging: Fastify v5 for HTTP servers, Vitest v4 for testing, Zod v4 for validation, and pino for logging. A key finding is that tsup (the original bundler recommendation) is no longer maintained and recommends migrating to tsdown, which uses Rolldown (Rust-based) for significantly better performance.

The user decisions in CONTEXT.md lock us to ESLint with Airbnb configuration, which requires using the newer `eslint-config-airbnb-extended` package since the original `eslint-config-airbnb-typescript` was archived in May 2025. Configuration structure is a single `config.json` (not .env), and Docker is for IPFS/Redis dependencies only with local app development.

**Primary recommendation:** Use the modern Fastify + Vitest + Zod + pino stack with tsdown for builds, husky + lint-staged for git hooks, and Dependabot for security scanning.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | 5.7.4 | HTTP server framework | Fastest Node.js framework, native TypeScript support, built-in validation and logging |
| vitest | 4.0.18 | Testing framework | Native TypeScript, compatible with Vite ecosystem, Jest-compatible API, fast |
| tsdown | 0.20.1 | TypeScript bundler | Rolldown-based (Rust), successor to tsup which is no longer maintained |
| zod | 4.3.6 | Schema validation | TypeScript-first, runtime + compile-time validation, 2kb gzipped |
| pino | 10.3.0 | Structured logging | Fastest Node.js logger, JSON output, Fastify default |
| typescript | ^5.5 | Type system | Required by Zod v4, strict mode mandatory |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | 4.21.0 | Development server | Hot reload during development with `tsx watch` |
| @fastify/helmet | 13.0.2 | Security headers | Always - CSP, HSTS, X-Frame-Options, etc. |
| @fastify/cors | 11.2.0 | CORS handling | Cross-origin requests |
| @fastify/error | 4.2.0 | Typed error creation | Custom error classes with codes |
| @vitest/coverage-v8 | 4.0.18 | Code coverage | Test coverage reporting (faster than Istanbul) |
| pino-pretty | 13.1.3 | Log formatting | Development only - human-readable logs |
| husky | 9.1.7 | Git hooks | Pre-commit hook management |
| lint-staged | 16.2.7 | Staged file linting | Run lint/typecheck only on changed files |
| @sentry/node | 10.38.0 | Error tracking | Production error monitoring |
| eslint-config-airbnb-extended | latest | ESLint config | Airbnb style with TypeScript + flat config support |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tsdown | tsup | tsup is abandoned, tsdown is actively maintained with better performance |
| Vitest | Jest | Vitest is faster, native TypeScript, but Jest has larger ecosystem |
| Zod | TypeBox | TypeBox generates JSON Schema (Fastify native), Zod is more ergonomic |
| pino | winston | pino is 5x faster, winston has more transports |
| eslint-config-airbnb-extended | @kesills/eslint-config-airbnb-typescript | Extended supports flat config natively |

**Installation:**

```bash
# Core dependencies
pnpm add fastify zod pino @fastify/helmet @fastify/cors @fastify/error @sentry/node

# Development dependencies
pnpm add -D typescript tsx vitest @vitest/coverage-v8 tsdown pino-pretty husky lint-staged eslint prettier eslint-config-airbnb-extended @types/node
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── index.ts           # Entry point, server startup
├── server.ts          # Fastify instance creation and plugin registration
├── config/
│   └── index.ts       # Config loading with Zod validation
├── routes/
│   └── health.ts      # Health check route
├── plugins/
│   ├── error-handler.ts  # Custom error handling
│   └── request-logger.ts # Request/response logging
├── errors/
│   └── index.ts       # Custom error classes with domain prefixes
├── types/
│   └── index.ts       # Shared TypeScript types
└── utils/
    └── index.ts       # Utility functions
tests/
├── unit/              # Unit tests
├── integration/       # Integration tests
└── setup.ts           # Test setup file
config/
└── config.example.json  # Example configuration (committed)
```

### Pattern 1: Fastify Server with TypeScript

**What:** Type-safe Fastify server setup with proper plugin registration
**When to use:** Always - this is the foundation pattern

```typescript
// Source: https://fastify.dev/docs/latest/Reference/TypeScript/
import fastify, { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

const server: FastifyInstance = fastify({
  logger: {
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  requestIdHeader: 'x-request-id',
  genReqId: () => crypto.randomUUID(),
});

// Register plugins
await server.register(helmet, { global: true });
await server.register(cors, { origin: true });
```

### Pattern 2: Zod Configuration Validation

**What:** Fail-fast configuration loading with runtime validation
**When to use:** Server startup - validate config.json before anything else

```typescript
// Source: https://zod.dev/
import { z } from 'zod';
import { readFileSync } from 'fs';

const ConfigSchema = z.object({
  server: z.object({
    host: z.string().default('0.0.0.0'),
    port: z.number().int().min(1).max(65535).default(3000),
  }),
  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  }),
  // Secrets - must be provided, no defaults
  sentry: z.object({
    dsn: z.string().url(),
  }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(path: string): Config {
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  const result = ConfigSchema.safeParse(raw);

  if (!result.success) {
    console.error('Invalid configuration:', result.error.format());
    process.exit(1); // Fail fast
  }

  return result.data;
}
```

### Pattern 3: Typed Error Classes

**What:** Domain-prefixed error codes with TypeScript support
**When to use:** All error conditions - consistent error handling

```typescript
// Source: https://www.npmjs.com/package/@fastify/error
import createError from '@fastify/error';

// Domain-prefixed errors per CONTEXT.md decisions
export const ConfigInvalidError = createError<[string]>(
  'CONFIG_INVALID',
  'Invalid configuration: %s',
  500
);

export const ConfigMissingError = createError<[string]>(
  'CONFIG_MISSING',
  'Missing required configuration: %s',
  500
);

// Usage:
throw new ConfigInvalidError('server.port must be a number');
```

### Pattern 4: Request/Response Logging with Correlation IDs

**What:** Structured logging with request correlation
**When to use:** All HTTP requests for debugging

```typescript
// Source: https://fastify.dev/docs/latest/Reference/Logging/
server.addHook('onRequest', async (request, reply) => {
  request.log.info({
    method: request.method,
    url: request.url,
    requestId: request.id,
    // Full body in dev, metadata only in prod
    ...(process.env.NODE_ENV === 'development' && { body: request.body }),
  }, 'incoming request');
});

server.addHook('onResponse', async (request, reply) => {
  request.log.info({
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    responseTime: reply.elapsedTime,
    requestId: request.id,
  }, 'request completed');
});
```

### Pattern 5: Health Check Endpoint

**What:** Health endpoint with dependency status
**When to use:** Always - required for monitoring (OPER-02)

```typescript
// Source: Fastify patterns
import { FastifyInstance } from 'fastify';

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  dependencies: Record<string, { status: 'up' | 'down'; latency?: number }>;
}

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get<{ Reply: HealthResponse }>('/health', async (request, reply) => {
    const checks = await checkDependencies();
    const status = checks.every(c => c.status === 'up') ? 'healthy' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      dependencies: Object.fromEntries(checks.map(c => [c.name, c])),
    };
  });
}
```

### Anti-Patterns to Avoid

- **Using `any` type:** Defeats TypeScript's purpose; use `unknown` and narrow types
- **Not enabling strict mode:** Misses many potential bugs; always set `strict: true`
- **Using require() for imports:** Types won't resolve; always use `import/from`
- **Logging sensitive data:** Never log secrets, API keys, or full request bodies in production
- **Synchronous file operations in routes:** Block event loop; use async/await
- **Not validating external input:** All inputs must pass Zod validation before use

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request ID generation | Custom UUID function | Fastify's `genReqId` + `requestIdHeader` | Handles propagation, logging integration |
| Schema validation | Custom validation functions | Zod schemas | Type inference, detailed errors, composable |
| Security headers | Manual header setting | @fastify/helmet | 15+ headers, CSP nonces, best practices |
| Error serialization | Custom error formatting | @fastify/error + setErrorHandler | Status codes, consistent format, TypeScript |
| Config loading | JSON.parse + manual checks | Zod + safeParse | Fail-fast, detailed error messages, defaults |
| Log formatting | console.log + JSON.stringify | pino + pino-pretty | Async, structured, fast, Fastify integration |
| Git hooks | Manual .git/hooks | husky + lint-staged | Cross-platform, easy config, team sharing |

**Key insight:** Foundation patterns benefit most from battle-tested libraries because edge cases (error handling, security, logging) are subtle and critical. Custom solutions inevitably miss cases that libraries handle.

## Common Pitfalls

### Pitfall 1: Not Enabling TypeScript Strict Mode

**What goes wrong:** Silent type errors, `any` propagation, missed null checks
**Why it happens:** Strict mode generates more initial errors during setup
**How to avoid:** Always start with `strict: true` in tsconfig.json
**Warning signs:** Using `any` to "fix" type errors, runtime null/undefined crashes

### Pitfall 2: Logging Request Bodies in Production

**What goes wrong:** Sensitive data (passwords, tokens, PII) ends up in logs
**Why it happens:** Development logging configuration copied to production
**How to avoid:** Environment-conditional logging per CONTEXT.md decision
**Warning signs:** Large log files, security audit findings, compliance issues

### Pitfall 3: Missing @types/node

**What goes wrong:** Errors about missing `require`, `process`, `Buffer`
**Why it happens:** TypeScript doesn't know about Node.js globals
**How to avoid:** Always install `@types/node` as dev dependency
**Warning signs:** "Cannot find name 'process'" errors

### Pitfall 4: Synchronous Config Loading at Module Level

**What goes wrong:** Unhandled exceptions, process exits without error context
**Why it happens:** Config loaded during import before error handlers registered
**How to avoid:** Load config in async startup function, not at module top-level
**Warning signs:** Process crashes with no logs, hard-to-debug startup failures

### Pitfall 5: Using Deprecated eslint-config-airbnb-typescript

**What goes wrong:** Incompatible with ESLint flat config, missing rule updates
**Why it happens:** Original package was archived May 2025
**How to avoid:** Use `eslint-config-airbnb-extended` which supports flat config
**Warning signs:** ESLint configuration errors, deprecation warnings

### Pitfall 6: Not Setting Up Proper Module Resolution

**What goes wrong:** Import errors, "Cannot find module" at runtime
**Why it happens:** Mismatched `module`/`moduleResolution` settings
**How to avoid:** Use `"module": "ESNext"`, `"moduleResolution": "bundler"` for modern setups
**Warning signs:** Works in IDE but fails at build/runtime

## Code Examples

Verified patterns from official sources:

### tsconfig.json (Strict TypeScript)

```json
// Source: TypeScript handbook + Zod requirements
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### tsdown.config.ts (Build Configuration)

```typescript
// Source: https://tsdown.dev/guide/getting-started
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

### vitest.config.ts (Testing Configuration)

```typescript
// Source: https://vitest.dev/config/
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/types/**'],
    },
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
```

### Sentry Integration for Fastify

```typescript
// Source: https://docs.sentry.io/platforms/javascript/guides/fastify/
// instrument.ts - must be imported FIRST
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
});

// server.ts - after instrument import
import './instrument';
import Fastify from 'fastify';
import * as Sentry from '@sentry/node';

const app = Fastify();
Sentry.setupFastifyErrorHandler(app);
```

### Docker Compose for Dependencies

```yaml
# docker-compose.yml - IPFS and Redis for local development
version: '3.8'

services:
  ipfs:
    image: ipfs/kubo:latest
    ports:
      - "4001:4001"      # P2P
      - "5001:5001"      # API
      - "8080:8080"      # Gateway
    volumes:
      - ipfs_data:/data/ipfs
    environment:
      - IPFS_PATH=/data/ipfs
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  ipfs_data:
  redis_data:
```

### Dependabot Configuration

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    groups:
      development-dependencies:
        patterns:
          - "@types/*"
          - "vitest"
          - "eslint*"
          - "prettier"
        update-types:
          - "minor"
          - "patch"
```

### Husky + lint-staged Setup

```json
// package.json (partial)
{
  "scripts": {
    "prepare": "husky",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

```bash
# .husky/pre-commit
pnpm lint-staged
pnpm typecheck
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tsup bundler | tsdown bundler | 2025 | tsup abandoned, tsdown uses Rolldown (faster) |
| eslint-config-airbnb-typescript | eslint-config-airbnb-extended | May 2025 | Original archived, new supports flat config |
| Jest testing | Vitest testing | 2023-2024 | Vitest is faster, native TS, modern |
| @vitest/coverage-c8 | @vitest/coverage-v8 | Vitest v1 | c8 deprecated, v8 is now the package name |
| dotenv for config | Zod + JSON config | Current | Better validation, type inference |
| ESLint .eslintrc | ESLint flat config | ESLint 9 | Legacy config deprecated |

**Deprecated/outdated:**
- **tsup**: No longer maintained, recommends tsdown
- **eslint-config-airbnb-typescript**: Archived May 2025
- **@vitest/coverage-c8**: Renamed to @vitest/coverage-v8
- **.eslintrc files**: ESLint 9+ prefers flat config (eslint.config.js)

## Open Questions

Things that couldn't be fully resolved:

1. **tsdown vs tsup stability**
   - What we know: tsdown is recommended successor, version 0.20.1 available
   - What's unclear: tsdown is marked as "beta" - stability for production builds
   - Recommendation: Use tsdown; if issues arise, tsup still works for now

2. **eslint-config-airbnb-extended completeness**
   - What we know: Supports flat config and TypeScript, based on Airbnb rules
   - What's unclear: Full rule parity with original eslint-config-airbnb-typescript
   - Recommendation: Use it; document any missing rules if found

3. **Sentry ESM import handling**
   - What we know: Sentry requires being imported first via instrument.ts
   - What's unclear: Best pattern with ESM and dynamic imports
   - Recommendation: Use `import './instrument'` as first line of entry point

## Sources

### Primary (HIGH confidence)
- [Fastify TypeScript Docs](https://fastify.dev/docs/latest/Reference/TypeScript/) - Server setup, type patterns
- [Vitest Guide](https://vitest.dev/guide/) - Testing configuration, coverage
- [Zod Documentation](https://zod.dev/) - Schema validation patterns
- [Sentry Fastify Guide](https://docs.sentry.io/platforms/javascript/guides/fastify/) - Error tracking setup
- npm registry - Verified current package versions

### Secondary (MEDIUM confidence)
- [tsdown Documentation](https://tsdown.dev/guide/) - Bundler configuration
- [eslint-config-airbnb-extended](https://github.com/NishargShah/eslint-config-airbnb-extended) - Flat config ESLint
- [GitHub Dependabot Docs](https://docs.github.com/en/code-security/dependabot/) - Security scanning
- [Husky Documentation](https://typicode.github.io/husky/) - Git hooks
- [IPFS Kubo Docker](https://docs.ipfs.tech/install/run-ipfs-inside-docker/) - Container setup

### Tertiary (LOW confidence)
- Community blog posts on TypeScript project setup - General patterns
- Stack Overflow discussions on Fastify error handling - Edge cases

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified versions from npm registry, official documentation
- Architecture: HIGH - Patterns from official Fastify/Vitest/Zod documentation
- Pitfalls: MEDIUM - Combination of official docs and community experience
- Build tooling: MEDIUM - tsdown is newer, less battle-tested than tsup

**Research date:** 2026-02-04
**Valid until:** 30 days (stable ecosystem, minor version updates expected)
