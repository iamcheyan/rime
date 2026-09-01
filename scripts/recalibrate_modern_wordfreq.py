#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
recalibrate_modern_wordfreq.py — 现代汉语全网高频词库深度校准与生僻词降权

功能:
1. 结合 SUBTLEX-CH (影视现代语料)、CppJieba (互联网35万词库) 与 Rime essay，
   筛选出 Top 25,000 现代高频核心词。
2. 依据声笔自然(sbzr)真理算法与多音字库，为高频词派生标准与变体编码，
   以阶梯权重 (2200 ~ 2998) 写入 sbzr.common-frequency.dict.yaml。
3. 压制 sbzr.len2.dict.yaml 中生僻方言词的虚高权重 (封顶为 1000)，
   彻底根治「井婶」压制「精神」等词库倒挂问题。
"""

from __future__ import annotations

import csv
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICTS_DIR = ROOT / "sbzr.chrome.extension" / "dicts"
COMMON_DICT = DICTS_DIR / "sbzr.common-frequency.dict.yaml"
LEN2_DICT = DICTS_DIR / "sbzr.len2.dict.yaml"
BASE_DICT = DICTS_DIR / "base.dict.yaml"
CHAR_DB = ROOT / "resource" / "常用字双拼拼音.db"
EXTERNAL_TSV = ROOT / "analysis" / "wordfreq-external" / "external_comparison.tsv"

TARGET_WORD_COUNT = 25000
WEIGHT_MIN = 5000
WEIGHT_MAX = 9998


def load_char_map() -> dict[str, str]:
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


def load_base_codes() -> dict[str, set[str]]:
    """从 base.dict.yaml 读取已有词条的所有合法编码 (包含多音字变体)。"""
    base_codes: dict[str, set[str]] = defaultdict(set)
    if not BASE_DICT.exists():
        return base_codes
    for line in BASE_DICT.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 2:
            base_codes[parts[0]].add(parts[1])
    return base_codes


def calculate_external_scores() -> dict[str, float]:
    """多源互补综合评分 (Reciprocal Rank Fusion)。"""
    scores: dict[str, float] = defaultdict(float)
    if not EXTERNAL_TSV.exists():
        print(f"⚠️  未找到外部对比文件: {EXTERNAL_TSV}")
        return scores

    with EXTERNAL_TSV.open(encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            text = row["text"]
            if not (2 <= len(text) <= 4):
                continue
            try:
                rank = float(row["external_rank"])
                src = row["source"]
                if src == "SUBTLEX-CH":
                    scores[text] += 1.0 / (rank + 10)
                elif src == "CppJieba":
                    scores[text] += 0.8 / (rank + 10)
                elif src == "Rime essay":
                    scores[text] += 0.6 / (rank + 10)
            except (ValueError, KeyError):
                continue
    return scores


def recalibrate_common_frequency() -> int:
    print("[1/3] 计算全网多源现代汉语词频综合分...")
    scores = calculate_external_scores()
    char_map = load_char_map()
    base_codes = load_base_codes()

    # 过滤能编码的词条，并按分数降序排序
    valid_candidates = []
    for text, score in scores.items():
        canonical = derive_sbzr_code(text, char_map)
        codes = set(base_codes.get(text, []))
        if canonical:
            codes.add(canonical)
        if codes:
            valid_candidates.append((text, score, codes))

    valid_candidates.sort(key=lambda x: -x[1])
    selected = valid_candidates[:TARGET_WORD_COUNT]
    print(f"    入选高频词条数: {len(selected)}")

    # 阶梯分段定权 (2200 ~ 2998)
    # 按排名对数分布平滑映射权重
    entries: list[tuple[str, str, int]] = []
    total = len(selected)

    for i, (text, score, codes) in enumerate(selected):
        # 归一化比例 (0.0 到 1.0)
        norm = 1.0 - (math.log(i + 1) / math.log(total + 1))
        weight = WEIGHT_MIN + int(norm * (WEIGHT_MAX - WEIGHT_MIN) + 0.5)
        for code in codes:
            entries.append((text, code, weight))

    # 去重并排序 (按权重降序、编码、文本)
    dedup: dict[tuple[str, str], int] = {}
    for text, code, weight in entries:
        key = (text, code)
        dedup[key] = max(dedup.get(key, 0), weight)

    sorted_rows = sorted(dedup.items(), key=lambda item: (-item[1], item[0][1], item[0][0]))

    header = [
        "# Rime dictionary",
        "# encoding: utf-8",
        "#",
        "# sbzr.common-frequency.dict.yaml — 现代汉语全网高频核心词库 (校准版)",
        "# 结合 SUBTLEX-CH、CppJieba 与 Rime-ice 多源语料生成",
        "---",
        "name: sbzr.chrome.extension/dicts/sbzr.common-frequency",
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
    for (text, code), weight in sorted_rows:
        out_lines.append(f"{text}\t{code}\t{weight}")

    COMMON_DICT.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    print(f"    ✓ 已写入 {len(sorted_rows)} 个高频编码条目 -> {COMMON_DICT.relative_to(ROOT)}")
    return len(sorted_rows)


def suppress_len2_anomalies() -> int:
    print("[2/3] 压制 sbzr.len2.dict.yaml 中生僻词的虚高权重 (封顶 1000)...")
    if not LEN2_DICT.exists():
        print("    跳过: sbzr.len2.dict.yaml 不存在")
        return 0

    lines = LEN2_DICT.read_text(encoding="utf-8").splitlines()
    header: list[str] = []
    body_lines: list[str] = []
    in_body = False
    modified_count = 0

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
            text, code, w_str = parts[0], parts[1], parts[2]
            try:
                w = int(w_str)
                if w > 1000:
                    w = 1000
                    modified_count += 1
                body_lines.append(f"{text}\t{code}\t{w}")
            except ValueError:
                body_lines.append(line)
        else:
            body_lines.append(line)

    out = "\n".join(header) + "\n" + "\n".join(body_lines) + "\n"
    LEN2_DICT.write_text(out, encoding="utf-8")
    print(f"    ✓ 已压制 {modified_count} 条生僻虚高权重 (如井婶/景婶/经婶/荆婶 -> 1000)")
    return modified_count


def verify_jysf() -> None:
    print("[3/3] 验证 'jysf' (精神) 词频排位...")
    # 模拟 Rime 词频合并排序
    candidates: list[tuple[str, int, str]] = []
    
    # 检查 common-frequency
    for line in COMMON_DICT.read_text(encoding="utf-8").splitlines():
        if "jysf" in line and not line.startswith("#"):
            parts = line.split("\t")
            if len(parts) >= 3 and parts[1] == "jysf":
                candidates.append((parts[0], int(parts[2]), "common-frequency"))

    # 检查 len2
    for line in LEN2_DICT.read_text(encoding="utf-8").splitlines():
        if "jysf" in line and not line.startswith("#"):
            parts = line.split("\t")
            if len(parts) >= 3 and parts[1] == "jysf":
                candidates.append((parts[0], int(parts[2]), "len2"))

    candidates.sort(key=lambda x: -x[1])
    print("    当前 jysf 候选排序前 5 位:")
    for rank, (text, w, src) in enumerate(candidates[:5], 1):
        star = "🌟" if text == "精神" else "  "
        print(f"      {rank}. {star} 【{text}】 权重: {w} (来源: {src})")


def main() -> int:
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  现代汉语全网高频词库深度校准")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    recalibrate_common_frequency()
    suppress_len2_anomalies()
    verify_jysf()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("💡 提示: 校准完成，请运行 ./rebuild 重新编译部署 Rime")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
