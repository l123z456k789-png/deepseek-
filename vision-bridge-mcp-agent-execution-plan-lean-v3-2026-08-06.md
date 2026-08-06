# Vision Bridge MCP 实施计划（实战验证版 v2）
## MiMo-V2.5 主视觉 + GLM-4.6V-Flash 程序化兜底

> **本版本说明**：基于 2026-08-06 一次真实执行改写。P0–P6 全部完成并提交，P7 已在 Codex/Claude Code 双端切换真实配置，MiMo/智谱图片+视频真实 smoke 全部通过，Claude Code 新实例经结构化日志确认 `provider=mimo`。本文件供其他人直接复用：先读「快速复用指南」，再读「实战经验清单」，最后按阶段表执行。
>
> **用途**：交给 Claude Code / Codex Agent 执行或修改。
> **注意**：本文件不是立即执行命令。只有用户明确给出任务模式和阶段后，Agent 才能改文件。
> **目标优先级**：兼容性 > 可回滚 > 正确 fallback > Agent 成本 > API 成本 > 扩展性。

---

# 0. 冻结架构（已验证，不改）

```text
本地图片/视频路径
  ↓
现有 Hook / visual-inspector Skill（工具名仍为 mcp__zai-vision__*）
  ↓
vision-bridge-mcp
  ├─ Primary: mimo-v2.5（官方 OpenAI 兼容 API）
  └─ Fallback: glm-4.6v-flash（智谱免费模型）
```

固定规则（全部在本次执行中验证过）：

- 新建薄型 Node.js + TypeScript `stdio` MCP。
- 不修改上游 `@z_ai/mcp-server` 本体。
- 第一版不改 Hook、Skill、MCP namespace 和 8 个工具名。
- MiMo 固定优先；GLM 只在程序确认失败/不适用时调用。
- 禁止让主模型判断图片难度或选择 Provider。
- 同一 MCP 进程内实现两个 Provider；禁止 MCP 调 MCP。
- v1 每次工具调用只做一次独立 completion，不保存 Provider 多轮历史（MiMo thinking 多轮有 400 风险，见 ADR-001）。
- 不向主模型返回 `reasoning_content`，只返回最终 `content`。
- API Key 仅从环境变量读取。
- `stdout` 仅 MCP JSON-RPC；日志写 `stderr` + 结构化文件（.audit/logs/bridge.log）。
- 不做 Web UI、数据库、模型投票、评分器或复杂网关。

## 0.1 已验证事实（2026-08-06 实测证据）

| 项目 | 事实 | 证据 |
|---|---|---|
| 上游固定 | `@z_ai/mcp-server@0.1.4`，npm `latest` 当时就是 0.1.4 | npm registry dist-tags |
| tarball SHA-256 | `09E588A868F1C2B4DADE10F11AEE8D232F9E43E5C7BCEEE087635ACEDF37275C` | P0 记录 |
| 许可证/入口/依赖 | Apache-2.0；`build/index.js`（ESM, node>=18）；zod 3.25.76 + @modelcontextprotocol/sdk 1.26.0 | package.json |
| 上游环境变量 | `Z_AI_API_KEY` 启动必填；`Z_AI_MODE=ZHIPU`；默认模型 glm-4.6v；timeout 300s；max_tokens 32768；temp 0.8；top_p 0.6；thinking=enabled | 源码 |
| 上游文件限制 | 图片仅 jpg/jpeg/png ≤5MB；视频 ≤8MB（文档 MP4/MOV/M4V，代码不查扩展名）；本地→data URL | 源码+实测 |
| MiMo API | `https://api.xiaomimimo.com/v1`，model `mimo-v2.5`，OpenAI 兼容 Bearer | 官方文档 |
| MiMo 媒体 | 图片 JPEG/PNG/GIF/WebP/BMP；Base64 ≤50MB；视频 URL ≤300MB、Base64 ≤50MB；支持多图；`fps`/`media_resolution` 是 `video_url` 的**同级字段**（不在内部） | 官方文档+实测 |
| MiMo 缓存 | usage 含 `prompt_tokens_details.cached_tokens`；稳定前缀下真实命中（实测 1344/1353 ≈99%） | 真实 smoke |
| MiMo thinking | `thinking:{type:"disabled"}` 被接受，reasoning_tokens=0 | 真实 smoke |
| GLM 免费版 | glm-4.6v-flash；128K 上下文；支持图片/视频/文件；同一请求不能混图像+视频+文件 | 官方文档 |
| 配置路径 | Claude MCP 在 `~/.claude.json`（不是 settings.json）；Hook 在 settings.json；Codex 在 `~/.codex/config.toml` | 实机核对 |

