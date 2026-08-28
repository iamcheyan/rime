#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Produce read-only rimeice A/B/C frequency dry-run statistics.

The program reads the checked-in rimeice buckets and static comparison
sources, but never rewrites a dictionary or invokes the repository rebuild
script.  Candidate rankings are deliberately an offline approximation; the
report records all assumptions and any probe truncation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

PROBES = ["我们", "这个", "可以", "现在", "因为", "所以", "如果", "已经", "自己", "没有", "需要", "问题", "应该", "设置", "文件", "中国"]
MAX_PROBE_ROWS_PER_CODE = 1024
LENGTH_PENALTY = 10
C_SOURCE_BONUS = {
    "overlay": 120,
    "base": 80,
    "extended.common": 40,
}


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


def iter_dict(path: Path):
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
            yield {
                "text": fields[0].strip(),
                "code": fields[1].strip(),
                "weight": weight,
                "line": line_number,
            }


def load_texts(path: Path) -> set[str]:
    return {row["text"] for row in iter_dict(path)}


def load_probe_codes(root: Path) -> set[str]:
    codes: set[str] = set()
    baseline = root / "analysis" / "wordfreq-baseline" / "probes.json"
    if baseline.exists():
        payload = json.loads(baseline.read_text(encoding="utf-8"))
        for probe in payload.values():
            codes.update(probe.get("codes", []))
    overlay = root / "sbzr.chrome.extension" / "dicts" / "sbzr.common-frequency.manifest.json"
    if overlay.exists():
        payload = json.loads(overlay.read_text(encoding="utf-8"))
        for probe in payload.get("probes", {}).values():
            codes.update(probe.get("codes", []))
    return codes


def add_probe_row(probe_rows: dict[str, list[dict]], counts: Counter[str], row: dict, source: str, source_file: str) -> None:
    code = row["code"]
    if code not in probe_rows and code not in counts:
        return
    counts[code] += 1
    item = {
        "text": row["text"],
        "code": code,
        "weight": row["weight"],
        "line": row["line"],
        "source": source,
        "source_file": source_file,
    }
    bucket = probe_rows.setdefault(code, [])
    if len(bucket) < MAX_PROBE_ROWS_PER_CODE:
        bucket.append(item)
        return
    minimum_index = min(range(len(bucket)), key=lambda index: (bucket[index]["weight"], bucket[index]["line"]))
    if (item["weight"], -item["line"]) > (bucket[minimum_index]["weight"], -bucket[minimum_index]["line"]):
        bucket[minimum_index] = item


