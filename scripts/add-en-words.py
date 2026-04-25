#!/usr/bin/env python3
"""
Add English words to easy_en extra dictionary.

Usage:
    # Add single words interactively
    python3 add-en-words.py

    # Add words from a file (one word per line)
    python3 add-en-words.py -f words.txt

    # Add words from command line
    python3 add-en-words.py stepfunction CloudFormation Lambda

    # Fetch from ECDICT online and add
    python3 add-en-words.py --ecdict stepfunction,cloudformation,lambda

    # Auto-detect code (lowercase word) and default weight
    python3 add-en-words.py --auto stepfunction CloudFormation Lambda
"""

import argparse
import os
import re
import sys
from pathlib import Path

# Default paths
RIME_DIR = Path(__file__).parent.parent
EXTRA_DICT = RIME_DIR / "sbzr.chrome.extension" / "dicts.en" / "easy_en.extra.dict.yaml"
WORDS_DICT = RIME_DIR / "sbzr.chrome.extension" / "dicts.en" / "easy_en.words.dict.yaml"

# Default weight for manually added words
DEFAULT_WEIGHT = 1000000


def parse_existing_words():
    """Parse existing words from extra dict to avoid duplicates."""
    existing = set()
    if not EXTRA_DICT.exists():
        return existing
    
    with open(EXTRA_DICT, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("-") or line.startswith("..."):
                continue
            parts = line.split("\t")
            if len(parts) >= 2:
                existing.add(parts[0].lower())
    return existing


def parse_words_dict():
    """Parse all words from main words dict to avoid duplicates."""
    existing = set()
    if not WORDS_DICT.exists():
        return existing
    
    with open(WORDS_DICT, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("-") or line.startswith("..."):
                continue
            parts = line.split("\t")
            if len(parts) >= 2:
                existing.add(parts[0].lower())
    return existing


def format_entry(word, code=None, weight=None):
    """Format a dictionary entry."""
    if code is None:
        code = word.lower()
    if weight is None:
        weight = DEFAULT_WEIGHT
    return f"{word}\t{code}\t{weight}"


def add_words(entries):
    """Add words to extra dictionary."""
    existing = parse_existing_words()
    existing_main = parse_words_dict()
    
    added = []
    skipped = []
    
    for entry in entries:
        word = entry["word"]
        word_lower = word.lower()
        
        if word_lower in existing or word_lower in existing_main:
            skipped.append(word)
            continue
        
        line = format_entry(word, entry.get("code"), entry.get("weight"))
        added.append(line)
    
    if not added:
        print("No new words to add.")
        if skipped:
            print(f"Skipped (already exists): {', '.join(skipped)}")
        return
    
    # Append to file
    with open(EXTRA_DICT, "a", encoding="utf-8") as f:
        for line in added:
            f.write(line + "\n")
    
    print(f"Added {len(added)} words:")
    for line in added:
        print(f"  + {line}")
    
    if skipped:
        print(f"\nSkipped {len(skipped)} (already exists): {', '.join(skipped)}")
    
    print(f"\nDon't forget to recompile:")
    print(f"  rime_deployer --compile easy_en.schema.yaml {RIME_DIR} /usr/share/rime-data")


def fetch_from_ecdict(words):
    """Fetch word info from ECDICT (local or online)."""
    # Try to find local ECDICT first
    ecdict_paths = [
        RIME_DIR / "ecdict.csv",
        Path.home() / ".cache" / "ecdict.csv",
        Path("/tmp/ecdict.csv"),
    ]
    
    ecdict_path = None
    for p in ecdict_paths:
        if p.exists():
            ecdict_path = p
            break
    
    if not ecdict_path:
        print("ECDICT not found locally. Downloading...")
        ecdict_path = download_ecdict()
        if not ecdict_path:
            return None
    
    # Parse ECDICT
    results = []
    words_lower = {w.lower() for w in words}
    
    with open(ecdict_path, "r", encoding="utf-8") as f:
        header = f.readline().strip().split(",")
        word_idx = header.index("word") if "word" in header else 0
        
        for line in f:
            parts = line.strip().split(",")
            if len(parts) <= word_idx:
                continue
            word = parts[word_idx]
            if word.lower() in words_lower:
                results.append({
                    "word": word,
                    "code": word.lower(),
                    "weight": DEFAULT_WEIGHT,
                })
                words_lower.discard(word.lower())
    
    # Words not found in ECDICT
    for w in words_lower:
        results.append({
            "word": w,
            "code": w.lower(),
            "weight": DEFAULT_WEIGHT,
        })
    
    return results


def download_ecdict():
    """Download ECDICT csv file."""
    url = "https://github.com/skywind3000/ECDICT/raw/master/ecdict.csv"
    output = Path("/tmp/ecdict.csv")
    
    try:
        import urllib.request
        print(f"Downloading from {url}...")
        urllib.request.urlretrieve(url, output)
        print(f"Saved to {output}")
        return output
    except Exception as e:
        print(f"Failed to download ECDICT: {e}")
        return None


def interactive_mode():
    """Interactive mode for adding words."""
    print("Interactive mode: Enter words to add (empty line to finish)")
    print("Format: word [code] [weight]")
    print("Example: stepfunction stepfunction 100000")
    print()
    
    entries = []
    while True:
        line = input("> ").strip()
        if not line:
            break
        
        parts = line.split()
        if len(parts) == 1:
            entries.append({"word": parts[0]})
        elif len(parts) == 2:
            entries.append({"word": parts[0], "code": parts[1]})
        elif len(parts) >= 3:
            entries.append({"word": parts[0], "code": parts[1], "weight": int(parts[2])})
    
    return entries


def read_words_from_file(filepath):
    """Read words from a file (one per line)."""
    entries = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            word = line.strip()
            if word and not word.startswith("#"):
                entries.append({"word": word})
    return entries


def main():
    parser = argparse.ArgumentParser(description="Add English words to easy_en dictionary")
    parser.add_argument("words", nargs="*", help="Words to add")
    parser.add_argument("-f", "--file", help="File containing words (one per line)")
    parser.add_argument("-i", "--interactive", action="store_true", help="Interactive mode")
    parser.add_argument("--ecdict", help="Fetch from ECDICT (comma-separated words)")
    parser.add_argument("--auto", action="store_true", help="Auto-generate code (lowercase) and default weight")
    parser.add_argument("--weight", type=int, default=DEFAULT_WEIGHT, help=f"Default weight (default: {DEFAULT_WEIGHT})")
    
    args = parser.parse_args()
    
    entries = []
    
    if args.interactive:
        entries = interactive_mode()
    elif args.file:
        entries = read_words_from_file(args.file)
    elif args.ecdict:
        words = [w.strip() for w in args.ecdict.split(",")]
        entries = fetch_from_ecdict(words)
        if entries is None:
            sys.exit(1)
    elif args.words:
        entries = [{"word": w} for w in args.words]
    else:
        parser.print_help()
        sys.exit(1)
    
    # Set default weight for entries without weight
    for e in entries:
        if "weight" not in e:
            e["weight"] = args.weight
    
    add_words(entries)


if __name__ == "__main__":
    main()