## 0.2 必须兼容的 8 个工具

```text
analyze_image            (image_source, prompt)
extract_text_from_screenshot (image_source, prompt, optional programming_language)
diagnose_error_screenshot (image_source, prompt, optional context)
understand_technical_diagram (image_source, prompt, optional diagram_type)
analyze_data_visualization (image_source, prompt, optional analysis_focus)
ui_diff_check            (expected_image_source, actual_image_source, prompt)
ui_to_artifact           (image_source, output_type[code|prompt|spec|description], prompt)
analyze_video            (video_source, prompt)
```

兼容范围：name、description、inputSchema、required/enum/default、返回 content 形状、错误形状、本地路径/多图/UI 对比/视频参数语义。

---

# 1. 快速复用指南（新执行者先读）

1. **前置准备（用户做）**
   - 智谱 Key：bigmodel.cn 注册（免费模型 glm-4.6v-flash）。
   - 小米 Key：platform.xiaomimimo.com 注册并创建（付费但便宜；可多 Key）。
   - 设置环境变量：`MIMO_API_KEY`、`MIMO_API_KEY_2`、`MIMO_API_KEY_3`（可选）、`Z_AI_API_KEY`；`setx` 后**必须重启客户端**。
   - 密钥不要发给 Agent、不要写进 Markdown/聊天。

2. **一键初始化（Agent 做）**
   - 建仓库、分支 `feat/vision-bridge-mimo-primary`，先 Git 快照（计划、状态、配置哈希）。
   - P0：`npm pack @z_ai/mcp-server@0.1.4` → 解包到 `.audit/` → 用 stdio 探针抓 `initialize`/`tools/list`/8 工具结果与错误 fixtures。
   - P1/P2：TS 骨架 + 8 工具注册 + 文件输入层（TDD）。
   - P3/P4：两个 Provider + mock 测试 + opt-in 真实 smoke（`REAL_API_TESTS=1`）。
   - P5：fallback/熔断/限流。
   - P6：四层缓存 + 指标。
   - P7：安装/回滚脚本（默认 preview）→ 用户授权后切换双端配置 → 重启验收。
   - P8：最终报告。

3. **验收口诀**：上游能通 → Bridge 协议一致 → mock 全绿 → 真实 smoke 全绿 → 新实例里能识图 → 日志里有 `provider=mimo`。

---

# 2. 实战经验清单（本文件最值钱的部分）

## 2.1 协议与兼容

- **P0 黑盒快照是最高杠杆动作**：先抓上游 8 工具 schema/错误形状，再写代码；禁止凭 README 猜 Schema。
- 上游错误形状有三种：缺字段 → MCP 层 `-32602`；路径不存在 → 工具结果 `isError` + `Error: Image file not found: ...`；Provider 错误 → `isError` + `Error: Unexpected error: ... HTTP 401: ...`。
- **MCP SDK 客户端行为**：`tools/call` 的 `-32602` 校验错误会作为 `result.isError=true` 返回，**不会 throw**；测试断言要按“返回结果”写，不是 `assert.rejects`。
- 上游视频工具**没有独立 system prompt**（只传用户指令）；Bridge 需要自建稳定的 `VIDEO_ANALYSIS_PROMPT_V1`。
- 上游图片扩展名限制比 MCP 描述更窄（webp/gif/bmp 会被拒）——GLM fallback 要保留该行为，MiMo primary 可以更宽。

## 2.2 Provider 与 API

- **MiMo `fps`/`media_resolution` 是 `video_url` 的同级字段**，不是 `video_url.fps`（写测试时踩过，按官方文档 JSON 结构来）。
- MiMo 响应含 `reasoning_content` 和 `completion_tokens_details.reasoning_tokens`：只把 `content` 返回给上层，reasoning 只进指标。
- MiMo `thinking:{type:"disabled"}` 实测可用（reasoning=0）；如果以后发现 400，降级为不传该字段并记录。
- **智谱免费模型高峰 429 很常见**（code 1305「访问量过大」）：同一窗口上游原版也会 429，不是代码问题；要重试/冷却/换时段，不要改请求结构来“猜”。
- 智谱请求保持上游 0.1.4 兼容布局：`system=工具Prompt + user=媒体+用户指令`，thinking=enabled（当前实测更稳）；可用 `VISION_ZHIPU_THINKING=disabled` 覆盖。
- 请求消息顺序固定（system → tool profile → media+user），动态内容放最后 → MiMo cached_tokens 真实命中。

## 2.3 多 Key 轮换（本项目特有需求）

