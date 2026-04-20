# Rime Configuration / Nova Editor

这是当前使用中的 Rime 配置仓库，核心目标是构建一个高效、可控且多端同步的中文输入环境。

## 核心组件

1.  **Rime 输入方案**：以 `声笔自然 (sbzr)` 为核心，支持中日英混输与日语罗马字。
2.  **Nova Editor**：一个位于 `sbzr.chrome.extension` 的 Chrome 扩展，既是词库编辑器，也是与 Rime 共用数据源的内置输入法。
3.  **词库工程化**：通过自动化脚本和拆分词库管理大规模词条，实现“按需构建”。

## 方案概览

-   **声笔自然 (sbzr)** (v0.5.3): 主力方案。移除大部分运行时 Lua 依赖，仅保留 `dynamic_freq_filter` 用于动态调频。
-   **混输模式 (sbzr_mix)** (v0.1.0): 实验性方案。整合中文、日语 (jaroomaji) 与英语 (easy_en)，支持中日英无缝切换。
-   **日语罗马字 (jaroomaji)**: 专门用于日语输入的方案。
-   **Easy English**: 集成在 `sbzr` 和 `sbzr_mix` 中的英文输入支持。

## 项目结构

### Rime 核心配置
-   `sbzr.schema.yaml`: 声笔自然主方案定义。
-   `sbzr_mix.schema.yaml`: 中日英混输方案。
-   `sbzr.custom.yaml`: 本地补丁，用于开启补全、整句能力及自定义键位。
-   `default.custom.yaml`: 全局方案列表与切换器配置。
-   `sbzr.dict.yaml`: 主词典入口，通过 `import_tables` 聚合所有拆分词库。

### 词库与数据 (sbzr.chrome.extension/dicts/)
所有词库文件均存放在扩展目录下，便于编辑器直接访问：
-   `sbzr.len1`, `sbzr.len2`: 核心字词编码库。
-   `sbzr.extended.*`: 扩展词库（词组、地名、多音字、成语等）。
-   `sbzr.userdb`: 用户习惯词库。
-   `zdy.dict.yaml`: 手动维护的自定义补充词。

### Nova Editor (Chrome 扩展)
代码位于 `sbzr.chrome.extension/`：
-   **虚拟渲染**：高效处理大体积词库文件。
-   **VIM 仿真**：提供高效的编辑体验。
-   **同步闭环**：支持将 Rime 同步习惯导出至扩展，并将扩展输入历史写回 `sync/` 目录。

## 关键行为与配置

-   **候选展示**：页大小为 `6`，支持 `Space + 12345` 选词。
-   **快捷键**：
    -   `Tab` / `Shift+Tab`: 候选翻页。
    -   `Shift+BackSpace`: 清空当前编码（映射至 Escape）。
    -   `comma` / `period` (逗号/句号): 候选翻页。
-   **调频策略**：通过 `history_translator` 确保最近上屏词条首选，配合 Lua 滤镜优化动态权重。
-   **编码约束**：详见 `documents/sbzr_encoding_rules.md`。

## 自动化工具链 (scripts/)

仓库包含丰富的 Python 和 Shell 脚本用于维护：
-   `rebuild`: 清理缓存并重新部署 Rime。
-   `push` / `pull`: 自动化 Git 同步脚本。
-   `adjust_weights.py`: 自动调整 `len1` 词库权重，优化 aeuio 编码顺序。
-   `reformat_dict.py`: 统一词库格式。
-   `import-dynamic-freq.py` / `export-dynamic-freq.py`: 处理动态频次数据。

## 维护约定

1.  **词库修改**：优先在 `sbzr.chrome.extension/dicts/` 下的对应文件中修改。
2.  **原子提交**：修改配置或词库后，使用 `./push` 进行提交，它会自动处理设备标识和同步文件。
3.  **方案扩展**：新增词库需在 `sbzr.dict.yaml` 的 `import_tables` 中注册。
4.  **Lua 使用**：尽量保持 Lua 逻辑简单，仅用于必要的滤镜功能。

## 当前定位

这套配置不追求功能的堆砌，而是强调**输入习惯的工程化沉淀**。通过 Nova Editor 和 Rime 的深度结合，实现了一个跨越系统和浏览器的、高度一致的输入环境。
