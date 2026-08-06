# Vision Bridge MCP 实施计划（低 Token / 高缓存命中版）
## MiMo-V2.5 主视觉 + GLM-4.6V-Flash 程序化兜底

> **用途**：以后交给 Claude Code / Codex Agent 执行或修改。  
> **注意**：本文件不是立即执行命令。只有用户明确给出任务模式和阶段后，Agent 才能改文件。  
> **目标优先级**：兼容性 > 可回滚 > 正确 fallback > Agent 成本 > API 成本 > 扩展性。

---

# 0. 缓存稳定前缀：禁止随意改写

> 本节应长期保持字节级稳定。动态任务、SHA、日期、日志和当前状态必须放到文件末尾或单独消息中，以提高 Agent 上下文缓存命中率。

## 0.1 冻结架构

```text
本地图片/视频路径
  ↓
现有 Hook / visual-inspector Skill
  ↓
MCP 外部注册名仍为 zai-vision
  ↓
vision-bridge-mcp
  ├─ Primary: mimo-v2.5
  └─ Fallback: glm-4.6v-flash
```

固定规则：

- 新建薄型 Node.js + TypeScript `stdio` MCP。
- 不修改上游 `@z_ai/mcp-server` 本体。
- 第一版不改 Hook、Skill、MCP namespace 和 8 个工具名。
- MiMo 固定优先；GLM 只在程序确认失败/不适用时调用。
- 禁止让 DeepSeek、Claude、Codex判断图片难度或选择 Provider。
- 禁止双 Provider 默认并发、成功后复核、循环 fallback。
- 同一 MCP 进程内实现两个 Provider；禁止 MCP 调 MCP。
- v1 一次工具调用只做一次独立 completion，不保存 Provider 多轮历史。
- 不向主模型返回 `reasoning_content`，只返回最终 `content`。
- API Key 仅从环境变量读取。
- `stdout` 仅 MCP JSON-RPC；日志写 `stderr` 或脱敏文件。
- 不做 Web UI、数据库、模型投票、评分器或复杂网关。

## 0.2 必须兼容的 8 个工具

```text
analyze_image
extract_text_from_screenshot
diagnose_error_screenshot
understand_technical_diagram
analyze_data_visualization
ui_diff_check
ui_to_artifact
analyze_video
```

兼容范围：

```text
name
description
inputSchema
required/enum/default
返回 content 形状
错误形状
本地路径/多图/UI 对比/视频参数语义
```

未经上游协议快照，不得猜 Schema。

## 0.3 已确认的本机配置

```text
Claude MCP: ~/.claude.json
Claude Hook: ~/.claude/settings.json
Codex MCP: ~/.codex/config.toml
智谱 Key: Z_AI_API_KEY
小米 Key: MIMO_API_KEY
```

迁移规则：

- Claude 第一版只切 `.claude.json` 中 `mcpServers.zai-vision` 的 command/args/env。
- `.claude/settings.json` Hook 不改。
- Codex `env_vars` 同时包含 `MIMO_API_KEY`、`Z_AI_API_KEY`。
- `setx` 后必须重启终端、Claude Code、Codex。
- 只检查子进程 `KEY_PRESENT=yes/no`，绝不输出 Key。

## 0.4 保守能力矩阵

| 能力 | MiMo | GLM | v1 |
|---|---:|---:|---|
| 单图/多图 | 支持 | 支持 | 允许 |
| 视频 | 支持 | 支持 | Provider 专属映射 |
| 图片+视频同请求 | 未承诺 | 不支持混合 | 默认禁用 |
| 本地路径 | Bridge 转换 | Provider 映射 | 统一入口 |
| MiMo Base64 单文件 | 50 MB 基线 | 不同规则 | 超限可 fallback |
| 上下文 | 约 1M | 约 128K | GLM 视频必须降采样 |
| thinking/reasoning | 支持，需实测关闭 | Provider 专属 | 默认关闭/剥离 |

---

# 1. Agent 省钱协议

