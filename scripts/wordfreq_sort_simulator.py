#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compare the old and proposed SBZR candidate ordering offline.

This simulator deliberately models only candidate metadata exposed to a Lua
filter (text, type, quality, code, and source).  It never reads runtime
LevelDb, userdb, or dynamic-frequency files.  The Python implementation is
kept independent from ``lua/length_priority.lua`` so that the ordering change
is proven before the production filter is edited.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Iterable

MAX_BUFFER = 512
DYNAMIC_SCAN_OLD = 64
DYNAMIC_SCAN_NEW = MAX_BUFFER
QUALITY_TIE_WINDOW = 100
PROBE_TEXTS = ["我们", "这个", "可以", "现在", "因为", "所以", "如果", "已经", "自己", "没有", "需要", "问题", "应该", "设置", "文件", "中国"]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def candidate(text: str, quality: int, code: str = "", kind: str = "table", source: str = "fixture") -> dict:
    return {
        "text": text,
        "quality": quality,
        "code": code,
        "type": kind,
        "source": source,
    }


def old_length_first(items: list[dict], max_buffer: int = MAX_BUFFER) -> list[dict]:
    buffered = items[:max_buffer]
    rest = items[max_buffer:]
    ordered = sorted(enumerate(buffered), key=lambda pair: (len(pair[1]["text"]), pair[0]))
    return [item for _, item in ordered] + rest


def quality_value(item: dict) -> float:
    value = item.get("quality", 0)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0

def quality_first(items: list[dict], tie_window: int = QUALITY_TIE_WINDOW, max_buffer: int = MAX_BUFFER) -> list[dict]:
    """Sort quality-first, then length within deterministic quality groups.

    Pairwise "within N" comparisons are not transitive and are unsafe for
    table.sort.  We therefore sort by quality first, partition each buffer
    at the highest-quality item's explicit window, and apply the length
    tie-break only inside that group.
    """
    buffered = sorted(
        enumerate(items[:max_buffer]),
        key=lambda pair: (-quality_value(pair[1]), pair[0]),
    )
    reordered: list[tuple[int, dict]] = []
    group_start = 0
    while group_start < len(buffered):
        anchor_quality = quality_value(buffered[group_start][1])
        group_end = group_start + 1
        while (
            group_end < len(buffered)
            and anchor_quality - quality_value(buffered[group_end][1]) <= tie_window
        ):
            group_end += 1
        group = buffered[group_start:group_end]
        group.sort(
            key=lambda pair: (
                len(pair[1]["text"]),
                -quality_value(pair[1]),
                pair[0],
            )
        )
        reordered.extend(group)
        group_start = group_end
    return [item for _, item in reordered] + items[max_buffer:]


def promote_dynamic(items: list[dict], selected_text: str, scan_limit: int = DYNAMIC_SCAN_OLD) -> tuple[list[dict], bool, int | None]:
    scan = min(len(items), scan_limit)
    match_index = next(
        (index for index, item in enumerate(items[:scan]) if item["text"] == selected_text),
        None,
    )
    if match_index is None:
        return items, False, None
    return [items[match_index], *items[:match_index], *items[match_index + 1:]], True, match_index + 1


