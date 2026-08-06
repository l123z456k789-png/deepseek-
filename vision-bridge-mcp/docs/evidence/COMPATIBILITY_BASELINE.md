# 上游兼容基线（P0 证据）

- 生成时间: 2026-08-06
- 方法: npm pack 固定版本 + 本地 stdio JSON-RPC 黑盒探针（scripts/upstream-probe.mjs）
- 探针真实调用: 8 个工具各 1 次（Zhipu glm-4.6v-flash，免费额度）；错误样例 3 个

## 上游包固定

```text
UPSTREAM_VERSION_PINNED=PASS
UPSTREAM_PACKAGE=@z_ai/mcp-server@0.1.4
UPSTREAM_TARBALL=z_ai-mcp-server-0.1.4.tgz
UPSTREAM_TARBALL_SHA256=09E588A868F1C2B4DADE10F11AEE8D232F9E43E5C7BCEEE087635ACEDF37275C
UPSTREAM_LICENSE=Apache-2.0
UPSTREAM_ENTRY=build/index.js (type=module, node>=18)
UPSTREAM_DEPENDENCIES=zod ^3.23.8, @modelcontextprotocol/sdk 1.26.0
```

tarball 只存在于 `.audit/`（gitignored），不提交；未安装到全局。

## 上游环境变量契约

```text
Z_AI_API_KEY         必填，启动时校验（缺失即抛错退出）
Z_AI_MODE            ZHIPU（默认 ZHIPU；Z_AI/ZAI/Z 切到 api.z.ai）
Z_AI_VISION_MODEL    默认 glm-4.6v；本机实际配置 glm-4.6v-flash
Z_AI_TIMEOUT         默认 300000 ms
Z_AI_RETRY_COUNT     默认 1（工具层另有 withRetry 2 次）
Z_AI_VISION_MODEL_MAX_TOKENS 默认 32768
Z_AI_VISION_MODEL_TEMPERATURE 默认 0.8
Z_AI_VISION_MODEL_TOP_P 默认 0.6
请求体固定: thinking={type:enabled}, stream=false
```

## 工具协议（tools-list 快照）

```text
TOOL_COUNT=8
TOOL_NAMES_CAPTURED=8_OF_8
TOOL_SCHEMAS_CAPTURED=8_OF_8
```

| 工具 | 必填参数 | 可选参数 |
|---|---|---|
| analyze_image | image_source, prompt | - |
| extract_text_from_screenshot | image_source, prompt | programming_language |
| diagnose_error_screenshot | image_source, prompt | context |
| understand_technical_diagram | image_source, prompt | diagram_type |
| analyze_data_visualization | image_source, prompt | analysis_focus |
| ui_diff_check | expected_image_source, actual_image_source, prompt | - |
| ui_to_artifact | image_source, output_type(code/prompt/spec/description), prompt | - |
| analyze_video | video_source, prompt | - |

```text
UI_DIFF_SCHEMA_CAPTURED=PASS
ANALYZE_VIDEO_SCHEMA_CAPTURED=PASS
RETURN_SHAPES_CLASSIFIED=PASS
STDOUT_BEHAVIOR_CAPTURED=PASS
```

## 返回与错误形状

- 成功: `result.content[0].type=text`，无 `isError`；正文为纯文本或 JSON 字符串。
- 参数校验失败（缺字段）: MCP 层 JSON-RPC error `-32602`（SDK schema 校验）。
- 本地路径不存在: 工具结果 `isError=true`，正文 `Error: Image file not found: ...` / `Error: Video file not found: ...`。
- Provider 错误（401 等）: 工具结果 `isError=true`，正文 `Error: Unexpected error: ... HTTP 401: ...`。
- `stdout` 纯净: 探针仅收到合法 JSON-RPC 行；上游日志经 setupConsoleRedirection 重定向，不污染 stdout。

## 文件输入语义（上游实测）

```text
图片: 仅 .jpg/.jpeg/.png；本地文件 ≤5MB；转 data:{mime};base64,...
视频: 描述支持 MP4/MOV/M4V；本地文件 ≤8MB（代码未校验扩展名）；转 data:{mime};base64,...
公网 URL: 原样透传，不转 Base64
```

注意：上游图片扩展名限制比 MCP 描述更窄（webp/gif/bmp 会被拒）；bridge 的 GLM fallback 需要保留该行为，MiMo primary 按 50MB 规则处理。

## 固定测试素材（tests/fixtures/media）

sample-text.png（文字+错误文本）、sample-ui.png、sample-ui-expected.png、sample-ui-actual.png（UI 对比）、sample-diagram.png（技术图）、sample-chart.png（柱状图）、sample-video.mp4（2s testsrc，13.8KB）。

## Fixtures 清单

```text
tests/fixtures/upstream/initialize.json
tests/fixtures/upstream/tools-list.json
tests/fixtures/upstream/tool-results/analyze_image.json
tests/fixtures/upstream/tool-results/extract_text_from_screenshot.json
tests/fixtures/upstream/tool-results/diagnose_error_screenshot.json
tests/fixtures/upstream/tool-results/understand_technical_diagram.json
tests/fixtures/upstream/tool-results/analyze_data_visualization.json
tests/fixtures/upstream/tool-results/ui_diff_check.json
tests/fixtures/upstream/tool-results/ui_to_artifact.json
tests/fixtures/upstream/tool-results/analyze_video.json
tests/fixtures/upstream/tool-errors/analyze_image-missing-prompt.json
tests/fixtures/upstream/tool-errors/analyze_image-path-not-found.json
tests/fixtures/upstream/tool-errors/analyze_image-invalid-key.json
```

## 缺口与说明

- 正常返回 fixture 8/8，错误 fixture 覆盖缺字段、路径不存在、无效 Key（401）。
- 上游视频真实调用成功（MP4，2 秒），fixture 已保存。
- 未触发: 429、503、超时等（需要故障注入，P5 mock 阶段覆盖；上游本身有 retry 逻辑）。
- 上游响应未暴露 usage/reasoning 字段给 MCP（只返回 content 文本）；bridge 需要自行采集。