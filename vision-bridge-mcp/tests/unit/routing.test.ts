import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../../src/routing/error-policy.ts';
import { CircuitBreaker } from '../../src/routing/circuit-breaker.ts';
import { SerialRateLimiter } from '../../src/routing/rate-limit.ts';
import { createRouter } from '../../src/routing/router.ts';
import { ProviderError } from '../../src/providers/errors.ts';
import { loadConfig } from '../../src/config.ts';
import type { ImageRequest, ProviderResult, VisionProvider } from '../../src/providers/types.ts';

const req: ImageRequest = {
  tool: 'analyze_image',
  images: [{ path: 'C:\\x\\a.png', mimeType: 'image/png', sizeBytes: 100, sha256: 'a'.repeat(64), dataUrl: 'data:image/png;base64,AAAA' }],
  prompt: 'describe',
  outputProfile: 'analyze_image',
};

function provider(id: 'mimo' | 'zhipu', behavior: 'ok' | 'http429' | 'http401' | 'capability' | 'fail'): VisionProvider {
  const calls: number[] = [];
  const p: VisionProvider = {
    id,
    capabilities: { id, singleImage: true, multiImage: true, video: true, mixedImageVideo: false, imageMaxMb: 50, videoMaxMb: 50, contextTokens: 100000, thinkingDisableSupported: 'unknown' },
    analyzeImage: async () => {
      calls.push(Date.now());
      if (behavior === 'ok') return { provider: id, content: `${id} ok`, latencyMs: 1 };
      if (behavior === 'http429') throw new ProviderError('HTTP 429', 'http', 429);
      if (behavior === 'http401') throw new ProviderError('HTTP 401', 'http', 401);
      if (behavior === 'capability') throw new ProviderError('too big', 'capability');
      throw new ProviderError('boom', 'http', 500);
    },
    analyzeVideo: async () => { throw new Error('not used'); },
    mapImageRequest: () => ({}),
    mapVideoRequest: () => ({}),
  };
  return p;
}

test('error policy classifies per plan matrix', () => {
  assert.deepEqual(decide(new ProviderError('x', 'timeout')), { retry: false, fallback: true, cooldownMs: 10000, disableProvider: false });
  assert.deepEqual(decide(new ProviderError('x', 'http', 429)), { retry: false, fallback: true, cooldownMs: 60000, disableProvider: false });
  assert.deepEqual(decide(new ProviderError('x', 'http', 401)), { retry: false, fallback: true, cooldownMs: 0, disableProvider: true });
  assert.deepEqual(decide(new ProviderError('x', 'http', 503)), { retry: true, fallback: true, cooldownMs: 10000, disableProvider: false });
  assert.deepEqual(decide(new ProviderError('x', 'http')), { retry: true, fallback: true, cooldownMs: 5000, disableProvider: false });
  assert.deepEqual(decide(new ProviderError('x', 'parse')), { retry: true, fallback: true, cooldownMs: 10000, disableProvider: false });
  assert.deepEqual(decide(new ProviderError('x', 'capability')), { retry: false, fallback: true, cooldownMs: 0, disableProvider: false });
});

test('circuit breaker opens permanently on 401 and cools down on 429', () => {
  const cb = new CircuitBreaker();
  assert.equal(cb.allow('mimo'), true);
  cb.recordFailure('mimo', decide(new ProviderError('x', 'http', 401)));
  assert.equal(cb.allow('mimo'), false);
  const cb2 = new CircuitBreaker();
  cb2.recordFailure('mimo', decide(new ProviderError('x', 'http', 429)));
  assert.equal(cb2.allow('mimo'), false);
  cb2.recordSuccess('mimo');
  assert.equal(cb2.allow('mimo'), true);
});

