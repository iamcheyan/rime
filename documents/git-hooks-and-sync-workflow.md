# Rime 仓库 Git 同步、Hook 与本地修改安全流程

## 1. 仓库现状

仓库：`github.com:iamcheyan/rime.git`，默认分支 `main`。

当前存在三类自动化：

### 本地 `.githooks/`

- `.githooks/pre-commit`
  - 提交前运行 `scripts/export-dynamic-freq.py`；
  - 自动把 `sync/*/dynamic_freq.txt` 加入暂存区。
- `.githooks/post-merge`
  - 普通 `git pull` 产生 merge 后运行 `scripts/import-dynamic-freq.py`；
  - 检查/安装外部日语词典 `scripts/install-jaroomaji-dicts.sh`。
- `.githooks/post-rewrite`
  - rebase 或 amend 后导入动态词频；
  - 检查/安装外部日语词典。

这些 hook 只有在仓库配置了以下选项后才会生效：

```bash
git config core.hooksPath .githooks
```

普通新 clone 后直接执行原生 `git pull` 不一定会触发这些 hook，因此新机器初始化后应主动
执行一次上面的 `git config` 命令。

### GitHub Actions

`.github/workflows/enforce-commit-identity.yml` 只负责检查提交身份，不负责 pull、rebase、
词频同步或冲突解决。不要把它当成远端同步 hook。

## 2. 仓库脚本的风险边界

### 拉取更新

仓库不再提供会执行 `reset --hard` 的 `./pull` 脚本。使用原生 Git 保留本地历史：

```bash
git status --short
git stash push --include-untracked -m 'before-rime-pull'
git fetch origin
git log --oneline HEAD..origin/main
git rebase origin/main
```

本地修改恢复：

```bash
git stash list
git stash pop
```

`stash pop` 后必须检查冲突和工作区状态，不能根据命令返回就假设恢复成功。

### 推送更新

仓库不再提供会执行 `git add -A` 或允许 force push 的 `./push` 脚本。使用原生 Git：

推荐手动流程：

```bash
git status --short
git diff --check
git fetch origin
git rebase origin/main
# 只添加本次明确相关的文件
git add <specific-files>
git diff --cached --check
git commit -m '...'
git push origin main
```

## 3. 多设备/多 Agent 并行规则

同一仓库可能同时被 Mac、Linux、WSL 或多个 Agent 修改。每次准备 push 前：

1. `git status --short`，确认没有未预期文件；
2. `git fetch origin`；
3. 查看 `git log HEAD..origin/main`；
4. 有远端新提交时先 rebase；
5. rebase 后检查 `git status` 和 `git diff`；
6. 只暂存本次文件；
7. push 被拒时不能 force，重复 fetch/rebase；
8. 远端发生 force-update 时，先保存本地提交/分支，再比较实际文件差异，确认等价后才 reset。

重要：提交 hash 不同不代表内容不同；比较并行同步结果时使用：

```bash
git diff HEAD origin/main
git diff --name-status HEAD origin/main
```

确认实际内容等价后，才可以用 `git reset --hard origin/main` 对齐历史。

## 4. 动态词频数据边界

以下是运行时/个人数据，不应在普通代码提交中误提交：

```text
dynamic_freq.local.txt
dynamic_freq.userdb/
sbzr.userdb/
```

设备快照 `sync/<DeviceName>/dynamic_freq.txt` 由 hook 自动导出/导入，是仓库设计的一部分，
但提交前仍要确认它不包含不应共享的个人敏感文本。

`pre-commit` 会修改暂存区；执行 commit 后要检查：

```bash
git status --short
git diff --cached --name-status
```

## 5. 推荐的新机器初始化

```bash
git clone git@github.com:iamcheyan/rime.git ~/rime
cd ~/rime
git config core.hooksPath .githooks

# 先看配置，不要直接执行会写入用户目录的脚本
./rebuild /path/to/rime
```

`git commit` 会触发 `pre-commit`；`git pull --rebase` 会在适用时触发
`post-merge`/`post-rewrite`。每个 hook 运行后都要重新检查工作区。

## 6. 本次问题的教训

曾出现过以下组合：

- 本地存在尚未提交的 schema 修改；
- 远端同时发生 force-update；
- 先提交文档，再直接 rebase；
- rebase 因工作区未清理而中止。

正确做法是：

```text
发现本地修改 → 明确区分“本次代码/文档/临时生成物”
→ stash 或单独提交保护 → fetch/rebase
→ 恢复修改 → 检查冲突/实际 diff
→ 分小提交 push
```

任何 `reset --hard` 都必须在用户明确要求“以远端为准”或已经有可验证备份时执行。
