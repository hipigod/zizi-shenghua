# -*- coding: utf-8 -*-
"""注入 64 个新字的配方，并修补 3 处多解（天+口、十+口、加+木）。"""
import io, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

P = "data.js"
s = io.open(P, encoding="utf-8").read()

# ---------- 1) 天+口：单解 → 双解（吞 / 吴） ----------
old = '    { a: "天", b: "口", results: ["吞"] },'
new = '''    { a: "天", b: "口", results: ["吞", "吴"],
      hints: { "吞": "天在上，口在下", "吴": "口在上，天在下" },
      layouts: {
        "吞": { k: "v", top: "天", bot: "口" },
        "吴": { k: "v", top: "口", bot: "天" } } },'''
assert old in s
s = s.replace(old, new, 1)

# ---------- 2) 十+口：双解 → 三解（古 / 田 / 叶） ----------
old = '''    { a: "十", b: "口", results: ["古", "田"],
      hints: { "古": "十在口上", "田": "十嵌进囗里，横竖把地分成格" },
      layouts: {
        "古": { k: "v", top: "十", bot: "口" },
        "田": { k: "around", outer: "口", inner: "十" } } },'''
new = '''    { a: "十", b: "口", results: ["古", "田", "叶"],
      hints: { "古": "十在口上", "田": "十嵌进囗里，横竖把地分成格", "叶": "口在左，十在右" },
      layouts: {
        "古": { k: "v", top: "十", bot: "口" },
        "田": { k: "around", outer: "口", inner: "十" },
        "叶": { k: "h", left: "口", right: "十" } } },'''
assert old in s
s = s.replace(old, new, 1)

# ---------- 3) 新增配方块 ----------
ANCHOR = '''    { a: "从", b: "一", results: ["丛"] },
  ],'''
assert ANCHOR in s

RECIPES = '''
    /* ===== 2026-10-29 查漏补缺配方（IDS 审计） ===== */
    /* 人来人往 · 人旁 */
    { a: "人", b: "十", results: ["什"] },
    { a: "人", b: "圭", results: ["佳"] },
    { a: "人", b: "本", results: ["体"] },
    { a: "人", b: "火", results: ["伙"] },
    { a: "人", b: "申", results: ["伸"] },
    { a: "人", b: "门", results: ["们"] },
    { a: "二", b: "人", results: ["仁"] },
    { a: "人", b: "吕", results: ["侣"] },
    { a: "人", b: "田", results: ["佃"] },
    { a: "人", b: "呆", results: ["保"] },
    { a: "人", b: "王", results: ["全"] },
    /* 人来人往 · 肉月旁（身体） */
    { a: "力", b: "月", results: ["肋"] },
    { a: "土", b: "月", results: ["肚"] },
    { a: "夫", b: "月", results: ["肤"] },
    { a: "月", b: "田", results: ["胃"] },
    { a: "思", b: "月", results: ["腮"] },
    /* 人来人往 · 心 */
    { a: "从", b: "心", results: ["怂"] },
    { a: "心", b: "旱", results: ["悍"] },
    { a: "心", b: "正", results: ["怔"] },
    { a: "因", b: "心", results: ["恩"] },
    { a: "亘", b: "心", results: ["恒"] },
    /* 门户之间 · 口旁 */
    { a: "口", b: "未", results: ["味"] },
    { a: "口", b: "因", results: ["咽"] },
    { a: "加", b: "口", results: ["咖"] },
    { a: "口", b: "圭", results: ["哇"] },
    { a: "口", b: "申", results: ["呻"] },
    { a: "口", b: "里", results: ["哩"] },
    { a: "口", b: "查", results: ["喳"] },
    { a: "口", b: "王", results: ["呈"] },
    /* 门户之间 · 门旁 */
    { a: "甲", b: "门", results: ["闸"] },
    { a: "王", b: "门", results: ["闰"] },
    { a: "圭", b: "门", results: ["闺"] },
    /* 草木之间 */
    { a: "土", b: "木", results: ["杜"] },
    { a: "圭", b: "木", results: ["桂"] },
    { a: "加", b: "木", results: ["架", "枷"],
      hints: { "架": "加在上，木在下", "枷": "木在左，加在右" },
      layouts: {
        "架": { k: "v", top: "加", bot: "木" },
        "枷": { k: "h", left: "木", right: "加" } } },
    { a: "木", b: "王", results: ["枉"] },
    { a: "木", b: "全", results: ["栓"] },
    { a: "亘", b: "木", results: ["桓"] },
    /* 水火之间 */
    { a: "水", b: "由", results: ["油"] },
    { a: "水", b: "间", results: ["涧"] },
    { a: "圭", b: "水", results: ["洼"] },
    { a: "水", b: "王", results: ["汪"] },
    { a: "水", b: "闰", results: ["润"] },
    { a: "古", b: "水", results: ["沽"] },
    { a: "囚", b: "水", results: ["泅"] },
    { a: "固", b: "水", results: ["涸"] },
    { a: "水", b: "相", results: ["湘"] },
    { a: "水", b: "胃", results: ["渭"] },
    { a: "查", b: "水", results: ["渣"] },
    { a: "旱", b: "火", results: ["焊"] },
    /* 厚土田园 */
    { a: "一", b: "土", results: ["王"] },
    { a: "土", b: "申", results: ["坤"] },
    { a: "土", b: "是", results: ["堤"] },
    { a: "亘", b: "土", results: ["垣"] },
    { a: "圭", b: "田", results: ["畦"] },
    { a: "旦", b: "里", results: ["量"] },
    /* 日月星辰 */
    { a: "日", b: "王", results: ["旺"] },
    { a: "日", b: "未", results: ["昧"] },
    /* 斜玉旁：王 + X，与玉石有关 */
    { a: "王", b: "里", results: ["理"] },
    { a: "王", b: "林", results: ["琳"] },
    { a: "王", b: "胡", results: ["瑚"] },
  ],'''

s = s.replace(ANCHOR, RECIPES, 1)
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("配方注入完成")
