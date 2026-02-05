// x402-fac type definitions

import type Redis from 'ioredis';

import type { ChainProvider } from '../chain/provider.js';
import type { Config } from '../config/index.js';

export interface ServerOptions {
  config: Config;
}

// Augment Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    redis: Redis;
    chainProvider: ChainProvider;
  }
}