## 1.1 每次任务只读这些

按顺序：

1. 本文件第 0 节；
2. `CURRENT_STATE.md`；
3. 用户本次任务块；
4. `git status --short --branch`；
5. `git diff --stat`；
6. `docs/AGENT_INDEX.md`；
7. 用 `rg` 精确找目标文件。

首次执行例外：

- 如果 `CURRENT_STATE.md` 不存在，不得因为读取失败而跳过状态管理；在用户明确授权执行 P0 后，创建最小版 `CURRENT_STATE.md`。
- 如果 `docs/AGENT_INDEX.md` 不存在，不得扫描全仓来替代索引；在用户明确授权执行 P0 后，创建最小版 `docs/AGENT_INDEX.md`。
- 这两个文件只能在真正开始 P0 时创建；审查计划、修改计划或 `TASK_MODE=REVIEW_ONLY` 时不得创建。
- 首次最小文件只记录已经核实的事实，不得预填未完成阶段、未运行测试或推测性结论。
- 文件创建后，后续任务优先更新原文件，禁止创建 `CURRENT_STATE_2.md`、`AGENT_INDEX_NEW.md` 或其他重复版本。

禁止开局：

- 全仓扫描；
- 重读所有 evidence；
- 读取 `node_modules/dist/coverage`；
- 重新研究已确认架构；
- 重复读取同一完整文件。

大 fixture 用脚本比较，不粘贴全文。

## 1.2 Superpowers 最小使用

- `using-superpowers`：按平台要求。
- `test-driven-development`：写功能/修 Bug。
- `systematic-debugging`：真实失败时。
- `verification-before-completion`：阶段完成前。
- `brainstorming`、`writing-plans`：默认跳过，本文件已经是计划。
- `requesting-code-review`：仅 major phase/最终。
- 并行子 Agent：默认不用。

只有多个任务完全独立、不同文件、无共享状态时才允许子 Agent；传给子 Agent 的上下文必须是精简任务块，不得复制整份计划。

## 1.3 测试预算

```text
L1 单模块测试
L2 当前阶段测试
L3 完整测试
```

规则：

- 开发中跑 L1；
- 阶段完成跑 L2；
- major checkpoint/最终才跑 L3；
- 同一失败机械重跑最多 2 次，之后必须调试；
- 普通测试禁止真实 API；
- 真实 smoke 仅 `REAL_API_TESTS=1`；
- 用户任务块可限制 `MAX_FULL_TEST_RUNS`。

## 1.4 文档与报告预算

长期只维护：

```text
CURRENT_STATE.md
docs/AGENT_INDEX.md
docs/decisions/ARCHITECTURE_DECISIONS.md
docs/SOURCE_REUSE_LEDGER.md
docs/evidence/COMPATIBILITY_BASELINE.md
docs/evidence/CACHE_METRICS.md
```

首次创建最小模板：

`CURRENT_STATE.md` 只包含：

```text
STATUS
CURRENT_PHASE
BRANCH
HEAD
COMPLETED
BLOCKERS
NEXT_ALLOWED_PHASE
LAST_VERIFIED
```

`docs/AGENT_INDEX.md` 只包含：

```text
核心文件路径
每个文件的一行职责
主要入口
定向测试命令
禁止读取目录
权威 evidence 路径
```

`docs/decisions/ARCHITECTURE_DECISIONS.md` 只包含：

```text
ADR 编号
状态
决策
原因
后果
```

不得在首次创建时写长篇项目介绍、复制整份计划或预填不存在的源码路径。

禁止创建重复状态/总结文件。

阶段报告只写：

```text
状态
实际改动
测试证据
Git 状态
阻塞
下一允许阶段
```

普通报告控制在约 100 行内，不复述本计划。

---

# 2. 推荐代码边界

