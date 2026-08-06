import { loadConfig } from '../dist/config.js';
import { createRouter } from '../dist/routing/router.js';
import { prepareMediaInput } from '../dist/file-input.js';
import { ProviderError } from '../dist/providers/errors.js';
import { fileURLToPath } from 'node:url';

const REAL_API_TESTS = process.env.REAL_API_TESTS === '1';
if (!REAL_API_TESTS) {
  console.log('SKIP: REAL_API_TESTS != 1 (opt-in)');
  process.exit(0);
}
const png = prepareMediaInput(fileURLToPath(new URL('../tests/fixtures/media/sample-text.png', import.meta.url)), 'image', { includeDataUrl: true });
const mp4 = prepareMediaInput(fileURLToPath(new URL('../tests/fixtures/media/sample-video.mp4', import.meta.url)), 'video', { includeDataUrl: true });
const config = loadConfig();
const router = createRouter(config);

async function withRetry(label, fn, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const status = e instanceof ProviderError ? e.status : undefined;
      if (status === 429 && i < attempts) {
        console.log(`${label}: 429, attempt ${i}, waiting 20s...`);
        await new Promise((r) => setTimeout(r, 65000));
        continue;
      }
      return { ok: false, error: String(e) };
    }
  }
}

const results = {};
const img = await withRetry('ZHIPU_IMAGE', () => router.analyzeImage({ tool: 'analyze_image', images: [png], prompt: 'Describe this image in one sentence.', outputProfile: 'analyze_image' }));
results.ZHIPU_IMAGE = img.ok !== false
  ? { ok: true, content: img.result.content.slice(0, 120), latencyMs: img.result.latencyMs, fallbackUsed: img.fallbackUsed, usage: img.result.usage ?? null }
  : img;

const vid = await withRetry('ZHIPU_VIDEO', () => router.analyzeVideo({ tool: 'analyze_video', video: mp4, prompt: 'What happens in the video?', outputProfile: 'analyze_video' }));
results.ZHIPU_VIDEO = vid.ok !== false
  ? { ok: true, content: vid.result.content.slice(0, 120), latencyMs: vid.result.latencyMs, fallbackUsed: vid.fallbackUsed, usage: vid.result.usage ?? null }
  : vid;

if (config.keys.mimo.present) {
  const mimo = await withRetry('MIMO_IMAGE', () => router.analyzeImage({ tool: 'analyze_image', images: [png], prompt: 'Describe this image in one sentence.', outputProfile: 'analyze_image' }));
  const mimoVideo = await withRetry('MIMO_VIDEO', () => router.analyzeVideo({ tool: 'analyze_video', video: mp4, prompt: 'What happens in the video?', outputProfile: 'analyze_video' }));
  results.MIMO_VIDEO = mimoVideo.ok !== false
    ? { ok: true, content: mimoVideo.result.content.slice(0, 120), latencyMs: mimoVideo.result.latencyMs, fallbackUsed: mimoVideo.fallbackUsed, usage: mimoVideo.result.usage ?? null }
    : mimoVideo;
  results.MIMO_IMAGE = mimo.ok !== false
    ? { ok: true, content: mimo.result.content.slice(0, 120), latencyMs: mimo.result.latencyMs, fallbackUsed: mimo.fallbackUsed, usage: mimo.result.usage ?? null }
    : mimo;
} else {
  results.MIMO_IMAGE = { ok: false, reason: 'SKIP_WITH_REASON: MIMO_API_KEY not set' };
}

console.log(JSON.stringify(results, null, 2));