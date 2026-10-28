# -*- coding: utf-8 -*-
"""字族树补根：把 family 归到能覆盖全部 95 字的族根上。

问题：ui.js 的 TREE_ROOTS 只声明了木/日/人/火/水/十 六个根，
但数据里实际存在 14 个族根（还差 月 口 力 大 小 不 心 门），
导致 21 个字（朋 加 另 叻 肝 胆 天 夫 因 尖 歪 思 问 闷 闩 吕 回 品 吞 否 吐）
在字族树里根本不显示——图鉴翻到「字族树」页会少掉两成字。

处理：把小族并进语义相近的大族，最终收敛到 12 个根 / 11 个展示框。
新 family 一律取自该字自己的配方（满足 validate 的「parent 在配方内」）。
用法：python tools/refamily.py
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "data.js")

# 字 -> 新 family
CHANGE = {
    "闲": "门",   # 门+木：归入「门之族」，与主线「门户之间」呼应
    "间": "门",   # 门+日
    "问": "门",   # 门+口
    "叻": "口",   # 口+力：口左力右，归口
    "估": "人",   # 亻旁形声，归人
    "但": "人",
    "倡": "人",
    "尖": "大",   # 小+大：大为主
    "思": "心",   # 田+心：与「闷」同归心之族
}

# 展示框（多根的合并成一个框）
BOXES = [
    (["木"], "木之族"),
    (["日"], "日之族"),
    (["月"], "月之族"),
    (["人"], "人之族"),
    (["口"], "口之族"),
    (["心"], "心之族"),
    (["火"], "火之族"),
    (["水"], "水之族"),
    (["十"], "十之族"),
    (["门"], "门之族"),
    (["大", "不"], "大字之族"),
]


def main():
    src = io.open(DATA_JS, encoding="utf-8").read()
    ci = src.find("chars: {")
    ri = src.find("recipes: [")
    body = src[ci:ri]

    marks = [(m.start(), m.group(1)) for m in re.finditer(r'\n\s*"(.)": \{', body)]
    spans = {}
    for idx, (pos, ch) in enumerate(marks):
        end = marks[idx + 1][0] if idx + 1 < len(marks) else body.rfind("  },")
        spans[ch] = (pos, end)

    n = 0
    for ch, fam in CHANGE.items():
        if ch not in spans:
            sys.stdout.write("找不到字条目：%s\n" % ch)
            return 1
        s, e = spans[ch]
        old = body[s:e]
        new = re.sub(r'family: "(.)"', 'family: "%s"' % fam, old, count=1)
        if new == old:
            sys.stdout.write("%s 未改（可能已是 %s）\n" % (ch, fam))
            continue
        body = body[:s] + new + body[e:]
        n += 1
        # 后面的偏移不变（等长替换）
    src = src[:ci] + body + src[ri:]
    io.open(DATA_JS, "w", encoding="utf-8").write(src)
    sys.stdout.write("改写 family %d 处\n" % n)
    sys.stdout.write("族框 %d 个：%s\n" % (
        len(BOXES), "、".join(b[1] for b in BOXES)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