```text
src/
├─ server.ts
├─ contracts.ts
├─ tools.ts
├─ config.ts
├─ file-input.ts
├─ logger.ts
├─ prompts/
│  ├─ registry.ts
│  └─ versions.ts
├─ providers/
│  ├─ types.ts
│  ├─ capabilities.ts
│  ├─ mimo.ts
│  └─ zhipu.ts
├─ routing/
│  ├─ error-policy.ts
│  └─ circuit-breaker.ts
└─ cache/
   ├─ media-cache.ts
   ├─ result-cache.ts
   └─ singleflight.ts
```

后续修改影响范围：

| 修改 | 主要文件 |
|---|---|
| 模型名/endpoint | `config.ts` + 对应 Provider |
| fallback 规则 | `routing/error-policy.ts` |
| 熔断时间 | `circuit-breaker.ts` + config |
| 工具 Prompt | `prompts/registry.ts` + 版本 |
| 能力矩阵 | `providers/capabilities.ts` |
| 媒体限制 | `file-input.ts` + capabilities |
| 缓存 | `cache/*` + config |
| 工具 Schema | `contracts.ts` + contract fixtures |
| Claude/Codex 安装 | `scripts/install-*.ps1` |

禁止把模型名、Prompt、timeout、错误码散落在 8 个 handler 中。

统一 Provider 接口：

```ts
interface VisionProvider {
  id: "mimo" | "zhipu";
  capabilities: ProviderCapabilities;
  analyzeImage(req: ImageRequest): Promise<ProviderResult>;
  analyzeVideo(req: VideoRequest): Promise<ProviderResult>;
  mapImageRequest(req: ImageRequest): unknown;
  mapVideoRequest(req: VideoRequest): unknown;
}
```

统一结果：

```ts
interface ProviderResult {
  content: string;
  usage?: {
    promptTokens?: number;
    cachedTokens?: number;
    completionTokens?: number;
    reasoningTokens?: number;
  };
  latencyMs: number;
}
```

---

# 3. 阶段表

| 阶段 | 目标 | Gate |
|---|---|---|
| P0 | 固定 0.1.4、抓 8 工具协议 | 8/8 fixtures |
| P1 | 最小 MCP、8 工具注册 | initialize/tools-list |
| P2 | 路径、MIME、SHA、Base64 | 非法输入 0 Provider 调用 |
| P3 | MiMo 图片/多图/视频 | mock + opt-in smoke |
| P4 | GLM 兼容实现 | mock + opt-in smoke |
| P5 | retry/fallback/熔断 | 故障注入 |
| P6 | 四层缓存与指标 | 真实计数 |
| P7 | Claude/Codex 安装回滚 | 双端实测 |
| P8 | 最终审查与收口 | READY_TO_USE Gate |

约束：

- Agent 只执行用户明确指定阶段。
- P0 未过不写 Provider。
- P0-P2、Provider mock 不依赖 `MIMO_API_KEY`。
- Key 缺失时真实 smoke = `SKIP_WITH_REASON`。
- P7 前不改真实配置。
- 达到 `STOP_AFTER` 立即停止。

---

# 4. P0：兼容基线

固定：

```text
@z_ai/mcp-server@0.1.4
```

产物：

```text
tests/fixtures/upstream/initialize.json
tests/fixtures/upstream/tools-list.json
tests/fixtures/upstream/tool-results/
tests/fixtures/upstream/tool-errors/
docs/evidence/COMPATIBILITY_BASELINE.md
```

必须捕获：

- tarball SHA-256、许可证、入口、依赖；
- 8 个完整 Schema；
- 最小成功请求；
- 缺字段、路径不存在、Provider 错误；
- 正常/错误返回形状；
- `ui_diff_check` 多文件语义；
- `analyze_video` 参数；
- stdout 行为。

只忽略 request ID、时间戳、字段顺序、latency 等动态字段。

## 4.1 P0 Gate

只有以下项目全部有实际文件或命令证据后，P0 才能标记为通过：