- 顺序固定：`MIMO_API_KEY` → `MIMO_API_KEY_2` → `MIMO_API_KEY_3`（最后使用，无例外）。
- 触发轮换：401/403/402/429；单次请求内按序尝试，全部失败才报错。
- Key 只存环境变量：写入用 `[Environment]::SetEnvironmentVariable(name, value, 'User')`，绝不落盘/进 Git/进日志。
- Codex 透传：`config.toml` 的 `env_vars = ["MIMO_API_KEY","MIMO_API_KEY_2","MIMO_API_KEY_3","Z_AI_API_KEY"]`。
- `setx`/SetEnvironmentVariable 只对新进程生效：改完必须重启 Codex/Claude/终端。
- Key 一旦出现在聊天记录，建议全部稳定后到平台轮换一次。

## 2.4 Node / TypeScript 环境（本机 Node v24）

- Node 24 原生跑 TS 是 **strip-only**：不支持 `constructor(private x)` 参数属性等非可擦除语法；tsconfig 必须开 `"erasableSyntaxOnly": true` 提前拦截。
- `node --test tests/unit/` 在 Windows 上会报 `Cannot find module ...tests\unit`；改成 `node --test` 自动发现。
- 本地 import 用 `.ts` 扩展名 + `rewriteRelativeImportExtensions`，tsc 产物自动变 `.js`。
- 依赖固定版本：`npm install --save-exact`（本机 typescript 7.0.2、@types/node 26.1.2、SDK 1.26.0、zod 3.25.76）。

## 2.5 Windows / PowerShell 陷阱（都实际踩过）

- PowerShell 5.1 `Out-File -Encoding utf8` 写 **BOM**，python tomllib 会拒；统一用 `[System.IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding($false)))`。
- **数组降序切片**：`$lines[8..7]` 不是空数组，会取到 `8` 和 `7` 两个元素；切片前先判断边界。
- 双引号字符串里 `$var` 会被插值，做 `.Replace` 锚点要用单引号 here-string，否则静默不匹配。
- TOML 基本字符串里 Windows 路径要写成 `C:\\dev\\...`；校验用 `python -c "import tomllib; tomllib.load(...)"`。
- `~/.claude.json` 用 ConvertFrom-Json/ConvertTo-Json 往返安全（先备份）。
- git 报 dubious ownership：`git -c safe.directory='路径'` 或 `git config --global --add safe.directory '路径'`。
- npm 缓存写权限被沙箱拦：用 `--cache <项目>\.audit\npm-cache`；网络操作需要授权。
- `rg` 在部分沙箱被拒：用 `Select-String -SimpleMatch` 兜底。

## 2.6 安装 / 回滚 / 验收

- 切换真实配置前：先备份（.audit/config-backups）、先 preview、写后重解析校验、失败自动还原。
- verify 脚本检查 TOML 里的路径要用 `Contains($path.Replace('\','\\'))`，不要用 `regex.Escape`（TOML 里是双反斜杠）。
- **运行中的客户端不受配置切换影响**（配置启动时读取）；测试用**新开实例**，不用打断正在跑的进程。
- 验收证据用结构化文件日志：`.audit/logs/bridge.log`，记录 provider/latency/tokens；日志只在 server 启动时启用，测试不污染。
- Claude 端 Hook（visual-auto-detect.ps1）只识别图片扩展名，不识别视频；视频靠 Skill/模型主动调用，不算回归。

---

# 3. 阶段状态表（截至 2026-08-06 实测）

| 阶段 | 状态 | 关键 Gate | 备注 |
|---|---|---|---|
| P0 | ✅ 完成 | 8/8 fixtures、SHA 记录、错误形状 3 类 | 真实调用用智谱免费模型抓取 |
| P1/P2 | ✅ 完成 | 8 工具协议一致、21 测试、stdout 纯净 | tools/list 与上游逐字段比对 |
| P3/P4 | ✅ 完成 | mock 29 项 + 真实 smoke 4/4 | MiMo/智谱 图片+视频全 PASS |
| P5 | ✅ 完成 | fallback/熔断/限流 39→53→56 测试 | 429 冷却 60s、GLM 串行 5s |
| P6 | ✅ 完成 | 缓存/指标 48→57 测试 | cached_tokens 实测命中 |
| P7 | ✅ 已应用 | 双端配置切换 + verify PASS | 备份在 .audit/config-backups |
| P8 | 收口 | 最终报告 | 本文档即经验版收口物 |

## 3.1 输出 token 预算（已验证可执行）

