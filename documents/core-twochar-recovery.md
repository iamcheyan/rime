# 常用二字词恢复层

## 目的

远端词库精简提交 `346bfc1` 从 `sbzr.dict.yaml` 移除了整个 `sbzr.len2` 入口，以减少低频 n-gram 候选。但 `sbzr.len2.dict.yaml` 中仍有合法且常用的二字词，因此会出现源文件存在、运行时却查不到的情况。

## 当前实现

主入口现在额外导入：

```yaml
- sbzr.chrome.extension/dicts/sbzr.core-twochar
```

恢复层文件：

```text
sbzr.chrome.extension/dicts/sbzr.core-twochar.dict.yaml
```

当前首个回归词：

```text
掰扯    blce    2000
```

来源是 `sbzr.len2.dict.yaml`，原始权重为 `1000`。恢复层权重设为 `2000`，只用于确保这个经过确认的常用词进入主方案，不代表外部词频的绝对数值。

## 为什么不重新导入 len2

完整 `sbzr.len2` 约 6.4 万行，直接恢复会：

- 重新引入大量低频词；
- 增加候选数量；
- 抵消主词库精简和输入速度优化；
- 使词库质量无法逐条审计。

恢复层采用小文件、逐条审阅的策略。每个条目应记录来源、原始权重和恢复原因，并使用已有合法 SBZR 编码，不能凭感觉生成编码。

## 后续增加标准

候选词至少满足：

1. 在被排除的静态词库中确实存在；
2. 不是动态个人数据或私人 userdb 内容；
3. 是现代常用二字词，而不是偶然 n-gram 片段；
4. 编码通过 `resource/常用字双拼拼音.db` 的主音规则检查；
5. 不在 `banned_words.txt`；
6. 最好有外部词频审计或用户实际回归案例支持。

外部词频只作为审计信号，不能直接把外部数值写成 Rime 权重，也不能在没有合法编码时猜编码。

## 验证

修改后执行：

```bash
./rebuild /home/tetsuya/rime
```

构建成功后检查 `build/sbzr.table.bin` 已更新，并在中文 `sbzr` 中输入 `blce` 验证 `掰扯` 出现。混输 `sbzr_mix` 不自动继承此恢复层，除非明确把它加入混输入口。
