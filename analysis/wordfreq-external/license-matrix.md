# 外部来源许可矩阵

审计日期：2026-08-28。`可作数值参考` 不等于 `可直接再分发原始数据`；软件仓库的 LICENSE 也不自动授予其中第三方词库内容的权利。

| 来源/用途 | 许可证据 URL | 数据许可结论 | 本次处理 | 再分发边界 |
| --- | --- | --- | --- | --- |
| Sogou 官方 SCEL/公开细胞词库 | 官方帮助 <https://pinyin.sogou.com/help.php?list=6&q=2>；创建/上传条款 <https://pinyin.sogou.com/dict/create_personal.php>；通用协议（范围不确定）<https://www.sogou.com/docs/user.htm> | **unknown / restricted**。官方页面说明可下载/安装，不给开放许可或下载者再分发授权；第三方内容权利不明。SCEL 数字字段语义亦 unknown。 | 不下载 payload，不进 `external_comparison.tsv`。 | 仅用户自有输入可在本地临时统计；不入库、不提交、不进同步包。获得明确授权前禁止公共/商业再分发。 |
| Rose SCEL parser | <https://raw.githubusercontent.com/nopdan/rose/master/LICENSE>（GPL-3.0，格式证据见 <https://raw.githubusercontent.com/nopdan/rose/master/format/sogou_scel/README.md>） | **software license only**；不能授权 Sogou 词库 payload。 | 只引用格式/字段证据。 | 代码许可与 SCEL 内容权利分开审阅。 |
| 官方 `rime/rime-luna-pinyin` | API <https://api.github.com/repos/rime/rime-luna-pinyin>（LGPL-3.0）；<https://raw.githubusercontent.com/rime/rime-luna-pinyin/master/LICENSE>；上游说明 <https://raw.githubusercontent.com/rime/rime-luna-pinyin/master/AUTHORS> | **可参考，条件性再分发**。仓库 LGPL-3.0；AUTHORS 明列 Chewing LGPL、OpenCC/Android Pinyin IME Apache-2、MoeDict CC0 等，但词典头部还致谢其他来源，需保留署名/许可证并核对完整上游链。 | 纳入比较；不覆盖 SBZR 权重。 | 若导出候选层，随附 LGPL/NOTICE、上游归因和变更说明；优先只保留统计摘要。 |
| 官方 `rime/rime-essay` preset | API <https://api.github.com/repos/rime/rime-essay>；LICENSE <https://raw.githubusercontent.com/rime/rime-essay/master/LICENSE>；AUTHORS <https://raw.githubusercontent.com/rime/rime-essay/master/AUTHORS> | **可参考，条件性再分发**。LGPL-3.0 与 AUTHORS 提供上游归因；weight 是 Rime preset 的候选权重，仓库不定义为统一语料计数。 | 纳入比较。 | 不把其数字直接映射为 SBZR 绝对权重；再分发需遵守 LGPL/归因。 |
| `rime-aca/dictionaries` 社区扩展 | API <https://api.github.com/repos/rime-aca/dictionaries> 返回 `license: null`；README <https://raw.githubusercontent.com/rime-aca/dictionaries/master/README.md>；代表文件 <https://raw.githubusercontent.com/rime-aca/dictionaries/master/luna_pinyin.dict/luna_pinyin.extended.dict.yaml> | **unknown**。有多来源致谢、无仓库许可和逐源授权；weight 单位/方法也不清楚。 | 仅做社区格式/风险参考，不下载、不比较、不生成候选。 | 不纳入公共或商业词频层，除非逐源取得许可。 |
| `zkqiang/rime-dict` 聚合 | API <https://api.github.com/repos/zkqiang/rime-dict>；README <https://raw.githubusercontent.com/zkqiang/rime-dict/master/README.md> | **unknown**。`license: null`，多来源聚合与错误/重复说明不能替代许可。 | 不纳入。 | 禁止把仓库公开状态当作再分发许可。 |
| SUBTLEX-CH WF 统计 | PLOS <https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0010729>；Figshare <https://api.figshare.com/v2/articles/517680>；CC BY 4.0 <https://creativecommons.org/licenses/by/4.0/> | **可作统计派生参考，署名条件**。Figshare 记录 CC BY 4.0；论文同时有 research-purpose 表述，字幕原文上游权利需单独避免。 | 纳入 `WCount` 比较；只存派生统计和 hash。 | 不提交字幕原文/压缩包；保留作者、论文、数据链接、许可证、变更说明；商业发布前复核上游。 |
| Leipzig Corpora Collection API | OpenAPI <https://api.wortschatz-leipzig.de/ws/v3/api-docs>（`info.license` CC BY 4.0）；使用条款 <https://wortschatz-leipzig.de/usage> | **可作统计参考，署名条件**；具体 Mandarin corpus 包仍需按年份/上游内容复核。 | 调查记录，未下载大包或纳入本次数值。 | 优先保留 `word/freq` 统计；按 CC BY 归因并遵守具体包条款。 |
| CppJieba `jieba.dict.utf8` | MIT <https://raw.githubusercontent.com/yanyiwu/cppjieba/master/LICENSE>；字段说明 <https://raw.githubusercontent.com/yanyiwu/cppjieba/master/README.md> | **条件性可作参考**。代码仓库 MIT，README 明确“词语 词频 词性”；随附数据的独立上游来源/许可没有更细说明。 | 纳入比较；仅保留比较统计/重合词。 | 保留 MIT 署名；商业再分发前核对随附字典的独立权利和上游来源。 |

## 决策

- **纳入数值比较**：SUBTLEX-CH、官方 Rime essay、CppJieba；三者字段都是“统计/权重数值”，但量纲不同，相关系数只表示排名一致性，不表示可直接换算。
- **不纳入数值比较**：Sogou、`rime-aca/dictionaries`、`zkqiang/rime-dict`。原因分别是 payload/字段语义 unknown，以及仓库/上游许可和方法 unknown。
- **不自动接入生产**：本目录是 dry-run 审计产物；没有改 `sbzr.dict.yaml`、原词库、Lua、schema 或扩展入口。