def fixtures() -> dict[str, list[dict]]:
    distractors = [candidate(f"短词{i:02d}", 1000, code="aaaa") for i in range(64)]
    return {
        "large_quality_gap_cross_length": [
            candidate("低频短", 1000, code="aaaa"),
            candidate("高频长词", 1300, code="aaaa"),
        ],
        "near_tie_prefers_shorter": [
            candidate("高频长词", 1103, code="aaaa"),
            candidate("低频短", 1102, code="aaaa"),
        ],
        "same_quality_stable": [
            candidate("甲乙", 1200, code="aaaa"),
            candidate("甲", 1200, code="aaaa"),
            candidate("丙", 1200, code="aaaa"),
        ],
        "dynamic_selected_beyond_old_scan": [
            *distractors,
            candidate("已选长词", 1101, code="aaaa"),
        ],
        "dynamic_low_quality_beyond_scan": [
            *distractors,
            candidate("已选低频", 900, code="aaaa"),
        ],
        "completion_is_not_dropped": [
            candidate("补全长词", 900, code="aaaa", kind="completion"),
            candidate("表词", 850, code="aaaa", kind="table"),
        ],
        "same_text_multiple_codes": [
            candidate("可以", 50014, code="keyi", source="sbzr.single"),
            candidate("可以", 0, code="ky", source="zdy"),
            candidate("可以", 1183, code="base", source="base"),
        ],
        "actual_probe_quality_samples": [
            candidate("中国", 1223, code="zsgo", source="base"),
            candidate("中国", 931, code="zsgi", source="extended.common"),
            candidate("应该", 1953, code="yygl", source="base"),
            candidate("自己", 1793, code="ziji", source="base"),
            candidate("已经", 1233, code="yijy", source="base"),
        ],
        "buffer_boundary_preserves_tail": [
            *[candidate(f"候选{i:03d}", 1000 + (i % 7), code="aaaa") for i in range(MAX_BUFFER)],
            candidate("尾部不重排", 99999, code="aaaa"),
        ],
    }


def order_texts(items: Iterable[dict]) -> list[str]:
    return [item["text"] for item in items]


def summarize_case(name: str, items: list[dict]) -> dict:
    selected_text = "已选低频" if name == "dynamic_low_quality_beyond_scan" else "已选长词"
    old_order = old_length_first(items)
    new_order = quality_first(items)
    old_dynamic, old_promoted, old_scan_rank = promote_dynamic(
        old_order, selected_text, DYNAMIC_SCAN_OLD
    )
    new_dynamic, new_promoted, new_scan_rank = promote_dynamic(
        new_order, selected_text, DYNAMIC_SCAN_NEW
    )
    return {
        "name": name,
        "input_count": len(items),
        "old_order": order_texts(old_order),
        "new_order": order_texts(new_order),
        "old_top": order_texts(old_order[:10]),
        "new_top": order_texts(new_order[:10]),
        "old_changed": order_texts(old_order) != order_texts(items),
        "new_changed": order_texts(new_order) != order_texts(items),
        "old_dynamic_order": order_texts(old_dynamic[:10]),
        "new_dynamic_order": order_texts(new_dynamic[:10]),
        "old_dynamic_promoted": old_promoted,
        "new_dynamic_promoted": new_promoted,
        "old_dynamic_scan_rank": old_scan_rank,
        "new_dynamic_scan_rank": new_scan_rank,
        "candidate_count_preserved": len(old_order) == len(items) == len(new_order),
        "text_multiset_preserved": sorted(order_texts(old_order)) == sorted(order_texts(new_order)) == sorted(order_texts(items)),
    }


def sensitivity(items: list[dict], windows: Iterable[int]) -> dict[str, list[str]]:
    return {str(window): order_texts(quality_first(items, tie_window=window)[:10]) for window in windows}


def assert_invariants(results: dict[str, dict]) -> None:
    assert results["large_quality_gap_cross_length"]["new_top"][0] == "高频长词"
    assert results["near_tie_prefers_shorter"]["new_top"][0] == "低频短"
    dynamic = results["dynamic_selected_beyond_old_scan"]
    assert not dynamic["old_dynamic_promoted"]
    assert dynamic["new_dynamic_promoted"]
    assert dynamic["new_dynamic_order"][0] == "已选长词"
    low_dynamic = results["dynamic_low_quality_beyond_scan"]
    assert not low_dynamic["old_dynamic_promoted"]
    assert low_dynamic["new_dynamic_promoted"]
    assert low_dynamic["new_dynamic_order"][0] == "已选低频"
    for result in results.values():
        assert result["candidate_count_preserved"]
        assert result["text_multiset_preserved"]
    multi_code = results["same_text_multiple_codes"]
    assert multi_code["input_count"] == 3
    assert multi_code["candidate_count_preserved"]


