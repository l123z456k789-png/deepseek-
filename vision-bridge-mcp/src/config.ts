export interface KeyStatus {
  present: boolean;
  source: string | null;
}

export interface AppConfig {
  keys: { mimo: KeyStatus; zhipu: KeyStatus };
  primaryModel: string;
  mimoTimeoutMs: number;
  mimoMaxRetries: number;
  zhipuTimeoutMs: number;
  zhipuMode: string;
  zhipuModel: string;
  zhipuThinking: 'enabled' | 'disabled';
  mediaMaxMb: number;
  localCacheEnabled: boolean;
  resultCacheEnabled: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const present = (v: string | undefined): boolean => v !== undefined && v.trim() !== '';
  return {
    keys: {
      mimo: {
        present: present(env.MIMO_API_KEY) || present(env.MIMO_API_KEY_2) || present(env.MIMO_API_KEY_3),
        source: present(env.MIMO_API_KEY) ? 'env' : present(env.MIMO_API_KEY_2) ? 'env2' : present(env.MIMO_API_KEY_3) ? 'env3' : null,
      },
      zhipu: { present: present(env.Z_AI_API_KEY), source: present(env.Z_AI_API_KEY) ? 'env' : null },
    },
    primaryModel: env.VISION_PRIMARY_MODEL?.trim() || 'mimo-v2.5',
    mimoTimeoutMs: Number(env.VISION_MIMO_TIMEOUT_MS || 120000),
    mimoMaxRetries: Number(env.VISION_MIMO_MAX_RETRIES || 1),
    zhipuTimeoutMs: Number(env.VISION_ZHIPU_TIMEOUT_MS || 300000),
    zhipuMode: env.Z_AI_MODE?.trim() || 'ZHIPU',
    zhipuModel: env.Z_AI_VISION_MODEL?.trim() || 'glm-4.6v-flash',
    zhipuThinking: env.VISION_ZHIPU_THINKING?.trim() === 'disabled' ? 'disabled' : 'enabled',
    mediaMaxMb: Number(env.VISION_MAX_MEDIA_MB || 100),
    localCacheEnabled: env.VISION_LOCAL_CACHE?.trim() !== 'false',
    resultCacheEnabled: env.VISION_RESULT_CACHE?.trim() === 'true',
  };
}