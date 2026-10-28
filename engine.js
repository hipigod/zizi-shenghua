/* ============================================================
 * 字字生花 · engine.js
 * 配方查询、合成流程、解锁判定、成就判定、结局判定、
 * 三级提示寻路、事件总线
 * 数据单向流动：用户操作 → engine → state → save → 事件 → ui
 * ============================================================ */
(function () {
  "use strict";
  var ZZSH = window.ZZSH;
  var D = ZZSH.DATA;

  /* ---------------- 事件总线（board 只发事件不调 ui） ---------------- */
  var bus = {
    _subs: {},
    on: function (evt, fn) {
      (this._subs[evt] = this._subs[evt] || []).push(fn);
      return this;
    },
    off: function (evt, fn) {
      var a = this._subs[evt] || [];
      var i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    emit: function (evt, payload) {
      (this._subs[evt] || []).slice().forEach(function (fn) {
        try { fn(payload); } catch (e) { console.error("[bus]", evt, e); }
      });
    }
  };
  ZZSH.bus = bus;

  /* ---------------- 工具 ---------------- */
  function allChars() { return Object.keys(D.chars); }
  function rareChars() {
    return allChars().filter(function (c) { return D.chars[c].rare; });
  }
  function tripleChars() { return D.endings.minor.triples; }

  /* 某字是否已收集 */
  function has(c) { return ZZSH.state.data.got.indexOf(c) >= 0; }

  /* 某字当前是否可被玩家合成（部件/原料字是否已解锁或已收集） */
  function charCraftable(c) {
    var r = findRecipeFor(c);
    if (!r) return false;
    return materialReady(r.a) && materialReady(r.b);
  }
  function findRecipeFor(c) {
    for (var i = 0; i < D.recipes.length; i++) {
      if (D.recipes[i].results.indexOf(c) >= 0) return D.recipes[i];
    }
    return null;
  }
  /* 原料就绪：部件已解锁，或已收集的字 */
  function materialReady(x) {
    return ZZSH.state.partUnlocked(x) || has(x);
  }

  /* ---------------- 解锁判定 ----------------
   * 每次收集新字后调用；返回触发的解锁列表（可能多条同时达成） */
  function checkUnlocks() {
    var st = ZZSH.state.data;
    var fired = [];
    D.unlocks.forEach(function (u) {
      var key = "unlock_" + JSON.stringify(u.when);
      if (st.flags[key]) return;
      var hit = false;
      var w = u.when;
      if (w.type === "got") hit = has(w.char);
      else if (w.type === "firstTriple") hit = tripleChars().some(has);
      else if (w.type === "count") hit = st.got.length >= w.n;
      else if (w.type === "lineCount") hit = lineCount(w.line) >= w.n;
      if (hit) {
        st.flags[key] = true;
        var fresh = [];
        (u.give || []).forEach(function (p) {
          if (!st.unlockedParts.includes(p)) {
            st.unlockedParts.push(p);
            fresh.push(p);
          }
        });
        fired.push({ unlock: u, freshParts: fresh });
      }
    });
    return fired;
  }

  function lineCount(lineId) {
    return ZZSH.state.data.got.filter(function (c) {
      return D.chars[c] && D.chars[c].line === lineId;
    }).length;
  }

  /* ---------------- 成就判定 ----------------
   * 返回本次新达成的成就列表 */
  function checkAchievements() {
    var st = ZZSH.state.data;
    var newly = [];
    D.achievements.forEach(function (a) {
      if (st.achievements.includes(a.id)) return;
      var ok = false;
      var r = a.rule;
      if (r.type === "count") {
        ok = st.got.length >= r.n;
        if (ok && r.noHints) ok = st.stats.hints === 0;
      }
      else if (r.type === "firstTriple") ok = tripleChars().some(has);
      else if (r.type === "firstPanel") ok = st.stats.panels >= 1;
      else if (r.type === "chars") ok = r.chars.every(has);
      else if (r.type === "lineCount") ok = lineCount(r.line) >= r.n;
      else if (r.type === "allRare") ok = rareChars().every(has);
      else if (r.type === "all") ok = st.got.length >= allChars().length;
      if (ok) { st.achievements.push(a.id); newly.push(a); }
    });
    return newly;
  }

  /* ---------------- 结局判定 ---------------- */
  function checkEndings() {
    var st = ZZSH.state.data;
    var out = { minor: false, major: false };
    if (!st.flags.endingMinor && tripleChars().every(has)) {
      st.flags.endingMinor = true;
      st.stats.minorEndAt = Date.now();
      out.minor = true;
    }
    if (!st.flags.endingMajor && st.got.length >= allChars().length) {
      st.flags.endingMajor = true;
      out.major = true;
    }
    return out;
  }

  /* ---------------- 合成入口 ----------------
   * board 检测到有效拖放后调用。
   * 返回值：
   *   { ok:false, reason:"noRecipe"|"selfNoRecipe", failText }
   *   { ok:true, needPanel:true, recipe }           → ui 弹选择面板
   *   { ok:true, result:"字", isNew:bool }          → 直接合成（单结果） */
  function tryMerge(a, b) {
    var st = ZZSH.state.data;
    st.stats.tries++;
    var r = ZZSH.findRecipe(a, b);
    if (!r) {
      st.stats.fails++;
      return { ok: false, reason: "noRecipe", failText: failTextFor(a, b) };
    }
    if (r.results.length > 1) {
      // 多结果：交给 ui 弹面板，玩家选择后调 resolvePanelChoice
      return { ok: true, needPanel: true, recipe: r };
    }
    return finishMerge(r, r.results[0]);
  }

  /* 选择面板选字后调用 */
  function resolvePanelChoice(recipe, chosen) {
    ZZSH.state.data.stats.panels++;
    return finishMerge(recipe, chosen);
  }

  function finishMerge(recipe, chosen) {
    var isNew = !has(chosen);
    if (isNew) ZZSH.state.add(chosen);
    var unlocks = isNew ? checkUnlocks() : [];
    var achvs = isNew ? checkAchievements() : [];
    var endings = isNew ? checkEndings() : { minor: false, major: false };
    ZZSH.state.save();
    return { ok: true, result: chosen, isNew: isNew, unlocks: unlocks, achievements: achvs, endings: endings };
  }

  /* ---------------- 失败提示（分级） ---------------- */
  function failTextFor(a, b) {
    var t = D.failTexts;
    if (a === b && ZZSH.findRecipe(a, a)) {
      // 有自叠配方但玩家拖的两个同字没有配方（理论不会发生，防御）
      return t.self.replace("{a}", a).replace("{b}", ZZSH.findRecipe(a, a).results[0]);
    }
    if (a === b) return t.both;
    var aExhausted = !hasMoreRecipes(a);
    var bExhausted = !hasMoreRecipes(b);
    if (aExhausted && !bExhausted) return t.one.replace("{a}", a);
    if (bExhausted && !aExhausted) return t.one.replace("{a}", b);
    return t.both;
  }

  /* 某字/部件在当前解锁状态下是否还有未尝试成功的配方 */
  function hasMoreRecipes(x) {
    return craftablePairs().some(function (pair) {
      return pair[0] === x || pair[1] === x;
    });
  }

  /* ---------------- 提示系统（三级 → R3 据义造字改造） ----------------
   * nextHint 仍负责：选目标（pickHintTarget）、计 hints、封 hintUsed。
   * 返回新增 quiz 字段：
   *   quiz:"panel" → ui 弹据义造字面板（full/assist 档）
   *   quiz:"skip"  → ui 回归文字提示（skip 档或无 quizDesc）
   * level 仍返回（level-0 兜底保留；面板内"直接告诉我"用 level-3 行为）。 */
  var hintCursor = {};
  function nextHint() {
    var st = ZZSH.state.data;
    var target = pickHintTarget();
    /* 没有可提示的目标时不计入提示次数，避免白白断送「独立思考」成就 */
    if (!target) return { level: 0, text: "先多解锁一些部件吧——去画布里随便试试两个字的组合" };

    st.stats.hints++;
    st.flags.hintUsed = true;
    ZZSH.state.save();

    var key = target.char;
    var r = target.recipe;
    var info = D.chars[target.char];

    /* R3：优先走据义造字面板 */
    if (info.quizMode === "full" || info.quizMode === "assist") {
      return { level: 1, quiz: "panel", char: target.char, recipe: r,
               text: info.quizDesc };
    }

    /* skip 档：回归原三级文字提示 */
    var lvl = (hintCursor[key] || 0) + 1;
    if (lvl > 3) lvl = 3;
    hintCursor[key] = lvl;

    var lineName = D.lines[info.line] ? D.lines[info.line].name : "";

    if (lvl === 1) {
      // 方向提示：给一个原料（优先给部件/已收集字）
      var give = r.a;
      return { level: 1, quiz: "skip", text: "试试用「" + give + "」", char: give };
    }
    if (lvl === 2) {
      return { level: 2, quiz: "skip", text: "「" + r.a + "」和「" + r.b + "」之间有故事" + (lineName ? "（" + lineName + "）" : "") };
    }
    return { level: 3, quiz: "skip", text: "把「" + r.a + "」拖到「" + r.b + "」上！", a: r.a, b: r.b };
  }

  /* R3：面板答对 → 直接收录目标字（等同合成成功，复用解锁/成就/结局检查） */
  function finishMergeByQuiz(char) {
    var st = ZZSH.state.data;
    if (has(char)) return null;
    st.got.push(char);
    var unlocks = checkUnlocks();
    var achievements = checkAchievements();
    ZZSH.state.save();
    return { ok: true, result: char, isNew: true, unlocks: unlocks, achievements: achievements };
  }

  /* 提示目标：按主线顺序找第一个「原料就绪但未收集」的字 */
  function pickHintTarget() {
    var lineOrder = ["caomu", "riyue", "renwu", "shuihuo", "pinwu"];
    for (var li = 0; li < lineOrder.length; li++) {
      var lineChars = allChars().filter(function (c) {
        return D.chars[c].line === lineOrder[li] && !has(c);
      });
      for (var i = 0; i < lineChars.length; i++) {
        var r = findRecipeFor(lineChars[i]);
        if (r && materialReady(r.a) && materialReady(r.b)) {
          return { char: lineChars[i], recipe: r };
        }
      }
    }
    return null;
  }

  /* ---------------- 可合成对扫描（画布提示、软提示用） ---------------- */
  function craftablePairs() {
    // 玩家当前可用的原料：已解锁部件 + 已收集字
    var mats = ZZSH.state.data.unlockedParts.slice();
    ZZSH.state.data.got.forEach(function (c) { if (!mats.includes(c)) mats.push(c); });
    var pairs = [];
    for (var i = 0; i < mats.length; i++) {
      for (var j = i; j < mats.length; j++) {
        var r = ZZSH.findRecipe(mats[i], mats[j]);
        if (r) {
          // 只要还有未收集的结果，这条配方就有价值
          if (r.results.some(function (c) { return !has(c); })) {
            pairs.push([mats[i], mats[j]]);
          }
        }
      }
    }
    return pairs;
  }

  /* ---------------- 存档自愈 ----------------
   * 导入存档 / 版本迁移后调用：按当前收集补发遗漏的部件与成就，
   * 并剔除数据表里已不存在的成就 id。不弹任何 toast。 */
  function selfHeal() {
    var st = ZZSH.state.data;
    var validIds = D.achievements.map(function (a) { return a.id; });
    st.achievements = st.achievements.filter(function (id) { return validIds.indexOf(id) >= 0; });
    /* 解锁表重新判定（flags 已命中的条件也要补发部件，防止旧存档缺部件卡死） */
    D.unlocks.forEach(function (u) {
      var key = "unlock_" + JSON.stringify(u.when);
      if (st.flags[key]) {
        (u.give || []).forEach(function (p) {
          if (st.unlockedParts.indexOf(p) < 0) st.unlockedParts.push(p);
        });
      }
    });
    checkUnlocks();
    checkAchievements();
    if (tripleChars().every(has)) st.flags.endingMinor = true;
    if (st.got.length >= allChars().length) st.flags.endingMajor = true;
    ZZSH.state.save();
  }

  /* ---------------- 图鉴统计 ---------------- */
  function stats() {
    var got = ZZSH.state.data.got.length;
    return {
      got: got, total: allChars().length,
      rareGot: rareChars().filter(has).length, rareTotal: rareChars().length,
      triplesGot: tripleChars().filter(has).length, triplesTotal: tripleChars().length,
      lineCounts: Object.keys(D.lines).map(function (k) {
        return { id: k, name: D.lines[k].name, got: lineCount(k), total: lineCountAll(k) };
      })
    };
  }
  function lineCountAll(lineId) {
    return allChars().filter(function (c) { return D.chars[c].line === lineId; }).length;
  }

  ZZSH.engine = {
    allChars: allChars,
    rareChars: rareChars,
    tripleChars: tripleChars,
    has: has,
    charCraftable: charCraftable,
    findRecipeFor: findRecipeFor,
    tryMerge: tryMerge,
    resolvePanelChoice: resolvePanelChoice,
    finishMergeByQuiz: finishMergeByQuiz,
    failTextFor: failTextFor,
    nextHint: nextHint,
    craftablePairs: craftablePairs,
    checkUnlocks: checkUnlocks,
    checkAchievements: checkAchievements,
    checkEndings: checkEndings,
    selfHeal: selfHeal,
    stats: stats,
    lineCount: lineCount,
    materialReady: materialReady
  };
})();
