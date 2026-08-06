# 上游源码复用台账

- 上游: @z_ai/mcp-server@0.1.4 (Apache-2.0)
- tarball SHA-256: 09E588A868F1C2B4DADE10F11AEE8D232F9E43E5C7BCEEE087635ACEDF37275C
- 生成日期: 2026-08-06

| 复用文件/模块 | 原版本 | 原许可证 | 修改点 | 为何复用 |
|---|---|---|---|---|
| build/prompts/*.js（8 个工具 Prompt） | 0.1.4 | Apache-2.0 | 由生成器转为 src/generated/upstream-prompts.ts 常量 | 已验证的视觉分析指令，避免重写导致输出漂移 |
| build/core/api-common.js（媒体消息构造、错误分类、withRetry 语义） | 0.1.4 | Apache-2.0 | 参考实现，未直接复制；Bridge 使用自身 contracts/file-input | 保持返回/错误形状兼容 |
| build/core/file-service.js（本地文件→Base64 data URL、大小/扩展名规则） | 0.1.4 | Apache-2.0 | 重新实现于 src/file-input.ts，增加 SHA-256/MIME 魔数校验 | 上游限制是 GLM 兼容基线 |
| build/core/chat-service.js（请求参数：thinking/temperature/top_p/max_tokens） | 0.1.4 | Apache-2.0 | 参考默认值；Bridge 默认关闭 thinking | 保证 GLM fallback 请求兼容 |