#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compare SBZR weights with public external word-frequency references.

External downloads are kept outside the repository by default.  The script
only writes analysis/wordfreq-external (or --out-dir) and never reads userdb,
LevelDb, dynamic-frequency files, or Sogou data.  Sogou is documented in the
report but intentionally is not a numerical input because its redistribution
terms are not clear.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import tempfile
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

SUBTLEX_URL = "https://journals.plos.org/plosone/article/file?type=supplementary&id=10.1371/journal.pone.0010729.s002"
RIME_ESSAY_URL = "https://raw.githubusercontent.com/rime/rime-essay/master/essay.txt"
CPPJIEBA_URL = "https://raw.githubusercontent.com/yanyiwu/cppjieba/master/dict/jieba.dict.utf8"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "SBZR-wordfreq-research/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response, destination.open("wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)


def fetch(url: str, cache_dir: Path, name: str) -> tuple[Path, dict]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / name
    if not path.exists():
        download(url, path)
    return path, {"url": url, "retrieved_utc": datetime.now(timezone.utc).isoformat(), "sha256": sha256(path), "bytes": path.stat().st_size}


def parse_sbzr_dict(path: Path) -> list[tuple[str, str, int]]:
    rows: list[tuple[str, str, int]] = []
    body = False
    with path.open(encoding="utf-8") as handle:
        for raw in handle:
            line = raw.rstrip("\r\n")
            if not body:
                body = line.strip() == "..."
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
            rows.append((fields[0].strip(), fields[1].strip(), weight))
    return rows


def load_sbzr(root: Path) -> tuple[dict[str, int], dict[str, set[str]], int]:
    best: dict[str, int] = {}
    codes: dict[str, set[str]] = defaultdict(set)
    rows = 0
    dict_dir = root / "sbzr.chrome.extension" / "dicts"
    for path in sorted(dict_dir.glob("*.dict.yaml")):
        if "userdb" in path.name:
            continue
        for text, code, weight in parse_sbzr_dict(path):
            rows += 1
            codes[text].add(code)
            best[text] = max(best.get(text, weight), weight)
    return best, codes, rows


def parse_rime_essay(path: Path) -> dict[str, float]:
    values: dict[str, float] = {}
    with path.open(encoding="utf-8") as handle:
        for raw in handle:
            fields = raw.rstrip("\r\n").split("\t")
            if len(fields) < 2 or not fields[0].strip():
                continue
            try:
                value = float(fields[1].strip())
            except ValueError:
                continue
            text = fields[0].strip()
            values[text] = max(values.get(text, value), value)
    return values


def parse_cppjieba(path: Path) -> dict[str, float]:
    values: dict[str, float] = {}
    with path.open(encoding="utf-8") as handle:
        for raw in handle:
            fields = raw.strip().split()
            if len(fields) < 2:
                continue
            try:
                value = float(fields[1])
            except ValueError:
                continue
            text = fields[0]
            values[text] = max(values.get(text, value), value)
    return values


def decode_bytes(data: bytes) -> str:
    for encoding in ("utf-8-sig", "gb18030", "big5"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("unknown", data, 0, 1, "cannot decode source")


def parse_subtlex(zip_path: Path) -> dict[str, float]:
    with zipfile.ZipFile(zip_path) as archive:
        member = next(name for name in archive.namelist() if name.endswith("SUBTLEX-CH-WF"))
        text = decode_bytes(archive.read(member))
    values: dict[str, float] = {}
    reader = csv.reader(text.splitlines(), delimiter="\t")
    for row in reader:
        if not row or row[0].strip() in {"Word", ""} or row[0].startswith('"Total') or row[0].startswith('"Context'):
            continue
        try:
            values[row[0].strip()] = float(row[1].strip())
        except (IndexError, ValueError):
            continue
    return values


def rank_map(values: dict[str, float]) -> dict[str, float]:
    ordered = sorted(values.items(), key=lambda item: (-item[1], item[0]))
    result: dict[str, float] = {}
    index = 0
    while index < len(ordered):
        end = index + 1
        while end < len(ordered) and ordered[end][1] == ordered[index][1]:
            end += 1
        rank = (index + 1 + end) / 2
        for text, _ in ordered[index:end]:
            result[text] = rank
        index = end
    return result


def spearman(pairs: list[tuple[float, float]]) -> float | None:
    if len(pairs) < 2:
        return None
    xs = [pair[0] for pair in pairs]
    ys = [pair[1] for pair in pairs]
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in pairs)
    denom_x = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    denom_y = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    return numerator / (denom_x * denom_y) if denom_x and denom_y else None


def percentile_rank(rank: float, total: int) -> float:
    return rank / total if total else 1.0


