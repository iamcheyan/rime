#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
QINGJIAN_ROOT=${QINGJIAN_ROOT:-/Users/tetsuya/Development/qingjian}
MODEL=${QINGJIAN_MODEL:-"$ROOT_DIR/models/qingjian/model.qjm"}
SOCKET=${QINGJIAN_RANKER_SOCKET:-/tmp/qingjian-rime-ranker.sock}
START_LOCK="$SOCKET.starting"
BIN=${QINGJIAN_RANKER_BIN:-"$QINGJIAN_ROOT/target/release/qingjian-rime-ranker"}
LOG=${QINGJIAN_RANKER_LOG:-/tmp/qingjian-rime-ranker.log}

if [ ! -x "$BIN" ]; then
  echo "排序 sidecar 不存在或不可执行: $BIN" >&2
  echo "请先运行: (cd $QINGJIAN_ROOT && cargo build --release -p qingjian-rime-ranker --features metal)" >&2
  exit 1
fi
if [ ! -f "$MODEL" ]; then
  echo "排序模型不存在: $MODEL" >&2
  exit 1
fi

if [ -S "$SOCKET" ] && ! nc -z -G 1 -w 1 -U "$SOCKET" >/dev/null 2>&1; then
  rm -f "$SOCKET"
fi

if [ ! -S "$SOCKET" ]; then
  if mkdir "$START_LOCK" 2>/dev/null; then
    trap 'rmdir "$START_LOCK" 2>/dev/null || true' EXIT HUP INT TERM
    if [ -S "$SOCKET" ] && nc -z -G 1 -w 1 -U "$SOCKET" >/dev/null 2>&1; then
      :
    else
      rm -f "$SOCKET"
      nohup "$BIN" --model "$MODEL" --socket "$SOCKET" >>"$LOG" 2>&1 &
    fi
    rmdir "$START_LOCK" 2>/dev/null || true
    trap - EXIT HUP INT TERM
  fi
  i=0
  while [ ! -S "$SOCKET" ] && [ "$i" -lt 200 ]; do
    i=$((i + 1))
    sleep 0.01
  done
fi

if [ ! -S "$SOCKET" ]; then
  echo "排序 sidecar 启动失败，查看日志: $LOG" >&2
  exit 1
fi

exec nc -U "$SOCKET"
