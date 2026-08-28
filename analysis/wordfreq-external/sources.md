# 外部词频参考来源（审计记录）

抓取/访问日期：**2026-08-28 UTC**。本文件只记录公开页面、字段和许可证据；没有把搜狗 SCEL、原始语料或私人数据复制到仓库。

## 1. 搜狗 / 搜狗细胞词库（只做来源研究，不进入数值比较）

- 官方目录：<https://pinyin.sogou.com/dict/>；官方详情页示例：<https://pinyin.sogou.com/dict/detail/index/4>。页面展示“输入指数”、下载数、词条数、大小、版本和更新时间，但没有声明这些指标等于 SCEL 内嵌数值，也没有公开字段换算规则。**下载量绝不是词频**。
- 官方帮助：<https://pinyin.sogou.com/help.php?list=6&q=2> 说明细胞词库文件扩展名为 `.scel`，下载后双击安装。官方创建页：<https://pinyin.sogou.com/dict/create_personal.php> 说明公开词库可被浏览、查询和下载，并规定上传者须保证不侵权；页面没有给下载者一个开放许可或再分发授权。
- 可复核的第三方格式说明：Rose 的 GPL-3.0 项目 README/格式文档 <https://raw.githubusercontent.com/nopdan/rose/master/format/sogou_scel/README.md>；解析代码 <https://raw.githubusercontent.com/nopdan/rose/master/format/sogou_scel/sogou_scel.go>。证据显示 SCEL 使用小端整数、UTF-16LE 字符串、拼音索引和词条扩展字段；解析器把扩展字段中的 uint32 叫作 `frequency`。
- 词频语义仍是 **unknown**：上述解析器命名不等于官方定义；反向工程笔记 <https://gist.github.com/jiqiujia/436c8a64c16eedf92685ca3563d687db> 明确对扩展字段是否为词频表示不确定。更强的反例是 MIT 的生成器 <https://raw.githubusercontent.com/nopdan/scel-maker/master/main.go> 固定写入 `0x2d`（45），而非从语料估计的计数。故不能把该字段当作可跨词库比较的语料计数、概率或排名。
- 转换软件仅代表软件许可，不代表词库内容许可：GPL-3.0 的 imewlconverter 及 SCEL 说明 <https://github.com/studyzy/imewlconverter/wiki/Sougou_Pinyin>；MIT 的 scdtool <https://github.com/Jetcser/scdtool>。官方通用搜狗协议 <https://www.sogou.com/docs/user.htm> 含非商业、非转让及未经许可不得复制/分发的限制，但其页面是搜狗搜索服务协议，不应冒充 SCEL 专门许可；对 SCEL 内容适用性标为 **unknown/restricted**。
- 结论：不下载、不提交原始 SCEL；不把“输入指数”或下载量作为词频；若用户坚持利用自有搜狗输入历史，只允许在本地解析、临时计算、临时排序，不能写入仓库词库、公共候选层或同步包，除非获得内容权利人明确授权。

## 2. Rime 社区与官方带 weight 词库

- 官方朙月拼音仓库：<https://github.com/rime/rime-luna-pinyin>；机器可读许可证据 <https://api.github.com/repos/rime/rime-luna-pinyin> 为 LGPL-3.0，许可证文本 <https://raw.githubusercontent.com/rime/rime-luna-pinyin/master/LICENSE>。词典头部 <https://raw.githubusercontent.com/rime/rime-luna-pinyin/master/luna_pinyin.dict.yaml> 声明 `sort: by_weight`、`use_preset_vocabulary: true`，并列出多个上游来源。
- 实际 preset 词频表：<https://github.com/rime/rime-essay>、API 许可 <https://api.github.com/repos/rime/rime-essay>、数据 <https://raw.githubusercontent.com/rime/rime-essay/master/essay.txt>、上游许可说明 <https://raw.githubusercontent.com/rime/rime-essay/master/AUTHORS>。`essay.txt` 是 text + 数字 weight；仓库没有把数字定义为统一语料单位。Rime 格式/语义证据 <https://github.com/rime/home/wiki/RimeWithSchemata>：`sort: by_weight` 使用词频排序，第三列是非负整数频率或相对 preset 的百分比。
- `rime-aca/dictionaries` 社区扩展：API <https://api.github.com/repos/rime-aca/dictionaries> 返回 `license: null`；README <https://raw.githubusercontent.com/rime-aca/dictionaries/master/README.md> 没有许可；代表文件 <https://raw.githubusercontent.com/rime-aca/dictionaries/master/luna_pinyin.dict/luna_pinyin.extended.dict.yaml> 虽有上游致谢和 weight，却没有数据再分发授权，且大量数字只是 1/2，没有单位或生成方法。只能作为格式/候选行为参考，不能作为本项目可再分发频率层。
- `zkqiang/rime-dict` 也应保守处理：API <https://api.github.com/repos/zkqiang/rime-dict> 为 `license: null`，README <https://raw.githubusercontent.com/zkqiang/rime-dict/master/README.md> 描述多来源聚合但未给许可或可审计频率方法；不纳入数值比较。

