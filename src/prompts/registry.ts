import { GLOBAL_SYSTEM_V1, VIDEO_ANALYSIS_PROMPT_V1 } from './versions.ts';
import {
  DATA_VIZ_ANALYSIS_PROMPT,
  DIAGRAM_UNDERSTANDING_PROMPT,
  ERROR_DIAGNOSIS_PROMPT,
  GENERAL_IMAGE_ANALYSIS_PROMPT,
  TEXT_EXTRACTION_PROMPT,
  UI_DIFF_CHECK_PROMPT,
  UI_TO_ARTIFACT_PROMPTS,
} from '../generated/upstream-prompts.ts';

export interface ToolPromptProfile {
  id: string;
  version: string;
  systemPrompt: string;
  outputContract: string;
  maxOutputTokens: number;
  prompt: string;
}

export const OCR_TRUNCATION_MARKER = '[OCR output truncated: token limit reached]';
export const VIDEO_MAX_OUTPUT_TOKENS = 4000;
export const UI_TO_ARTIFACT_MAX_OUTPUT_TOKENS = 5000;

export const TOOL_PROFILES: Record<string, ToolPromptProfile> = {
  analyze_image: {
    id: 'analyze_image', version: 'v1', systemPrompt: GLOBAL_SYSTEM_V1,
    outputContract: 'Give direct conclusion first, then key visual evidence; no irrelevant long descriptions.',
    maxOutputTokens: 1600, prompt: GENERAL_IMAGE_ANALYSIS_PROMPT,
  },
  extract_text_from_screenshot: {
    id: 'extract_text_from_screenshot', version: 'v1', systemPrompt: GLOBAL_SYSTEM_V1,
    outputContract: 'Preserve the original text completely; do not append long explanations.',
    maxOutputTokens: 6000, prompt: TEXT_EXTRACTION_PROMPT,
  },
  diagnose_error_screenshot: {
    id: 'diagnose_error_screenshot', version: 'v1', systemPrompt: GLOBAL_SYSTEM_V1,
    outputContract: 'Focus on error text, root cause, impact, and actionable fix.',
    maxOutputTokens: 2400, prompt: ERROR_DIAGNOSIS_PROMPT,
  },
  understand_technical_diagram: {
    id: 'understand_technical_diagram', version: 'v1', systemPrompt: GLOBAL_SYSTEM_V1,
    outputContract: 'Preserve structure, nodes, connections, and key labels.',
    maxOutputTokens: 2800, prompt: DIAGRAM_UNDERSTANDING_PROMPT,
  },
  analyze_data_visualization: {
    id: 'analyze_data_visualization', version: 'v1', systemPrompt: GLOBAL_SYSTEM_V1,
    outputContract: 'Focus on values, trends, anomalies, axes, and uncertainty.',
    maxOutputTokens: 2400, prompt: DATA_VIZ_ANALYSIS_PROMPT,
  },
  ui_diff_check: {
    id: 'ui_diff_check', version: 'v1', systemPrompt: GLOBAL_SYSTEM_V1,
    outputContract: 'Output by difference location, type, severity, and suggested fix.',
    maxOutputTokens: 2800, prompt: UI_DIFF_CHECK_PROMPT,
  },
  ui_to_artifact: {
    id: 'ui_to_artifact', version: 'v1', systemPrompt: GLOBAL_SYSTEM_V1,
    outputContract: 'Structured output allowed, but do not repeatedly describe the same UI.',
    maxOutputTokens: 5000, prompt: UI_TO_ARTIFACT_PROMPTS.description ?? '',
  },
  analyze_video: {
    id: 'analyze_video', version: 'v1', systemPrompt: GLOBAL_SYSTEM_V1,
    outputContract: 'Extract key events by time segment; do not narrate frame by frame.',
    maxOutputTokens: 3200, prompt: VIDEO_ANALYSIS_PROMPT_V1,
  },
};

export function getToolProfile(name: string): ToolPromptProfile {
  const profile = TOOL_PROFILES[name];
  if (!profile) throw new Error(`unknown tool profile: ${name}`);
  return profile;
}

export function getToolPrompt(name: string, outputType?: string): string {
  if (name === 'ui_to_artifact') {
    return UI_TO_ARTIFACT_PROMPTS[outputType ?? 'description'] ?? UI_TO_ARTIFACT_PROMPTS.description ?? '';
  }
  return getToolProfile(name).prompt;
}

export function videoBudgetForDuration(seconds: number): number {
  if (seconds <= 60) return 1600;
  if (seconds <= 300) return 2400;
  return 3200;
}