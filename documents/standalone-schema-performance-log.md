# Rime 独立方案性能优化与快捷键日志

## 2026-09-02：中文/日语独立输入减负

### 背景

中文 `sbzr`、日语 `jaroomaji` 的目标是独立输入，不承担中日英混输的全部增强功能。
之前多个 Lua 增强链在每次候选刷新时叠加执行，导致普通中文和日语输入不再跟手。

### 中文默认方案变更

`sbzr.schema.yaml`：

- 移除 `lua_translator@sentence_translator`；
- 移除 `lua_filter@length_priority_filter`；
- 移除 `lua_filter@dynamic_freq_filter`；
- 保留 `zdy_priority_translator`（小型自定义词表）；
- 保留 `en_switch_filter` 和 Rime 原生候选链；
- 关闭主中文 translator 的 `enable_completion`。

中文现在依靠 Rime 原生能力：

```yaml
enable_user_dict: true
enable_sentence: true
history_translator
sort: by_weight
enable_completion: false
```

长句 Lua 组句、动态词频提升和长度优先排序都是可选增强，不再污染中文默认快速输入路径。

### 日语默认方案变更

`jaroomaji.schema.yaml` / `jaroomaji.custom.yaml`：

- 移除 `lua_translator@learned_ascii_translator`；
- 移除 `lua_filter@dynamic_freq_filter`；
- 移除独立日语方案的 `table_translator@easy_en`；
- 移除独立日语方案的 `en_switch_filter`；
- 保留 `script_translator`、大小写 ASCII 处理和日语预测 filter；
- 关闭日语 translator 的 `enable_completion`；
- 修正预测 filter，只有命中固定预测前缀时才建立预测词集合，不再对整条候选流全量去重。

日语词库包含约 70MB Mozc 和约 18MB JMDict；关闭 completion 是降低普通罗马字输入候选检索成本的关键措施。

### 共享 Lua 资源变更

`rime.lua` 不再顶层 require `sentence_translator`。`sentence_translator.lua` 和
`sbzr_dict_data.lua` 保留为可选实验资产，但默认中文/日语启动不加载 14MB 长句哈希表。

### 混输边界

`sbzr_mix.schema.yaml` 本批次不修改。混输仍保留其独立的英文学习、日语 translator、动态词频
和候选排序链，后续单独评估，不把混输的需求重新加回中文/日语默认方案。

## 全局方案快捷键

`default.custom.yaml` 新增全局 `when: always` 绑定：

```text
Ctrl+Shift+Z → sbzr（中文）
Ctrl+Shift+J → jaroomaji（日语）
Ctrl+,       → select: .next（循环切换下一个方案）
Ctrl+.       → select: .next（循环切换下一个方案）
```

原有 `Shift+BackSpace` 清空/取消输入绑定保留。快捷键是直接选择方案，不经过 `sbzr_mix`，
在候选菜单、输入中和空闲状态都有效。

## 验证记录

每轮代码修改后执行：

```bash
for f in lua/*.lua; do luac -p "$f" || exit 1; done
python3 -m py_compile scripts/*.py
git diff --check
./rebuild /home/tetsuya/rime
```

实际结果：

- 全部 Lua 通过 `luac -p`；
- Python 脚本通过 `py_compile`；
- `rime_deployer --build` 成功；
- 4 个 schema 构建成功；
- Fcitx5 DBus 可达并成功 reload。

## 回滚

性能优化和快捷键均为 schema/Lua 层修改，可分别使用：

```bash
git revert <commit>
./rebuild /home/tetsuya/rime
```

不要恢复 `sentence_translator` 到默认中文方案，除非先证明 Rime 原生整句不足以满足需求。
