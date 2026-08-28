#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate a small, reproducible common-frequency overlay.

Only repository-owned static dictionaries are read.  The default source is
``base.dict.yaml`` ranked by its existing weight, with
``sbzr.extended.common.dict.yaml`` and ``zdy.dict.yaml`` contributing
additional codes for selected texts.  Existing source files are never
rewritten.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

RULE_VERSION = "common-frequency-v1"
MIN_ROWS = 500
TARGET_ROWS = 1000
MAX_ROWS = 2000
COMMON_WEIGHT_MIN = 2001
COMMON_WEIGHT_MAX = 2998
PROBES = ["我们", "这个", "可以", "现在", "因为", "所以", "如果", "已经", "自己", "没有", "需要", "问题", "应该", "设置", "文件", "中国"]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_value(root: Path, *args: str) -> str:
    try:
        return subprocess.check_output(
            ["git", *args], cwd=root, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unavailable"


def parse_dict(path: Path) -> list[dict]:
    rows: list[dict] = []
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
                continue
            try:
                weight = int(fields[2].strip()) if len(fields) >= 3 and fields[2].strip() else 0
            except ValueError:
                continue
            rows.append({
                "text": fields[0].strip(),
                "code": fields[1].strip(),
                "weight": weight,
                "line": line_number,
            })
    return rows


def parse_canonical_db(path: Path) -> dict[str, tuple[str, int]]:
    result: dict[str, tuple[str, int]] = {}
    with path.open(encoding="utf-8") as handle:
        for raw in handle:
            fields = raw.rstrip("\n\r").split("\t")
            if len(fields) < 3 or not fields[0] or not fields[1]:
                continue
            try:
                frequency = int(fields[2])
            except ValueError:
                continue
            # The database is already ordered by its weighted primary reading;
            # keep the first occurrence if a future version contains repeats.
            result.setdefault(fields[0], (fields[1], frequency))
    return result


def canonical_code(text: str, char_codes: dict[str, tuple[str, int]]) -> str | None:
    codes = [char_codes.get(char, (None, 0))[0] for char in text]
    if any(code is None or len(code) < 2 for code in codes):
        return None
    if len(codes) == 1:
        return codes[0]
    if len(codes) == 2:
        return codes[0] + codes[1]
    if len(codes) == 3:
        return codes[0][0] + codes[1][0] + codes[2]
    return codes[0][0] + codes[1][0] + codes[2][0] + codes[-1][0]


def normalized_weight(source_weight: int, minimum: int, maximum: int) -> int:
    if maximum <= minimum:
        return (COMMON_WEIGHT_MIN + COMMON_WEIGHT_MAX) // 2
    ratio = (source_weight - minimum) / (maximum - minimum)
    return COMMON_WEIGHT_MIN + int(ratio * (COMMON_WEIGHT_MAX - COMMON_WEIGHT_MIN) + 0.5)


def source_group(rows_by_source: dict[str, list[dict]]) -> dict[str, dict]:
    groups: dict[str, dict] = {}
    for source, rows in rows_by_source.items():
        for row in rows:
            text = row["text"]
            entry = groups.setdefault(text, {
                "text": text,
                "rows": {},
                "base_weights": [],
                "first_line": row["line"],
                "sources": set(),
            })
            entry["first_line"] = min(entry["first_line"], row["line"])
            entry["sources"].add(source)
            key = row["code"]
            pair = entry["rows"].setdefault(key, {
                "text": text,
                "code": key,
                "source_weights": {},
                "source_lines": {},
            })
            pair["source_weights"].setdefault(source, []).append(row["weight"])
            pair["source_lines"].setdefault(source, []).append(row["line"])
            if source == "base":
                entry["base_weights"].append(row["weight"])
    for entry in groups.values():
        entry["source_weight"] = max(entry["base_weights"] or [0])
        entry["sources"] = sorted(entry["sources"])
        entry["rows"] = list(entry["rows"].values())
        entry["rows"].sort(key=lambda row: row["code"])
    return groups


def eligible(group: dict, char_codes: dict[str, tuple[str, int]], banned: set[str]) -> bool:
    text = group["text"]
    return (
        MIN_ROWS > 0
        and 2 <= len(text) <= 4
        and text not in banned
        and canonical_code(text, char_codes) is not None
    )


def choose_groups(groups: dict[str, dict], char_codes: dict[str, tuple[str, int]], banned: set[str]) -> tuple[list[dict], list[str]]:
    candidates = [group for group in groups.values() if eligible(group, char_codes, banned)]
    candidates.sort(key=lambda group: (-group["source_weight"], group["first_line"], group["text"]))
    selected: list[dict] = []
    selected_texts: set[str] = set()
    row_count = 0
    for group in candidates:
        group_rows = len(group["rows"])
        if row_count + group_rows > MAX_ROWS:
            if row_count >= MIN_ROWS:
                break
            raise RuntimeError("unable to reach the minimum overlay size")
        selected.append(group)
        selected_texts.add(group["text"])
        row_count += group_rows
        if row_count >= TARGET_ROWS:
            break

    required_added: list[str] = []
    for text in PROBES:
        group = groups.get(text)
        if not group or text in selected_texts or not eligible(group, char_codes, banned):
            continue
        group_rows = len(group["rows"])
        if row_count + group_rows > MAX_ROWS:
            raise RuntimeError(f"required probe would exceed overlay limit: {text}")
        selected.append(group)
        selected_texts.add(text)
        required_added.append(text)
        row_count += group_rows
    if not MIN_ROWS <= row_count <= MAX_ROWS:
        raise RuntimeError(f"overlay row count outside bounds: {row_count}")
    return selected, required_added


def render(rows: list[dict], output_name: str) -> str:
    header = "\n".join([
        "# Rime dictionary",
        "# encoding: utf-8",
        "#",
        f"# Generated by scripts/generate_common_frequency.py ({RULE_VERSION}).",
        "# Source ranking: existing base weights; extended.common adds retained codes.",
        "# All selected (text, code) pairs are retained; canonical is recorded in the manifest.",
        "---",
        f"name: {output_name}",
        f"version: \"{RULE_VERSION}\"",
        "sort: by_weight",
        "use_preset_vocabulary: false",
        "columns:",
        "  - text",
        "  - code",
        "  - weight",
        "...",
        "",
    ])
    body = "".join(f"{row['text']}\t{row['code']}\t{row['weight']}\n" for row in rows)
    return header + body


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    root_default = Path(__file__).resolve().parents[1]
    parser.add_argument("--root", type=Path, default=root_default)
    parser.add_argument("--out-dir", type=Path, default=None)
    parser.add_argument("--output", default="sbzr.common-frequency.dict.yaml")
    args = parser.parse_args()

    root = args.root.resolve()
    dicts_dir = root / "sbzr.chrome.extension" / "dicts"
    out_dir = (args.out_dir or dicts_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    base_path = dicts_dir / "base.dict.yaml"
    common_path = dicts_dir / "sbzr.extended.common.dict.yaml"
    zdy_path = dicts_dir / "zdy.dict.yaml"
    canonical_path = root / "resource" / "常用字双拼拼音.db"
    banned_path = root / "resource" / "banned_words.txt"
    output_path = out_dir / args.output

    base_rows = parse_dict(base_path)
    common_rows = parse_dict(common_path)
    zdy_rows = parse_dict(zdy_path)
    char_codes = parse_canonical_db(canonical_path)
    banned = {line.strip() for line in banned_path.read_text(encoding="utf-8").splitlines() if line.strip() and not line.startswith("#")}
    groups = source_group({"base": base_rows, "extended.common": common_rows, "zdy": zdy_rows})
    selected_groups, required_added = choose_groups(groups, char_codes, banned)
    selected_texts = {group["text"] for group in selected_groups}
    selected_source_weights = [group["source_weight"] for group in selected_groups]
    minimum_source_weight = min(selected_source_weights)
    maximum_source_weight = max(selected_source_weights)

    output_rows: list[dict] = []
    source_pair_counts: Counter[tuple[str, str]] = Counter()
    canonical_counts: Counter[str] = Counter()
    source_counter: Counter[str] = Counter()
    for group in selected_groups:
        canonical = canonical_code(group["text"], char_codes)
        output_weight = normalized_weight(group["source_weight"], minimum_source_weight, maximum_source_weight)
        for pair in group["rows"]:
            pair_sources = sorted(pair["source_weights"])
            source_weights = {
                source: sorted(weights, reverse=True)
                for source, weights in pair["source_weights"].items()
            }
            pair_source_weight = max(weight for weights in source_weights.values() for weight in weights)
            status = "canonical" if pair["code"] == canonical else "alternate_or_unverified"
            output_rows.append({
                "text": group["text"],
                "code": pair["code"],
                "weight": output_weight,
                "source_weight": group["source_weight"],
                "pair_source_weight": pair_source_weight,
                "sources": pair_sources,
                "source_weights": source_weights,
                "canonical_code": canonical,
                "canonical_status": status,
            })
            source_pair_counts[(group["text"], pair["code"])] += sum(
                len(weights) for weights in source_weights.values()
            )
            canonical_counts[status] += 1
            for source in pair_sources:
                source_counter[source] += 1
    output_rows.sort(key=lambda row: (-row["weight"], -row["source_weight"], row["text"], row["code"]))
    output_path.write_text(render(output_rows, "sbzr.chrome.extension/dicts/sbzr.common-frequency"), encoding="utf-8")
    entrypoint_hashes = {
        "sbzr.dict.yaml": sha256_file(root / "sbzr.dict.yaml"),
        "sbzr.chrome.extension/shared/dicts.js": sha256_file(root / "sbzr.chrome.extension" / "shared" / "dicts.js"),
    }

    probes: dict[str, dict] = {}
    for text in PROBES:
        rows = [row for row in output_rows if row["text"] == text]
        probes[text] = {
            "found_rows": len(rows),
            "codes": [row["code"] for row in rows],
            "canonical_code": rows[0]["canonical_code"] if rows else canonical_code(text, char_codes),
            "weights": sorted({row["weight"] for row in rows}, reverse=True),
            "rows": rows,
        }

    source_pair_duplicates = sum(count - 1 for count in source_pair_counts.values() if count > 1)
    same_text_multi_code = sum(1 for group in selected_groups if len(group["rows"]) > 1)
    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "git_commit": git_value(root, "rev-parse", "HEAD"),
        "rule_version": RULE_VERSION,
        "output": str(output_path.relative_to(root)),
        "row_count": len(output_rows),
        "output_sha256": sha256_file(output_path),
        "selected_text_count": len(selected_groups),
        "entrypoint_hashes_before_change": entrypoint_hashes,
        "required_probe_texts_added": required_added,
        "weight_policy": {
            "source_rank": "base.dict.yaml existing weight, max per selected text",
            "output_min": COMMON_WEIGHT_MIN,
            "output_max": COMMON_WEIGHT_MAX,
            "formula": "linear monotonic mapping of selected source-weight min/max into [2001, 2998]; equal source weights map to 2499",
            "dynamic_priority": "runtime dynamic_freq remains above static layers; no private data is read or committed",
        },
        "selection_rules": {
            "primary_source": "base.dict.yaml",
            "additional_sources": ["sbzr.extended.common.dict.yaml", "zdy.dict.yaml"],
            "text_length": [2, 4],
            "canonical_db": "resource/常用字双拼拼音.db",
            "excluded_banned_text_count": sum(1 for group in groups.values() if group["text"] in banned),
            "unknown_canonical_texts_excluded": sum(1 for group in groups.values() if 2 <= len(group["text"]) <= 4 and canonical_code(group["text"], char_codes) is None),
            "same_text_multi_code_policy": "retain every unique text+code pair from base, extended.common, and zdy for each selected text; canonical is annotation only",
        },
        "source_stats": {
            "base_rows_read": len(base_rows),
            "extended_common_rows_read": len(common_rows),
            "zdy_rows_read": len(zdy_rows),
            "source_pair_duplicates_in_selected": source_pair_duplicates,
            "selected_rows_by_source": dict(source_counter),
            "canonical_status_counts": dict(canonical_counts),
            "selected_texts_with_multiple_codes": same_text_multi_code,
            "selected_texts_with_multiple_sources": sum(1 for group in selected_groups if len(group["sources"]) > 1),
        },
        "source_hashes": {
            "sbzr.chrome.extension/dicts/base.dict.yaml": sha256_file(base_path),
            "sbzr.chrome.extension/dicts/sbzr.extended.common.dict.yaml": sha256_file(common_path),
            "sbzr.chrome.extension/dicts/zdy.dict.yaml": sha256_file(zdy_path),
            "resource/常用字双拼拼音.db": sha256_file(canonical_path),
            "resource/banned_words.txt": sha256_file(banned_path),
        },
        "probes": probes,
        "safety": {
            "original_sources_modified": False,
            "private_userdb_read": False,
            "dynamic_frequency_read": False,
            "candidate_deletion": False,
        },
    }
    (out_dir / "sbzr.common-frequency.manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    rollback = {
        "before_production_entry_change": True,
        "new_file": str(output_path.relative_to(root)),
        "new_file_sha256": sha256_file(output_path),
        "entrypoint_hashes_before_change": entrypoint_hashes,
        "restore_command": "git revert <stage2-commit>",
        "entrypoints_to_change_after_report": [
            "sbzr.dict.yaml (import_tables)",
            "sbzr.chrome.extension/shared/dicts.js (TABLES)",
        ],
        "source_hashes": manifest["source_hashes"],
        "note": "This manifest is produced before the Rime/Chrome entrypoints are edited. Original dictionaries remain untouched.",
    }
    (out_dir / "sbzr.common-frequency.rollback.json").write_text(
        json.dumps(rollback, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    report_lines = [
        "# 阶段 2 常用词覆盖层报告",
        "",
        f"- 规则版本：`{RULE_VERSION}`",
        f"- 生成 git commit：`{manifest['git_commit']}`",
        f"- 输出：`{manifest['output']}`",
        f"- 覆盖层 SHA256：`{manifest['output_sha256']}`",
        f"- 生产入口修改前 SHA256：`{manifest['entrypoint_hashes_before_change']['sbzr.dict.yaml']}`（`sbzr.dict.yaml`），`{manifest['entrypoint_hashes_before_change']['sbzr.chrome.extension/shared/dicts.js']}`（扩展 `dicts.js`）",
        f"- 选中文本数：`{manifest['selected_text_count']}`",
        f"- 输出 text+code 行数：`{manifest['row_count']}`（硬约束 {MIN_ROWS}～{MAX_ROWS}）",
        f"- 输出权重范围：`{COMMON_WEIGHT_MIN}`～`{COMMON_WEIGHT_MAX}`；来源权重范围：`{minimum_source_weight}`～`{maximum_source_weight}`",
        "",
        "## 来源与规则",
        "",
        "- 主排序依据：`base.dict.yaml` 已有权重；不凭感觉重标原词库。",
        "- 对每个入选 text，合并 `base.dict.yaml`、`sbzr.extended.common.dict.yaml` 与 `zdy.dict.yaml` 的全部唯一 `(text, code)`；canonical code 仅作为 `resource/常用字双拼拼音.db` 校验标记，不删除 alternate/unverified code。",
        "- 仅选择 2～4 字、可由 canonical DB 推导、且不在 `banned_words.txt` 的候选；用户探针缺失时强制补入仍受 2000 行上限约束。",
        "- 静态覆盖层映射到 2001～2998；运行时 `dynamic_freq` 仍在静态层之上。本次不读取私人数据库/动态文件。",
        "",
        "## 统计",
        "",
        f"- 读取 base：`{manifest['source_stats']['base_rows_read']}` 行；extended.common：`{manifest['source_stats']['extended_common_rows_read']}` 行；zdy：`{manifest['source_stats']['zdy_rows_read']}` 行。",
        f"- 入选文本多 code：`{manifest['source_stats']['selected_texts_with_multiple_codes']}`；多来源：`{manifest['source_stats']['selected_texts_with_multiple_sources']}`。",
        f"- canonical 行：`{manifest['source_stats']['canonical_status_counts'].get('canonical', 0)}`；alternate/unverified 保留行：`{manifest['source_stats']['canonical_status_counts'].get('alternate_or_unverified', 0)}`。",
        f"- 因探针补入：`{', '.join(required_added) or '无'}`。",
        "",
        "## 常用词探针",
        "",
        "| text | rows | codes | canonical | output weights |",
        "| --- | ---: | --- | --- | --- |",
    ]
    for text in PROBES:
        probe = probes[text]
        report_lines.append(
            f"| {text} | {probe['found_rows']} | {', '.join(probe['codes']) or '未覆盖'} | "
            f"{probe['canonical_code'] or '未知'} | {', '.join(str(weight) for weight in probe['weights']) or '未覆盖'} |"
        )
    report_lines.extend([
        "",
        "## 回滚与安全",
        "",
        "- 生成阶段只新增覆盖层与 manifest/report/rollback 文件，未修改原始 base/common、入口或扩展清单。",
        "- 入口变更前回滚清单见 `sbzr.common-frequency.rollback.json`；阶段提交后优先 `git revert <stage2-commit>`。",
        "- manifest 的 source SHA256 固定生成输入，便于复现和审计。",
    ])
    (out_dir / "sbzr.common-frequency.report.md").write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print(json.dumps({
        "output": str(output_path.relative_to(root)),
        "manifest": str((out_dir / "sbzr.common-frequency.manifest.json").relative_to(root)),
        "rows": len(output_rows),
        "texts": len(selected_groups),
        "required_probe_texts_added": required_added,
        "canonical": canonical_counts.get("canonical", 0),
        "alternate_or_unverified": canonical_counts.get("alternate_or_unverified", 0),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
