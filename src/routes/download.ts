// GET /files/:cid route -- free file downloads (no payment required).
//
// Serves files by content identifier (hash or CID). No payment gate.
// Requirement: STOR-03 (serves files freely by content ID)

import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

interface DownloadParams {
  cid: string;
}

const downloadRoutes: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.get<{ Params: DownloadParams }>(
    '/files/:cid',
    {
      schema: {
        description: 'Download a file by content identifier (free, no payment required)',
        tags: ['Storage'],
        params: z.object({
          cid: z.string().describe('Content identifier (SHA-256 hash or IPFS CID)'),
        }),
        response: {
          200: z.string().describe('File binary data (application/octet-stream)'),
          400: z.object({ error: z.string(), message: z.string() }),
          404: z.object({ error: z.string(), message: z.string() }),
          500: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { cid } = request.params;

      // 1. Validate CID format (basic check -- backends do their own validation too)
      if (!cid || cid.length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Content identifier is required',
        });
      }

      // 2. Check if content exists
      const exists = await fastify.storage.has(cid);
      if (!exists) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Content not found',
        });
      }

      // 3. Retrieve content
      try {
        const data = await fastify.storage.get(cid);
        if (!data) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Content not found',
          });
        }

        return reply
          .status(200)
          .header('Content-Type', 'application/octet-stream')
          .header('Content-Length', data.length.toString())
          .send(data);
      } catch (error) {
        fastify.log.error(
          { err: error instanceof Error ? error.message : 'Unknown error', cid },
          'File retrieval failed'
        );
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve file',
        });
      }
    }
  );

  done();
};

export const downloadRoutesPlugin = fp(downloadRoutes, {
  name: 'download-routes',
  fastify: '5.x',
});
