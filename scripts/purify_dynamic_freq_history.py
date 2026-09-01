#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
purify_dynamic_freq_history.py — 动态词频历史记录与多端同步快照全量提纯清洗

功能:
1. 载入 40 万现代汉语权威真词白名单 (SUBTLEX + CppJieba + Rime-Ice + 成语 + 地名 + 快捷词)。
2. 扫描 dynamic_freq.local.txt 以及所有 sync/*/dynamic_freq.txt。
3. 剔除所有不在现代白名单中的文言死词与残句切片垃圾。
4. 保护所有单字、双字词及合法现代短语。
"""

from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICTS_DIR = ROOT / "sbzr.chrome.extension" / "dicts"
ICE_DIR = ROOT / "resource" / "rime_ice_dicts"
JIEBA_FILE = ROOT / "resource" / "jieba.dict.utf8"
EXTERNAL_TSV = ROOT / "analysis" / "wordfreq-external" / "external_comparison.tsv"
LOCAL_DF = ROOT / "dynamic_freq.local.txt"
SYNC_DIR = ROOT / "sync"


def load_master_whitelist() -> set[str]:
    whitelist = set()

    # 1. Rime-Ice 核心
    if ICE_DIR.exists():
        for p in ICE_DIR.glob("*.dict.yaml"):
            if "tencent" in p.name:
                continue
            for line in p.read_text(encoding="utf-8").splitlines():
                if line and not line.startswith("#"):
                    parts = line.split("\t")
                    if len(parts) >= 1:
                        whitelist.add(parts[0].strip())

    # 2. CppJieba
    if JIEBA_FILE.exists():
        for line in JIEBA_FILE.read_text(encoding="utf-8").splitlines():
            if line:
                parts = line.split()
                if len(parts) >= 1:
                    whitelist.add(parts[0].strip())

    # 3. SUBTLEX-CH
    if EXTERNAL_TSV.exists():
        with EXTERNAL_TSV.open(encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                whitelist.add(row.get("text", "").strip())

    # 4. 成语、地名、快捷词、用户词
    for name in ("chengyu.dict.yaml", "sbzr.extended.diming.dict.yaml", "sbzr.shortcut.dict.yaml", "sbzr.userdb.dict.yaml", "sbzr.common-frequency.dict.yaml"):
        p = DICTS_DIR / name
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                if "\t" in line and not line.startswith("#"):
                    whitelist.add(line.split("\t")[0].strip())

    return whitelist


def clean_file(path: Path, whitelist: set[str]) -> tuple[int, int, list[str]]:
    if not path.exists():
        return 0, 0, []

    lines = path.read_text(encoding="utf-8").splitlines()
    cleaned: list[str] = []
    dropped: list[str] = []

    for line in lines:
        if not line.strip() or line.startswith("#"):
            cleaned.append(line)
            continue

        parts = line.split("\t")
        # dynamic_freq format: code \t type \t text \t timestamp
        if len(parts) >= 3:
            text = parts[2].strip()
        elif len(parts) == 2:
            text = parts[0].strip()
        else:
            text = line.strip()

        # 保护非纯汉字内容 (英文/符号/日语/数字等用户输入)
        is_pure_chinese = all('\u4e00' <= c <= '\u9fff' for c in text)
        if not is_pure_chinese:
            cleaned.append(line)
            continue

        # 纯汉字规则: 1~2字词100%保留; 3字及以上必须在白名单
        if len(text) <= 2 or text in whitelist:
            cleaned.append(line)
        else:
            dropped.append(text)

    path.write_text("\n".join(cleaned) + ("\n" if cleaned else ""), encoding="utf-8")
    return len(lines), len(cleaned), dropped


def main() -> int:
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  动态词频全量深度清洗 (Purify Dynamic Frequency)")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    whitelist = load_master_whitelist()
    print(f"  ✓ 现代汉语权威真词白名单总库: {len(whitelist)} 词\n")

    targets = []
    if LOCAL_DF.exists():
        targets.append(LOCAL_DF)
    for p in SYNC_DIR.glob("*/dynamic_freq.txt"):
        targets.append(p)

    total_purged = 0
    for target in targets:
        orig, kept, dropped = clean_file(target, whitelist)
        rel_path = target.relative_to(ROOT) if target.is_relative_to(ROOT) else target
        print(f"📁 清洗文件: {rel_path}")
        print(f"   • 原始条目: {orig} | 保留条目: {kept} | 剔除垃圾: {len(dropped)}")
        if dropped:
            sample = dropped[:10]
            more = f" ...等共 {len(dropped)} 条" if len(dropped) > 10 else ""
            print(f"   • 已剔除垃圾词样例: {sample}{more}")
        total_purged += len(dropped)
        print()

    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"✓ 全网历史清洗完毕，共剔除 {total_purged} 条生僻死词与语法切片！")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
