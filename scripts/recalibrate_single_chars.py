#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
recalibrate_single_chars.py — 单字双拼词库重构与生僻怪字彻底清理

功能:
1. 基于国家通用规范汉字真理字表 (resource/常用字双拼拼音.db)，按真实千万级字频 (3500万~1万)
   生成 3,653 个常用单字的 2 码双拼词典 (sbzr.len1.dict.yaml)，权重设为 10,000 ~ 50,000。
2. 深度清洗 sbzr.rimeice.12字.dict.yaml，彻底剔除 CJK 扩展区生僻怪字 (如 𠮖, 晹, 廙, 彌, 悕, 㐆, 㐌, 㐹 等)。
3. 彻底解决输入「yi」出怪字、不出「一/以/已/意/易/医」的问题！
"""

from __future__ import annotations

import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICTS_DIR = ROOT / "sbzr.chrome.extension" / "dicts"
LEN1_DICT = DICTS_DIR / "sbzr.len1.dict.yaml"
RIMEICE_12_DICT = DICTS_DIR / "sbzr.rimeice.12字.dict.yaml"
CHAR_DB = ROOT / "resource" / "常用字双拼拼音.db"


def is_standard_common_chinese(c: str) -> bool:
    """仅保留常用标准汉字范围 (排除 CJK 扩展区生僻怪字)。"""
    return len(c) == 1 and ("\u4e00" <= c <= "\u9fa5")


def rebuild_len1_dict() -> int:
    print("[1/2] 重构单字双拼词典 (sbzr.len1.dict.yaml)...")
    char_entries = []
    for line in CHAR_DB.read_text(encoding="utf-8").splitlines():
        if "\t" in line and not line.startswith("#"):
            parts = line.split("\t")
            if len(parts) >= 3:
                char = parts[0].strip()
                code = parts[1].strip()
                freq = int(parts[2].strip())
                char_entries.append((char, code, freq))

    char_entries.sort(key=lambda x: -x[2])

    max_log = math.log(char_entries[0][2] + 1)
    min_log = math.log(char_entries[-1][2] + 1)

    rows: list[tuple[str, str, int]] = []
    for char, code, freq in char_entries:
        log_v = math.log(freq + 1)
        norm = (log_v - min_log) / (max_log - min_log)
        # 常用字高权重区间 10000 ~ 50000
        w = 10000 + int(norm * 40000)
        rows.append((char, code, w))

    # 按权重降序
    rows.sort(key=lambda x: (-x[2], x[1], x[0]))

    header = [
        "# Rime dictionary",
        "# encoding: utf-8",
        "#",
        "# sbzr.len1.dict.yaml — 国家规范常用汉字双拼词典 (校准版)",
        "# 基于 3,653 常用字真实千万级字频映射 (10,000 ~ 50,000)",
        "---",
        "name: sbzr.chrome.extension/dicts/sbzr.len1",
        'version: "2.0"',
        "sort: by_weight",
        "use_preset_vocabulary: false",
        "columns:",
        "  - text",
        "  - code",
        "  - weight",
        "...",
    ]

    out_lines = list(header)
    for char, code, w in rows:
        out_lines.append(f"{char}\t{code}\t{w}")

    LEN1_DICT.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    print(f"    ✓ 已写入 {len(rows)} 个标准单字双拼条目 -> {LEN1_DICT.relative_to(ROOT)}")
    return len(rows)


def purify_rimeice_12_dict(common_chars: set[str]) -> tuple[int, int, int]:
    print("[2/2] 净化 sbzr.rimeice.12字.dict.yaml (剔除生僻怪字)...")
    lines = RIMEICE_12_DICT.read_text(encoding="utf-8").splitlines()

    header: list[str] = []
    body_lines: list[str] = []
    in_body = False

    total = 0
    kept = 0
    dropped = 0

    for line in lines:
        if not in_body:
            header.append(line)
            if line.strip() == "...":
                in_body = True
            continue
        if not line.strip() or line.startswith("#"):
            continue

        parts = line.split("\t")
        if len(parts) >= 2:
            total += 1
            text = parts[0].strip()

            # 过滤单字:
            if len(text) == 1:
                # 必须是标准常用汉字且在常用字表中
                if is_standard_common_chinese(text) and text in common_chars:
                    body_lines.append(line)
                    kept += 1
                else:
                    dropped += 1
            else:
                # 2字词: 必须全部由标准汉字组成
                if all(is_standard_common_chinese(c) for c in text):
                    body_lines.append(line)
                    kept += 1
                else:
                    dropped += 1
        else:
            body_lines.append(line)

    out = "\n".join(header) + "\n" + "\n".join(body_lines) + "\n"
    RIMEICE_12_DICT.write_text(out, encoding="utf-8")
    print(f"    ✓ rimeice.12字 净化完毕:")
    print(f"      - 初始条目: {total} 行")
    print(f"      - 保留条目: {kept} 行")
    print(f"      - 剔除生僻怪字/冷门组合: {dropped} 行")
    return total, kept, dropped


def main() -> int:
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  单字双拼词库重构与生僻怪字彻底清理")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    common_chars = set()
    for line in CHAR_DB.read_text(encoding="utf-8").splitlines():
        if "\t" in line and not line.startswith("#"):
            common_chars.add(line.split("\t")[0].strip())

    rebuild_len1_dict()
    purify_rimeice_12_dict(common_chars)
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
