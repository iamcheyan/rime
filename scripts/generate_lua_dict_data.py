#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_lua_dict_data.py — 预编译生成纯 Lua 高性能词典数据模块 (lua/sbzr_dict_data.lua)

优化:
1. 单字权重严格以 sbzr.len1.dict.yaml 为准 (确保「看」45022 绝对优先于「刊」28100)。
2. 多字词组优先于单字。
3. 输出纯 Lua 表结构，秒速加载，0 运行时开销。
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICTS_DIR = ROOT / "sbzr.chrome.extension" / "dicts"
OUT_FILE = ROOT / "lua" / "sbzr_dict_data.lua"


def generate_lua_dict():
    single_chars: dict[str, tuple[str, int]] = {}
    words: dict[str, tuple[str, int]] = {}

    # 1. 常用单字 (sbzr.len1.dict.yaml，按真实字频映射)
    p_len1 = DICTS_DIR / "sbzr.len1.dict.yaml"
    if p_len1.exists():
        for line in p_len1.read_text(encoding="utf-8").splitlines():
            if "\t" in line and not line.startswith("#"):
                parts = line.split("\t")
                if len(parts) >= 3:
                    text, code, w = parts[0].strip(), parts[1].strip(), int(parts[2].strip())
                    if code not in single_chars or w > single_chars[code][1]:
                        single_chars[code] = (text, w)

    # 2. 基础词库与快捷词 (>= 2 字词)
    source_files = [
        "sbzr.shortcut.dict.yaml",
        "sbzr.common-frequency.dict.yaml",
        "base.dict.yaml",
        "sbzr.full.dict.yaml",
    ]

    for name in source_files:
        p = DICTS_DIR / name
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                if "\t" in line and not line.startswith("#"):
                    parts = line.split("\t")
                    if len(parts) >= 3:
                        text, code, w = parts[0].strip(), parts[1].strip(), int(parts[2].strip())
                        # 仅处理 2~4 字词
                        if 2 <= len(text) <= 4:
                            if len(code) == 4 or len(code) == len(text) * 2:
                                if code not in words or w > words[code][1]:
                                    words[code] = (text, w)

    # 合并单字与多字词 (词组编码覆盖同码单字)
    combined: dict[str, tuple[str, int]] = {}
    for code, item in single_chars.items():
        combined[code] = item
    for code, item in words.items():
        combined[code] = item

    lua_lines = [
        "-- sbzr_dict_data.lua — 预编译高性能词典索引",
        "local M = {",
    ]

    for code, (text, w) in sorted(combined.items()):
        clean_text = text.replace("\\", "\\\\").replace('"', '\\"')
        lua_lines.append(f'  ["{code}"] = "{clean_text}",')

    lua_lines.append("}")
    lua_lines.append("return M\n")

    OUT_FILE.write_text("\n".join(lua_lines), encoding="utf-8")
    print(f"✓ 成功预编译生成 Lua 词典: {len(combined)} 条索引 -> {OUT_FILE.relative_to(ROOT)}")
    return len(combined)


if __name__ == "__main__":
    generate_lua_dict()
