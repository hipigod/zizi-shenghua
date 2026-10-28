# -*- coding: utf-8 -*-
"""R3 quizDesc 出题描述注入器（含 quizMode / assistPart）。
描述原则：只讲意思/画面，不含配方 a、b 与目标字的字面；语义尽量指向部件。
用法：python tools/inject_quiz.py"""
import io
import re
import sys

# 三档数据：quizDesc 均已人工推写（绕开 origin 泄底）
# mode: full=可推两部件 / assist=可推表意部件(assistPart=自动亮出的表音部件) / skip=不出题
QUIZ = {
    # ===== 草木之间 =====
    "林":   ("full", None,   "好多树站在一起，密密的一大片"),
    "森":   ("full", None,   "树更多了，密密层层望不到边"),
    "本":   ("full", None,   "树的根扎在土里的那一段；引申为根本"),
    "末":   ("full", None,   "树梢最顶上的那一点；引申为末端"),
    "未":   ("full", None,   "枝头刚冒出的新芽；借来表示还没有"),
    "休":   ("full", None,   "走累了，找个能靠的地方歇一歇"),
    "困":   ("full", None,   "被围在里面，伸不开也走不掉"),
    "呆":   ("full", None,   "站在树下一动不动，发了愣"),
    "杏":   ("assist", "口", "春天开粉花、夏天结黄果的一种果树"),
    "果":   ("skip", None,   ""),   # 象形字，描述与部件无法对应
    "棵":   ("assist", "果", "数树苗用的量词：一__小树"),
    "枯":   ("assist", "古", "草木失去水分，干得皱起来"),
    "焚":   ("full", None,   "放一把火把荒草杂树烧掉，古时这样开田"),
    # ===== 日月星辰 =====
    "明":   ("full", None,   "白天有太阳、晚上有月亮，走到哪儿都亮堂堂"),
    "昌":   ("full", None,   "日子过得红红火火、兴旺发达"),
    "晶":   ("full", None,   "亮闪闪的，像天上的星星挤在一起"),
    "旦":   ("full", None,   "清晨，太阳刚从地平线上蹦出来的时刻"),
    "杲":   ("full", None,   "太阳升得老高，亮得晃眼（生僻字）"),
    "杳":   ("full", None,   "太阳沉下去，天黑透了，什么也看不见"),
    "朋":   ("skip", None,   ""),   # 双月与"朋友"无语义可推
    "早":   ("full", None,   "太阳刚爬上来，一天最开始的时候"),
    "是":   ("skip", None,   ""),   # 日正会意过于抽象
    # ===== 人来人往 =====
    "从":   ("full", None,   "一个人在前走，另一个人紧紧跟在后面"),
    "众":   ("full", None,   "人好多呀，一大群聚在一起"),
    "囚":   ("full", None,   "人被关进四面围死的栏里，出不来"),
    "吕":   ("skip", None,   ""),   # 本义脊骨，与口口无语义关联
    "回":   ("full", None,   "在外面转了一大圈，又回到原地"),
    "品":   ("full", None,   "三张小嘴一起尝一尝、评一评"),
    "闪":   ("full", None,   "门一开，身影一晃就不见了"),
    "问":   ("full", None,   "站在门外张嘴打听：有人在家吗"),
    "间":   ("full", None,   "门缝里透进一线光，中间那道细细的空隙"),
    "闷":   ("full", None,   "心事关在门里出不来，透不过气"),
    "闲":   ("full", None,   "门上拴好木栓，什么事都进不来，清清静静"),
    "坐":   ("full", None,   "两个人面对面歇在土堆上聊天"),
    "加":   ("assist", "口", "本来指说话添油加醋，后来表示增多"),
    "吐":   ("assist", "口", "春蚕从嘴里不停地拉出细丝"),
    # ===== 水火之间 =====
    "炎":   ("full", None,   "火烧得旺，热浪一层压一层往上冒"),
    "焱":   ("full", None,   "火花一朵接一朵，窜成一大片（生僻字）"),
    "燚":   ("full", None,   "篝火烧得四面八方都是（超生僻彩蛋）"),
    "沝":   ("full", None,   "两条小溪并排淌（几乎只在地名里出现）"),
    "淼":   ("full", None,   "水面望不到边，三大片连成汪洋（生僻字）"),
    "淡":   ("assist", "炎", "味道薄薄的，不咸不甜也不浓"),
    "泪":   ("full", None,   "眼睛里装不住的水，一颗颗滚下来"),
    "灭":   ("full", None,   "一横压下去，火苗就再也烧不起来"),
    "因":   ("full", None,   "躺在席子上，就着四围舒舒服服（引申为缘由）"),
    "尖":   ("full", None,   "上面细细的、下面粗粗的，扎手得很"),
    "歪":   ("full", None,   "不端正，斜到一边去了"),
    "天":   ("full", None,   "头顶之上那片最高最大的地方"),
    "夫":   ("full", None,   "成年男子束发插簪，顶天立地"),
    "男":   ("full", None,   "在田地里出力气干活的人"),
    "思":   ("skip", None,   ""),   # 囟+心，部件与描述无法对应（囟不在部件池）
    # ===== 品物流形 =====
    "古":   ("full", None,   "很多年前的事，一代代传到今天"),
    "胡":   ("skip", None,   ""),   # 本义颔下垂肉，描述无法推部件
    "湖":   ("assist", "胡", "陆地上聚起一大片望不到边的水"),
    "甲":   ("skip", None,   ""),   # 象形（种子戴壳），田+十只是字形巧合
    "由":   ("skip", None,   ""),   # 同上，象形/分化字
    "申":   ("skip", None,   ""),   # 闪电象形，与田字形巧合
    "相":   ("full", None,   "睁大眼睛，仔细打量一棵树长得直不直"),
    "想":   ("full", None,   "心里转呀转，念头一个接一个冒出来"),
    "尘":   ("full", None,   "细细的土，风一吹就满天飞"),
    "灶":   ("assist", "土", "生火做饭的那一套家什"),
    "里":   ("skip", None,   ""),   # 田土会意已弱化，描述难对应
}

MODES = ("full", "assist", "skip")

PATH = "data.js"
src = io.open(PATH, encoding="utf-8").read()
cs = src.find("chars: {")
ce = src.find("recipes:")
seg = src[cs:ce]

injected = skipped = 0
missing = []

for ch, (mode, assist, desc) in QUIZ.items():
    pat = re.compile('"' + ch + '": \\{[^\\n]*\\n')
    m = pat.search(seg)
    if not m:
        missing.append(ch)
        continue
    head = m.group(0)
    if "quizMode:" in head:
        skipped += 1
        continue
    quiz_fields = ' quizMode: "%s"%s,' % (
        mode,
        (', quizDesc: "%s", assistPart: "%s"' % (desc, assist)) if mode == "assist"
        else (', quizDesc: "%s"' % desc) if mode == "full"
        else "")
    # 注入到头行末（rare: false, strokes: 8,\n → 追加 quiz 行）
    new_head = head.rstrip("\n")
    nl = "\n" if head.endswith("\n") else ""
    if not new_head.endswith(","):
        new_head += ","
    # 头行已是 ...strokes: 8, 形态；把 quiz 字段并进头行
    seg = seg[:m.start()] + new_head + quiz_fields + nl + seg[m.end():]
    injected += 1

out = src[:cs] + seg + src[ce:]
io.open(PATH, "w", encoding="utf-8", newline="\n").write(out)
sys.stdout.write("injected=%d skipped=%d missing=%s total=%d\n"
                 % (injected, skipped, missing if missing else "none", len(QUIZ)))
if missing:
    sys.exit(1)
