# -*- coding: utf-8 -*-
"""从 lxgw-wenkai-lite-webfont 的分片 CSS 中，
找出覆盖游戏实际字符集（glyphs.txt）所需的分片文件清单。
CDN 的 CSS 里 unicode-range 没有结尾分号，正则不能要求分号。"""
import re
import io
import sys

css = io.open(sys.argv[1], encoding="utf-8").read()
target = [ch for ch in io.open(sys.argv[2], encoding="utf-8").read() if ch.strip()]
target = set(target)

blocks = re.findall(r"@font-face\s*\{(.*?)\}", css, re.S)
need = []
for b in blocks:
    m = re.search(r"url\('([^']+)'\)", b)
    ur = re.search(r"unicode-range:\s*([^;}]+)", b)
    if not m or not ur:
        continue
    rng = []
    for p in ur.group(1).split(","):
        mm = re.match(r"U\+([0-9a-fA-F]+)(?:-([0-9a-fA-F]+))?", p.strip())
        if mm:
            a = int(mm.group(1), 16)
            bb = int(mm.group(2), 16) if mm.group(2) else a
            rng.append((a, bb))
    hit = [ch for ch in target if any(a <= ord(ch) <= bb for a, bb in rng)]
    if hit:
        need.append((m.group(1), hit))

covered = set()
for _, hits in need:
    covered.update(hits)
missing = sorted(target - covered)

sys.stdout.write("needed files: %d\n" % len(need))
for u, h in need:
    sys.stdout.write("  %s (%d)\n" % (u, len(h)))
sys.stdout.write("covered: %d / %d\n" % (len(covered), len(target)))
if missing:
    sys.stdout.write("MISSING: %s\n" % "".join(missing))
