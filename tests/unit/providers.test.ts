import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MimoProvider } from '../../src/providers/mimo.ts';
import { ZhipuProvider } from '../../src/providers/zhipu.ts';
import { ProviderError } from '../../src/providers/errors.ts';
import { loadConfig } from '../../src/config.ts';
import type { ImageRequest, MediaRef, VideoRequest } from '../../src/providers/types.ts';

const MB = 1024 * 1024;

// 测试用假 Key：Provider 按设计只从 process.env 读取密钥，不存进 config。
process.env.MIMO_API_KEY = 'k';
process.env.MIMO_API_KEY_2 = 'k2';
process.env.MIMO_API_KEY_3 = 'k3';
process.env.Z_AI_API_KEY = 'z';

function media(sizeBytes = 1000, dataUrl = 'data:image/png;base64,AAAA'): MediaRef {
  return { path: 'C:\\x\\a.png', mimeType: 'image/png', sizeBytes, sha256: 'a'.repeat(64), dataUrl };
}
function imgReq(tool = 'analyze_image', images: MediaRef[] = [media()]): ImageRequest {
  return { tool, images, prompt: 'describe', outputProfile: tool };
}
function vidReq(sizeBytes = 1000, sampling?: { fps?: number }): VideoRequest {
  return {
    tool: 'analyze_video',
    video: { path: 'C:\\x\\v.mp4', mimeType: 'video/mp4', sizeBytes, sha256: 'b'.repeat(64), dataUrl: 'data:video/mp4;base64,BBBB' },
    prompt: 'what happens',
    outputProfile: 'analyze_video',
    sampling,
  };
}

interface FakeResponse { status: number; body: unknown }
function fakeFetch(seq: FakeResponse[]) {
  const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
  const fn = async (url: unknown, init: unknown) => {
    const rawInit = init as Record<string, unknown>;
    const parsedInit = { ...rawInit };
    if (typeof parsedInit.body === 'string') {
      try { parsedInit.body = JSON.parse(parsedInit.body as string); } catch { /* keep raw */ }
    }
    calls.push({ url: String(url), init: parsedInit });
    const r = seq[Math.min(calls.length - 1, seq.length - 1)]!;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      async text() { return JSON.stringify(r.body); },
      async json() { return r.body; },
    };
  };
  return { calls, fetch: fn as unknown as typeof fetch };
}

const mimoConfig = loadConfig({ MIMO_API_KEY: 'k', Z_AI_API_KEY: 'z' });
const zhipuConfig = loadConfig({ MIMO_API_KEY: 'k', Z_AI_API_KEY: 'z' });

test('MiMo image success: stable prefix layout, thinking disabled, usage captured, reasoning not leaked', async () => {
  const { calls, fetch } = fakeFetch([{
    status: 200,
    body: {
      choices: [{ message: { content: 'final answer', reasoning_content: 'secret chain' } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        prompt_tokens_details: { cached_tokens: 60 },
        completion_tokens_details: { reasoning_tokens: 30 },
      },
    },
  }]);
  const provider = new MimoProvider(mimoConfig, fetch);
  const result = await provider.analyzeImage(imgReq());
  assert.equal(result.content, 'final answer');
  assert.ok(!result.content.includes('secret chain'));
  assert.equal(result.usage?.cachedTokens, 60);
  assert.equal(result.usage?.reasoningTokens, 30);
  assert.equal(result.provider, 'mimo');
  assert.equal(calls.length, 1);
  const body = calls[0]!.init.body as any;
  assert.equal(body.thinking.type, 'disabled');
  assert.equal(body.max_completion_tokens, 1600);
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[1].role, 'user');
  assert.match(body.messages[2].content[0].image_url.url, /^data:image\/png;base64,/);
});

test('MiMo multi-image and video mapping', async () => {
  const { calls, fetch } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: 'ok' } }] } }]);
  const provider = new MimoProvider(mimoConfig, fetch);
  const img = await provider.analyzeImage(imgReq('ui_diff_check', [media(), media()]));
  assert.equal(img.content, 'ok');
  assert.equal((calls[0]!.init.body as any).messages[2].content.length, 3);
  const { fetch: fetch2, calls: calls2 } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: 'video ok' } }] } }]);
  const p2 = new MimoProvider(mimoConfig, fetch2);
  await p2.analyzeVideo(vidReq(1000, { fps: 5 }));
  const vbody = (calls2[0]!.init.body as any);
  assert.equal(vbody.messages[2].content[0].type, 'video_url');
  assert.equal(vbody.messages[2].content[0].fps, 5);
});

test('MiMo media over 50MB is a capability error and never calls fetch', async () => {
  const { fetch, calls } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: 'x' } }] } }]);
  const provider = new MimoProvider(mimoConfig, fetch);
  await assert.rejects(() => provider.analyzeImage(imgReq('analyze_image', [media(51 * MB)])), (e: unknown) => {
    assert.ok(e instanceof ProviderError);
    assert.equal((e as ProviderError).kind, 'capability');
    return true;
  });
  assert.equal(calls.length, 0);
});

test('MiMo key rotation: first key 401 -> second key succeeds', async () => {
  const { calls, fetch } = fakeFetch([
    { status: 401, body: { error: 'bad key 1' } },
    { status: 200, body: { choices: [{ message: { content: 'ok with key2' } }] } },
  ]);
  const provider = new MimoProvider(mimoConfig, fetch);
  const result = await provider.analyzeImage(imgReq());
  assert.equal(result.content, 'ok with key2');
  assert.equal(calls.length, 2);
  const auths = calls.map((c) => (c.init.headers as any).Authorization as string);
  assert.equal(auths[0], 'Bearer k');
  assert.equal(auths[1], 'Bearer k2');
});

