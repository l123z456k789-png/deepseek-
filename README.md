# zai-vision 识图 MCP 配置指南

## 架构总览：Hooks → Skills → MCP 三层互补

Claude Code 中识图功能不是靠单一机制实现的，而是 **Hook + Skill + MCP 三层互补**：

```
用户发图片路径
    ↓
① Hook (visual-auto-detect.ps1)
   自动扫描 Prompt，匹配到图片文件路径时注入指令
   "用 zai-vision 工具分析这张图片"
    ↓
② Skill (visual-inspector)
   提供完整的分析策略——什么类型的图片用什么工具、
   如何处理错误、怎么格式化输出
    ↓
③ MCP Server (zai-vision)
   真正执行图片分析，调用智谱 GLM-4.6V-Flash
   返回文字结果给模型
```

**为什么需要互补？**

| 层级 | 单独用的问题 | 互补后 |
|------|-------------|--------|
| 只有 Hook | 只能做简单正则匹配，逻辑写死在脚本里 | Hook 做"触发"，Skill 做"策略" |
| 只有 Skill | 需要手动调用 `/visual-inspector` 或模型自行判断 | Hook 自动触发，Skill 接力处理 |
| 只有 MCP | 模型可能不知道什么时候该调用哪个工具 | 上层告诉模型"该用什么工具" |

---

## 一、MCP 服务器配置（基础层）

验证过的 Claude Code 配置（`~/.claude/settings.json` 或 IDE 管理）：

```json
{
  "mcpServers": {
    "zai-vision": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@z_ai/mcp-server@latest"],
      "env": {
        "Z_AI_MODE": "ZHIPU",
        "Z_AI_VISION_MODEL": "glm-4.6v-flash"
      }
    }
  }
}
```

| 参数 | 值 | 说明 |
|------|-----|------|
| `Z_AI_MODE` | `ZHIPU` | 使用智谱 AI 作为视觉后端 |
| `Z_AI_VISION_MODEL` | `glm-4.6v-flash` | 速度快、成本低的视觉模型 |
| `command` | `cmd` | Windows 下需要通过 cmd 包装启动 npx |
| `args` | `/c`, `npx`, `-y`, `@z_ai/mcp-server@latest` | `-y` 自动确认安装，`@latest` 用最新版 |

**核心原理**：MCP 工具接收的是**文件路径字符串**，不是图片本身。主模型（即使是 DeepSeek 这种纯文本模型）只需要传文件路径给 MCP 工具，MCP 服务器自己去调智谱 API 处理图片，返回文字描述。所以**文本模型也能通过 MCP 工具"识图"**。

### 可用的 8 个工具

1. **`analyze_image`** — 通用识图（兜底）
2. **`extract_text_from_screenshot`** — OCR 文字提取
3. **`diagnose_error_screenshot`** — 错误截图诊断
4. **`understand_technical_diagram`** — 技术图表理解
5. **`analyze_data_visualization`** — 数据可视化洞察
6. **`ui_diff_check`** — UI 对比检查
7. **`ui_to_artifact`** — UI 截图转代码/Prompt/设计规范
8. **`analyze_video`** — 视频内容分析

### API Key

```powershell
$env:Z_AI_API_KEY = "你的智谱API密钥"
```

---

## 二、Hook 配置（自动触发层）

### 2.1 Hook 脚本

文件位置：`~/.claude/hooks/visual-auto-detect.ps1`

这个 hook 做的事很简单：
1. 监听 `UserPromptSubmit` 事件（用户每次发消息时触发）
2. 用正则扫描 Prompt 中是否有图片文件路径（支持 png/jpg/jpeg/webp/gif/bmp）
3. 验证文件确实存在
4. 注入 `additionalContext`，明确告诉模型用哪个工具、注意什么

关键正则：匹配 Windows 绝对路径、相对路径中的图片文件。

### 2.2 注册 Hook

在 `~/.claude/settings.json` 中添加：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "shell": "powershell",
            "command": "powershell -NoProfile -Command \"$t=[Console]::In.ReadToEnd(); & 'C:\\Users\\bimubai\\.claude\\hooks\\visual-auto-detect.ps1' -InputJson $t\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**注意**：`matcher` 设为空字符串 `""` 表示匹配所有 UserPromptSubmit 事件（不需要按工具名筛选）。`timeout` 设 5 秒足够，hook 超时不应阻塞用户输入。

