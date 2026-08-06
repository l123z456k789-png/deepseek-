import { ProviderError } from './errors.ts';
import { log } from '../logger.ts';

export interface PostJsonOptions {
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  extraHeaders?: Record<string, string>;
}

export async function postJson(url: string, body: unknown, opts: PostJsonOptions): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const response = await (opts.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
        ...opts.extraHeaders,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      log('warn', 'provider http error', { status: response.status, bodyPreview: text.slice(0, 300) });
      throw new ProviderError(`HTTP ${response.status}: ${text.slice(0, 500)}`, 'http', response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError(`Request timeout after ${opts.timeoutMs}ms`, 'timeout');
    }
    throw new ProviderError(`Network error: ${error instanceof Error ? error.message : String(error)}`, 'http');
  } finally {
    clearTimeout(timer);
  }
}