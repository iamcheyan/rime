# Rime XSB / Nova Editor

这是当前使用中的 Rime 配置仓库，核心目标有两件事：

1. 维护一套以 `声笔自然（sbzr）` 为主的极简中文输入方案。
2. 维护一个与 Rime 词库共用数据源的 Chrome 扩展编辑器 `Nova Editor`（目录名仍为 `sbzr.chrome.extension`）。

项目整体遵循“少依赖、少魔法、可同步、可维护”的路线。当前方案已经移除运行时 Lua 依赖，输入逻辑尽量收敛到 Rime 原生 C++ 引擎和静态词库。

## 项目结构

### Rime 方案

- `sbzr.schema.yaml`
  - 声笔自然主方案。
- `sbzr.custom.yaml`
  - 对主方案的本地覆盖，当前关闭补全、保留整句和内建造词能力。
- `sbzr.dict.yaml`
  - 主词典入口，只负责聚合导入。
- `zdy.dict.yaml`
  - 自定义补充词库。
- `default.custom.yaml`
  - 方案列表、切换器和全局键位补丁。
- `sync/`
  - 多设备同步目录。

### 词库源

当前 `sbzr` 主词库不再把大量词条直接堆在根目录，而是通过 `sbzr.dict.yaml` 聚合以下来源：

- `sbzr.chrome.extension/dicts/sbzr.len1.dict.yaml`
  - 单字简码词库。
- `sbzr.chrome.extension/dicts/sbzr.len1.full.dict.yaml`
  - 单字全码词库。
- `sbzr.chrome.extension/dicts/sbzr.len2.dict.yaml`
  - 二字词核心词库。
- `sbzr.chrome.extension/dicts/sbzr.shortcut.dict.yaml`
  - 快捷添加词库，当前用于承接扩展里的快速加词。
- `sbzr.chrome.extension/dicts/sbzr.userdb.dict.yaml`
  - 从用户历史整理出的常用词词库。
- `sbzr.chrome.extension/dicts/sbzr.userdb.full.dict.yaml`
  - 根据用户词库派生的全编码词典。
- `zdy.dict.yaml`
  - 人工维护的补充词。

### Chrome 扩展 / Nova Editor

扩展代码位于 `sbzr.chrome.extension/`，主要模块包括：

- `manifest.json`
  - Chrome Manifest V3 入口。
- `popup.html` / `popup.js`
  - 扩展弹窗，负责启停、规则、词库加载和同步入口。
- `notepad/`
  - 编辑器页面。
- `shared/highlighter.js`
  - 虚拟高亮器，只渲染视口内内容。
- `shared/vim-mode.js`
  - VIM 仿真层。
- `shared/dicts.js`
  - 词库挂载和加载逻辑。
- `native_host/`
  - 原生宿主桥接，按 `linux/`、`mac/`、`windows/` 分平台提供。

## `sbzr` 当前行为

以当前仓库中的配置为准，`sbzr` 的关键行为如下：

- 候选页大小为 `6`，选择键为 `Space + 1 2 3 4 5`。
- `Tab` / `Shift+Tab` 在候选间移动。
- `Shift+BackSpace` 清空当前编码。
- 通过 `history_translator` 保留最近上屏历史，质量高于普通词条。
- `sbzr.custom.yaml` 关闭了补全提示，避免首选被 completion 干扰。
- 仍保留 `enable_sentence` 与 `enable_encoder`，因此整句和内建造词能力仍可使用。
- 当前 `max_code_length: 0`，允许继续输入更长编码，不做固定长度截断。

## 词库与编码约束

这个仓库的词库维护围绕下面几条规则展开：

- 主入口 `sbzr.dict.yaml` 只做导入，不直接承担大规模编辑。
- 主编辑面向 `sbzr.chrome.extension/dicts/` 下的拆分词库。
- 快捷录入统一进入 `sbzr.shortcut.dict.yaml`，不再使用旧的 `fixed.dict.yaml`。
- 单字两码/全码、二字词、用户派生词典分层维护，避免所有逻辑糅在一个文件里。
- 多音字两码主音以 `resource/常用字全拼拼音.yaml` 的最高权重读音为准。
- 排序策略以权重优先；当权重一致时，目标是短词优先。

