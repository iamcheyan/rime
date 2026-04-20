#!/usr/bin/env python3

from __future__ import annotations

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PATTERNS = ("*.dict.yaml", "*.txt")
SKIP_DIRS = {
    ".git",
    ".github",
    ".idea",
    ".vscode",
    "__pycache__",
    "node_modules",
}


def load_banned_words(path: Path) -> set[str]:
    words: set[str] = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        word = raw.strip()
        if not word or word.startswith("#"):
            continue
        words.add(word)
    return words


def iter_candidate_files(root: Path, patterns: tuple[str, ...]) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.name == "remove-entries.py":
            continue
        if any(path.match(pattern) for pattern in patterns):
            files.append(path)
    return sorted(files)


def should_remove_line(line: str, banned_words: set[str]) -> bool:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return False
    if stripped in {"---", "..."}:
        return False

    fields = line.split("\t")
    if len(fields) >= 2:
        return fields[0].strip() in banned_words

    fields = stripped.split()
    if len(fields) >= 2:
        return fields[0].strip() in banned_words

    return False


def rewrite_file(path: Path, banned_words: set[str], dry_run: bool) -> tuple[int, int]:
    original = path.read_text(encoding="utf-8")
    had_trailing_newline = original.endswith("\n")
    lines = original.splitlines()

    kept_lines: list[str] = []
    removed = 0
    for line in lines:
        if should_remove_line(line, banned_words):
            removed += 1
            continue
        kept_lines.append(line)

    if removed == 0:
        return 0, 0

    updated = "\n".join(kept_lines)
    if had_trailing_newline:
        updated += "\n"

    if not dry_run:
        path.write_text(updated, encoding="utf-8")

    return removed, len(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Remove banned entries from all dictionary text files under the Rime workspace."
    )
    parser.add_argument(
        "word_list",
        type=Path,
        help="Path to a UTF-8 text file containing one banned word per line.",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=ROOT,
        help="Workspace root to scan. Defaults to the repository root.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scan and report matches without writing changes.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    word_list = args.word_list.resolve()
    root = args.root.resolve()

    if not word_list.exists():
        raise SystemExit(f"Word list not found: {word_list}")
    if not root.exists():
        raise SystemExit(f"Root not found: {root}")

    banned_words = load_banned_words(word_list)
    if not banned_words:
        print("No banned words found. Nothing to do.")
        return 0

    changed_files = 0
    removed_entries = 0
    candidate_files = iter_candidate_files(root, DEFAULT_PATTERNS)

    for path in candidate_files:
        removed, _ = rewrite_file(path, banned_words, args.dry_run)
        if removed == 0:
            continue
        changed_files += 1
        removed_entries += removed
        rel = path.relative_to(root)
        action = "Would remove" if args.dry_run else "Removed"
        print(f"{action} {removed} entr{'y' if removed == 1 else 'ies'} from {rel}")

    summary = "Would remove" if args.dry_run else "Removed"
    print(
        f"{summary} {removed_entries} entr{'y' if removed_entries == 1 else 'ies'} "
        f"across {changed_files} file(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