```text
UPSTREAM_VERSION_PINNED=PASS
UPSTREAM_PACKAGE=@z_ai/mcp-server@0.1.4
UPSTREAM_TARBALL_SHA256=RECORDED
UPSTREAM_LICENSE=RECORDED
INITIALIZE_FIXTURE=PASS
TOOLS_LIST_FIXTURE=PASS
TOOL_COUNT=8
TOOL_NAMES_CAPTURED=8_OF_8
TOOL_SCHEMAS_CAPTURED=8_OF_8
NORMAL_RESULT_FIXTURES=8_OF_8
ERROR_RESULT_FIXTURES=8_OF_8
UI_DIFF_SCHEMA_CAPTURED=PASS
ANALYZE_VIDEO_SCHEMA_CAPTURED=PASS
RETURN_SHAPES_CLASSIFIED=PASS
STDOUT_BEHAVIOR_CAPTURED=PASS
CURRENT_STATE_CREATED_OR_PRESENT=PASS
AGENT_INDEX_CREATED_OR_PRESENT=PASS
ARCHITECTURE_DECISIONS_CREATED_OR_PRESENT=PASS
SECRETS_SCAN=PASS
```

判定规则：

* `UPSTREAM_VERSION_PINNED=PASS` 必须对应明确固定的 `0.1.4`，不能仍使用 `@latest` 作为兼容基线。
* `UPSTREAM_TARBALL_SHA256=RECORDED` 必须有真实 SHA-256 值和证据路径，不能只写“已计算”。
* `NORMAL_RESULT_FIXTURES=8_OF_8` 和 `ERROR_RESULT_FIXTURES=8_OF_8` 必须按工具计数。
* 无真实 Provider Key导致某种上游 Provider 错误无法安全触发时，必须写清缺口和替代证据，不能伪造 fixture。
* `CURRENT_STATE.md`、`docs/AGENT_INDEX.md` 和 `docs/decisions/ARCHITECTURE_DECISIONS.md` 在 P0 首次执行时不存在，应按本计划创建最小版本。
* 创建这些索引和决策文件属于 P0 基础设施，不代表已经进入 P1。
* 任何 Gate 未通过，不得开始 P1，也不得实现 MiMo/Zhipu Provider。
* P0 状态只能是：

```text
READY_FOR_P1
PARTIAL_BUT_USABLE
PARTIAL
BLOCKED
```

---

# 5. P1/P2：MCP 与媒体输入

最小依赖：

```text
@modelcontextprotocol/sdk
zod
Node 内置 fetch/HTTP
轻量测试工具
```

统一入口：

```ts
prepareMediaInput(path, expectedType)
```

返回：

```ts
{
  normalizedPath,
  mimeType,
  sizeBytes,
  sha256,
  dataUrl?
}
```

规则：

- 路径不存在、目录、空文件、权限错误、伪装格式：直接失败；
- 两个 Provider 调用次数必须为 0；
- MiMo 本地媒体转 Base64 data URL；
- Base64 不写日志/fixture/磁盘；
- MiMo 50 MB 超限属于 `PRIMARY_UNSUPPORTED`，可 fallback；
- stdout purity 必须自动测试。

---

# 6. P3/P4：Provider

## 6.0 工具输出预算

8 个工具的输出长度不得统一使用一个超大上限。输出预算属于工具 profile，统一定义在：

```text
src/prompts/registry.ts
```

不得把 `maxOutputTokens` 分散写入 8 个 handler 或两个 Provider。

建议 v1 默认预算：

| 工具                             | 默认 `maxOutputTokens` | 输出约束                     |
| ------------------------------ | -------------------: | ------------------------ |
| `analyze_image`                |                 1600 | 先给直接结论，再给关键视觉证据；禁止无关长篇描述 |
| `extract_text_from_screenshot` |                 6000 | 优先完整保留原文；禁止附加大段解释        |
| `diagnose_error_screenshot`    |                 2400 | 聚焦错误文本、根因、影响和可执行修复       |
| `understand_technical_diagram` |                 2800 | 保留结构、节点、连接关系和关键标注        |
| `analyze_data_visualization`   |                 2400 | 聚焦数值、趋势、异常、坐标轴和不确定性      |
| `ui_diff_check`                |                 2800 | 按差异位置、类型、严重度和修复建议输出      |
| `ui_to_artifact`               |                 5000 | 允许较长结构化结果，但禁止重复描述同一 UI   |
| `analyze_video`                |                 3200 | 按时间段提取关键事件，不逐帧复述         |