### 2.3 Hook 注入的上下文

当检测到图片路径时，hook 会把类似这样的内容注入到模型的上下文中：

```
[VISUAL-AUTO-DETECT] The user's prompt references these image file(s) on disk:
  - C:\Users\bimubai\Pictures\Screenshot.png

ACTION REQUIRED: Use mcp__zai-vision__analyze_image to analyze each image.
For specific image types, prefer these tools:
  - Screenshots with errors → diagnose_error_screenshot
  - UI designs → ui_to_artifact
  - Data charts → analyze_data_visualization
  - Technical diagrams → understand_technical_diagram
  - Text extraction → extract_text_from_screenshot

CRITICAL:
1. NEVER claim the text model can "see" images — all analysis comes from MCP tools.
2. If the MCP tool errors, report it clearly. Do NOT guess image content.
```

---

## 三、Skill 配置（策略层）

`visual-inspector` skill 来自 superpowers 插件，已经自动可用（不需要额外配置）。

它的作用是提供**分析策略**——根据图片类型选择合适的工具、处理错误降级、格式化中文输出等。Skill 和 Hook 的关系是：

- **Hook** 负责"发现图片" → 注入触发指令
- **Skill** 负责"怎么分析" → 提供策略和最佳实践
- **MCP** 负责"执行分析" → 调 API 返回结果

---

## 四、Claude Code 完整配置检查清单

确认以下四项都到位：

- [x] **MCP**：`zai-vision` 服务器在 settings.json 中注册，工具可调用
- [x] **Hook**：`visual-auto-detect.ps1` 脚本在 hooks 目录，且在 settings.json 中注册
- [x] **Skill**：`visual-inspector` 通过 superpowers 插件自动可用
- [x] **API Key**：`Z_AI_API_KEY` 环境变量已设置且有效

---

## 五、在 Codex 中复现

### 5.1 Codex 现有配置

`C:\Users\bimubai\.codex\config.toml` 中已有 MCP 配置：

```toml
[mcp_servers.zai-vision]
command = "npx"
args = ["-y", "@z_ai/mcp-server@latest"]
env = { Z_AI_MODE = "ZHIPU", Z_AI_VISION_MODEL = "glm-4.6v-flash" }
env_vars = ["Z_AI_API_KEY"]
enabled = true
```

### 5.2 优化建议

**建议一：command 改为 `cmd`**（Windows 兼容性）

```toml
[mcp_servers.zai-vision]
command = "cmd"
args = ["/c", "npx", "-y", "@z_ai/mcp-server@latest"]
env = { Z_AI_MODE = "ZHIPU", Z_AI_VISION_MODEL = "glm-4.6v-flash" }
env_vars = ["Z_AI_API_KEY"]
enabled = true
startup_timeout_sec = 120
tool_timeout_sec = 180
```

**建议二：修改 models.json**

`C:\Users\bimubai\.codex\models.json` 中 DeepSeek 模型的 `input_modalities` 只有 `["text"]`：

```json
{
  "input_modalities": ["text", "image"],
  "supports_image_detail_original": true
}
```

这个修改告诉 Codex："允许图片通过 MCP 工具流入，不要因为模型不支持原生视觉就屏蔽图片工具"。

**建议三：在 Codex 中实现 Hook 等效功能**

Codex 的 hooks 机制不同，可以考虑两种替代方案：

- **方案 A**：在 CLAUDE.md 中写规则 —— "当用户发送的 Prompt 包含图片文件路径时，自动调用 `mcp__zai-vision__analyze_image` 工具"
- **方案 B**：利用 Codex 的 UserPromptSubmit hook（如果支持），复制 visual-auto-detect.ps1 的逻辑

---

## 六、频率控制（防 429）

GLM-4.6V-Flash 免费 API 有严格的频率限制，频繁调用会返回 HTTP 429。不改后端的情况下，通过**客户端行为优化**来降低 429 频率。

### 6.1 模型侧规则（CLAUDE.md）

在 CLAUDE.md 的识图章节中加入以下规则：

