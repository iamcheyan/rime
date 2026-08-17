# Rime 词库优化分支（dict-optimize）— 按 review 框架直接落地

## 背景

仓库：`~/development/rime-study`（main 分支 = 用户日常输入法配置，**绝不动 main**）。
并行有一个只读 review goal（tmux `rimereview`）在跑量化分析；本 goal 不等它的
最终报告，先在**独立分支**上把确定性高、风险可控的词库优化落地。

**分支纪律**：开工先 `git checkout -b dict-optimize`（基于 main 最新
8ca3014）。所有改动只落这个分支。**绝不 checkout main、绝不 push main、
绝不跑 ./rebuild 或 ./push（那会影响用户运行中的输入法）**。完工
`git push origin dict-optimize`。

## 优化清单（按序执行，每步独立 commit）

### 1. 跨词库去重
rimeice 三个大文件（3字 113万行/4字 119万行/5字+ 91万行）与
extended.common（66万行）、base（54万行）之间必然存在大量同 word+code 重复。
写 `review/scripts/dedup_scan.py`：
- 全量扫描 dicts/ 下所有 .dict.yaml，建 (word, code) → [文件] 索引（流式，别整个载入内存）
- 输出重复榜：总数、按文件对分布、top 样例
- 去重规则（保守）：**保留优先级 = sbzr.len1/len2 > base > extended.common >
  rimeice.\* > 其他**；同 (word,code) 时保留权重最高的那条；若权重也相同则保留
  靠前优先级文件的。从低优先级文件里删除重复行。
- 删完重跑扫描确认重复=0，行数变化写入报告。

### 2. rimeice 生僻词瘦身（保守线）
5字+ 和 12字 文件里存在大量极生僻词条（如 12 字词 6.6 万条）。
- 统计权重分布，找出权重=默认值（即从未调频）且字长 ≥8 的词条
- **只移除 12 字及以上、权重为默认的词条**（12字.dict.yaml 整文件评估，估计
  大部分可移除——保留权重 > 默认值的）。移除的写入 `review/removed/` 备查。
- 5字+ 暂不动（等 review goal 的量化结论再定，本次保守）。

### 3. 词库头与 import 表修正
- 核对 `sbzr.dict.yaml` import 列表：import 了不存在的文件 → 删；存在但未
  import 的孤儿 → 若内容有价值则加入 import，否则移到 `review/orphan/` 备查。
- 每个词库 YAML 头（name/version）与文件名一致性修正。

### 4. jaroomaji 词库扩容（低成本高收益）
jaroomaji.dict.yaml 只有 562B。从 schema（jaroomaji.schema.yaml）确认其工作
方式（若 schema 自带罗马字变换引擎则词库只是补充）。若是词库驱动：
- 生成常用日语词的罗马字条目（基础 500-1000 词：问候/常用名词/动词基本形），
  按 schema 的编码规则写码
- 每条必须有据可依（标准 Hepburn/Nihon-shiki 罗马字），不造词

### 5. shortcut/duoyin 一致性
- sbzr.shortcut.dict.yaml（Nova Editor 快速添加，权重 2000）与主库重复的条目清理
- duoyin 词库与 base 的多音冲突抽查（读 AGENTS.md §7 的"权重主音"规则，
  与 resource/常用字双拼拼音.db 对照，抽 100 条，不一致的列出来但**不擅改**——
  多音字改错会把用户的肌肉记忆打乱）

## 每步的验证

- `wc -l` 前后对比 + `python3 review/scripts/dedup_scan.py` 复跑归零
- YAML 语法校验：`python3 -c "import yaml,sys; yaml.safe_load(open(f))"` 逐文件
  （大文件流式 load 或只校验头部+逐行结构）
- 抽样人工可读性检查：每文件改后 head -20 看格式没坏
- **功能冒烟**：不动用户 ~/.local/share/fcitx5/rime。验证方式 = 把分支词库
  复制到临时目录，用 rime_deployer（若系统有）或 docker rime 做编译冒烟；
  若都不可用，退化为 YAML/YAML头结构完整性校验 + import 链完整性断言，并在
  报告注明"未经真实部署验证，合并前建议在测试机 rebuild"。

## 产出

- 分支 `dict-optimize`，每优化项一个 commit（中文信息）
- `review/OPTIMIZE_REPORT.md`：每项的量化前后对比（行数/体积/重复数）、
  移除内容统计、遗留风险
- `git push origin dict-optimize`

## 红线

- main 分支只读；不跑 rebuild/push 脚本；不动 sync/ 与 dicts/sbzr.txt（用户习惯）
- 大文件流式处理；删任何词条前先把删除清单落到 review/removed/（可回滚）
- 若与 rimereview goal 的工作树冲突（它也会写 review/），先 `git status` 检查，
  它的产出目录是 review/RIME_DICT_REVIEW.md 与 review/scripts/——
  **脚本命名避开**：本 goal 的脚本放 review/scripts/optimize_*.py 前缀。
