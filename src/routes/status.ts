// POST /status route -- lightweight transaction confirmation polling.
//
// Validates the request body with Zod, queries Blockfrost for the
// transaction status, and returns confirmed/pending/not_found.
// All responses are HTTP 200 except truly unexpected server errors.

import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

import { StatusRequestSchema } from '../settle/types.js';

const statusRoutes: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.post('/status', async (request, reply) => {
    // 1. Parse and validate request body with Zod
    const parsed = StatusRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(200).send({
        status: 'not_found',
        transaction: '',
      });
    }

    // 2. Query Blockfrost for transaction status
    try {
      const txInfo = await fastify.chainProvider.blockfrostClient.getTransaction(
        parsed.data.transaction
      );

      // 3. Return confirmation status
      if (txInfo !== null) {
        return reply.status(200).send({
          status: 'confirmed',
          transaction: parsed.data.transaction,
        });
      }

      return reply.status(200).send({
        status: 'pending',
        transaction: parsed.data.transaction,
      });
    } catch (error) {
      // 4. Unexpected errors -- HTTP 500
      fastify.log.error(
        { err: error instanceof Error ? error.message : 'Unknown error' },
        'Unexpected error during status check'
      );
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred during status check',
      });
    }
  });

  done();
};

export const statusRoutesPlugin = fp(statusRoutes, {
  name: 'status-routes',
  fastify: '5.x',
});
