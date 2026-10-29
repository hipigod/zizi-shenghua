# -*- coding: utf-8 -*-
"""迭代审计：把一批「拟收字」先并入可用件，再看会不会连锁出新字。

用法：python tools/ids_iter.py 什佳体伙伸们仁侣味咽叶咖恩肚肤肋胃杜桂架油涧洼焊坤堤闸恒冒王舌
"""
import io, re, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import os, urllib.request
IDS = "tools/_ids.txt"
if not os.path.exists(IDS):
    print("首次运行，下载 cjkvi-ids（CHISE 表意文字分解库）...")
    urllib.request.urlretrieve("https://raw.githubusercontent.com/cjkvi/cjkvi-ids/master/ids.txt", IDS)

D = io.open("data.js", encoding="utf-8").read()
cs = D.find("chars: {"); ce = D.find("recipes: [")
chars = set(re.findall(r'"(.)": \{', D[cs:ce]))
pi = D.find("partInfo: {"); pe = D.find("chars: {")
parts = set(re.findall(r'"(.)": \{', D[pi:pe]))

assume = list(sys.argv[1]) if len(sys.argv) > 1 else []
base = chars | parts
usable = base | set(assume)

VAR = {}
for src, dst in [("氵水氺", "水"), ("亻人", "人"), ("忄心㣺", "心"),
                 ("灬火", "火"), ("⺼月", "月")]:
    for c in src:
        if c != dst:
            VAR[c] = dst
norm = lambda c: VAR.get(c, c)
BIN = "⿰⿱⿴⿵⿶⿷⿸⿹⿺⿻"

def gb(ch):
    o = ord(ch)
    if not (0x4E00 <= o <= 0x9FFF):
        return 0
    try:
        b = ch.encode("gb2312")
    except UnicodeEncodeError:
        return 0
    if b"\xb0\xa1" <= b <= b"\xd7\xf9":
        return 1
    if b"\xd8\xa1" <= b <= b"\xf7\xfe":
        return 2
    return 0

res = {}
for line in io.open(IDS, encoding="utf-8"):
    if line.startswith("#") or "\t" not in line:
        continue
    cols = line.rstrip("\n").split("\t")
    if len(cols) < 3 or len(cols[1]) != 1:
        continue
    ch = cols[1]
    if ch in base:
        continue
    for raw in cols[2:]:
        s = re.sub(r"\[[A-Z]+\]", "", raw)
        if len(s) != 3 or s[0] not in BIN:
            continue
        a, b = norm(s[1]), norm(s[2])
        # 至少一个新件参与，否则是旧配对（已审过）
        if a not in usable or b not in usable:
            continue
        if a not in assume and b not in assume:
            continue
        res.setdefault(ch, []).append((a, b, s[0]))

rows = []
for ch, items in res.items():
    if gb(ch) == 0:
        continue
    for a, b, op in items:
        rows.append((gb(ch), ch, a, b, op))

rows.sort()
print("拟收 %d 字，接入后 GB2312 级新候选 %d 条：" % (len(assume), len(rows)))
for lv, ch, a, b, op in rows:
    print("  %s %s = %s %s %s  [%s]" % ("一" if lv == 1 else "二", ch, a, op, b,
                                       "一级常用" if lv == 1 else "二级"))