| 工具 | 默认 maxOutputTokens | 硬上限 |
|---|---:|---:|
| analyze_image | 1600 | — |
| extract_text_from_screenshot | 6000 | OCR 截断标记 `[OCR output truncated: token limit reached]` |
| diagnose_error_screenshot | 2400 | — |
| understand_technical_diagram | 2800 | — |
| analyze_data_visualization | 2400 | — |
| ui_diff_check | 2800 | — |
| ui_to_artifact | 5000 | 5000 |
| analyze_video | 3200（≤60s 1600 / ≤5min 2400 / >5min 3200） | 4000 |

---

# 4. 保留的关键设计（验证过，别删）

## 4.1 统一 Provider 接口

```ts
interface VisionProvider {
  id: 'mimo' | 'zhipu';
  capabilities: ProviderCapabilities;
  analyzeImage(req: ImageRequest): Promise<ProviderResult>;
  analyzeVideo(req: VideoRequest): Promise<ProviderResult>;
  mapImageRequest(req: ImageRequest): unknown;
  mapVideoRequest(req: VideoRequest): unknown;
}
```

## 4.2 路由规则（P5，已验证）

- 有效请求 → MiMo Primary → 成功直接返回；失败按错误矩阵 → 智谱 Fallback（最多一次）。
- MiMo 重试：连接重置/5xx/空响应/不可解析 → 1 次快速重试；429/401/403/402/超时 → 0 次重试直接 fallback。
- 熔断：401/403 → 本进程禁用；429 → 60s；402/404 → 30min；其他 → 10s。
- 智谱调用串行队列 + 5 秒最小间隔；fallback 不循环。
- fallback 标记：仅当 `fallbackUsed && primaryAttempted` 时附加；严格 JSON 不加标记。

## 4.3 四层缓存（P6，已验证）

- Agent 上下文缓存：第 0 节稳定、动态任务追加末尾。
- MiMo Prompt Cache：固定前缀（system → tool profile → media+user），动态信息放最后；采集 cached_tokens。
- 本地媒体缓存：key=sha256+mime+transform；TTL 10min；max 32 条 / 64MB；视频不缓存 Base64。
- 严格结果缓存：默认关闭；key=tool+media_sha+options+prompt_version+model。
- Singleflight：10 个并发相同请求 → 1 次 Provider 调用（实测通过）。

## 4.4 首次执行文件规则

- `CURRENT_STATE.md`、`docs/AGENT_INDEX.md`、`docs/decisions/ARCHITECTURE_DECISIONS.md` 只在真正开始 P0 时创建最小版；审查/REVIEW_ONLY 不创建。
- ADR-001（Provider 无状态）已写入，禁止多轮历史。

---

# 5. 最终验收 Gate（全部必过）

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

---

# 6. 禁止事项（原计划 + 实战新增）

- 未收到明确执行指令就动文件/进程。
- 重新规划已冻结架构；默认创建子 Agent。
- 让主模型选 Provider；双 Provider 并发/循环；Provider 多轮历史或返回 reasoning。
- Base64/Key/敏感内容进日志或 Git（新增：聊天里也不要粘贴 Key）。
- 未经协议快照改 8 工具 Schema；第一版迁移 namespace 或修改图片 Hook。
- 把 MiMo 视频采样原样给 GLM 128K；使用 `@latest` 作为生产依赖。
- 无真实指标声称缓存提升；创建重复计划/状态/总结文档。
- 未授权修改真实 Claude/Codex 配置。
- **高峰时段反复硬刚智谱 429**（新增：用冷却重试 + 换时段）。
- **把测试输出写进真实运行日志**（新增：文件日志只在 server 启动时启用）。

---

# 7. 关键脚本清单（项目 C:\dev\vision-bridge-mcp）

```text
scripts/upstream-probe.mjs       # stdio 探针：list / call
scripts/gen-upstream-contract.mjs # 从 fixture 生成工具契约 TS
scripts/gen-upstream-prompts.mjs  # 从上游包生成 Prompt TS（字节级复用）
scripts/provider-smoke.mjs        # opt-in 真实 smoke（REAL_API_TESTS=1）
scripts/install-claude.ps1       # 默认 preview，-Apply 才写
scripts/install-codex.ps1        # 同上
scripts/rollback-claude.ps1      # 一键回滚
scripts/rollback-codex.ps1       # 一键回滚
scripts/verify-install.ps1       # 双端配置 + Key 存在性 + Bridge 入口
```

## 证据文件

```text
docs/evidence/COMPATIBILITY_BASELINE.md  # 上游协议基线
docs/evidence/PROVIDER_SMOKE.md          # 真实 smoke 结果
docs/evidence/KEY_POLICY.md              # 多 Key 轮换策略（无密钥值）
docs/evidence/config-baseline.md         # 配置哈希基线
.audit/logs/bridge.log                   # 结构化运行日志（gitignored）
.audit/config-backups/                   # 切换前备份
```