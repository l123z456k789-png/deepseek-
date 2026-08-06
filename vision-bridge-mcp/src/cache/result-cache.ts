import type { ProviderResult } from '../providers/types.ts';
import { metrics } from '../metrics.ts';

interface Entry {
  value: ProviderResult;
  expiresAt: number;
}

export interface ResultCacheOptions {
  enabled?: boolean;
  ttlMs?: number;
  maxEntries?: number;
}

export class ResultCache {
  private entries = new Map<string, Entry>();
  readonly enabled: boolean;
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(opts: ResultCacheOptions = {}) {
    this.enabled = opts.enabled ?? false;
    this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
    this.maxEntries = opts.maxEntries ?? 16;
  }

  key(parts: { kind: string; tool: string; outputType?: string; mediaShas: string; prompt: string; model: string }): string {
    return `${parts.kind}|${parts.tool}|${parts.outputType ?? ''}|${parts.mediaShas}|${parts.prompt}|v1|${parts.model}`;
  }

  get(key: string): ProviderResult | null {
    if (!this.enabled) return null;
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      metrics.add('resultCacheHits', 1);
      return entry.value;
    }
    if (entry) this.entries.delete(key);
    metrics.add('resultCacheMisses', 1);
    return null;
  }

  set(key: string, value: ProviderResult): void {
    if (!this.enabled) return;
    this.evict();
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  private evict(): void {
    const now = Date.now();
    for (const [k, e] of this.entries) {
      if (e.expiresAt <= now) this.entries.delete(k);
    }
    while (this.entries.size >= this.maxEntries) {
      const firstKey = this.entries.keys().next().value as string | undefined;
      if (firstKey === undefined) break;
      this.entries.delete(firstKey);
    }
  }

  stats(): { size: number } {
    return { size: this.entries.size };
  }

  clear(): void {
    this.entries.clear();
  }
}