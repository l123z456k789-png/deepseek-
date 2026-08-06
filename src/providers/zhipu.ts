import type { AppConfig } from '../config.ts';
import { ZHIPU_CAPABILITIES } from './capabilities.ts';
import { ProviderError } from './errors.ts';
import { postJson } from './http.ts';
import { parseChatResult } from './parse.ts';
import { getToolProfile, getToolPrompt } from '../prompts/registry.ts';
import type { ImageRequest, MediaRef, ProviderId, ProviderResult, VideoRequest, VisionProvider } from './types.ts';

const ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

export class ZhipuProvider implements VisionProvider {
  readonly id: ProviderId = 'zhipu';
  readonly capabilities = ZHIPU_CAPABILITIES;
  private readonly config: AppConfig;
  private readonly fetchImpl?: typeof fetch;

  constructor(config: AppConfig, fetchImpl?: typeof fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  private get apiKey(): string {
    const key = process.env.Z_AI_API_KEY;
    if (!key || key.trim() === '') throw new ProviderError('Z_AI_API_KEY is not set', 'config');
    return key.trim();
  }

  private assertCapability(media: MediaRef[], type: 'image' | 'video'): void {
    const max = type === 'image' ? this.capabilities.imageMaxMb : this.capabilities.videoMaxMb;
    for (const m of media) {
      if (m.sizeBytes > max * 1024 * 1024) {
        throw new ProviderError(`media exceeds Zhipu ${type} limit (${max}MB)`, 'capability');
      }
    }
  }

  private baseBody(tool: string): Record<string, unknown> {
    const profile = getToolProfile(tool);
    return {
      model: this.config.zhipuModel,
      stream: false,
      thinking: { type: this.config.zhipuThinking },
      temperature: 0.8,
      top_p: 0.6,
      max_tokens: profile.maxOutputTokens,
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
            { type: 'video_url', video_url: { url: req.video.dataUrl ?? req.video.path } },
            { type: 'text', text: req.prompt },
          ],
        },
      ],
    };
  }

  async analyzeImage(req: ImageRequest): Promise<ProviderResult> {
    this.assertCapability(req.images, 'image');
    const t0 = Date.now();
    const data = await postJson(ZHIPU_BASE_URL, this.mapImageRequest(req), {
      apiKey: this.apiKey,
      timeoutMs: this.config.zhipuTimeoutMs,
      fetchImpl: this.fetchImpl,
    });
    return parseChatResult(data, 'zhipu', Date.now() - t0);
  }

  async analyzeVideo(req: VideoRequest): Promise<ProviderResult> {
    this.assertCapability([req.video], 'video');
    const t0 = Date.now();
    const data = await postJson(ZHIPU_BASE_URL, this.mapVideoRequest(req), {
      apiKey: this.apiKey,
      timeoutMs: this.config.zhipuTimeoutMs,
      fetchImpl: this.fetchImpl,
    });
    return parseChatResult(data, 'zhipu', Date.now() - t0);
  }
}