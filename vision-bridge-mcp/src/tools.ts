import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_CONTRACTS } from './contracts.ts';
import { MediaInputError, type MediaType } from './file-input.ts';
import { MediaCache } from './cache/media-cache.ts';
import { loadConfig, type AppConfig } from './config.ts';
import { createRouter, type VisionRouter } from './routing/router.ts';
import { log } from './logger.ts';
import type { ImageRequest, MediaRef, VideoRequest } from './providers/types.ts';

const FALLBACK_MARKER = '[vision fallback: MiMo → GLM-4.6V-Flash]';
const mediaCache = new MediaCache({ videoBase64Cache: false });

interface MediaParamSpec {
  param: string;
  type: MediaType;
  errorPrefix: string;
}

const TOOL_MEDIA_PARAMS: Record<string, MediaParamSpec[]> = {
  analyze_image: [{ param: 'image_source', type: 'image', errorPrefix: 'Image' }],
  extract_text_from_screenshot: [{ param: 'image_source', type: 'image', errorPrefix: 'Image' }],
  diagnose_error_screenshot: [{ param: 'image_source', type: 'image', errorPrefix: 'Image' }],
  understand_technical_diagram: [{ param: 'image_source', type: 'image', errorPrefix: 'Image' }],
  analyze_data_visualization: [{ param: 'image_source', type: 'image', errorPrefix: 'Image' }],
  ui_diff_check: [
    { param: 'expected_image_source', type: 'image', errorPrefix: 'Image' },
    { param: 'actual_image_source', type: 'image', errorPrefix: 'Image' },
  ],
  ui_to_artifact: [{ param: 'image_source', type: 'image', errorPrefix: 'Image' }],
  analyze_video: [{ param: 'video_source', type: 'video', errorPrefix: 'Video' }],
};

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function addFallbackMarker(text: string, primaryAttempted: boolean): string {
  if (!primaryAttempted) return text;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return text;
  return `${text}\n${FALLBACK_MARKER}`;
}

export function registerTools(server: McpServer, config: AppConfig = loadConfig(), router: VisionRouter = createRouter(config)): void {
  for (const contract of TOOL_CONTRACTS) {
    server.tool(contract.name, contract.description, contract.shape, async (params) => {
      const p = params as Record<string, unknown>;
      try {
        const specs = TOOL_MEDIA_PARAMS[contract.name] ?? [];
        const media: MediaRef[] = [];
        for (const spec of specs) {
          const value = p[spec.param];
          if (typeof value !== 'string') continue;
          if (isHttpUrl(value)) {
            media.push({ path: value, mimeType: 'application/octet-stream', sizeBytes: 0, sha256: '', dataUrl: null });
            continue;
          }
          const pm = mediaCache.prepare(value, spec.type, { maxSizeMb: config.mediaMaxMb, includeDataUrl: true });
          media.push({ path: pm.normalizedPath, mimeType: pm.mimeType, sizeBytes: pm.sizeBytes, sha256: pm.sha256, dataUrl: pm.dataUrl });
        }
        const prompt = typeof p.prompt === 'string' ? p.prompt : '';
        let result;
        if (contract.name === 'analyze_video') {
          const video = media[0];
          if (!video) throw new MediaInputError('Video source is required');
          const req: VideoRequest = { tool: contract.name, video, prompt, outputProfile: contract.name };
          result = await router.analyzeVideo(req);
        } else {
          if (media.length === 0) throw new MediaInputError('Media source is required');
          const req: ImageRequest = {
            tool: contract.name,
            images: media,
            prompt,
            outputProfile: contract.name,
            outputType: typeof p.output_type === 'string' ? p.output_type : undefined,
          };
          result = await router.analyzeImage(req);
        }
        return {
          content: [{ type: 'text', text: addFallbackMarker(result.result.content, result.fallbackUsed && result.primaryAttempted) }],
        };
      } catch (error) {
        if (error instanceof MediaInputError) {
          log('warn', 'media input rejected', { tool: contract.name, error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true,
          };
        }
        log('error', 'tool handler failed', { tool: contract.name, error: error instanceof Error ? error.message : String(error) });
        return {
          content: [{ type: 'text', text: `Error: API error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    });
  }
}