/* ============================================================
 * 字字生花 · tools/validate_data.js
 * 数据自检（node 环境）：
 *   1. 无序键冲突检查
 *   2. 配方结果字都存在于字表
 *   3. BFS 可达性（模拟解锁链，全部 62 字可达、无死字）
 *   4. 必注字 note 非空
 *   5. 生僻占比 ≤ 20%
 *   6. 成就/解锁引用字存在
 *   7. 全流程模拟合成（含多结果、解锁、成就、结局）
 * 用法：node tools/validate_data.js
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

/* 加载 data.js（利用其自执行索引构建，需 stub window=global）
 * 注意：必须用间接 eval（全局作用域），否则本文件后面的 const ZZSH
 * 会形成 TDZ，eval 里的裸 ZZSH 解析到未初始化绑定直接报错。 */
global.window = global;
const dataPath = path.join(__dirname, "..", "data.js");
(0, eval)(fs.readFileSync(dataPath, "utf8"));
const ZZSH = global.window.ZZSH;
const D = ZZSH.DATA;

let errors = [], warns = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warns.push(msg); }

/* ---------- 1. 无序键冲突 ---------- */
(function () {
  const seen = {};
  D.recipes.forEach(r => {
    const key = [r.a, r.b].sort().join("|");
    if (seen[key]) err(`配方键冲突: ${key}（${seen[key]} 与 ${r.a}+${r.b}）`);
    seen[key] = r.a + "+" + r.b;
  });
  console.log(`1. 配方键冲突检查：${D.recipes.length} 条配方，${errors.length ? "发现冲突！" : "通过"}`);
})();

/* ---------- 2. 结果字存在性 ---------- */
(function () {
  let bad = 0;
  D.recipes.forEach(r => {
    r.results.forEach(c => { if (!D.chars[c]) { err(`配方 ${r.a}+${r.b} 的结果「${c}」不在字表`); bad++; } });
    /* 原料可以是部件或可产出的字（中间产物） */
    [r.a, r.b].forEach(m => {
      if (!D.partInfo[m] && !D.chars[m]) err(`配方 ${r.a}+${r.b} 的原料「${m}」既不在部件表也不在字表`);
    });
  });
  // 每个字至少有一条配方
  Object.keys(D.chars).forEach(c => {
    if (!D.recipes.some(r => r.results.includes(c))) err(`字「${c}」没有任何配方（死字）`);
  });
  console.log(`2. 引用完整性：${bad === 0 && !errors.length ? "通过" : "发现问题"}`);
})();

/* ---------- 3. BFS 可达性（模拟解锁链） ---------- */
(function () {
  let got = new Set();
  let parts = new Set(D.parts);
  let round = 0;
  const MAX_ROUNDS = 50;

  while (round++ < MAX_ROUNDS) {
    let progress = false;
    // 材料就绪的配方全部产出
    D.recipes.forEach(r => {
      const ra = parts.has(r.a) || got.has(r.a);
      const rb = parts.has(r.b) || got.has(r.b);
      if (ra && rb) r.results.forEach(c => {
        if (!got.has(c)) { got.add(c); progress = true; }
      });
    });
    // 解锁判定
    D.unlocks.forEach(u => {
      const w = u.when;
      let hit = false;
      if (w.type === "got") hit = got.has(w.char);
      else if (w.type === "firstTriple") hit = D.endings.minor.triples.some(c => got.has(c));
      else if (w.type === "count") hit = got.size >= w.n;
      else if (w.type === "lineCount") hit = [...got].filter(c => D.chars[c].line === w.line).length >= w.n;
      if (hit) (u.give || []).forEach(p => parts.add(p));
    });
    if (!progress) break;
  }

  const all = Object.keys(D.chars);
  const dead = all.filter(c => !got.has(c));
  const reachable = all.length - dead.length;
  if (dead.length) err(`不可达字（死字）: ${dead.join("、")}`);
  console.log(`3. BFS 可达性：${reachable}/${all.length} 可达，${dead.length ? "死字：" + dead.join("、") : "通过"}`);

  /* 解锁节点节奏检查（每个 count 节点在解锁时刻是否可凑够字数） */
  [20, 30, 40].forEach(n => {
    if (reachable >= n) console.log(`   - 集字 ${n} 节点可达成（总可达 ${reachable}）`);
    else warn(`集字 ${n} 节点可能死锁：总可达仅 ${reachable}`);
  });
})();

