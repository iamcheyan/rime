#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate a read-only baseline for the SBZR word-frequency work.

The script only reads dictionary/configuration files and writes reports below
``analysis/wordfreq-baseline``.  Defaults are resolved relative to this file;
no personal userdb or dynamic-frequency data is read.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from typing import Iterable

PROBES = [
    "我们",
    "这个",
    "可以",
    "现在",
    "因为",
    "所以",
    "如果",
    "已经",
    "自己",
    "没有",
    "需要",
    "问题",
    "应该",
    "设置",
    "文件",
    "中国",
]
IMPORT_RE = re.compile(r"^\s*-\s+([^#\s]+)")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def percentile(values: list[int], fraction: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int((len(ordered) - 1) * fraction)))
    return ordered[index]


def parse_dict(path: Path) -> tuple[list[dict], int, int]:
    """Return body records, total physical lines, and malformed body rows."""
    records: list[dict] = []
    malformed = 0
    in_body = False
    with path.open(encoding="utf-8") as handle:
        for line_number, raw in enumerate(handle, 1):
            line = raw.rstrip("\n\r")
            if not in_body:
                if line.strip() == "...":
                    in_body = True
                continue
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            fields = line.split("\t")
            if len(fields) < 2 or not fields[0].strip() or not fields[1].strip():
                malformed += 1
                continue
            text = fields[0].strip()
            code = fields[1].strip()
            weight = 0
            if len(fields) >= 3 and fields[2].strip():
                try:
                    weight = int(fields[2].strip())
                except ValueError:
                    malformed += 1
                    continue
            records.append(
                {
                    "text": text,
                    "code": code,
                    "weight": weight,
                    "line": line_number,
                }
            )
    with path.open(encoding="utf-8") as handle:
        physical_lines = sum(1 for _ in handle)
    return records, physical_lines, malformed


def import_paths(root: Path) -> list[Path]:
    entry = root / "sbzr.dict.yaml"
    paths: list[Path] = []
    if not entry.exists():
        return paths
    for raw in entry.read_text(encoding="utf-8").splitlines():
        match = IMPORT_RE.match(raw)
        if not match:
            continue
        imported = root / (match.group(1) + ".dict.yaml")
        if imported.exists():
            paths.append(imported)
    return paths


def weight_stats(weights: Iterable[int]) -> dict:
    values = list(weights)
    counter = Counter(values)
    return {
        "count": len(values),
        "min": min(values) if values else None,
        "max": max(values) if values else None,
        "median": median(values) if values else None,
        "p90": percentile(values, 0.90),
        "distinct": len(counter),
        "histogram": {str(weight): counter[weight] for weight in sorted(counter)},
    }


