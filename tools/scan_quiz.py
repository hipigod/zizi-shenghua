# -*- coding: utf-8 -*-
"""R3 据义造字 · 泄底扫描 + 三档分类初稿生成器。

输出：
  1. 泄底清单：origin 文本包含配方 a/b/目标字 字面的字（不可直接复用 origin）
  2. 三档初稿（full / assist / skip）——基于形声标注（data.js 的 note/origin 提到
     "形声"、"表音"）与语义可推性的启发式，供人工终审（拍板点⑥）。

判定规则：
  - full：origin 无泄底 且 字不是形声字（会意/指事/象形叠加）
  - assist：形声字（note 或 origin 提到 形声/表音/表意），描述可推表意部件
  - skip：origin 泄底 且 需人工改写 quizDesc 后重新归类；先标 skip 待审
用法：python tools/scan_quiz.py"""
import io
import re
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SRC = "data.js"
s = io.open(SRC, encoding="utf-8").read()

# 提取 chars 段
cs = s.find("chars: {")
ce = s.find("recipes:")
seg = s[cs:ce]

# 逐条切分：'"X": {' 开头至下一条或段尾
entries = []
parts = re.split(r'(?="[^\"]": \{)', seg)
for p in parts[1:]:
    m = re.match(r'"(.)": \{', p)
    if m:
        entries.append((m.group(1), p, ""))

def field(body, name):
    m = re.search(name + r':\s*"([^"]*)"', body)
    return m.group(1) if m else ""

# 配方表
rseg = s[s.find("recipes: ["):]
recipes = []
for m in re.finditer(r'\{ a: "(.)", b: "(.)", results: \[(.*?)\]', rseg):
    for c in re.findall(r'"(.)"', m.group(3)):
        recipes.append({"a": m.group(1), "b": m.group(2), "c": c})

recipe_of = {}
for r in recipes:
    recipe_of.setdefault(r["c"], []).append((r["a"], r["b"]))

full, assist, skip, leaked = [], [], [], []

for ch, body, _ in entries:
    origin = field(body, "origin")
    note = field(body, "note")
    rs = recipe_of.get(ch)
    if not rs:
        skip.append({"c": ch, "why": "无配方"})
        continue
    a, b = rs[0]
    parts = set(a + b + ch)
    is_leak = any(p in origin for p in parts)
    is_xingsheng = bool(re.search(r"形声|表音|表意|声旁|形旁", origin + note))
    rec = {"c": ch, "a": a, "b": b, "origin": origin[:40]}
    if is_leak:
        rec["leak"] = [p for p in parts if p in origin]
        leaked.append(rec)
        skip.append({"c": ch, "why": "origin泄底:" + "/".join(p for p in parts if p in origin)})
    elif is_xingsheng:
        assist.append(rec)
    else:
        full.append(rec)

out = {
    "full": full,
    "assist": assist,
    "skip": skip,
    "leaked_detail": leaked,
}
io.open("tools/quiz_scan_result.json", "w", encoding="utf-8").write(
    json.dumps(out, ensure_ascii=False, indent=1))

print("full  (origin干净,会意类,可直接出题): %d" % len(full))
print("assist(形声,需亮表音部件)          : %d" % len(assist))
print("skip  (泄底待改写/无配方)           : %d" % len(skip))
print("合计: %d" % (len(full) + len(assist) + len(skip)))
print("明细已写 tools/quiz_scan_result.json")
