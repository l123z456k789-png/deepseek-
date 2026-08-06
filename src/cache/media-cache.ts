import { statSync } from 'node:fs';
import { prepareMediaInput, type MediaType, type PreparedMedia } from '../file-input.ts';
import { metrics } from '../metrics.ts';

interface CacheEntry {
  media: PreparedMedia;
  expiresAt: number;
  bytes: number;
}

export interface MediaCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  maxTotalBytes?: number;
  videoBase64Cache?: boolean;
}

export class MediaCache {
  private entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly maxTotalBytes: number;
  private readonly videoBase64Cache: boolean;

  constructor(opts: MediaCacheOptions = {}) {
    this.ttlMs = opts.ttlMs ?? 10 * 60 * 1000;
    this.maxEntries = opts.maxEntries ?? 32;
    this.maxTotalBytes = opts.maxTotalBytes ?? 64 * 1024 * 1024;
    this.videoBase64Cache = opts.videoBase64Cache ?? false;
  }

  prepare(rawPath: string, type: MediaType, opts: { maxSizeMb?: number; includeDataUrl?: boolean } = {}): PreparedMedia {
    const includeDataUrl = opts.includeDataUrl ?? false;
    const trimmed = rawPath.trim();
    let stats;
    try {
      stats = statSync(trimmed);
    } catch {
      // 让 prepareMediaInput 抛出标准错误
      return prepareMediaInput(rawPath, type, { maxSizeMb: opts.maxSizeMb, includeDataUrl });
    }
    const key = `${trimmed}|${stats.mtimeMs}|${stats.size}`;
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > Date.now() && (!includeDataUrl || hit.media.dataUrl !== null)) {
      metrics.add('mediaCacheHits', 1);
      return hit.media;
    }
    if (hit) {
      this.entries.delete(key);
    }
    metrics.add('mediaCacheMisses', 1);
    const media = prepareMediaInput(rawPath, type, { maxSizeMb: opts.maxSizeMb, includeDataUrl });
    const storedCopy: PreparedMedia = {
      ...media,
      dataUrl: type === 'image' || this.videoBase64Cache ? media.dataUrl : null,
    };
    this.set(key, storedCopy);
    return media;
  }

  private set(key: string, media: PreparedMedia): void {
    const bytes = media.dataUrl ? media.dataUrl.length : media.sizeBytes;
    this.evict(bytes);
    this.entries.set(key, { media, expiresAt: Date.now() + this.ttlMs, bytes });
  }

  private evict(neededBytes: number): void {
    const now = Date.now();
    for (const [k, e] of this.entries) {
      if (e.expiresAt <= now) this.entries.delete(k);
    }
    let total = 0;
    for (const e of this.entries.values()) total += e.bytes;
    while (this.entries.size >= this.maxEntries || (total + neededBytes > this.maxTotalBytes && this.entries.size > 0)) {
      const firstKey = this.entries.keys().next().value as string | undefined;
      if (firstKey === undefined) break;
      total -= this.entries.get(firstKey)?.bytes ?? 0;
      this.entries.delete(firstKey);
    }
  }

  stats(): { size: number; totalBytes: number } {
    let total = 0;
    for (const e of this.entries.values()) total += e.bytes;
    return { size: this.entries.size, totalBytes: total };
  }

  clear(): void {
    this.entries.clear();
  }
}