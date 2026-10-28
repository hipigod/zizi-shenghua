# -*- coding: utf-8 -*-
"""给 data.js 的 62 个字注入 strokes（规范简化字形笔画数）。
笔画数按部件拆分交叉验证（如 棵=木4+果8=12）。
用法：python tools/inject_strokes.py（直接改写 data.js，幂等：已有 strokes 则跳过）"""
import io
import re
import sys

STROKES = {
    # 草木之间 13
    "林": 8, "森": 12, "本": 5, "末": 5, "未": 5, "休": 6, "困": 7,
    "呆": 7, "杏": 7, "果": 8, "棵": 12, "枯": 9, "焚": 12,
    # 日月星辰 9
    "明": 8, "昌": 8, "晶": 12, "旦": 5, "杲": 8, "杳": 8, "朋": 8,
    "早": 6, "是": 9,
    # 人来人往 14
    "从": 4, "众": 6, "囚": 5, "吕": 6, "回": 6, "品": 9, "闪": 5,
    "问": 6, "间": 7, "闷": 7, "闲": 7, "坐": 7, "加": 5, "吐": 6,
    # 水火之间 15
    "炎": 8, "焱": 12, "燚": 16, "沝": 8, "淼": 12, "淡": 11, "泪": 8,
    "灭": 5, "因": 6, "尖": 6, "歪": 9, "天": 4, "夫": 4, "男": 7,
    "思": 9,
    # 品物流形 11
    "古": 5, "胡": 9, "湖": 12, "甲": 5, "由": 5, "申": 5, "相": 9,
    "想": 13, "尘": 6, "灶": 7, "里": 7,
}

PATH = "data.js"
src = io.open(PATH, encoding="utf-8").read()

# 定位 chars 段：chars 在 partInfo 之后（文件实际顺序 lines→parts→partInfo→chars→recipes）
cs = src.find("chars: {")
ce = src.find("recipes:")
if cs < 0 or ce < 0 or ce <= cs:
    sys.stdout.write("SEGMENT-LOCATE-FAILED cs=%d ce=%d\n" % (cs, ce))
    sys.exit(1)
seg = src[cs:ce]

injected = skipped = 0
missing = []

for ch, n in STROKES.items():
    # 每个字条目头行："林": { pinyin: ..., rare: false,
    pat = re.compile('"' + ch + '": \\{[^\\n]*\\n')
    m = pat.search(seg)
    if not m:
        missing.append(ch)
        continue
    head = m.group(0)
    if "strokes:" in head:
        skipped += 1
        continue
    if "rare:" not in head:
        missing.append(ch + "(no-rare)")
        continue
    new_head = head.replace("rare: false,", "rare: false, strokes: %d," % n) \
                   .replace("rare: true,", "rare: true, strokes: %d," % n)
    if new_head == head:
        missing.append(ch + "(replace-failed)")
        continue
    seg = seg[:m.start()] + new_head + seg[m.end():]
    injected += 1

out = src[:cs] + seg + src[ce:]
io.open(PATH, "w", encoding="utf-8", newline="\n").write(out)

sys.stdout.write("injected=%d skipped=%d missing=%s total_map=%d\n"
                 % (injected, skipped, missing if missing else "none", len(STROKES)))
if missing:
    sys.exit(1)
