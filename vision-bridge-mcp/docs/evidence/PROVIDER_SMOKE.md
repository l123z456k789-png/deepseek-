# Provider 真实 smoke 记录（最终版）

- 日期: 2026-08-06 04:51 UTC+8
- 方法: scripts/provider-smoke.mjs（REAL_API_TESTS=1），走真实路由
- MiMo Key: 用户环境变量 MIMO_API_KEY + MIMO_API_KEY_2（双 Key 轮换，值不落盘/不入 Git）

## 结果

```text
MIMO_IMAGE=PASS  (latency 12741ms; prompt_tokens=1353, cached_tokens=1344, completion_tokens=297, reasoning_tokens=0)
MIMO_VIDEO=PASS  (latency 5341ms;  prompt_tokens=1020, cached_tokens=960,  completion_tokens=74,  reasoning_tokens=0)
ZHIPU_IMAGE=PASS (latency 3908ms;  reasoning_tokens=0)
ZHIPU_VIDEO=PASS (latency 6034ms)
```

## 结论

- MiMo thinking=disabled 被 API 接受（reasoning_tokens=0），未触发 400/失败。
- MiMo Prompt Cache 真实命中：cached_tokens 占 prompt_tokens 约 99%，可量化。
- 双 Key 轮换已实现：MIMO_API_KEY 优先；401/403/402/429 时自动切换 MIMO_API_KEY_2（53 项测试覆盖）。
- 本次主 Key 直接成功，未触发轮换。
- 智谱此前 429 为高峰间歇；本次图片+视频均通过。
- 密钥安全: 未写入源码/测试/fixtures/日志/报告；仅存在于 Windows 用户环境变量。