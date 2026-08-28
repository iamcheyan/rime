# 阶段 2 常用词覆盖层报告

- 规则版本：`common-frequency-v1`
- 生成 git commit：`ffb567f3f0a0d69b78f091218482d6c2ed52e004`
- 输出：`sbzr.chrome.extension/dicts/sbzr.common-frequency.dict.yaml`
- 覆盖层 SHA256：`eae45711bb8315b2f147064b5ee4f83aa0ede7dfaeca7f28ce734ceafef3cb2e`
- 生产入口修改前 SHA256：`6bb3e9d7cdafe7f3694c5ffedce6959d47776b27d767a02ed8e96c67e71abc56`（`sbzr.dict.yaml`），`89c66012f098498f04f6ae6c9835ff6289530595a0741bc4207928f452219d2c`（扩展 `dicts.js`）
- 选中文本数：`734`
- 输出 text+code 行数：`1022`（硬约束 500～2000）
- 输出权重范围：`2001`～`2998`；来源权重范围：`1153`～`99999`

## 来源与规则

- 主排序依据：`base.dict.yaml` 已有权重；不凭感觉重标原词库。
- 对每个入选 text，合并 `base.dict.yaml`、`sbzr.extended.common.dict.yaml` 与 `zdy.dict.yaml` 的全部唯一 `(text, code)`；canonical code 仅作为 `resource/常用字双拼拼音.db` 校验标记，不删除 alternate/unverified code。
- 仅选择 2～4 字、可由 canonical DB 推导、且不在 `banned_words.txt` 的候选；用户探针缺失时强制补入仍受 2000 行上限约束。
- 静态覆盖层映射到 2001～2998；运行时 `dynamic_freq` 仍在静态层之上。本次不读取私人数据库/动态文件。

## 统计

- 读取 base：`540270` 行；extended.common：`661860` 行；zdy：`17` 行。
- 入选文本多 code：`193`；多来源：`153`。
- canonical 行：`606`；alternate/unverified 保留行：`416`。
- 因探针补入：`我们, 这个, 可以, 现在, 因为, 所以, 如果, 已经, 自己, 没有, 需要, 问题, 应该, 设置, 文件, 中国`。

## 常用词探针

| text | rows | codes | canonical | output weights |
| --- | ---: | --- | --- | --- |
| 我们 | 1 | womf | womf | 2006 |
| 这个 | 3 | zege, zzg, zzge | zege | 2005 |
| 可以 | 2 | keyi, ky | keyi | 2001 |
| 现在 | 1 | xmzl | xmzl | 2004 |
| 因为 | 1 | ynwz | ynwz | 2007 |
| 所以 | 1 | soyi | soyi | 2007 |
| 如果 | 1 | rugo | rugo | 2005 |
| 已经 | 1 | yijy | yijy | 2002 |
| 自己 | 1 | ziji | ziji | 2007 |
| 没有 | 3 | moyb, myb, mzyb | mzyb | 2004 |
| 需要 | 1 | xuyk | xuyk | 2003 |
| 问题 | 1 | wfti | wfti | 2001 |
| 应该 | 1 | yygl | yygl | 2009 |
| 设置 | 1 | sezi | sezi | 2004 |
| 文件 | 1 | wfjm | wfjm | 2006 |
| 中国 | 2 | zsgi, zsgo | zsgi | 2002 |

## 回滚与安全

- 生成阶段只新增覆盖层与 manifest/report/rollback 文件，未修改原始 base/common、入口或扩展清单。
- 入口变更前回滚清单见 `sbzr.common-frequency.rollback.json`；阶段提交后优先 `git revert <stage2-commit>`。
- manifest 的 source SHA256 固定生成输入，便于复现和审计。