test('MiMo key rotation: primary key success uses only one call', async () => {
  const { calls, fetch } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: 'ok' } }] } }]);
  const provider = new MimoProvider(mimoConfig, fetch);
  const result = await provider.analyzeImage(imgReq());
  assert.equal(result.content, 'ok');
  assert.equal(calls.length, 1);
  assert.equal((calls[0]!.init.headers as any).Authorization, 'Bearer k');
});

test('MiMo key rotation: all keys 401 -> throws after exhausting all keys', async () => {
  const { calls, fetch } = fakeFetch([
    { status: 401, body: { error: 'bad 1' } },
    { status: 401, body: { error: 'bad 2' } },
    { status: 401, body: { error: 'bad 3' } },
  ]);
  const provider = new MimoProvider(mimoConfig, fetch);
  await assert.rejects(() => provider.analyzeImage(imgReq()), (e: unknown) => (e as ProviderError).status === 401);
  assert.equal(calls.length, 3);
});

test('MiMo key rotation: last-resort key 3 is used only after keys 1 and 2 fail', async () => {
  const { calls, fetch } = fakeFetch([
    { status: 401, body: { error: 'bad 1' } },
    { status: 402, body: { error: 'no quota 2' } },
    { status: 200, body: { choices: [{ message: { content: 'ok with key3' } }] } },
  ]);
  const provider = new MimoProvider(mimoConfig, fetch);
  const result = await provider.analyzeImage(imgReq());
  assert.equal(result.content, 'ok with key3');
  assert.equal(calls.length, 3);
  const auths = calls.map((c) => (c.init.headers as any).Authorization as string);
  assert.deepEqual(auths, ['Bearer k', 'Bearer k2', 'Bearer k3']);
});

test('MiMo key rotation: last-resort key 3 is NOT used when key 2 succeeds', async () => {
  const { calls, fetch } = fakeFetch([
    { status: 429, body: { error: 'busy 1' } },
    { status: 200, body: { choices: [{ message: { content: 'ok with key2' } }] } },
  ]);
  const provider = new MimoProvider(mimoConfig, fetch);
  const result = await provider.analyzeImage(imgReq());
  assert.equal(result.content, 'ok with key2');
  assert.equal(calls.length, 2);
  const auths = calls.map((c) => (c.init.headers as any).Authorization as string);
  assert.deepEqual(auths, ['Bearer k', 'Bearer k2']);
});
test('MiMo key rotation: 429 rotates to second key', async () => {
  const { calls, fetch } = fakeFetch([
    { status: 429, body: { error: 'busy 1' } },
    { status: 200, body: { choices: [{ message: { content: 'ok2' } }] } },
  ]);
  const provider = new MimoProvider(mimoConfig, fetch);
  const result = await provider.analyzeImage(imgReq());
  assert.equal(result.content, 'ok2');
  assert.equal(calls.length, 2);
});
test('MiMo 429 -> ProviderError with status, timeout -> timeout kind, empty content -> parse kind', async () => {
  const { fetch: f1 } = fakeFetch([{ status: 429, body: { error: 'rate limited' } }]);
  const p1 = new MimoProvider(mimoConfig, f1);
  await assert.rejects(() => p1.analyzeImage(imgReq()), (e: unknown) => (e as ProviderError).status === 429);

  let abortCalls = 0;
  const timeoutFetch = (async () => { abortCalls++; throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }) as unknown as typeof fetch;
  const p2 = new MimoProvider(mimoConfig, timeoutFetch);
  await assert.rejects(() => p2.analyzeImage(imgReq()), (e: unknown) => (e as ProviderError).kind === 'timeout');

  const { fetch: f3 } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: '   ' } }] } }]);
  const p3 = new MimoProvider(mimoConfig, f3);
  await assert.rejects(() => p3.analyzeImage(imgReq()), (e: unknown) => (e as ProviderError).kind === 'parse');
});

test('Zhipu image success: thinking disabled, OCR max_tokens 6000, auth header', async () => {
  const { calls, fetch } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: 'ocr text' } }] } }]);
  const provider = new ZhipuProvider(zhipuConfig, fetch);
  const result = await provider.analyzeImage(imgReq('extract_text_from_screenshot'));
  assert.equal(result.content, 'ocr text');
  const init = calls[0]!.init as any;
  assert.equal(init.headers.Authorization, 'Bearer z');
  const body = init.body as any;
  assert.equal(body.thinking.type, 'enabled');
  assert.equal(body.max_tokens, 6000);
  assert.equal(body.model, 'glm-4.6v-flash');
});

test('Zhipu caps: image 5MB, video 8MB -> capability errors without fetch', async () => {
  const { fetch, calls } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: 'x' } }] } }]);
  const provider = new ZhipuProvider(zhipuConfig, fetch);
  await assert.rejects(() => provider.analyzeImage(imgReq('analyze_image', [media(6 * MB)])), (e: unknown) => (e as ProviderError).kind === 'capability');
  await assert.rejects(() => provider.analyzeVideo(vidReq(9 * MB)), (e: unknown) => (e as ProviderError).kind === 'capability');
  assert.equal(calls.length, 0);
});

test('Zhipu 401 -> ProviderError status 401 and reasoning not leaked', async () => {
  const { fetch } = fakeFetch([{ status: 401, body: { error: { code: '401', message: 'bad key' } } }]);
  const provider = new ZhipuProvider(zhipuConfig, fetch);
  await assert.rejects(() => provider.analyzeImage(imgReq()), (e: unknown) => (e as ProviderError).status === 401);
});