# -*- coding: utf-8 -*-
"""主线重新分类：5 条 → 6 条，并把 chars 段按新主线物理重排。

旧分类的问题：
  - 人来人往 26 字里混了人系、口系、门系、月肉旁；
  - 水火之间 里躺着 因 尖 歪 天 夫 男 思 七个跟水火无关的字；
  - 品物流形 是杂物抽屉（字形拆件 + 形声字 + 土系混装）。

新分类按「主部件 / 形旁」归族，每条主线的字理线索单一：
  caomu  草木之间  木系
  riyue  日月星辰  日、月、目系
  shuihuo 水火之间 水、火系
  renwu  人来人往  人、力、心、月肉、大系
  houtu  厚土田园  土、田、十系（新增）
  menhu  门户之间  门、口、囗、古系（新增）

用法：python tools/reclassify.py
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "data.js")

NEW = {
    "caomu":   "林森本末未休困呆杏果棵枯杆束查棚",
    "riyue":   "明昌晶旦杲杳朋早是亘旱相",
    "shuihuo": "炎焱燚沝淼淡泪灭汁汗沐沓沫淋湖烟煳焚灶",
    "renwu":   "从众估但倡加另叻肝胆囚坐天夫因尖歪思想",
    "houtu":   "土田里圭坦埋尘男甲由申干",
    "menhu":   "闪问间闷闲闩吕回品吞否咕唱吐古固胡",
}
META = [
    ("caomu",   "草木之间", "#5B8C5A", "🌳", 1),
    ("riyue",   "日月星辰", "#C9A227", "☀️", 2),
    ("renwu",   "人来人往", "#8D6E63", "👥", 3),
    ("shuihuo", "水火之间", "#4A7FA5", "🔥", 4),
    ("houtu",   "厚土田园", "#A9825C", "🌾", 5),
    ("menhu",   "门户之间", "#6E7F8D", "🚪", 6),
]


def main():
    src = io.open(DATA_JS, encoding="utf-8").read()

    # ---- 0. 覆盖校验 ----
    have = set(re.findall(r'"(.)": \{', src[src.find("chars: {"):src.find("recipes:")]))
    want = set("".join(NEW.values()))
    if len(want) != sum(len(v) for v in NEW.values()):
        sys.stdout.write("映射里有重复字\n")
        return 1
    if have != want:
        sys.stdout.write("缺：%s\n多：%s\n" % ("".join(sorted(have - want)), "".join(sorted(want - have))))
        return 1
    sys.stdout.write("覆盖校验通过：%d 字\n" % len(want))

    # ---- 1. lines 定义 ----
    i = src.find("lines: {")
    # 只认 2 空格缩进的块结束符，否则会命中行尾的 "},"（每条主线定义都以它结尾）
    m = re.compile(r'\n  \},').search(src, i)
    if not m:
        sys.stdout.write("找不到 lines 块结尾\n")
        return 1
    j = m.end()
    block = "  lines: {\n"
    block += ",\n".join(
        '    %s: { name: "%s", color: "%s", emoji: "%s", order: %d }'
        % (k, n, c, e, o) for k, n, c, e, o in META)
    block += "\n  },"
    src = src[:i] + block + src[j:]

    # ---- 2. 拆出 chars 段里的每个字条目 ----
    ci = src.find("chars: {")
    ri = src.find("recipes: [")
    head = src[:ci]
    body = src[ci:ri]
    tail = src[ri:]

    # 历史注入脚本留下的缩进不统一（4/8 空格都有），这里按任意缩进匹配并统一成 4 空格
    marks = [(m.start(), m.group(1)) for m in re.finditer(r'\n\s*"(.)": \{', body)]
    if not marks:
        sys.stdout.write("没找到字条目\n")
        return 1
    entries = {}
    for idx, (pos, ch) in enumerate(marks):
        end = marks[idx + 1][0] if idx + 1 < len(marks) else body.rfind("  },")
        txt = body[pos:end]
        txt = re.sub(r'^\n\s+"', '\n    "', txt)
        entries[ch] = txt

    # ---- 3. 按新主线重写 chars 段 ----
    out = "  chars: {\n"
    for k, name, color, emoji, order in META:
        cnt = len(NEW[k])
        out += "\n    /* ===== 主线%d · %s（%d） ===== */\n" % (order, name, cnt)
        for ch in NEW[k]:
            # 同步改写条目里的 line 字段，否则字仍指向已被删除的旧分类
            out += re.sub(r'line: "\w+"', 'line: "%s"' % k, entries[ch])
    out += "  },\n\n"
    src = head + out + tail

    io.open(DATA_JS, "w", encoding="utf-8").write(src)
    for k, name, color, emoji, order in META:
        sys.stdout.write("  %s %s %d 字\n" % (k, name, len(NEW[k])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
