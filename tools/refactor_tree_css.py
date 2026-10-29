# -*- coding: utf-8 -*-
"""替换 style.css 里的字族树样式（.fam-* 段）。

旧样式：方块节点 + 伪元素 L 形拐角，读不出层级。
新样式：SVG 圆形节点（果实）+ 族色光带 + 进度条 + 悬停阴影。
"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = os.path.join(ROOT, "style.css")

NEW = '''/* ---------- 字族树（SVG 树形） ---------- */
.fam-box {
  position: relative;
  max-width: 760px;
  margin: 0 auto 16px;
  padding: 12px 10px 4px;
  border: 1px solid rgba(43, 43, 43, .1);
  border-radius: 18px;
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 255, 255, .9), rgba(255, 255, 255, 0) 62%),
    linear-gradient(180deg, #FFFDF7 0%, #F9F3E5 100%);
  box-shadow: 0 1px 2px rgba(43, 43, 43, .04), 0 8px 22px rgba(43, 43, 43, .055);
  overflow: hidden;
}
/* 顶部一道族色光带，12 个族靠颜色分开 */
.fam-box::before {
  content: "";
  position: absolute;
  left: 16px;
  right: 16px;
  top: 0;
  height: 3px;
  border-radius: 0 0 3px 3px;
  background: linear-gradient(90deg, transparent, var(--fam-color), transparent);
  opacity: .55;
}
.fam-box.done::before { opacity: .9; }
.fam-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px 2px;
}
.fam-name {
  font-family: var(--font-kai);
  font-size: 15px;
  letter-spacing: 3px;
  color: var(--ink);
}
.fam-bar {
  margin-left: auto;
  width: 70px;
  height: 4px;
  border-radius: 99px;
  background: rgba(43, 43, 43, .08);
  overflow: hidden;
}
.fam-bar i {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: var(--fam-color);
  transition: width .6s cubic-bezier(.4, 1.1, .4, 1);
}
.fam-count {
  font-size: 12px;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
  min-width: 34px;
  text-align: right;
}
.fam-bloom { font-size: 15px; line-height: 1; }

.fam-svg {
  display: block;
  width: 100%;
  height: auto;
  margin: 0 auto;
}
.fam-link {
  fill: none;
  stroke-linecap: round;
}

/* 节点：圆形果实 */
.fam-node-g { outline: none; }
.fam-node-g .disc {
  fill: #FFFDF6;
  stroke: var(--fam-color);
  stroke-width: 2;
  transition: stroke-width .18s ease;
}
.fam-node-g:hover .disc,
.fam-node-g:focus-visible .disc { stroke-width: 3; }
.fam-node-g:hover { filter: drop-shadow(0 3px 7px rgba(43, 43, 43, .2)); }
.fam-node-g .glyph {
  font-family: var(--font-kai);
  font-size: 28px;
  fill: var(--ink);
  pointer-events: none;
}
.fam-node-g.is-root .disc {
  fill: var(--fam-color);
  stroke: none;
  filter: drop-shadow(0 3px 8px rgba(43, 43, 43, .18));
}
.fam-node-g.is-root .glyph {
  font-size: 33px;
  fill: #FFFDF7;
}
.fam-node-g .ring {
  fill: none;
  stroke: rgba(255, 253, 247, .5);
  stroke-width: 1.1;
  stroke-dasharray: 2 4;
  pointer-events: none;
}
.fam-node-g.part .disc {
  fill: rgba(255, 253, 247, .72);
  stroke-dasharray: 4 3;
  stroke-opacity: .55;
}
.fam-node-g.part .glyph { fill: var(--ink-soft); }

/* 未发现：虚线空圈 + 问号 + 笔画数 */
.fam-node-g.locked { cursor: pointer; }
.fam-node-g.locked .disc {
  fill: rgba(255, 255, 255, .5);
  stroke: rgba(43, 43, 43, .2);
  stroke-width: 1.4;
  stroke-dasharray: 5 4;
}
.fam-node-g.locked:hover .disc { stroke-width: 2.2; }
.fam-node-g.locked .glyph {
  font-family: var(--font-ui);
  font-size: 20px;
  fill: rgba(43, 43, 43, .3);
}
.fam-node-g .stroke-count {
  font-family: var(--font-ui);
  font-size: 9px;
  fill: rgba(43, 43, 43, .45);
  paint-order: stroke;
  stroke: #FAF5E8;
  stroke-width: 3px;
  stroke-linejoin: round;
  pointer-events: none;
}
.fam-node-g .bud {
  fill: var(--fam-color);
  opacity: .75;
  pointer-events: none;
}

'''

src = io.open(CSS, encoding="utf-8").read()
start_mark = ".fam-box {"
end_mark = "/* ============================================================\n * ④ 成就"
i = src.index(start_mark)
j = src.index(end_mark)
out = src[:i] + NEW + src[j:]
io.open(CSS, "w", encoding="utf-8", newline="").write(out)
print("style.css 替换完成：%.0f → %.0f 字符" % (len(src), len(out)))