实现要求：

* 以上数值是 v1 默认值，不得在每次请求中由主模型动态决定。
* 两个 Provider 必须使用同一工具 profile 中的输出预算，避免 MiMo 与 GLM 返回长度无故漂移。
* `extract_text_from_screenshot` 的首要目标是保留 OCR 原文，不能为了省 token 任意概括或改写识别到的文本。
* OCR 预计超出上限时，应尽量输出从开头开始的完整连续文本，并明确附加：

```text
[OCR output truncated: token limit reached]
```

* 不得在未返回任何原文前先输出长篇分析。
* `analyze_video` 应优先输出时间段摘要、关键事件和用户要求的内容，不得默认逐帧描述。
* 视频输出预算可根据时长使用以下程序化档位，但硬上限不得超过 4000：

```text
≤ 60 秒：1600
> 60 秒且 ≤ 5 分钟：2400
> 5 分钟：3200
硬上限：4000
```

* `ui_to_artifact` 的 5000 是硬上限，不代表每次都应生成接近 5000 tokens。
* 用户明确要求简短输出时可以降低预算。
* 用户明确要求完整 OCR 或完整结构化制品时，仍不得绕过工具硬上限；超限必须明确报告截断。
* Provider 返回的 `reasoning_content` 和 `reasoning_tokens` 不计入对外正文，但必须计入成本指标。
* 后续如需调整预算，只修改 `src/prompts/registry.ts` 及对应 Prompt profile 版本，不得全仓搜索替换。

建议 profile 结构：

```ts
interface ToolPromptProfile {
  id: string;
  version: string;
  systemPrompt: string;
  outputContract: string;
  maxOutputTokens: number;
}
```

必须为输出预算建立单元测试，至少证明：

```text
8 个工具均存在显式 maxOutputTokens
不存在未限制输出的工具
analyze_video 硬上限 ≤ 4000
ui_to_artifact 硬上限 ≤ 5000
OCR 截断标记存在
两个 Provider 读取同一份工具 profile
```

## 6.1 MiMo

```text
base_url=https://api.xiaomimimo.com/v1
model=mimo-v2.5
key=MIMO_API_KEY
```

必须实测：

```text
thinking.disable
reasoning_content 剥离
reasoning_tokens 采集
多图
视频
图片+视频同请求
```

策略：

- 能关闭 thinking 则默认关闭；
- 不能关闭仍只返回最终 content；
- reasoning 仅进指标；
- 图片+视频默认禁用；
- 每次调用无历史。

### 多轮历史禁令与 ADR

v1 的“每次调用无历史”不是临时简化，而是明确的协议安全决策。

已知风险：

- MiMo 开启 thinking 后，响应可能包含 `reasoning_content`。
- 在包含 `tool_calls` 的多轮历史中，如果后续请求回传 assistant 历史消息却没有完整保留对应的 `reasoning_content`，MiMo 接口可能返回 HTTP 400。
- 当前 Bridge 的 MCP 工具调用采用单次、无状态 completion，因此天然绕开这一风险。
- 禁止为了“连续对话优化”“上下文复用”或“提高缓存”擅自把 Provider 改成多轮会话。

首次执行 P0 时，如果下列文件不存在：

```text
docs/decisions/ARCHITECTURE_DECISIONS.md
```

应创建该文件，并加入一条架构决策。建议使用以下固定内容：