def markdown_report(payload: dict, label: str) -> str:
    lines = [
        f"# 阶段 1 离线排序模拟（{label}）",
        "",
        f"- 规则版本：`{payload['algorithm']['version']}`",
        f"- quality tie-window：`{payload['algorithm']['quality_tie_window']}`",
        f"- length buffer：`{payload['algorithm']['max_buffer']}`",
        f"- dynamic scan：旧规则 `{payload['algorithm']['dynamic_scan_old']}`，提议规则 `{payload['algorithm']['dynamic_scan_new']}`",
        f"- 生产 Lua SHA256（本次运行）：`{payload['production_lua_sha256']}`",
        f"- dynamic_freq.lua SHA256（本次运行）：`{payload['production_dynamic_lua_sha256']}`",
        "## 结果摘要",
        "",
        "| case | 输入数 | old top | new top | old/new 均保留候选 |",
        "| --- | ---: | --- | --- | :---: |",
    ]
    for result in payload["cases"].values():
        lines.append(
            f"| `{result['name']}` | {result['input_count']} | "
            f"{', '.join(result['old_top'][:3])} | {', '.join(result['new_top'][:3])} | "
            f"{'是' if result['candidate_count_preserved'] and result['text_multiset_preserved'] else '否'} |"
        )
    dynamic = payload["cases"]["dynamic_selected_beyond_old_scan"]
    low_dynamic = payload["cases"]["dynamic_low_quality_beyond_scan"]
    lines.extend(
        [
            "",
            "## 关键证据",
            "",
            f"- 大权重差跨长度：old 首位为 `{payload['cases']['large_quality_gap_cross_length']['old_top'][0]}`，new 首位为 `{payload['cases']['large_quality_gap_cross_length']['new_top'][0]}`。",
            f"- 小窗口（差值 1）：new 按短词 tie-break，首位为 `{payload['cases']['near_tie_prefers_shorter']['new_top'][0]}`。",
            f"- dynamic 高质量选词 `{dynamic['name']}`：old 在第 `{dynamic['old_dynamic_scan_rank'] or '未扫描到'}` 位，new 在第 `{dynamic['new_dynamic_scan_rank']}` 位；quality-first 使其进入扫描窗口。",
            f"- dynamic 低质量选词 `{low_dynamic['name']}`：候选静态质量为 900、排在第 65 位；旧 64 扫描未提升，提议 512 扫描可提升到首位。",
            "- 同 text 多 code case 的候选数与 text multiset 均保持不变；模拟器不执行去重或删除。",
            "- completion case 作为普通候选参与排序，不被模拟器过滤。",
            "",
            "## tie-window 敏感性",
            "",
            "敏感性结果只用于证明窗口是显式参数；生产修改不批量改写词库权重。",
            "",
            "| case | window=0 | window=50 | window=100 | window=200 |",
            "| --- | --- | --- | --- | --- |",
        ]
    )
    for name in ("large_quality_gap_cross_length", "near_tie_prefers_shorter", "actual_probe_quality_samples"):
        values = payload["sensitivity"][name]
        lines.append(
            f"| `{name}` | {' / '.join(values['0'][:3])} | {' / '.join(values['50'][:3])} | "
            f"{' / '.join(values['100'][:3])} | {' / '.join(values['200'][:3])} |"
        )
    lines.extend(
        [
            "",
            "## 边界与限制",
            "",
            "- Python 仅模拟 filter 可见的 `cand.text`、`cand.quality`、`cand.type` 等字段；不声称替代 live Rime candidate menu。",
            "- new 规则只重排前 512 个候选，尾部保持原顺序，沿用旧过滤器的性能边界。",
            "- dynamic 仍位于 length filter 之后；提议把扫描上限从 64 提高到 512，与 length filter 缓冲一致。超过 512 的动态候选仍是已知边界，需后续实测决定是否调整扫描策略。",
            "- 未读取私人 LevelDb、`dynamic_freq.local.txt`、userdb 或同步目录。",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    root_default = Path(__file__).resolve().parents[1]
    parser.add_argument("--root", type=Path, default=root_default)
    parser.add_argument("--out-dir", type=Path, default=None)
    parser.add_argument("--label", choices=("before", "proposal", "after"), default="before")
    args = parser.parse_args()

    root = args.root.resolve()
    out_dir = (args.out_dir or root / "analysis" / "wordfreq-stage1").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    lua_path = root / "lua" / "length_priority.lua"
    baseline_manifest_path = root / "analysis" / "wordfreq-baseline" / "manifest.json"
    baseline_manifest = json.loads(baseline_manifest_path.read_text(encoding="utf-8")) if baseline_manifest_path.exists() else {}
    current_lua_hash = sha256_file(lua_path)
    current_dynamic_lua_hash = sha256_file(root / "lua" / "dynamic_freq.lua")
    baseline_lua_hash = baseline_manifest.get("input_hashes", {}).get("lua/length_priority.lua")
    if args.label == "before" and baseline_lua_hash and current_lua_hash != baseline_lua_hash:
        raise SystemExit("length_priority.lua 已偏离阶段零基线；拒绝生成 before 报告")

    all_fixtures = fixtures()
    results = {name: summarize_case(name, items) for name, items in all_fixtures.items()}
    assert_invariants(results)
    sensitivity_results = {
        name: sensitivity(items, (0, 50, 100, 200))
        for name, items in all_fixtures.items()
        if name in {"large_quality_gap_cross_length", "near_tie_prefers_shorter", "actual_probe_quality_samples"}
    }
    payload = {
        "label": args.label,
        "production_lua_sha256": current_lua_hash,
        "production_dynamic_lua_sha256": current_dynamic_lua_hash,
        "algorithm": {
            "version": "stage1-quality-window-v1",
            "quality_tie_window": QUALITY_TIE_WINDOW,
            "max_buffer": MAX_BUFFER,
            "dynamic_scan_old": DYNAMIC_SCAN_OLD,
            "dynamic_scan_new": DYNAMIC_SCAN_NEW,
            "old_rule": "UTF-8 text length ascending, original order for equal length",
            "new_rule": "sort quality descending; within each group whose quality is within 100 of the group's highest, shorter text then quality then original order",
        },
        "cases": results,
        "sensitivity": sensitivity_results,
        "safety": {
            "private_userdb_read": False,
            "dynamic_frequency_read": False,
            "candidate_deletion": False,
        },
    }
    json_name = out_dir / f"simulation-{args.label}.json"
    report_name = out_dir / f"simulation-{args.label}.md"
    json_name.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report_name.write_text(markdown_report(payload, args.label), encoding="utf-8")

    if args.label == "before":
        targets = [
            {
                "path": "lua/length_priority.lua",
                "sha256_before_change": current_lua_hash,
                "backup": "analysis/wordfreq-stage1/length_priority.lua.before",
            }
        ]
        dynamic_backup = out_dir / "dynamic_freq.lua.before"
        if dynamic_backup.exists():
            targets.append(
                {
                    "path": "lua/dynamic_freq.lua",
                    "sha256_before_change": sha256_file(dynamic_backup),
                    "backup": "analysis/wordfreq-stage1/dynamic_freq.lua.before",
                }
            )
        rollback = {
            "baseline_git_commit": baseline_manifest.get("baseline_git_commit", "unknown"),
            "targets": targets,
            "restore_command": "git revert <stage1-commit>",
            "note": "Use git revert of the stage commit first; the .before files are content backups for review. Never restore or submit private runtime files.",
        }
        (out_dir / "rollback-manifest.json").write_text(
            json.dumps(rollback, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    print(json.dumps({
        "label": args.label,
        "production_lua_sha256": current_lua_hash,
        "production_dynamic_lua_sha256": current_dynamic_lua_hash,
        "candidate_count_preserved": all(result["candidate_count_preserved"] for result in results.values()),
        "dynamic_old_promoted": results["dynamic_selected_beyond_old_scan"]["old_dynamic_promoted"],
        "dynamic_new_promoted": results["dynamic_selected_beyond_old_scan"]["new_dynamic_promoted"],
        "low_quality_dynamic_old_promoted": results["dynamic_low_quality_beyond_scan"]["old_dynamic_promoted"],
        "low_quality_dynamic_new_promoted": results["dynamic_low_quality_beyond_scan"]["new_dynamic_promoted"],
        "output": str(out_dir.relative_to(root)),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
