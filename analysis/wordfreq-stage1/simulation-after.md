# 阶段 1 离线排序模拟（after）

- 规则版本：`stage1-quality-window-v1`
- quality tie-window：`100`
- length buffer：`512`
- dynamic scan：旧规则 `64`，提议规则 `512`
- 生产 Lua SHA256（本次运行）：`c957401836dea014e585c848edf0d19f443ed3c1fc9c9664f962b0a0bd7f7fc9`
- dynamic_freq.lua SHA256（本次运行）：`ad465e5deba29b693259c9d626b60a83dda88525ab7276f186867faa1857344b`
## 结果摘要

| case | 输入数 | old top | new top | old/new 均保留候选 |
| --- | ---: | --- | --- | :---: |
| `large_quality_gap_cross_length` | 2 | 低频短, 高频长词 | 高频长词, 低频短 | 是 |
| `near_tie_prefers_shorter` | 2 | 低频短, 高频长词 | 低频短, 高频长词 | 是 |
| `same_quality_stable` | 3 | 甲, 丙, 甲乙 | 甲, 丙, 甲乙 | 是 |
| `dynamic_selected_beyond_old_scan` | 65 | 短词00, 短词01, 短词02 | 已选长词, 短词00, 短词01 | 是 |
| `dynamic_low_quality_beyond_scan` | 65 | 短词00, 短词01, 短词02 | 短词00, 短词01, 短词02 | 是 |
| `completion_is_not_dropped` | 2 | 表词, 补全长词 | 表词, 补全长词 | 是 |
| `same_text_multiple_codes` | 3 | 可以, 可以, 可以 | 可以, 可以, 可以 | 是 |
| `actual_probe_quality_samples` | 5 | 中国, 中国, 应该 | 应该, 自己, 已经 | 是 |
| `buffer_boundary_preserves_tail` | 513 | 候选000, 候选001, 候选002 | 候选006, 候选013, 候选020 | 是 |

## 关键证据

- 大权重差跨长度：old 首位为 `低频短`，new 首位为 `高频长词`。
- 小窗口（差值 1）：new 按短词 tie-break，首位为 `低频短`。
- dynamic 高质量选词 `dynamic_selected_beyond_old_scan`：old 在第 `未扫描到` 位，new 在第 `1` 位；quality-first 使其进入扫描窗口。
- dynamic 低质量选词 `dynamic_low_quality_beyond_scan`：候选静态质量为 900、排在第 65 位；旧 64 扫描未提升，提议 512 扫描可提升到首位。
- 同 text 多 code case 的候选数与 text multiset 均保持不变；模拟器不执行去重或删除。
- completion case 作为普通候选参与排序，不被模拟器过滤。

## tie-window 敏感性

敏感性结果只用于证明窗口是显式参数；生产修改不批量改写词库权重。

| case | window=0 | window=50 | window=100 | window=200 |
| --- | --- | --- | --- | --- |
| `large_quality_gap_cross_length` | 高频长词 / 低频短 | 高频长词 / 低频短 | 高频长词 / 低频短 | 高频长词 / 低频短 |
| `near_tie_prefers_shorter` | 高频长词 / 低频短 | 低频短 / 高频长词 | 低频短 / 高频长词 | 低频短 / 高频长词 |
| `actual_probe_quality_samples` | 应该 / 自己 / 已经 | 应该 / 自己 / 已经 | 应该 / 自己 / 已经 | 应该 / 自己 / 已经 |

## 边界与限制

- Python 仅模拟 filter 可见的 `cand.text`、`cand.quality`、`cand.type` 等字段；不声称替代 live Rime candidate menu。
- new 规则只重排前 512 个候选，尾部保持原顺序，沿用旧过滤器的性能边界。
- dynamic 仍位于 length filter 之后；提议把扫描上限从 64 提高到 512，与 length filter 缓冲一致。超过 512 的动态候选仍是已知边界，需后续实测决定是否调整扫描策略。
- 未读取私人 LevelDb、`dynamic_freq.local.txt`、userdb 或同步目录。
