# SBZR 外部词频参考报告

- 研究/抓取日期：**2026-08-28 UTC**
- 目的：补足 base/common 之外的公开频率参考；不把任何外部数值直接覆盖 SBZR 权重。
- 复现脚本：`scripts/external_wordfreq_compare.py`
- 当前扫描对象：`sbzr.chrome.extension/dicts/*.dict.yaml`，排除 `sbzr.userdb*.dict.yaml`；未读取私人 userdb、LevelDb、动态频率文件。
- 当前扫描：4,664,710 条 body 行、2,338,626 个唯一 text。比 baseline 的 4,663,688 行多出的 1,022 行对应已存在的阶段 2 `sbzr.common-frequency` 覆盖层；唯一 text 与 baseline 一致。

## 结论先行

1. 外部排名与当前 SBZR 最大静态权重的 Spearman 相关均接近 0（-0.0056～0.0319）。这不是“外部数据无用”的证明，而是证据表明 SBZR 各来源权重不是统一统计量，不能做线性覆盖或直接加总。
2. SUBTLEX-CH 和 CppJieba 对日常词提供了大量“外部高、SBZR 相对低”的可审阅信号；反向信号主要由 SBZR 的 50,000 级单字/特殊层和 2,000/2,100 级 rimeice 层造成，不能直接解释为用户常用词。
3. Rime 官方 essay 的数字是 Rime preset candidate weight，不是有公开单位的现代语料计数；社区 `rime-aca/dictionaries` 和 `zkqiang/rime-dict` 许可为 null/unknown，不进入数值比较。
4. 搜狗 SCEL 的格式可由第三方工具解析，但字段真实词频语义和 payload 再分发权利均未得到可靠公开授权证据；只允许用户自有数据本地临时处理，不入库。

## 数值对照

`external_comparison.tsv` 每行是一个外部 text 与 SBZR 的重合项。SBZR 值取该 text 的最大静态 weight（保留所有 code；`sbzr_code_count` 记录同词编码数）；外部 rank 和 SBZR rank 均按数值降序、相同值取平均名次。分桶为从高到低的 10 个分位桶：1=最高，10=最低。`external_high_sbzr_low` 表示外部桶 1–3 且 SBZR 桶 8–10；`external_low_sbzr_high` 相反。

| 来源 | 外部条目 | 重合 | 外部覆盖率 | SBZR 覆盖率 | Spearman | 外部高/SBZR低 | 外部低/SBZR高 | 重合中同词多编码 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SUBTLEX-CH WF `WCount` | 99,121 | 64,643 | 65.22% | 2.76% | 0.01135 | 24,134 | 1,190 | 23,639 |
| Rime `essay.txt` weight | 442,693 | 132,602 | 29.95% | 5.67% | -0.00557 | 41,170 | 5,035 | 48,212 |
| CppJieba `jieba.dict.utf8` 词频 | 348,982 | 266,496 | 76.36% | 11.40% | 0.03191 | 78,305 | 2,470 | 120,514 |

这些 rank 只在各来源内部比较；三种外部字段量纲不同，不能互相加权。Rime 表缺少 pinyin code，故不能据此生成新的编码；本次 dry-run 缺失词候选的 `code` 留空，状态为 `review_only_no_code`，不接入方案。

## 重要异常（可复核）

`external_comparison.tsv` 每行是一个外部 text 与 SBZR 的重合项。SBZR 值取该 text 的最大静态 weight（保留所有 code；`sbzr_code_count` 记录同词编码数）；外部 rank 和 SBZR rank 均按数值降序、相同值取平均名次。分桶为从高到低的 10 个分位桶：1=最高，10=最低。`external_high_sbzr_low` 表示外部桶 1–3 且 SBZR 桶 8–10；`external_low_sbzr_high` 相反。
- CppJieba 高、SBZR 低：`一个`（142,747；1,793）、`他们`（93,969；1,923）、`国家`（79,520；1,523）、`发展`（68,664；1,763）、`工作`（66,367；1,713）、`问题`（55,563；2,001）。SUBTLEX 与 CppJieba 共同支持的日常词优先于单一来源信号。
- 外部低、SBZR 高：SUBTLEX 的单字 `诬`、`陋`、`蔗`、`阐` 等 WCount=1，但 SBZR max 约 50,9xx；Rime essay 大量低/零权重单字也落入该方向；CppJieba 的低频词 `泞`、`柒`、`囵` 等 frequency=2，以及若干 2,999 级条目。主要原因是 SBZR 的单字/特殊层绝对权重，不是外部来源证明这些词应被删除。
- 同词多编码不可静默去重：当前重合中 SUBTLEX 23,639、Rime 48,212、CppJieba 120,514 个 text 有多个 SBZR code。阶段 2 已验证的 `这个`、`可以`、`没有`、`中国` 等多编码仍应保留。

