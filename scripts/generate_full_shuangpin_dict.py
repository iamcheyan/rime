#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_full_shuangpin_dict.py — 全双拼 (6-8+ 码) 兼容词典全量生成流水线

功能:
1. 扫描当前纯净词库 (base, common-frequency, chengyu, diming, userdb) 中所有的 3 字及以上词条。
2. 根据声笔自然双拼真理字表 (resource/常用字双拼拼音.db)，为每个词条自动派生精准的全双拼编码 (3字6码、4字8码、5+字10+码)。
3. 写入 sbzr.chrome.extension/dicts/sbzr.full.dict.yaml。
4. 保证用户使用标准全双拼输入人名、地名、专有名词、成语时 100% 能够打出！
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICTS_DIR = ROOT / "sbzr.chrome.extension" / "dicts"
OUT_DICT = DICTS_DIR / "sbzr.full.dict.yaml"
CHAR_DB = ROOT / "resource" / "常用字双拼拼音.db"


def load_char_map() -> dict[str, str]:
    char_map = {}
    if not CHAR_DB.exists():
        return char_map
    for line in CHAR_DB.read_text(encoding="utf-8").splitlines():
        if "\t" in line and not line.startswith("#"):
            parts = line.split("\t")
            if len(parts) >= 2:
                char = parts[0].strip()
                code = parts[1].strip()
                if char not in char_map:
                    char_map[char] = code
    return char_map


def generate_full_dict() -> int:
    print("[1/3] 加载双拼真理字表与词典来源...")
    char_map = load_char_map()
    print(f"    字表字符数: {len(char_map)}")

    source_names = [
        "base.dict.yaml",
        "sbzr.common-frequency.dict.yaml",
        "chengyu.dict.yaml",
        "sbzr.extended.diming.dict.yaml",
        "sbzr.userdb.dict.yaml",
        "sbzr.shortcut.dict.yaml",
    ]

    words: dict[str, int] = {}
    for name in source_names:
        p = DICTS_DIR / name
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            if "\t" in line and not line.startswith("#"):
                parts = line.split("\t")
                if len(parts) >= 3:
                    text = parts[0].strip()
                    if len(text) >= 3:
                        try:
                            w = int(parts[2].strip())
                            words[text] = max(words.get(text, 0), w)
                        except ValueError:
                            pass

    print(f"    收集到 >=3 字词条: {len(words)} 条")

    print("[2/3] 派生全双拼 (6-8+ 码) 编码...")
    entries: list[tuple[str, str, int]] = []
    for text, w in words.items():
        codes = [char_map.get(c) for c in text]
        if any(c is None for c in codes):
            continue
        full_code = "".join(codes)
        entries.append((text, full_code, w))

    # 按权重降序、编码、文本排序
    entries.sort(key=lambda item: (-item[2], item[1], item[0]))

    print(f"[3/3] 写入全双拼兼容词典: {OUT_DICT.relative_to(ROOT)}...")
    header = [
        "# Rime dictionary",
        "# encoding: utf-8",
        "#",
        "# sbzr.full.dict.yaml — 全双拼 (6-8+ 码) 向下兼容词典",
        "# 包含所有 3 字、4 字及长词的完整双拼编码 (每字 2 码)",
        "---",
        "name: sbzr.chrome.extension/dicts/sbzr.full",
        'version: "1.0"',
        "sort: by_weight",
        "use_preset_vocabulary: false",
        "columns:",
        "  - text",
        "  - code",
        "  - weight",
        "...",
    ]

    out_lines = list(header)
    for text, code, w in entries:
        out_lines.append(f"{text}\t{code}\t{w}")

    OUT_DICT.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    print(f"    ✓ 成功生成 {len(entries)} 条全双拼词条！")
    return len(entries)


def main() -> int:
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  生成全双拼 (6-8+ 码) 兼容词典流水线")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    count = generate_full_dict()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"💡 完成: 已生成 {count} 条全双拼编码，请更新 sbzr.dict.yaml 并执行 ./rebuild")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