编码规则总结见：

- `documents/sbzr_encoding_rules.md`

这份文档可作为编码体系说明，但仓库实际行为仍以当前 `schema`、`dict` 和扩展实现为准。

## Nova Editor 设计重点

Nova Editor 是这个仓库的重要组成部分，不是附属脚本工具。它的目标是让大词库编辑保持可读、可控、不卡顿。

当前设计原则：

- 使用虚拟高亮器，只渲染视口可见行。
- 强制固定行高、固定字距，追求高亮层与 `textarea` 像素级对齐。
- 高亮层置顶但关闭指针事件，避免选区被遮挡。
- VIM 模式、语法高亮、空白字符显示、内置输入法、自动复制等能力模块化隔离。
- 禁止使用原生 `alert()`、`confirm()`、`prompt()`，统一走应用内 toast / confirm 机制。
- 所有布局参数尽量由 CSS 变量驱动，避免多层样式失配。

## 双端同步闭环

这个仓库不是单纯的 Rime 配置目录，而是把系统输入法和浏览器扩展连成一个闭环。

### Rime -> 扩展

- Rime 同步后，用户习惯会导出为 `sbzr.txt` 一类词频文件。
- 扩展启动时会加载这些词条，并在内置输入法中给予高权重。
- 结果是扩展会继承系统 Rime 的输入习惯。

### 扩展 -> Rime

- 用户在扩展中执行 `Sync to Rime`。
- 扩展把浏览器内的输入历史导出到 `sync/` 下对应设备目录。
- 之后再执行一次 Rime 同步，系统侧即可无损合并这些词频。

### 关键路径

- 习惯源：`sbzr.txt`
- 扩展词库目录：`sbzr.chrome.extension/dicts/`
- 同步目录：`sync/`

## 其他方案

仓库里除了 `sbzr` 之外，还保留了其他输入方案与资源：

- `jaroomaji.schema.yaml` / `jaroomaji.dict.yaml`
  - 日语罗马字输入方案。
- `scripts/install-jaroomaji-dicts.sh`
  - 自动下载 `jaroomaji` 相关词典，并尝试把该方案加入 `default.custom.yaml`。

这些内容目前属于同仓共存资源，但本仓库的核心维护对象仍然是 `sbzr` 和 Nova Editor。

## 常用维护命令

### 重新部署 Rime

```bash
./rebuild.sh
```

`rebuild.sh` 会转调 `rebuild`，用于清理缓存并重新部署当前配置。

### 提交并推送当前配置

```bash
./push
```

`push` 会做几件事：

- 根据 `.gitignore` 清理不该继续跟踪的文件。
- 强制加入 `userdb` 和 `sync` 下需要保留的同步文件。
- 自动生成带设备标识的提交信息。
- 推送到远端 `main`。

### 安装日语词典

```bash
./scripts/install-jaroomaji-dicts.sh
```

该脚本会下载缺失的 `jaroomaji` 词典文件，并尝试更新 `default.custom.yaml`。

## 维护约定

- 修改大文件时优先做局部、原子化替换，避免误删现有逻辑。
- 文档、配置和扩展实现不一致时，以仓库当前代码为准。
- 如果要新增词库入口，优先在 `sbzr.dict.yaml` 聚合，不要把所有词条直接灌进一个总文件。
- 如果要改扩展 UI，优先保持现有模块隔离和虚拟渲染架构，不要回退到全量 DOM 渲染。

## 当前定位

这不是一个追求“功能最多”的 Rime 配置集合。

它更像是一套围绕 `声笔自然 + 词库工程化维护 + 浏览器内编辑器` 建起来的个人输入环境：强调稳定、同步、可控和长期维护成本。
