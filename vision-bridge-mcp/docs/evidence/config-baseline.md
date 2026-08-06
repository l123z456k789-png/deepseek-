# 配置与上游基线快照

- 生成时间: 2026-08-06
- 本文件只记录哈希与结构性事实，不记录任何密钥值。

## 上游
- package: @z_ai/mcp-server@0.1.4（npm latest = 0.1.4，基线无漂移）
- 计划文件: EXECUTION_PLAN.md SHA256=D65418DDC86F62AA9A1124FBED403F0A302E21FC2733366CA2933B9616D6DCBE

## Claude Code
- ~/.claude.json SHA256=E561B81B70AFC4B9BB13386EB8A6C5DD1C5BF6EA973512772A023212417702B9
  - mcpServers.zai-vision: stdio; command=cmd; args=/c npx -y @z_ai/mcp-server@latest; env=Z_AI_MODE=ZHIPU, Z_AI_VISION_MODEL=glm-4.6v-flash（不含密钥）
- ~/.claude/settings.json SHA256=3B9DF07DEAC2391456EDEA1982FAC8307584554088DE95E6DB034AC866253D81
  - hooks 等行为配置，不含 MCP 注册

## Codex
- ~/.codex/config.toml SHA256=F1E1AC8A83A85F771AD91F84213ED06CCD95956081F010F0F421D1BC83C04E7F
  - [mcp_servers.zai-vision]: command=npx; args=-y @z_ai/mcp-server@latest; env=Z_AI_MODE/Z_AI_VISION_MODEL; env_vars=[Z_AI_API_KEY]; enabled=true
- ~/.codex/models.json SHA256=5D7804539E572A30BE53515CB672EA6B7DCE6741FD6ACCFA0B99F4D50BBC68DB
  - deepseek-v4-flash / deepseek-v4-pro: input_modalities=[text]

## 环境变量（只记录存在性）
- Z_AI_API_KEY=SET(len=49)
- MIMO_API_KEY=NOT_SET