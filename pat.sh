#!/bin/bash

# ===== 加载 .env =====
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo "❌ No .env file found in the current directory"
  exit 1
fi

# ===== 读取变量 =====
PAT="$PAT"
REPO_URL=$(git config --get remote.origin.url)

# ===== 校验 =====
if [ -z "$PAT" ]; then
  echo "❌ GIT_PAT is not set in .env"
  exit 1
fi

if [ -z "$REPO_URL" ]; then
  echo "❌ The current directory is not a Git repository"
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
