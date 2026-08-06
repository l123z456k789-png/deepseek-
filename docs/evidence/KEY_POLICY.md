# MiMo 多 Key 轮换策略

- 顺序（固定，无例外）:
  1. MIMO_API_KEY（主）
  2. MIMO_API_KEY_2
  3. MIMO_API_KEY_3 —— 最后使用（last resort），仅在 1、2 均失败（401/403/402/429）后才启用
- 轮换由 MimoProvider.runWithKeyRotation 实现，单次请求内按序尝试，最多依次用完所有 Key。
- Key 值不落盘、不进 Git、不进日志；仅存在于 Windows 用户环境变量（User 级）。
- 变更 Key 顺序/数量必须同时更新: src/config.ts, src/providers/mimo.ts, tests/unit/providers.test.ts, scripts/install-codex.ps1, scripts/verify-install.ps1。