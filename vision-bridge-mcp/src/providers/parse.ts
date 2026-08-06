import { ProviderError } from './errors.ts';
import type { ProviderId, ProviderResult } from './types.ts';

interface ChatData {
  choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

export function parseChatResult(data: unknown, provider: ProviderId, latencyMs: number): ProviderResult {
  const d = data as ChatData;
  const content = d.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new ProviderError('Empty or missing content in provider response', 'parse');
  }
  return {
    provider,
    content,
    latencyMs,
    usage: {
      promptTokens: d.usage?.prompt_tokens,
      cachedTokens: d.usage?.prompt_tokens_details?.cached_tokens,
      completionTokens: d.usage?.completion_tokens,
      reasoningTokens: d.usage?.completion_tokens_details?.reasoning_tokens,
    },
  };
}