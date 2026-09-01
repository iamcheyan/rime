#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
add-shortcut-word.py — 一键快速添加自定义/快捷词到 sbzr.shortcut.dict.yaml

用法:
    ./add-word <词条> [自定义编码] [权重]
    
示例:
    ./add-word "人工智能"           # 自动派生编码 rgzn，权重 2000
    ./add-word "机器学习"           # 自动派生编码 jqxx，权重 2000
    ./add-word "Neovim" nvim       # 自定义英文快捷短语
    ./add-word "无损同步" wstb 2500 # 自定义权重
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHORTCUT_DICT = ROOT / "sbzr.chrome.extension" / "dicts" / "sbzr.shortcut.dict.yaml"
CHAR_DB = ROOT / "resource" / "常用字双拼拼音.db"
DEFAULT_WEIGHT = 2000


def load_char_map() -> dict[str, str]:
    """加载单字双拼主音字典 (3650+ 常用字)。"""
    char_map: dict[str, str] = {}
    if not CHAR_DB.exists():
        return char_map
    for line in CHAR_DB.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 2:
            char = parts[0].strip()
            code = parts[1].strip()
            if char not in char_map:
                char_map[char] = code
    return char_map


def derive_sbzr_code(text: str, char_map: dict[str, str]) -> str | None:
    """根据声笔自然(sbzr)公式派生词组编码。"""
    # 纯英文字符串直接使用小写作为编码
    if text.isascii() and text.isalpha():
        return text.lower()

    codes = [char_map.get(c) for c in text]
    if any(c is None for c in codes):
        missing = [c for c, code in zip(text, codes) if code is None]
        print(f"⚠️  警告: 以下字未在常用双拼字库中找到: {' '.join(missing)}")
        return None

    n = len(codes)
    if n == 1:
        return codes[0]
    elif n == 2:
        return codes[0] + codes[1]
    elif n == 3:
        # 3字: 声1 + 声2 + 3字全码(声3韵3)
        return codes[0][0] + codes[1][0] + codes[2]
    else:
        # 4字+: 声1 + 声2 + 声3 + 末字声
        return codes[0][0] + codes[1][0] + codes[2][0] + codes[-1][0]


def parse_shortcut_dict() -> tuple[list[str], list[tuple[str, str, int]]]:
    """解析现有快捷词典，返回 (header_lines, entries)。"""
    if not SHORTCUT_DICT.exists():
        header = [
            "# Rime dictionary",
            "# encoding: utf-8",
            "---",
            "name: sbzr.shortcut",
            'version: "1.0"',
            "sort: by_weight",
            "use_preset_vocabulary: false",
            "columns:",
            "  - text",
            "  - code",
            "  - weight",
            "...",
        ]
        return header, []

    lines = SHORTCUT_DICT.read_text(encoding="utf-8").splitlines()
    header: list[str] = []
    entries: list[tuple[str, str, int]] = []
    in_body = False

    for line in lines:
        if not in_body:
            header.append(line)
            if line.strip() == "...":
                in_body = True
            continue
        if not line.strip() or line.strip().startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 3:
            try:
                entries.append((parts[0].strip(), parts[1].strip(), int(parts[2].strip())))
            except ValueError:
                continue

    return header, entries


def save_shortcut_dict(header: list[str], entries: list[tuple[str, str, int]]) -> None:
    """去重、按权重/编码排序并写回快捷词典。"""
    # 去重：按 (text, code) 唯一，保留最高权重
    dedup: dict[tuple[str, str], int] = {}
    for text, code, weight in entries:
        key = (text, code)
        dedup[key] = max(dedup.get(key, 0), weight)

    sorted_entries = sorted(dedup.items(), key=lambda item: (-item[1], item[0][1], item[0][0]))
    out_lines = list(header)
    for (text, code), weight in sorted_entries:
        out_lines.append(f"{text}\t{code}\t{weight}")

    SHORTCUT_DICT.parent.mkdir(parents=True, exist_ok=True)
    SHORTCUT_DICT.write_text("\n".join(out_lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="一键添加快捷词到 sbzr.shortcut.dict.yaml")
    parser.add_argument("text", help="要添加的词条 (如 '人工智能' 或 'Neovim')")
    parser.add_argument("code", nargs="?", default=None, help="自定义编码 (可选，中文默认自动派生)")
    parser.add_argument("weight", nargs="?", type=int, default=DEFAULT_WEIGHT, help=f"词条权重 (默认 {DEFAULT_WEIGHT})")

    args = parser.parse_args()
    text = args.text.strip()
    code = args.code.strip().lower() if args.code else None
    weight = args.weight

    if not text:
        print("错误: 词条不能为空")
        return 1

    char_map = load_char_map()
    if not code:
        code = derive_sbzr_code(text, char_map)
        if not code:
            print("错误: 无法自动计算编码，请手动指定编码。例如: ./add-word \"词条\" \"bmma\"")
            return 1

    header, entries = parse_shortcut_dict()
    entries.append((text, code, weight))
    save_shortcut_dict(header, entries)

    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  ✓ 成功添加快捷词: 【{text}】")
    print(f"  • 编码: {code}")
    print(f"  • 权重: {weight}")
    print(f"  • 词库: sbzr.shortcut.dict.yaml")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("💡 提示: 重新编译生效请运行: ./rebuild (或在输入法菜单点击 Redeploy)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
