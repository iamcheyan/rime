# 声笔自然词库扩充工作计划

> 目标：在不改变现有编码方案的前提下，把中文词库做到「越全越好」——
> 覆盖流行词、网络词、人名地名、成语、科技词等，让常用内容都能打得出来。

## 0. 背景与约束（调查结论）

- 方案 `sbzr` = 声笔自然（自然码双拼 + 顶功笔画）。编码规则见 `documents/sbzr_encoding_rules.md`。
- 关键特性：平翘合并（`zh→z / ch→c / sh→s`）、零声母 `v`、笔画键 `a/e/u/i/o`。
- 词组编码公式（已用 `base.dict.yaml` 真实词条逐条验证）：
  - 2 字：`声1 韵1 声2 韵2`（= 两字 2 码直接拼接）
  - 3 字：`声1 声2 声3 韵3`
  - 4 字+：`声1 声2 声3 末字声`
  - 单字：`声 韵`（+ 可选笔画，本计划不强求，保留现有 `len1`/`len1.full`）
- 词库格式：`词条\t编码\t权重`，由 `sbzr.dict.yaml` 的 `import_tables` 聚合 15 个子词库。
- **仓库内没有「拼音→sbzr 编码」的生成器**，所有现有词库编码都是上游外部生成导入的。本计划要补上这个生成器。

### 编码真理来源（已校准）

- 单字 2 码（声+韵）的真理来源是 `resource/常用字双拼拼音.db`（`字\t双拼2码\t权重`，按最高权重读音处理多音字）。
- 但该 db 的「最高权重读音」在词组语境里经常不正确（如 `长=ch` cháng，但「生长」应 zhǎng；`行=hh` háng，但「行走」应 xíng）。
- **因此词组编码必须用「按词给出的上下文拼音」**，不能用 db 的孤立单字读音。
- 韵母键位表（已对 db 3653 字逐一核对，含 er→R、üan/uan→R、j/q/x+y 后 u→U 而 l/n 后 ü→V 等全部边界）：

| 键 | 韵母(rime-ice 写法) | 键 | 韵母 |
|---|---|---|---|
| Q | iu | L | ai |
| W | ia, ua | Z | ei |
| E | e | X | ie |
| R | uan, van(üan), **er** | C | iao |
| T | ue, ve, üe | V | ui, v(ü) |
| Y | uai, ing | B | ou |
| U | u（含 j/q/x/y 后的 ü-as-u） | N | in |
| I | i | M | ian |
| O | uo, o | S | ong, iong |
| P | un, vn(ün) | D | iang, uang |
| A | a | F | en |
| G | eng, ueng | H | ang |
| J | an | K | ao |

> 注：rime-ice 中 `ü` 写作 `v`（`lv/nv/lve/nve`），而 j/q/x/y 后的 `ü` 写作 `u`（`ju/qu/xu/yu`、`yue/que`、`yuan/quan`、`yun/qun`）。

## 1. 词源

采用 **rime-ice（雾凇拼音）** 作为主词源：`https://github.com/iDvel/rime-ice`，取 `cn_dicts/`：
- `8105.dict.yaml`（8105 通用字，单字带拼音）
- `base.dict.yaml`（16.6MB，基础词组）
- `ext.dict.yaml`（11.9MB，扩展词组）
- `tencent.dict.yaml`（17.3MB，腾讯词频，流行词/网络词/人名最全）
- `others.dict.yaml`（杂项）
- `41448.dict.yaml`

理由：rime-ice 是目前最全最活跃的 Rime 全拼词库，**每个词都带人工校准的上下文拼音**（解决多音字），且覆盖流行词/明星名/网络新词，正是当前缺口。无需自建拼音；无拼音的字符再用 `pypinyin` 兜底。

## 2. 实现步骤

### 2.1 编码器 `scripts/gen_sbzr_dict.py`
- 输入：rime-ice 的 `*.dict.yaml`（`text\tpinyin\tweight` 行）。
- 对每个词的拼音音节逐个转 `声母+韵母` 2 码：
  - 声母：`zh/ch/sh→z/c/s`；其余首字母 `bpmfdtnlgkhjqxrzcsyw` 取本身；元音起首（`a/e/o` 或 `er`）→零声母 `v`。
  - 韵母：查上表（按 rime-ice 韵母字符串整串匹配）。
- 按词长套词组公式产出 4 码（2 字即满码 4 码）。
- 单字（1 字）：产出 2 码 `声韵`（与现有 `len1` 重叠，去重时会被跳过，不强求笔画）。
- 未知/无法编码的音节：丢弃并计数告警。

### 2.2 校验
- 用 `pypinyin` 默认读音对 db 3653 单音字跑编码器，与 db 2 码比对：匹配率应 ≥ 98%，不匹配的多为多音字读音差异（预期、可接受）。
- 抽样人工核对若干 2/3/4 字词编码与 `base.dict.yaml` 一致。

### 2.3 去重
- 汇总现有所有子词库（`base/common/chengyu/len2/len1/...`）的 `(text)` 集合。
- 新词库只保留现有词库里 **没有该词条** 的条目（按 text 去重，避免与已有编码冲突/重复）。

### 2.4 产出与接入
- 输出 `sbzr.chrome.extension/dicts/sbzr.rimeice.dict.yaml`，权重沿用 rime-ice 原值。
- 在 `sbzr.dict.yaml` 的 `import_tables` 末尾加 `- sbzr.chrome.extension/dicts/sbzr.rimeice`。
- 跑 `scripts/reweight_dicts.py` 统一权重，再 `./rebuild` 重新部署。
- 冒烟测试：部署后用 fcitx5 试打若干流行词/人名，确认能出。

## 3. 风险与回退
- 编码多音字与现有 `base.dict.yaml` 个别不一致：因按 text 去重，已有词不会被新库覆盖，无冲突。
- 新库体积可能较大（tencent 17MB → 转码后约同量级）：rime 码表可承受；如部署变慢可只取 base+ext 不含 tencent。
- 回退：删 `import_tables` 中那一行 + `./rebuild` 即可。