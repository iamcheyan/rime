# Lua 扩展说明与性能记录

本目录包含 SBZR / 日语罗马字 / 中日英混输共用的 `librime-lua` 扩展。Lua 只负责原生 Rime 配置难以表达的少量行为；它不是默认应该挂满所有方案的“功能总线”。

## 1. 方案挂载总览

### 中文 `sbzr` (`sbzr.schema.yaml`)

当前默认保持轻量链：

```yaml
translators:
  - lua_translator@zdy_priority_translator
filters:
  - lua_filter@en_switch_filter
```

中文默认已移除：

```yaml
lua_translator@sentence_translator
lua_filter@length_priority_filter
lua_filter@dynamic_freq_filter
```

中文依靠 Rime 原生的 `enable_user_dict`、`enable_sentence`、`history_translator` 和
`sort: by_weight` 完成基础用户学习、整句和候选排序。这样避免在普通中文输入时重复
执行 Lua 候选增强链。

### 混输 `sbzr_mix` (`sbzr_mix.schema.yaml`)

```yaml
translators:
  - lua_translator@zdy_priority_translator
  - lua_translator@learned_ascii_translator
  - lua_translator@shift_ascii_translator
  - script_translator@jp_mix
  - lua_translator@lower_ascii_translator
filters:
  - lua_filter@length_priority_filter
  - lua_filter@dynamic_freq_filter
  - lua_filter@en_switch_filter
```

混输没有挂 `sentence_translator`，但仍叠加了英文学习、动态词频、长度排序和英文过滤。

### 日语 `jaroomaji` (`jaroomaji.schema.yaml` + `jaroomaji.custom.yaml`)

当前保留：

```yaml
translators:
  - lua_translator@shift_ascii_translator
  - lua_translator@lower_ascii_translator
filters:
  - lua_filter@jp_predictive_filter
  - lua_filter@en_switch_filter
```

已移除：

```yaml
lua_translator@learned_ascii_translator
lua_filter@dynamic_freq_filter
```

日语不再访问中文动态词频，也不再查询英文学习库。

## 2. 各 Lua 文件职责

| 文件 | 职责 | 是否核心 | 主要成本 |
|---|---|---:|---|
| `schema_toggle.lua` | Option/Alt+Space 在主方案与副方案间切换 | 基本是 | 低；processor 事件判断 |
| `zdy_translator.lua` | 17 条左右自定义词/快捷词优先输出 | 可选 | 低；首次加载小词表 |
| `sentence_translator.lua` | 中文长句动态组句，8/6/4/2 码最长匹配 | 可选 | 高；依赖 14MB `sbzr_dict_data.lua`，6 码后参与每次刷新 |
| `sbzr_dict_data.lua` | 长句组句用的预编译代码→词哈希 | 配合长句功能 | 高；约 14MB，当前由共享 `rime.lua` require |
| `length_priority.lua` | 候选质量分组后，同组短词优先 | 可选 | 中高；最多缓存 128 候选并排序两次 |
| `dynamic_freq.lua` | 用户动态词频候选提升与长句学习 | 可选 | 中高；4 码后 LevelDB 查询并扫描候选 |
| `ascii_learning.lua` | 记录/查询英文学习候选 | 可选 | 已改为前两码索引；仍属额外功能 |
| `learned_ascii_translator.lua` | 输出英文学习候选 | 可选 | 混输每次英文输入触发查询；日语已移除 |
| `jp_predictive_filter.lua` | 日语固定前缀预测（ari/otsu/yor 等） | 可选 | 仅预测命中时插入少量候选 |
| `en_switch_filter.lua` | `enable_en` 关闭时过滤 ASCII 英文候选 | 可选 | 仍需遍历候选流；CJK 已走首字节快路径 |
| `shift_ascii_translator.lua` | 大写 ASCII 原样候选 | 可选 | 低 |
| `lower_ascii_translator.lua` | 小写 ASCII 候选 | 可选 | 低 |
| `single_code_filter.lua` | 单码单字过滤 | 未挂当前主链 | 低 |
| `en_switch_filter.lua` | 英文开关过滤 | 可选 | 见上 |

`rime.lua` 会集中注册仍被方案引用的模块。`sentence_translator.lua` 与
`sbzr_dict_data.lua` 目前保留在仓库中作为可选长句实验资产，但 `rime.lua` 不再顶层
require 它们，中文/日语默认启动不会加载这 14MB 哈希表。若未来重新启用长句，必须
采用首次进入中文长句路径时懒加载，不能恢复全局启动加载。

## 3. 已完成的性能修改

### 中文长句链

- `sentence_translator.lua`
  - `8/6/4/2` 步长表提升为模块常量，避免每次组句创建临时表；
  - 双拼奇数码直接跳过长句组句；
  - 同一输入状态缓存 LevelDB 查询结果；
  - 只在至少 6 码时组句。
- `dynamic_freq.lua`
  - 动态提升最低输入长度从 1 码提高到 4 码；
  - 动态候选扫描上限从 512 降到 128。
- `length_priority.lua`
  - 候选重排缓冲从 512 降到 128；
  - 仍保持质量优先、同质量窗口内短词辅助排序。

