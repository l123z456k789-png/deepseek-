import type { ProviderCapabilities, ProviderId } from './types.ts';

export const MIMO_CAPABILITIES: ProviderCapabilities = {
  id: 'mimo',
  singleImage: true,
  multiImage: true,
  video: true,
  mixedImageVideo: false,
  imageMaxMb: 50,
  videoMaxMb: 50,
  contextTokens: 1_000_000,
  thinkingDisableSupported: 'unknown',
};

export const ZHIPU_CAPABILITIES: ProviderCapabilities = {
  id: 'zhipu',
  singleImage: true,
  multiImage: true,
  video: true,
  mixedImageVideo: false,
  imageMaxMb: 5,
  videoMaxMb: 8,
  contextTokens: 131_072,
  thinkingDisableSupported: 'yes',
};

export function getProviderCapabilities(id: ProviderId): ProviderCapabilities {
  return id === 'mimo' ? MIMO_CAPABILITIES : ZHIPU_CAPABILITIES;
}