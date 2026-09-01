#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
purify_lexicon_plan_a.py — 词库方案A高纯提纯流水线 (纯粹精简版: 严格限定 1~4 字核心基础成词)

设计原则:
1. 绝对精简与高纯:
   - 严格只保留 1 字、2 字、3 字、4 字权威成词 (绝不硬塞 5+ 字长句)。
   - 所有 5 字及以上长句完全交给 Lua 动态组句引擎 (sentence_translator.lua) 实时流式拼装。
2. 基础词库来源:
   - 单字 (1字) 与 双字词 (2字): 100% 完整保留。
   - 3字、4字真实成词 (如「一大把」、「看起来」、「不错」、「天下无敌」): 经现代语料白名单校验后保留。
   - 个人词库 (sbzr.shortcut, sbzr.userdb, dynamic_freq)、地名与常用成语: 100% 完整保留。
"""

from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICTS_DIR = ROOT / "sbzr.chrome.extension" / "dicts"
BASE_DICT = DICTS_DIR / "base.dict.yaml"
ICE_DIR = ROOT / "resource" / "rime_ice_dicts"
JIEBA_FILE = ROOT / "resource" / "jieba.dict.utf8"
EXTERNAL_TSV = ROOT / "analysis" / "wordfreq-external" / "external_comparison.tsv"
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


def derive_4code(text: str, char_map: dict[str, str]) -> str | None:
    codes = [char_map.get(c) for c in text]
    if any(c is None for c in codes):
        return None
    n = len(codes)
    if n == 1:
        return codes[0]
    elif n == 2:
        return codes[0] + codes[1]
    elif n == 3:
        return codes[0][0] + codes[1][0] + codes[2]
    else:
        return codes[0][0] + codes[1][0] + codes[2][0] + codes[-1][0]


def is_standard_chinese(text: str) -> bool:
    return all("\u4e00" <= c <= "\u9fa5" for c in text)


def load_modern_authentic_words() -> set[str]:
    """汇总现代汉语权威真实成词白名单集合。"""
    authentic = set()

    # 1. Rime-Ice 核心词表 (1~4 字)
    if ICE_DIR.exists():
        for name in ("8105.dict.yaml", "base.dict.yaml", "ext.dict.yaml", "others.dict.yaml"):
            p = ICE_DIR / name
            if p.exists():
                for line in p.read_text(encoding="utf-8").splitlines():
                    if line and not line.startswith("#"):
                        parts = line.split("\t")
                        if len(parts) >= 1:
                            t = parts[0].strip()
                            if len(t) <= 4:
                                authentic.add(t)

    # 2. CppJieba 真实分词词典
    if JIEBA_FILE.exists():
        for line in JIEBA_FILE.read_text(encoding="utf-8").splitlines():
            if line:
                parts = line.split()
                if len(parts) >= 1:
                    t = parts[0].strip()
                    if len(t) <= 4:
                        authentic.add(t)

    # 3. SUBTLEX-CH
    if EXTERNAL_TSV.exists():
        with EXTERNAL_TSV.open(encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                if row.get("source") in ("SUBTLEX-CH", "CppJieba", "Rime essay"):
                    t = row.get("text", "").strip()
                    if len(t) <= 4:
                        authentic.add(t)

    # 4. 保护用户词、地名、常用成语
    for name in ("chengyu.dict.yaml", "sbzr.extended.diming.dict.yaml", "sbzr.shortcut.dict.yaml", "sbzr.userdb.dict.yaml", "sbzr.common-frequency.dict.yaml"):
        p = DICTS_DIR / name
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                if "\t" in line and not line.startswith("#"):
                    t = line.split("\t")[0].strip()
                    if len(t) <= 4:
                        authentic.add(t)

    return authentic


def harvest_rimeice_authentic_phrases(authentic_set: set[str], char_map: dict[str, str]) -> dict[tuple[str, str], int]:
    """仅从 rimeice.3字 与 rimeice.4字 萃取 3~4 字成词 (绝不抓取 5+ 字长句)。"""
    print("[1/3] 从 rimeice 原始库中萃取 3~4 字标准成词 (如一大把、看起来、天下无敌)...")
    harvested = {}
    targets = [
        DICTS_DIR / "sbzr.rimeice.3字.dict.yaml",
        DICTS_DIR / "sbzr.rimeice.4字.dict.yaml",
    ]

    for p in targets:
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            if "\t" in line and not line.startswith("#"):
                parts = line.split("\t")
                if len(parts) >= 3:
                    text, code, w_str = parts[0].strip(), parts[1].strip(), parts[2].strip()
                    n = len(text)
                    if not is_standard_chinese(text) or n > 4:
                        continue

                    if text in authentic_set:
                        try:
                            w = int(w_str)
                            c4 = derive_4code(text, char_map)
                            if c4:
                                key4 = (text, c4)
                                harvested[key4] = max(harvested.get(key4, 0), min(w, 2000))
                            if len(code) == 4:
                                key_code = (text, code)
                                harvested[key_code] = max(harvested.get(key_code, 0), min(w, 2000))
                        except ValueError:
                            pass

    print(f"    ✓ 成功萃取 {len(harvested)} 个高质量 3~4 字成词编码！")
    return harvested


def purify_base_dict(authentic_set: set[str], harvested_entries: dict[tuple[str, str], int]) -> tuple[int, int, int]:
    print("[2/3] 深度净化 base.dict.yaml (彻底剔除 5+ 字长句与生僻死词)...")
    lines = BASE_DICT.read_text(encoding="utf-8").splitlines()
    header: list[str] = []
    existing_entries: dict[tuple[str, str], int] = {}
    in_body = False

    total_count = 0
    dropped_count = 0

    for line in lines:
        if not in_body:
            header.append(line)
            if line.strip() == "...":
                in_body = True
            continue
        if not line.strip() or line.startswith("#"):
            continue

        parts = line.split("\t")
        if len(parts) >= 3:
            total_count += 1
            text = parts[0].strip()
            code = parts[1].strip()
            w = int(parts[2].strip())
            n = len(text)

            # 核心过滤规则:
            # 1. 严格限定长度 <= 4 (5+ 字一律剔除，交给 Lua 动态组句)
            # 2. 1~2 字词: 100% 完整保留
            # 3. 3~4 字词: 必须在现代权威真词白名单中
            if n <= 4 and (n <= 2 or text in authentic_set):
                key = (text, code)
                existing_entries[key] = max(existing_entries.get(key, 0), w)
            else:
                dropped_count += 1

    # 融合萃取的真词
    for (text, code), w in harvested_entries.items():
        key = (text, code)
        existing_entries[key] = max(existing_entries.get(key, 0), w)

    sorted_rows = sorted(existing_entries.items(), key=lambda item: (-item[1], item[0][1], item[0][0]))

    out_lines = list(header)
    for (text, code), w in sorted_rows:
        out_lines.append(f"{text}\t{code}\t{w}")

    BASE_DICT.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    kept_count = len(sorted_rows)
    print(f"    ✓ base.dict.yaml 清理完毕:")
    print(f"      - 初始条目: {total_count} 行")
    print(f"      - 保留核心基础词: {kept_count} 行 (严格 <= 4字)")
    print(f"      - 剔除 5+字长句及死词: {dropped_count} 行")
    return total_count, kept_count, dropped_count


def main() -> int:
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  词库方案A高纯提纯流水线 (恢复纯粹 1~4 字基础词库)")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    char_map = load_char_map()
    authentic_set = load_modern_authentic_words()
    print(f"  ✓ 现代汉语权威真词白名单总库: {len(authentic_set)} 词 (<=4字)")
    harvested = harvest_rimeice_authentic_phrases(authentic_set, char_map)
    purify_base_dict(authentic_set, harvested)
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
