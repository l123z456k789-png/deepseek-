#!/usr/bin/env node
import { main } from './server.ts';

main().catch((error: unknown) => {
  process.stderr.write(`[vision-bridge] fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});