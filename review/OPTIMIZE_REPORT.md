# 词库优化落地报告（dict-optimize 分支）

- 分支：`dict-optimize`（基于 main `8ca3014`），每步独立 commit
- 日期：2026-08-17
- 红线遵守：未动 main；未跑 `./rebuild` / `./push`；未动 `sync/` 与
  `dicts/sbzr.txt`（用户习惯）；脚本全部 `review/scripts/optimize_*.py` 前缀，
  与 rimereview goal 的 `review/scripts/` 直属脚本无命名冲突。
  注：本 goal 工作区即 `~/development/rime-optimize`（dict-optimize 的 git
  worktree），`~/development/rime-study` 保持在 main，未做任何写操作。

## 总览

| 步骤 | commit | 量化结果 |
|---|---|---|
| 1. 跨词库去重 | `f994761` | 删除重复行 **442,337**；词条总数 4,663,688 → 4,221,351 |
| 2. rimeice 瘦身评估 | `e75d66c` | **0 条删除**（规则集为空，见关键发现） |
| 3. 词库头与 import 修正 | `f24408d` | 4 个 name 修正 + 1 个文件更名；校验器全绿 |
| 4. jaroomaji 扩容 | `50e3711` | **+551 条**核心词，mozc 交叉验证 512/512 |
| 5. shortcut/duoyin 一致性 | `90c80fc` | shortcut 重复 0；duoyin 冲突 0（2929/2929 全量） |

---

## 1. 跨词库去重（`optimize_dedup_scan.py`）

**方法**：SQLite 临时索引流式全量扫描 20 个 `.dict.yaml`（峰值内存 ~200MB，
未整表载入），键 = `(word, code)`。保留规则 = 权重最高者胜；同权重按
len1/len2 > base > extended.common > rimeice.* > 其他。保护文件（用户数据/
独立通道）shortcut / zdy / userdb / userdb.full 不参与删除。

| 文件 | 行数（前 → 后） | 删除 |
|---|---|---|
| sbzr.extended.common.dict.yaml | 661,878 → 219,543（13.0MB → 4.5MB） | 442,335 |
| base.dict.yaml | 540,288 → 540,287 | 1（`可以 keyi`，胜者 single 50014） |
| sbzr.len2.dict.yaml | 63,933 → 63,932 | 1（`跑通 pkts`，胜者 shortcut 1999） |

- 重复分布：rimeice.3字 ← extended.common 442,327 对；其余 10 对
  （样例见 `review/optimize_dedup_summary.json`）
- 复扫结果：非保护文件重复 = **0**；仅剩 zdy 通道内 1 条
  （`可以 keyi` 与 single 同键，zdy 不参与 sbzr 表，属设计）
- 删除清单备份：`review/removed/*.removed.tsv`（含原始行号，可精确回滚）
- 行为不变性论证：被删行与其保留行 (word,code) 完全相同且保留行权重
  ≥ 被删行 → Rime 合并词典后候选集与排序不变。

## 2. rimeice 生僻词瘦身（`optimize_rimeice_slim.py`）— 关键发现

**任务书假设与事实不符**：`sbzr.rimeice.12字.dict.yaml`（66,260 行）的
实际内容是 **1~2 字词**（生僻单字 42,119 条 + 生僻二字词 24,042 条），
文件名 "12字" 应读作 "1~2字"；文件内字长 ≥12 的词条数为 **0**，
按任务规则（≥12 字且默认权重）可删集合为空 → 删除 0 条，文件更名为
`sbzr.rimeice.1-2字.dict.yaml`（第 3 步 commit 一并完成）。

且去重后该文件每个词条都是其 (word, code) 的唯一载体——删任何一条都会
减少可输入词，保守不删是正确决策。

**留待 review goal 的量化结论**（`review/optimize_rimeice_stats.json`）：
- `5字+.dict.yaml`（912,467 条）中字长 ≥8 且权重=默认(2100) 的词条
  **35,205** 条，≥12 且默认权重 **256** 条 —— 按红线本次未动。

## 3. 词库头与 import 表修正（`optimize_import_check.py`）

