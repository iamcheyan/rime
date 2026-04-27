# Rime 声笔自然配置 / Nova Editor

> 一个以「声笔自然」双拼顶功为核心，支持中日英混输、多端同步的 Rime 输入法配置方案。
> 配套 Chrome 扩展 Nova Editor，实现词库维护与输入习惯的双端闭环同步。

---

## 核心特性

| 特性 | 说明 |
|------|------|
| **声笔自然 (sbzr)** | 自然码双拼 + 顶功笔画，字词分离、自动上屏 |
| **中日英混输 (sbzr_mix)** | 中文、日语罗马字 (jaroomaji)、英文 (easy_en) 无缝切换 |
| **Nova Editor** | Chrome 扩展词库编辑器，虚拟渲染支持数十万行大文件 |
| **动态调频** | Lua 脚本 `dynamic_freq.lua` 实现用户习惯权重动态调整 |
| **多端同步** | Rime 原生同步 + 扩展反馈，形成词频闭环 |

---

## 输入方案

### 声笔自然 (sbzr) — 主力方案

- **编码结构**：声母 + 韵母 + 笔画（首笔 + 次笔）
- **声母**：平翘合并（`z` = z/zh, `c` = c/ch, `s` = s/sh），零声母 `v`
- **韵母**：标准自然码双拼布局
- **笔画**：`a`折 `e`横 `u`撇 `i`竖 `o`点

**单字**：`声母 + 韵母 + 首笔 + 次笔`（如：就 `jqoe`）
**二字词**：`字1声 + 字1韵 + 字2声 + 字2韵`（如：关系 `grxi`）
**三字词**：`字1声 + 字2声 + 字3声 + 字3韵`（如：示范区 `sfqu`）
**多字词**：`字1声 + 字2声 + 字3声 + 末字声`（如：中华人民共和国 `zhgg`）

> 详细编码规则见 [`documents/sbzr_encoding_rules.md`](documents/sbzr_encoding_rules.md)

### 混输模式 (sbzr_mix) — 实验方案

整合 `sbzr` + `jaroomaji` + `easy_en`，根据输入特征自动路由：
- 纯小写英文 → easy_en
- 日语罗马字 → jaroomaji（如 `konnichiha` → こんにちは）
- 中文编码 → sbzr

### 日语罗马字 (jaroomaji)

- 支持平假名/片假名切换（Shift + 输入强制片假名）
- `-` 键或 `L` 键作为伸ばし棒（长音）

---

## 项目结构

```
.
├── sbzr.schema.yaml              # 声笔自然主方案
├── sbzr_mix.schema.yaml          # 中日英混输方案
├── jaroomaji.schema.yaml         # 日语罗马字方案
├── easy_en.schema.yaml           # 英文输入方案
├── sbzr.custom.yaml              # 声笔自然本地补丁
├── sbzr_mix.custom.yaml          # 混输模式本地补丁
├── default.custom.yaml           # 全局方案列表与快捷键
├── sbzr.dict.yaml                # 主词典入口（import_tables 聚合）
├── rime.lua                      # Lua 入口（加载 dynamic_freq）
│
├── lua/
│   ├── dynamic_freq.lua          # 动态调频核心逻辑
│   └── single_code_filter.lua    # 单码过滤
│
├── sbzr.chrome.extension/        # Nova Editor Chrome 扩展
│   ├── dicts/                    # 词库源文件（与 Rime 共用）
│   │   ├── sbzr.len1.dict.yaml   # 核心单字
│   │   ├── sbzr.len2.dict.yaml   # 二字词
│   │   ├── sbzr.extended.*       # 扩展词库（地名、成语、诗词等）
│   │   ├── sbzr.userdb.*         # 用户习惯词库
│   │   └── zdy.dict.yaml         # 手动自定义词
│   ├── dicts.en/                 # 英文词典
│   ├── dicts.jp/                 # 日语词典
│   ├── shared/                   # 扩展核心模块
│   └── sync/                     # 同步数据目录
│
├── scripts/                      # 维护脚本
│   ├── export-dynamic-freq.py    # 导出动态频次
│   ├── import-dynamic-freq.py    # 导入动态频次
│   ├── reformat_dict.py          # 词库格式标准化
│   └── ...
│
├── documents/
│   └── sbzr_encoding_rules.md    # 声笔自然编码规则详解
│
├── push                          # Git 同步脚本（提交当前分支）
├── pull                          # Git 同步脚本（强制拉取当前分支）
└── sync.sh                       # Rime 同步触发脚本
```

