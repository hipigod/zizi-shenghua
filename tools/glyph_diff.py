# -*- coding: utf-8 -*-
"""形近字像素区分度测量：把两个字按游戏实际字号渲染成位图，
对齐重心后计算「不重合像素 / 并集像素」，给出可区分度百分比。

判据（经验阈值）：
  >= 25%  一眼可辨
  15~25%  需细看，勉强可用
  < 15%   64px 下不可区分，不予收录

用法：python tools/glyph_diff.py [字号]（默认 44，即 64px 字块内的字号）
"""
import io, os, sys
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "fonts", "LXGWWenKai-Subset.woff2")

GROUPS = [
    ("一+十 → 干 / 土（本次新增）", ["干", "土"]),
    ("参照 士 / 土（已拒收士）", ["士", "土"]),
    ("口+力 → 加 / 另 / 叻", ["加", "另", "叻"]),
    ("十+口 → 古 / 田", ["古", "田"]),
]


def render(ch, font, size):
    img = Image.new("L", (size * 2, size * 2), 255)
    d = ImageDraw.Draw(img)
    d.text((size // 2, size // 2), ch, font=font, fill=0)
    bbox = img.point(lambda v: 255 if v < 128 else 0).getbbox()
    if not bbox:
        return None
    return img.crop(bbox).point(lambda v: 1 if v < 128 else 0)


def diff_ratio(a, b):
    """对齐重心与画布后，计算不重合像素 / 并集像素"""
    w = max(a.width, b.width)
    h = max(a.height, b.height)
    ca = Image.new("L", (w, h), 0)
    cb = Image.new("L", (w, h), 0)
    ca.paste(a, ((w - a.width) // 2, (h - a.height) // 2))
    cb.paste(b, ((w - b.width) // 2, (h - b.height) // 2))
    pa, pb = ca.load(), cb.load()
    inter = union = 0
    for y in range(h):
        for x in range(w):
            va, vb = pa[x, y], pb[x, y]
            if va or vb:
                union += 1
                if va and vb:
                    inter += 1
    if union == 0:
        return 0.0, 0
    return (union - inter) * 100.0 / union, union


def verdict(r):
    if r >= 25:
        return "一眼可辨 ✅"
    if r >= 15:
        return "需细看 ⚠"
    return "不可区分 ❌"


def main():
    size = int(sys.argv[1]) if len(sys.argv) > 1 else 44
    ft = TTFont(SRC)
    ft.flavor = None
    tmp = os.path.join(ROOT, "fonts", "_tmp_render.ttf")
    ft.save(tmp)
    font = ImageFont.truetype(tmp, size)

    print("字号 %dpx，字体 %s\n" % (size, os.path.basename(SRC)))
    for title, chars in GROUPS:
        print("-- %s" % title)
        imgs = {}
        for c in chars:
            im = render(c, font, size)
            if im is None:
                print("   %s：字体缺字！" % c)
            imgs[c] = im
        for i in range(len(chars)):
            for j in range(i + 1, len(chars)):
                a, b = chars[i], chars[j]
                if imgs.get(a) is None or imgs.get(b) is None:
                    continue
                r, u = diff_ratio(imgs[a], imgs[b])
                print("   %s vs %s：差异 %5.1f%%（并集 %d px）  %s"
                      % (a, b, r, u, verdict(r)))
        print()
    os.remove(tmp)
    return 0


if __name__ == "__main__":
    sys.exit(main())