/* ---------- 4. 必注字 note 非空 ---------- */
(function () {
  /* 必注清单：结构≠字源、偏旁变形、囗框、田字出头 */
  const MUST_NOTE = ["休", "困", "囚", "回", "因", "吕", "淡", "泪", "湖", "胡", "朋", "果", "思", "灭", "甲", "由", "申"];
  let bad = 0;
  MUST_NOTE.forEach(c => {
    const info = D.chars[c];
    if (!info) { err(`必注清单里的「${c}」不在字表`); return; }
    if (!info.note || !info.note.trim()) { err(`「${c}」是必注字但 note 为空`); bad++; }
  });
  console.log(`4. 必注 ${MUST_NOTE.length} 字 note 检查：${bad === 0 ? "通过" : bad + " 个缺失"}`);
})();

/* ---------- 5. 生僻占比 ---------- */
(function () {
  const all = Object.keys(D.chars);
  const rare = all.filter(c => D.chars[c].rare);
  const pct = (rare.length / all.length * 100).toFixed(1);
  if (rare.length / all.length > 0.2) err(`生僻字占比 ${pct}% 超过 20% 红线`);
  console.log(`5. 生僻占比：${rare.length}/${all.length} = ${pct}% ${pct <= 20 ? "通过" : "超线！"}`);
})();

/* ---------- 6. 成就/解锁引用 ---------- */
(function () {
  D.achievements.forEach(a => {
    const r = a.rule;
    if (r.chars) r.chars.forEach(c => { if (!D.chars[c]) err(`成就「${a.name}」引用不存在的字「${c}」`); });
    if (r.line && !D.lines[r.line]) err(`成就「${a.name}」引用不存在的主线 ${r.line}`);
  });
  D.unlocks.forEach(u => {
    const w = u.when;
    if (w.char && !D.chars[w.char]) err(`解锁条件引用不存在的字「${w.char}」`);
    (u.give || []).forEach(p => { if (!D.partInfo[p]) err(`解锁给予不存在部件「${p}」`); });
  });
  D.endings.minor.triples.forEach(c => {
    if (!D.chars[c]) err(`结局引用不存在的字「${c}」`);
    else if (!D.chars[c].triple) warn(`结局字「${c}」未标记 triple`);
  });
  console.log(`6. 成就/解锁引用：${errors.length ? "有问题（见上）" : "通过"}`);
})();

/* ---------- 7. 全流程模拟（合成引擎冒烟） ---------- */
(function () {
  /* 极简 state stub */
  const stateData = {
    version: 1, got: [], unlockedParts: D.parts.slice(), achievements: [],
    stats: { tries: 0, fails: 0, hints: 0, panels: 0, startAt: Date.now(), minorEndAt: 0 },
    settings: { sound: false, strokeAnim: false },
    guide: { done: true, step: 0 }, flags: {}
  };
  const save = () => {};
  const has = c => stateData.got.includes(c);
  const allChars = () => Object.keys(D.chars);

  function checkUnlocks() {
    D.unlocks.forEach(u => {
      const key = "k" + JSON.stringify(u.when);
      if (stateData.flags[key]) return;
      const w = u.when;
      let hit = false;
      if (w.type === "got") hit = has(w.char);
      else if (w.type === "firstTriple") hit = D.endings.minor.triples.some(has);
      else if (w.type === "count") hit = stateData.got.length >= w.n;
      else if (w.type === "lineCount") hit = stateData.got.filter(c => D.chars[c].line === w.line).length >= w.n;
      if (hit) { stateData.flags[key] = true; (u.give || []).forEach(p => { if (!stateData.unlockedParts.includes(p)) stateData.unlockedParts.push(p); }); }
    });
  }
  function lineCount(l) { return stateData.got.filter(c => D.chars[c] && D.chars[c].line === l).length; }
  function checkAchvs() {
    D.achievements.forEach(a => {
      if (stateData.achievements.includes(a.id)) return;
      const r = a.rule; let ok = false;
      if (r.type === "count") { ok = stateData.got.length >= r.n; if (ok && r.noHints) ok = stateData.stats.hints === 0; }
      else if (r.type === "firstTriple") ok = D.endings.minor.triples.some(has);
      else if (r.type === "firstPanel") ok = stateData.stats.panels >= 1;
      else if (r.type === "chars") ok = r.chars.every(has);
      else if (r.type === "lineCount") ok = lineCount(r.line) >= r.n;
      else if (r.type === "allRare") ok = allChars().filter(c => D.chars[c].rare).every(has);
      else if (r.type === "all") ok = stateData.got.length >= allChars().length;
      if (ok) stateData.achievements.push(a.id);
    });
  }

  /* 贪心合成：循环所有材料对直到无进展 */
  let merges = 0, panels = 0;
  for (let round = 0; round < 60; round++) {
    let progress = false;
    const mats = [...new Set([...stateData.unlockedParts, ...stateData.got])];
    for (let i = 0; i < mats.length; i++) {
      for (let j = i; j < mats.length; j++) {
        const r = ZZSH.findRecipe(mats[i], mats[j]);
        if (!r) continue;
        if (!r.results.some(c => !has(c))) continue;
        stateData.stats.tries++;
        if (r.results.length > 1) { stateData.stats.panels++; panels++; }
        r.results.forEach(c => {
          if (!has(c)) { stateData.got.push(c); merges++; progress = true; }
        });
        checkUnlocks(); checkAchvs();
      }
    }
    if (!progress) break;
  }

  const total = allChars().length;
  const ok = stateData.got.length === total;
  const minor = D.endings.minor.triples.every(has);
  const major = stateData.got.length >= total;
  const allAchv = stateData.achievements.length === D.achievements.length;
  console.log(`7. 全流程模拟：合成 ${merges} 字（面板 ${panels} 次）→ 收集 ${stateData.got.length}/${total}` +
    `，小通关 ${minor ? "✓" : "✗"}，大通关 ${major ? "✓" : "✗"}，成就 ${stateData.achievements.length}/${D.achievements.length} ${allAchv ? "✓" : "✗"}`);
  if (!ok) err(`模拟收集不完整：缺 ${allChars().filter(c => !has(c)).join("、")}`);
  if (!minor) err("小通关不可达");
  if (!allAchv) err(`有成就无法达成：缺 ${D.achievements.filter(a => !stateData.achievements.includes(a.id)).map(a => a.name).join("、")}`);

  /* 孤立提示语检查：独立思考成就依赖 noHints=0 */
  const thinker = D.achievements.find(a => a.id === "thinker");
  if (thinker && stateData.stats.hints > 0) {
    console.log("   - 独立思考成就：本次模拟用了提示未达成（正常，模拟不开提示即可）");
  }
})();