## 来源与法律边界

逐条 URL、抓取日期、字段含义和许可证证据见 `sources.md` 与 `license-matrix.md`。

- **Sogou**：官方页面确认 `.scel` 和公开下载/安装，但无开放再分发许可；Rose parser 的 GPL 仅许可软件；scel-maker 写死 45 的例子反证内嵌字段不能当语料计数。结论 unknown/restricted。
- **Rime 官方**：`rime-luna-pinyin`、`rime-essay` 的 API/许可证为 LGPL-3.0，AUTHORS 列出 Chewing/OpenCC/Android Pinyin IME/MoeDict 等上游许可。可作格式与 preset weight 参考，但没有统一语料单位。
- **Rime 社区扩展**：`rime-aca/dictionaries`、`zkqiang/rime-dict` API 均 `license: null`，多源致谢不等于再分发授权；只作风险/格式参考。
- **SUBTLEX-CH**：论文给出字幕语料范围和 WF 字段，Figshare 记录 CC BY 4.0；只使用 `WCount`，不存字幕。论文的 research-purpose wording 与字幕上游权利要求仍需在商业发布前复核。
- **CppJieba**：MIT LICENSE 与 README 明确三列“词语 词频 词性”，但随附字典更细的上游来源没有独立方法/许可说明；因此纳入参考，不将 MIT 软件许可过度解释为所有数据上游权利。
- **Leipzig Corpora Collection**：OpenAPI 明示 CC BY 4.0、wordlist 返回按频率降序的 `word/freq`；本次未下载具体中文大包，保留为后续可复核来源。

## 试运行候选

`dry_run_candidates.tsv` 有 450 行：每个许可条件较清晰的来源取 100 个外部高频且已有 SBZR code 的重排候选，另取 50 个外部高频但 SBZR 缺失的候选。前者标记 `review_only_existing_codes`，后者因故意不猜声笔编码而标记 `review_only_no_code`；两者都不能直接导入。没有生成或修改 `sbzr.dict.yaml`、Chrome 清单、原始词库、Lua 或 schema。

## 融合建议（不直接覆盖）
1. **先校准，再加成**：每个来源在固定语域/版本内取 `log1p(count)` 或已有 log 字段，转成来源内 percentile/z-score；不把 SUBTLEX `WCount`、CppJieba frequency、Rime weight 放在同一绝对坐标。按长度和字符集固定过滤，保留 source/version/hash。
2. **保守 source bonus**：对至少两个许可清晰来源共同支持、且已有合法 SBZR code 的 text，生成独立 dry-run 层；建议候选分数为 `base_score + source_bonus`，bonus 小于来源内一个分桶间距，避免压过用户层和编码真理。先做 500–2,000 词回归，不改旧行。
3. **个人动态频率最高**：`dynamic_freq`/实际选词历史是本地个性化层，优先于静态语料；采用单独的动态分值与时间衰减，不能用外部静态层清零或覆盖。私人数据永不提交；不要读取 LevelDb 做本次分析。
4. **同词多 code 保留**：统一 text 的外部信号后，对每个已有合法 code 只复制同一静态 bonus；canonical code 仍遵循 `resource/常用字双拼拼音.db` 的最高权重主音规则，不由外部词频决定。
5. **搜狗隔离**：在许可不明时，搜狗只可作为本地用户自有输入的临时参考；不得上传、提交、写入公共词库/同步包或生成可分发覆盖层。若以后获得明确授权，仍需单独记录授权文本与字段语义，再和许可清晰来源分层验证。
6. **门槛与回归**：只有候选输入排名改善、冷门完整编码仍可检索、同词多 code 未减少、Chrome/Rime 行为一致时，才考虑人工审阅后的独立覆盖层；本报告不授权自动接入。

## 复现与限制

```sh
python3 -m py_compile scripts/external_wordfreq_compare.py
python3 scripts/external_wordfreq_compare.py \
  --root "$(pwd)" \
  --out-dir analysis/wordfreq-external
```

下载缓存默认在 `/tmp/sbzr-wordfreq-external-cache/`，不在仓库。`manifest.json` 保存抓取 UTC、URL、SHA-256 和字节数；`metrics.json` 保存机器可读统计。重新运行会重新读取当前公开 URL，因此应以 manifest hash 固定一次审计快照。外部语域、分词、繁简转换和时代差异很大；低相关性是量纲/覆盖差异的诊断，不是对任何来源质量的单独裁决。
