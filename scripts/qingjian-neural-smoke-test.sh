#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
QINGJIAN_ROOT=${QINGJIAN_ROOT:-/Users/tetsuya/Development/qingjian}
MODEL=${QINGJIAN_MODEL:-"$ROOT_DIR/models/qingjian/model.qjm"}

if [ ! -f "$MODEL" ]; then
  echo "模型不存在: $MODEL" >&2
  exit 1
fi

if [ ! -f "$QINGJIAN_ROOT/Cargo.toml" ]; then
  echo "找不到 Qingjian 工作树: $QINGJIAN_ROOT" >&2
  exit 1
fi

cd "$QINGJIAN_ROOT"
echo "模型: $MODEL"
echo "SHA-256:"
shasum -a 256 "$MODEL"
echo ""
echo "运行 Qingjian CLI 神经重打分冒烟测试..."
cargo run --locked -q -p qingjian-cli -- \
  --neural "$MODEL" \
  --neural-async \
  nihao kaifa zhongguo shurufa
