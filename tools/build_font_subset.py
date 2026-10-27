# -*- coding: utf-8 -*-
"""把 lxgw-wenkai-lite-webfont 的分片 woff2 合并，
再按游戏实际用到的字符集子集化，产出单个 fonts/LXGWWenKai-Subset.woff2。

用法：
  python tools/build_font_subset.py <分片目录> <字符集文件> <输出 woff2>

设计要点：
  1. 分片 woff2 的字体名是 "LXGW WenKai Lite"，合并前先去掉 flavor 包装，
     否则 Merger 无法处理 woff2 输入。
  2. 保留 name 表（OFL 许可要求保留版权声明），不删 DSIG 之外的关键表。
  3. 子集化后再压成 woff2，体积通常能压到原字体的千分之一量级。
"""
import io
import os
import sys
from fontTools.ttLib import TTFont
from fontTools.merge import Merger
from fontTools.subset import Subsetter, Options


def main():
    src_dir = sys.argv[1]
    chars_file = sys.argv[2]
    out_path = sys.argv[3]

    names = sorted(
        [f for f in os.listdir(src_dir) if f.endswith(".woff2")],
        key=lambda s: int("".join(ch for ch in s if ch.isdigit()) or 0),
    )
    if not names:
        sys.stdout.write("NO WOFF2 FILES\n")
        return 1

    text = io.open(chars_file, encoding="utf-8").read().strip()

    import tempfile
    tmp_dir = tempfile.mkdtemp(prefix="zzsh_font_")
    ttf_paths = []
    for n in names:
        ft = TTFont(os.path.join(src_dir, n))
        ft.flavor = None          # 脱掉 woff2 外壳，交给合并器
        p = os.path.join(tmp_dir, n.replace(".woff2", ".ttf"))
        ft.save(p)
        ttf_paths.append(p)

    sys.stdout.write("merging %d subset fonts...\n" % len(ttf_paths))
    merger = Merger()
    merged = merger.merge(ttf_paths)

    sys.stdout.write("subsetting to %d chars...\n" % len(set(text)))
    opts = Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.name_legacy = True
    opts.notdef_outline = True
    opts.recalc_bounds = True
    sub = Subsetter(options=opts)
    sub.populate(text=text)
    sub.subset(merged)

    merged.flavor = "woff2"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    merged.save(out_path)

    size = os.path.getsize(out_path)
    sys.stdout.write("OK %s (%.1f KB)\n" % (out_path, size / 1024.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
