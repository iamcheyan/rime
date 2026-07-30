#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_sbzr_dict.py — 把 rime-ice（雾凇拼音）全拼词库转成声笔自然(sbzr)编码词库。

输入: rime-ice cn_dicts/*.dict.yaml  (格式: 词条\t拼音(空格分隔音节)\t权重)
输出: sbzr 编码词库  (格式: 词条\t编码\t权重)

编码规则 (声笔自然):
  声母: zh/ch/sh -> z/c/s; bpmfdtnlgkhjqxrzcsyw -> 本身; 元音起首(a/e/o 或 er) -> v (零声母)
  韵母: 见 FINAL_MAP (按 rime-ice 韵母整串匹配; ü 写作 v, j/q/x/y 后的 ü 写作 u)
  词组公式:
    1字 -> 声韵 (2码)
    2字 -> 声1韵1声2韵2
    3字 -> 声1声2声3韵3
    4字+ -> 声1声2声3末字声
"""
import sys
import re
from pathlib import Path

# ---------------------------------------------------------------------------
# 声母 / 韵母 映射 (已对 resource/常用字双拼拼音.db 3653 字逐一校准)
# ---------------------------------------------------------------------------
# 韵母: rime-ice 写法 -> 双拼键。整串精确匹配, 无前缀歧义(声母已剥离)。
FINAL_MAP = {
    # 三韵母
    "iong": "s", "iang": "d", "uang": "d", "ueng": "g",
    "uai": "y", "ian": "m", "iao": "c", "ing": "y",
    # 两韵母
    "ong": "s", "ang": "h", "eng": "g", "van": "r",
    "uan": "r", "ue": "t", "ve": "t", "vn": "p",
    "un": "p", "er": "r", "iu": "q", "ie": "x",
    "ua": "w", "ia": "w", "ui": "v", "uo": "o",
    "ei": "z", "ai": "l", "ao": "k", "ou": "b",
    "an": "j", "en": "f", "in": "n",
    # 单韵母
    "o": "o", "e": "e", "a": "a", "i": "i", "u": "u", "v": "v",
}

# 2字母声母(长前缀优先)
SHENG_TWO = {"zh": "z", "ch": "c", "sh": "s"}
# 1字母声母
SHENG_ONE = set("bpmfdtnlgkhjqxrzcsyw")


def syllable_to_pair(syl: str):
    """单音节 -> (声母key, 韵母key)。无法识别返回 None。"""
    s = syl.lower()
    # 声母剥离
    if s[:2] in SHENG_TWO:
        sm, rest = SHENG_TWO[s[:2]], s[2:]
    elif s and s[0] in SHENG_ONE:
        sm, rest = s[0], s[1:]
    else:
        # 元音起首 / er / 零声母
        sm, rest = "v", s
    if not rest:
        # 纯声母音节(理论上不该出现), 韵母按空处理 -> 跳过
        return None
    ym = FINAL_MAP.get(rest)
    if ym is None:
        return None
    return sm, ym


def word_to_code(pinyin: str):
    """词条拼音(空格分隔音节) -> sbzr 编码, 失败返回 None。"""
    syls = pinyin.split()
    pairs = [syllable_to_pair(s) for s in syls]
    if None in pairs or len(pairs) != len(syls):
        return None
    n = len(pairs)
    if n == 0:
        return None
    if n == 1:
        sm, ym = pairs[0]
        return sm + ym
    if n == 2:
        return pairs[0][0] + pairs[0][1] + pairs[1][0] + pairs[1][1]
    if n == 3:
        return pairs[0][0] + pairs[1][0] + pairs[2][0] + pairs[2][1]
    # 4+
    return pairs[0][0] + pairs[1][0] + pairs[2][0] + pairs[-1][0]




# rime-ice dict 解析
# 支持 3 种行格式:
#   text\tpinyin\tweight   (base/ext/8105)
#   text\tpinyin           (others/41448, 无权重)
#   text\tweight           (tencent, 无拼音 -> 用 pypinyin 补音)
ENTRY_RE3 = re.compile(r"^(\S+)\t([a-z][a-z ]*)\t(\d+)$")
ENTRY_RE_PIN = re.compile(r"^(\S+)\t([a-z][a-z ]*)$")      # text\tpinyin
ENTRY_RE_W = re.compile(r"^(\S+)\t(\d+)$")                 # text\tweight
DEFAULT_WEIGHT = 100


def pypinyin_text(text: str):
    """用 pypinyin 给无拼音词补音, 返回空格分隔的小写无声调拼音(ü->v)。失败返回 None。"""
    try:
        from pypinyin import pinyin, Style
    except Exception:
        return None
    out = []
    for ch in text:
        ps = pinyin(ch, style=Style.NORMAL, errors="default")
        if not ps or not ps[0] or ps[0][0] in ("",):
            return None
        s = ps[0][0]
        # ü 规范化为 v (与 rime-ice 一致)
        s = s.replace("ü", "v")
        out.append(s)
    if not out:
        return None
    return " ".join(out)


def parse_rimeice(path: Path):
    """yield (text, pinyin_or_None, weight) for body entries."""
    in_body = False
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not in_body:
                if line.strip() == "...":
                    in_body = True
                continue
            if not line or line.startswith("#"):
                continue
            m = ENTRY_RE3.match(line)
            if m:
                yield m.group(1), m.group(2).strip(), int(m.group(3)); continue
            m = ENTRY_RE_W.match(line)
            if m:
                yield m.group(1), None, int(m.group(2)); continue       # tencent: 无拼音
            m = ENTRY_RE_PIN.match(line)
            if m:
                yield m.group(1), m.group(2).strip(), DEFAULT_WEIGHT; continue
            # 其它格式忽略



# ---------------------------------------------------------------------------
# 现有词库 text 集合 (用于按 text 去重)
# ---------------------------------------------------------------------------
EXIST_TEXT_RE = re.compile(r"^(\S+)\t(\S+)")


def load_existing_texts(dicts_dir: Path):
    texts = set()
    for p in sorted(dicts_dir.glob("*.dict.yaml")):
        if p.name == "sbzr.rimeice.dict.yaml":
            continue  # 跳过本生成器自己的输出, 避免重复运行时误判为"已有"
        in_body = False
        with open(p, encoding="utf-8") as f:
            for line in f:
                line = line.rstrip("\n")
                if not in_body:
                    if line.strip() == "...":
                        in_body = True
                    continue
                if not line or line.startswith("#"):
                    continue
                m = EXIST_TEXT_RE.match(line)
                if m:
                    texts.add(m.group(1))
    return texts


# ---------------------------------------------------------------------------
def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--rime-ice", default="/tmp/rime-ice/cn_dicts",
                    help="rime-ice cn_dicts 目录")
    ap.add_argument("--dicts-dir", default=None,
                    help="现有 sbzr 词库目录(用于去重), 默认 ../sbzr.chrome.extension/dicts")
    ap.add_argument("--out", default=None, help="输出文件路径")
    ap.add_argument("--sources", nargs="*",
                    default=["base.dict.yaml", "ext.dict.yaml",
                             "tencent.dict.yaml", "others.dict.yaml",
                             "41448.dict.yaml"],
                    help="要转换的 rime-ice 文件名")
    ap.add_argument("--min-weight", type=int, default=0,
                    help="只保留 rime-ice 权重 >= 此值的条目")
    args = ap.parse_args()

    ice_dir = Path(args.rime_ice)
    script_dir = Path(__file__).resolve().parent
    dicts_dir = Path(args.dicts_dir) if args.dicts_dir else (
        script_dir.parent / "sbzr.chrome.extension" / "dicts")
    out_path = Path(args.out) if args.out else (
        dicts_dir / "sbzr.rimeice.dict.yaml")

    print(f"[1] 加载现有词库 text 集合: {dicts_dir}")
    exist = load_existing_texts(dicts_dir)
    print(f"    现有词条数: {len(exist)}")

    print(f"[2] 转换 rime-ice -> sbzr 编码")
    seen = set()          # 本批去重 (text+code)
    rows = []             # (text, code, weight)
    n_in = n_skip_dup = n_skip_exist = n_skip_enc = 0
    for name in args.sources:
        p = ice_dir / name
        if not p.exists():
            print(f"    跳过(不存在): {name}")
            continue
        c_in = c_dup = c_exist = c_enc = c_ok = 0
        for text, pinyin, w in parse_rimeice(p):
            c_in += 1
            if w < args.min_weight:
                continue
            if pinyin is None:
                pinyin = pypinyin_text(text)
                if pinyin is None:
                    c_enc += 1; continue
            code = word_to_code(pinyin)
            if code is None:
                c_enc += 1
                continue
            key = (text, code)
            if key in seen:
                c_dup += 1
                continue
            if text in exist:
                c_exist += 1
                continue
            seen.add(key)
            rows.append((text, code, w))
            c_ok += 1
        n_in += c_in
        n_skip_dup += c_dup
        n_skip_exist += c_exist
        n_skip_enc += c_enc
        print(f"    {name}: 读 {c_in} 新增 {c_ok} 已有text {c_exist} 本批重复 {c_dup} 编码失败 {c_enc}")

    print(f"    合计: 读 {n_in}  新增 {len(rows)}  已有text跳过 {n_skip_exist}  "
          f"本批重复 {n_skip_dup}  编码失败 {n_skip_enc}")

    # 按权重降序写
    rows.sort(key=lambda r: -r[2])
    print(f"[3] 写出: {out_path}")
    header = (
        "# Rime dictionary\n# encoding: utf-8\n#\n"
        "# 由 scripts/gen_sbzr_dict.py 从 rime-ice (雾凇拼音) 自动生成。\n"
        "# 编码: 声笔自然双拼 (自然码双拼 + 平翘合并 + 零声母v)。\n"
        "# 公式: 2字=声1韵1声2韵2 / 3字=声1声2声3韵3 / 4字+=声1声2声3末字声。\n"
        "---\n"
        f"name: sbzr.chrome.extension/dicts/sbzr.rimeice\n"
        "version: \"1.0\"\nsort: by_weight\nuse_preset_vocabulary: false\ncolumns:\n"
        "  - text\n  - code\n  - weight\n...\n\n"
    )
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(header)
        for text, code, w in rows:
            f.write(f"{text}\t{code}\t{w}\n")
    print(f"    写出 {len(rows)} 条 -> {out_path}")
    print("完成。下一步: 在 sbzr.dict.yaml import_tables 加 - sbzr.chrome.extension/dicts/sbzr.rimeice，"
          "然后 reweight + rebuild。")


if __name__ == "__main__":
    main()