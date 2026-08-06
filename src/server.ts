import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.ts';
import { loadConfig } from './config.ts';
import { createRouter, type VisionRouter } from './routing/router.ts';
import { configureLogFile, DEFAULT_LOG_FILE_PATH, log } from './logger.ts';

export function createServer(config = loadConfig(), router?: VisionRouter): McpServer {
  const server = new McpServer(
    { name: 'vision-bridge', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  registerTools(server, config, router ?? createRouter(config));
  return server;
}

export async function main(): Promise<void> {
  const config = loadConfig();
  configureLogFile(process.env.VISION_LOG_FILE?.trim() || DEFAULT_LOG_FILE_PATH);
  log('info', 'starting', {
    mimoKeyPresent: config.keys.mimo.present,
    zhipuKeyPresent: config.keys.zhipu.present,
    primaryModel: config.primaryModel,
  });
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('info', 'server connected');
}