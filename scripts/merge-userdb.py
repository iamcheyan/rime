#!/usr/bin/env python3
"""
Merge git conflict markers in sbzr.txt (Rime userdb format).
Entries with the same (word, code) key are merged by summing their counts.
Unique entries from either side are preserved.
"""

import sys
import re
from pathlib import Path


def parse_entries(lines):
    """Parse lines into (header_lines, entries dict {(word,code): count})."""
    headers = []
    entries = {}
    for line in lines:
        line = line.rstrip("\r\n")
        if line.startswith("#"):
            headers.append(line)
            continue
        parts = line.split("\t")
        if len(parts) == 3:
            word, code, count = parts
            key = (word, code)
            entries[key] = entries.get(key, 0) + int(count)
        elif line:  # non-empty non-entry line, keep as-is via header
            headers.append(line)
    return headers, entries


def merge_conflict(path: Path):
    text = path.read_bytes().decode("utf-8")

    # Split on conflict markers
    conflict_re = re.compile(
        r"^<{7}.*?\n(.*?)^={7}\n(.*?)^>{7}.*?\n",
        re.MULTILINE | re.DOTALL,
    )

    match = conflict_re.search(text)
    if not match:
        print(f"No conflict markers found in {path.name}, skipping.")
        return

    ours_lines = match.group(1).splitlines(keepends=True)
    theirs_lines = match.group(2).splitlines(keepends=True)

    headers_a, entries_a = parse_entries(ours_lines)
    headers_b, entries_b = parse_entries(theirs_lines)

    # Merge: sum counts for same key
    merged = dict(entries_a)
    for key, count in entries_b.items():
        merged[key] = merged.get(key, 0) + count

    # Use headers from whichever side has more (prefer ours, fall back to theirs)
    headers = headers_a if headers_a else headers_b

    # Sort by code then word for deterministic output
    sorted_entries = sorted(merged.items(), key=lambda x: (x[0][1], x[0][0]))

    out_lines = [h + "\n" for h in headers]
    for (word, code), count in sorted_entries:
        out_lines.append(f"{word}\t{code}\t{count}\n")

    # Replace the conflict block with merged content
    merged_text = "".join(out_lines)
    result = text[: match.start()] + merged_text + text[match.end() :]

    path.write_bytes(result.encode("utf-8"))
    print(f"Merged {len(merged)} entries -> {path}")

    import subprocess
    subprocess.run(["git", "add", str(path)], cwd=path.parent, check=True)
    print(f"git add {path.name}")


if __name__ == "__main__":
    root = Path(__file__).parent.parent
    targets = [Path(a) for a in sys.argv[1:]] or [
        root / "sbzr.txt",
        root / "jaroomaji.txt",
    ]
    for target in targets:
        if target.exists():
            merge_conflict(target)
        else:
            print(f"Skipped (not found): {target}")

    import subprocess
    subprocess.run(["git", "status"], cwd=root)
