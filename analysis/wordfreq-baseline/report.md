# SBZR 词频基线报告

- 生成时间（UTC）：`2026-08-28T02:40:37.178874+00:00`
- 基线 git commit：`c663617000271bedcf1fb4f9dd940eec9153bde1`
- 词库文件数：`20`
- body 行数：`4663688`
- 唯一 text：`2338626`
- 唯一 text+code：`4221350`
- 重复 text+code 行：`442338`
- 同 text 异常行数：`1813188`（详见压缩 TSV）

## 各词库统计

| 文件 | body 行 | 唯一 text+code | 重复行 | 权重 min/median/p90/max |
| --- | ---: | ---: | ---: | ---: |
| `sbzr.chrome.extension/dicts/base.dict.yaml` | 540270 | 540270 | 0 | 1002/1102.0/1103/99999 |
| `sbzr.chrome.extension/dicts/chengyu.dict.yaml` | 65955 | 65955 | 0 | 1/1000/1000/1000 |
| `sbzr.chrome.extension/dicts/sbzr.extended.common.dict.yaml` | 661860 | 661860 | 0 | 0/140.0/274/999 |
| `sbzr.chrome.extension/dicts/sbzr.extended.diming.dict.yaml` | 21075 | 21075 | 0 | 0/1/208/775 |
| `sbzr.chrome.extension/dicts/sbzr.extended.duoyin.dict.yaml` | 2929 | 2929 | 0 | 1/310/550/4330 |
| `sbzr.chrome.extension/dicts/sbzr.extended.lianxiang.dict.yaml` | 0 | 0 | 0 | None/None/None/None |
| `sbzr.chrome.extension/dicts/sbzr.extended.shici.dict.yaml` | 312 | 312 | 0 | 1/16.0/152/377 |
| `sbzr.chrome.extension/dicts/sbzr.extended.wuzhong.dict.yaml` | 5489 | 5489 | 0 | 0/81/128/708 |
| `sbzr.chrome.extension/dicts/sbzr.len1.dict.yaml` | 816 | 816 | 0 | 50000/50493.0/50894/50999 |
| `sbzr.chrome.extension/dicts/sbzr.len1.full.dict.yaml` | 816 | 816 | 0 | 50000/50493.0/50894/50999 |
| `sbzr.chrome.extension/dicts/sbzr.len2.dict.yaml` | 63925 | 63925 | 0 | 1000/1000/1398/1812 |
| `sbzr.chrome.extension/dicts/sbzr.rimeice.12字.dict.yaml` | 66247 | 66247 | 0 | 2000/2100/2395/2999 |
| `sbzr.chrome.extension/dicts/sbzr.rimeice.3字.dict.yaml` | 1134481 | 1134481 | 0 | 2000/2100/2200/2999 |
| `sbzr.chrome.extension/dicts/sbzr.rimeice.4字.dict.yaml` | 1186995 | 1186995 | 0 | 2000/2100/2100/2999 |
| `sbzr.chrome.extension/dicts/sbzr.rimeice.5字+.dict.yaml` | 912467 | 912467 | 0 | 2000/2100/2100/2999 |
| `sbzr.chrome.extension/dicts/sbzr.shortcut.dict.yaml` | 7 | 7 | 0 | 1999/1999/1999/1999 |
| `sbzr.chrome.extension/dicts/sbzr.single.dict.yaml` | 27 | 27 | 0 | 50000/50014/50014/50014 |
| `sbzr.chrome.extension/dicts/sbzr.userdb.dict.yaml` | 0 | 0 | 0 | None/None/None/None |
| `sbzr.chrome.extension/dicts/sbzr.userdb.full.dict.yaml` | 0 | 0 | 0 | None/None/None/None |
| `sbzr.chrome.extension/dicts/zdy.dict.yaml` | 17 | 17 | 0 | 0/0/0/0 |

## 常用词探针

| text | rows | codes | weights |
| --- | ---: | --- | --- |
| 我们 | 1 | womf | 1633 |
| 这个 | 3 | zege, zzg, zzge | 1553, 1013 |
| 可以 | 4 | keyi, ky | 50014, 1183, 0 |
| 现在 | 1 | xmzl | 1463 |
| 因为 | 1 | ynwz | 1753 |
| 所以 | 1 | soyi | 1753 |
| 如果 | 1 | rugo | 1513 |
| 已经 | 1 | yijy | 1233 |
| 自己 | 1 | ziji | 1793 |
| 没有 | 3 | moyb, myb, mzyb | 1413, 1013 |
| 需要 | 1 | xuyk | 1353 |
| 问题 | 1 | wfti | 1153 |
| 应该 | 1 | yygl | 1953 |
| 设置 | 1 | sezi | 1463 |
| 文件 | 1 | wfjm | 1603 |
| 中国 | 2 | zsgi, zsgo | 1223, 931 |

## 安全与回滚

- 本次只读 `sbzr.chrome.extension/dicts/*.dict.yaml`、入口/schema/Lua 文件；未读取私人 userdb、LevelDb 或动态频率文件。
- 生产词库与排序入口在生成基线时未修改。
- `same_text_anomalies.tsv.gz` 保留同 text 多 code、多来源、多权重记录；不以 text 静默去重。
- 回滚范围与基线 SHA256 见 `rollback-manifest.json`；后续阶段优先使用对应阶段 commit 的 `git revert`。
