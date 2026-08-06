import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/server.ts';
import { loadConfig } from '../../src/config.ts';
import type { VisionRouter } from '../../src/routing/router.ts';

interface UpstreamTool {
  name: string;
  description: string;
  inputSchema: {
    required?: string[];
    properties: Record<string, { type?: string; enum?: string[] }>;
  };
}

const fixtureTools = (JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/upstream/tools-list.json', import.meta.url)), 'utf8'),
) as { result: { tools: UpstreamTool[] } }).result.tools;
const png = fileURLToPath(new URL('../fixtures/media/sample-text.png', import.meta.url));

const fakeRouter: VisionRouter = {
  analyzeImage: async () => ({
    result: { provider: 'mimo', content: 'fake vision result', latencyMs: 1 },
    fallbackUsed: false,
    primaryAttempted: true,
  }),
  analyzeVideo: async () => ({
    result: { provider: 'mimo', content: 'fake video result', latencyMs: 1 },
    fallbackUsed: false,
    primaryAttempted: true,
  }),
};

async function setup() {
  const config = loadConfig({ Z_AI_API_KEY: 'test', MIMO_API_KEY: 'test', VISION_MAX_MEDIA_MB: '100' });
  const server = createServer(config, fakeRouter);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.1' }, { capabilities: {} });
  await client.connect(clientTransport);
  return { client, server };
}

function textOf(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0]!.text;
}

test('initialize + tools/list exposes exactly the 8 upstream tools', async () => {
  const { client, server } = await setup();
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 8);
  listed.tools.forEach((t, i) => {
    const expected = fixtureTools[i]!;
    assert.equal(t.name, expected.name);
    assert.equal(t.description, expected.description);
    const actual = t.inputSchema as UpstreamTool['inputSchema'];
    assert.deepEqual((actual.required ?? []).sort(), (expected.inputSchema.required ?? []).sort(), `required ${t.name}`);
    assert.deepEqual(Object.keys(actual.properties ?? {}).sort(), Object.keys(expected.inputSchema.properties).sort(), `props ${t.name}`);
    for (const [k, ep] of Object.entries(expected.inputSchema.properties)) {
      const ap = (actual.properties ?? {})[k]!;
      assert.equal(ap.type, ep.type, `${t.name}.${k}`);
      if (ep.enum) assert.deepEqual(ap.enum, ep.enum, `${t.name}.${k} enum`);
    }
  });
  await client.close();
  await server.close();
});

test('invalid input returns MCP validation error without provider call', async () => {
  const { client, server } = await setup();
  const res = await client.callTool({ name: 'analyze_image', arguments: {} });
  assert.equal(res.isError, true);
  assert.match(textOf(res as { content: Array<{ type: string; text: string }> }), /MCP error -32602/);
  await client.close();
  await server.close();
});

test('missing local path returns upstream-compatible error', async () => {
  const { client, server } = await setup();
  const res = await client.callTool({
    name: 'analyze_image',
    arguments: { image_source: 'C:\\no\\such\\file.png', prompt: 'describe' },
  });
  assert.equal(res.isError, true);
  assert.match(textOf(res as { content: Array<{ type: string; text: string }> }), /Image file not found/);
  await client.close();
  await server.close();
});

test('valid input routes to provider and returns content', async () => {
  const { client, server } = await setup();
  const res = await client.callTool({
    name: 'analyze_image',
    arguments: { image_source: png, prompt: 'describe' },
  });
  assert.equal(res.isError, undefined);
  assert.equal(textOf(res as { content: Array<{ type: string; text: string }> }), 'fake vision result');
  await client.close();
  await server.close();
});