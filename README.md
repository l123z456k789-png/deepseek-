# deepseek-

个人技术实验 / 文档仓库（私有）。

## 内容

| 路径 | 说明 |
|---|---|
| `zai-vision-guide/` | 原 zai-vision 识图 MCP 配置指南（第一版，保留） |
| `vision-bridge-mcp-agent-execution-plan-lean-v3-2026-08-06.md` | Vision Bridge MCP 实施计划 —— 实战验证版 v2（MiMo 主 + 智谱兜底，含已验证事实与避坑经验） |
| `vision-bridge-mcp-agent-execution-plan-lean-v3-2026-08-06.first.md` | 同一计划的初版存档（经验改写前版本，保留不删） |

## 背景

Claude Code / Codex 通过 MCP 工具识图：文本模型只需把图片路径传给 `mcp__zai-vision__*`，由 MCP 服务端调用视觉 API 返回文字结果。

Vision Bridge MCP 是升级版：MiMo-V2.5 主调用、GLM-4.6V-Flash 程序化兜底、多 Key 轮换、熔断限流与缓存，已真实部署并验证（图片/视频真实 smoke 全部通过）。