这些修改降低了开销，但并没有移除三条可选增强链；中文普通输入仍可能经过
`length_priority`、`dynamic_freq`、`en_switch`。

### 日语与混输链

- `jaroomaji.custom.yaml`
  - 移除 `dynamic_freq_filter`，避免日语每次输入访问中文动态词频数据库。
- `jaroomaji.schema.yaml`
  - 移除 `learned_ascii_translator`，避免日语普通罗马字输入查询英文学习库。
- `jp_predictive_filter.lua`
  - 输入少于 3 字符直接透传；
  - 非预测前缀直接透传；
  - 预测命中时只建立预测词集合，不再对整条普通候选流建立全局 `seen` 表；
  - 保留第一个原生候选和原有预测词顺序。
- `ascii_learning.lua`
  - 英文学习记录从每次查询遍历全部记录改为按输入前两码分桶；
  - 日语已不再使用 `learned_ascii_translator`，混输仍保留。
- `en_switch_filter.lua`
  - 中文/日文 UTF-8 文本先通过首字节快路径；
  - 只有 ASCII 候选才执行英文正则判断；
  - 不改变英文开关的过滤语义。

## 4. 哪些功能必须用 Lua

### 基本需要 Lua

- `schema_toggle`：当前的跨方案记忆与即时切换逻辑，原生 YAML 很难完整实现。
- `zdy_translator`：如果继续保留“自定义词优先输出”行为，需要脚本或额外静态词表。

### 不必须用 Lua

- 长句组句：当前 `translator.enable_sentence: true` 已有 Rime 原生整句机制；
  Lua 版本是定制化最长块匹配，可作为可选增强。
- 动态词频提升：Rime 原生 userdb/history 已能提供基本学习；Lua 版本是更激进的个性化置顶。
- 长度优先排序：静态词典的 `sort: by_weight` 已能排序；Lua 只是改变同组候选顺序。
- 日语固定预测：是额外快捷功能，不是日语基本输入所需。
- 英文学习候选：是额外功能，不是中日文输入所需。
- `en_switch_filter`：只有需要 `enable_en` 开关时才需要；也可以通过独立方案/质量配置替代。

## 5. 当前卡顿风险排序

### 中文普通输入

1. `en_switch_filter`：仍需消费候选流，但只在 `enable_en` 关闭时执行实际过滤；
2. `zdy_translator`：小词表，通常不是瓶颈；
3. 原生 `table_translator` / completion：如果仍卡，应单独检查词库规模和 completion 设置。

`sentence_translator`、`length_priority_filter`、`dynamic_freq_filter` 已不在中文默认链中。

### 日语普通输入

1. 共享 `rime.lua` 是否提前加载 `sbzr_dict_data.lua`；
2. `script_translator` 本身的 completion 候选数量；
3. `en_switch_filter` 的候选流消费；
4. `jp_predictive_filter` 仅在固定前缀命中时参与；
5. `shift_ascii` / `lower_ascii` 成本很低。

### 混输

1. `length_priority_filter`；
2. `dynamic_freq_filter`；
3. `learned_ascii_translator` + `ascii_learning.query`；
4. `en_switch_filter`；
5. `script_translator@jp_mix` 的补全候选数量。

## 6. 当前默认策略与后续 A/B

中文和日语已经采用极速默认链：

```text
中文：zdy + en_switch + 原生 table/userdb/sentence/history
日语：jp_predictive + en_switch + 原生 script/table
混输：暂时保留 learned_ascii、length_priority、dynamic_freq，作为独立后续优化对象
```

中文默认已移除 `sentence_translator`、`length_priority_filter`、`dynamic_freq_filter`；日语
默认已移除 `learned_ascii_translator` 和 `dynamic_freq_filter`。如果 Mac 上中文/日语仍卡，
下一步应先做 Rime 原生 `enable_completion` 开关 A/B，而不是恢复这些 Lua 增强。

混输的后续 A/B 可以单独移除 `learned_ascii_translator`、`length_priority_filter`、
`dynamic_freq_filter`，不应因为混输问题回头增加中文/日语默认链的复杂度。

如果未来重新启用中文长句实验，必须采用懒加载并单独挂实验 schema；不要把
`sentence_translator` 恢复到主方案。

## 7. 验证与回滚

语法检查：

```bash
cd ~/rime
for f in lua/*.lua; do luac -p "$f" || exit 1; done
python3 -m py_compile scripts/*.py
git diff --check
```

构建验证：

```bash
cd ~/rime
./rebuild /home/tetsuya/rime
```

当前已验证的结果：

```text
全部 Lua 通过 luac -p
Python 脚本通过 py_compile
rime_deployer --build 成功
4 个 schema 构建成功
Fcitx5 reload 成功
```

回滚某轮 Lua 修改：

```bash
git revert <对应提交>
./rebuild /home/tetsuya/rime
```

当前性能修改提交：

```text
9d139e7  中文长句/动态词频/候选排序第一轮优化
814431f  日语与混输候选链优化
c53de1a  日语预测 filter 优化
d5710aa  日语移除英文学习候选
```

注意：本 README 记录的是代码实际状态和性能判断，不代表所有可选 Lua 功能都应该永久开启。
最终默认链应以“Mac 实际打字跟手程度 + 功能确实需要”为准，而不是以功能数量为准。
