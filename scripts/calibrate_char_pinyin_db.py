#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
calibrate_char_pinyin_db.py — 常用字双拼拼音真理字表 (3653字) 全量权威校准流水线

标杆来源:
- 国家《通用规范汉字表》8105 字表 (25亿字真实语料字频) -> resource/rime_ice_dicts/8105.dict.yaml
- 将所有多音字因历史错误录入为 1 权重古音/佛音 (如 南->na, 晚->wi, 校->jc, 期->ji, 提->di, 强->jd, 说->sv, 读->db, 无->mo)
  全部系统性纠偏为全国通用规范最高频主读音！
"""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from gen_sbzr_dict import syllable_to_pair

CHAR_DB = ROOT / "resource" / "常用字双拼拼音.db"
P8105 = ROOT / "resource" / "rime_ice_dicts" / "8105.dict.yaml"


def load_8105_primary_readings() -> dict[str, tuple[str, str, int]]:
    """加载 8105 规范字表中每个字的最高频主读音及其声笔自然双拼编码。"""
    char_weights = defaultdict(list)
    in_body = False
    for line in P8105.read_text(encoding="utf-8").splitlines():
        if line.strip() == "...":
            in_body = True
            continue
        if not in_body or not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 3 and len(parts[0].strip()) == 1:
            char = parts[0].strip()
            pinyin = parts[1].strip()
            w = int(parts[2].strip())
            char_weights[char].append((pinyin, w))

    result = {}
    for char, py_list in char_weights.items():
        # 按真实语料权重降序，首个为主音
        py_list.sort(key=lambda x: -x[1])
        prim_py, weight = py_list[0]
        pair = syllable_to_pair(prim_py)
        if pair:
            code = pair[0] + pair[1]
            result[char] = (prim_py, code, weight)

    return result


def calibrate_char_db() -> int:
    print("[1/2] 加载 8105 规范字表 25 亿语料主读音真理库...")
    primary_map = load_8105_primary_readings()
    print(f"    8105 规范字库覆盖: {len(primary_map)} 规范字")

    print("[2/2] 系统性核对并纠偏 resource/常用字双拼拼音.db...")
    lines = CHAR_DB.read_text(encoding="utf-8").splitlines()
    new_lines = []
    corrected_count = 0
    corrections = []

    for line in lines:
        if not line.strip() or line.startswith("#"):
            new_lines.append(line)
            continue

        parts = line.split("\t")
        if len(parts) >= 2:
            char = parts[0].strip()
            current_code = parts[1].strip()
            freq_str = parts[2].strip() if len(parts) >= 3 else "10000"

            if char in primary_map:
                prim_py, expected_code, weight = primary_map[char]
                if current_code != expected_code:
                    corrected_count += 1
                    corrections.append((char, current_code, expected_code, prim_py))
                    # 更新为规范最高频双拼编码
                    new_lines.append(f"{char}\t{expected_code}\t{freq_str}")
                    continue

            new_lines.append(line)
        else:
            new_lines.append(line)

    CHAR_DB.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    print(f"    ✓ 校准完毕: 成功纠正 {corrected_count} 个多音字/冷门古音编码！")
    print("\n    典型纠偏示例 (前 20 项):")
    for char, old_c, new_c, prim_py in corrections[:20]:
        print(f"      • 【{char}】: {old_c:4s} ➔ {new_c:4s} (主音: {prim_py})")

    return corrected_count


def main() -> int:
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  常用字双拼拼音真理字表 (3653字) 全量权威校准")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    calibrate_char_db()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