test('serial rate limiter enforces minimum interval', async () => {
  const limiter = new SerialRateLimiter(50);
  const stamps: number[] = [];
  await Promise.all([
    limiter.run(async () => { stamps.push(Date.now()); await new Promise((r) => setTimeout(r, 10)); }),
    limiter.run(async () => { stamps.push(Date.now()); }),
  ]);
  assert.equal(stamps.length, 2);
  assert.ok(stamps[1]! - stamps[0]! >= 50);
});

test('router: primary success does not call fallback', async () => {
  let zhipuCalls = 0;
  const zhipu = provider('zhipu', 'ok');
  const orig = zhipu.analyzeImage.bind(zhipu);
  zhipu.analyzeImage = async (r) => { zhipuCalls++; return orig(r); };
  const router = createRouter(loadConfig({ MIMO_API_KEY: 'k', Z_AI_API_KEY: 'z' }), { mimo: provider('mimo', 'ok'), zhipu });
  const out = await router.analyzeImage(req);
  assert.equal(out.result.content, 'mimo ok');
  assert.equal(out.fallbackUsed, false);
  assert.equal(zhipuCalls, 0);
});

test('router: primary 429 falls back once to zhipu', async () => {
  const router = createRouter(loadConfig({ MIMO_API_KEY: 'k', Z_AI_API_KEY: 'z' }), { mimo: provider('mimo', 'http429'), zhipu: provider('zhipu', 'ok') });
  const out = await router.analyzeImage(req);
  assert.equal(out.result.content, 'zhipu ok');
  assert.equal(out.fallbackUsed, true);
  assert.equal(out.primaryAttempted, true);
});

test('router: key missing skips primary and still reports fallback without primary attempt', async () => {
  const router = createRouter(loadConfig({ Z_AI_API_KEY: 'z' }), { mimo: provider('mimo', 'ok'), zhipu: provider('zhipu', 'ok') });
  const out = await router.analyzeImage(req);
  assert.equal(out.result.content, 'zhipu ok');
  assert.equal(out.fallbackUsed, true);
  assert.equal(out.primaryAttempted, false);
});

test('router: capability error falls back', async () => {
  const router = createRouter(loadConfig({ MIMO_API_KEY: 'k', Z_AI_API_KEY: 'z' }), { mimo: provider('mimo', 'capability'), zhipu: provider('zhipu', 'ok') });
  const out = await router.analyzeImage(req);
  assert.equal(out.result.content, 'zhipu ok');
});

test('router: 401 disables primary for subsequent calls', async () => {
  const router = createRouter(loadConfig({ MIMO_API_KEY: 'k', Z_AI_API_KEY: 'z' }), { mimo: provider('mimo', 'http401'), zhipu: provider('zhipu', 'ok') });
  const first = await router.analyzeImage(req);
  assert.equal(first.result.content, 'zhipu ok');
  const second = await router.analyzeImage(req);
  assert.equal(second.primaryAttempted, false);
  assert.equal(second.result.content, 'zhipu ok');
});

test('router: zhipu 429 opens fallback cooldown; subsequent call does not hit zhipu again', async () => {
  let zhipuCalls = 0;
  const zhipu = provider('zhipu', 'http429');
  const orig = zhipu.analyzeImage.bind(zhipu);
  zhipu.analyzeImage = async (r) => { zhipuCalls++; return orig(r); };
  const router = createRouter(loadConfig({ MIMO_API_KEY: 'k', Z_AI_API_KEY: 'z' }), { mimo: provider('mimo', 'fail'), zhipu });
  await assert.rejects(() => router.analyzeImage(req), /All providers failed/);
  assert.equal(zhipuCalls, 1);
  await assert.rejects(() => router.analyzeImage(req), /cooling down/);
  assert.equal(zhipuCalls, 1);
});
test('router: both providers fail -> throws', async () => {
  const router = createRouter(loadConfig({ MIMO_API_KEY: 'k', Z_AI_API_KEY: 'z' }), { mimo: provider('mimo', 'fail'), zhipu: provider('zhipu', 'fail') });
  await assert.rejects(() => router.analyzeImage(req), /All providers failed/);
});