#!/usr/bin/env node
/**
 * stdio entry point.
 *
 * Nothing may be written to stdout except JSON-RPC frames — stdout *is* the
 * transport. All logging therefore goes to stderr.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from './lib/config.js';
import { createServer } from './server.js';

function log(message: string): void {
  process.stderr.write(`[${PACKAGE_NAME}] ${message}\n`);
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  const shutdown = (signal: string) => {
    log(`received ${signal}, shutting down`);
    void server.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await server.connect(transport);
  log(`v${PACKAGE_VERSION} ready on stdio`);
}

main().catch((error: unknown) => {
  log(`fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
