# Rime 词库深度 Review（sbzr 全家桶 + sbzr_mix + jaroomaji/easy_en）

## 背景

仓库：`~/development/rime-study`（声笔自然 sbzr 双拼顶功为核心，中日英混输，
配套 Nova Editor Chrome 扩展双端同步词频）。442MB，其中词库是大头。

**用户诉求**：对 rime 词库做一次系统性 review——质量、结构、编码正确性、冗余、
性能。这是 review 任务，不是重写任务：**发现问题、量化问题、给出可执行的修复
清单**，除非小修不然不直接大改。

## 一、词库清单（重点对象）

`sbzr.chrome.extension/dicts/` 下（wc -l 实测 2026-08-17）：

| 文件 | 行数 | 大小 |
|---|---|---|
| sbzr.rimeice.4字.dict.yaml | 1,187,008 | 29M |
| sbzr.rimeice.3字.dict.yaml | 1,134,494 | 23M |
| sbzr.rimeice.5字+.dict.yaml | 912,480 | 28M |
| sbzr.extended.common.dict.yaml | 661,877 | 14M |
| base.dict.yaml | 540,287 | 11M |
| sbzr.rimeice.12字.dict.yaml | 66,260 | 912K |
| chengyu.dict.yaml | 65,972 | 1.5M |
| sbzr.len2.dict.yaml | 63,932 | 1.1M |
| sbzr.extended.diming.dict.yaml | 21,091 | 404K |
| sbzr.extended.wuzhong.dict.yaml | 5,505 | 108K |
| sbzr.extended.duoyin.dict.yaml | 2,945 | 60K |
| sbzr.len1.dict.yaml / sbzr.len1.full.dict.yaml | 840+ | 16K+ |
| sbzr.shortcut / sbzr.single / sbzr.extended.shici 等 | 小 | — |

根目录：`sbzr.dict.yaml`（主入口 import 表）、`jaroomaji.dict.yaml`（日语）、
`easy_en.dict.yaml`（英文）。schema：`sbzr.schema.yaml`、`sbzr_mix.schema.yaml`、
`jaroomaji.schema.yaml`、`easy_en.schema.yaml`。

## 二、Review 维度（每个都要量化，不要"感觉"）

### A. 结构与一致性
1. `sbzr.dict.yaml` 的 import 列表 vs 实际文件：有没有 import 了不存在的文件、
   存在但没被 import 的孤儿词库。
2. 每个词库的 YAML 头（name/version/import_tables）是否与文件名/入口一致。
3. 跨词库**重复词条**：同一 word+code 出现在多个文件（rimeice.3字 vs
   extended.common 最可疑）；同 word 不同 code（多音/多形）；同 code 大量
   同码词。用脚本全量扫，输出 top 重复榜和总数。
4. len1/len2/len1.full 与 base 的单字双字是否重复收录。

### B. 编码正确性（sbzr 顶功规则）
编码规则见 `documents/sbzr_encoding_rules.md` 与 AGENTS.md §4：
- 单字：声母+韵母+首笔+次笔（4码）；二字词：声1韵1声2韵2；三字词：声1声2声3韵3；
  多字词：声1声2声3末声。
- 抽查脚本：对每个词库抽样（如每文件随机 2000 条 + 全量头部 200 条），
  用独立实现的 sbzr 编码器（照规则文档写，勿抄 schema）重算 code，
  对比不一致的条目，按文件统计错误率。重点：rimeice 转换来的大文件、
  duoyin（多音字）、len1.full。
- 检查 code 长度分布是否符合文件名宣称（3字文件里不该有 4 字词等）。

### C. 权重与排序
1. 权重分布统计（直方图/分位数）：有没有权重全 1 的死词库、权重离谱的 outliers。
2. `adjust_weights.py` 是既有的调权脚本——读它，评估其策略是否与词库现状匹配。
3. 重复词条权重是否互相矛盾（同词同码不同权重的分布）。

### D. 冗余与瘦身
1. rimeice 三个大文件合计 ~330 万行——其中多少是超生僻/极少用词条？
   按字频表（若有）或权重分布评估可裁剪比例，给出"裁剪不影响前 95% 输入"的
   保守线。
2. 12字.dict.yaml（6.6万行 12 字词）实际使用价值评估。
3. .gitignore 已排除的运行时产物 vs 仓库里 442M 的实际构成：哪些该出库
   （LFS/子模块/或彻底不跟踪），git 仓库当前 .git 体积。

### E. 性能
1. 词库总量 → 部署后 bin 体积、Rime 部署编译时间（可实测 `./rebuild` 计时，
   但注意 rebuild 会动用户配置——改为读 schema 的translator/dictionary 配置
   评估，或先问）。
2. 同码词极多的 code（top 50）——影响选字效率。

### F. sbzr_mix / jaroomaji / easy_en
1. jaroomaji.dict.yaml 只有 562B——够不够覆盖常用日语？schema 里是否有
   内建 romanization 逻辑弥补。
2. easy_en 两个词库（words/extra）与主词库的冲突。
3. sbzr_mix 的路由规则（纯小写→easy_en 等）有无误路由的边界 case
   （读 schema 的 speller/algebra 判断）。

### G. 双端同步链路健康度
AGENTS.md §5：`dicts/sbzr.txt`（习惯源）与 `sync/sbzrExtension/sbzr.txt`（反馈）。
检查两文件存在性、条数、最后同步时间（git log），格式是否符合 rime userdb
snapshot 格式（`\t词\tcode\tweight` 行式）。

## 三、产出（写进仓库）

`review/RIME_DICT_REVIEW.md`，结构：
1. 执行摘要（一页内：整体结论 + 红黄绿灯）
2. 量化数据表（各维度）
3. 问题清单（按严重度 P0/P1/P2 排序，每条带证据样例和修复建议）
4. 建议的修复顺序与预估工作量

辅助脚本放 `review/scripts/`（去重扫描、编码校验器、权重统计），可重复执行。

## 四、红线

- **只读为主**：不动 dicts/ 下任何词库内容；不跑 `./rebuild`（会改用户
  运行环境）；不跑 `./push`；不动 sync/。
- 仓库是用户日常输入法配置——任何写操作仅限 `review/` 目录与临时 /tmp。
- 大文件处理用流式脚本，别一次 cat 29M 文件进内存。
- git：不 push；review 文档写完后 commit 到本地（信息中文）。

## 五、验收

- RIME_DICT_REVIEW.md 有真实数字（重复条数、错误率、权重分位）而非定性描述
- 每个 P0/P1 问题至少 3 条真实词条样例（文件+行号）
- 脚本可重跑：`python3 review/scripts/xxx.py` 直接输出同样结论
