// x402-fac type definitions

import type { Config } from '../config/index.js';

export interface ServerOptions {
  config: Config;
}

// Augment Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
  }
}
