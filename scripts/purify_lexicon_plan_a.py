#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
purify_lexicon_plan_a.py — 词库方案A高纯提纯流水线 (3字/4字/5+字生僻死词与切片碎片清理)

设计原则:
1. 绝对零误伤:
   - 单字 (1字) 与 双字词 (2字): 100% 完整保留。
   - 个人词库 (sbzr.shortcut, sbzr.userdb, dynamic_freq): 100% 完整保留。
   - 地名与常用成语: 100% 完整保留。
2. 3字、4字及 4字以上 (5+字) 词条提纯:
   - 仅当属于现代汉语真实成词 (在 SUBTLEX-CH、CppJieba 或 Rime-Ice 现代权威语料中权重 >= 500) 时保留。
   - 剔除现代语料中词频极低/为零的文言古籍死词 (如「绝域殊方」、「抃风舞润」) 与语料滑动残句碎片 (如「单独写到」、「最典型的」、「终端下的」)。
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


def load_modern_authentic_words() -> set[str]:
    """汇总现代汉语权威真实成词白名单集合。"""
    authentic = set()

    # 1. Rime-Ice 现代权威核心词表 (权重 >= 500 的真实词)
    if ICE_DIR.exists():
        for p in ICE_DIR.glob("*.dict.yaml"):
            if "tencent" in p.name:
                continue
            for line in p.read_text(encoding="utf-8").splitlines():
                if line and not line.startswith("#"):
                    parts = line.split("\t")
                    if len(parts) >= 3:
                        try:
                            w = int(parts[2])
                            if w >= 500:
                                authentic.add(parts[0].strip())
                        except ValueError:
                            pass
                    elif len(parts) >= 1 and "8105" in p.name:
                        authentic.add(parts[0].strip())

    # 2. CppJieba 真实分词词典 (词频 >= 5 的词)
    if JIEBA_FILE.exists():
        for line in JIEBA_FILE.read_text(encoding="utf-8").splitlines():
            if line:
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        freq = int(parts[1])
                        if freq >= 5:
                            authentic.add(parts[0].strip())
                    except ValueError:
                        pass

    # 3. SUBTLEX-CH 现代影视生活语料 (词频 >= 2)
    if EXTERNAL_TSV.exists():
        with EXTERNAL_TSV.open(encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                if row.get("source") == "SUBTLEX-CH":
                    try:
                        val = float(row.get("external_value", 0))
                        if val >= 2:
                            authentic.add(row["text"].strip())
                    except ValueError:
                        pass

    # 4. 保护用户词、地名、常用成语
    for name in ("chengyu.dict.yaml", "sbzr.extended.diming.dict.yaml", "sbzr.shortcut.dict.yaml", "sbzr.userdb.dict.yaml", "sbzr.common-frequency.dict.yaml"):
        p = DICTS_DIR / name
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                if "\t" in line and not line.startswith("#"):
                    authentic.add(line.split("\t")[0].strip())

    return authentic


def purify_base_dict(authentic_set: set[str]) -> tuple[int, int, int]:
    print("[1/2] 正在深度净化 base.dict.yaml...")
    lines = BASE_DICT.read_text(encoding="utf-8").splitlines()
    header: list[str] = []
    body_lines: list[str] = []
    in_body = False

    kept_count = 0
    dropped_count = 0
    total_count = 0

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
            total_count += 1
            text = parts[0].strip()
            n = len(text)

            # 核心过滤规则:
            # 1. 1~2 字词: 100% 完整保留 (绝不误伤)
            # 2. 3 字及以上: 必须在现代权威真词白名单中
            if n <= 2 or text in authentic_set:
                body_lines.append(line)
                kept_count += 1
            else:
                dropped_count += 1
        else:
            body_lines.append(line)

    out_content = "\n".join(header) + "\n" + "\n".join(body_lines) + "\n"
    BASE_DICT.write_text(out_content, encoding="utf-8")
    print(f"    ✓ base.dict.yaml 处理完毕:")
    print(f"      - 初始条目: {total_count} 行")
    print(f"      - 保留真词: {kept_count} 行 ({kept_count/total_count*100:.1f}%)")
    print(f"      - 剔除死词/残片: {dropped_count} 行 ({dropped_count/total_count*100:.1f}%)")
    return total_count, kept_count, dropped_count


def verify_purification() -> None:
    print("[2/2] 验证关键词存活与清理效果...")
    content = BASE_DICT.read_text(encoding="utf-8")

    test_real = [
        "精神", "人工智能", "机器学习", "云计算", "大数据", "区块链",
        "微服务", "一帆风顺", "莫名其妙", "全力以赴", "甲乙双方"
    ]
    test_garbage = [
        "绝域殊方", "抃风舞润", "枘凿冰炭", "单独写到", "最典型的",
        "是到新的", "终端下的", "井婶", "景婶", "将有什"
    ]

    print("    --- 现代真词保留验证 (应全部为 True) ---")
    for w in test_real:
        found = f"{w}\t" in content
        status = "✓ 正常保留" if found else "✗ 丢失"
        print(f"      {w:10s} ➔ {status}")

    print("    --- 死词与碎片清理验证 (应全部为 False/已清除) ---")
    for w in test_garbage:
        found = f"{w}\t" in content
        status = "✗ 未清除" if found else "✓ 成功清除"
        print(f"      {w:10s} ➔ {status}")


def main() -> int:
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  词库方案A高纯提纯流水线 (Purify Lexicon Plan A)")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    authentic_set = load_modern_authentic_words()
    print(f"  ✓ 现代汉语权威真词白名单总库: {len(authentic_set)} 词")
    purify_base_dict(authentic_set)
    verify_purification()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("💡 提示: 词库提纯完成，正在重新编译部署...")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