## 3. 许可清晰的中文频率/语料统计

### SUBTLEX-CH（本次数值比较）

- 论文与数据说明：<https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0010729>；补充 ZIP：<https://journals.plos.org/plosone/article/file?type=supplementary&id=10.1371/journal.pone.0010729.s002>；Figshare 元数据：<https://api.figshare.com/v2/articles/517680>；CC BY 4.0 deed：<https://creativecommons.org/licenses/by/4.0/>。
- 论文给出 6,243 部影片字幕上下文、约 46.8M 字符/33.5M 词；WF 文件字段为 `Word`, `WCount`, `W/million`, `logW`, `W-CD`, `W-CD%`, `logW-CD`。本脚本只使用 `WCount`（字幕语料出现次数），不使用下载量；它是字幕域统计，不是通用中文概率。
- Figshare 记录标注 CC BY 4.0；该许可允许分享/改编但要求署名、链接许可并标注变更（deed 同上）。论文页面另有 research-purpose 表述，且字幕原文可能涉及上游权利。因此仓库仅保留派生统计结果/重合词及来源 hash，不保留字幕文本；商业再分发前仍须审阅上游权利。

### Leipzig Corpora Collection（已调查，未作为本次下载输入）

- 官方 OpenAPI：<https://api.wortschatz-leipzig.de/ws/v3/api-docs>；交互文档：<https://api.wortschatz-leipzig.de/ws/swagger-ui/index.html>；词表接口：<https://api.wortschatz-leipzig.de/ws/words/{corpusName}/wordlist/?limit=N>。OpenAPI 的 `info.license` 明确 CC BY 4.0；接口说明明确返回按频率降序的 most frequent words，字段包括 `word`、`freq`。
- 中文语料目录：<https://wortschatz.uni-leipzig.de/en/download/Mandarin%20Chinese>；格式说明：<https://www.wortschatz.uni-leipzig.de/documents/Format_Download_File-eng.pdf>。该来源适合作为后续按年份/语域固定的频率验证；本次目录页受反爬/阅读器限制，故不下载大包，标记为“许可证据清晰、具体包需复核”。

### CppJieba 主词典（本次数值比较）

- 数据：<https://raw.githubusercontent.com/yanyiwu/cppjieba/master/dict/jieba.dict.utf8>；代码仓库许可：<https://raw.githubusercontent.com/yanyiwu/cppjieba/master/LICENSE>（MIT）；格式/语义说明：<https://raw.githubusercontent.com/yanyiwu/cppjieba/master/README.md>。README 明确主词典三列为“词语 词频 词性”，加载时词频转为对数权重供概率分词使用。
- 这是分词器主词典的词频表，不等于当前互联网曝光率；仓库没有另行声明该数据来自哪个可复核语料或给出统一时间窗。因此本报告将它作为 MIT 软件仓库随附的参考统计，并保留“来源方法不等于 SBZR 目标分布”的限制；若商业分发该数据，仍应复核仓库对随附词典的权利声明。

## 复现输入与排除项

脚本运行时从上述三个 raw URL 下载到系统临时目录 `/tmp/sbzr-wordfreq-external-cache/`（可用 `--cache-dir` 改变），并把 SHA-256、字节数、UTC 抓取时间写入 `manifest.json`。未下载搜狗词库 payload；未读取私人 userdb、LevelDb、动态频率文件。
