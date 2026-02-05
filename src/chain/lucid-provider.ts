// Lucid Evolution initialization with Blockfrost provider

import type { LucidEvolution } from '@lucid-evolution/lucid';
import { Lucid } from '@lucid-evolution/lucid';
import { Blockfrost } from '@lucid-evolution/provider';
import type { FastifyBaseLogger } from 'fastify';

import type { ChainConfig } from './config.js';
import { resolveBlockfrostUrl } from './config.js';

/**
 * Type alias for the Lucid Evolution instance.
 * Used throughout the chain layer for transaction building primitives.
 */
export type LucidInstance = LucidEvolution;

/**
 * Create and configure a Lucid Evolution instance.
 *
 * - Resolves Blockfrost URL from config (network-derived or explicit override)
 * - Creates Blockfrost provider for chain queries
 * - Initializes Lucid with the configured network
 * - Optionally selects facilitator wallet from seed phrase or private key
 *
 * SECURITY: The Blockfrost project ID and wallet credentials are never logged.
 *
 * @param config - Chain configuration with Blockfrost and facilitator settings
 * @param logger - Fastify logger for initialization messages
 * @returns Configured Lucid Evolution instance
 */
export async function createLucidInstance(
  config: ChainConfig,
  logger: FastifyBaseLogger
): Promise<LucidInstance> {
  const url = resolveBlockfrostUrl(config);
  const blockfrostProvider = new Blockfrost(url, config.blockfrost.projectId);

  const lucid = await Lucid(blockfrostProvider, config.network);

  // Select facilitator wallet
  if (config.facilitator.seedPhrase) {
    lucid.selectWallet.fromSeed(config.facilitator.seedPhrase);
  } else if (config.facilitator.privateKey) {
    lucid.selectWallet.fromPrivateKey(config.facilitator.privateKey);
  }

  logger.info({ network: config.network }, 'Lucid Evolution initialized');

  return lucid;
}
