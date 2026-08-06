import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureLogFile, log } from '../../src/logger.ts';

test('file logger writes structured lines to configured path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vbm-log-'));
  const file = join(dir, 'bridge.log');
  configureLogFile(file);
  log('info', 'test-message', { provider: 'mimo', latencyMs: 1, cachedTokens: 10 });
  configureLogFile(null);
  const content = readFileSync(file, 'utf8');
  assert.ok(content.includes('test-message'));
  assert.ok(content.includes('"provider":"mimo"'));
  assert.ok(content.includes('"cachedTokens":10'));
  rmSync(dir, { recursive: true, force: true });
});