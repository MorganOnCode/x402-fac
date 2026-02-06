import { randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';
import fastify from 'fastify';

import { createChainProvider, createRedisClient, disconnectRedis } from './chain/index.js';
import type { Config } from './config/index.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { requestLoggerPlugin } from './plugins/request-logger.js';
import { healthRoutesPlugin } from './routes/health.js';
import { verifyRoutesPlugin } from './routes/verify.js';

// Import types to ensure augmentation is loaded
import './types/index.js';

export interface CreateServerOptions {
  config: Config;
}

export async function createServer(options: CreateServerOptions): Promise<FastifyInstance> {
  const { config } = options;
  const isDev = config.env === 'development';

  const server = fastify({
    logger: {
      level: config.logging.level,
      transport: config.logging.pretty
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
    // Request ID handling
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    // Disable default request logging (we use custom plugin)
    disableRequestLogging: true,
  });

  // Decorate server with config for access in routes
  server.decorate('config', config);

  // Security headers
  await server.register(helmet, {
    global: true,
    // CSP can be customized per-route if needed
    contentSecurityPolicy: isDev ? false : undefined,
  });

  // CORS - permissive in dev, restrictive in prod
  await server.register(cors, {
    origin: isDev ? true : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  // Custom plugins
  await server.register(errorHandlerPlugin, { isDev });
  await server.register(requestLoggerPlugin, { isDev });

  // ---- Chain layer initialization ----
  try {
    const redis = createRedisClient(config.chain.redis, server.log);
    await redis.connect();
    server.decorate('redis', redis);

    server.log.info(
      {
        network: config.chain.network,
        tier: config.chain.blockfrost.tier,
        redis: `${config.chain.redis.host}:${config.chain.redis.port}`,
      },
      'Chain layer: Redis connected'
    );

    const chainProvider = await createChainProvider(config.chain, redis, server.log);
    server.decorate('chainProvider', chainProvider);

    server.log.info({ network: config.chain.network }, 'Chain layer initialized');

    // Shutdown hook for Redis disconnect
    server.addHook('onClose', async () => {
      await disconnectRedis(redis);
      server.log.info('Chain layer shutdown complete');
    });
  } catch (error) {
    server.log.error(
      { err: error instanceof Error ? error.message : 'Unknown error' },
      'Chain layer initialization failed'
    );
    throw error;
  }

  // Routes
  await server.register(healthRoutesPlugin);
  await server.register(verifyRoutesPlugin);

  return server;
}
