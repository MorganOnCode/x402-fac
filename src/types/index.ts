// x402-fac type definitions

import type Redis from 'ioredis';

import type { Config } from '../config/index.js';

export interface ServerOptions {
  config: Config;
}

// Augment Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    /** Optional Redis client -- decorated when chain provider is initialized */
    redis?: Redis;
  }
}
