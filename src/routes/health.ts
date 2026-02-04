import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

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

// Dependency check functions (will be expanded in later phases)
async function checkRedis(): Promise<DependencyStatus> {
  // Placeholder - Redis check will be implemented in Phase 2+
  // For now, return 'up' if not configured
  return { status: 'up', latency: 0 };
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
      checkRedis().catch(
        (err): DependencyStatus => ({
          status: 'down',
          error: err.message,
        })
      ),
      checkIpfs().catch(
        (err): DependencyStatus => ({
          status: 'down',
          error: err.message,
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
      version: process.env.npm_package_version ?? '0.0.0',
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