```markdown
## ADR-001：Provider 调用保持无状态

**状态**：Accepted

**决策**：

Vision Bridge MCP v1 的每一次 MCP `tools/call` 都对应一次独立的 Provider completion。Bridge 不保存、拼接或回传上一轮 Provider 对话历史，不向下一次请求传递 assistant `tool_calls`、`reasoning_content` 或其他隐藏推理字段。

**原因**：

1. MiMo 开启 thinking 时可能返回 `reasoning_content`。
2. 多轮请求中，包含 `tool_calls` 的 assistant 历史消息可能要求完整回传对应 `reasoning_content`；缺失时存在 HTTP 400 风险。
3. 无状态调用可降低上下文 token、简化 retry/fallback、提高固定 Prompt 前缀稳定性并减少隐私暴露。
4. MCP 工具本身已经由上层 Claude Code/Codex 负责对话状态，Bridge 没有必要重复维护 Provider 历史。

**后果**：

- Bridge 只向上层返回最终 `content`。
- `reasoning_content` 永不进入主模型上下文。
- `reasoning_tokens` 只进入脱敏成本指标。
- Prompt Cache 只能依赖稳定前缀，不得通过保存多轮 Provider 历史实现。
- 不得引入多轮历史。
- 未来任何引入 Provider 历史的修改都必须单独提交 ADR、协议测试和 MiMo 真实 API 验证，不得作为普通优化顺手加入。
```

规则：

* P0 未真正开始时，不创建该文件。
* 如果 `ARCHITECTURE_DECISIONS.md` 已存在，则追加 ADR，不得覆盖已有内容。
* 如果已经存在语义相同的 ADR，只核对并补齐缺失信息，不得重复创建第二条。
* ADR 编号如已被占用，应使用下一个可用编号，但正文含义保持不变。

## 6.2 GLM

```text
Z_AI_API_KEY
Z_AI_MODE=ZHIPU
Z_AI_VISION_MODEL=glm-4.6v-flash
```

优先复用 0.1.4 的 Prompt、映射、返回和错误语义，记录到 `SOURCE_REUSE_LEDGER.md`。

视频统一内部 contract：

```ts
sampling?: { fps?: number; maxFrames?: number }
```

分别实现：

```text
MimoProvider.mapVideoRequest()
ZhipuProvider.mapVideoRequest()
```

GLM fallback 前必须：

- 估算 128K 上下文预算；
- 收紧 fps/maxFrames；
- 记录调整；
- 不静默丢弃输入；
- 无法保语义时返回 capability error。

---

# 7. P5：fallback 规则

| MiMo 结果 | 重试 | GLM |
|---|---:|---:|
| 成功 | 0 | 否 |
| 连接重置/502/503/504 | 1 | 是 |
| 超时 | 0 | 是 |
| 429 | 0 | 是，冷却 |
| 401/403 | 0 | 是，本进程禁用 MiMo |
| Key 缺失 | 0 | 是，启动时 unavailable |
| 余额/模型不可用 | 0 | 是，30 分钟冷却 |
| 空/不可解析 | 1 | 是 |
| MiMo 媒体超限 | 0 | 是 |
| 本地输入非法 | 0 | 否 |

单次调用上限：

```text
1 次 MiMo
+ 最多 1 次 MiMo 瞬时重试
+ 最多 1 次 GLM
```

输出：

- MiMo 成功：不加 Provider 文本；
- 普通文本 fallback：可加一行短标记；
- 严格 JSON：不得破坏结构；
- 长错误只写脱敏日志。

---

# 8. P6：四层缓存

## 8.1 Agent 上下文缓存

- 第 0 节保持稳定；
- 动态任务追加在末尾；
- Agent 不复述固定架构；
- 后续追问只传 diff、错误摘要、测试名；
- 已确认决策进入 `ARCHITECTURE_DECISIONS.md`；
- 不反复改写整个计划。

记录：

```text
FILES_READ
REPEAT_FULL_READS
FULL_TEST_RUNS
WEB_LOOKUPS
SUBAGENT_RUNS
```

## 8.2 MiMo Prompt Cache

固定布局：

```text
messages[0] = 固定 global system
messages[1] = 固定 tool profile/output contract
messages[2] = 媒体 + 动态用户要求
```

