# -*- coding: utf-8 -*-
"""把 tools/fulltest_result.md 转成可直接在浏览器打开的 HTML 报告。
用法：python tools/make_report.py
"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OK = "\u2713"          # ✓
DASH = "\u2014"          # —

CSS = (
    "body{font:14px/1.8 system-ui;max-width:1100px;margin:24px auto;padding:0 16px;color:#222}"
    "table{border-collapse:collapse;font-size:13px}"
    "th,td{border:1px solid #ddd;padding:4px 9px;text-align:center}"
    "th{background:#f3efe4;position:sticky;top:0}"
    "td.c{font-size:19px;font-family:'LXGW WenKai',serif}"
    ".ok{color:#2e7d32}.no{color:#c62828;font-weight:700}.na{color:#9e9e9e}"
    "h2{font-weight:500}.note{background:#f6f2e8;padding:8px 12px;border-radius:6px;font-size:13px}"
)


def main():
    md = io.open(os.path.join(ROOT, "tools", "fulltest_result.md"), encoding="utf-8").read().strip().split("\n")
    head = [x.strip() for x in md[0].strip("|").split("|")]
    rows = [[x.strip() for x in r.strip("|").split("|")] for r in md[2:] if r.strip()]
    n = len(rows)

    out = ['<!doctype html><meta charset="utf-8"><title>字字生花 逐字全量测试</title>',
           "<style>" + CSS + "</style>",
           "<h2>字字生花 · 逐字全量测试（%d 字）</h2>" % n,
           '<div class="note">测试脚本：tools/fulltest.html（Chrome headless，走真实 DOM 与真实点击）。'
           '卡片路径：桌面右侧栏。<br>'
           '「—(skip档)」= 该字设为 skip 档，不走据义造字，改走文字提示；'
           '「—(源无此字)」= hanzi-writer-data 未收录该生僻字，点笔顺走大字回退（已知限制）。</div>',
           "<h2>汇总</h2><table><tr><th>测试项</th><th>通过</th></tr>"]
    for i, name in enumerate(head[1:], start=1):
        c = sum(1 for r in rows if r[i] == OK)
        out.append('<tr><td>%s</td><td class="ok">%d / %d</td></tr>' % (name, c, n))
    out.append("</table><h2>逐字明细</h2><table><thead><tr>")
    out += ["<th>%s</th>" % h for h in head]
    out.append("</tr></thead><tbody>")
    for r in rows:
        cells = ['<td class="c">%s</td>' % r[0]]
        for x in r[1:]:
            cls = "ok" if x == OK else ("na" if DASH in x else "no")
            cells.append('<td class="%s">%s</td>' % (cls, x))
        out.append("<tr>" + "".join(cells) + "</tr>")
    out.append("</tbody></table>")

    p = os.path.join(ROOT, "tools", "fulltest_report.html")
    io.open(p, "w", encoding="utf-8").write("\n".join(out))
    print("OK %s (%d 行)" % (p, n))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
