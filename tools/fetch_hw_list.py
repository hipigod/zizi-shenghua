# -*- coding: utf-8 -*-
"""并发抓取 hanzi-writer-data 笔顺，缓存到 tools/_hwdata/。用法：python tools/fetch_hw_list.py 字串"""
import io, json, os, sys, urllib.parse, urllib.request
import concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", "_hwdata")
BASE = "https://unpkg.com/hanzi-writer-data@2.0/"


def one(ch):
    p = os.path.join(CACHE, ch + ".json")
    if os.path.exists(p):
        try:
            return ch, len(json.load(io.open(p, encoding="utf-8"))["strokes"]), "cache"
        except Exception:
            pass
    u = BASE + urllib.parse.quote(ch) + ".json"
    for _ in range(3):
        try:
            d = urllib.request.urlopen(u, timeout=25).read()
            n = len(json.loads(d)["strokes"])
            io.open(p, "wb").write(d)
            return ch, n, "net"
        except Exception as e:
            last = type(e).__name__
    return ch, None, last


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    chars = sys.argv[1] if len(sys.argv) > 1 else ""
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        rows = list(ex.map(one, list(chars)))
    ok = [(c, n) for c, n, s in rows if n]
    bad = [(c, s) for c, n, s in rows if not n]
    print("成功 %d / %d" % (len(ok), len(chars)))
    print(" ".join("%s%d" % (c, n) for c, n in ok))
    if bad:
        print("失败:", bad)
