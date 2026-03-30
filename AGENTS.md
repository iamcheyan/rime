# Rime XSB & Nova Editor: Core Architecture & Guidelines

## 1. 项目愿景与基本原则
- **极简主义 (Minimalism)**：移除所有运行时 Lua 依赖（`librime-lua`），仅依靠 Rime 原生 C++ 引擎处理输入逻辑，追求极致的稳定与响应。
- **双端同步 (Dual-Sync)**：Rime 输入法方案与 Chrome 扩展（Nova Editor）深度集成，共用 `dicts/` 下的词库源文件。
- **Nova Editor 定位**：一个专为词库维护设计的高性能、模块化、IDE 级别的 Web 编辑器。

## 2. Nova Editor 技术架构 (Chrome Extension)

### 核心渲染方案：虚拟高亮器 (Virtual Highlighter)
- **原理**：为了支持数十万行的词库文件不卡顿，采用了“虚拟渲染”技术。
- **实现**：`SharedHighlighter` 仅对当前视口（Viewport）可见的行进行 DOM 渲染。通过监听 `scroll` 和 `input` 事件，配合 `requestAnimationFrame` 调度进行实时切片。
- **对齐策略**：采用 **“像素级物理对齐”**。
  - 强制固定行高（如 `24px`），严禁使用浮点数比例。
  - 锁定 `letter-spacing: 0px` 和禁止连字，确保 `textarea` 透明文字与高亮层文字 100% 重合。
  - 采用 `z-index: 10` 将高亮层置顶，配合 `pointer-events: none` 穿透交互，解决选区色块遮挡问题。

### 模块化设计 (Modularization)
- **插件化功能**：VIM 模式、语法高亮、空白字符显示、内置输入法、自动复制均被封装为独立模块。
- **隔离性**：通过 `Editor Settings` 独立开关。关闭模块会从 UI 中彻底移除相关按钮，且模块间的逻辑故障互不干扰。

### VIM 仿真模式
- **实现**：通过 `shared/vim-mode.js` 提供的仿真层实现。支持 Normal/Insert 模式，支持核心移动命令（`h/j/k/l`, `w/b/e`, `G/gg`）和编辑命令（`dd`, `yy`, `p`, `u`, `Ctrl+r`）。

## 3. 开发规范与约束 (Critical)
- **禁止原生对话框**：严禁使用 `alert()`, `confirm()`, `prompt()`。
  - **替代方案**：使用 `window.SBZRShared.showAppToast` 或 `showAppConfirm`。
- **CSS 变量驱动**：所有的布局参数（行高、字号、边距）必须通过 `:root` 变量驱动，确保多层同步。
- **原子化修改**：在修改 `script.js` 等大文件时，优先使用局部匹配替换，防止代码丢失。

## 4. Rime 方案规则
- **词库结构**：主入口 `sbzr.dict.yaml` 仅负责导入，实际词条分布在 `dicts/` 目录。
- **匹配逻辑**：4 码单字通过 `char2` 辅助词库实现 2 码前缀匹配。
- **排序策略**：在权重一致时，按字数长度排序（短词优先）。

## 5. 双端同步与词频闭环 (Dual-Sync Loop)

项目通过 Rime 原生的多设备同步机制，实现了系统输入法与 Chrome 扩展之间的词频闭环同步。

### 同步流向图
1. **Rime -> 扩展 (继承习惯)**
   - Rime 同步时将用户习惯导出至 `dicts/sbzr.txt`。
   - 扩展启动时加载该文件，并对其中的词条给予 **1,000,000** 的权重加成。
   - **结果**：扩展继承了系统 Rime 的所有输入习惯。

2. **扩展 -> Rime (反馈习惯)**
   - 用户在扩展中点击 "Sync to Rime" 按钮。
   - 扩展将浏览器内的 `userHistory` 导出为 Rime 格式，存入 `sync/sbzrExtension/sbzr.txt`。
   - 用户触发系统 Rime 同步，Rime 识别到 `sbzrExtension` 设备的数据并进行无损合并。
   - **结果**：扩展中积累的词频被反馈回系统 Rime 数据库。

### 核心物理路径
- **习惯源**：`sbzr.chrome.extension/dicts/sbzr.txt` (由 Rime 同步生成)
- **习惯反馈**：`sync/sbzrExtension/sbzr.txt` (由扩展手动触发导出)

## 6. 常用维护脚本
- `./rebuild.sh`：清理缓存并重新编译部署 Rime。
- `./push`：根据 `.gitignore` 自动清理并强制同步用户数据库。

## 7. 词库架构优化与编码体系 (2026-03-29)

### 快捷词库迁移
- **变更项目**：废弃 `fixed.dict.yaml`，所有通过 Nova Editor 快速添加的词组统一存入 `sbzr.shortcut.dict.yaml`。
- **权重规范**：快速添加条目的基准权重为 `2000`（优先级低于手动录入的 `1999` 快捷词）。

### 编码真理来源 (Weighted Polyphonic Fix)
- **主音定义**：所有单字的两码双拼编码必须遵循 `resource/常用字全拼拼音.yaml` 中的 **最高权重读音**。
- **映射标准 (Ziranma Variant)**：
  - 声母：`zh/z`->`z`, `ch/c`->`c`, `sh/s`->`s`。
  - 韵母：`iang/uang`->`d`, `ian/uan`->`m/r`, `ai`->`l`, `ei`->`z`, `ue/üe`->`t` 等。
- **全编码派生**：`sbzr.userdb.full.dict.yaml` 是由 `userdb` 原词库根据上述“权重主音”逻辑自动生成的 4-8 码全编码词典。

## 8. Rime 匹配逻辑与交互规范

- **严格长度匹配**：`sbzr.schema.yaml` 中 `max_code_length` 设置为 `0`。
  - **行为**：取消强制 4 码上屏。输入 $N$ 个编码仅匹配编码长度正好为 $N$ 的词条。
- **取消自动补全**：默认不开启 `completion` 预测，以保证输入首选项的精准度。
