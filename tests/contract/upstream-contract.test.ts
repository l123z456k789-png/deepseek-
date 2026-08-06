import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOOL_CONTRACTS } from '../../src/contracts.ts';

interface UpstreamTool {
  name: string;
  description: string;
  inputSchema: {
    required?: string[];
    properties: Record<string, { type?: string; enum?: string[] }>;
  };
}

const fixturePath = fileURLToPath(new URL('../fixtures/upstream/tools-list.json', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { result: { tools: UpstreamTool[] } };

test('8 contracts match upstream fixture names, order, descriptions', () => {
  const upstream = fixture.result.tools;
  assert.equal(upstream.length, 8);
  assert.equal(TOOL_CONTRACTS.length, 8);
  TOOL_CONTRACTS.forEach((c, i) => {
    const u = upstream[i]!;
    assert.equal(c.name, u.name, `tool ${i}`);
    assert.equal(c.description, u.description, `description ${c.name}`);
  });
});

test('required/optional/enum metadata matches fixture', () => {
  const upstream = fixture.result.tools;
  const defs = TOOL_CONTRACTS.map((c) => ({
    name: c.name,
    keys: Object.keys(c.shape).sort(),
  }));
  upstream.forEach((u, i) => {
    const expectedKeys = Object.keys(u.inputSchema.properties).sort();
    assert.deepEqual(defs[i]!.keys, expectedKeys, `params ${u.name}`);
    const requiredSet = new Set(u.inputSchema.required ?? []);
    for (const [k, prop] of Object.entries(u.inputSchema.properties)) {
      assert.ok(defs[i]!.keys.includes(k), `${u.name}.${k} present`);
      assert.equal(prop.type, 'string', `${u.name}.${k} type`);
      if (prop.enum) {
        assert.ok(prop.enum.length > 0, `${u.name}.${k} enum`);
      }
    }
    assert.ok(requiredSet.size > 0, `${u.name} has required fields`);
  });
});