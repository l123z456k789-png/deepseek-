import { ProviderError } from '../providers/errors.ts';

export interface ErrorDecision {
  retry: boolean;
  fallback: boolean;
  cooldownMs: number;
  disableProvider: boolean;
}

export function decide(error: ProviderError): ErrorDecision {
  switch (error.kind) {
    case 'config':
      return { retry: false, fallback: true, cooldownMs: 0, disableProvider: false };
    case 'capability':
      return { retry: false, fallback: true, cooldownMs: 0, disableProvider: false };
    case 'timeout':
      return { retry: false, fallback: true, cooldownMs: 10_000, disableProvider: false };
    case 'parse':
      return { retry: true, fallback: true, cooldownMs: 10_000, disableProvider: false };
    case 'http':
      if (error.status === undefined) {
        // 连接重置/网络类瞬时错误
        return { retry: true, fallback: true, cooldownMs: 5_000, disableProvider: false };
      }
      switch (error.status) {
        case 429:
          return { retry: false, fallback: true, cooldownMs: 60_000, disableProvider: false };
        case 401:
        case 403:
          return { retry: false, fallback: true, cooldownMs: 0, disableProvider: true };
        case 402:
          return { retry: false, fallback: true, cooldownMs: 1_800_000, disableProvider: false };
        case 404:
          return { retry: false, fallback: true, cooldownMs: 1_800_000, disableProvider: false };
        case 502:
        case 503:
        case 504:
          return { retry: true, fallback: true, cooldownMs: 10_000, disableProvider: false };
        default:
          return { retry: false, fallback: true, cooldownMs: 10_000, disableProvider: false };
      }
    default:
      return { retry: false, fallback: true, cooldownMs: 10_000, disableProvider: false };
  }
}