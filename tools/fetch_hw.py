# -*- coding: utf-8 -*-
"""批量拉取 hanzi-writer-data 的笔顺数据，作为笔画数的权威基准。
结果缓存到 tools/_hwdata/<字>.json，供 tools/fulltest.js 与注入脚本校正笔画数。

用法：python tools/fetch_hw.py [字列表文件或留空=从 data.js 读取]
"""
import io, json, os, sys, time, urllib.parse, urllib.request
import concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", "_hwdata")
# 注：jsDelivr 在本机不通（HTTP 000），npmmirror 对单文件返回 403，
# 实测 unpkg 跟随 302 可用（curl -L）。仅用于校验，不影响游戏运行时。
BASE = "https://unpkg.com/hanzi-writer-data@2.0/"
MIRROR = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/"


def chars_from_data_js():
    import re
    d = io.open(os.path.join(ROOT, "data.js"), encoding="utf-8").read()
    seg = d[d.find("chars: {"):d.find("recipes:")]
    return re.findall(r'"(.)": \{', seg)


def fetch_one(ch):
    path = os.path.join(CACHE, ch + ".json")
    if os.path.exists(path):
        try:
            j = json.load(io.open(path, encoding="utf-8"))
            return ch, len(j.get("strokes", []))
        except Exception:
            pass
    for base in (BASE, MIRROR):
        for attempt in range(3):
            url = base + urllib.parse.quote(ch) + ".json"
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "zzsh/1.0"})
                raw = urllib.request.urlopen(req, timeout=25).read().decode("utf-8")
                j = json.loads(raw)
                if "strokes" not in j:
                    break
                io.open(path, "w", encoding="utf-8").write(raw)
                return ch, len(j["strokes"])
            except Exception:
                time.sleep(0.6 * (attempt + 1))
    return ch, None


def main():
    os.makedirs(CACHE, exist_ok=True)
    if len(sys.argv) > 1:
        chars = list(io.open(sys.argv[1], encoding="utf-8").read().strip())
    else:
        chars = chars_from_data_js()
    chars = sorted(set(chars))
    sys.stdout.write("fetching %d chars...\n" % len(chars))
    ok, miss = {}, []
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        for ch, n in ex.map(fetch_one, chars):
            if n is None:
                miss.append(ch)
            else:
                ok[ch] = n
    sys.stdout.write("OK %d / MISS %d\n" % (len(ok), len(miss)))
    if miss:
        sys.stdout.write("缺失（数据源无此字）：" + "".join(miss) + "\n")
    io.open(os.path.join(ROOT, "tools", "hw_strokes.json"), "w", encoding="utf-8").write(
        json.dumps(ok, ensure_ascii=False, indent=0, sort_keys=True))
    sys.stdout.write("已写入 tools/hw_strokes.json\n")
    return 0


if __name__ == "__main__":
    import urllib.parse
    sys.exit(main())
