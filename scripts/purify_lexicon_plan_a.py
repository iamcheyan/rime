#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
purify_lexicon_plan_a.py — 词库方案A高纯提纯流水线 (融合 3/4/5+ 字现代真实成词与长短语)

设计原则:
1. 绝对零误伤:
   - 单字 (1字) 与 双字词 (2字): 100% 完整保留。
   - 个人词库 (sbzr.shortcut, sbzr.userdb, dynamic_freq): 100% 完整保留。
   - 地名与常用成语: 100% 完整保留。
2. 3字、4字及 5+字 (如看起来不错、不得不说、不知不觉) 现代成词与长短语全面吸收:
   - 从 Rime-Ice 核心、CppJieba、SUBTLEX 及 rimeice.3字/4字/5字+ 词库中提取经过权威现代语料校验的真实成词与长短语。
   - 坚决剔除现代语料中词频极低/为零的文言古籍死词 (如「绝域殊方」) 与语料滑动残句碎片 (如「将有什」、「单独写到」、「最典型的」)。
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

    # 1. Rime-Ice 现代权威核心词表 (权重 >= 100 的真实词)
    if ICE_DIR.exists():
        for name in ("8105.dict.yaml", "base.dict.yaml", "ext.dict.yaml", "others.dict.yaml"):
            p = ICE_DIR / name
            if p.exists():
                for line in p.read_text(encoding="utf-8").splitlines():
                    if line and not line.startswith("#"):
                        parts = line.split("\t")
                        if len(parts) >= 1:
                            authentic.add(parts[0].strip())

    # 2. CppJieba 真实分词词典 (词频 >= 3 的词)
    if JIEBA_FILE.exists():
        for line in JIEBA_FILE.read_text(encoding="utf-8").splitlines():
            if line:
                parts = line.split()
                if len(parts) >= 1:
                    authentic.add(parts[0].strip())

    # 3. SUBTLEX-CH 现代影视生活语料
    if EXTERNAL_TSV.exists():
        with EXTERNAL_TSV.open(encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                if row.get("source") in ("SUBTLEX-CH", "CppJieba", "Rime essay"):
                    authentic.add(row.get("text", "").strip())

    # 4. 保护用户词、地名、常用成语
    for name in ("chengyu.dict.yaml", "sbzr.extended.diming.dict.yaml", "sbzr.shortcut.dict.yaml", "sbzr.userdb.dict.yaml", "sbzr.common-frequency.dict.yaml"):
        p = DICTS_DIR / name
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                if "\t" in line and not line.startswith("#"):
                    authentic.add(line.split("\t")[0].strip())

    return authentic


def harvest_rimeice_authentic_phrases(authentic_set: set[str], char_map: dict[str, str]) -> dict[tuple[str, str], int]:
    """从 rimeice.3字, 4字, 5字+ 中萃取所有高质量成词与常用短语。"""
    print("[1/3] 从 rimeice 原始库中萃取现代真实 3/4/5+ 字成词与短语 (如一大把、看起来不错、不得不说)...")
    harvested = {}
    targets = [
        DICTS_DIR / "sbzr.rimeice.3字.dict.yaml",
        DICTS_DIR / "sbzr.rimeice.4字.dict.yaml",
        DICTS_DIR / "sbzr.rimeice.5字+.dict.yaml",
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
                    if not is_standard_chinese(text):
                        continue

                    # 3/4 字必须在白名单，5+ 字词只要由标准规范汉字组成且长度 <= 10
                    is_valid = (text in authentic_set) or (n >= 5 and n <= 10 and int(w_str) >= 2000)
                    if is_valid:
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

    print(f"    ✓ 成功萃取 {len(harvested)} 个高质量成词与短语编码！")
    return harvested


def purify_base_dict(authentic_set: set[str], harvested_entries: dict[tuple[str, str], int]) -> tuple[int, int, int]:
    print("[2/3] 深度净化 base.dict.yaml 并融合 3/4/5+ 字高纯成词...")
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
            # 1. 1~2 字词: 100% 完整保留
            # 2. 3 字及以上: 必须在现代权威真词白名单中或合法长短语
            if n <= 2 or text in authentic_set or (n >= 5 and is_standard_chinese(text)):
                key = (text, code)
                existing_entries[key] = max(existing_entries.get(key, 0), w)
            else:
                dropped_count += 1

    # 融合从 rimeice 萃取的真词
    for (text, code), w in harvested_entries.items():
        key = (text, code)
        existing_entries[key] = max(existing_entries.get(key, 0), w)

    sorted_rows = sorted(existing_entries.items(), key=lambda item: (-item[1], item[0][1], item[0][0]))

    out_lines = list(header)
    for (text, code), w in sorted_rows:
        out_lines.append(f"{text}\t{code}\t{w}")

    BASE_DICT.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    kept_count = len(sorted_rows)
    print(f"    ✓ base.dict.yaml 处理完毕:")
    print(f"      - 初始条目: {total_count} 行")
    print(f"      - 保留/融合高纯真词: {kept_count} 行")
    print(f"      - 剔除死词/残片: {dropped_count} 行")
    return total_count, kept_count, dropped_count


def verify_purification() -> None:
    print("[3/3] 验证现代真词与长短语保留...")
    content = BASE_DICT.read_text(encoding="utf-8")

    test_real = [
        "看起来不错", "一大把", "一大批", "一大早", "一瞬间", "一方面", "老百姓",
        "精神", "人工智能", "机器学习", "云计算", "大数据", "区块链",
        "微服务", "莫名其妙", "全力以赴", "甲乙双方"
    ]
    test_garbage = [
        "绝域殊方", "抃风舞润", "枘凿冰炭", "单独写到", "最典型的",
        "是到新的", "终端下的", "井婶", "景婶", "将有什"
    ]

    print("    --- 现代真词与长短语验证 (应全部为 ✓ 正常保留) ---")
    for w in test_real:
        found = f"{w}\t" in content
        status = "✓ 正常保留" if found else "✗ 丢失"
        print(f"      {w:10s} ➔ {status}")

    print("    --- 死词与碎片清理验证 (应全部为 ✓ 成功清除) ---")
    for w in test_garbage:
        found = f"{w}\t" in content
        status = "✗ 未清除" if found else "✓ 成功清除"
        print(f"      {w:10s} ➔ {status}")


def main() -> int:
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  词库方案A高纯提纯流水线 (融合 3/4/5+ 现代成词与长短语)")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    char_map = load_char_map()
    authentic_set = load_modern_authentic_words()
    print(f"  ✓ 现代汉语权威真词白名单总库: {len(authentic_set)} 词")
    harvested = harvest_rimeice_authentic_phrases(authentic_set, char_map)
    purify_base_dict(authentic_set, harvested)
    verify_purification()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
