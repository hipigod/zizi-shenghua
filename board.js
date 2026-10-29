/* ============================================================
 * 字字生花 · board.js
 * 画布字块：创建、拖拽（Pointer Events）、重叠检测、整理
 * board 只通过 bus 发事件，不直接调用 ui
 * ------------------------------------------------------------
 * v1.1 修复：
 *  - 悬停高亮改用「重叠面积」判定（原 elementFromPoint 总是命中被拖动的字块自身，高亮从不出现）
 *  - 所有落位统一夹紧在画布内（原合成回弹 / 新字可能跑到画布外看不见）
 *  - 合成失败真正弹开（原只改坐标不刷新位置）
 *  - 库存拖出的影子块尺寸跟随 --block，且不拦截命中
 *  - 窗口尺寸变化 / 横竖屏切换后，越界字块自动收回
 *  - 长按开卡与松手开卡不再重复触发
 * ============================================================ */
(function () {
  "use strict";
  var ZZSH = window.ZZSH;
  var bus = ZZSH.bus;

  var boardEl = null;
  var tiles = [];            // 画布上的字块 {el, x, y, char}
  var tid = 0;

  /* ---------- 坐标系：画布左上为原点 ---------- */
  function boardRect() { return boardEl.getBoundingClientRect(); }

  function TILE() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--block")) || 64;
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /* 把坐标夹紧到画布内（画布不可见时不处理） */
  function clampToBoard(t) {
    var r = boardRect();
    if (r.width <= 0 || r.height <= 0) return;
    var s = TILE();
    t.x = clamp(t.x, 0, Math.max(0, r.width - s));
    t.y = clamp(t.y, 0, Math.max(0, r.height - s));
  }

  function createTile(char, x, y, opts) {
    opts = opts || {};
    var t = { id: ++tid, char: char, x: x, y: y, el: null };
    var el = document.createElement("div");
    el.className = "tile" + (ZZSH.DATA.chars[char] && ZZSH.DATA.chars[char].rare ? " rare" : "");
    el.textContent = char;
    el.dataset.char = char;
    el.dataset.tid = t.id;
    boardEl.appendChild(el);
    t.el = el;
    position(t);
    tiles.push(t);
    if (opts.flash) {
      el.classList.add("merged-flash");
      setTimeout(function () { el.classList.remove("merged-flash"); }, 600);
    }
    return t;
  }

  function position(t) {
    clampToBoard(t);
    t.el.style.left = t.x + "px";
    t.el.style.top = t.y + "px";
  }

  /* 只把字块从 tiles 里摘掉，DOM 留着——合成时原料还要在画布上淡出一下才消失。 */
  function detachTile(t) {
    var i = tiles.indexOf(t);
    if (i >= 0) tiles.splice(i, 1);
    if (t.el) t.el.style.pointerEvents = "none";
  }

  function removeTile(t) {
    detachTile(t);
    if (t.el && t.el.parentNode) t.el.parentNode.removeChild(t.el);
  }

  function findByEl(el) {
    var id = parseInt(el && el.dataset.tid, 10);
    for (var i = 0; i < tiles.length; i++) if (tiles[i].id === id) return tiles[i];
    return null;
  }

  /* ---------- 拖拽状态机（首指锁定） ---------- */
  var drag = null;           // {tile, dx, dy, pointerId, fromInventory, ghost}
  var inputLocked = false;   // 合成动画期间锁定
  var lockTimer = null;
  var downPt = null;
  var pressTimer = null;
  var pressFired = false;    // 长按已开卡，松手时不再重复开

  function lockInput(ms) {
    inputLocked = true;
    clearTimeout(lockTimer);
    lockTimer = setTimeout(function () { inputLocked = false; }, ms || 300);
  }

  /* 陈旧 drag 急救：任何原因漏掉 pointerup 时，超时后强制复位，杜绝永久锁死 */
  var DRAG_MAX_MS = 20000;
  function reapStaleDrag() {
    if (!drag) return;
    if (Date.now() - (drag.startAt || 0) < DRAG_MAX_MS) return;
    if (drag.fromInventory && drag.ghost && drag.ghost.parentNode) drag.ghost.remove();
    else if (drag.tile && drag.tile.el) drag.tile.el.classList.remove("dragging");
    clearHover();
    setRecycleHot(false);
    drag = null;
    pressFired = false;
  }

  function onPointerDown(e) {
    reapStaleDrag();
    if (inputLocked) return;
    if (drag) return;                      // 首指锁定：同时只允许一个
    /* 只认主键：右键/中键绝不进入拖拽，避免右键拖动把字块误回收 */
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!e.target.classList || !e.target.classList.contains("tile")) return;
    /* 部件条在画布上方，合成字列表在左侧，两处都是拖出源 */
    if (e.target.closest(".inventory, .partbar")) return startInvDrag(e);
    if (!boardEl.contains(e.target)) return;

    var t = findByEl(e.target);
    if (!t) return;
    e.preventDefault();
    try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

    downPt = { x: e.clientX, y: e.clientY };
    var r = boardRect();
    drag = {
      tile: t, pointerId: e.pointerId, fromInventory: false, startAt: Date.now(),
      dx: e.clientX - (r.left + t.x),
      dy: e.clientY - (r.top + t.y)
    };
    t.el.classList.add("dragging");
    bus.emit("dragstart", { char: t.char });
  }

  /* 库存 → 画布：按住库存字块拖出（创建 ghost 跟随指针） */
  function startInvDrag(e) {
    var invTile = e.target.closest(".tile");
    if (!invTile) return;
    e.preventDefault();
    var char = invTile.dataset.char;
    var s = TILE();
    downPt = { x: e.clientX, y: e.clientY };
    /* 指针捕获：不设的话，指针移出窗口或松手落在窗口外，
     * pointerup/pointercancel 不会到达 document，drag 永久非空 → 整个画布再也拖不动 */
    try { invTile.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    var ghost = invTile.cloneNode(true);
    ghost.classList.add("dragging", "ghost");
    ghost.style.position = "fixed";
    ghost.style.width = s + "px";
    ghost.style.height = s + "px";
    ghost.style.lineHeight = (s - 3) + "px";
    ghost.style.left = (e.clientX - s / 2) + "px";
    ghost.style.top = (e.clientY - s / 2) + "px";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "85";
    document.body.appendChild(ghost);
    drag = { pointerId: e.pointerId, fromInventory: true, startAt: Date.now(), char: char, ghost: ghost };
    bus.emit("dragstart", { char: char });
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    setRecycleHot(pointInInventory(e.clientX, e.clientY));  // 拖到库存上方=提示可收回
    var r = boardRect();
    var s = TILE();
    if (drag.fromInventory) {
      drag.ghost.style.left = (e.clientX - s / 2) + "px";
      drag.ghost.style.top = (e.clientY - s / 2) + "px";
      if (pointInBoard(e.clientX, e.clientY)) {
        hoverFeedback({ x: e.clientX - r.left - s / 2, y: e.clientY - r.top - s / 2 }, null);
      } else {
        clearHover();
      }
      return;
    }
    drag.tile.x = e.clientX - r.left - drag.dx;
    drag.tile.y = e.clientY - r.top - drag.dy;
    position(drag.tile);
    hoverFeedback(drag.tile, drag.tile);
  }

  /* 拖动经过时的目标高亮：与合成判定使用同一套「重叠 >40%」规则，所见即所得 */
  var hoverTarget = null;
  function hoverFeedback(rect, self) {
    var target = bestOverlap(rect, self);
    if (hoverTarget && hoverTarget !== target) hoverTarget.el.classList.remove("drop-hint");
    hoverTarget = target;
    if (hoverTarget) hoverTarget.el.classList.add("drop-hint");
  }
  function clearHover() {
    if (hoverTarget) { hoverTarget.el.classList.remove("drop-hint"); hoverTarget = null; }
  }
  function pointInBoard(cx, cy) {
    var r = boardRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  }
  function pointInInventory(cx, cy) {
    var inv = document.querySelector(".inventory");
    if (!inv) return false;
    var r = inv.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  }
  function setRecycleHot(on) {
    var inv = document.querySelector(".inventory");
    if (inv) inv.classList.toggle("recycle-hot", !!on);
  }
  /* 按 DOM 元素收回画布字块（右键删除入口） */
  function removeTileByEl(el) {
    var t = findByEl(el);
    if (!t) return null;
    var c = t.char;
    removeTile(t);
    bus.emit("tileRemoved", { char: c });
    return c;
  }

  /* ---------- 重叠面积检测（>40% 触发合成） ---------- */
  function overlapRatio(a, b) {
    var s = TILE();
    var x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    var x2 = Math.min(a.x + s, b.x + s), y2 = Math.min(a.y + s, b.y + s);
    var w = x2 - x1, h = y2 - y1;
    if (w <= 0 || h <= 0) return 0;
    return (w * h) / (s * s);
  }
  /* 返回与 rect 重叠最大且 >40% 的字块（排除 self） */
  function bestOverlap(rect, self) {
    var best = null, bestRatio = 0;
    tiles.forEach(function (o) {
      if (o === self) return;
      var ratio = overlapRatio(rect, o);
      if (ratio > bestRatio) { bestRatio = ratio; best = o; }
    });
    return bestRatio > 0.4 ? best : null;
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var d = drag;
    drag = null;
    clearHover();
    setRecycleHot(false);

    if (d.fromInventory) {
      d.ghost.remove();
      if (!pointInBoard(e.clientX, e.clientY)) return;   // 拖回库存区=取消
      var r = boardRect();
      var s = TILE();
      var nt = createTile(d.char, e.clientX - r.left - s / 2, e.clientY - r.top - s / 2);
      bus.emit("tilePlaced", { char: d.char });
      // 若落点覆盖其他字块，直接尝试合成（库存拖出直接合成路径）
      tryOverlapMerge(nt);
      return;
    }

    d.tile.el.classList.remove("dragging");

    /* 原地点击（位移 <8px）= 打开字源卡，不回收也不合成 */
    if (isTap(e)) {
      if (!pressFired) bus.emit("openCard", { char: d.tile.char });
      pressFired = false;
      return;
    }
    pressFired = false;

    /* 拖回库存区域 = 回收 */
    var inv = document.querySelector(".inventory");
    if (inv) {
      var ir = inv.getBoundingClientRect();
      if (e.clientX >= ir.left && e.clientX <= ir.right && e.clientY >= ir.top && e.clientY <= ir.bottom) {
        removeTile(d.tile);
        bus.emit("tileRemoved", { char: d.tile.char });
        return;
      }
    }

    tryOverlapMerge(d.tile);
  }

  /* 找与 t 重叠 >40% 的最大重叠块，尝试合成 */
  function tryOverlapMerge(t) {
    if (inputLocked) return;
    var best = bestOverlap(t, t);
    if (best) bus.emit("mergeAttempt", { a: t, b: best });   // ui/engine 接手
  }

  /* 指针捕获丢失（系统手势打断） */
  function onPointerCancel(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    abortDrag();
  }

  /* 拖拽异常终止兜底：捕获丢失 / 窗口失焦 / 页面隐藏，一律按「取消」处理。
   * 核心原则——drag 宁可空，绝不能残留非空值，否则后续 pointerdown 全部被首指锁定挡掉。 */
  function abortDrag() {
    if (!drag) return;
    if (drag.fromInventory) {
      if (drag.ghost && drag.ghost.parentNode) drag.ghost.remove();
    } else if (drag.tile && drag.tile.el) {
      drag.tile.el.classList.remove("dragging");
    }
    clearHover();
    setRecycleHot(false);
    drag = null;
    pressFired = false;
  }

  /* ---------- 点击 / 长按 打开字源卡 ---------- */
  /* 指针位移超过阈值视为拖拽，拖拽结束的 click 不算点击 */
  function isTap(e) {
    if (!downPt) return true;
    return Math.abs(e.clientX - downPt.x) < 8 && Math.abs(e.clientY - downPt.y) < 8;
  }
  function onPressStart(e) {
    pressFired = false;
    if (!e.target.classList || !e.target.classList.contains("tile")) return;
    if (e.target.closest(".inventory, .partbar")) return;
    var t = findByEl(e.target);
    if (!t) return;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(function () {
      pressFired = true;
      bus.emit("openCard", { char: t.char });
    }, 550);
  }
  function onPressEnd() { clearTimeout(pressTimer); }
  function onPressMove(e) {
    /* 只有真正移动才取消长按（触屏手指天然抖动几像素） */
    if (downPt && (Math.abs(e.clientX - downPt.x) >= 8 || Math.abs(e.clientY - downPt.y) >= 8)) {
      clearTimeout(pressTimer);
    }
  }

  /* ---------- 合成反馈 ---------- */
  /* 合成失败：两块各自向外弹开，不再重叠 */
  function nudgeApart(a, b) {
    var s = TILE();
    var dir = a.x <= b.x ? -1 : 1;
    [a, b].forEach(function (t) { t.el.style.transition = "left 180ms ease-out, top 180ms ease-out"; });
    a.x += dir * s * 0.7;
    b.x -= dir * s * 0.7;
    position(a); position(b);
    /* 靠墙时水平弹不开，就改成上下错开 */
    if (overlapRatio(a, b) > 0.2) {
      a.y -= s * 0.6; b.y += s * 0.6;
      position(a); position(b);
    }
    setTimeout(function () {
      [a, b].forEach(function (t) { if (t.el) t.el.style.transition = ""; });
    }, 200);
  }

  /* 合成动画：两个字块向新字的位置汇聚 → 一起消隐 → 新字从原地长出来。
   * 原料用完就消失，画布上只留结果；否则连合几次就堆满零散字块。
   * done(cx, cy) 回调传回新字的画布坐标（左上角，已夹紧） */
  function mergeAnimation(a, b, newChar, done) {
    var s = TILE();
    var r = boardRect();
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    /* 先算出新字的最终落点（夹紧画布内），原料朝这个点汇聚：
       靠边合成时不会出现「原料在中间消失、新字却偏到一边」的错位 */
    var cx = clamp(mx, 0, Math.max(0, r.width - s));
    var cy = clamp(my, 0, Math.max(0, r.height - s));
    var gather = 150, fade = 180;

    [a, b].forEach(function (t) {
      if (!t.el) return;
      t.el.style.transition = "left " + gather + "ms cubic-bezier(.4, 0, .2, 1), top " + gather +
        "ms cubic-bezier(.4, 0, .2, 1), transform " + fade + "ms ease-out, opacity " + fade + "ms ease-out";
    });
    a.x = cx; a.y = cy; position(a);
    b.x = cx; b.y = cy; position(b);

    setTimeout(function () {
      /* 先摘出 tiles（淡出期间不能被拖、不能被重叠检测命中），DOM 留到动画结束 */
      detachTile(a);
      detachTile(b);
      [a, b].forEach(function (t) {
        if (!t.el) return;
        t.el.style.left = cx + "px";
        t.el.style.top = cy + "px";
        t.el.classList.add("merging-out");
      });
      if (typeof done === "function") done(cx, cy);
      setTimeout(function () {
        [a, b].forEach(function (t) {
          if (t.el && t.el.parentNode) t.el.parentNode.removeChild(t.el);
        });
      }, fade + 60);
    }, gather);
  }

  /* ---------- 整理画布 ---------- */
  function tidy() {
    // 移除重复字（同字只留一个）
    var seen = {};
    tiles.slice().forEach(function (t) {
      if (seen[t.char]) removeTile(t);
      else seen[t.char] = true;
    });
    layoutGrid();
  }
  function layoutGrid() {
    var r = boardRect();
    var s = TILE() + 14;
    var cols = Math.max(1, Math.floor((r.width - 24) / s));
    tiles.forEach(function (t, i) {
      t.x = 24 + (i % cols) * s;
      t.y = 24 + Math.floor(i / cols) * s;
      position(t);
    });
  }
  function clearBoard() {
    tiles.slice().forEach(removeTile);
  }
  function count() { return tiles.length; }
  function hasChar(c) {
    return tiles.filter(function (t) { return t.char === c; }).length;
  }

  /* 指定字块高亮（提示三级） */
  function highlightChars(chars) {
    tiles.forEach(function (t) {
      if (chars.indexOf(t.char) >= 0) {
        t.el.classList.remove("hint-glow");
        void t.el.offsetWidth;            // 重启动画
        t.el.classList.add("hint-glow");
        setTimeout(function () { if (t.el) t.el.classList.remove("hint-glow"); }, 3200);
      }
    });
  }

  /* 初始字块：新手期画布中央放 日 + 月（延迟到游戏界面可见后调用） */
  function seedTiles() {
    if (ZZSH.state.data.guide.done || ZZSH.state.data.got.length > 0) return;
    var r = boardRect();
    if (r.width <= 0) {
      // 容器尚未可见：下一帧重试
      requestAnimationFrame(seedTiles);
      return;
    }
    if (tiles.length === 0) {
      var cx = r.width / 2, cy = r.height / 2;
      createTile("日", cx - TILE() - 30, cy - TILE() / 2);
      createTile("月", cx + 30, cy - TILE() / 2);
    }
  }

  /* 尺寸变化：把越界字块收回画布 */
  var resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { tiles.forEach(position); }, 120);
  }

  /* ---------- 初始化 ---------- */
  function init() {
    boardEl = document.getElementById("board");
    document.addEventListener("pointerdown", onPressStart, { passive: false });
    document.addEventListener("pointerdown", onPointerDown, { passive: false });
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp, { passive: false });
    document.addEventListener("pointercancel", onPointerCancel, { passive: false });
    document.addEventListener("lostpointercapture", abortDrag);
    window.addEventListener("blur", abortDrag);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) abortDrag();
    });
    /* 点击开卡在 pointerup 里处理：setPointerCapture 后 click 的 target 会变成画布，靠不住 */
    document.addEventListener("pointerup", onPressEnd);
    document.addEventListener("pointercancel", onPressEnd);
    document.addEventListener("pointermove", onPressMove);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", function () { setTimeout(onResize, 300); });
  }

  ZZSH.board = {
    init: init,
    seedTiles: seedTiles,
    createTile: createTile,
    removeTile: removeTile,
    removeTileByEl: removeTileByEl,
    tidy: tidy,
    layoutGrid: layoutGrid,
    clearBoard: clearBoard,
    count: count,
    hasChar: hasChar,
    /* 外部（如拖动分栏）改变画布尺寸后，主动把越界字块收回画布 */
    clampAll: function () { tiles.forEach(position); },
    lockInput: lockInput,
    highlightChars: highlightChars,
    mergeAnimation: mergeAnimation,
    nudgeApart: nudgeApart,
    TILE: TILE
  };
})();
