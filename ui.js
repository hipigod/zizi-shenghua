/* ============================================================
 * 字字生花 · ui.js
 * 界面全集：屏幕切换、库存、字源卡、图鉴、成就、选择面板、
 * 提示、解锁/成就 toast、双通关、引导、设置
 * ============================================================ */
(function () {
  "use strict";
  var ZZSH = window.ZZSH;
  var D = ZZSH.DATA;
  var bus = ZZSH.bus;
  var $ = function (s) { return document.querySelector(s); };

  /* ================= 屏幕切换 ================= */
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (s) {
      s.classList.add("hidden");
    });
    $(id).classList.remove("hidden");
    if (id === "#screen-game") {
      // 画布从 hidden 变可见后补放初始字块
      ZZSH.board.seedTiles();
    }
  }

  /* ================= Toast ================= */
  var toastTimer = null;
  function toast(text, opts) {
    opts = opts || {};
    var el = $("#toast");
    el.textContent = text;
    el.className = "toast show" + (opts.gold ? " achv-toast" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = "toast"; }, opts.long ? 3400 : 2200);
  }

  /* ================= 库存 ================= */
  function renderInventory() {
    var inv = $("#inventory");
    var st = ZZSH.state.data;

    // 清空重建（保留部件组，重建主线组）
    inv.innerHTML = "";
    // 回收提示条（拖拽悬停库存时点亮，必须每次重建，否则被上面的清空带走）
    var tip = document.createElement("div");
    tip.className = "recycle-tip";
    tip.textContent = "🗑 松手就收回";
    inv.appendChild(tip);

    /* 部件组 */
    var g = document.createElement("div");
    g.className = "inv-group";
    g.innerHTML = '<div class="inv-head">▾ 部件</div>';
    var items = document.createElement("div");
    items.className = "inv-items";
    st.unlockedParts.forEach(function (p) {
      var t = document.createElement("div");
      t.className = "tile";
      t.textContent = p;
      t.dataset.char = p;
      t.title = "长按/点击查看说明";
      items.appendChild(t);
    });
    g.appendChild(items);
    inv.appendChild(g);

    /* 主线分组：该线的已得字 */
    Object.keys(D.lines).sort(function (a, b) {
      return D.lines[a].order - D.lines[b].order;
    }).forEach(function (lineId) {
      var line = D.lines[lineId];
      var gotInLine = st.got.filter(function (c) {
        return D.chars[c] && D.chars[c].line === lineId;
      });
      var total = Object.keys(D.chars).filter(function (c) {
        return D.chars[c].line === lineId;
      }).length;
      var head = document.createElement("div");
      head.className = "inv-head" + (gotInLine.length === 0 ? " locked" : "");
      head.innerHTML = '<span class="dot" style="background:' + line.color + '"></span>' +
        line.emoji + " " + line.name + " " + gotInLine.length + "/" + total;
      var grp = document.createElement("div");
      grp.className = "inv-group";
      grp.appendChild(head);
      var its = document.createElement("div");
      its.className = "inv-items";
      gotInLine.forEach(function (c) {
        var t = document.createElement("div");
        t.className = "tile" + (D.chars[c].rare ? " rare" : "");
        t.textContent = c;
        t.dataset.char = c;
        its.appendChild(t);
      });
      grp.appendChild(its);
      inv.appendChild(grp);
    });
  }

  /* ================= 字源卡 ================= */
  var TIP_HTML = '<div class="cardcol-tip">点击字块查看字源卡<br>右键卡片可关闭</div>';
  function closeBtnHTML() {
    return '<button class="cc-close" data-close="1" aria-label="关闭卡片" title="关闭（也可右键关闭）">×</button>';
  }
  function cardHTML(c) {
    var info = D.chars[c];
    if (!info) return partCardHTML(c);
    var line = D.lines[info.line];
    var tags = '<span class="cc-tag line-tag" style="background:' + line.color + '">' + line.name + '</span>' +
      '<span class="cc-tag">' + info.structure + '结构</span>' +
      (info.rare ? '<span class="cc-tag rare-tag">生僻彩蛋</span>' : "") +
      (info.triple ? '<span class="cc-tag rare-tag">三叠字</span>' : "");
    var recipe = ZZSH.engine.findRecipeFor(c);
    var recipeStr = recipe ? (recipe.a + " + " + recipe.b) : "";
    var html = '<div class="char-card">' +
      closeBtnHTML() +
      '<div class="cc-head"><div class="cc-char">' + c + '</div>' +
      '<div class="cc-meta"><div class="pinyin">' + info.pinyin + '</div>' + tags + "</div></div>" +
      '<div class="cc-sec"><div class="cc-recipe">配方：' + recipeStr + "</div></div>" +
      (info.origin ? '<div class="cc-sec"><div class="cc-sec-label">📜 本义</div>' +
        '<div class="cc-origin">' + info.origin + "</div>" +
        (info.originSource ? '<div class="cc-source">——参考 ' + info.originSource + "</div>" : "") +
        "</div>" : "") +
      (info.fun ? '<div class="cc-sec"><div class="cc-fun">' + info.fun + "</div></div>" : "") +
      (info.words && info.words.length ? '<div class="cc-sec"><div class="cc-sec-label">✏️ 组词</div>' +
        '<div class="cc-words">' + info.words.join(" · ") + "</div></div>" : "") +
      (info.note ? '<div class="cc-note">💡 ' + info.note + "</div>" : "") +
      '<button class="cc-stroke-btn" data-stroke="' + c + '">▶ 看笔顺</button>' +
      "</div>";
    return html;
  }

  function partCardHTML(p) {
    var info = D.partInfo[p] || { pinyin: "", note: "" };
    return '<div class="char-card">' + closeBtnHTML() +
      '<div class="cc-head"><div class="cc-char">' + p + "</div>" +
      '<div class="cc-meta"><div class="pinyin">' + info.pinyin + '</div>' +
      '<span class="cc-tag">部件</span></div></div>' +
      (info.note ? '<div class="cc-sec"><div class="cc-sec-label">部件说明</div>' +
        '<div class="cc-origin">' + info.note + "</div></div>" : "") +
      '<div class="cc-sec"><div class="cc-origin">把部件拖到画布上，和别的字块碰一碰吧。</div></div></div>';
  }

  /* 卡片列被 CSS 隐藏时（手机竖屏 / 手机横屏等）一律走底部抽屉。
   * 修复：原先只看 max-width:768px，手机横屏宽度 >768 且卡片列已隐藏，字源卡写进了看不见的列 */
  function useDrawer() {
    var col = $("#cardcol");
    return !col || getComputedStyle(col).display === "none";
  }
  /* 触屏布局：点库存=放到画布；桌面布局：点库存=看字源卡 */
  function touchLayout() {
    return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
  }
  function showCard(c) {
    var html = cardHTML(c);
    if (useDrawer()) {
      $("#card-drawer-inner").innerHTML = html;
      $("#card-drawer").classList.remove("hidden");
      $("#drawer-mask").classList.remove("hidden");
    } else {
      /* 只渲染当前这一张卡。原先卡片上方还有一条「最近发现」的 tile 墙，
       * 会残留上一次点过的字，视觉上像卡片叠了一层，已按需求去掉。 */
      $("#cardcol").innerHTML = html;
    }
  }
  function closeDrawer() {
    $("#card-drawer").classList.add("hidden");
    $("#drawer-mask").classList.add("hidden");
  }
  /* 手机端点击库存：把字块放到画布中央（框架 6.1） */
  function placeToBoardCenter(c) {
    var r = $("#board").getBoundingClientRect();
    var s = ZZSH.board.TILE();
    /* 中央略加随机偏移，连点两个字不会完全叠在一起（由玩家自己拖去碰） */
    var jx = (Math.random() - 0.5) * s * 1.6;
    var jy = (Math.random() - 0.5) * s * 1.2;
    ZZSH.board.createTile(c, r.width / 2 - s / 2 + jx, r.height / 2 - s / 2 + jy);
    ZZSH.fx.sndTap();
    bus.emit("tilePlaced", { char: c });
  }

  /* 关闭字源卡：移动端收起抽屉，桌面端移除卡片（保留「最近发现」） */
  function cardVisible() {
    if (!$("#card-drawer").classList.contains("hidden")) return true;
    return !!$("#cardcol").querySelector(".char-card");
  }
  function closeCard() {
    if (!$("#card-drawer").classList.contains("hidden")) { closeDrawer(); return; }
    var col = $("#cardcol");
    var card = col.querySelector(".char-card");
    if (!card) return;
    col.innerHTML = TIP_HTML;
  }

  /* ================= Hanzi Writer（动态加载+回退） ================= */
  /* 修复：
   *  - hanzi-writer-data 发布的是 <字>.json（当前 2.0 版），原先请求不存在的 @0.1/<字>.js
   *    并读取不存在的 window.HanziWriterData，导致笔顺永远回退。现用 fetch 取 JSON。
   *  - 脚本与数据均配「jsDelivr → npmmirror」双源，国内网络更稳。
   *  - 脚本加载中再次点击不再卡在「加载笔顺…」。
   *  - 回退文字改为「大字 + 小字说明」，原 96px 长句会撑破卡片。 */
  var HW_SCRIPTS = [
    "https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js",
    "https://registry.npmmirror.com/hanzi-writer/3.5.0/files/dist/hanzi-writer.min.js"
  ];
  var HW_DATA = [
    function (ch) { return "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/" + encodeURIComponent(ch) + ".json"; },
    function (ch) { return "https://registry.npmmirror.com/hanzi-writer-data/2.0.1/files/" + encodeURIComponent(ch) + ".json"; }
  ];
  var hwLoading = false, hwFailed = false, hwPending = null;
  function loadScript(src, ok, fail) {
    var s = document.createElement("script");
    s.src = src;
    s.onload = ok; s.onerror = function () { s.remove(); fail(); };
    document.head.appendChild(s);
  }
  function loadScriptChain(list, ok, fail) {
    if (!list.length) { fail(); return; }
    loadScript(list[0], ok, function () { loadScriptChain(list.slice(1), ok, fail); });
  }
  function fetchStrokeData(ch, i, onOk, onFail) {
    if (i >= HW_DATA.length || !window.fetch) { onFail(); return; }
    fetch(HW_DATA[i](ch)).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(onOk, function () { fetchStrokeData(ch, i + 1, onOk, onFail); });
  }
  function showStroke(c) {
    if (!ZZSH.state.data.settings.strokeAnim) { toast("笔顺动画已在设置中关闭"); return; }
    var box = $("#card-drawer").classList.contains("hidden")
      ? cardBoxInCol() : drawerStrokeBox();
    if (!box) return;
    if (hwFailed) { strokeFallback(box, c); return; }
    box.innerHTML = '<div style="text-align:center;color:#6b6455;font-size:12px;padding:20px">加载笔顺…</div>';
    if (!window.HanziWriter) {
      hwPending = { box: box, c: c };          // 只画最后一次点击的字
      if (hwLoading) return;
      hwLoading = true;
      loadScriptChain(HW_SCRIPTS.slice(),
        function () {
          hwLoading = false;
          var p = hwPending; hwPending = null;
          if (p && p.box.isConnected) drawStroke(p.box, p.c);
        },
        function () {
          hwLoading = false; hwFailed = true;
          var p = hwPending; hwPending = null;
          if (p && p.box.isConnected) strokeFallback(p.box, p.c);
        });
      return;
    }
    drawStroke(box, c);
  }
  function drawStroke(box, c) {
    box.innerHTML = "";
    try {
      var w = window.HanziWriter.create(box, c, {
        width: 180, height: 180, padding: 8,
        strokeColor: "#2B2B2B",
        radicalColor: "#C8102E",
        showOutline: true,
        charDataLoader: function (char, onComplete, onError) {
          fetchStrokeData(char, 0, onComplete, function () {
            if (typeof onError === "function") onError();
            strokeFallback(box, c);
          });
        },
        onLoadCharDataError: function () { strokeFallback(box, c); }
      });
      w.loopCharacterAnimation();
    } catch (e) { strokeFallback(box, c); }
  }
  function strokeFallback(box, c) {
    if (!box.isConnected) return;
    box.innerHTML = '<div style="text-align:center;padding:8px 0">' +
      '<div style="font-family:var(--font-kai);font-size:96px;line-height:1.2;color:#2B2B2B">' + c + "</div>" +
      '<div style="font-size:12px;color:#6b6455">暂时取不到笔顺数据（可能是网络问题）</div></div>';
  }
  function cardBoxInCol() {
    var col = $("#cardcol");
    var old = col.querySelector(".cc-stroke-box");
    if (old) old.remove();
    var box = document.createElement("div");
    box.className = "cc-stroke-box";
    col.querySelector(".char-card").appendChild(box);
    return box;
  }
  function drawerStrokeBox() {
    var d = $("#card-drawer-inner");
    var old = d.querySelector(".cc-stroke-box");
    if (old) old.remove();
    var box = document.createElement("div");
    box.className = "cc-stroke-box";
    d.querySelector(".char-card").appendChild(box);
    return box;
  }

  /* ================= 进度 ================= */
  function renderProgress() {
    var s = ZZSH.engine.stats();
    $("#progress-num").textContent = s.got;
    $("#progress-total").textContent = s.total;
    $("#codex-num").textContent = s.got;
    $("#codex-total").textContent = s.total;
    $("#progress-fill").style.width = (s.got / s.total * 100) + "%";
    $("#achv-num").textContent = ZZSH.state.data.achievements.length;
    $("#achv-num2").textContent = ZZSH.state.data.achievements.length;
    document.querySelectorAll(".achv-total").forEach(function (el) {
      el.textContent = D.achievements.length;
    });
    $("#btn-continue").classList.toggle("hidden", ZZSH.state.data.got.length === 0);
    // 整理提示
    var tidyBtn = $("#btn-tidy");
    if (ZZSH.board.count() > 20) tidyBtn.classList.add("needs-tidy");
    else tidyBtn.classList.remove("needs-tidy");
    if (ZZSH.board.count() > 40) ZZSH.board.tidy();
  }

  /* ================= 图鉴 ================= */
  function renderCodex() {
    var body = $("#codex-body");
    body.innerHTML = "";
    var st = ZZSH.state.data;
    Object.keys(D.lines).sort(function (a, b) {
      return D.lines[a].order - D.lines[b].order;
    }).forEach(function (lineId) {
      var line = D.lines[lineId];
      var sec = document.createElement("div");
      sec.className = "codex-line";
      var charsInLine = Object.keys(D.chars).filter(function (c) {
        return D.chars[c].line === lineId;
      });
      var gotCount = charsInLine.filter(function (c) { return st.got.includes(c); }).length;
      sec.innerHTML = '<div class="codex-line-head"><span class="dot" style="background:' + line.color +
        '"></span><b>' + line.emoji + " " + line.name + '</b><span>' + gotCount + "/" + charsInLine.length + "</span></div>";
      var grid = document.createElement("div");
      grid.className = "codex-grid";
      charsInLine.forEach(function (c) {
        var cell = document.createElement("div");
        var got = st.got.includes(c);
        cell.className = "codex-cell" + (got ? "" : " locked") +
          (D.chars[c].rare ? " rare" : "") + (D.chars[c].triple ? " triple" : "");
        if (got) {
          cell.textContent = c;
          cell.addEventListener("click", function () { showCard(c); });
        } else {
          /* R2 剪影：墨团 + 笔画数。泄底防护——
           * 1. 原字绝不作为文本节点（textContent 只写笔画数）
           * 2. 不放主线名/色（已拍板）
           * 3. aria-label 只说「未发现」
           * 4. data-char 不挂（防 DOM 检查作弊，也防 CSS 内容注入） */
          cell.setAttribute("aria-label", "还没发现");
          var ink = document.createElement("span");
          ink.className = "silhouette";
          ink.setAttribute("aria-hidden", "true");
          var cnt = document.createElement("span");
          cnt.className = "stroke-count";
          cnt.setAttribute("aria-hidden", "true");
          cnt.textContent = D.chars[c].strokes + "画";
          cell.appendChild(ink);
          cell.appendChild(cnt);
          cell.addEventListener("click", function () {
            ZZSH.fx.sndTap();
            toast("还没发现——去画布上碰碰运气吧");
          });
        }
        grid.appendChild(cell);
      });
      sec.appendChild(grid);
      body.appendChild(sec);
    });
  }

  /* ================= 成就 ================= */
  function renderAchievements() {
    var body = $("#achv-body");
    body.innerHTML = "";
    var st = ZZSH.state.data;
    D.achievements.forEach(function (a) {
      var done = st.achievements.includes(a.id);
      var item = document.createElement("div");
      item.className = "achv-item" + (done ? " done" : "");
      item.innerHTML = '<div class="achv-icon">' + a.icon + "</div>" +
        '<div class="achv-info"><b>' + a.name + "</b><p>" + a.desc + "</p></div>" +
        '<div class="achv-state">' + (done ? "✓ 已达成" : "未达成") + "</div>";
      body.appendChild(item);
    });
  }

  /* ================= 选择面板 ================= */
  /* 修复：原先把字块对挂在共享的 recipe 数据对象上（recipe._lastPair），污染静态配方表；
   * 且面板没有取消通道，点开就必须选。 */
  var chooseCtx = null;   // {recipe, pair}
  function showChoosePanel(recipe, pair) {
    chooseCtx = { recipe: recipe, pair: pair || null };
    var wrap = $("#choose-items");
    wrap.innerHTML = "";
    recipe.results.forEach(function (c, i) {
      var got = ZZSH.engine.has(c);
      var it = document.createElement("button");
      it.className = "choose-item" + (got ? " got" : "");
      it.innerHTML = '<span style="font-size:44px;line-height:1">' + c + "</span>" +
        '<span class="ch-label">' + (recipe.hints && recipe.hints[c] ? recipe.hints[c] : D.chars[c].pinyin) + "</span>";
      it.addEventListener("click", function () { onChoose(c); });
      wrap.appendChild(it);
    });
    $("#choose-hint").textContent = "已收录的字会打勾；全部收录后再合，只看动画";
    $("#choose-mask").classList.remove("hidden");
  }
  function onChoose(c) {
    var ctx = chooseCtx;
    $("#choose-mask").classList.add("hidden");
    chooseCtx = null;
    if (!ctx || !ctx.recipe) return;
    var res = ZZSH.engine.resolvePanelChoice(ctx.recipe, c);
    ZZSH.board.lockInput(500);
    handleMergeResult(res, ctx.pair);
  }
  function cancelChoose() {
    var ctx = chooseCtx;
    chooseCtx = null;
    $("#choose-mask").classList.add("hidden");
    if (ctx && ctx.pair && ctx.pair.a.el && ctx.pair.b.el) ZZSH.board.nudgeApart(ctx.pair.a, ctx.pair.b);
  }

  /* ================= 合成流程接线（board 事件 → engine → 反馈） ================= */
  function onMergeAttempt(p) {
    /* 合成动画约 400ms，原 100ms 锁太短，动画中可抢拖半途的字块 */
    ZZSH.board.lockInput(500);
    var res = ZZSH.engine.tryMerge(p.a.char, p.b.char);
    if (!res.ok) {
      ZZSH.board.lockInput(150);
      ZZSH.fx.sndFail();
      toast(res.failText);
      /* 修复：原先只改了坐标没刷新位置，两块仍叠在一起 */
      ZZSH.board.nudgeApart(p.a, p.b);
      return;
    }
    if (res.needPanel) {
      ZZSH.fx.sndTap();
      showChoosePanel(res.recipe, p);   // 记住字块对，选完继续动画
      return;
    }
    handleMergeResult(res, p);
  }

  function handleMergeResult(res, pair) {
    if (!res || !res.ok) return;
    var isTriple = D.chars[res.result] && D.chars[res.result].triple;

    /* 引导推进：合成成功即推进（不限于新字，避免重复合成死锁引导） */
    guideOnMerge(res.result);

    /* 修复：原先新字坐标用硬编码偏移（+32 / -24 / -56），与 --block 不符，
     * 新字会压在原料上、甚至跑出画布。现由 board.mergeAnimation 直接给出夹紧后的落点。 */
    var alive = pair && pair.a && pair.b && pair.a.el && pair.a.el.isConnected &&
      pair.b.el && pair.b.el.isConnected;
    if (alive) {
      ZZSH.board.mergeAnimation(pair.a, pair.b, res.result, function (cx, cy) {
        afterMergeVisual(res, isTriple, cx, cy);
      });
    } else {
      var r = $("#board").getBoundingClientRect();
      var s = ZZSH.board.TILE();
      afterMergeVisual(res, isTriple, r.width / 2 - s / 2, r.height / 2 - s / 2);
    }
  }

  /* localX/localY：新字块在画布内的左上角坐标 */
  function afterMergeVisual(res, isTriple, localX, localY) {
    var nt = ZZSH.board.createTile(res.result, localX, localY, { flash: true });
    /* 特效跟随新字块的实际位置（createTile 已夹紧） */
    var er = nt.el.getBoundingClientRect();
    var screenX = er.left + er.width / 2, screenY = er.top + er.height / 2;
    /* 墨点飞溅 */
    ZZSH.fx.burst(screenX, screenY, { gold: res.isNew });
    if (res.isNew) {
      var badge = document.createElement("span");
      badge.className = "badge-new";
      badge.textContent = "新发现";
      nt.el.appendChild(badge);
      setTimeout(function () { badge.remove(); }, 2400);
    }

    /* 音效 */
    if (res.isNew) ZZSH.fx.sndNew();
    else ZZSH.fx.sndMerge();
    if (isTriple && res.isNew) ZZSH.fx.sndTriple();

    /* 已收录轻提示 */
    if (!res.isNew) {
      ZZSH.fx.floatWord(screenX, screenY - 40, "已收录", "");
    }

    if (res.isNew) {
      renderInventory();
      showCard(res.result);
      renderProgress();

      /* 解锁 toast（部件） */
      (res.unlocks || []).forEach(function (u, i) {
        setTimeout(function () {
          ZZSH.fx.sndChime();
          toast(u.unlock.toast, { long: true, gold: true });
        }, 400 + i * 1600);
      });

      /* 成就 toast */
      (res.achievements || []).forEach(function (a, i) {
        setTimeout(function () {
          ZZSH.fx.sndChime();
          toast(a.icon + " 达成成就「" + a.name + "」：" + a.desc, { long: true, gold: true });
        }, 1200 + i * 1600);
      });

      /* 结局：最后一个字恰好是三叠字时两个结局同时达成——先小后大，大通关不再被吞掉 */
      if (res.endings && res.endings.minor) {
        pendingMajor = !!res.endings.major;
        setTimeout(function () { showEnding(true); }, 1600);
      } else if (res.endings && res.endings.major) {
        setTimeout(function () { showEnding(false); }, 1600);
      }
    }
  }

  var pendingMajor = false;

  /* ================= 提示（三级） ================= */
  function onHint() {
    var h = ZZSH.engine.nextHint();
    toast("💡 " + h.text, { long: true });
    if (h.level === 3 && h.a && h.b) {
      ZZSH.board.highlightChars([h.a, h.b]);
      // 若画布上没有这两个字，自动放一个到中间
      ensureOnBoard(h.a); ensureOnBoard(h.b);
    } else if (h.level === 1 && h.char) {
      ensureOnBoard(h.char);
    }
    renderProgress(); // hints 统计
  }
  function ensureOnBoard(c) {
    if (ZZSH.board.hasChar(c)) return;
    var r = $("#board").getBoundingClientRect();
    var s = ZZSH.board.TILE();
    /* 放在中线两侧、互不重叠，避免提示放出的两块刚好叠住 */
    var side = ensureOnBoard._flip = !ensureOnBoard._flip;
    var t = ZZSH.board.createTile(c, r.width / 2 + (side ? -s * 1.4 : s * 0.4), r.height / 2 - s / 2 + (Math.random() * 40 - 20));
    t.el.classList.add("hint-glow");
    setTimeout(function () { if (t.el) t.el.classList.remove("hint-glow"); }, 3200);
  }

  /* ================= 通关 ================= */
  function showEnding(isMinor) {
    var box = $("#ending-box");
    var flower = $("#ending-flower");
    flower.classList.remove("compose");
    void flower.offsetWidth;               // 重启入场动画（小→大连续弹出时）
    if (isMinor) {
      var s = ZZSH.engine.stats();
      flower.textContent = D.endings.minor.triples.join("");
      flower.classList.add("compose");
      $("#ending-title").textContent = D.endings.minor.title;
      $("#ending-sub").innerHTML = s.triplesTotal + " 个三叠字集齐了——三生万物。<br>还可以继续收集，图鉴共 " + s.total + " 字。";
      $("#ending-stats").innerHTML =
        stat(s.got, "收集 " + s.got + "/" + s.total) +
        stat(s.triplesGot, "三叠字 " + s.triplesGot + "/" + s.triplesTotal) +
        stat(ZZSH.state.data.stats.hints, "提示 " + ZZSH.state.data.stats.hints + " 次");
      $("#btn-ending-continue").textContent = pendingMajor ? "继续 →" : "继续收集";
    } else {
      ZZSH.fx.petalRain(ZZSH.state.data.got);
      flower.textContent = "字字生花";
      flower.classList.add("compose");
      $("#ending-title").textContent = D.endings.major.title;
      $("#ending-sub").textContent = "图鉴全部集满，你把每个字都点亮了。";
      var st = ZZSH.state.data.stats;
      $("#ending-stats").innerHTML =
        stat(st.tries, "尝试 " + st.tries + " 次") +
        stat(st.hints, "提示 " + st.hints + " 次") +
        stat(ZZSH.state.data.achievements.length, "成就 " + ZZSH.state.data.achievements.length + "/" + D.achievements.length);
      /* 修复：原「再玩一次」只是刷新页面、并不重置进度，名不副实；重开请走设置里的「重置进度」 */
      $("#btn-ending-continue").textContent = "回到画布";
    }
    function stat(v, label) {
      return '<div class="ending-stat"><b>' + v + "</b><span>" + label + "</span></div>";
    }
    $("#ending-mask").classList.remove("hidden");
    ZZSH.fx.sndTriple();
  }

  /* ================= 新手引导 ================= */
  var guideState = { step: 0, timers: [], softTimer: null };
  function startGuide() {
    var g = ZZSH.state.data.guide;
    if (g.done) return;
    /* 防重复：反复「回封面→开始」会叠加多组超时器 */
    guideState.timers.forEach(clearTimeout);
    guideState.timers = [];
    guideState.step = Math.max(1, g.step || 1);
    showGuideStep(guideState.step);
  }
  function showGuideStep(n) {
    var steps = D.guide.steps;
    var step = steps[Math.min(n, steps.length) - 1];
    if (!step) return endGuide();
    guideState.step = n;
    /* 持久化引导进度，刷新后从当前步继续 */
    ZZSH.state.data.guide.step = n;
    ZZSH.state.save();
    var mask = $("#guide-mask");
    mask.classList.remove("hidden");
    /* 信息型步骤（≥2）带「知道了」按钮，动作型步骤（1）靠手势引导 */
    $("#guide-bubble").innerHTML = step.text +
      (n >= 2 ? '<br><button class="btn btn-primary btn-sm guide-next">知道了，继续</button>' : "");
    var hand = $("#guide-hand");
    hand.style.left = (18 + (n % 3) * 22) + "%";
    hand.style.top = (30 + (n % 2) * 16) + "%";
    hand.style.display = n === 1 ? "block" : "none";
    /* 每步都有超时兜底：玩家不动也能自动推进，杜绝死锁 */
    var delays = { 1: 30000, 2: 8000, 3: 7000, 4: 12000, 5: 9000 };
    if (delays[n]) {
      guideState.timers.push(setTimeout(function () {
        if (guideState.step !== n) return;   // 已被其他出口推进
        if (n >= steps.length) endGuide();
        else advanceGuide(n + 1);
      }, delays[n]));
    }
  }
  function guideOnMerge(char) {
    var g = ZZSH.state.data.guide;
    if (g.done) return;
    /* 任意合成新字都推进当前步：不再依赖特定字/特定操作 */
    var s = guideState.step;
    if (s <= 1) { advanceGuide(2); return; }
    if (s === 2) { advanceGuide(3); return; }
    if (s === 3) { advanceGuide(4); return; }
    if (s === 4) { advanceGuide(5); return; }
    if (s >= 5) { endGuide(); return; }
  }
  function advanceGuide(n) {
    guideState.timers.forEach(clearTimeout);
    guideState.timers = [];
    guideState.timers.push(setTimeout(function () { showGuideStep(n); }, 900));
  }
  function endGuide() {
    guideState.timers.forEach(clearTimeout);
    guideState.timers = [];
    $("#guide-mask").classList.add("hidden");
    ZZSH.state.data.guide.done = true;
    ZZSH.state.save();
  }
  /* 离开游戏页时暂停引导（不标记完成），否则引导遮罩会盖在封面上 */
  function pauseGuide() {
    guideState.timers.forEach(clearTimeout);
    guideState.timers = [];
    clearTimeout(guideState.softTimer);
    $("#guide-mask").classList.add("hidden");
  }
  function armSoftHint() {
    // 步骤3/4：30 秒无成功合成 → 软提示
    if (ZZSH.state.data.guide.done) return;
    clearTimeout(guideState.softTimer);
    guideState.softTimer = setTimeout(function () {
      if (!ZZSH.state.data.guide.done && guideState.step >= 3) {
        toast("🎋 " + D.guide.softHint, { long: true });
      }
    }, 30000);
  }

  /* 面板首次弹出时补引导步骤4说明（选择面板本身有标题文案） */

  /* ================= 设置 ================= */
  function bindSettings() {
    $("#set-sound").checked = ZZSH.state.data.settings.sound;
    $("#set-stroke").checked = ZZSH.state.data.settings.strokeAnim;
    $("#set-sound").addEventListener("change", function () {
      ZZSH.state.data.settings.sound = this.checked;
      ZZSH.state.save();
      if (this.checked) { ZZSH.fx.unlock(); ZZSH.fx.sndTap(); }
    });
    $("#set-stroke").addEventListener("change", function () {
      ZZSH.state.data.settings.strokeAnim = this.checked;
      ZZSH.state.save();
    });
    $("#btn-replay-guide").addEventListener("click", function () {
      ZZSH.state.data.guide.done = false;
      ZZSH.state.data.guide.step = 1;
      ZZSH.state.save();
      showScreen("#screen-game");
      startGuide();
    });
    $("#btn-export-save").addEventListener("click", function () {
      var code = ZZSH.state.exportCode();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () {
          toast("存档码已复制，去新设备「导入」即可");
        }, function () { promptSaveCode(code); });
      } else promptSaveCode(code);
    });
    $("#btn-import-save").addEventListener("click", function () {
      var code = window.prompt("粘贴存档码：");
      if (!code) return;
      var st = ZZSH.state.importCode(code);
      if (st) {
        ZZSH.state.data = st;
        /* 补发遗漏的部件/成就、清理失效成就 id，防止旧存档缺部件卡关 */
        ZZSH.engine.selfHeal();
        ZZSH.state.save();
        $("#set-sound").checked = st.settings.sound;
        $("#set-stroke").checked = st.settings.strokeAnim;
        ZZSH.board.clearBoard();
        renderAll();
        toast("导入成功！已收集 " + st.got.length + " 字");
      } else toast("存档码无效");
    });
    $("#btn-reset").addEventListener("click", function () {
      if (window.confirm("确定重置全部进度？此操作不可恢复。")) {
        ZZSH.state.reset();
        ZZSH.state.data = ZZSH.state.data; // reset 已写入
        location.reload();
      }
    });
  }
  function promptSaveCode(code) {
    window.prompt("复制这串存档码（在新设备「导入」）：", code);
  }

  /* ================= 事件绑定 ================= */
  function bindEvents() {
    /* 封面 */
    $("#btn-start").addEventListener("click", function () {
      ZZSH.fx.sndTap();
      showScreen("#screen-game");
      renderAll();
      startGuide();
      armSoftHint();
    });
    $("#btn-continue").addEventListener("click", function () {
      ZZSH.fx.sndTap();
      showScreen("#screen-game");
      renderAll();
      startGuide();          // 引导中途刷新的玩家：从上次的步骤接着走（已完成则无动作）
    });

    /* 顶栏 */
    $("#btn-home").addEventListener("click", function () {
      ZZSH.fx.sndTap();
      pauseGuide();
      showScreen("#screen-cover");
    });
    $("#btn-hint").addEventListener("click", onHint);
    $("#btn-achv").addEventListener("click", function () {
      ZZSH.fx.sndTap();
      pauseGuide();
      renderAchievements();
      showScreen("#screen-achv");
    });
    $("#btn-settings").addEventListener("click", function () {
      ZZSH.fx.sndTap();
      pauseGuide();
      showScreen("#screen-settings");
    });

    /* 图鉴入口：点进度条区域打开图鉴 */
    $("#progress-wrap").addEventListener("click", function () {
      ZZSH.fx.sndTap();
      pauseGuide();
      renderCodex();
      showScreen("#screen-codex");
    });
    function backToGame() { showScreen("#screen-game"); startGuide(); }
    $("#btn-codex-back").addEventListener("click", backToGame);
    $("#btn-achv-back").addEventListener("click", backToGame);
    $("#btn-settings-back").addEventListener("click", backToGame);
    $("#btn-about").addEventListener("click", function () { showScreen("#screen-about"); });
    $("#btn-about-back").addEventListener("click", function () { showScreen("#screen-settings"); });

    /* 画布工具 */
    $("#btn-tidy").addEventListener("click", function () {
      ZZSH.board.tidy();
      ZZSH.fx.sndTap();
      toast("重复的字已收进库存");
    });
    $("#btn-clear").addEventListener("click", function () {
      if (ZZSH.board.count() === 0) { toast("画布已经是空的"); return; }
      ZZSH.board.clearBoard();
      ZZSH.fx.sndTap();
      toast("画布已清空，字都还在库存里");
    });

    /* 抽屉 */
    $("#drawer-mask").addEventListener("click", closeDrawer);

    /* 右键取消字源卡（桌面右键 / 安卓长按均触发 contextmenu）
       画布区域右键同样只关卡片，绝不删除字块 */
    document.addEventListener("contextmenu", function (e) {
      /* 右键画布字块 = 收回（库存无限，收回零成本，随时能再拖出来） */
      var tile = e.target.closest("#board .tile");
      if (tile) {
        e.preventDefault();
        var c = ZZSH.board.removeTileByEl(tile);
        if (c) { ZZSH.fx.sndTap(); toast("已收回「" + c + "」，需要时从库存再拖出来"); }
        return;
      }
      var card = e.target.closest(".char-card");
      if (card) { e.preventDefault(); closeCard(); return; }
      if (e.target.closest("#board") && cardVisible()) {
        e.preventDefault();
        closeCard();
      }
    });

    /* 字源卡里的笔顺按钮、关闭按钮与最近发现（事件委托） */
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) { ZZSH.fx.sndTap(); closeCard(); return; }
      var sb = e.target.closest("[data-stroke]");
      if (sb) { showStroke(sb.dataset.stroke); return; }
      var rc = e.target.closest("[data-card]");
      if (rc) { showCard(rc.dataset.card); return; }
      var it = e.target.closest(".inventory .tile");
      if (!it) return;
      if (touchLayout()) {
        placeToBoardCenter(it.dataset.char); // 触屏（含手机横屏/平板）：放到画布中央
      } else {
        showCard(it.dataset.char);          // 鼠标桌面：打开字源卡
      }
    });

    /* 选择面板遮罩（防误触关闭，不关闭） */

    /* 通关 */
    $("#btn-choose-cancel").addEventListener("click", cancelChoose);
    $("#choose-mask").addEventListener("click", function (e) {
      if (e.target === this) cancelChoose();   // 点面板外空白处也可取消
    });
    $("#btn-ending-continue").addEventListener("click", function () {
      if (pendingMajor) {             // 小通关与大通关同时达成：接着展示大通关
        pendingMajor = false;
        showEnding(false);
        return;
      }
      $("#ending-mask").classList.add("hidden");
    });
    $("#btn-ending-scorecard").addEventListener("click", function () {
      ZZSH.share.showScorecard();
    });

    /* 引导 */
    $("#guide-skip").addEventListener("click", endGuide);
    /* 气泡里的「知道了」按钮（事件委托，气泡内容动态生成） */
    document.addEventListener("click", function (e) {
      if (e.target.closest(".guide-next")) {
        ZZSH.fx.sndTap();
        var n = guideState.step;
        if (n >= D.guide.steps.length) endGuide();
        else advanceGuide(n + 1);
      }
    });

    /* board 事件 */
    bus.on("mergeAttempt", onMergeAttempt);
    bus.on("openCard", function (p) { showCard(p.char); });
    bus.on("tilePlaced", armSoftHint);
  }

  /* ================= 全量刷新 ================= */
  function renderAll() {
    renderInventory();
    renderProgress();
    if (!ZZSH.state.persistent()) $("#storage-warn").classList.remove("hidden");
  }

  /* ================= 初始化 ================= */
  function init() {
    /* 启动自愈：旧版本存档可能缺部件/成就（例如配方表更新后），自动补齐 */
    try { ZZSH.engine.selfHeal(); } catch (e) { /* ignore */ }
    /* 关于页显示发布版本号 */
    var av = $("#about-version");
    if (av) av.textContent = "v" + D.meta.release;
    bindEvents();
    bindSettings();
    renderAll();
    if (ZZSH.state.data.got.length > 0) {
      $("#btn-continue").classList.remove("hidden");
    }
  }

  ZZSH.ui = {
    init: init,
    showScreen: showScreen,
    toast: toast,
    renderAll: renderAll,
    renderInventory: renderInventory,
    renderProgress: renderProgress,
    showCard: showCard,
    armSoftHint: armSoftHint
  };
})();
