import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type { Config } from '@/config/index.js';
import { createServer } from '@/server.js';

describe('Server Integration', () => {
  let server: FastifyInstance;

  const testConfig: Config = {
    server: { host: '0.0.0.0', port: 0 }, // Port 0 = random available port
    logging: { level: 'error', pretty: false }, // Quiet logs in tests
    env: 'test',
  };

  beforeAll(async () => {
    server = await createServer({ config: testConfig });
    await server.listen({ port: 0 });
  });

  afterAll(async () => {
    await server.close();
  });

  it('should have security headers from helmet', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/nonexistent',
    });

    // Helmet sets these headers
    expect(response.headers['x-dns-prefetch-control']).toBe('off');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should return request ID in error responses', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/nonexistent',
      headers: {
        'x-request-id': 'test-request-123',
      },
    });

    const body = JSON.parse(response.body);
    expect(body.requestId).toBe('test-request-123');
  });

  it('should generate request ID if not provided', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/nonexistent',
    });

    const body = JSON.parse(response.body);
    expect(body.requestId).toBeDefined();
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
  });

  it('should return 404 for unknown routes', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/unknown-route',
    });

    expect(response.statusCode).toBe(404);
  });

  it('should include timestamp in error responses', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/nonexistent',
    });

    const body = JSON.parse(response.body);
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });
});
