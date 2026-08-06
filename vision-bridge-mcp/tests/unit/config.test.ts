import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.ts';

test('defaults', () => {
  const c = loadConfig({});
  assert.equal(c.primaryModel, 'mimo-v2.5');
  assert.equal(c.mimoTimeoutMs, 120000);
  assert.equal(c.mimoMaxRetries, 1);
  assert.equal(c.zhipuTimeoutMs, 300000);
  assert.equal(c.zhipuMode, 'ZHIPU');
  assert.equal(c.zhipuModel, 'glm-4.6v-flash');
  assert.equal(c.zhipuThinking, 'enabled');
  assert.equal(c.mediaMaxMb, 100);
  assert.equal(c.keys.mimo.present, false);
  assert.equal(c.keys.zhipu.present, false);
  assert.equal(c.localCacheEnabled, true);
  assert.equal(c.resultCacheEnabled, false);
});

test('MIMO_API_KEY_3 alone counts as present with source env3', () => {
  const c = loadConfig({ MIMO_API_KEY_3: 'x' });
  assert.equal(c.keys.mimo.present, true);
  assert.equal(c.keys.mimo.source, 'env3');
});
test('MIMO_API_KEY_2 alone counts as present', () => {
  const c = loadConfig({ MIMO_API_KEY_2: 'x' });
  assert.equal(c.keys.mimo.present, true);
  assert.equal(c.keys.mimo.source, 'env2');
});
test('env overrides and key presence flags', () => {
  const c = loadConfig({
    MIMO_API_KEY: 'x',
    Z_AI_API_KEY: 'y',
    VISION_PRIMARY_MODEL: 'mimo-v2.5-pro',
    VISION_MIMO_TIMEOUT_MS: '3000',
    VISION_MIMO_MAX_RETRIES: '2',
    VISION_ZHIPU_TIMEOUT_MS: '9000',
    VISION_MAX_MEDIA_MB: '50',
    VISION_LOCAL_CACHE: 'false',
    VISION_RESULT_CACHE: 'true',
  });
  assert.equal(c.keys.mimo.present, true);
  assert.equal(c.keys.zhipu.present, true);
  assert.equal(c.primaryModel, 'mimo-v2.5-pro');
  assert.equal(c.mimoTimeoutMs, 3000);
  assert.equal(c.mimoMaxRetries, 2);
  assert.equal(c.zhipuTimeoutMs, 9000);
  assert.equal(c.mediaMaxMb, 50);
  assert.equal(c.localCacheEnabled, false);
  assert.equal(c.resultCacheEnabled, true);
});