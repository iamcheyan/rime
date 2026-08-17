#!/usr/bin/env python3
"""sbzr 词库跨文件 (word, code) 重复扫描 / 保守去重工具（dict-optimize goal 第 1 步）。

用法:
  python3 review/scripts/optimize_dedup_scan.py            # 仅扫描，输出重复报告
  python3 review/scripts/optimize_dedup_scan.py --apply    # 执行去重（删除行备份至 review/removed/）

规则（与 goal 任务书一致）:
  - 索引键 = (word, code)；数据行 = 以 TAB 分隔、首列非 '#' 的词条行。
  - 保留规则: 权重最高者胜; 权重相同按优先级 sbzr.len1/len2 > base >
    sbzr.extended.common > sbzr.rimeice.* > 其他; 再相同则文件名、行号靠前者胜。
  - 保护文件（用户数据/独立通道，不参与删除，只参与报告）:
    sbzr.shortcut / zdy / sbzr.userdb / sbzr.userdb.full
  - 删除清单写入 review/removed/<file>.removed.tsv（可回滚）。
  - 全程流式 + SQLite 临时索引，不整表载入内存。
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import tempfile
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DICT_DIR = REPO / "sbzr.chrome.extension" / "dicts"
REMOVED_DIR = REPO / "review" / "removed"
SUMMARY_PATH = REPO / "review" / "optimize_dedup_summary.json"

PROTECTED = {
    "sbzr.shortcut.dict.yaml",
    "zdy.dict.yaml",
    "sbzr.userdb.dict.yaml",
    "sbzr.userdb.full.dict.yaml",
}


def priority(fname: str) -> int:
    """0 最高。仅用于同权重时决胜。"""
    if fname.startswith(("sbzr.len1", "sbzr.len2")):
        return 0
    if fname == "base.dict.yaml":
        return 1
    if fname.startswith("sbzr.extended.common"):
        return 2
    if fname.startswith("sbzr.rimeice."):
        return 3
    return 4


def parse_weight(cols: list[str]) -> int:
    if len(cols) >= 3:
        w = cols[2].strip()
        if w.isdigit():
            return int(w)
    return 0


def build_index(db: sqlite3.Connection, files: list[Path]) -> dict[str, int]:
    """流式写入全部词条行，返回 {fname: 行数(仅词条行)}。"""
    db.execute(
        "CREATE TABLE entries (word TEXT, code TEXT, weight INTEGER, "
        "prio INTEGER, fname TEXT, lineno INTEGER, protected INTEGER)"
    )
    counts: dict[str, int] = {}
    batch: list[tuple] = []

    def flush() -> None:
        if batch:
            db.executemany(
                "INSERT INTO entries VALUES (?,?,?,?,?,?,?)", batch
            )
            batch.clear()

    for path in files:
        fname = path.name
        protected = 1 if fname in PROTECTED else 0
        prio = priority(fname)
        n = 0
        in_body = False
        with path.open("r", encoding="utf-8") as fh:
            for lineno, line in enumerate(fh, 1):
                s = line.rstrip("\n")
                if not in_body:
                    if s == "...":
                        in_body = True
                    continue
                if not s or s.startswith("#"):
                    continue
                cols = s.split("\t")
                if len(cols) < 2:
                    continue
                word, code = cols[0], cols[1]
                if not word or not code:
                    continue
                batch.append(
                    (word, code, parse_weight(cols), prio, fname, lineno, protected)
                )
                n += 1
                if len(batch) >= 50000:
                    flush()
        flush()
        counts[fname] = n
    db.execute(
        "CREATE INDEX idx_key ON entries (word, code)"
    )
    db.commit()
    return counts


def scan(db: sqlite3.Connection) -> dict:
    """扫描重复组：胜者/败者判定 + 分布统计。返回摘要 dict。"""
    total = db.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
    distinct = db.execute(
        "SELECT COUNT(*) FROM (SELECT 1 FROM entries GROUP BY word, code)"
    ).fetchone()[0]
    dup_extra = total - distinct
    dup_groups = db.execute(
        "SELECT COUNT(*) FROM (SELECT 1 FROM entries GROUP BY word, code HAVING COUNT(*)>1)"
    ).fetchone()[0]

    pair_dist: Counter[tuple[str, str]] = Counter()
    protected_dup_rows = 0
    losers_by_file: Counter[str] = Counter()
    top_samples: list[dict] = []
    winners_weight_dropped = 0  # 删除行中权重低于胜者（无损）的行数

    db.execute("DROP TABLE IF EXISTS losers")
    db.execute(
        "CREATE TABLE losers (fname TEXT, lineno INTEGER, word TEXT, "
        "code TEXT, weight INTEGER)"
    )
    lbatch: list[tuple] = []

    cur = db.execute(
        "SELECT word, code, weight, prio, fname, lineno, protected "
        "FROM entries ORDER BY word, code, weight DESC, prio, fname, lineno"
    )
    group: list[tuple] = []
    group_key: tuple[str, str] | None = None

    def flush_losers() -> None:
        if lbatch:
            db.executemany("INSERT INTO losers VALUES (?,?,?,?,?)", lbatch)
            lbatch.clear()

    def close_group(rows: list[tuple], key: tuple[str, str]) -> None:
        nonlocal protected_dup_rows, winners_weight_dropped
        winner = rows[0]
        for r in rows[1:]:
            pair_dist[(winner[4], r[4])] += 1
            if r[6]:  # protected 行不删，只计数
                protected_dup_rows += 1
                continue
            if r[3] > winner[3]:
                winners_weight_dropped += 1
            lbatch.append((r[4], r[5], r[0], r[1], r[2]))
            losers_by_file[r[4]] += 1
        if len(rows) > 1 and len(top_samples) < 30:
            top_samples.append(
                {
                    "word": key[0],
                    "code": key[1],
                    "rows": [
                        {"file": r[4], "weight": r[2], "line": r[5], "keep": i == 0}
                        for i, r in enumerate(rows)
                    ],
                }
            )

    for row in cur:
        key = (row[0], row[1])
        if key != group_key:
            if group:
                close_group(group, group_key)
            group = []
            group_key = key
        group.append(row)
        if len(lbatch) >= 50000:
            flush_losers()
    if group:
        close_group(group, group_key)
    flush_losers()
    db.commit()

    return {
        "total_entries": total,
        "distinct_keys": distinct,
        "duplicate_extra_rows": dup_extra,
        "duplicate_groups": dup_groups,
        "deletable_rows": sum(losers_by_file.values()),
        "protected_dup_rows": protected_dup_rows,
        "loser_weight_lower_or_equal": winners_weight_dropped,
        "losers_by_file": dict(losers_by_file.most_common()),
        "pair_distribution": [
            {"winner": w, "loser": l, "count": c}
            for (w, l), c in pair_dist.most_common(40)
        ],
        "top_samples": top_samples[:10],
        "per_file_entries": {},
    }


def apply_deletions(db: sqlite3.Connection) -> dict[str, dict]:
    """按 losers 表重写文件，删除行备份到 review/removed/。"""
    REMOVED_DIR.mkdir(parents=True, exist_ok=True)
    rows_by_file: dict[str, list[tuple]] = {}
    for fname, lineno, word, code, weight in db.execute(
        "SELECT fname, lineno, word, code, weight FROM losers ORDER BY fname, lineno"
    ):
        rows_by_file.setdefault(fname, []).append((lineno, word, code, weight))

    stats = {}
    for fname, rows in sorted(rows_by_file.items()):
        path = DICT_DIR / fname
        original = path.read_text(encoding="utf-8").split("\n")
        drop = {r[0] for r in rows}
        kept = [ln for i, ln in enumerate(original, 1) if i not in drop]
        removed_lines = [original[i - 1] for i in drop]

        backup = REMOVED_DIR / f"{fname}.removed.tsv"
        with backup.open("w", encoding="utf-8") as bh:
            bh.write(f"# removed from {fname} by optimize_dedup_scan.py --apply\n")
            bh.write("# word\tcode\tweight\toriginal_lineno\n")
            for (lineno, word, code, weight), line in zip(rows, removed_lines):
                bh.write(f"{word}\t{code}\t{weight}\t{lineno}\n")

        path.write_text("\n".join(kept), encoding="utf-8")
        stats[fname] = {
            "removed": len(rows),
            "lines_before": len(original),
            "lines_after": len(kept),
        }
    return stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="执行删除（默认只扫描）")
    args = ap.parse_args()

    files = sorted(DICT_DIR.glob("*.dict.yaml"))
    if not files:
        print(f"ERROR: no dict files under {DICT_DIR}", file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory(prefix="dedup_") as td:
        db = sqlite3.connect(Path(td) / "index.db")
        per_file = build_index(db, files)
        summary = scan(db)
        summary["per_file_entries"] = dict(
            sorted(per_file.items(), key=lambda kv: -kv[1])
        )

        if args.apply:
            summary["apply"] = apply_deletions(db)
        db.close()

    SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    SUMMARY_PATH.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    mode = "APPLY" if args.apply else "SCAN"
    print(f"[{mode}] files={len(files)} entries={summary['total_entries']} "
          f"distinct={summary['distinct_keys']} "
          f"dup_extra={summary['duplicate_extra_rows']} "
          f"dup_groups={summary['duplicate_groups']} "
          f"deletable={summary['deletable_rows']} "
          f"protected_dup={summary['protected_dup_rows']}")
    for f, c in summary["losers_by_file"].items():
        print(f"  delete {c:8d} rows from {f}")
    if args.apply:
        for f, st in summary["apply"].items():
            print(f"  rewrote {f}: {st['lines_before']} -> {st['lines_after']} lines "
                  f"(-{st['removed']})")
    print(f"summary -> {SUMMARY_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
