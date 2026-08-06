import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OCR_TRUNCATION_MARKER,
  TOOL_PROFILES,
  UI_TO_ARTIFACT_MAX_OUTPUT_TOKENS,
  VIDEO_MAX_OUTPUT_TOKENS,
  getToolPrompt,
  videoBudgetForDuration,
} from '../../src/prompts/registry.ts';
import { UI_TO_ARTIFACT_PROMPTS } from '../../src/generated/upstream-prompts.ts';

const EXPECTED_TOOLS = [
  'analyze_image',
  'extract_text_from_screenshot',
  'diagnose_error_screenshot',
  'understand_technical_diagram',
  'analyze_data_visualization',
  'ui_diff_check',
  'ui_to_artifact',
  'analyze_video',
];

test('all 8 tools have explicit maxOutputTokens and no tool is unlimited', () => {
  assert.equal(Object.keys(TOOL_PROFILES).length, 8);
  for (const name of EXPECTED_TOOLS) {
    const p = TOOL_PROFILES[name]!;
    assert.ok(Number.isInteger(p.maxOutputTokens) && p.maxOutputTokens > 0, `${name} maxOutputTokens`);
    assert.equal(p.version, 'v1');
  }
});

test('every tool has a non-trivial upstream prompt (reused from 0.1.4)', () => {
  for (const name of EXPECTED_TOOLS) {
    const p = TOOL_PROFILES[name]!;
    assert.ok(p.prompt.length > 200, `${name} prompt length`);
  }
  assert.ok(Object.keys(UI_TO_ARTIFACT_PROMPTS).length >= 4, 'ui_to_artifact has 4 variants');
  assert.equal(getToolPrompt('ui_to_artifact', 'code'), UI_TO_ARTIFACT_PROMPTS.code);
  assert.equal(getToolPrompt('ui_to_artifact'), UI_TO_ARTIFACT_PROMPTS.description);
});

test('hard caps: video <= 4000, ui_to_artifact <= 5000, OCR default 6000', () => {
  assert.ok(TOOL_PROFILES.analyze_video!.maxOutputTokens <= VIDEO_MAX_OUTPUT_TOKENS);
  assert.equal(VIDEO_MAX_OUTPUT_TOKENS, 4000);
  assert.ok(TOOL_PROFILES.ui_to_artifact!.maxOutputTokens <= UI_TO_ARTIFACT_MAX_OUTPUT_TOKENS);
  assert.equal(UI_TO_ARTIFACT_MAX_OUTPUT_TOKENS, 5000);
  assert.equal(TOOL_PROFILES.extract_text_from_screenshot!.maxOutputTokens, 6000);
  assert.match(OCR_TRUNCATION_MARKER, /\[OCR output truncated: token limit reached\]/);
});

test('video budget tiers', () => {
  assert.equal(videoBudgetForDuration(30), 1600);
  assert.equal(videoBudgetForDuration(60), 1600);
  assert.equal(videoBudgetForDuration(120), 2400);
  assert.equal(videoBudgetForDuration(300), 2400);
  assert.equal(videoBudgetForDuration(600), 3200);
});

test('profiles are provider-agnostic (single source of truth)', () => {
  for (const name of EXPECTED_TOOLS) {
    const p = TOOL_PROFILES[name]!;
    assert.equal(p.systemPrompt, TOOL_PROFILES.analyze_image!.systemPrompt);
    assert.ok(!('provider' in p));
  }
});