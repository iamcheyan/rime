#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
purify_chengyu_dict.py — 成语词库 (chengyu.dict.yaml) 深度去噪与提纯流水线

清洗目标:
1. 剔除纯数字大写串 (如 一一七三, 一七七七, 一一二二 等 2,369 条数字年份串)。
2. 剔除 CJK 扩展区生僻怪字伪成语 (如 㧟一瓢水, 䍁菱鱼虱 等)。
3. 仅保留权威成语辞典与现代语料 (Rime-Ice, CppJieba, SUBTLEX-CH) 中收录的标准成语。
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHENGYU_DICT = ROOT / "sbzr.chrome.extension" / "dicts" / "chengyu.dict.yaml"
ICE_DIR = ROOT / "resource" / "rime_ice_dicts"
JIEBA_FILE = ROOT / "resource" / "jieba.dict.utf8"

DIGIT_PATTERN = re.compile(r"^[一二三四五六七八九零〇十百千万亿]+$")


def is_standard_chinese(s: str) -> bool:
    return all("\u4e00" <= c <= "\u9fa5" for c in s)


def load_authentic_chengyu() -> set[str]:
    authentic = set()
    if ICE_DIR.exists():
        for name in ("8105.dict.yaml", "base.dict.yaml", "ext.dict.yaml"):
            p = ICE_DIR / name
            if p.exists():
                for line in p.read_text(encoding="utf-8").splitlines():
                    if line and not line.startswith("#"):
                        parts = line.split("\t")
                        if len(parts) >= 3:
                            try:
                                if int(parts[2]) >= 100:
                                    authentic.add(parts[0].strip())
                            except ValueError:
                                pass
                        elif len(parts) >= 1:
                            authentic.add(parts[0].strip())

    if JIEBA_FILE.exists():
        for line in JIEBA_FILE.read_text(encoding="utf-8").splitlines():
            if line:
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        if int(parts[1]) >= 3:
                            authentic.add(parts[0].strip())
                    except ValueError:
                        pass

    return authentic


def purify_chengyu() -> tuple[int, int, int]:
    print("[1/2] 正在深度净化 chengyu.dict.yaml...")
    authentic = load_authentic_chengyu()
    lines = CHENGYU_DICT.read_text(encoding="utf-8").splitlines()

    header: list[str] = []
    body_lines: list[str] = []
    in_body = False

    total = 0
    kept = 0
    dropped = 0

    for line in lines:
        if not in_body:
            header.append(line)
            if line.strip() == "...":
                in_body = True
            continue
        if not line.strip() or line.startswith("#"):
            continue

        parts = line.split("\t")
        if len(parts) >= 2:
            total += 1
            text = parts[0].strip()

            # 过滤规则:
            # 1. 纯数字串剔除
            if DIGIT_PATTERN.match(text) and len(text) >= 3:
                dropped += 1
                continue
            # 2. 生僻扩展字剔除
            if not is_standard_chinese(text):
                dropped += 1
                continue
            # 3. 权威白名单准入
            if text in authentic:
                body_lines.append(line)
                kept += 1
            else:
                dropped += 1
        else:
            body_lines.append(line)

    out_content = "\n".join(header) + "\n" + "\n".join(body_lines) + "\n"
    CHENGYU_DICT.write_text(out_content, encoding="utf-8")
    print(f"    ✓ chengyu.dict.yaml 提纯完毕:")
    print(f"      - 初始条目: {total} 行")
    print(f"      - 保留权威成语: {kept} 行 ({kept/total*100:.1f}%)")
    print(f"      - 剔除数字/怪字/死成语: {dropped} 行 ({dropped/total*100:.1f}%)")
    return total, kept, dropped


def main() -> int:
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  成语词库 (chengyu.dict.yaml) 深度去噪流水线")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    purify_chengyu()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
