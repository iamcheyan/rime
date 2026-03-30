#!/bin/bash

# ===== 加载 .env =====
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo "❌ 当前目录没有 .env 文件"
  exit 1
fi

# ===== 读取变量 =====
PAT="$PAT"
REPO_URL=$(git config --get remote.origin.url)

# ===== 校验 =====
if [ -z "$PAT" ]; then
  echo "❌ .env 中未设置 GIT_PAT"
  exit 1
fi

if [ -z "$REPO_URL" ]; then
  echo "❌ 当前目录不是 git 仓库"
  exit 1
fi

# ===== SSH → HTTPS =====
if [[ "$REPO_URL" == git@* ]]; then
  REPO_URL=$(echo "$REPO_URL" | sed -E 's/git@(.*):(.*)/https:\/\/\1\/\2/')
fi

# ===== 注入 PAT =====
AUTH_URL=$(echo "$REPO_URL" | sed -E "s#https://#https://$PAT@#")

# ===== 执行 push（透传参数）=====
git push "$AUTH_URL" "$@"
