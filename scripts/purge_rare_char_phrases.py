#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
purge_rare_char_phrases.py — 包含生僻怪字/冷门繁复字的词组全量深度清洗

清洗标杆:
- 国家《通用规范汉字表》(8,105 规范标准汉字) 与 3,653 核心常用字。
- 凡包含非规范生僻字 (如 豿, 蚖, 㹴, 僾, 脝, 櫜 等) 的词组一律彻底清洗剔除。
- 保护科技与知名品牌专有名词 (如「宏碁」)。
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICTS_DIR = ROOT / "sbzr.chrome.extension" / "dicts"
ICE_DIR = ROOT / "resource" / "rime_ice_dicts"
CHAR_DB = ROOT / "resource" / "常用字双拼拼音.db"

# 保护的特例常用专有名词
PROTECTED_WORDS = {"宏碁", "微信", "支付宝", "哔哩哔哩"}


def load_standard_characters() -> set[str]:
    standard_chars = set()

    # 1. 8105 通用规范汉字
    if ICE_DIR.exists():
        for p in ICE_DIR.glob("*.dict.yaml"):
            if "8105" in p.name:
                for line in p.read_text(encoding="utf-8").splitlines():
                    if line and not line.startswith("#"):
                        parts = line.split("\t")
                        if len(parts) >= 1 and len(parts[0].strip()) == 1:
                            standard_chars.add(parts[0].strip())

    # 2. 常用字表
    if CHAR_DB.exists():
        for line in CHAR_DB.read_text(encoding="utf-8").splitlines():
            if "\t" in line and not line.startswith("#"):
                standard_chars.add(line.split("\t")[0].strip())

    return standard_chars


def clean_dictionary_file(path: Path, standard_chars: set[str]) -> tuple[int, int, int]:
    if not path.exists():
        return 0, 0, 0

    lines = path.read_text(encoding="utf-8").splitlines()
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

            if text in PROTECTED_WORDS:
                body_lines.append(line)
                kept += 1
                continue

            # 检查是否每个汉字都在标准规范汉字表中
            has_bad_char = any(
                c not in standard_chars and ("\u4e00" <= c <= "\u9fff" or ord(c) > 0x20000 or "\u3400" <= c <= "\u4dbf")
                for c in text
            )

            if has_bad_char:
                dropped += 1
            else:
                body_lines.append(line)
                kept += 1
        else:
            body_lines.append(line)

    out = "\n".join(header) + "\n" + "\n".join(body_lines) + "\n"
    path.write_text(out, encoding="utf-8")
    return total, kept, dropped


def main() -> int:
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  生僻怪字词组全量深度清洗流水线")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    standard_chars = load_standard_characters()
    print(f"  ✓ 国家通用规范汉字标杆: {len(standard_chars)} 规范字\n")

    target_files = [
        "base.dict.yaml",
        "sbzr.common-frequency.dict.yaml",
        "chengyu.dict.yaml",
        "sbzr.extended.diming.dict.yaml",
        "sbzr.rimeice.12字.dict.yaml",
    ]

    total_dropped = 0
    for name in target_files:
        p = DICTS_DIR / name
        total, kept, dropped = clean_dictionary_file(p, standard_chars)
        print(f"📁 清洗文件: {name:32s} | 保留: {kept:6d} | 剔除生僻词组: {dropped:4d}")
        total_dropped += dropped

    print(f"\n✓ 清洗完毕，共剔除 {total_dropped} 条包含生僻怪字的生僻词组！")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
