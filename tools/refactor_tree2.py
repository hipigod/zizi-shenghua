# -*- coding: utf-8 -*-
"""字族树第二版：正交枝干 + 圆角母线，替代 17 条从根尖发散的曲线。

第一版问题：所有子节点各自的贝塞尔曲线都从根节点底部同一点出发，
17 个子节点张开接近 1100px，视觉上是一把扇子/烟花，没有树的结构感。
本版改成族谱常用的正交枝干：根 → 短主干 → 水平母枝（两端圆角下垂）
→ 每个子节点一条竖枝。子节点少（1 个）时仍用一条柔和的 S 曲线。
"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI = os.path.join(ROOT, "ui.js")

NEW = r'''  /* ================= R4 字族树 ================= */
  /* 族根必须覆盖全部字：历史上只写 6 个根，21 个字（朋、加、另、叻、肝、胆、天、
   * 夫、因、尖、歪、思、问、闷、闩、吕、回、品、吞、否、吐）在树里根本不显示。
   * 现按 family 实际分布列全 12 个根；「大」「不」字数太少，合并成一个展示框。
   *
   * 渲染（2026-10-29 两次重写）：
   * 旧版每层一个 flex 行 + L 形伪元素，读不出父子关系，就是一堆方块。
   * 第一版 SVG 用贝塞尔曲线连父子，但木族 17 个子节点全从根底部一点发散，
   * 像扇子不像树。本版改为族谱式正交枝干：根 → 主干 → 水平母枝（两端圆角
   * 下垂）→ 子节点竖枝；只有一个子节点时才用 S 曲线。 */
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

  /* R 普通节点半径 / RR 根节点半径 / GAP 同层间距 / RGAP 多根族根间距
   * LEVEL 层高：要容下节点直径 + 母枝高度 + 竖枝长度 */
  var FT = { R: 23, RR: 30, GAP: 15, RGAP: 52, LEVEL: 92, PAD_T: 34, PAD_B: 30, BUS: 18, CR: 11 };

  function renderFamilyTree() {
    var host = $("#codex-tree");
    host.innerHTML = "";
    var st = ZZSH.state.data;

    /* 子节点查表，避免递归里反复遍历 101 个字 */
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

      function place(node, left, depth, parent) {
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
        var self = { char: node, x: cx, y: y, depth: depth, kids: [] };
        if (parent) parent.kids.push(self);
        nodes.push(self);
        if (depth > maxDepth) maxDepth = depth;
        if (kids.length) {
          var c2 = left;
          kids.forEach(function (k) {
            var kw = span(k);
            place(k, c2, depth + 1, self);
            c2 += kw + FT.GAP;
          });
        }
      }

      var cursor = 0;
      roots.forEach(function (r) {
        place(r, cursor, 0, null);
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
        viewBox: "-10 0 " + Math.ceil(treeW + 20) + " " + Math.ceil(treeH),
        "class": "fam-svg",
        role: "img",
        "aria-label": t.name + "，已收集 " + gotCount + " / " + total
      });
      svg.setAttribute("width", Math.ceil(treeW + 20));
      svg.setAttribute("height", Math.ceil(treeH));

      /* 枝干渐变：靠根浓、末端淡 */
      var gid = "famgrad" + ti;
      var defs = svgEl("defs");
      var lg = svgEl("linearGradient", { id: gid, x1: "0", y1: "0", x2: "0", y2: "1" });
      lg.appendChild(svgEl("stop", { offset: "0", "stop-color": color, "stop-opacity": ".75" }));
      lg.appendChild(svgEl("stop", { offset: "1", "stop-color": color, "stop-opacity": ".28" }));
      defs.appendChild(lg);
      svg.appendChild(defs);

      var linkStroke = "url(#" + gid + ")";
      var gLink = svgEl("g", { "class": "fam-links" });
      var n1 = function (v) { return v.toFixed(1); };

      function addPath(d, w) {
        gLink.appendChild(svgEl("path", {
          d: d, "class": "fam-link", stroke: linkStroke, "stroke-width": w
        }));
      }

      nodes.forEach(function (p) {
        if (!p.kids.length) return;
        var r = p.depth === 0 ? FT.RR : FT.R;
        var topY = p.y + r;                       // 本节点底沿
        var busY = topY + FT.BUS;                 // 母枝高度

        /* 独生子：一条柔和 S 曲线，不用母枝 */
        if (p.kids.length === 1) {
          var k0 = p.kids[0];
          var y2a = k0.y - FT.R - 4;
          addPath("M" + n1(p.x) + " " + n1(topY + 2) +
            " C" + n1(p.x) + " " + n1(topY + (y2a - topY) * 0.5) +
            " " + n1(k0.x) + " " + n1(y2a - (y2a - topY) * 0.5) +
            " " + n1(k0.x) + " " + n1(y2a), 2.4);
          return;
        }

        /* 主干：从根底向下到母枝 */
        addPath("M" + n1(p.x) + " " + n1(topY) + " V" + n1(busY), 3);

        /* 母枝：左端竖枝 → 圆角 → 水平 → 圆角 → 右端竖枝，一笔画完 */
        var first = p.kids[0], last = p.kids[p.kids.length - 1];
        var crash = Math.min(FT.CR, (last.x - first.x) / 2, FT.BUS);
        var kidTop = first.y - FT.R - 4;
        addPath(
          "M" + n1(first.x) + " " + n1(kidTop) +
          " V" + n1(busY + crash) +
          " Q" + n1(first.x) + " " + n1(busY) + " " + n1(first.x + crash) + " " + n1(busY) +
          " H" + n1(last.x - crash) +
          " Q" + n1(last.x) + " " + n1(busY) + " " + n1(last.x) + " " + n1(busY + crash) +
          " V" + n1(kidTop), 2.2);

        /* 中间子节点：短竖枝 */
        for (var i = 1; i < p.kids.length - 1; i++) {
          addPath("M" + n1(p.kids[i].x) + " " + n1(busY) + " V" + n1(kidTop), 2.2);
        }

        /* 分叉处点一颗枝节，掩盖三线交汇的硬角 */
        gLink.appendChild(svgEl("circle", {
          cx: n1(p.x), cy: n1(busY), r: 2.6, "class": "fam-knot"
        }));
      });
      svg.appendChild(gLink);

      /* ---------- 节点 ---------- */
      nodes.forEach(function (n) {
        var ch = n.char;
        var info = D.chars[ch];
        var isRoot = n.depth === 0;
        var isPart = !info;                       // 纯部件节点（如 吕 之外的中间层部件）
        var got = isPart ? true : st.got.indexOf(ch) >= 0;
        var r = isRoot ? FT.RR : FT.R;

        var g = svgEl("g", {
          "class": "fam-node-g" + (isRoot ? " is-root" : "") +
            (isPart ? " part" : "") + (got ? "" : " locked"),
          transform: "translate(" + n1(n.x) + " " + n.y + ")",
          tabindex: got && !isPart ? "0" : "-1"
        });
        var ttl = svgEl("title");
        ttl.textContent = isPart ? (ch + "（部件）") : got ? ch : ("还没发现 · " + (info ? info.strokes + " 画" : ""));
        g.appendChild(ttl);

        g.appendChild(svgEl("circle", { r: r, "class": "disc" }));
        if (isRoot) g.appendChild(svgEl("circle", { r: r - 7, "class": "ring" }));

        var txt = svgEl("text", {
          x: 0, y: got ? 0 : -4, "text-anchor": "middle", "dominant-baseline": "central",
          "class": "glyph"
        });
        txt.textContent = got ? ch : "?";
        g.appendChild(txt);

        if (!got) {
          /* 笔画数放进圈里，避免圈外小字压在母枝上 */
          var cnt = svgEl("text", { x: 0, y: 11, "text-anchor": "middle", "class": "stroke-count" });
          cnt.textContent = info.strokes + "画";
          g.appendChild(cnt);
        } else if (!isRoot && childrenOf(ch).length) {
          /* 还能再长出下一代的字，右下点一颗小芽 */
          g.appendChild(svgEl("circle", { cx: r - 3, cy: r - 6, r: 3, "class": "bud" }));
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

      var scroll = document.createElement("div");
      scroll.className = "fam-scroll";
      scroll.appendChild(svg);
      box.appendChild(scroll);
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
print("ui.js 重写完成：%.0f → %.0f 字符" % (len(src), len(out)))