def file_stats(path: Path, base_texts: set[str], common_texts: set[str], global_state: dict[str, dict], source_bit: int, probe_codes: set[str], probe_rows: dict[str, list[dict]], probe_counts: Counter[str], source_name: str, rimeice_state: dict[str, dict] | None = None) -> tuple[dict, dict[str, int]]:
    body_rows = 0
    malformed = 0
    pair_seen: set[tuple[str, str]] = set()
    text_state: dict[str, tuple[str, int, bool, bool]] = {}
    weights: list[int] = []
    weight_counts: Counter[int] = Counter()
    code_lengths: Counter[int] = Counter()
    text_lengths: Counter[int] = Counter()
    overlap_base: set[str] = set()
    overlap_common: set[str] = set()
    for row in iter_dict(path):
        body_rows += 1
        text = row["text"]
        code = row["code"]
        weight = row["weight"]
        pair_seen.add((text, code))
        weights.append(weight)
        weight_counts[weight] += 1
        code_lengths[len(code)] += 1
        text_lengths[len(text)] += 1
        if text in base_texts:
            overlap_base.add(text)
        if text in common_texts:
            overlap_common.add(text)
        previous = text_state.get(text)
        if previous is None:
            text_state[text] = (code, weight, False, False)
        else:
            first_code, first_weight, has_multi_code, has_multi_weight = previous
            text_state[text] = (
                first_code,
                first_weight,
                has_multi_code or first_code != code,
                has_multi_weight or first_weight != weight,
            )
        for state in (global_state, rimeice_state) if rimeice_state is not None else (global_state,):
            previous_state = state.get(text)
            if previous_state is None:
                state[text] = {
                    "first_code": code,
                    "first_weight": weight,
                    "code_count": 1,
                    "source_mask": source_bit,
                    "multi_code": False,
                    "multi_weight": False,
                }
            else:
                previous_state["multi_code"] = previous_state["multi_code"] or previous_state["first_code"] != code
                previous_state["multi_weight"] = previous_state["multi_weight"] or previous_state["first_weight"] != weight
                previous_state["source_mask"] |= source_bit
                previous_state["code_count"] += 1
        if code in probe_codes:
            add_probe_row(probe_rows, probe_counts, row, source_name, path.name)
    unique_text_count = len(text_state)
    duplicate_pairs = body_rows - len(pair_seen)
    dominant_weight, dominant_count = (weight_counts.most_common(1)[0] if weight_counts else (None, 0))
    sorted_weights = sorted(weights)
    p90 = sorted_weights[min(len(sorted_weights) - 1, int((len(sorted_weights) - 1) * 0.9))] if sorted_weights else None
    stats = {
        "path": path.as_posix(),
        "sha256": sha256_file(path),
        "physical_lines": sum(1 for _ in path.open(encoding="utf-8")),
        "body_rows": body_rows,
        "malformed_body_rows": malformed,
        "unique_text": unique_text_count,
        "unique_text_code": len(pair_seen),
        "duplicate_text_code_rows": duplicate_pairs,
        "weight": {
            "min": min(weights) if weights else None,
            "max": max(weights) if weights else None,
            "median": (sorted_weights[len(sorted_weights) // 2] if sorted_weights else None),
            "p90": p90,
            "distinct": len(weight_counts),
            "dominant_weight": dominant_weight,
            "dominant_count": dominant_count,
            "dominant_share": dominant_count / body_rows if body_rows else 0,
            "share_2100": weight_counts[2100] / body_rows if body_rows else 0,
            "share_2999": weight_counts[2999] / body_rows if body_rows else 0,
            "histogram": {str(weight): count for weight, count in sorted(weight_counts.items())},
        },
        "actual_text_length": {
            "min": min(text_lengths) if text_lengths else None,
            "max": max(text_lengths) if text_lengths else None,
            "histogram": {str(length): count for length, count in sorted(text_lengths.items())},
        },
        "code_length": {str(length): count for length, count in sorted(code_lengths.items())},
        "overlap": {
            "base_unique_text": len(overlap_base),
            "base_coverage_of_file_text": len(overlap_base) / unique_text_count if unique_text_count else 0,
            "common_unique_text": len(overlap_common),
            "common_coverage_of_file_text": len(overlap_common) / unique_text_count if unique_text_count else 0,
        },
        "same_text": {
            "multiple_codes": sum(1 for state in text_state.values() if state[2]),
            "multiple_weights": sum(1 for state in text_state.values() if state[3]),
        },
    }
    ranges = {
        "min": stats["weight"]["min"],
        "max": stats["weight"]["max"],
    }
    return stats, ranges


def normalize(value: int, minimum: int | None, maximum: int | None) -> float:
    if minimum is None or maximum is None or maximum <= minimum:
        return 500.0
    return (value - minimum) * 1000.0 / (maximum - minimum)


def score_row(row: dict, strategy: str, source_ranges: dict[str, dict[str, int | None]], corpus_range: tuple[int | None, int | None]) -> float:
    source = row["source"]
    if strategy == "A":
        return float(row["weight"])
    if strategy == "B":
        base = normalize(row["weight"], source_ranges[source]["min"], source_ranges[source]["max"])
        return base - LENGTH_PENALTY * max(0, len(row["text"]) - 2)
    log_min, log_max = corpus_range
    if log_min is None or log_max is None or log_max <= log_min:
        unified = 500.0
    else:
        unified = (math.log1p(row["weight"]) - math.log1p(log_min)) * 1000.0 / (math.log1p(log_max) - math.log1p(log_min))
    return unified + C_SOURCE_BONUS.get(source, 0)


def ranked_unique(rows: list[dict], strategy: str, source_ranges: dict[str, dict[str, int | None]], corpus_range: tuple[int | None, int | None]) -> list[dict]:
    scored = [
        {**row, "score": round(score_row(row, strategy, source_ranges, corpus_range), 3)}
        for row in rows
    ]
    scored.sort(key=lambda row: (-row["score"], len(row["text"]), row["source_file"], row["line"]))
    unique: list[dict] = []
    seen_text: set[str] = set()
    for row in scored:
        if row["text"] in seen_text:
            continue
        seen_text.add(row["text"])
        unique.append(row)
    return unique


def build_probe_report(root: Path, probe_codes: set[str], probe_rows: dict[str, list[dict]], probe_counts: Counter[str], source_ranges: dict[str, dict[str, int | None]], corpus_range: tuple[int | None, int | None]) -> dict:
    by_text: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    for code, rows in probe_rows.items():
        for row in rows:
            by_text[row["text"]][code].append(row)
    result: dict[str, dict] = {}
    for text in PROBES:
        codes = sorted(by_text.get(text, {}))
        text_entry = {
            "codes": codes,
            "code_coverage": len(codes),
            "strategies": {},
        }
        for code in codes:
            rows = probe_rows[code]
            strategy_data = {}
            for strategy in ("A", "B", "C"):
                ranked = ranked_unique(rows, strategy, source_ranges, corpus_range)
                strategy_data[strategy] = {
                    "raw_rows_available": probe_counts[code],
                    "rows_ranked_offline": len(rows),
                    "truncated": probe_counts[code] > len(rows),
                    "top": [
                        {
                            "text": row["text"],
                            "score": row["score"],
                            "weight": row["weight"],
                            "source": row["source"],
                            "source_file": row["source_file"],
                            "line": row["line"],
                        }
                        for row in ranked[:10]
                    ],
                }
            text_entry["strategies"][code] = strategy_data
        result[text] = text_entry
    return result


def percentile(values: list[int], fraction: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int((len(ordered) - 1) * fraction))]


def markdown_report(payload: dict) -> str:
    lines = [
        "# 阶段 3 rimeice 三策略 dry-run 报告",
        "",
        f"- 生成时间（UTC）：`{payload['generated_at_utc']}`",
        f"- 生成 git commit：`{payload['git_commit']}`",
        f"- rimeice 文件数：`{payload['summary']['rimeice_file_count']}`；总 body 行：`{payload['summary']['rimeice_body_rows']}`",
        "- 本报告只读统计和离线排序，不改写 rimeice、入口或动态数据库。",
        "",
        "## 三策略定义",
        "",
        "- **A 保留来源权重 + common 覆盖层**：使用源文件原始 weight；仅把已生成的 1022 行 common-frequency 作为额外静态候选参与排序。",
        f"- **B 来源内归一化 + 长度轻微惩罚**：每个来源独立映射到 0～1000，再按 `-{LENGTH_PENALTY} × max(0, 实际文本长度-2)`；用于观察来源权重不可比时的变化。",
        f"- **C unified corpus score + source bonus**：对 `log1p(weight)` 做全静态来源统一映射，再加 source bonus `{json.dumps(C_SOURCE_BONUS, ensure_ascii=False)}`；只用于 dry-run，不代表已选定生产权重。",
        "- 每个 code 的 top 列表在离线报告中按 score、文本长度、来源文件/行排序，并按 text 模拟 uniquifier 的菜单去重；原始行不会被删除。",
        "",
        "## 文件统计",
        "",
        "| 文件 | body | unique text | 重复 text+code | weight min/median/p90/max | 主权重/share | 2100 | 2999 | 同 text 多 code | base 覆盖 | common 覆盖 |",
        "| --- | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for stats in payload["files"].values():
        weight = stats["weight"]
        overlap = stats["overlap"]
        lines.append(
            f"| `{Path(stats['path']).name}` | {stats['body_rows']} | {stats['unique_text']} | {stats['duplicate_text_code_rows']} | "
            f"{weight['min']}/{weight['median']}/{weight['p90']}/{weight['max']} | {weight['dominant_weight']}/{weight['dominant_share']:.3f} | "
            f"{weight['share_2100']:.3f} | {weight['share_2999']:.3f} | {stats['same_text']['multiple_codes']} | "
            f"{overlap['base_coverage_of_file_text']:.3f} | {overlap['common_coverage_of_file_text']:.3f} |"
        )
    lines.extend([
        "",
        "## 汇总与覆盖率",
        "",
        f"- rimeice 唯一 text：`{payload['summary']['rimeice_unique_text']}`；唯一 text+code：`{payload['summary']['rimeice_unique_text_code']}`；重复 text+code 行：`{payload['summary']['rimeice_duplicate_text_code_rows']}`。",
        f"- rimeice 全局同 text 多 code：`{payload['summary']['global_same_text_multiple_codes']}`；多 weight：`{payload['summary']['global_same_text_multiple_weights']}`；跨来源/文件：`{payload['summary']['global_same_text_multiple_sources']}`。",
        f"- 探针 code 总数：`{payload['summary']['probe_code_count']}`；有静态候选 code：`{payload['summary']['probe_code_covered']}`；代码覆盖率：`{payload['summary']['probe_code_coverage']:.3f}`。",
        "",
        "## 探针 top 候选变化（A/B/C）",
        "",
        "| text | code | A top1 | B top1 | C top1 | B/C 是否改变 A |",
        "| --- | --- | --- | --- | --- | :---: |",
    ])
    changed = 0
    comparable = 0
    for text in PROBES:
        entry = payload["probes"][text]
        for code, strategies in entry["strategies"].items():
            top = {
                strategy: (data["top"][0]["text"] if data["top"] else "未找到")
                for strategy, data in strategies.items()
            }
            is_changed = top["A"] != top["B"] or top["A"] != top["C"]
            changed += int(is_changed)
            comparable += 1
            lines.append(f"| {text} | `{code}` | {top['A']} | {top['B']} | {top['C']} | {'是' if is_changed else '否'} |")
    lines.extend([
        "",
        f"- 有可比较 top1 的探针 code：`{comparable}`；B/C 相对 A 至少一项改变：`{changed}`。",
        "- 完整 top10、原始来源、行号、权重和截断标记见 `probes.json`；`truncated=true` 的 code 只保留原始权重最高的 1024 条做 top 近似。",
        "",
        "## 风险与结论",
        "",
        "- A 风险最低但无法解决 rimeice 内部 2100/2999 集中和跨来源不可比；common 覆盖层只新增候选，不重写任何 rimeice 行。",
        "- B 可能把原本高绝对权重但低频来源的条目抬高，也可能因长度惩罚影响长词；归一化参数未经 Mac 实测，不进入生产。",
        "- C 的 source bonus 是研究参数，可能产生来源偏置；log 映射受 99999 等异常权重影响，不能据此全量改权。",
        "- 实际菜单还受 schema filter、history translator、dynamic_freq、completion 和 uniquifier 影响；本 dry-run 不读取私人动态数据，不能替代 Mac 实测。",
        "- 本批结论：只保留三策略对比和候选变化证据，**不执行全量 rimeice 重写**。",
        "",
        "## 回滚",
        "",
        "- 本阶段没有生产入口改动；若仅需移除报告，回滚阶段提交即可。阶段 1/2 的生产回滚仍按各自 rollback manifest 执行。",
    ])
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    root_default = Path(__file__).resolve().parents[1]
    parser.add_argument("--root", type=Path, default=root_default)
    parser.add_argument("--out-dir", type=Path, default=None)
    args = parser.parse_args()

    root = args.root.resolve()
    dicts_dir = root / "sbzr.chrome.extension" / "dicts"
    out_dir = (args.out_dir or root / "analysis" / "wordfreq-stage3").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    rimeice_paths = sorted(dicts_dir.glob("sbzr.rimeice.*.dict.yaml"), key=lambda path: path.name)
    base_path = dicts_dir / "base.dict.yaml"
    common_path = dicts_dir / "sbzr.extended.common.dict.yaml"
    overlay_path = dicts_dir / "sbzr.common-frequency.dict.yaml"
    base_texts = load_texts(base_path)
    common_texts = load_texts(common_path)
    probe_codes = load_probe_codes(root)
    probe_rows: dict[str, list[dict]] = {code: [] for code in probe_codes}
    probe_counts: Counter[str] = Counter()
    source_ranges: dict[str, dict[str, int | None]] = {}
    global_state: dict[str, dict] = {}
    rimeice_state: dict[str, dict] = {}
    files: dict[str, dict] = {}
    source_inputs = [(base_path, "base", 1), (common_path, "extended.common", 2), (overlay_path, "overlay", 4)]
    for path, source_name, source_bit in source_inputs:
        stats, ranges = file_stats(path, base_texts, common_texts, global_state, source_bit, probe_codes, probe_rows, probe_counts, source_name)
        files[source_name] = stats
        source_ranges[source_name] = ranges
    for index, path in enumerate(rimeice_paths, 3):
        source_name = f"rimeice:{path.name}"
        stats, ranges = file_stats(path, base_texts, common_texts, global_state, 1 << index, probe_codes, probe_rows, probe_counts, source_name, rimeice_state)
        files[path.name] = stats
        source_ranges[source_name] = ranges

    rimeice_files = [files[path.name] for path in rimeice_paths]
    rimeice_body_rows = sum(item["body_rows"] for item in rimeice_files)
    rimeice_unique_text_per_file_sum = sum(item["unique_text"] for item in rimeice_files)
    rimeice_unique_text = len(rimeice_state)
    rimeice_unique_text_code = sum(item["unique_text_code"] for item in rimeice_files)
    rimeice_duplicate_pairs = sum(item["duplicate_text_code_rows"] for item in rimeice_files)
    global_multi_codes = sum(1 for state in rimeice_state.values() if state["multi_code"])
    global_multi_weights = sum(1 for state in rimeice_state.values() if state["multi_weight"])
    global_multi_sources = sum(1 for state in rimeice_state.values() if state["source_mask"].bit_count() > 1)
    all_min = min((item["weight"]["min"] for item in files.values() if item["weight"]["min"] is not None), default=None)
    all_max = max((item["weight"]["max"] for item in files.values() if item["weight"]["max"] is not None), default=None)
    probes = build_probe_report(root, probe_codes, probe_rows, probe_counts, source_ranges, (all_min, all_max))
    probe_code_covered = sum(1 for code in probe_codes if probe_counts[code] > 0)
    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "git_commit": git_value(root, "rev-parse", "HEAD"),
        "rule_version": "rimeice-dry-run-v1",
        "files": files,
        "summary": {
            "rimeice_file_count": len(rimeice_paths),
            "rimeice_body_rows": rimeice_body_rows,
            "rimeice_unique_text": rimeice_unique_text,
            "rimeice_unique_text_per_file_sum": rimeice_unique_text_per_file_sum,
            "rimeice_unique_text_code": rimeice_unique_text_code,
            "rimeice_duplicate_text_code_rows": rimeice_duplicate_pairs,
            "global_same_text_multiple_codes": global_multi_codes,
            "global_same_text_multiple_weights": global_multi_weights,
            "global_same_text_multiple_sources": global_multi_sources,
            "probe_code_count": len(probe_codes),
            "probe_code_covered": probe_code_covered,
            "probe_code_coverage": probe_code_covered / len(probe_codes) if probe_codes else 0,
        },
        "strategies": {
            "A": "retain source weight + common-frequency overlay",
            "B": {
                "normalization": "per source min/max -> 0..1000",
                "length_penalty": LENGTH_PENALTY,
            },
            "C": {
                "normalization": "global log1p(weight) -> 0..1000",
                "source_bonus": C_SOURCE_BONUS,
            },
        },
        "probe_counts": dict(probe_counts),
        "probe_truncated_codes": sorted(code for code in probe_codes if probe_counts[code] > len(probe_rows.get(code, []))),
        "probes": probes,
        "source_hashes": {key: sha256_file(path) for key, path in {
            "sbzr.chrome.extension/dicts/base.dict.yaml": base_path,
            "sbzr.chrome.extension/dicts/sbzr.extended.common.dict.yaml": common_path,
            "sbzr.chrome.extension/dicts/sbzr.common-frequency.dict.yaml": overlay_path,
            **{path.name: path for path in rimeice_paths},
        }.items()},
        "safety": {
            "dry_run_only": True,
            "rimeice_rewritten": False,
            "production_entrypoints_modified": False,
            "private_userdb_read": False,
            "dynamic_frequency_read": False,
        },
    }
    (out_dir / "rimeice-dry-run.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out_dir / "probes.json").write_text(json.dumps(probes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    rollback = {
        "stage": "stage3-rimeice-dry-run",
        "production_entrypoints_modified": False,
        "input_hashes": {
            "sbzr.dict.yaml": sha256_file(root / "sbzr.dict.yaml"),
            "sbzr.chrome.extension/shared/dicts.js": sha256_file(root / "sbzr.chrome.extension" / "shared" / "dicts.js"),
        },
        "restore_command": "git revert <stage3-report-commit>",
        "note": "No production rimeice file or entrypoint is changed by this dry-run.",
    }
    (out_dir / "rollback-manifest.json").write_text(json.dumps(rollback, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    payload_for_report = {**manifest, "probes": probes}
    (out_dir / "rimeice-dry-run.md").write_text(markdown_report(payload_for_report), encoding="utf-8")
    try:
        output_display = str(out_dir.relative_to(root))
    except ValueError:
        output_display = str(out_dir)
    print(json.dumps({
        "files": len(rimeice_paths),
        "rimeice_body_rows": rimeice_body_rows,
        "rimeice_unique_text_code": rimeice_unique_text_code,
        "probe_code_count": len(probe_codes),
        "probe_code_covered": probe_code_covered,
        "probe_truncated_codes": len(manifest["probe_truncated_codes"]),
        "output": output_display,
        "rimeice_rewritten": False,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
