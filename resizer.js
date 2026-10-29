/* ============================================================
 * 字字生花 · resizer.js
 * 库存区 / 字源卡区 与画布之间的分割条拖动调节
 * ------------------------------------------------------------
 * 设计要点：
 *  - 只改 CSS 变量 --inv-w / --card-w，画布取 grid 的 1fr 自适应，
 *    因此不碰任何布局计算代码，也不会和 .board 的绝对定位打架
 *  - 画布变窄后可能把已放下的字块挤出边界，拖动的每一帧通知 board 收敛
 *  - 宽度存独立 localStorage key（不进存档），清档不会重置布局
 *  - 窗口变化时重新夹紧上限，但不写回存储（避免临时变小屏把设置永久压小）
 *  - 双击恢复默认；聚焦后 ←/→ 微调（Shift 加大步长），Home 复位
 * ============================================================ */
(function () {
  "use strict";

  var KEY = "zzsh_layout_v1";
  var DEF = { inv: 240, card: 320 };

  /* 库存最小 164：内边距 20 后剩 144，正好放两列 64px 字块（64*2+8=136）。
     再小就只能单列，很难看。 */
  var LIM = {
    inv:  { min: 164, max: 460 },
    card: { min: 240, max: 560 }
  };
  var RZ_W = 6;          // 与 CSS 的 --rz-w 保持一致
  var BOARD_MIN = 320;   // 画布无论如何至少留这么宽

  var layoutEl = null;
  var rzEl = { inv: null, card: null };
  var cur = { inv: DEF.inv, card: DEF.card };
  var written = { inv: null, card: null };
  var rafId = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function layoutW() {
    return (layoutEl && layoutEl.clientWidth) || window.innerWidth;
  }

  /* 上限受另两侧与画布最小宽度约束，防止把画布挤没 */
  function maxFor(which) {
    var other = which === "inv" ? cur.card : cur.inv;
    var avail = layoutW() - other - RZ_W * 2 - BOARD_MIN;
    return Math.max(LIM[which].min, Math.min(LIM[which].max, avail));
  }

  function paint(which) {
    var v = Math.round(clamp(cur[which], LIM[which].min, maxFor(which)));
    cur[which] = v;
    var el = rzEl[which];
    if (el) el.setAttribute("aria-valuenow", v);
    /* 幂等写入：值没变就不碰样式，避免 ResizeObserver 里来回触发 */
    if (written[which] === v) return;
    written[which] = v;
    document.documentElement.style.setProperty(
      which === "inv" ? "--inv-w" : "--card-w", v + "px");
  }

  /* 画布尺寸变了，把越界字块收回（按帧节流，拖动时跟手不卡） */
  function queueBoardClamp() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(function () {
      rafId = 0;
      if (window.ZZSH && window.ZZSH.board && window.ZZSH.board.clampAll) {
        window.ZZSH.board.clampAll();
      }
    });
  }

  function setWidth(which, w) {
    cur[which] = w;
    paint(which);
    queueBoardClamp();
  }

  /* ---------- 持久化（独立 key，失败静默） ---------- */
  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && typeof o.inv === "number") cur.inv = o.inv;
      if (o && typeof o.card === "number") cur.card = o.card;
    } catch (e) { /* 隐私模式或数据损坏：用默认值 */ }
  }

  function save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ inv: cur.inv, card: cur.card }));
    } catch (e) { /* 存不了就算了，不影响本次拖动 */ }
  }

  /* ---------- 拖动 ---------- */
  function bind(which) {
    var el = rzEl[which];
    if (!el) return;

    var active = false;
    var pid = null;
    var startX = 0;
    var startW = 0;

    el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      active = true;
      pid = e.pointerId;
      startX = e.clientX;
      startW = cur[which];
      el.classList.add("dragging");
      document.body.classList.add("rz-dragging");
      try { el.setPointerCapture(pid); } catch (err) {}
      try { el.focus({ preventScroll: true }); } catch (err) { el.focus(); }
      /* 别让 board 的全局 pointerdown 处理器把这次按压当成画布操作 */
      e.stopPropagation();
    });

    el.addEventListener("pointermove", function (e) {
      if (!active) return;
      var dx = e.clientX - startX;
      setWidth(which, which === "inv" ? startW + dx : startW - dx);
      e.stopPropagation();
    });

    function end(e) {
      if (!active) return;
      active = false;
      el.classList.remove("dragging");
      document.body.classList.remove("rz-dragging");
      try { el.releasePointerCapture(pid); } catch (err) {}
      save();
      if (e) e.stopPropagation();
    }

    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", function () { if (active) end(); });

    /* 双击复位 */
    el.addEventListener("dblclick", function (e) {
      e.preventDefault();
      setWidth(which, DEF[which]);
      save();
    });

    /* 键盘微调 */
    el.addEventListener("keydown", function (e) {
      var step = e.shiftKey ? 40 : 16;
      var dir = which === "inv" ? 1 : -1;   // 左栏往右变宽，右栏往右变窄
      if (e.key === "ArrowLeft") setWidth(which, cur[which] - step * dir);
      else if (e.key === "ArrowRight") setWidth(which, cur[which] + step * dir);
      else if (e.key === "Home") setWidth(which, DEF[which]);
      else return;
      e.preventDefault();
      save();
    });
  }

  function onWinResize() {
    paint("inv");
    paint("card");
    queueBoardClamp();
  }

  function init() {
    layoutEl = document.querySelector(".layout");
    rzEl.inv = document.getElementById("rz-inv");
    rzEl.card = document.getElementById("rz-card");
    if (!layoutEl || !rzEl.inv || !rzEl.card) return;

    load();
    paint("inv");
    paint("card");
    bind("inv");
    bind("card");

    window.addEventListener("resize", onWinResize);
    window.addEventListener("orientationchange", function () {
      setTimeout(onWinResize, 300);
    });

    /* 布局容器自身尺寸变化（切屏、地址栏收缩）也要重新夹紧：
       封面屏时 .layout 不可见、量不到宽度，进游戏屏后才拿到真实宽度 */
    if (window.ResizeObserver) {
      var ro = new window.ResizeObserver(function () {
        paint("card");
        paint("inv");
        queueBoardClamp();
      });
      ro.observe(layoutEl);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
