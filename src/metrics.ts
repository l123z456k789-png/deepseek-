import type { ProviderUsage } from './providers/types.ts';

class Metrics {
  private m = {
    mimoCalls: 0,
    zhipuCalls: 0,
    singleflightDeduped: 0,
    mediaCacheHits: 0,
    mediaCacheMisses: 0,
    resultCacheHits: 0,
    resultCacheMisses: 0,
    promptTokens: 0,
    cachedTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    latencyMsSum: 0,
    callCount: 0,
  };

  recordProviderCall(id: 'mimo' | 'zhipu'): void {
    if (id === 'mimo') this.m.mimoCalls += 1;
    else this.m.zhipuCalls += 1;
  }

  recordUsage(usage?: ProviderUsage): void {
    if (!usage) return;
    this.m.promptTokens += usage.promptTokens ?? 0;
    this.m.cachedTokens += usage.cachedTokens ?? 0;
    this.m.completionTokens += usage.completionTokens ?? 0;
    this.m.reasoningTokens += usage.reasoningTokens ?? 0;
  }

  recordLatency(latencyMs: number): void {
    this.m.latencyMsSum += latencyMs;
    this.m.callCount += 1;
  }

  add(key: 'singleflightDeduped' | 'mediaCacheHits' | 'mediaCacheMisses' | 'resultCacheHits' | 'resultCacheMisses', delta: number): void {
    this.m[key] += delta;
  }

  snapshot() {
    return { ...this.m, averageLatencyMs: this.m.callCount > 0 ? Math.round(this.m.latencyMsSum / this.m.callCount) : 0 };
  }

  reset(): void {
    for (const k of Object.keys(this.m) as Array<keyof typeof this.m>) {
      this.m[k] = 0;
    }
  }
}

export const metrics = new Metrics();