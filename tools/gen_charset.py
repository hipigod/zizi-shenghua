# -*- coding: utf-8 -*-
"""从项目源文件提取会渲染到界面上的汉字，生成字体子集字符集。
去掉注释后再抽取 CJK，避免把注释里的字也打进 woff2。
用法：python tools/gen_charset.py > tools/charset.txt
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ["data.js", "ui.js", "engine.js", "board.js", "fx.js", "share.js",
         "main.js", "state.js", "index.html"]
PUNCT = "，。！？、；：（）「」『』《》…—·～“”‘’"

def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    s = re.sub(r"(?m)//[^\n]*", "", s)
    s = re.sub(r"(?m)^\s*<!--.*?-->\s*$", "", s, flags=re.S)
    return s

def main():
    chars = set(PUNCT)
    for f in FILES:
        p = os.path.join(ROOT, f)
        if not os.path.exists(p):
            continue
        txt = strip_comments(io.open(p, encoding="utf-8").read())
        for ch in txt:
            if "\u4e00" <= ch <= "\u9fff":
                chars.add(ch)
    # 数字与常用符号一并保留，避免界面里混排
    for c in "0123456789/+-×?":
        chars.add(c)
    sys.stdout.write("".join(sorted(chars)))
    return 0

if __name__ == "__main__":
    sys.exit(main())