固定前缀不得含：

```text
日期/request ID/路径/文件名/SHA/size/状态/动态错误/用户描述
```

Prompt 常量版本：

```text
GLOBAL_SYSTEM_V1
ANALYZE_IMAGE_V1
OCR_V1
ERROR_DIAGNOSIS_V1
TECHNICAL_DIAGRAM_V1
DATA_VISUALIZATION_V1
UI_DIFF_V1
UI_TO_ARTIFACT_V1
VIDEO_ANALYSIS_V1
```

要求：

- 字节级稳定；
- 稳定序列化；
- 修改必须升版本；
- snapshot/hash 测试；
- 采集 `prompt_tokens/cached_tokens/completion_tokens/reasoning_tokens`。

```text
prompt_cache_hit_ratio = cached_tokens / prompt_tokens
```

无 `cached_tokens` 证据，不得声称提升。

## 8.3 本地媒体缓存

```text
key = sha256 + MIME + transform_version
TTL=10m
MAX_ENTRIES=32
MAX_TOTAL_BYTES=64MB
VIDEO_BASE64_CACHE=false
```

- 小图片可缓存 data URL；
- 大图片仅元数据；
- 视频默认不缓存 Base64；
- 内存有界、不写磁盘、退出清空。

## 8.4 严格结果缓存（可选）

```text
key = tool + media_sha + normalized_options + prompt_version + model
默认 ENABLED=false
TTL=5m
MAX_ENTRIES=16
DISK=false
```

只允许完全相同请求命中。禁止模糊图片、跨 Prompt、跨模型或不同用户要求命中。

## 8.5 Singleflight 与连接复用

```text
10 个完全相同并发请求
→ Provider 实际调用 1 次
```

MiMo、Zhipu 各持有单例 HTTP client，开启 keep-alive，不得每次重建。

指标：

```text
MIMO_PROMPT_TOKENS
MIMO_CACHED_TOKENS
PROMPT_CACHE_HIT_RATIO
MEDIA_CACHE_HITS/MISSES
RESULT_CACHE_HITS/MISSES
SINGLEFLIGHT_AVOIDED
MIMO_CALLS
ZHIPU_FALLBACK_CALLS
LATENCY
```

---

# 9. 测试

单元测试：

```text
config/Key/路径/MIME/Base64/50MB
Prompt hash/reasoning 剥离
error policy/circuit breaker/retry
LRU/TTL/result cache/singleflight
日志脱敏/stdout purity
```

Contract：

```text
8/8 name
8/8 Schema
8/8 返回形状
错误形状
```

Mock 故障：

```text
200/429/401/timeout/503
重试成功/重试失败后 GLM
空响应/双失败/非法输入/超限
GLM 视频降采样
缓存/singleflight
```

真实 smoke 仅 opt-in，素材小且无隐私。

---

# 10. P7：安装与回滚

脚本：

```text
install-claude.ps1
install-codex.ps1
verify-install.ps1
rollback-claude.ps1
rollback-codex.ps1
```

要求：

- 自动探测实际配置；
- 修改前备份；
- 幂等；
- JSON/TOML 修改后重新解析；
- 不覆盖未知配置；
- 不输出 Key；
- 失败自动恢复；
- 默认先生成 preview；
- 用户授权后才改真实配置。

Claude 验收：

```text
IMAGE_HOOK_AUTO_TRIGGER=PASS
VIDEO_SKILL_OR_EXPLICIT_CALL=PASS
```

现有 Hook 不匹配视频，不算回归。

Codex 验收：

```text
env_vars=["MIMO_API_KEY","Z_AI_API_KEY"]
子进程实际见 Key
路径工具可调用
新会话自动加载
无需手动 /mcp
```

---

# 11. Git 成本控制

分支：

```text
feat/vision-bridge-mimo-primary
```

只在稳定边界 checkpoint：

```text
p0-contract
p1-p2-core
p3-p4-providers
p5-fallback
p6-cache
p7-acceptance
final
```

