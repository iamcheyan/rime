# SBZR 动态词频管理与多设备同步机制规范

本文档定义了 SBZR 输入法中个人动态词频（Dynamic Word Frequency）的生成、存储、排序置顶、Git Hook 自动化与多设备增量同步闭环。

---

## 1. 架构目标与设计原则

- **动态学习置顶**：用户在输入过程中实际选中的词条，在下次键入相同编码时优先提升至首位（通过 Lua 过滤器动态生效）。
- **多设备零冲突（Zero Git Conflict）**：每台设备以独立子目录 `sync/<Hostname>/dynamic_freq.txt` 导出快照，杜绝多端协作时的 Git 文件合并冲突。
- **时间戳无损合并（Timestamp-based Convergence）**：拉取多端快照时，按毫秒/秒级时间戳取最新选词，同时对不同编码的新词自动求并集保留。
- **Hook 自动化静默流转**：通过 Git Hooks（`pre-commit` / `post-merge`）实现常规 `git commit / push / pull` 操作自动导出与导入，无需手动运行同步脚本。
- **运行时数据与源码隔离**：`.gitignore` 严格隔离 LevelDB 数据库与本地运行时缓存，仅版本化文本格式的设备词频快照。

---

## 2. 词频分层模型

```mermaid
flowchart TD
    subgraph Layer1[1. 静态词典层 (Static Base)]
        D1[sbzr.dict.yaml / base / common-frequency / rimeice]
    end

    subgraph Layer2[2. Lua 过滤与排序层 (Runtime Filters)]
        F1[lua/length_priority.lua: 权重窗口平局短词优先]
        F2[lua/dynamic_freq.lua: 用户动态调频置顶]
    end

    subgraph Layer3[3. 本地存储层 (Local Store)]
        S1[(dynamic_freq.userdb: LevelDB 本地数据库)]
        S2[dynamic_freq.local.txt: 本地全量合并缓存]
    end

    subgraph Layer4[4. 多设备同步层 (Cloud & Git Sync)]
        H1[.githooks/pre-commit -> scripts/export-dynamic-freq.py]
        H2[sync/DeviceA/dynamic_freq.txt]
        H3[sync/DeviceB/dynamic_freq.txt]
        H4[.githooks/post-merge -> scripts/import-dynamic-freq.py]
    end

    D1 --> F1 --> F2 --> Candidates[候选词列表]
    Commit[用户上屏选词] -->|Commit Notifier| S1 & S2
    S2 -->|导出| H1 --> H2 & H3
    H2 & H3 -->|合并导入| H4 --> S2 --> S1
    S1 & S2 -.->|读取高频记录| F2
```

---

## 3. 数据格式与存储规范

### 3.1 词频快照格式（TSV）
本地缓存 `dynamic_freq.local.txt` 与设备快照 `sync/<Device>/dynamic_freq.txt` 统一遵循以下 TSV 格式：

```tsv
# dynamic_freq sync snapshot
# format: input<TAB>type<TAB>text<TAB>updated_at
lnm	user_table	lazynvim	1777630681
yufa	user_table	语法	1777630594
xqfu	user_table	修复	1777630008
```

- **`input`**：用户输入的原始编码字符串（如 `yufa`）。
- **`type`**：候选词类型（`user_table`、`table`、`completion`、`lower_ascii` 等）。
- **`text`**：用户实际选择上屏的文本。
- **`updated_at`**：Unix 时间戳（秒），用于多设备合并时的版本判定。

### 3.2 文件路径定义
- **本地全量缓存**：`dynamic_freq.local.txt`（被 `.gitignore` 忽略，本地独立存在）。
- **本地 LevelDB**：`dynamic_freq.userdb/`（被 `.gitignore` 忽略，运行时极速索引）。
- **设备快照目录**：`sync/<Hostname>/dynamic_freq.txt`（纳入 Git 版本管理）。

---

## 4. Git Hook 自动化流水线

项目使用 `core.hooksPath = .githooks` 将版本化的 Git 钩子接入日常工作流。

### 4.1 提交前自动导出 (`.githooks/pre-commit`)
- **触发**：执行 `git commit` 或 `./push`。
- **动作**：
  1. 调用 `scripts/export-dynamic-freq.py`。
  2. 读取 `dynamic_freq.local.txt`，以当前机器主机名（`hostname`）写入 `sync/<Hostname>/dynamic_freq.txt`。
  3. 执行 `git add sync/*/dynamic_freq.txt` 将快照自动打包进当前 Commit。

### 4.2 拉取后自动合并 (`.githooks/post-merge` & `.githooks/post-rewrite`)
- **触发**：执行 `git pull`、`git merge` 或 `git rebase`。
- **动作**：
  1. 调用 `scripts/import-dynamic-freq.py`。
  2. 遍历扫描所有设备的快照文件（`sync/*/dynamic_freq.txt`）。
  3. 按照合并算法将所有远程设备的最新词频与本地缓存无损融合，并刷新写回 `dynamic_freq.local.txt`。

---

## 5. 多设备合并算法 (Merge Algorithm)

`scripts/import-dynamic-freq.py` 和 `scripts/export-dynamic-freq.py` 内部实现了确定性的增量合并逻辑：

```python
def merge_records(
    base: dict[str, tuple[str, str, int]],
    incoming: dict[str, tuple[str, str, int]],
) -> dict[str, tuple[str, str, int]]:
    merged = dict(base)
    for input_code, rec in incoming.items():
        current = merged.get(input_code)
        if current is None or rec[2] >= current[2]:
            merged[input_code] = rec
    return merged
```

1. **同码比较**：若设备 A 与设备 B 对同一输入码 `input_code` 分别记录了不同候选，比较 `updated_at` 时间戳，**以更新的记录为准**。
2. **异码并集**：若设备 A 打过新词 $X$ 而设备 B 未打过，合并后完整保留 $X$。
3. **幂等性**：重复执行合并不会产生脏数据，保证多端双向收敛。

---

## 6. 使用与运维指南

### 6.1 日常开发与输入
配置好 Hook 后，无需执行额外脚本：
- **拉取更新并合并词频**：
  ```bash
  git pull
  ```
- **提交代码并推送词频**：
  ```bash
  git add .
  git commit -m "feat: some changes"
  git push
  ```

### 6.2 新设备接入初始化
在新机器上拉取本仓库后，仅需运行一次：
```bash
./pull
```
该脚本会自动拉取远程快照、设置 `git config core.hooksPath .githooks` 并执行初次词频合并。

