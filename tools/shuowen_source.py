# -*- coding: utf-8 -*-
"""查《说文解字》条目，为字源卡生成 originSource。

数据源：shuowenjiezi/shuowen（shuowen.org 网站数据，Apache-2.0），
浅克隆落在 tools/_shuowen/data/*.json，已在 .gitignore 忽略。

用法：
  python tools/shuowen_source.py index          # 建索引并缓存
  python tools/shuowen_source.py check 呆 杏 果 # 查单字
  python tools/shuowen_source.py report         # 对 data.js 全部字做覆盖统计
"""
import io, json, os, sys, glob

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(HERE, "_shuowen", "data")
CACHE = os.path.join(HERE, "_shuowen", "index.json")

# 说文字头是繁体/古字，简化字要先映射到字头再查
TRAD = {
    "们": "們", "叶": "葉", "闷": "悶", "闸": "閘", "闪": "閃", "问": "問",
    "间": "閒", "闲": "閑", "闺": "閨", "闰": "閏", "关": "關",
    "体": "體", "胆": "膽", "肤": "膚", "恒": "恆", "奋": "奮", "丛": "叢",
    "灭": "滅", "泪": "淚", "烟": "煙", "灶": "竈", "尘": "塵", "涧": "澗",
    "洼": "窪", "润": "潤", "吴": "吳", "众": "眾", "从": "從",
    # 《说文》收同一字但字头写法不同
    "焚": "燓", "埋": "薶", "旺": "暀", "尘": "塵", "灶": "竈", "朋": "鳳",
}


def ensure_data():
    """首次运行自动浅克隆；48MB / 9833 个 JSON，不进仓库。"""
    if os.path.isdir(DATA) and glob.glob(os.path.join(DATA, "*.json")):
        return
    import subprocess
    os.makedirs(os.path.join(HERE, "_shuowen"), exist_ok=True)
    print("首次运行，克隆《说文解字》数据（shuowenjiezi/shuowen）...")
    subprocess.check_call([
        "git", "clone", "--depth", "1",
        "https://github.com/shuowenjiezi/shuowen.git",
        os.path.join(HERE, "_shuowen", "_repo"),
    ])
    src = os.path.join(HERE, "_shuowen", "_repo", "data")
    dst = DATA
    os.makedirs(dst, exist_ok=True)
    for f in glob.glob(os.path.join(src, "*.json")):
        os.replace(f, os.path.join(dst, os.path.basename(f)))
    import shutil
    shutil.rmtree(os.path.join(HERE, "_shuowen", "_repo"), ignore_errors=True)


def build_index():
    ensure_data()
    idx = {}
    for p in glob.glob(os.path.join(DATA, "*.json")):
        try:
            d = json.load(io.open(p, encoding="utf-8"))
        except Exception:
            continue
        items = d if isinstance(d, list) else [d]
        for it in items:
            if not isinstance(it, dict):
                continue
            head = it.get("wordhead")
            if head and head not in idx:
                idx[head] = {
                    "id": it.get("id"),
                    "explanation": (it.get("explanation") or "").strip(),
                    "pinyin": it.get("pinyin_full") or it.get("pinyin") or "",
                    "radical": it.get("radical") or "",
                }
            for v in it.get("variants") or []:
                vh = (v or {}).get("wordhead")
                if vh and vh not in idx and head:
                    idx.setdefault(vh, {
                        "id": it.get("id"),
                        "explanation": (v.get("explanation") or "").strip(),
                        "variant_of": head,
                    })
    io.open(CACHE, "w", encoding="utf-8").write(json.dumps(idx, ensure_ascii=False))
    return idx


def index():
    if os.path.exists(CACHE):
        return json.load(io.open(CACHE, encoding="utf-8"))
    return build_index()


def lookup(idx, ch):
    """返回 (命中的字头, 条目) 或 (None, None)。先查本字，再查繁体字头。"""
    if ch in idx:
        return ch, idx[ch]
    t = TRAD.get(ch)
    if t and t in idx:
        return t, idx[t]
    return None, None


def game_chars():
    """优先读 node 导出的字表（只含图鉴字，不含部件）。"""
    p = os.path.join(HERE, "_shuowen", "chars.txt")
    if os.path.exists(p):
        return list(io.open(p, encoding="utf-8").read().strip())
    src = io.open(os.path.join(ROOT, "data.js"), encoding="utf-8").read()
    out, seen = [], set()
    for line in src.split("\n"):
        s = line.strip()
        # data.js 里字条以 "字": { 开头
        if len(s) > 4 and s[0] == '"' and s[1] != " " and ('": {' in s[:8]):
            ch = s[1:s.index('"', 1)]
            if len(ch) == 1 and ch not in seen:
                seen.add(ch)
                out.append(ch)
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    idx = index()
    if cmd == "index":
        idx = build_index()
        print("说文条目", len(idx))
        return
    if cmd == "check":
        for ch in sys.argv[2:]:
            head, e = lookup(idx, ch)
            print(ch, "→", head or "未收", "|", (e or {}).get("explanation", "")[:60])
        return
    if cmd == "report":
        # 与 apply_sources.py 用同一套判定，避免两份口径不一致
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "apply_sources", os.path.join(HERE, "apply_sources.py"))
        ap = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ap)
        chars = game_chars()
        src = {}
        for ch in chars:
            src.setdefault(ap.source_of(ch, idx), []).append(ch)
        order = sorted(src, key=lambda k: -len(src[k]))
        for k in order:
            print("%-22s %3d  %s" % (k, len(src[k]), "".join(src[k])))
        print("合计", len(chars))
        return


if __name__ == "__main__":
    main()