def write_tsv(path: Path, rows: list[dict]) -> None:
    fields = ["source", "text", "external_value", "external_rank", "sbzr_max_weight", "sbzr_rank", "sbzr_code_count", "external_bucket", "sbzr_bucket", "direction"]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    default_root = Path(__file__).resolve().parents[1]
    parser.add_argument("--root", type=Path, default=default_root)
    parser.add_argument("--out-dir", type=Path, default=None)
    parser.add_argument("--cache-dir", type=Path, default=None)
    parser.add_argument("--no-fetch", action="store_true", help="use files already in --cache-dir")
    args = parser.parse_args()
    root = args.root.resolve()
    out_dir = (args.out_dir or root / "analysis" / "wordfreq-external").resolve()
    cache_dir = (args.cache_dir or Path(tempfile.gettempdir()) / "sbzr-wordfreq-external-cache").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.no_fetch:
        source_paths = {"SUBTLEX-CH": cache_dir / "subtlex-ch-s1.zip", "Rime essay": cache_dir / "rime-essay.txt", "CppJieba": cache_dir / "cppjieba-jieba.dict.utf8"}
        for path in source_paths.values():
            if not path.exists():
                raise SystemExit(f"missing cached source: {path}")
        manifests = [{"name": name, "path": str(path), "sha256": sha256(path), "bytes": path.stat().st_size} for name, path in source_paths.items()]
    else:
        subtlex, sm = fetch(SUBTLEX_URL, cache_dir, "subtlex-ch-s1.zip")
        rime, rm = fetch(RIME_ESSAY_URL, cache_dir, "rime-essay.txt")
        jieba, jm = fetch(CPPJIEBA_URL, cache_dir, "cppjieba-jieba.dict.utf8")
        source_paths = {"SUBTLEX-CH": subtlex, "Rime essay": rime, "CppJieba": jieba}
        manifests = [{"name": "SUBTLEX-CH", **sm}, {"name": "Rime essay", **rm}, {"name": "CppJieba", **jm}]

    sbzr_best, sbzr_codes, sbzr_rows = load_sbzr(root)
    external = {
        "SUBTLEX-CH": parse_subtlex(source_paths["SUBTLEX-CH"]),
        "Rime essay": parse_rime_essay(source_paths["Rime essay"]),
        "CppJieba": parse_cppjieba(source_paths["CppJieba"]),
    }
    sbzr_rank = rank_map(sbzr_best)
    all_rows: list[dict] = []
    metrics: dict[str, dict] = {}
    dry_run: list[dict] = []
    for source, values in external.items():
        ext_rank = rank_map(values)
        overlap = sorted(set(values) & set(sbzr_best))
        pairs = [(ext_rank[text], sbzr_rank[text]) for text in overlap]
        ext_total = len(values)
        overlap_rows: list[dict] = []
        for text in overlap:
            er = percentile_rank(ext_rank[text], ext_total)
            sr = percentile_rank(sbzr_rank[text], len(sbzr_best))
            ext_bucket = min(10, int(er * 10) + 1)
            sbzr_bucket = min(10, int(sr * 10) + 1)
            if ext_bucket <= 3 and sbzr_bucket >= 8:
                direction = "external_high_sbzr_low"
            elif ext_bucket >= 8 and sbzr_bucket <= 3:
                direction = "external_low_sbzr_high"
            else:
                direction = "aligned_or_middle"
            row = {"source": source, "text": text, "external_value": values[text], "external_rank": ext_rank[text], "sbzr_max_weight": sbzr_best[text], "sbzr_rank": sbzr_rank[text], "sbzr_code_count": len(sbzr_codes[text]), "external_bucket": ext_bucket, "sbzr_bucket": sbzr_bucket, "direction": direction}
            overlap_rows.append(row)
            all_rows.append(row)
        high_existing = sorted(overlap, key=lambda text: (ext_rank[text], text))[:100]
        for text in high_existing:
            dry_run.append({"source": source, "text": text, "external_value": values[text], "reason": "licensed-source-high-frequency-existing-SBZR-codes", "code": ";".join(sorted(sbzr_codes[text])), "status": "review_only_existing_codes"})
        high_missing = sorted((text for text in set(values) - set(sbzr_best)), key=lambda text: (-values[text], text))[:100]
        for text in high_missing[:50]:
            dry_run.append({"source": source, "text": text, "external_value": values[text], "reason": "licensed-source-high-frequency-but-absent-from-SBZR", "code": "", "status": "review_only_no_code"})
        external_high = sum(row["direction"] == "external_high_sbzr_low" for row in overlap_rows)
        external_low = sum(row["direction"] == "external_low_sbzr_high" for row in overlap_rows)
        metrics[source] = {"external_entries": ext_total, "sbzr_unique_text": len(sbzr_best), "sbzr_rows_scanned": sbzr_rows, "overlap": len(overlap), "coverage_of_external": len(overlap) / ext_total if ext_total else None, "coverage_of_sbzr": len(overlap) / len(sbzr_best) if sbzr_best else None, "spearman_rank": spearman(pairs), "external_high_sbzr_low": external_high, "external_low_sbzr_high": external_low, "multi_code_overlap": sum(len(sbzr_codes[text]) > 1 for text in overlap)}

    write_tsv(out_dir / "external_comparison.tsv", all_rows)
    with (out_dir / "dry_run_candidates.tsv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["source", "text", "external_value", "reason", "code", "status"], delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows(dry_run)
    manifest = {"generated_utc": datetime.now(timezone.utc).isoformat(), "root": str(root), "sbzr_rows_scanned": sbzr_rows, "sbzr_unique_text": len(sbzr_best), "sources": manifests, "source_urls": {"SUBTLEX-CH": SUBTLEX_URL, "Rime essay": RIME_ESSAY_URL, "CppJieba": CPPJIEBA_URL}, "excluded": ["Sogou/SCEL: no numerical use because redistribution terms are unclear", "sbzr.userdb*.dict.yaml", "LevelDb", "private dynamic frequency"]}
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out_dir / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"out_dir": str(out_dir), "sbzr_rows": sbzr_rows, "sbzr_unique_text": len(sbzr_best), "metrics": metrics, "dry_run_candidates": len(dry_run)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
