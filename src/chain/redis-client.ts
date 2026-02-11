// Redis client factory with lazy connect and retry strategy

import type { FastifyBaseLogger } from 'fastify';
import Redis from 'ioredis';

import type { ChainConfig } from './config.js';

/**
 * Create a Redis client instance with lazy connect and retry strategy.
 *
 * The client uses `lazyConnect: true` so the caller must explicitly
 * call `.connect()` when ready. Retry strategy caps backoff at 2 seconds.
 *
 * Supports optional authentication (password, username) and database selection
 * for production Redis deployments with ACLs.
 *
 * @param config - Redis connection config (host, port, password?, username?, db?)
 * @param logger - Fastify logger for connection events
 * @returns Redis instance (not yet connected)
 */
export function createRedisClient(config: ChainConfig['redis'], logger: FastifyBaseLogger): Redis {
  const client = new Redis({
    host: config.host,
    port: config.port,
    ...(config.password && { password: config.password }),
    ...(config.username && { username: config.username }),
    ...(config.db !== undefined && { db: config.db }),
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number {
      return Math.min(times * 200, 2000);
    },
  });

  client.on('connect', () => {
    logger.info('Redis connected');
  });

  client.on('error', (err: Error) => {
    logger.error({ err: err.message }, 'Redis connection error');
  });

  client.on('close', () => {
    logger.info('Redis connection closed');
  });

  return client;
}

/**
 * Gracefully disconnect a Redis client.
 */
export async function disconnectRedis(redis: Redis): Promise<void> {
  await redis.quit();
}
