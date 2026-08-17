#!/usr/bin/env python3
"""rimeice 词库生僻词统计/瘦身工具（dict-optimize goal 第 2 步）。

事实核对（2026-08-17，基于扫描结果）:
  - sbzr.rimeice.12字.dict.yaml 实际内容是 1~2 字词（生僻单字 42,119 条 +
    生僻二字词 24,042 条），文件名中的 "12字" 应理解为 "1~2字"，
    并非 12 字长词 —— 文件内字长 ≥12 的词条数为 0。
  - 真正 ≥12 字的长词全部位于 sbzr.rimeice.5字+.dict.yaml（约 4.4 千条），
    任务书红线明确 "5字+ 暂不动"。

因此本工具:
  - 对 12字 / 5字+ 两个文件输出权重分布、字长分布、
    "字长≥8 且 权重=默认值" 与 "字长≥12 且 权重=默认值" 统计；
  - --apply 仅在【非 5字+ 文件】内删除 "字长≥12 且 权重=默认值" 的词条
    （按任务书字面规则；当前 12字 文件该集合为空 → 实际删除 0 条），
    删除清单写入 review/removed/。
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DICT_DIR = REPO / "sbzr.chrome.extension" / "dicts"
REMOVED_DIR = REPO / "review" / "removed"
STATS_PATH = REPO / "review" / "optimize_rimeice_stats.json"

FILES = ["sbzr.rimeice.12字.dict.yaml", "sbzr.rimeice.5字+.dict.yaml"]
DEFERRED_FILE = "sbzr.rimeice.5字+.dict.yaml"  # 红线: 暂不动


def iter_entries(path: Path):
    in_body = False
    with path.open("r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            s = line.rstrip("\n")
            if not s or s.startswith("#"):
                continue
            cols = s.split("\t")
            if len(cols) < 2:
                continue
            w = cols[0]
            # Python str 按码点计数，即汉字字数（扩展B区生僻字亦计1字）
            clen = len(w)
            weight = int(cols[2]) if len(cols) >= 3 and cols[2].isdigit() else 0
            yield lineno, w, cols[1], weight, clen


def analyze(path: Path) -> dict:
    weight_hist: Counter[int] = Counter()
    len_hist: Counter[int] = Counter()
    total = 0
    for _, _, _, weight, clen in iter_entries(path):
        weight_hist[weight] += 1
        len_hist[clen] += 1
        total += 1
    default_weight = weight_hist.most_common(1)[0][0] if total else None
    return {
        "total": total,
        "default_weight": default_weight,
        "weight_top10": [
            {"weight": w, "count": c} for w, c in weight_hist.most_common(10)
        ],
        "len_hist": {str(k): v for k, v in sorted(len_hist.items())},
    }


def default_and_long(path: Path) -> dict:
    info = analyze(path)
    dw = info["default_weight"]
    ge8_def = ge12_def = 0
    samples = []
    for _, word, code, weight, clen in iter_entries(path):
        if weight != dw:
            continue
        if clen >= 8:
            ge8_def += 1
        if clen >= 12:
            ge12_def += 1
            if len(samples) < 10:
                samples.append({"word": word, "code": code, "len": clen})
    info.update(
        {
            "ge8_default_weight": ge8_def,
            "ge12_default_weight": ge12_def,
            "ge12_samples": samples,
        }
    )
    return info


def apply_12z(path: Path) -> int:
    """字面规则：仅在非 5字+ 文件删除 字长≥12 且 权重=默认 的词条。"""
    info = analyze(path)
    dw = info["default_weight"]
    rows = [
        (lineno, word, code, weight)
        for lineno, word, code, weight, clen in iter_entries(path)
        if clen >= 12 and weight == dw
    ]
    if not rows:
        return 0
    REMOVED_DIR.mkdir(parents=True, exist_ok=True)
    drop = {r[0] for r in rows}
    original = path.read_text(encoding="utf-8").split("\n")
    kept = [ln for i, ln in enumerate(original, 1) if i not in drop]
    backup = REMOVED_DIR / f"{path.name}.removed.tsv"
    with backup.open("w", encoding="utf-8") as bh:
        bh.write(f"# removed from {path.name} (len>=12 & weight=={dw})\n")
        bh.write("# word\tcode\tweight\toriginal_lineno\n")
        for lineno, word, code, weight in rows:
            bh.write(f"{word}\t{code}\t{weight}\t{lineno}\n")
    path.write_text("\n".join(kept), encoding="utf-8")
    return len(rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    out = {}
    for name in FILES:
        out[name] = default_and_long(DICT_DIR / name)
        print(
            f"{name}: total={out[name]['total']} "
            f"default_weight={out[name]['default_weight']} "
            f"ge8&default={out[name]['ge8_default_weight']} "
            f"ge12&default={out[name]['ge12_default_weight']}"
        )

    if args.apply:
        removed = apply_12z(DICT_DIR / FILES[0])
        out["applied_removals_12字"] = removed
        print(f"apply: removed {removed} rows from {FILES[0]}")
        print(
            f"note: {DEFERRED_FILE} 按 task 红线暂不动，"
            f"其中 字长>=12 且默认权重 词条 {out[DEFERRED_FILE]['ge12_default_weight']} 条留待 review goal 结论"
        )

    STATS_PATH.write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"stats -> {STATS_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