---

## 快捷键

| 按键 | 功能 |
|------|------|
| `Tab` / `Shift+Tab` | 候选翻页 |
| `,` / `.` | 候选翻页 |
| `[` / `]` | 候选翻页 |
| `Shift+BackSpace` | 清空当前编码 |
| `Space + 1~5` | 选词（页大小 6） |
| `Ctrl+grave` / `F4` | 方案选单 |
| `Shift_L/R` |  inline_ascii 西文切换 |

---

## Nova Editor (Chrome 扩展)

位于 `sbzr.chrome.extension/`，是一个专为词库维护设计的高性能 Web 编辑器。

### 核心能力

- **虚拟渲染**：`SharedHighlighter` 仅渲染视口可见行，支持数十万行不卡顿
- **VIM 模式**：Normal/Insert 模式，支持 `h/j/k/l`, `w/b/e`, `dd/yy/p/u` 等
- **内置输入法**：与 Rime 共用 `dicts/` 词库源文件
- **双端同步闭环**：
  1. Rime 同步 → 导出习惯到 `dicts/sbzr.txt` → 扩展加载并加权
  2. 扩展点击 "Sync to Rime" → 写入 `sync/sbzrExtension/sbzr.txt` → Rime 合并

---

## 维护脚本

```bash
./push [commit message]     # 导出动态频次、清理忽略文件、提交并推送当前分支
./pull                      # 强制拉取当前远程分支、导入动态频次
./sync.sh                   # 触发 Rime 同步
```

---

## 部署指南

### Linux (Fedora)

```bash
# 1. 安装依赖
sudo dnf install librime-tools fcitx5-rime

# 2. 克隆配置
git clone https://github.com/iamcheyan/rime.git ~/.local/share/fcitx5/rime

# 3. 部署
rime_deployer --build ~/.local/share/fcitx5/rime

# 4. 重启 fcitx5
fcitx5-remote -r
```

### macOS

```bash
# 使用 Squirrel (鼠须管)
git clone https://github.com/iamcheyan/rime.git ~/Library/Rime
# 重新部署即可
```

### Windows

```bash
# 使用 Weasel (小狼毫)
git clone https://github.com/iamcheyan/rime.git %APPDATA%\Rime
# 重新部署即可
```

---

## 已知问题

### Fedora 混输方案部署崩溃

**现象**：`rime_deployer` 编译 `sbzr_mix` 时崩溃，`boost::interprocess::interprocess_exception`

**根因**：`build/` 下缺少子目录，`rime_deployer` 不会自动创建中间目录

**修复**：
```bash
mkdir -p build/sbzr.chrome.extension/dicts.en
mkdir -p build/sbzr.chrome.extension/dicts.jp
rime_deployer --compile sbzr_mix.schema.yaml . /usr/share/rime-data
```

---

## 词库维护约定

1. **修改位置**：优先在 `sbzr.chrome.extension/dicts/` 下修改对应文件
2. **新增词库**：在 `sbzr.dict.yaml` 的 `import_tables` 中注册
3. **快捷添加**：通过 Nova Editor 添加的词组存入 `sbzr.shortcut.dict.yaml`，基准权重 `2000`
4. **编码标准**：单字两码双拼遵循 `resource/常用字全拼拼音.yaml` 中的最高权重读音

---

## License

Apache License 2.0
