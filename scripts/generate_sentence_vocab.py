#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_sentence_vocab.py — 动态组句引擎核心词表 (sentence_vocab.txt) 生成脚本

功能:
1. 整合 1~4 字核心成词 (单字、双字词、3字词、4字词) 的标准双拼编码与权重。
2. 确保高频词 (如「很」hf 400万) 绝对优先于低频字 (如「痕」hf 3.6万)。
3. 输出紧凑高效的 lua/sentence_vocab.txt，供 sentence_translator.lua 毫秒级极速加载。
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICTS_DIR = ROOT / "sbzr.chrome.extension" / "dicts"
OUT_FILE = ROOT / "lua" / "sentence_vocab.txt"


def generate_sentence_vocab() -> int:
    vocab: dict[str, tuple[str, int]] = {}

    # 1. 全部常用单字 (3653字)
    p_len1 = DICTS_DIR / "sbzr.len1.dict.yaml"
    if p_len1.exists():
        for line in p_len1.read_text(encoding="utf-8").splitlines():
            if "\t" in line and not line.startswith("#"):
                parts = line.split("\t")
                if len(parts) >= 3:
                    text, code, w = parts[0].strip(), parts[1].strip(), int(parts[2].strip())
                    if code not in vocab or w > vocab[code][1]:
                        vocab[code] = (text, w)

    # 2. 快捷词与高频词 (2.8万词)
    for name in ("sbzr.shortcut.dict.yaml", "sbzr.common-frequency.dict.yaml"):
        p = DICTS_DIR / name
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                if "\t" in line and not line.startswith("#"):
                    parts = line.split("\t")
                    if len(parts) >= 3:
                        text, code, w = parts[0].strip(), parts[1].strip(), int(parts[2].strip())
                        if len(text) <= 4 and len(code) == len(text) * 2:
                            if code not in vocab or w > vocab[code][1]:
                                vocab[code] = (text, w)

    # 3. 基础词库 (base.dict.yaml 中 1~4 字词)
    p_base = DICTS_DIR / "base.dict.yaml"
    if p_base.exists():
        for line in p_base.read_text(encoding="utf-8").splitlines():
            if "\t" in line and not line.startswith("#"):
                parts = line.split("\t")
                if len(parts) >= 3:
                    text, code, w = parts[0].strip(), parts[1].strip(), int(parts[2].strip())
                    if len(text) <= 4 and len(code) == len(text) * 2:
                        if code not in vocab or w > vocab[code][1]:
                            vocab[code] = (text, w)

    # 4. 全双拼 3~4 字词库 (sbzr.full.dict.yaml)
    p_full = DICTS_DIR / "sbzr.full.dict.yaml"
    if p_full.exists():
        for line in p_full.read_text(encoding="utf-8").splitlines():
            if "\t" in line and not line.startswith("#"):
                parts = line.split("\t")
                if len(parts) >= 3:
                    text, code, w = parts[0].strip(), parts[1].strip(), int(parts[2].strip())
                    if len(code) in (6, 8):
                        if code not in vocab or w > vocab[code][1]:
                            vocab[code] = (text, w)

    # 排序并输出
    sorted_items = sorted(vocab.items(), key=lambda x: (-x[1][1], x[0]))
    out_lines = [f"{code}\t{text}\t{w}" for code, (text, w) in sorted_items]
    OUT_FILE.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    print(f"✓ 成功生成动态组句核心索引: {len(vocab)} 条条目 -> {OUT_FILE.relative_to(ROOT)}")
    return len(vocab)


if __name__ == "__main__":
    generate_sentence_vocab()