/* ---------- 8. R2 图鉴剪影：strokes 字段 ---------- */
(function () {
  const chars = Object.keys(D.chars);
  const bad = [];
  chars.forEach(c => {
    const s = D.chars[c].strokes;
    if (!Number.isInteger(s) || s < 2 || s > 17) bad.push(`${c}=${s}`);
  });
  console.log(`8. R2 strokes 笔画数：${chars.length} 字，${bad.length ? "问题：" + bad.join("、") : "全部为 2~17 的整数，通过"}`);
  if (bad.length) err(`strokes 字段缺失或越界：${bad.join("、")}`);
})();

/* ---------- 9. R3 据义造字：quizMode / quizDesc 校验 ---------- */
(function () {
  const chars = Object.keys(D.chars);
  const bad = [];
  let soft = 0;
  chars.forEach(c => {
    const q = D.chars[c];
    const mode = q.quizMode;
    if (!["full", "assist", "skip"].includes(mode)) { bad.push(`${c} quizMode=${mode} 非法`); return; }
    if (mode === "skip") return;
    if (typeof q.quizDesc !== "string" || !q.quizDesc) { bad.push(`${c} 缺 quizDesc`); return; }
    if (q.quizDesc.length > 24) bad.push(`${c} quizDesc 超 24 字（${q.quizDesc.length}）`);
    const rs = D.recipes.filter(r => r.results.includes(c));
    if (!rs.length) { bad.push(`${c} 无配方`); return; }
    const { a, b } = rs[0];
    if (q.quizDesc.includes(c)) bad.push(`${c} quizDesc 含目标字`);
    const hits = [...new Set(a + b)].filter(p => q.quizDesc.includes(p));
    if (hits.length >= 2) bad.push(`${c} quizDesc 双部件泄底:${hits.join("/")}`);
    else if (hits.length === 1) soft++;
    if (mode === "assist") {
      if (!q.assistPart || ![a, b].includes(q.assistPart)) bad.push(`${c} assistPart 非法`);
    }
  });
  const m = { full: 0, assist: 0, skip: 0 };
  chars.forEach(c => m[D.chars[c].quizMode]++);
  console.log(`9. R3 quiz 数据：full ${m.full} / assist ${m.assist} / skip ${m.skip}，` +
    `软引导（单部件命中）${soft} 处，${bad.length ? "问题：" + bad.join("、") : "通过"}`);
  if (bad.length) err(`R3 quiz 校验失败：${bad.join("、")}`);
})();

