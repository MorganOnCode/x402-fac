import { z } from 'zod';

import { BLOCKFROST_URLS } from './types.js';
import type { CardanoNetwork } from './types.js';

/**
 * Chain configuration Zod schema.
 *
 * Validates Blockfrost settings, facilitator credentials, UTXO cache,
 * reservation system, and Redis connection parameters.
 *
 * SECURITY: `blockfrost.projectId`, `facilitator.seedPhrase`, and
 * `facilitator.privateKey` are sensitive fields. They must be provided
 * explicitly in config and must never appear in logs.
 */
export const ChainConfigSchema = z
  .object({
    network: z.enum(['Preview', 'Preprod', 'Mainnet']).default('Preview'),

    blockfrost: z.object({
      /** Blockfrost project ID (sensitive - network-specific, never log) */
      projectId: z.string().min(1, 'Blockfrost project ID is required'),
      /** Override URL (derived from network if not set) */
      url: z.string().url().optional(),
      /** API tier - affects caching aggressiveness */
      tier: z.enum(['free', 'paid']).default('free'),
    }),

    facilitator: z
      .object({
        /** Seed phrase for facilitator wallet (sensitive - never log) */
        seedPhrase: z.string().optional(),
        /** Private key for facilitator wallet (sensitive - never log) */
        privateKey: z.string().optional(),
      })
      .refine(
        (d) => d.seedPhrase || d.privateKey,
        'Either seedPhrase or privateKey must be provided'
      ),

    cache: z
      .object({
        /** UTXO cache TTL in seconds (roughly 3 Cardano blocks at 60s) */
        utxoTtlSeconds: z.number().int().min(10).max(300).default(60),
      })
      .default(() => ({ utxoTtlSeconds: 60 })),

    reservation: z
      .object({
        /** Reservation TTL in seconds (covers ~6 Cardano blocks) */
        ttlSeconds: z.number().int().min(30).max(600).default(120),
        /** Maximum concurrent UTXO reservations */
        maxConcurrent: z.number().int().min(1).max(100).default(20),
      })
      .default(() => ({ ttlSeconds: 120, maxConcurrent: 20 })),

    redis: z
      .object({
        host: z.string().default('127.0.0.1'),
        port: z.number().int().min(1).max(65535).default(6379),
      })
      .default(() => ({ host: '127.0.0.1', port: 6379 })),
  })
  .superRefine((data, ctx) => {
    // Mainnet safety guardrail: require explicit MAINNET=true env var
    if (data.network === 'Mainnet' && process.env.MAINNET !== 'true') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mainnet connection requires explicit MAINNET=true environment variable',
        path: ['network'],
      });
    }
  });

export type ChainConfig = z.infer<typeof ChainConfigSchema>;

/**
 * Resolve the Blockfrost API URL for the given chain config.
 * Uses the explicit URL override if set, otherwise derives from the network.
 */
export function resolveBlockfrostUrl(config: ChainConfig): string {
  if (config.blockfrost.url) {
    return config.blockfrost.url;
  }
  return BLOCKFROST_URLS[config.network as CardanoNetwork];
}
