import type { FastifyPluginCallback, FastifyError } from 'fastify';
import fp from 'fastify-plugin';

interface ErrorHandlerOptions {
  isDev: boolean;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    statusCode: number;
    stack?: string;
  };
  requestId: string;
  timestamp: string;
}

const errorHandler: FastifyPluginCallback<ErrorHandlerOptions> = (fastify, options, done) => {
  const { isDev } = options;

  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const code = error.code ?? 'INTERNAL_ERROR';

    // Log the error
    request.log.error(
      {
        err: error,
        code,
        statusCode,
      },
      'Request error'
    );

    const response: ErrorResponse = {
      error: {
        code,
        message: isDev ? error.message : sanitizeMessage(error.message, code),
        statusCode,
        // Only include stack in development
        ...(isDev && error.stack && { stack: error.stack }),
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };

    reply.status(statusCode).send(response);
  });

  done();
};

function sanitizeMessage(message: string, code: string): string {
  // In production, return generic messages for internal errors
  if (code === 'INTERNAL_ERROR' || code.startsWith('SERVER_')) {
    return 'An internal error occurred';
  }
  // Config errors should be visible (they're startup issues)
  if (code.startsWith('CONFIG_')) {
    return message;
  }
  // Default: return the message (it's likely user-facing)
  return message;
}

export const errorHandlerPlugin = fp(errorHandler, {
  name: 'error-handler',
  fastify: '5.x',
});
