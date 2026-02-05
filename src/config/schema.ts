import { z } from 'zod';

import { ChainConfigSchema } from '../chain/config.js';

export const ConfigSchema = z.object({
  server: z
    .object({
      host: z.string().default('0.0.0.0'),
      port: z.number().int().min(1).max(65535).default(3000),
    })
    .default(() => ({ host: '0.0.0.0', port: 3000 })),

  logging: z
    .object({
      level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
      pretty: z.boolean().default(false),
    })
    .default(() => ({ level: 'info' as const, pretty: false })),

  // Optional Sentry integration
  sentry: z
    .object({
      dsn: z.string().url(),
      environment: z.string().default('development'),
    })
    .optional(),

  // Environment mode
  env: z.enum(['development', 'production', 'test']).default('development'),

  // Chain provider configuration (Blockfrost, network, cache, reservation, Redis)
  chain: ChainConfigSchema,
});

export type Config = z.infer<typeof ConfigSchema>;
