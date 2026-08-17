#!/usr/bin/env python3
"""duoyin 词库 多音字主音一致性抽查（dict-optimize goal 第 5 步）。

规则依据 AGENTS.md §7（编码真理来源）:
  所有单字的两码双拼编码必须遵循 resource/常用字双拼拼音.db 中的
  最高权重读音（"权重主音"）。

duoyin 词库的定位 = 词中某字使用【非默认读音】时的全编码词组表
  （每音节两码，如 这样的 zeyhde = ze-yh-de）。因此:
  - 词内音节用非主音 → 合理（这正是 duoyin 的功能），仅计数;
  - 词内音节在 DB 中完全无依据（该字无此读音）→ 编码嫌疑，列出;
  - 同词在 base 中存在且编码不同 → 与 base 的多音冲突，列出。

按任务要求: 抽 100 条，仅列出不一致项，【不做任何修改】。
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DICTS = REPO / "sbzr.chrome.extension" / "dicts"
DUOYIN = DICTS / "sbzr.extended.duoyin.dict.yaml"
BASE = DICTS / "base.dict.yaml"
DB = REPO / "resource" / "常用字双拼拼音.db"
OUT = REPO / "review" / "optimize_duoyin_check.txt"

SAMPLE = 100


def load_db() -> dict[str, dict[str, int]]:
    """char -> {code: weight}"""
    m: dict[str, dict[str, int]] = {}
    for line in DB.read_text(encoding="utf-8").splitlines():
        cols = line.split("\t")
        if len(cols) != 3:
            continue
        char, code, w = cols[0], cols[1], int(cols[2])
        m.setdefault(char, {})[code] = w
    return m


def load_dict(path: Path) -> list[tuple[str, str, int]]:
    rows = []
    in_body = False
    for line in path.read_text(encoding="utf-8").splitlines():
        if not in_body:
            if line == "...":
                in_body = True
            continue
        if not line or line.startswith("#"):
            continue
        cols = line.split("\t")
        if len(cols) == 3:
            rows.append((cols[0], cols[1], int(cols[2])))
    return rows


def main() -> int:
    db = load_db()
    duoyin = load_dict(DUOYIN)
    base_words: dict[str, list[tuple[str, int]]] = {}
    for w, c, wt in load_dict(BASE):
        base_words.setdefault(w, []).append((c, wt))

    rng = random.Random(20260817)
    sample = rng.sample(duoyin, SAMPLE)

    no_evidence: list[str] = []   # 音节码在 DB 中无读音依据
    base_conflict: list[str] = [] # 同词在 base 有不同编码
    non_primary = 0               # 使用非主音（duoyin 正常功能）
    primary = 0                   # 全部音节均为主音
    primary_words_nonprimary = 0

    for word, code, wt in sample:
        syls = [code[i : i + 2] for i in range(0, len(code), 2)]
        chars = [c for c in word]
        if len(syls) != len(chars):
            no_evidence.append(f"{word}\t{code}\t音节数({len(syls)})与字数({len(chars)})不符")
            continue
        word_ev = []
        all_primary = True
        for ch, sy in zip(chars, syls):
            readings = db.get(ch)
            if readings is None:
                word_ev.append(f"字[{ch}]不在DB")
                all_primary = False
                continue
            if sy in readings:
                max_code = max(readings, key=readings.get)
                if sy == max_code:
                    word_ev.append(f"[{ch}:{sy}=主音]")
                else:
                    word_ev.append(f"[{ch}:{sy}≠主音{max_code}]")
                    all_primary = False
            else:
                word_ev.append(f"字[{ch}]码[{sy}]无DB读音依据(有:{'/'.join(readings)})")
                all_primary = False
        if all_primary:
            primary += 1
        else:
            primary_words_nonprimary += 1
        # base 同词冲突
        bw = base_words.get(word)
        base_note = ""
        if bw:
            codes = {c for c, _ in bw}
            if code not in codes:
                base_note = f" base另有编码{'/'.join(sorted(codes))}"
                base_conflict.append(f"{word}\t{code}\tbase={sorted(codes)}")
        joined = "".join(x for x in word_ev if "无" in x or "不在" in x or "不符" in x)
        if joined:
            no_evidence.append(f"{word}\t{code}\t{joined}{base_note}")

    lines = [
        f"duoyin 抽查样本: {SAMPLE} / 总词条 {len(duoyin)}",
        f"全音节均为主音的词条: {primary}",
        f"含非主音音节的词条: {primary_words_nonprimary} (duoyin 设计功能, 仅计数)",
        f"与 base 同词不同码冲突: {len(base_conflict)}",
        f"音节码无 DB 读音依据(编码嫌疑): {len(no_evidence)}",
        "",
        "== base 冲突明细 ==",
        *base_conflict,
        "",
        "== 无DB依据明细 ==",
        *no_evidence,
        "",
        "结论: 按 task 要求仅列出, 未做任何修改。",
    ]
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines[:6]))
    print(f"detail -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