def git_value(root: Path, *args: str) -> str:
    try:
        return subprocess.check_output(
            ["git", *args], cwd=root, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unavailable"


def relative(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    default_root = Path(__file__).resolve().parents[1]
    parser.add_argument("--root", type=Path, default=default_root)
    parser.add_argument("--dicts-dir", type=Path, default=None)
    parser.add_argument("--out-dir", type=Path, default=None)
    args = parser.parse_args()

    root = args.root.resolve()
    dicts_dir = (args.dicts_dir or root / "sbzr.chrome.extension" / "dicts").resolve()
    out_dir = (args.out_dir or root / "analysis" / "wordfreq-baseline").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    dict_paths = sorted(dicts_dir.glob("*.dict.yaml"), key=lambda p: p.name)
    all_records: list[dict] = []
    per_file: dict[str, dict] = {}
    hash_inputs: list[Path] = [root / "sbzr.dict.yaml", root / "sbzr.schema.yaml"]
    hash_inputs.extend([root / "lua" / "length_priority.lua", root / "lua" / "dynamic_freq.lua"])

    for path in dict_paths:
        records, physical_lines, malformed = parse_dict(path)
        source = relative(root, path)
        for record_index, record in enumerate(records):
            record = {**record, "source": source, "record_index": record_index}
            all_records.append(record)
        pair_counts = Counter((row["text"], row["code"]) for row in records)
        per_file[source] = {
            "sha256": sha256_file(path),
            "physical_lines": physical_lines,
            "body_rows": len(records),
            "malformed_body_rows": malformed,
            "unique_text": len({row["text"] for row in records}),
            "unique_text_code": len(pair_counts),
            "duplicate_text_code_rows": sum(count - 1 for count in pair_counts.values() if count > 1),
            "weight": weight_stats(row["weight"] for row in records),
        }

    global_pairs = Counter((row["text"], row["code"]) for row in all_records)
    global_texts: dict[str, list[dict]] = defaultdict(list)
    for record in all_records:
        global_texts[record["text"]].append(record)

    imported = import_paths(root)
    imported_records: list[dict] = []
    for import_index, path in enumerate(imported):
        records, _, _ = parse_dict(path)
        for row_index, record in enumerate(records):
            imported_records.append(
                {
                    **record,
                    "source": relative(root, path),
                    "import_index": import_index,
                    "record_index": row_index,
                }
            )
    by_code: dict[str, list[dict]] = defaultdict(list)
    for record in imported_records:
        by_code[record["code"]].append(record)
    for candidates in by_code.values():
        candidates.sort(key=lambda row: (-row["weight"], row["import_index"], row["record_index"]))

    probes: dict[str, dict] = {}
    for text in PROBES:
        rows = sorted(
            global_texts.get(text, []),
            key=lambda row: (-row["weight"], row["source"], row["line"]),
        )
        probe_rows = []
        for row in rows:
            candidates = by_code.get(row["code"], [])
            rank = next(
                (index for index, candidate in enumerate(candidates, 1)
                 if candidate["text"] == text and candidate["source"] == row["source"]
                 and candidate["line"] == row["line"]),
                None,
            )
            probe_rows.append({**row, "rank_in_code_before_filters": rank})
        probes[text] = {
            "found_rows": len(rows),
            "codes": sorted({row["code"] for row in rows}),
            "weights": sorted({row["weight"] for row in rows}, reverse=True),
            "rows": probe_rows,
        }

    anomaly_rows: list[dict] = []
    for text, rows in sorted(global_texts.items()):
        codes = sorted({row["code"] for row in rows})
        sources = sorted({row["source"] for row in rows})
        weights = sorted({row["weight"] for row in rows})
        if len(codes) > 1 or len(sources) > 1 or len(weights) > 1:
            anomaly_rows.append(
                {
                    "text": text,
                    "codes": codes,
                    "sources": sources,
                    "weights": weights,
                    "row_count": len(rows),
                    "multiple_codes": len(codes) > 1,
                    "multiple_sources": len(sources) > 1,
                    "multiple_weights": len(weights) > 1,
                }
            )

    input_paths = [path for path in hash_inputs if path.exists()]
    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "baseline_git_commit": git_value(root, "rev-parse", "HEAD"),
        "git_status_short": git_value(root, "status", "--short"),
        "root": str(root),
        "dictionary_directory": relative(root, dicts_dir),
        "dictionary_count": len(dict_paths),
        "total_body_rows": len(all_records),
        "total_unique_text": len({row["text"] for row in all_records}),
        "total_unique_text_code": len(global_pairs),
        "total_duplicate_text_code_rows": sum(count - 1 for count in global_pairs.values() if count > 1),
        "files": per_file,
        "input_hashes": {
            relative(root, path): sha256_file(path) for path in input_paths
        },
        "safety": {
            "private_userdb_read": False,
            "dynamic_frequency_read": False,
            "production_files_modified": False,
        },
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (out_dir / "probes.json").write_text(
        json.dumps(probes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    with gzip.open(out_dir / "same_text_anomalies.tsv.gz", "wt", encoding="utf-8") as handle:
        handle.write("text\tcodes\tsources\tweights\trow_count\tmultiple_codes\tmultiple_sources\tmultiple_weights\n")
        for row in anomaly_rows:
            handle.write(
                "\t".join(
                    [
                        row["text"],
                        ",".join(row["codes"]),
                        ",".join(row["sources"]),
                        ",".join(str(weight) for weight in row["weights"]),
                        str(row["row_count"]),
                        str(row["multiple_codes"]),
                        str(row["multiple_sources"]),
                        str(row["multiple_weights"]),
                    ]
                ) + "\n"
            )

    factors = """# Baseline candidate-order factors

Generated from the checked-in configuration at the baseline commit recorded in `manifest.json`.

1. `sbzr.dict.yaml` imports the static tables in listed order; each table declares `sort: by_weight` and columns `text`, `code`, `weight`.
2. `sbzr.schema.yaml` translators are `punct_translator`, `zdy_priority_translator`, `table_translator`, `easy_en`, and `history_translator` (`history_translator` has `size: 1` and `initial_quality: 10000`).
3. The filter order is `simplifier` -> `lua_filter@length_priority_filter` -> `lua_filter@dynamic_freq_filter` -> `lua_filter@en_switch_filter` -> `uniquifier` (`sbzr.schema.yaml:49-54`).
4. `lua/length_priority.lua` buffers up to 512 candidates, sorts by UTF-8 text length ascending, and preserves source order for equal lengths. This discards cross-length weight ordering before the dynamic filter sees candidates.
5. `lua/dynamic_freq.lua` reads the runtime LevelDb `dynamic_freq` and the local runtime sync file `dynamic_freq.local.txt`; it scans at most 64 candidates after length sorting and promotes the most recently recorded matching text/type. No private runtime data was read for this baseline.
6. `translator.enable_completion` and `sentence_over_completion` are enabled in the current `sbzr.schema.yaml`; completion therefore remains part of the regression surface. `easy_en.enable_completion` is also enabled.
7. `uniquifier` is last and removes duplicate candidate text after the preceding filters.

The rank fields in `probes.json` are a static pre-filter approximation: weight descending, then import order and row order. They are not a claim about a live Rime deployment.
"""
    (out_dir / "candidate-order-factors.md").write_text(factors, encoding="utf-8")

    rollback = {
        "baseline_git_commit": manifest["baseline_git_commit"],
        "restore_scope": [
            "sbzr.dict.yaml",
            "sbzr.schema.yaml",
            "lua/length_priority.lua",
            "lua/dynamic_freq.lua",
            "sbzr.chrome.extension/shared/dicts.js",
            "sbzr.chrome.extension/dicts/sbzr.common-frequency.dict.yaml",
        ],
        "rollback_note": "Prefer git revert of the stage commit; restore only tracked production paths. Do not restore or submit private userdb/dynamic data.",
        "sha256_at_baseline": manifest["input_hashes"],
    }
    (out_dir / "rollback-manifest.json").write_text(
        json.dumps(rollback, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    report_lines = [
        "# SBZR 词频基线报告",
        "",
        f"- 生成时间（UTC）：`{manifest['generated_at_utc']}`",
        f"- 基线 git commit：`{manifest['baseline_git_commit']}`",
        f"- 词库文件数：`{manifest['dictionary_count']}`",
        f"- body 行数：`{manifest['total_body_rows']}`",
        f"- 唯一 text：`{manifest['total_unique_text']}`",
        f"- 唯一 text+code：`{manifest['total_unique_text_code']}`",
        f"- 重复 text+code 行：`{manifest['total_duplicate_text_code_rows']}`",
        f"- 同 text 异常行数：`{len(anomaly_rows)}`（详见压缩 TSV）",
        "",
        "## 各词库统计",
        "",
        "| 文件 | body 行 | 唯一 text+code | 重复行 | 权重 min/median/p90/max |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for source, stats in per_file.items():
        weight = stats["weight"]
        report_lines.append(
            f"| `{source}` | {stats['body_rows']} | {stats['unique_text_code']} | "
            f"{stats['duplicate_text_code_rows']} | {weight['min']}/{weight['median']}/"
            f"{weight['p90']}/{weight['max']} |"
        )
    report_lines.extend(
        [
            "",
            "## 常用词探针",
            "",
            "| text | rows | codes | weights |",
            "| --- | ---: | --- | --- |",
        ]
    )
    for text in PROBES:
        probe = probes[text]
        report_lines.append(
            f"| {text} | {probe['found_rows']} | "
            f"{', '.join(probe['codes']) or '未找到'} | "
            f"{', '.join(str(weight) for weight in probe['weights']) or '未找到'} |"
        )
    report_lines.extend(
        [
            "",
            "## 安全与回滚",
            "",
            "- 本次只读 `sbzr.chrome.extension/dicts/*.dict.yaml`、入口/schema/Lua 文件；未读取私人 userdb、LevelDb 或动态频率文件。",
            "- 生产词库与排序入口在生成基线时未修改。",
            "- `same_text_anomalies.tsv.gz` 保留同 text 多 code、多来源、多权重记录；不以 text 静默去重。",
            "- 回滚范围与基线 SHA256 见 `rollback-manifest.json`；后续阶段优先使用对应阶段 commit 的 `git revert`。",
        ]
    )
    (out_dir / "report.md").write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print(json.dumps({
        "baseline_git_commit": manifest["baseline_git_commit"],
        "dictionary_count": manifest["dictionary_count"],
        "total_body_rows": manifest["total_body_rows"],
        "total_unique_text_code": manifest["total_unique_text_code"],
        "total_duplicate_text_code_rows": manifest["total_duplicate_text_code_rows"],
        "anomaly_rows": len(anomaly_rows),
        "output": relative(root, out_dir),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
