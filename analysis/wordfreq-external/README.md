# 外部词频参考 dry-run

本目录是 SBZR 外部词频研究阶段的可审计产物，不是生产词频层。它没有修改 `sbzr.dict.yaml`、原始词库、Lua、schema 或 Chrome 扩展入口。

## 文件

- `sources.md`：搜狗/SCEL、Rime 官方与社区、SUBTLEX-CH、Leipzig、CppJieba 的 URL、抓取日期、字段语义和许可证据。
- `license-matrix.md`：数据 payload 与软件许可证分离后的使用决策。
- `external_comparison.tsv`：外部 text 与当前 SBZR 最大静态 weight 的重合对照，保留 `sbzr_code_count` 和 10 分位桶方向。
- `dry_run_candidates.tsv`：450 条小规模审阅候选（每个纳入来源 100 条已有 code 的高频重排 + 50 条缺失词）；缺 code 的词标为 `review_only_no_code`，已有 code 的词标为 `review_only_existing_codes`，不能直接导入。
- `report.md`：结果、异常和融合建议。
- `manifest.json`：生成时间、输入 URL、抓取文件 SHA-256/大小、排除项。
- `metrics.json`：机器可读覆盖率、Spearman、分桶异常和同词多编码统计。

## 运行

默认从公开 URL 下载到仓库外的 `/tmp/sbzr-wordfreq-external-cache/`，不会把原始外部文件写入 Git：

```sh
python3 -m py_compile scripts/external_wordfreq_compare.py
python3 scripts/external_wordfreq_compare.py \
  --root "$(pwd)" \
  --out-dir analysis/wordfreq-external
```

固定已有临时缓存时：

```sh
python3 scripts/external_wordfreq_compare.py \
  --no-fetch \
  --cache-dir /tmp/sbzr-wordfreq-external-cache \
  --out-dir analysis/wordfreq-external
```

缓存文件名为 `subtlex-ch-s1.zip`、`rime-essay.txt`、`cppjieba-jieba.dict.utf8`。脚本自动处理 SUBTLEX 补充包的编码，仅抽取 WF 的 `WCount`；不会下载搜狗 SCEL。默认路径由脚本位置推导，未写死任何用户目录。

## 解释边界

三种数值不是同一量纲：SUBTLEX 是字幕语料出现次数，CppJieba 是分词器主词典词频，Rime essay 是 preset candidate weight。Spearman 仅比较来源内排名，不能用来证明绝对权重可互换。SBZR 以同一 text 的最大 weight 做可比聚合，但所有编码仍在仓库中保留；同词多编码不能静默去重。

Sogou 页面和第三方 SCEL 工具只用于许可/格式研究；公开页面没有给出清晰的 payload 再分发授权和可验证词频单位。因此搜狗只能处理用户自有输入的本地临时数据，不能进入提交的词库或同步层。
