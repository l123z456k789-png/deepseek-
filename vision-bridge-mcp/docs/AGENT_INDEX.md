# AGENT_INDEX

核心文件路径:
- EXECUTION_PLAN.md: 唯一权威实施计划，改动须用户明确授权
- CURRENT_STATE.md: 唯一权威状态文件
- docs/AGENT_INDEX.md: 本文件
- docs/decisions/ARCHITECTURE_DECISIONS.md: ADR 记录
- docs/evidence/: 唯一权威证据目录（P0 起创建）

每个文件的一行职责:
- EXECUTION_PLAN.md: 冻结架构、阶段 Gate、任务块与禁止事项
- CURRENT_STATE.md: 当前阶段、HEAD、阻塞与下一步
- ARCHITECTURE_DECISIONS.md: 不可逆/高风险架构决策
- docs/evidence/COMPATIBILITY_BASELINE.md: 上游协议与兼容证据
- docs/evidence/CACHE_METRICS.md: 缓存与性能指标

主要入口: EXECUTION_PLAN.md 第 0 节 + CURRENT_STATE.md

定向测试命令: P0 探针 node scripts/upstream-probe.mjs <entry> list tests/fixtures/upstream；P1 起 npm test -- <target>

禁止读取目录: node_modules, dist, coverage, .audit

权威 evidence 路径: docs/evidence/