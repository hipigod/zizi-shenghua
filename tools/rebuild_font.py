# -*- coding: utf-8 -*-
"""重建字体子集：只挑「与目标字符集有交集」的 regular 分片合并，再子集化。
分片源来自 npm 包 lxgw-wenkai-lite-webfont（files/ 目录，582 个分片，含四种字重）。
只取 regular，避免把 bold/light 混进同一个字体。

用法：
  python tools/rebuild_font.py <分片目录> <字符集文件> <输出 woff2>
"""
import io, os, sys, tempfile
from fontTools.ttLib import TTFont
from fontTools.merge import Merger
from fontTools.subset import Subsetter, Options


def main():
    src_dir, chars_file, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    text = io.open(chars_file, encoding="utf-8").read().strip()
    wanted = set(text)
    sys.stdout.write("charset: %d chars\n" % len(wanted))

    names = sorted(
        [f for f in os.listdir(src_dir)
         if f.endswith(".woff2") and "regular" in f],
        key=lambda s: int("".join(ch for ch in s if ch.isdigit()) or 0),
    )
    sys.stdout.write("regular shards: %d\n" % len(names))

    tmp_dir = tempfile.mkdtemp(prefix="zzsh_font_")
    ttf_paths = []
    for i, n in enumerate(names):
        ft = TTFont(os.path.join(src_dir, n))
        cmap = set(chr(c) for c in ft.getBestCmap().keys())
        if not (cmap & wanted):
            ft.close()
            continue
        ft.flavor = None
        p = os.path.join(tmp_dir, "s%03d.ttf" % i)
        ft.save(p)
        ttf_paths.append(p)
    sys.stdout.write("needed shards: %d\n" % len(ttf_paths))
    if not ttf_paths:
        sys.stdout.write("NO SHARD MATCHED\n")
        return 1

    sys.stdout.write("merging...\n")
    merged = Merger().merge(ttf_paths)

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
    sys.stdout.write("OK %s (%.1f KB)\n" % (out_path, os.path.getsize(out_path) / 1024.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
