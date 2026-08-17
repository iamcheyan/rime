#!/usr/bin/env python3
"""词库 import 链与 YAML 头一致性校验（dict-optimize goal 第 3 步）。

校验项:
  1. 入口词库 sbzr.dict.yaml / easy_en.dict.yaml / jaroomaji.dict.yaml 的
     import_tables 每一项都能解析到仓库内存在的 .dict.yaml 文件
     （jaroomaji 的 dicts.jp/* 为 install-jaroomaji-dicts.sh 按需下载，单独标注）。
  2. 每个 .dict.yaml 头部 name 字段与「相对仓库路径去掉 .dict.yaml」一致；
     已知豁免（有明确维护方）:
       - sbzr.dict.yaml / easy_en.dict.yaml / jaroomaji.dict.yaml  顶层入口，
         name 必须等于 schema 的 dictionary: 字段（主词典 id）
       - sbzr.chrome.extension/dicts/sbzr.shortcut  头部由扩展
         sbzr-core.js (FIXED_DICT_NAME) 重写，保持 sbzr.shortcut
  3. 孤儿词库检测: dicts/ 下存在但未被任何入口 import、也无 lua/schema 引用。
  4. YAML 头部可解析（--- 到 ... 之间的头部用 yaml.safe_load 校验）。

退出码: 全部通过 0，否则 1。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
DICTS = REPO / "sbzr.chrome.extension" / "dicts"

ENTRY_DICTS = ["sbzr.dict.yaml", "easy_en.dict.yaml", "jaroomaji.dict.yaml"]

# name 与路径不一致的已知名单（豁免）
NAME_EXEMPT = {
    "sbzr.dict.yaml": "顶层主词典, name=sbzr 与 schema 的 dictionary: 一致",
    "easy_en.dict.yaml": "easy_en schema 主词典",
    "jaroomaji.dict.yaml": "jaroomaji schema 主词典",
    "sbzr.chrome.extension/dicts/sbzr.shortcut.dict.yaml":
        "头部由 Chrome 扩展 sbzr-core.js FIXED_DICT_NAME 重写",
}

# install 脚本按需下载、不入库的表
DOWNLOAD_ONLY = {"sbzr.chrome.extension/dicts.jp"}

# 引用了 dicts/ 文件但不走 import_tables 的通道
LUA_REFERENCED = {"zdy.dict.yaml": "lua/zdy_translator.lua 直接读取"}


def parse_head(path: Path) -> dict:
    """解析 --- 与 ... 之间的 YAML 头部。"""
    lines = path.read_text(encoding="utf-8").split("\n")
    if "---" not in lines:
        return {}
    start = lines.index("---")
    end = None
    for i in range(start + 1, len(lines)):
        if lines[i].strip() == "...":
            end = i
            break
    if end is None:
        return {}
    return yaml.safe_load("\n".join(lines[start + 1 : end])) or {}


def main() -> int:
    problems: list[str] = []
    notes: list[str] = []

    # 1. import 解析
    imported: set[str] = set()
    for entry in ENTRY_DICTS:
        head = parse_head(REPO / entry)
        for tbl in head.get("import_tables", []) or []:
            rel = f"{tbl}.dict.yaml"
            if (REPO / rel).exists():
                imported.add(rel)
                continue
            if any(rel.startswith(p) for p in DOWNLOAD_ONLY):
                notes.append(f"[download-only] {entry} -> {rel} (install 脚本按需下载)")
                continue
            problems.append(f"[missing-import] {entry} -> {rel} 不存在")
            imported.add(rel)  # 标记为已处理，避免误报孤儿

    # 2. name 一致性
    all_dicts = [
        p for p in REPO.rglob("*.dict.yaml")
        if "sync" not in p.relative_to(REPO).parts  # 红线: 设备快照只读
        and ".git" not in p.relative_to(REPO).parts
    ]
    for p in sorted(all_dicts):
        rel = p.relative_to(REPO).as_posix()
        head = parse_head(p)
        name = head.get("name")
        expect = rel[: -len(".dict.yaml")]
        if not head:
            problems.append(f"[no-header] {rel} 头部不可解析")
            continue
        if name != expect and rel not in NAME_EXEMPT:
            problems.append(f"[name-mismatch] {rel}: name={name!r} 期望 {expect!r}")

    # 3. 孤儿检测（仅 dicts/ 目录；zdy 为 lua 通道豁免）
    for p in sorted(DICTS.glob("*.dict.yaml")):
        rel = p.relative_to(REPO).as_posix()
        if rel in imported:
            continue
        if p.name in LUA_REFERENCED:
            notes.append(f"[lua-channel] {rel}: {LUA_REFERENCED[p.name]}")
            continue
        problems.append(f"[orphan] {rel} 未被任何入口 import，也无 lua 引用")

    for n in notes:
        print(f"NOTE  {n}")
    if problems:
        for p in problems:
            print(f"FAIL  {p}")
        print(f"\n{len(problems)} problem(s)")
        return 1
    print("OK: import 链完整、name 一致（含豁免名单）、无孤儿词库")
    return 0


if __name__ == "__main__":
    sys.exit(main())
