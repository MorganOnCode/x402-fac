import { randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';
import fastify from 'fastify';

import type { Config } from './config/index.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { requestLoggerPlugin } from './plugins/request-logger.js';
import { healthRoutesPlugin } from './routes/health.js';

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

  // Routes
  await server.register(healthRoutesPlugin);

  return server;
}
