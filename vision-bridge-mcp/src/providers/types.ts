export type ProviderId = 'mimo' | 'zhipu';

export interface MediaRef {
  path: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  dataUrl?: string | null;
}

export interface ImageRequest {
  tool: string;
  images: MediaRef[];
  prompt: string;
  outputProfile: string;
  outputType?: string;
}

export interface VideoRequest {
  tool: string;
  outputType?: string;
  video: MediaRef;
  prompt: string;
  outputProfile: string;
  sampling?: { fps?: number; maxFrames?: number };
}

export interface ProviderUsage {
  promptTokens?: number;
  cachedTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
}

export interface ProviderResult {
  provider: ProviderId;
  content: string;
  usage?: ProviderUsage;
  latencyMs: number;
}

export interface ProviderCapabilities {
  id: ProviderId;
  singleImage: boolean;
  multiImage: boolean;
  video: boolean;
  mixedImageVideo: boolean;
  imageMaxMb: number;
  videoMaxMb: number;
  contextTokens: number;
  thinkingDisableSupported: 'yes' | 'unknown' | 'no';
}

export interface VisionProvider {
  id: ProviderId;
  capabilities: ProviderCapabilities;
  analyzeImage(req: ImageRequest): Promise<ProviderResult>;
  analyzeVideo(req: VideoRequest): Promise<ProviderResult>;
  mapImageRequest(req: ImageRequest): unknown;
  mapVideoRequest(req: VideoRequest): unknown;
}