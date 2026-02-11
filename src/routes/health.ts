import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import type Redis from 'ioredis';

// Read version once at startup (not on every request)
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')) as {
  version: string;
};
const APP_VERSION = packageJson.version;

interface DependencyStatus {
  status: 'up' | 'down';
  latency?: number;
  error?: string;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  dependencies: Record<string, DependencyStatus>;
}

// Dependency check functions

async function checkRedis(redis?: Redis): Promise<DependencyStatus> {
  if (!redis) {
    // Not configured yet -- return up (placeholder behavior)
    return { status: 'up', latency: 0 };
  }
  const start = Date.now();
  try {
    await redis.ping();
    return { status: 'up', latency: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkIpfs(): Promise<DependencyStatus> {
  // Placeholder - IPFS check will be implemented in Phase 7
  // For now, return 'up' if not configured
  return { status: 'up', latency: 0 };
}

const healthRoutes: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    // Run dependency checks in parallel
    const [redisStatus, ipfsStatus] = await Promise.all([
      checkRedis(fastify.redis).catch(
        (err): DependencyStatus => ({
          status: 'down',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      ),
      checkIpfs().catch(
        (err): DependencyStatus => ({
          status: 'down',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      ),
    ]);

    const dependencies: Record<string, DependencyStatus> = {
      redis: redisStatus,
      ipfs: ipfsStatus,
    };

    // Determine overall status
    const allUp = Object.values(dependencies).every((d) => d.status === 'up');
    const allDown = Object.values(dependencies).every((d) => d.status === 'down');

    let status: HealthResponse['status'];
    if (allUp) {
      status = 'healthy';
    } else if (allDown) {
      status = 'unhealthy';
    } else {
      status = 'degraded';
    }

    const response: HealthResponse = {
      status,
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      uptime: process.uptime(),
      dependencies,
    };

    // Set appropriate status code
    const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

    return reply.status(statusCode).send(response);
  });

  done();
};

export const healthRoutesPlugin = fp(healthRoutes, {
  name: 'health-routes',
  fastify: '5.x',
});
