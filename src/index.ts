import { loadConfig } from './config/index.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  // Load and validate config (fails fast if invalid)
  const config = loadConfig();

  // Create server
  const server = await createServer({ config });

  // Start listening
  try {
    const address = await server.listen({
      host: config.server.host,
      port: config.server.port,
    });
    server.log.info(`Server listening at ${address}`);
  } catch (err) {
    server.log.error(err, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    server.log.info(`Received ${signal}, shutting down...`);
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
