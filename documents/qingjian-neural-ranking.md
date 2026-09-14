# Qingjian 本地模型辅助排序实验

状态：已纳入模型、sidecar 和 Rime 实时过滤器；默认只在相近质量候选中重排。

## 目标

使用青简输入法的本地字符级 Transformer，为声笔自然（SBZR）产生的中文候选提供二次排序，同时保留 Rime 原有的用户词频、动态词频、快捷词和手工词库。

## 模型

模型文件位于：

```text
models/qingjian/model.qjm
```

这是 Qingjian 的 `.qjm` 打包模型，当前元数据为：

- 约 2,795 万参数
- 8 层 Transformer
- hidden size 448
- 8 个 attention heads
- 字符词表 19,147
- 上下文长度 128
- fp16 safetensors 权重

SHA-256：

```text
eed5bd0bda0c7bd8b43d1acb2dc4678d4bbe295bd47b2b0d4eeace0af9daff4d
```

模型不是词库，也不会根据 SBZR 编码查字。它接收“前文 + 中文候选”，计算候选在前文后的字符级 log probability，用于语言自然度排序。

## 计划中的排序链路

```text
Rime table_translator / sentence translator
        |
        | 中文候选、Rime quality、当前输入、最近中文上下文
        v
Qingjian CharScorer（本地模型）
        |
        | 候选模型分数
        v
Rime filter：保留用户质量分，只对相近候选做保守重排
```

Rime Lua 不能直接加载 `.qjm`。正式接入需要一个 Rust 原生扩展或本地 sidecar；第一版不应让 Lua 每次刷新候选时重新启动模型进程，因为模型加载和 IPC 会阻塞输入。

## 分阶段实施

### 阶段 0：离线确认（当前）

从 Qingjian 仓库运行实际模型，确认模型可以加载并对候选打分。冒烟测试脚本：

```bash
QINGJIAN_ROOT=/Users/tetsuya/Development/qingjian \
  ./scripts/qingjian-neural-smoke-test.sh
```

也可以指定其他 Qingjian 工作树：

```bash
QINGJIAN_ROOT=/path/to/qingjian \
  ./scripts/qingjian-neural-smoke-test.sh
```

### 阶段 1：候选回放

记录真实 Rime 候选后，比较以下排序：

1. Rime 原始顺序；
2. 仅用户/动态词频排序；
3. Rime 质量分 + Qingjian 模型分数。

模型只参与中文候选，并限制在质量接近的候选窗口内。英文、日文、标点、快捷码和用户明确选中的高质量候选不应被模型覆盖。

### 阶段 2：实时实验（当前）

当前实现是常驻 Rust Unix-socket sidecar。Rime Lua filter 通过
`scripts/qingjian-rime-rank.sh` 请求评分；sidecar 只在第一次请求时加载模型，后续请求复用进程。

首次使用前构建 sidecar：

```bash
cd /Users/tetsuya/Development/qingjian
cargo build --release -p qingjian-rime-ranker --features metal
```

可选环境变量：

```bash
export QINGJIAN_ROOT=/Users/tetsuya/Development/qingjian
export QINGJIAN_MODEL=/Users/tetsuya/chezmoi/dot_local/share/rime/models/qingjian/model.qjm
```

如果当前 Rime/Fcitx5 是从带有环境变量的会话启动，临时回到原始 Rime 排序可设置：

```bash
export QINGJIAN_RIME_DISABLE=1
```

实时接入使用缓存和保守质量窗口。正式长期使用前仍必须测量：

- 首次加载时间；
- 单次候选刷新延迟；
- Metal/CPU 内存占用；
- 连续输入时是否丢失候选或阻塞按键；
- 动态词频和用户词是否仍然优先；
- `sbzr` 与 `sbzr_mix` 两个方案是否一致。

## 当前 Rime 约束

- `sbzr.schema.yaml` 当前没有挂载 `dynamic_freq_filter` 和 `length_priority_filter`；`sbzr_mix.schema.yaml` 有这些过滤器。神经过滤器不能只改一个方案。
- `lua/sentence_translator.lua` 当前不是主 `sbzr` 方案的活动组件，单独修改它不会生效。
- Rime 的 `Candidate.quality` 与 Qingjian 内部的 bigram log score 不是同一量纲，不能直接套用 Qingjian Core 的整句公式；需要先离线校准混合权重。
- Rime 通常只能可靠取得输入上下文和 Rime 内部历史，不能假定能够读取任意应用的光标前全文。

## 模型更新

模型由 Qingjian 上游构建。更新时应同时记录 SHA-256，并运行：

```bash
shasum -a 256 models/qingjian/model.qjm
QINGJIAN_ROOT=/Users/tetsuya/Development/qingjian \
  ./scripts/qingjian-neural-smoke-test.sh
```

不要把模型放进 Rime 的词库导入链；它是排序组件，不是 `*.dict.yaml`。
