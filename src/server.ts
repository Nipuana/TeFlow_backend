import type { Server } from 'http';
import { createApp } from './app';
import { config, assertProductionSafety } from './shared/config';
import { connectMongo, disconnectMongo } from './shared/adapters/db';
import logger from './shared/utils/logger';

/**
 * Process entry point. Fails fast on insecure production config (API8), connects
 * to MongoDB and hydrates the in-memory mirrors BEFORE accepting traffic, then
 * starts the HTTP server and wires graceful shutdown + last-resort crash guards.
 */
let server: Server;

async function main(): Promise<void> {
  assertProductionSafety();

  // Connect + hydrate persistence first — if Mongo is unreachable we fail fast
  // with a clear message rather than serving an empty, non-durable store.
  await connectMongo();

  const app = createApp();
  server = app.listen(config.port, () => {
    logger.info('server_started', { port: config.port, env: config.env });
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info('server_shutting_down', { signal });
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server?.close(async () => {
    await disconnectMongo().catch(() => undefined);
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Never leak internals via a crash; log and exit so the orchestrator restarts us.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { reason: String(reason) });
});
process.on('uncaughtException', (err: Error) => {
  logger.error('uncaught_exception', { message: err.message });
  process.exit(1);
});

main().catch((err: Error) => {
  logger.error('startup_failed', { message: err.message });
  process.exit(1);
});
