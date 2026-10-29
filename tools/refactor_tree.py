# -*- coding: utf-8 -*-
"""把 ui.js 里的字族树模块整段替换成 SVG 树形渲染。

旧实现：每层一个 flex 行，靠一行伪元素的 L 形拐角暗示层级，
父子关系读不出来，视觉上就是一堆方块网格。

新实现：递归计算每个节点的水平中心（父居中于子），
用 SVG 贝塞尔曲线连枝，节点画成圆形果实，每个族一种颜色。
"""
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI = os.path.join(ROOT, "ui.js")

NEW = r'''  /* ================= R4 字族树 ================= */
  /* 族根必须覆盖全部字：历史上只写 6 个根，21 个字（朋、加、另、叻、肝、胆、天、
   * 夫、因、尖、歪、思、问、闷、闩、吕、回、品、吞、否、吐）在树里根本不显示。
   * 现按 family 实际分布列全 12 个根；「大」「不」字数太少，合并成一个展示框。
   *
   * 渲染方式（2026-10-29 重写）：旧版每层一个 flex 行 + 一个 L 形伪元素，
   * 看不出谁是谁的孩子，就是一堆方块。现在改成 SVG：
   * 递归算水平中心（父节点居中于子节点），贝塞尔曲线连枝，圆形节点当果实。
   * 每个族自带主色，卡片顶部有一条同色光带，12 个族一眼能分开。 */
  var TREE_ROOTS = [
    { root: "木", name: "木之族", color: "#5B8C5A" },
    { root: "日", name: "日之族", color: "#C9A227" },
    { root: "月", name: "月之族", color: "#6E7FA8" },
    { root: "人", name: "人之族", color: "#8D6E63" },
    { root: "口", name: "口之族", color: "#B5714E" },
    { root: "心", name: "心之族", color: "#C1666B" },
    { root: "火", name: "火之族", color: "#D2603A" },
    { root: "水", name: "水之族", color: "#4A7FA5" },
    { root: "一", name: "一之族", color: "#6B8E8A" },
    { root: "十", name: "十之族", color: "#A08A4B" },
    { root: "门", name: "门之族", color: "#6E7F8D" },
    { roots: ["大", "不"], name: "大字之族", color: "#9A7B4F" }
  ];

  var SVG_NS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  /* 树形几何常量：R 普通节点半径，RR 根节点半径，GAP 同层节点间距，
   * RGAP 多根族的根间距，LEVEL 层高（>2R + 笔画数标注，防止压枝） */
  var FT = { R: 26, RR: 32, GAP: 24, RGAP: 56, LEVEL: 86, PAD_T: 40, PAD_B: 40 };

  function renderFamilyTree() {
    var host = $("#codex-tree");
    host.innerHTML = "";
    var st = ZZSH.state.data;

    /* 子节点查表，避免在递归里反复遍历 101 个字 */
    var kidsMap = {};
    Object.keys(D.chars).forEach(function (c) {
      var p = D.chars[c].family;
      (kidsMap[p] = kidsMap[p] || []).push(c);
    });
    function childrenOf(node) { return kidsMap[node] || []; }

    TREE_ROOTS.forEach(function (t, ti) {
      var roots = t.roots || [t.root];
      var color = t.color || "#5B8C5A";
      var nodes = [], maxDepth = 0;

      /* 子树宽度 = 子节点宽度之和；叶子 = 一个节点宽 */
      function span(node) {
        var kids = childrenOf(node);
        if (!kids.length) return FT.R * 2;
        var w = 0;
        kids.forEach(function (k, i) { w += span(k) + (i ? FT.GAP : 0); });
        return Math.max(FT.R * 2, w);
      }

      function place(node, left, depth, px, py) {
        var kids = childrenOf(node), cx;
        if (!kids.length) {
          cx = left + span(node) / 2;
        } else {
          /* 父节点水平中心 = 首子与末子的中点，这是「像树」的关键 */
          var cur = left, first = null, last = null;
          kids.forEach(function (k) {
            var kw = span(k);
            if (first === null) first = cur + kw / 2;
            last = cur + kw / 2;
            cur += kw + FT.GAP;
          });
          cx = (first + last) / 2;
        }
        var y = FT.PAD_T + depth * FT.LEVEL;
        nodes.push({ char: node, x: cx, y: y, depth: depth, px: px, py: py });
        if (depth > maxDepth) maxDepth = depth;
        if (kids.length) {
          var c2 = left;
          kids.forEach(function (k) {
            var kw = span(k);
            place(k, c2, depth + 1, cx, y);
            c2 += kw + FT.GAP;
          });
        }
      }

      var cursor = 0;
      roots.forEach(function (r) {
        place(r, cursor, 0, null, null);
        cursor += span(r) + FT.RGAP;
      });

      var treeW = Math.max(cursor - FT.RGAP, FT.R * 2);
      var treeH = FT.PAD_T + maxDepth * FT.LEVEL + FT.R + FT.PAD_B;

      /* ---------- 卡片头：族名 + 进度条 + 计数 ---------- */
      var gotCount = 0, total = 0;
      nodes.forEach(function (n) {
        if (!D.chars[n.char]) return;
        total++;
        if (st.got.indexOf(n.char) >= 0) gotCount++;
      });
      var done = total > 0 && gotCount >= total;

      var box = document.createElement("div");
      box.className = "fam-box" + (done ? " done" : "");
      box.style.setProperty("--fam-color", color);
      var head = document.createElement("div");
      head.className = "fam-head";
      head.innerHTML =
        '<span class="fam-name">' + t.name + "</span>" +
        '<span class="fam-bar"><i style="width:' + Math.round(gotCount / total * 100) + '%"></i></span>' +
        '<span class="fam-count">' + gotCount + "/" + total + "</span>" +
        (done ? '<span class="fam-bloom">🌸</span>' : "");
      box.appendChild(head);

      /* ---------- 树本体 ---------- */
      var svg = svgEl("svg", {
        viewBox: "-8 0 " + Math.ceil(treeW + 16) + " " + Math.ceil(treeH),
        "class": "fam-svg",
        role: "img",
        "aria-label": t.name + "，已收集 " + gotCount + " / " + total
      });
      svg.style.maxWidth = Math.ceil(treeW + 16) + "px";

      /* 枝干渐变：靠根浓、末端淡 */
      var gid = "famgrad" + ti;
      var defs = svgEl("defs");
      var lg = svgEl("linearGradient", { id: gid, x1: "0", y1: "0", x2: "0", y2: "1" });
      lg.appendChild(svgEl("stop", { offset: "0", "stop-color": color, "stop-opacity": ".65" }));
      lg.appendChild(svgEl("stop", { offset: "1", "stop-color": color, "stop-opacity": ".2" }));
      defs.appendChild(lg);
      svg.appendChild(defs);

      /* 先铺枝条，压在节点底下 */
      var gLink = svgEl("g", { "class": "fam-links" });
      nodes.forEach(function (n) {
        if (n.px === null) return;
        var y1 = n.py + (n.depth === 1 ? FT.RR : FT.R) + 2;
        var y2 = n.y - FT.R - 4;
        var dy = y2 - y1;
        var d = "M" + n.px.toFixed(1) + " " + y1.toFixed(1) +
          " C" + n.px.toFixed(1) + " " + (y1 + dy * 0.45).toFixed(1) +
          " " + n.x.toFixed(1) + " " + (y2 - dy * 0.45).toFixed(1) +
          " " + n.x.toFixed(1) + " " + y2.toFixed(1);
        gLink.appendChild(svgEl("path", {
          d: d,
          "class": "fam-link",
          stroke: "url(#" + gid + ")",
          "stroke-width": Math.max(1.2, 2.8 - (n.depth - 1) * 0.5).toFixed(2)
        }));
      });
      svg.appendChild(gLink);

      /* 再画节点 */
      nodes.forEach(function (n) {
        var ch = n.char;
        var info = D.chars[ch];
        var isRoot = n.depth === 0;
        var isPart = !info;                       // 中间层部件（如 吕 之外的纯部件节点）
        var got = isPart ? true : st.got.indexOf(ch) >= 0;
        var r = isRoot ? FT.RR : FT.R;

        var g = svgEl("g", {
          "class": "fam-node-g" + (isRoot ? " is-root" : "") +
            (isPart ? " part" : "") + (got ? "" : " locked"),
          transform: "translate(" + n.x.toFixed(1) + " " + n.y + ")",
          tabindex: got && !isPart ? "0" : "-1"
        });
        var ttl = svgEl("title");
        ttl.textContent = isPart ? (ch + "（部件）") : got ? ch : ("还没发现 · " + (info ? info.strokes + " 画" : ""));
        g.appendChild(ttl);

        g.appendChild(svgEl("circle", { r: r, "class": "disc" }));
        if (isRoot) g.appendChild(svgEl("circle", { r: r - 7, "class": "ring" }));

        var txt = svgEl("text", {
          x: 0, y: 0, "text-anchor": "middle", "dominant-baseline": "central",
          "class": "glyph"
        });
        txt.textContent = got ? ch : "?";
        g.appendChild(txt);

        if (!got) {
          var cnt = svgEl("text", { x: 0, y: FT.R + 15, "text-anchor": "middle", "class": "stroke-count" });
          cnt.textContent = info.strokes + "画";
          g.appendChild(cnt);
        } else if (!isRoot && childrenOf(ch).length) {
          /* 还能再长出下一代的字，右下点一颗小芽 */
          g.appendChild(svgEl("circle", { cx: r - 3, cy: r - 7, r: 3.2, "class": "bud" }));
        }

        if (!isPart) {
          g.style.cursor = "pointer";
          g.addEventListener("click", function () {
            if (got) { showCard(ch); return; }
            ZZSH.fx.sndTap();
            toast("还没发现——去画布上碰碰运气吧");
          });
          g.addEventListener("keydown", function (ev) {
            if (ev.key !== "Enter" && ev.key !== " ") return;
            ev.preventDefault();
            if (got) showCard(ch);
          });
        }
        svg.appendChild(g);
      });

      box.appendChild(svg);
      host.appendChild(box);
    });
  }
'''

src = io.open(UI, encoding="utf-8").read()
start_mark = "  /* ================= R4 字族树 ================= */"
end_mark = "  /* ================= 成就 ================= */"
i = src.index(start_mark)
j = src.index(end_mark)
out = src[:i] + NEW + "\n" + src[j:]
io.open(UI, "w", encoding="utf-8", newline="").write(out)
print("ui.js 替换完成：%.0f → %.0f 字符" % (len(src), len(out)))