```markdown
### 频率控制（防 429）

- **调用间隔**：同一会话内，两次 zai-vision 工具调用之间至少间隔 5 秒。
  多张图片不要并发调用，串行排队。
- **429 退避**：遇到 HTTP 429 错误时，等待 15-20 秒再重试（不是立刻重试）。
  最多重试 1 次，仍失败则如实告知用户并建议稍后再试。
- **合并请求**：如果用户发了多张图，尽量在一个 prompt 里要求一次性分析全部，
  减少 API 调用次数。
- **避免无效调用**：工具调用前确认图片路径存在且格式正确，避免浪费 API 配额。
```

### 6.2 Hook 侧限流（visual-auto-detect.ps1）

在 Hook 脚本中加入**客户端限流器**：

```powershell
# --- Rate Limiter ---
$RateLimitFile = "$env:CLAUDE_CONFIG_DIR\cache\zai-vision-last-call.txt"
$MinIntervalSec = 5

function Get-SecondsSinceLastCall {
    if (-not (Test-Path $RateLimitFile)) { return $MinIntervalSec + 1 }
    $lastTick = [long](Get-Content $RateLimitFile -Raw).Trim()
    return [Math]::Round(([DateTime]::UtcNow.Ticks - $lastTick) / 10000000.0, 1)
}

function Set-LastCallTimestamp {
    [DateTime]::UtcNow.Ticks | Out-File $RateLimitFile -NoNewline
}
```

在构建 `additionalContext` 之前检查：

```powershell
$secondsSince = Get-SecondsSinceLastCall
if ($secondsSince -lt $MinIntervalSec) {
    exit 0  # 5 秒内重复触发 → 直接跳过
}
Set-LastCallTimestamp
```

同时在注入的上下文中加入限流提示：

```
RATE LIMIT: Wait 5 seconds before calling if you just made another zai-vision call.
If you get HTTP 429: wait 15-20 seconds, then retry ONCE. Do not retry immediately.
```

### 6.3 三层防御总结

```
Hook 层：5 秒内不重复触发（源头限流）
   ↓
CLAUDE.md 规则：调用时主动间隔 5 秒 + 429 后等 15 秒再重试（行为限流）
   ↓
智谱 API：请求不密集就不会 429
```

---

## 七、实际修改的文件清单

在 Claude Code 中完成识图 + 限流需要改以下文件：

| 文件 | 作用 | 改动内容 |
|------|------|----------|
| `~/.claude/settings.json` | 注册 MCP + Hook | `mcpServers.zai-vision` + `hooks.UserPromptSubmit` |
| `~/.claude/CLAUDE.md` | 模型行为规则 | 识图工具说明 + 频率控制规则 |
| `~/.claude/hooks/visual-auto-detect.ps1` | 自动检测 + 限流 | 图片路径正则 + 客户端限流器 |

Codex 侧需要改的文件：

| 文件 | 作用 | 改动内容 |
|------|------|----------|
| `~/.codex/config.toml` | MCP 配置 | `command` 改为 `cmd` |
| `~/.codex/models.json` | 模型能力声明 | `input_modalities` 加 `"image"` |
| `~/.codex/CLAUDE.md`（如有） | 模型行为规则 | 同 Claude Code 的频率控制规则 |

---

## 八、验证步骤

1. **确认 MCP 可用**：工具列表中出现 `mcp__zai-vision__*` 工具
2. **确认 API Key**：`$env:Z_AI_API_KEY` 有值
3. **发一张截图测试**：模型应自动调用 zai-vision 工具分析
4. **连续发两张截图**：应串行分析（间隔 ≥ 5 秒），不应并发
5. **常见错误**：429（限流，等待 15 秒后重试 1 次）/ 401（Key 无效）

---

## 总结

> 三层互补架构：Hook 自动发现 → Skill 提供策略 → MCP 执行分析
> 三层防御 429：Hook 源头限流 → CLAUDE.md 行为限流 → 智谱 API

文本模型（DeepSeek v4 flash/pro）通过 MCP 工具完全可以实现识图，关键在于：
1. 让平台正确暴露 MCP 工具给模型
2. 让模型知道"何时调用哪个工具"
3. 客户端做好频率控制，避免触发 API 限流
