import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { MediaCache } from '../../src/cache/media-cache.ts';
import { SingleFlight } from '../../src/cache/singleflight.ts';
import { ResultCache } from '../../src/cache/result-cache.ts';
import { metrics } from '../../src/metrics.ts';

const png = fileURLToPath(new URL('../fixtures/media/sample-text.png', import.meta.url));
const png2 = fileURLToPath(new URL('../fixtures/media/sample-ui.png', import.meta.url));
const mp4 = fileURLToPath(new URL('../fixtures/media/sample-video.mp4', import.meta.url));

test('media cache hit/miss, sha stable, bounded size', () => {
  metrics.reset();
  const cache = new MediaCache();
  const a = cache.prepare(png, 'image', { includeDataUrl: true });
  assert.match(a.dataUrl ?? '', /^data:image\/png;base64,/);
  const b = cache.prepare(png, 'image', { includeDataUrl: true });
  assert.equal(b.sha256, a.sha256);
  assert.equal(cache.stats().size, 1);
  cache.prepare(png2, 'image');
  assert.equal(cache.stats().size, 2);
});

test('media cache evicts by maxEntries (LRU)', () => {
  const cache = new MediaCache({ maxEntries: 1 });
  cache.prepare(png, 'image');
  cache.prepare(png2, 'image');
  assert.equal(cache.stats().size, 1);
});

test('media cache TTL expiry causes a new miss', async () => {
  metrics.reset();
  const cache = new MediaCache({ ttlMs: 20 });
  cache.prepare(png, 'image');
  assert.equal(metrics.snapshot().mediaCacheMisses, 1);
  await new Promise((r) => setTimeout(r, 50));
  cache.prepare(png, 'image');
  assert.equal(metrics.snapshot().mediaCacheMisses, 2);
  assert.equal(metrics.snapshot().mediaCacheHits, 0);
});

test('video base64 is not persisted but fresh dataUrl is returned', () => {
  metrics.reset();
  const cache = new MediaCache({ videoBase64Cache: false });
  const a = cache.prepare(mp4, 'video', { includeDataUrl: true });
  assert.match(a.dataUrl ?? '', /^data:video\/mp4;base64,/);
  const b = cache.prepare(mp4, 'video', { includeDataUrl: true });
  assert.match(b.dataUrl ?? '', /^data:video\/mp4;base64,/);
  assert.equal(b.sha256, a.sha256);
});

test('singleflight: 10 concurrent identical requests -> 1 call, 9 deduped', async () => {
  const sf = new SingleFlight();
  let calls = 0;
  const fn = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return 'ok'; };
  const results = await Promise.all(Array.from({ length: 10 }, () => sf.run('k', fn)));
  assert.deepEqual(results, Array(10).fill('ok'));
  assert.equal(calls, 1);
  assert.equal(sf.stats().deduped, 9);
});

test('singleflight: different keys run independently', async () => {
  const sf = new SingleFlight();
  let calls = 0;
  await Promise.all([
    sf.run('a', async () => { calls++; await new Promise((r) => setTimeout(r, 10)); }),
    sf.run('b', async () => { calls++; }),
  ]);
  assert.equal(calls, 2);
});

test('result cache is disabled by default', () => {
  const rc = new ResultCache();
  const key = rc.key({ kind: 'image', tool: 'analyze_image', mediaShas: 's', prompt: 'p', model: 'm' });
  rc.set(key, { provider: 'mimo', content: 'x', latencyMs: 1 });
  assert.equal(rc.get(key), null);
});

test('result cache enabled: exact key required (media sha and model matter)', () => {
  const rc = new ResultCache({ enabled: true });
  const k1 = rc.key({ kind: 'image', tool: 'analyze_image', mediaShas: 's1', prompt: 'p', model: 'm' });
  rc.set(k1, { provider: 'mimo', content: 'x', latencyMs: 1 });
  assert.equal(rc.get(k1)?.content, 'x');
  assert.equal(rc.get(rc.key({ kind: 'image', tool: 'analyze_image', mediaShas: 's2', prompt: 'p', model: 'm' })), null);
  assert.equal(rc.get(rc.key({ kind: 'image', tool: 'analyze_image', mediaShas: 's1', prompt: 'p', model: 'm2' })), null);
});

test('metrics snapshot aggregates calls, usage and latency', () => {
  metrics.reset();
  metrics.recordProviderCall('mimo');
  metrics.recordUsage({ promptTokens: 10, cachedTokens: 4, completionTokens: 5, reasoningTokens: 2 });
  metrics.recordLatency(100);
  metrics.recordLatency(300);
  const s = metrics.snapshot();
  assert.equal(s.mimoCalls, 1);
  assert.equal(s.zhipuCalls, 0);
  assert.equal(s.cachedTokens, 4);
  assert.equal(s.reasoningTokens, 2);
  assert.equal(s.averageLatencyMs, 200);
});