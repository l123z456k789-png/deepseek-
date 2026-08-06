import type { AppConfig } from '../config.ts';
import { MimoProvider } from '../providers/mimo.ts';
import { ZhipuProvider } from '../providers/zhipu.ts';
import { ProviderError } from '../providers/errors.ts';
import { bumpProviderCall } from '../providers/counter.ts';
import { decide } from './error-policy.ts';
import { CircuitBreaker } from './circuit-breaker.ts';
import { SerialRateLimiter } from './rate-limit.ts';
import { log } from '../logger.ts';
import { SingleFlight } from '../cache/singleflight.ts';
import { ResultCache } from '../cache/result-cache.ts';
import { metrics } from '../metrics.ts';
import type { ImageRequest, ProviderResult, VideoRequest, VisionProvider } from '../providers/types.ts';

export interface RouterDeps {
  mimo?: VisionProvider;
  zhipu?: VisionProvider;
}

export interface RoutedResult {
  result: ProviderResult;
  fallbackUsed: boolean;
  primaryAttempted: boolean;
}

export interface VisionRouter {
  analyzeImage(req: ImageRequest): Promise<RoutedResult>;
  analyzeVideo(req: VideoRequest): Promise<RoutedResult>;
}

type Kind = 'image' | 'video';

export function createRouter(config: AppConfig, deps: RouterDeps = {}): VisionRouter {
  const mimo = deps.mimo ?? new MimoProvider(config);
  const zhipu = deps.zhipu ?? new ZhipuProvider(config);
  const breaker = new CircuitBreaker();
  const zhipuLimiter = new SerialRateLimiter(5000);
  const singleflight = new SingleFlight();
  const resultCache = new ResultCache({ enabled: config.resultCacheEnabled });

  function requestKey(provider: 'mimo' | 'zhipu', kind: Kind, req: ImageRequest | VideoRequest): string {
    const shas = kind === 'image'
      ? (req as ImageRequest).images.map((i) => i.sha256).join(',')
      : (req as VideoRequest).video.sha256;
    const model = provider === 'mimo' ? config.primaryModel : config.zhipuModel;
    return resultCache.key({ kind, tool: req.tool, outputType: req.outputType, mediaShas: shas, prompt: req.prompt, model });
  }

  function recordResult(result: ProviderResult): void {
    metrics.recordProviderCall(result.provider);
    metrics.recordUsage(result.usage);
    metrics.recordLatency(result.latencyMs);
    log('info', 'provider result', {
      provider: result.provider,
      latencyMs: result.latencyMs,
      promptTokens: result.usage?.promptTokens ?? 0,
      cachedTokens: result.usage?.cachedTokens ?? 0,
      completionTokens: result.usage?.completionTokens ?? 0,
      reasoningTokens: result.usage?.reasoningTokens ?? 0,
    });
  }

  async function runZhipu(kind: Kind, req: ImageRequest | VideoRequest): Promise<ProviderResult> {
    if (!breaker.allow('zhipu')) {
      throw new ProviderError('Zhipu cooling down or disabled', 'http', 429);
    }
    const cacheKey = requestKey('zhipu', kind, req);
    const cached = resultCache.get(cacheKey);
    if (cached) return cached;
    const dedupBefore = singleflight.stats().deduped;
    const result = await zhipuLimiter.run(() => singleflight.run(cacheKey, async () => {
      bumpProviderCall('zhipu');
      const r = kind === 'image' ? await zhipu.analyzeImage(req as ImageRequest) : await zhipu.analyzeVideo(req as VideoRequest);
      recordResult(r);
      return r;
    }));
    metrics.add('singleflightDeduped', singleflight.stats().deduped - dedupBefore);
    resultCache.set(cacheKey, result);
    return result;
  }

  async function run(kind: Kind, req: ImageRequest | VideoRequest): Promise<RoutedResult> {
    let primaryAttempted = false;
    let lastPrimaryError: unknown = null;

    if (config.keys.mimo.present && breaker.allow('mimo')) {
      const cacheKey = requestKey('mimo', kind, req);
      const cached = resultCache.get(cacheKey);
      if (cached) {
        return { result: cached, fallbackUsed: false, primaryAttempted: true };
      }
      try {
        const dedupBefore = singleflight.stats().deduped;
        const result = await singleflight.run(cacheKey, async () => {
          bumpProviderCall('mimo');
          const r = kind === 'image' ? await mimo.analyzeImage(req as ImageRequest) : await mimo.analyzeVideo(req as VideoRequest);
          recordResult(r);
          return r;
        });
        metrics.add('singleflightDeduped', singleflight.stats().deduped - dedupBefore);
        resultCache.set(cacheKey, result);
        primaryAttempted = true;
        breaker.recordSuccess('mimo');
        return { result, fallbackUsed: false, primaryAttempted };
      } catch (error) {
        primaryAttempted = true;
        lastPrimaryError = error;
        const decision = decide(error instanceof ProviderError ? error : new ProviderError(String(error)));
        breaker.recordFailure('mimo', decision);
        log('warn', 'primary failed', { error: error instanceof Error ? error.message : String(error), decision });
        if (decision.retry) {
          try {
            const dedupBefore = singleflight.stats().deduped;
            const result = await singleflight.run(cacheKey, async () => {
              bumpProviderCall('mimo');
              const r = kind === 'image' ? await mimo.analyzeImage(req as ImageRequest) : await mimo.analyzeVideo(req as VideoRequest);
              recordResult(r);
              return r;
            });
            metrics.add('singleflightDeduped', singleflight.stats().deduped - dedupBefore);
            resultCache.set(cacheKey, result);
            breaker.recordSuccess('mimo');
            return { result, fallbackUsed: false, primaryAttempted };
          } catch (retryError) {
            lastPrimaryError = retryError;
            const d2 = decide(retryError instanceof ProviderError ? retryError : new ProviderError(String(retryError)));
            breaker.recordFailure('mimo', d2);
          }
        }
      }
    }

    try {
      const result = await runZhipu(kind, req);
      return { result, fallbackUsed: true, primaryAttempted };
    } catch (fallbackError) {
      const decision = decide(fallbackError instanceof ProviderError ? fallbackError : new ProviderError(String(fallbackError)));
      breaker.recordFailure('zhipu', decision);
      const fallbackStatus = fallbackError instanceof ProviderError ? fallbackError.status : undefined;
      throw new ProviderError(
        `All providers failed. Primary: ${lastPrimaryError instanceof Error ? lastPrimaryError.message : String(lastPrimaryError)}; Fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        'http',
        fallbackStatus,
      );
    }
  }

  return {
    analyzeImage: (req) => run('image', req),
    analyzeVideo: (req) => run('video', req),
  };
}