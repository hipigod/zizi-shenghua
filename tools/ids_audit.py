# -*- coding: utf-8 -*-
"""用 cjkvi-ids 权威分解数据，反向查找「现有件两两能拼出的所有规范汉字」。

思路：
  1. 解析 ids.txt（每行 U+XXXX\t字\tIDS序列），一个字的多种分解都留着
  2. 把 IDS 里的偏旁变体（氵亻忄灬⺼…）规范化回原型件（水人心火月…）
  3. 只认「整字 = 一个二元结构符 + 两个单码点部件」的形式（⿰AB / ⿱AB / ⿴AB …），
     嵌套结构（⿰氵⿱…）不算二合，跳过
  4. 两个部件都必须是当前可用件（部件 + 已合成的字）
  5. 结果字按 GB2312 收录情况标注常用度
输出：每个可用件配对 → 它能拼出的所有规范汉字
"""
import io, re, sys, json
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ---------- 1. 当前可用件 ----------
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
usable = chars | parts
print("可用件 %d 个（部件 %d + 字 %d，去重后）" % (len(usable), len(parts), len(chars)))

# ---------- 2. 变体规范化 ----------
# 只映射到我们实际拥有的件。游戏里已有「水在左边写成氵」的教学约定（汁/沐/淋/泪/沁）。
VAR = {}
for src, dst in [
    ("氵水氺", "水"), ("亻人", "人"), ("忄心㣺", "心"), ("灬火", "火"),
    ("⺼月", "月"),
]:
    for c in src:
        if c != dst:
            VAR[c] = dst

def norm(c):
    return VAR.get(c, c)

# ---------- 3. 解析 IDS ----------
BIN = "⿰⿱⿴⿵⿶⿷⿸⿹⿺⿻"
by_pair = {}      # (A,B) 有序排列 -> {结果字: 结构符}
ids_of = {}       # 字 -> [ids...]
for line in io.open(IDS, encoding="utf-8"):
    if line.startswith("#") or "\t" not in line:
        continue
    cols = line.rstrip("\n").split("\t")
    if len(cols) < 3:
        continue
    ch = cols[1]
    if len(ch) != 1:
        continue
    for raw in cols[2:]:
        s = re.sub(r"\[[A-Z]+\]", "", raw)
        ids_of.setdefault(ch, []).append(s)
        if len(s) != 3:
            continue                       # 只要「结构符 + 两个单码点」
        if s[0] not in BIN:
            continue
        a, b = norm(s[1]), norm(s[2])
        if a not in usable or b not in usable:
            continue
        by_pair.setdefault((a, b), set()).add((ch, s[0]))

# ---------- 4. 合并对称配对 ----------
merged = {}
for (a, b), items in by_pair.items():
    key = tuple(sorted([a, b]))
    merged.setdefault(key, set())
    for ch, op in items:
        merged[key].add((ch, op))

# ---------- 5. 常用度 ----------
def gb_level(ch):
    """1=GB2312 一级常用 2=二级 0=非 GB2312。
    另外必须排除 CJK 兼容区（U+F900-FAFF，如 什肋）和扩展 A/B 区（如 𠈘），
    那些是异体或古字，字库收了会显示成别的字形。"""
    o = ord(ch)
    if not (0x4E00 <= o <= 0x9FFF):
        return 0
    try:
        b = ch.encode("gb2312")
    except UnicodeEncodeError:
        return 0
    if b"\xb0\xa1" <= b <= b"\xd7\xf9":
        return 1
    return 2

rows = []
for (a, b), items in merged.items():
    got = [c for c in items if c[0] in chars]
    new = sorted([c for c in items if c[0] not in chars], key=lambda x: (gb_level(x[0]) or 9, x[0]))
    rows.append({
        "pair": a + "+" + b,
        "a": a, "b": b,
        "already": sorted(set(c[0] for c in got)),
        "new": [{"ch": c[0], "op": c[1], "gb": gb_level(c[0])} for c in new],
    })

rows.sort(key=lambda r: (-len(r["new"]), r["pair"]))

# ---------- 6. 输出 ----------
covered = sum(len(r["already"]) for r in rows)
newtotal = sum(len(r["new"]) for r in rows)
print("配对 %d 个 | 已覆盖结果字 %d | 新发现候选字 %d" % (len(rows), covered, newtotal))
print()

out = {"usable": sorted(usable), "chars": sorted(chars), "pairs": rows}
io.open("tools/ids_audit.json", "w", encoding="utf-8").write(
    json.dumps(out, ensure_ascii=False, indent=1))

L1 = lambda r: [x for x in r["new"] if x["gb"] == 1]
print("=== 有 GB2312 一级（常用）新候选的配对 ===")
for r in rows:
    l1 = L1(r)
    if not l1:
        continue
    print("%-8s 已收:%-10s 新: %s" % (
        r["pair"], "".join(r["already"]) or "-",
        " ".join("%s%s" % (x["ch"], {1: "", 2: "(二)", 0: "(僻)"}[x["gb"]]) for x in r["new"])))

print()
print("=== 只有生僻（非 GB2312）新候选的配对 ===")
for r in rows:
    if L1(r) or not r["new"]:
        continue
    print("%-8s %s" % (r["pair"], " ".join(x["ch"] for x in r["new"])))