- import 链核验：19 个 import 目标全部存在；**无** import 不存在文件的问题；
  孤儿 = 0（`zdy.dict.yaml` 为 lua/zdy_translator.lua 直读通道，非孤儿；
  `dicts.jp/*` 为 jaroomaji install 脚本按需下载，单独标注）。
- name 一致性修正 4 处（name → 与文件路径一致）：
  base(`xxsb`→`sbzr.chrome.extension/dicts/base`)、chengyu、sbzr.len2、
  sbzr.userdb(`sbzr`→路径名)。`sbzr.shortcut` 头部由扩展
  sbzr-core.js `FIXED_DICT_NAME` 重写，保持现状（豁免）。
- 校验器 `review/scripts/optimize_import_check.py` 当前输出全绿，可长期复用。

## 4. jaroomaji 词库扩容（`optimize_jaroomaji_core.py`）

**schema 分析结论**：`script_translator` + `speller.algebra` 派生——罗马字→日语
完全由词库驱动，schema 只负责拼写变体（Hepburn 由 algebra 从码派生）。
`jaroomaji.dict.yaml` 本身 0 词条，大表由 install 脚本下载且不入库 → 本地
无网安装时日语输入完全不可用，内置核心词是净增益。

- 新增 **551 条** JLPT N5/N4 核心词（问候/表达/疑问/人称/时间/场所/饮食/
  物品/自然/学习工作/动词基本形 130+/形容词/副词/数字颜色身体位置/常用外来语）
- 编码：Nihon-shiki 罗马字、空格分隔音节（xtu=促音、nn=拨音、拗音整体
  双字母、长音跟随元音/片假名 `-`），由假名读音确定性生成
- **有据可依**：与上游 mozc 词库交叉验证 **512/512 完全一致**；39 条
  mozc 未收词（长问候语、する复合词等）按标准罗马字生成
- 权重 62000–66000，与 mozc 词表同量级

## 5. shortcut / duoyin 一致性（`optimize_duoyin_check.py`）

- **shortcut（7 条）**：与主库同 (word,code) 重复 = 0（第 1 步去重时已按
  权重规则保 shortcut、删 len2 侧）。`苦行僧 kuhhsg(extended.common)` 为
  全编码条目，与个人简码 `kxs/kxsg` 用途不同，**不构成重复，保留**。
- **duoyin（抽查 100 + 全量 2929）**：所有音节码均符合
  `resource/常用字双拼拼音.db` 最高权重主音，非主音使用 0 条、无依据 0 条
  → duoyin 实为全编码词组补充表，与主音规则零冲突。
  26/100 样本同词在 base 另有 4 码词编码（全编码与词码并存属设计而非冲突），
  明细见 `review/optimize_duoyin_check.txt`。**按任务要求未做任何修改。**

---

## 功能冒烟验证（真实 rime_deployer 编译）

在 docker `debian:stable-slim` + `librime-bin 1.13.1` + `librime-plugin-lua`
中，将分支词库复制到 /tmp 部署目录执行 `rime_deployer --build`：

| 词典 | 结果 |
|---|---|
| sbzr（全部 19 表合并） | ✅ sbzr.table.bin 77MB + prism + reverse，退出码 0 |
| easy_en | ✅ table.bin 16MB |
| jaroomaji（剥离 dicts.jp 缺失项的副本） | ✅ table.bin 31KB，**反编译 num_entries=551**（551 条全部落表） |
| jaroomaji（完整树） | ❌ `dicts.jp/jaroomaji.user.dict.yaml 不存在` —— **先前已存在**：download-only 大表未入库，与本次改动无关 |

结论：**已通过真实 librime 编译验证**（非仅 YAML 校验）。

## 遗留风险与建议

1. **合并前建议在测试机 rebuild** 一次（本次虽经真实 rime_deployer 编译，
   但未在 fcitx5 运行态验证候选排序体感）。
2. `5字+` 中 35,205 条"字长≥8 且默认权重"词条的裁剪决策，留待
   rimereview goal 的量化结论；数据已备好（`optimize_rimeice_stats.json`）。
3. `rimeice.1-2字` 更名已同步 import；若其他设备 sync 快照引用旧名，
   合并部署时会以仓库 sbzr.dict.yaml 为准，无影响。
4. duoyin 表若未来收录真·非主音词条（如"没入 mò"），主音抽查脚本可直接复用。
