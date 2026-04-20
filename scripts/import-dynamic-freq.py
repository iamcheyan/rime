#!/usr/bin/env python3

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
LOCAL_FILE = ROOT / "dynamic_freq.local.txt"
SYNC_ROOT = ROOT / "sync"


def parse_records(path: Path) -> dict[str, tuple[str, str, int]]:
    records: dict[str, tuple[str, str, int]] = {}
    if not path.exists():
        return records
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw or raw.startswith("#"):
            continue
        fields = raw.split("\t")
        if len(fields) < 4:
            continue
        input_code, cand_type, text, updated_at = fields[:4]
        try:
            ts = int(updated_at)
        except ValueError:
            continue
        current = records.get(input_code)
        rec = (cand_type, text, ts)
        if current is None or ts >= current[2]:
            records[input_code] = rec
    return records


def merge_records(
    base: dict[str, tuple[str, str, int]],
    incoming: dict[str, tuple[str, str, int]],
) -> dict[str, tuple[str, str, int]]:
    merged = dict(base)
    for input_code, rec in incoming.items():
        current = merged.get(input_code)
        if current is None or rec[2] >= current[2]:
            merged[input_code] = rec
    return merged


def write_records(path: Path, records: dict[str, tuple[str, str, int]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# dynamic_freq local cache",
        "# format: input<TAB>type<TAB>text<TAB>updated_at",
    ]
    for input_code, (cand_type, text, ts) in sorted(records.items(), key=lambda item: (-item[1][2], item[0])):
        lines.append(f"{input_code}\t{cand_type}\t{text}\t{ts}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    merged: dict[str, tuple[str, str, int]] = {}
    for path in sorted(SYNC_ROOT.glob("*/dynamic_freq.txt")):
        merged = merge_records(merged, parse_records(path))

    if not merged and LOCAL_FILE.exists():
        print("No synced dynamic_freq snapshots found, keeping local cache.")
        return 0

    write_records(LOCAL_FILE, merged)
    print(f"Imported dynamic_freq from {len(list(SYNC_ROOT.glob('*/dynamic_freq.txt')))} sync snapshot(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
