// POST /settle route -- exposes the settlement orchestrator via HTTP.
//
// Validates the request body with Zod, assembles a VerifyContext from the
// parsed request plus server state, calls settlePayment(), and returns the
// result. All responses are HTTP 200 except truly unexpected server errors.

import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

import type { CardanoNetwork } from '../chain/types.js';
import { settlePayment } from '../settle/settle-payment.js';
import { SettleRequestSchema } from '../settle/types.js';
import { CAIP2_CHAIN_IDS } from '../verify/types.js';
import type { VerifyContext } from '../verify/types.js';

const settleRoutes: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.post(
    '/settle',
    {
      config: {
        rateLimit: {
          max: fastify.config.rateLimit.sensitive,
          timeWindow: fastify.config.rateLimit.windowMs,
        },
      },
    },
    async (request, reply) => {
      // 1. Parse and validate request body with Zod
      const parsed = SettleRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(200).send({
          success: false,
          reason: 'invalid_request',
        });
      }

      // 2. Assemble VerifyContext from parsed request + server state
      const { paymentRequirements } = parsed.data;
      const chainConfig = fastify.config.chain;
      const verificationConfig = chainConfig.verification;

      const ctx: VerifyContext = {
        scheme: paymentRequirements.scheme,
        network: paymentRequirements.network,
        payTo: paymentRequirements.payTo,
        requiredAmount: BigInt(paymentRequirements.maxAmountRequired),
        maxTimeoutSeconds: paymentRequirements.maxTimeoutSeconds,
        asset: paymentRequirements.asset,
        transactionCbor: parsed.data.transaction,
        payerAddress: undefined,
        requestedAt: Date.now(),
        getCurrentSlot: () => fastify.chainProvider.getCurrentSlot(),
        getMinUtxoLovelace: (numAssets: number) =>
          fastify.chainProvider.getMinUtxoLovelace(numAssets),
        configuredNetwork: CAIP2_CHAIN_IDS[chainConfig.network as CardanoNetwork],
        feeMin: BigInt(verificationConfig.feeMinLovelace),
        feeMax: BigInt(verificationConfig.feeMaxLovelace),
      };

      // 3. Convert base64 transaction to Uint8Array for submission
      const cborBytes = Buffer.from(parsed.data.transaction, 'base64');

      // 4. Determine CAIP-2 network string
      const network = CAIP2_CHAIN_IDS[chainConfig.network as CardanoNetwork];

      // 5. Call settlement orchestrator
      try {
        const result = await settlePayment(
          ctx,
          cborBytes,
          fastify.chainProvider.blockfrostClient,
          fastify.redis,
          network,
          fastify.log
        );

        // 6. Return result as HTTP 200
        return reply.status(200).send(result);
      } catch (error) {
        // 7. Unexpected errors -- HTTP 500
        fastify.log.error(
          { err: error instanceof Error ? error.message : 'Unknown error' },
          'Unexpected error during settlement'
        );
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'An unexpected error occurred during settlement',
        });
      }
    }
  );

  done();
};

export const settleRoutesPlugin = fp(settleRoutes, {
  name: 'settle-routes',
  fastify: '5.x',
});