每次：

```text
定向测试
git diff --check
diff 审查
secrets scan
记录 SHA
私有远程可用时 push
```

禁止 force push，不为微小步骤制造 checkpoint。

---

# 12. 最终 Gate

```text
BUILD/TYPECHECK/UNIT/CONTRACT=PASS
UPSTREAM_COMPATIBILITY=8/8
MCP_INITIALIZE/TOOLS_LIST=PASS
STDOUT_PURITY=PASS
MIMO_IMAGE/VIDEO_SMOKE=PASS
MIMO_REASONING_STRIPPED=PASS
ZHIPU_IMAGE/VIDEO_SMOKE=PASS_OR_DOCUMENTED
PRIMARY_ONLY_ON_SUCCESS=PASS
FALLBACK=PASS
INVALID_INPUT_ZERO_CALLS=PASS
GLM_VIDEO_BUDGET=PASS
CIRCUIT_BREAKER/SINGLEFLIGHT=PASS
CACHE_METRICS_CAPTURED=PASS
CLAUDE/CODEX/ROLLBACK=PASS
SECRETS_SCAN=PASS
WORKTREE_CLEAN=PASS
```

状态：

```text
READY_TO_USE
PARTIAL_BUT_USABLE
PARTIAL
BLOCKED
```

---

# 13. 给 Agent 的动态任务块

以后将本文件保持稳定，在末尾追加：

```text
TASK_MODE=<REVIEW_ONLY|IMPLEMENT|FIX|VERIFY>
TARGET_PHASE=<P0-P8>
EXACT_GOAL=<一句话>
ALLOWED_FILES=<路径>
DO_NOT_TOUCH=<路径/配置>
REAL_API_ALLOWED=<yes|no>
REAL_CONFIG_CHANGE_ALLOWED=<yes|no>
MAX_FULL_TEST_RUNS=<数字>
STOP_AFTER=<边界>
EXPECTED_REPORT=<精简字段>
```

示例：

```text
TASK_MODE=IMPLEMENT
TARGET_PHASE=P3
EXACT_GOAL=实现 MiMo 图片和多图 Provider
ALLOWED_FILES=src/providers/mimo.ts,src/providers/types.ts,tests
DO_NOT_TOUCH=~/.claude.json,~/.claude/settings.json,~/.codex/config.toml
REAL_API_ALLOWED=no
REAL_CONFIG_CHANGE_ALLOWED=no
MAX_FULL_TEST_RUNS=0
STOP_AFTER=P3 mock tests pass
EXPECTED_REPORT=状态/改动/测试/Git/阻塞
```

---

# 14. 精简报告模板

```text
STATUS=
WORK_PACKAGE=
BRANCH=
INITIAL_HEAD=
FINAL_HEAD=
WORKTREE_CLEAN=
FILES_CHANGED=
TARGETED_TESTS=
PHASE_TESTS=
FULL_TESTS=
REAL_API_CALLS=
MIMO_CALLS=
ZHIPU_FALLBACK_CALLS=
COMPATIBILITY=
CACHE_METRICS=
SECURITY=
BLOCKERS=
NEXT_ALLOWED_PHASE=
```

---

# 15. 禁止事项

- 未收到明确执行指令就动文件/进程。
- 重新规划已冻结架构。
- 默认创建子 Agent。
- 全仓重复读取和重复全量测试。
- 普通测试调用真实 API。
- 让主模型选 Provider。
- 两 Provider 并发或相互循环。
- Provider 多轮历史或返回 reasoning。
- Base64/Key/敏感内容进日志或 Git。
- 未抓协议就改 8 工具 Schema。
- 第一版迁移 namespace 或修改图片 Hook。
- 把 MiMo 视频采样原样给 GLM 128K。
- 使用 `@latest` 作为生产依赖。
- 无真实指标声称缓存提升。
- 创建重复计划、状态或总结文档。
- 未授权修改真实 Claude/Codex 配置。