/* ---------- 10. R4 字族树：family 校验 ---------- */
(function () {
  const chars = Object.keys(D.chars);
  /* 族根声明提前提取，R4 与第 11 项共用。
   * 族根字（土田干古）本身在字表里且无 family，是链的合法终点。 */
  const uiSrcAll = fs.readFileSync(path.join(__dirname, "..", "ui.js"), "utf8");
  const declSrc = uiSrcAll.slice(uiSrcAll.indexOf("var TREE_ROOTS"), uiSrcAll.indexOf("function renderFamilyTree"));
  const ROOT_DECLS = new Set();
  let rm;
  const reRoot = /roots?:\s*\[?\s*"([^"]+)"(?:\s*,\s*"([^"]+)")?/g;
  while ((rm = reRoot.exec(declSrc))) {
    ROOT_DECLS.add(rm[1]);
    if (rm[2]) ROOT_DECLS.add(rm[2]);
  }
  const partSet = new Set(Object.keys(D.partInfo));
  const charSet = new Set(chars);
  const bad = [];
  const ROOTS = new Set(["木", "日", "人", "火", "水", "十"]);
  // 注：非根部件（月口一心田小大不土目一）也是合法终点
  chars.forEach(c => {
    const p = D.chars[c].family;
    if (!p) { if (!ROOT_DECLS.has(c)) bad.push(`${c} 无 family`); return; }
    if (!partSet.has(p) && !charSet.has(p)) bad.push(`${c} family="${p}" 不在部件∪字表`);
  });
  // 上溯：无环、≤4 步到部件
  chars.forEach(c => {
    if (!D.chars[c].family) return; /* 无 family 的声明族根即终点 */
    let cur = c, steps = 0;
    const seen = new Set([c]);
    while (cur && partSet.has(cur) === false && !ROOT_DECLS.has(cur)) {
      cur = D.chars[cur] ? D.chars[cur].family : null;
      steps++;
      if (!cur || steps > 4) { bad.push(`${c} 断链或超4层`); return; }
      if (seen.has(cur)) { bad.push(`${c} 环`); return; }
      seen.add(cur);
    }
  });
  // 语义关联：parent 必须出现在该字配方或其祖先配方中（防标注笔误）
  chars.forEach(c => {
    const p = D.chars[c].family;
    if (!p) return; /* 族根无 family，不参与配方关联检查 */
    const rs = D.recipes.filter(r => r.results.includes(c));
    if (!rs.length) return;
    const ok = rs.some(r => r.a === p || r.b === p);
    if (!ok) bad.push(`${c} family="${p}" 不在其配方中`);
  });
  console.log(`10. R4 family 字族：${chars.length} 字，${bad.length ? "问题：" + bad.join("、") : "全挂载无环，parent均在配方内，通过"}`);

  /* ---------- 11. 字族树根覆盖（防漏字回归） ----------
   * ui.js 的 TREE_ROOTS 必须与数据里的族根一一对应，否则那些字在字族树里不显示。
   * 历史上这里只写了 6 个根，导致 21 个字（22%）从树上消失。 */
  (function () {
    const declared = ROOT_DECLS; /* 与 R4 共用同一份声明 */
    // 数据里实际的族根 = family 指向非字表的节点（无 family 的声明族根除外）
    const actual = new Set();
    chars.forEach(c => {
      const p = D.chars[c].family;
      if (p && !charSet.has(p)) actual.add(p);
    });
    const missing = [...actual].filter(r => !declared.has(r));
    const covered = new Set();
    declared.forEach(r => {
      (function walk(n) {
        if (covered.has(n)) return;
        covered.add(n);
        chars.forEach(c => { if (D.chars[c].family === n) walk(c); });
      })(r);
    });
    const orphan = chars.filter(c => !covered.has(c));
    if (missing.length) err(`字族树未声明的族根：${missing.join("、")}`);
    if (orphan.length) err(`字族树显示不到的字（${orphan.length}）：${orphan.join("、")}`);
    console.log(`11. 字族树根覆盖：声明 ${declared.size} 根 / 实际 ${actual.size} 根，` +
      `可达 ${chars.length - orphan.length}/${chars.length} 字，` +
      (missing.length || orphan.length ? "有漏字！" : "通过"));
  })();
  if (bad.length) err(`R4 family 校验失败：${bad.join("、")}`);
})();

/* ---------- 汇总 ---------- */
console.log("\n========== 汇总 ==========");
if (warns.length) warns.forEach(w => console.log("⚠ " + w));
if (errors.length) {
  errors.forEach(e => console.log("✗ " + e));
  console.log(`\n结果：${errors.length} 个错误，${warns.length} 个警告 —— 校验失败`);
  process.exit(1);
} else {
  console.log(`结果：0 错误，${warns.length} 个警告 —— 全部通过 ✅`);
}
