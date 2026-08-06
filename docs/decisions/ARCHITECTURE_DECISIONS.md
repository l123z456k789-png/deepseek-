# 架构决策记录（ADR）

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
