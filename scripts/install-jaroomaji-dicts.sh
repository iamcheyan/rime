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
      log "$GREEN" "Already present: $file"
      continue
    fi

    log "$CYAN" "Downloading root file: $file"
    if download_file "$RAW_BASE_URL/$file" "$dest"; then
      log "$GREEN" "Download complete: $file"
    else
      fail "Download failed: $file"
    fi
  done
}

ensure_jp_dicts() {
  local file
  local missing=0

  mkdir -p "$JP_DICT_DIR" || fail "Unable to create directory: $JP_DICT_DIR"

  for file in "${JP_DICT_FILES[@]}"; do
    local dest="$JP_DICT_DIR/$file"
    if [ -f "$dest" ]; then
      log "$GREEN" "Already present: sbzr.chrome.extension/dicts.jp/$file"
      continue
    fi

    missing=$((missing + 1))
    log "$CYAN" "Downloading dictionary: $file"
    if download_file "$RAW_BASE_URL/$file" "$dest"; then
      log "$GREEN" "Download complete: sbzr.chrome.extension/dicts.jp/$file"
    else
      fail "Download failed: $file"
    fi
  done

  if [ "$missing" -eq 0 ]; then
    log "$GREEN" "Japanese dictionaries are complete; no download needed"
  fi
}

ensure_schema_in_default_custom() {
  local file="$1"

  [ -f "$file" ] || fail "Config file not found: $file"

  if grep -Eq '^[[:space:]]*-[[:space:]]*schema:[[:space:]]*jaroomaji[[:space:]]*$' "$file"; then
    log "$GREEN" "jaroomaji already enabled in: $file"
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

  log "$GREEN" "Added jaroomaji to: $file"
}

main() {
  log "$CYAN" "Rime directory: $RIME_DIR"
  log "$CYAN" "Japanese dictionary directory: $JP_DICT_DIR"

  ensure_root_files
  ensure_jp_dicts
  ensure_schema_in_default_custom "$RIME_DIR/default.custom.yaml"

  if [ -f "$RIME_DIR/sync/MacbookProM1/default.custom.yaml" ]; then
    ensure_schema_in_default_custom "$RIME_DIR/sync/MacbookProM1/default.custom.yaml"
  fi

  log "$YELLOW" "Redeploy Rime after completion"
}

main "$@"
