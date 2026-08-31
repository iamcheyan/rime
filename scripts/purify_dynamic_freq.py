#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Purify dynamic frequency logs (dynamic_freq.local.txt + sbzr.txt) into
a high-quality static user dictionary: sbzr.chrome.extension/dicts/sbzr.userdb.dict.yaml.

This provides an out-of-the-box base frequency model matching the user's
typing habits for fresh machines or environments without runtime cache.
"""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path
from typing import NamedTuple

ROOT = Path(__file__).resolve().parent.parent
LOCAL_DF_FILE = ROOT / "dynamic_freq.local.txt"
SYNC_ROOT = ROOT / "sync"
SBZR_TXT = ROOT / "sbzr.txt"
TARGET_DICT = ROOT / "sbzr.chrome.extension" / "dicts" / "sbzr.userdb.dict.yaml"

VALID_CODE_RE = re.compile(r"^[a-zA-Z]+$")
INVALID_TEXT_CHARS = set("\t\r\n ")

class Entry(NamedTuple):
    text: str
    code: str
    weight: int
    source: str


def is_valid_entry(text: str, code: str, cand_type: str = "") -> bool:
    if not text or not code:
        return False
    if cand_type == "punct":
        return False
    if not VALID_CODE_RE.match(code):
        return False
    if any(c in INVALID_TEXT_CHARS for c in text):
        return False
    # Filter out single non-CJK punctuation characters (like . , ? ! etc)
    if len(text) == 1 and not ('\u4e00' <= text <= '\u9fff' or text.isalnum()):
        return False
    return True


def parse_dynamic_freq_file(path: Path) -> dict[tuple[str, str], int]:
    """Parse dynamic_freq TSV files and return {(text, code): timestamp}."""
    records: dict[tuple[str, str], int] = {}
    if not path.exists():
        return records
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw or raw.startswith("#"):
            continue
        fields = raw.split("\t")
        if len(fields) < 3:
            continue
        code = fields[0].strip()
        cand_type = fields[1].strip() if len(fields) >= 2 else ""
        text = fields[2].strip() if len(fields) >= 3 else ""
        ts = int(fields[3]) if len(fields) >= 4 and fields[3].isdigit() else 0
        if not is_valid_entry(text, code, cand_type):
            continue
        key = (text, code)
        if key not in records or ts > records[key]:
            records[key] = ts
    return records


def parse_sbzr_txt(path: Path, min_count: int = 5) -> dict[tuple[str, str], int]:
    """Parse Rime exported sbzr.txt userdb file and return {(text, code): count}."""
    records: dict[tuple[str, str], int] = {}
    if not path.exists():
        return records
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw or raw.startswith("#"):
            continue
        fields = raw.split("\t")
        if len(fields) < 3:
            continue
        text = fields[0].strip()
        code = fields[1].strip()
        try:
            count = int(fields[2].strip())
        except ValueError:
            continue
        if count < min_count:
            continue
        if not is_valid_entry(text, code):
            continue
        key = (text, code)
        records[key] = max(records.get(key, 0), count)
    return records


def calculate_dynamic_weights(df_records: dict[tuple[str, str], int]) -> dict[tuple[str, str], int]:
    """Assign weights to dynamic_freq records (range 2500 - 2950)."""
    if not df_records:
        return {}
    # Sort by timestamp descending
    sorted_items = sorted(df_records.items(), key=lambda item: item[1], reverse=True)
    total = len(sorted_items)
    weights: dict[tuple[str, str], int] = {}
    for idx, (key, _) in enumerate(sorted_items):
        # Top 10% get ~2950, down to 2550
        ratio = 1.0 - (idx / max(total, 1))
        weight = 2550 + int(ratio * 400)
        weights[key] = weight
    return weights


def calculate_sbzr_txt_weights(sbzr_records: dict[tuple[str, str], int]) -> dict[tuple[str, str], int]:
    """Assign weights to sbzr.txt records based on hit counts (range 2200 - 2750)."""
    weights: dict[tuple[str, str], int] = {}
    for key, count in sbzr_records.items():
        # log10 based scaling
        log_count = math.log10(max(count, 1))
        # count=5 -> 2200; count=100 -> 2450; count=10000 -> 2750
        weight = 2100 + int(log_count * 150)
        weights[key] = min(max(weight, 2150), 2750)
    return weights


def purify() -> list[Entry]:
    # 1. Collect all dynamic_freq snapshots
    all_df: dict[tuple[str, str], int] = {}
    for sync_file in SYNC_ROOT.glob("*/dynamic_freq.txt"):
        for key, ts in parse_dynamic_freq_file(sync_file).items():
            all_df[key] = max(all_df.get(key, 0), ts)
    if LOCAL_DF_FILE.exists():
        for key, ts in parse_dynamic_freq_file(LOCAL_DF_FILE).items():
            all_df[key] = max(all_df.get(key, 0), ts)

    df_weights = calculate_dynamic_weights(all_df)

    # 2. Collect sbzr.txt counts (min_count >= 5)
    sbzr_counts = parse_sbzr_txt(SBZR_TXT, min_count=5) if SBZR_TXT.exists() else {}
    sbzr_weights = calculate_sbzr_txt_weights(sbzr_counts)

    # 3. Merge weights (dynamic_freq choice takes priority)
    all_keys = set(df_weights.keys()) | set(sbzr_weights.keys())
    merged_entries: list[Entry] = []

    for text, code in all_keys:
        w_df = df_weights.get((text, code), 0)
        w_sbzr = sbzr_weights.get((text, code), 0)
        if w_df > 0:
            final_weight = w_df
            source = "dynamic_freq"
        else:
            final_weight = w_sbzr
            source = "userdb_history"
        merged_entries.append(Entry(text=text, code=code, weight=final_weight, source=source))

    # Sort by weight desc, then code, then text
    merged_entries.sort(key=lambda e: (-e.weight, e.code, e.text))
    return merged_entries


def write_dict(entries: list[Entry], target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    header = """# Rime dictionary
# encoding: utf-8
#
# Generated by scripts/purify_dynamic_freq.py
# Purified high-frequency entries from dynamic_freq logs & userdb history.
---
name: sbzr.chrome.extension/dicts/sbzr.userdb
version: "1.0"
sort: by_weight
use_preset_vocabulary: false
columns:
  - text
  - code
  - weight
...
"""
    lines = [header.strip()]
    for entry in entries:
        lines.append(f"{entry.text}\t{entry.code}\t{entry.weight}")
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"✓ Successfully wrote {len(entries)} purified entries to {target}")


def main() -> int:
    entries = purify()
    write_dict(entries, TARGET_DICT)
    print("\n--- Top 20 Purified High-Frequency Samples ---")
    for e in entries[:20]:
        print(f"  {e.text}\t{e.code}\tweight={e.weight}\t(from {e.source})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
