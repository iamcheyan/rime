#!/bin/bash

set -u

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RIME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
JP_DICT_DIR="$RIME_DIR/sbzr.chrome.extension/dicts.jp"
RAW_BASE_URL="https://raw.githubusercontent.com/lazyfoxchan/rime-jaroomaji/master"

ROOT_FILES=(
  "jaroomaji.dict.yaml"
  "jaroomaji.schema.yaml"
)

JP_DICT_FILES=(
  "jaroomaji.user.dict.yaml"
  "jaroomaji.kana_kigou.dict.yaml"
  "jaroomaji.mozc.dict.yaml"
  "jaroomaji.jmdict.dict.yaml"
  "jaroomaji.mozcemoji.dict.yaml"
  "jaroomaji.kanjidic2.dict.yaml"
)

log() {
  printf "%b%s%b\n" "$1" "$2" "$NC"
}

fail() {
  log "$RED" "$1"
  exit 1
}

download_file() {
  local url="$1"
  local dest="$2"

  mkdir -p "$(dirname "$dest")" || return 1

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
    return $?
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$dest" "$url"
    return $?
  fi

  return 127
}

ensure_root_files() {
  local file

  for file in "${ROOT_FILES[@]}"; do
    local dest="$RIME_DIR/$file"
    if [ -f "$dest" ]; then
      log "$GREEN" "已存在: $file"
      continue
    fi

    log "$CYAN" "下载根文件: $file"
    if download_file "$RAW_BASE_URL/$file" "$dest"; then
      log "$GREEN" "下载成功: $file"
    else
      fail "下载失败: $file"
    fi
  done
}

ensure_jp_dicts() {
  local file
  local missing=0

  mkdir -p "$JP_DICT_DIR" || fail "无法创建目录: $JP_DICT_DIR"

  for file in "${JP_DICT_FILES[@]}"; do
    local dest="$JP_DICT_DIR/$file"
    if [ -f "$dest" ]; then
      log "$GREEN" "已存在: sbzr.chrome.extension/dicts.jp/$file"
      continue
    fi

    missing=$((missing + 1))
    log "$CYAN" "下载词典: $file"
    if download_file "$RAW_BASE_URL/$file" "$dest"; then
      log "$GREEN" "下载成功: sbzr.chrome.extension/dicts.jp/$file"
    else
      fail "下载失败: $file"
    fi
  done

  if [ "$missing" -eq 0 ]; then
    log "$GREEN" "日语词典完整，无需下载"
  fi
}

ensure_schema_in_default_custom() {
  local file="$1"

  [ -f "$file" ] || fail "配置文件不存在: $file"

  if grep -Eq '^[[:space:]]*-[[:space:]]*schema:[[:space:]]*jaroomaji[[:space:]]*$' "$file"; then
    log "$GREEN" "已启用 jaroomaji: $file"
    return 0
  fi

  python3 - "$file" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
lines = text.splitlines()

out = []
in_schema_list = False
inserted = False

for i, line in enumerate(lines):
    out.append(line)
    stripped = line.strip()

    if stripped == "schema_list:":
        in_schema_list = True
        continue

    if in_schema_list:
        if stripped.startswith("- schema:"):
            continue
        out.append("    - schema: jaroomaji")
        inserted = True
        in_schema_list = False

if in_schema_list and not inserted:
    out.append("    - schema: jaroomaji")
    inserted = True

if not inserted:
    raise SystemExit("failed to insert jaroomaji schema")

path.write_text("\n".join(out) + "\n", encoding="utf-8")
PY

  log "$GREEN" "已添加 jaroomaji 到: $file"
}

main() {
  log "$CYAN" "Rime 目录: $RIME_DIR"
  log "$CYAN" "日语词典目录: $JP_DICT_DIR"

  ensure_root_files
  ensure_jp_dicts
  ensure_schema_in_default_custom "$RIME_DIR/default.custom.yaml"

  if [ -f "$RIME_DIR/sync/MacbookProM1/default.custom.yaml" ]; then
    ensure_schema_in_default_custom "$RIME_DIR/sync/MacbookProM1/default.custom.yaml"
  fi

  log "$YELLOW" "完成后请重新部署 Rime"
}

main "$@"
