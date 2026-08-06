import type { AppConfig } from '../config.ts';
import { MIMO_CAPABILITIES } from './capabilities.ts';
import { ProviderError } from './errors.ts';
import { postJson } from './http.ts';
import { parseChatResult } from './parse.ts';
import { getToolProfile, getToolPrompt } from '../prompts/registry.ts';
import { log } from '../logger.ts';
import type { ImageRequest, MediaRef, ProviderId, ProviderResult, VideoRequest, VisionProvider } from './types.ts';

const MIMO_BASE_URL = 'https://api.xiaomimimo.com/v1';

function isRotatableStatus(status?: number): boolean {
  return status === 401 || status === 403 || status === 402 || status === 429;
}

export class MimoProvider implements VisionProvider {
  readonly id: ProviderId = 'mimo';
  readonly capabilities = MIMO_CAPABILITIES;
  private readonly config: AppConfig;
  private readonly fetchImpl?: typeof fetch;

  constructor(config: AppConfig, fetchImpl?: typeof fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  private get apiKeys(): string[] {
    const keys = [process.env.MIMO_API_KEY, process.env.MIMO_API_KEY_2, process.env.MIMO_API_KEY_3]
      .filter((k): k is string => typeof k === 'string' && k.trim() !== '');
    if (keys.length === 0) {
      throw new ProviderError('MIMO_API_KEY / MIMO_API_KEY_2 / MIMO_API_KEY_3 are not set', 'config');
    }
    return keys;
  }

  private assertCapability(media: MediaRef[], type: 'image' | 'video'): void {
    const max = type === 'image' ? this.capabilities.imageMaxMb : this.capabilities.videoMaxMb;
    for (const m of media) {
      if (m.sizeBytes > max * 1024 * 1024) {
        throw new ProviderError(`media exceeds MiMo ${type} limit (${max}MB)`, 'capability');
      }
    }
  }

  private baseBody(tool: string): Record<string, unknown> {
    const profile = getToolProfile(tool);
    return {
      model: this.config.primaryModel,
      stream: false,
      thinking: { type: 'disabled' },
      max_completion_tokens: profile.maxOutputTokens,
    };
  }

  mapImageRequest(req: ImageRequest): unknown {
    this.assertCapability(req.images, 'image');
    const profile = getToolProfile(req.tool);
    return {
      ...this.baseBody(req.tool),
      messages: [
        { role: 'system', content: profile.systemPrompt },
        { role: 'user', content: getToolPrompt(req.tool, req.outputType) },
        {
          role: 'user',
          content: [
            ...req.images.map((i) => ({ type: 'image_url', image_url: { url: i.dataUrl ?? i.path } })),
            { type: 'text', text: req.prompt },
          ],
        },
      ],
    };
  }

  mapVideoRequest(req: VideoRequest): unknown {
    this.assertCapability([req.video], 'video');
    const profile = getToolProfile(req.tool);
    return {
      ...this.baseBody(req.tool),
      messages: [
        { role: 'system', content: profile.systemPrompt },
        { role: 'user', content: getToolPrompt(req.tool, req.outputType) },
        {
          role: 'user',
          content: [
            {
              type: 'video_url',
              video_url: { url: req.video.dataUrl ?? req.video.path },
              fps: req.sampling?.fps ?? 2,
              media_resolution: 'default',
            },
            { type: 'text', text: req.prompt },
          ],
        },
      ],
    };
  }

  private async runWithKeyRotation(kind: 'image' | 'video', req: ImageRequest | VideoRequest, body: unknown): Promise<ProviderResult> {
    const keys = this.apiKeys;
    let lastError: unknown = null;
    for (let i = 0; i < keys.length; i++) {
      try {
        const t0 = Date.now();
        const data = await postJson(`${MIMO_BASE_URL}/chat/completions`, body, {
          apiKey: keys[i]!,
          timeoutMs: this.config.mimoTimeoutMs,
          fetchImpl: this.fetchImpl,
        });
        return parseChatResult(data, 'mimo', Date.now() - t0);
      } catch (error) {
        lastError = error;
        const status = error instanceof ProviderError ? error.status : undefined;
        if (!isRotatableStatus(status) || i === keys.length - 1) {
          throw error;
        }
        log('warn', 'mimo key rotated', { fromIndex: i, toIndex: i + 1, status });
      }
    }
    throw lastError;
  }

  async analyzeImage(req: ImageRequest): Promise<ProviderResult> {
    this.assertCapability(req.images, 'image');
    return this.runWithKeyRotation('image', req, this.mapImageRequest(req));
  }

  async analyzeVideo(req: VideoRequest): Promise<ProviderResult> {
    this.assertCapability([req.video], 'video');
    return this.runWithKeyRotation('video', req, this.mapVideoRequest(req));
  }
}