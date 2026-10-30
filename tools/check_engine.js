/* ============================================================
 * 字字生花 · tools/check_engine.js
 * 合成引擎单测，对应《测试用例_v1.3.md》C 模块（C1~C12）
 *
 * 为什么单独一个文件：validate_data.js 里的「全流程模拟」是自己抄了一份
 * engine 逻辑（找不到当了周期的 duplicate），engine 真改了它照样绿。
 * 这里全部走真实的 ZZSH.engine / ZZSH.state，改坏实现必须转红。
 *
 * 用法：node tools/check_engine.js
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

/* ---- 浏览器环境 stub ---- */
global.window = global;
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.btoa = s => Buffer.from(s, "binary").toString("base64");
global.atob = s => Buffer.from(s, "base64").toString("binary");

const load = f => (0, eval)(fs.readFileSync(path.join(__dirname, "..", f), "utf8"));
load("data.js");
load("state.js");
load("engine.js");
const ZZSH = global.window.ZZSH;
const D = ZZSH.DATA;
const E = ZZSH.engine;
const ALL = Object.keys(D.chars);

let fail = 0;
function ck(cond, msg, extra) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg + (cond || extra === undefined ? "" : "  ← " + extra));
  if (!cond) fail++;
}
function group(t) { console.log("\n== " + t + " =="); }

/* 新档：只保留起始 5 部件，got 清空 */
function fresh() {
  ZZSH.state.data = ZZSH.state.importCode(Buffer.from(JSON.stringify({
    version: 1, got: [], unlockedParts: D.parts.slice(), achievements: [],
    stats: { tries: 0, fails: 0, hints: 0, panels: 0, startAt: 0, minorEndAt: 0 },
    settings: { sound: false, strokeAnim: false }, guide: { done: true, step: 99 }, flags: {}
  }), "utf8").toString("base64"));
  return ZZSH.state.data;
}
/* 把某些字直接塞进 got（不走合成），用于构造中档 */
function give(chars) {
  chars.forEach(c => { if (ZZSH.state.data.got.indexOf(c) < 0) ZZSH.state.data.got.push(c); });
}

/* ---------- C1 无配方 ---------- */
group("C1/C2/C3 单结果合成");
fresh();
let noPair = null;
for (let i = 0; i < D.parts.length && !noPair; i++) {
  for (let j = i + 1; j < D.parts.length; j++) {
    if (!ZZSH.findRecipe(D.parts[i], D.parts[j])) { noPair = [D.parts[i], D.parts[j]]; break; }
  }
}
let before = ZZSH.state.data.stats.fails;
let r1 = E.tryMerge(noPair[0], noPair[1]);
ck(r1.ok === false && r1.reason === "noRecipe", "C1 无配方返回 ok:false/noRecipe", JSON.stringify(r1));
ck(!!r1.failText && typeof r1.failText === "string", "C1 给出失败文案", r1.failText);
ck(ZZSH.state.data.stats.fails === before + 1, "C1 fails +1");
ck(ZZSH.state.data.stats.tries === 1, "C1 tries +1");

/* ---------- C2/C3 正常合成与重复合成 ---------- */
let r2 = E.tryMerge("日", "月");
ck(r2.ok === true && r2.result === "明" && r2.isNew === true, "C2 日+月 → 明（新字）", JSON.stringify(r2));
ck(ZZSH.state.data.got.length === 1, "C2 got 长度 1", ZZSH.state.data.got.length);
/* 解锁：明 → 一、水 */
ck(ZZSH.state.partUnlocked("一") && ZZSH.state.partUnlocked("水"), "C8 合成「明」解锁部件「一」「水」");
E.tryMerge("日", "月");
ck(ZZSH.state.data.got.length === 1, "C3 重复合成不虚增收集数", ZZSH.state.data.got.length);
ck(ZZSH.state.data.got.filter(c => c === "明").length === 1, "C3 got 内无重复项");
let aliased;
E.tryMerge("日", "月").isNew === false && (aliased = true);
ck(aliased === true, "C3 isNew 为 false");

/* ---------- C4 多解 ---------- */
group("C4 多解与选择面板");
fresh();
let multi = E.tryMerge("木", "一");
ck(multi.ok === true && multi.needPanel === true, "C4 多解返回 needPanel", JSON.stringify(multi).slice(0, 80));
let panelOK = true, panelsBefore = ZZSH.state.data.stats.panels;
multi.recipe.results.forEach(c => {
  const GotBefore = ZZSH.state.data.got.slice();
  const m = E.resolvePanelChoice(multi.recipe, c);
  if (!m.ok || m.result !== c) panelOK = false;
  ZZSH.state.data.got = GotBefore;      // 逐个候选独立验证，互不影响
});
ck(panelOK, "C4 每个候选都能被正确选出", multi.recipe.results.join("/"));
ck(ZZSH.state.data.stats.panels === panelsBefore + multi.recipe.results.length, "C4 panels 计数 +each");
E.resolvePanelChoice(multi.recipe, multi.recipe.results[0]);
ck(E.has(multi.recipe.results[0]), "C4 选中后该字被收录");

/* ---------- C5 顺序无关 ---------- */
group("C5/C6 配方对称性");
fresh();
let ab = E.tryMerge("人", "木");
let ba = (fresh(), E.tryMerge("木", "人"));
ck(ab.ok === ba.ok && ab.result === ba.result, "C5 tryMerge 与顺序无关", ab.result + "/" + ba.result);
let allSymmetric = D.recipes.every(rc => ZZSH.findRecipe(rc.a, rc.b) === ZZSH.findRecipe(rc.b, rc.a));
ck(allSymmetric, "C5 findRecipe 正反向返回同一条配方");

fresh();
give(["明", "休", "林"]);
const pairs = E.craftablePairs();
ck(pairs.length > 0, "C6 中档有可合成对", pairs.length);
ck(pairs.every(p => !!ZZSH.findRecipe(p[0], p[1])), "C6 每个 pair 都能命中配方");
ck(pairs.every(p => ZZSH.findRecipe(p[0], p[1]).results.some(c => !E.has(c))),
   "C6 不含「结果已全部收集」的配方");
give(ALL);
ck(E.craftablePairs().length === 0, "C6 满档无可合成对", E.craftablePairs().length);

/* ---------- C7 失败文案分级 ---------- */
group("C7 失败文案分级");
fresh();
const selfTxt = E.failTextFor("木", "木");
ck(D.failTexts.self.indexOf("{a}") >= 0 && /木/.test(selfTxt) && /林/.test(selfTxt),
   "C7 self 分支：提示能成的字", selfTxt);
const bothTxt = E.failTextFor(noPair[0], noPair[1]);
ck(bothTxt === D.failTexts.both, "C7 both 分支：通用文案", bothTxt);
/* one 分支：材料 X 的所有配方结果都已收集，材料 Y 还有未收集的 → 只点名已耗尽的那个 */
let oneCase = null;
ALL.forEach(missing => {
  if (oneCase) return;
  fresh();
  give(ALL.filter(c => c !== missing));
  if (E.craftablePairs().length === 0) return;
  const mats = D.parts.concat(ALL.filter(c => !!E.findRecipeFor(c)));
  const busy = new Set();
  E.craftablePairs().forEach(p => { busy.add(p[0]); busy.add(p[1]); });
  const x = mats.find(m => !busy.has(m));
  const y = E.craftablePairs()[0][0];
  if (x && y && x !== y) oneCase = { x, y, missing };
});
if (oneCase) {
  fresh();
  give(ALL.filter(c => c !== oneCase.missing));
  const txt = E.failTextFor(oneCase.x, oneCase.y);
  ck(txt !== D.failTexts.both && txt.indexOf(oneCase.x) >= 0 && txt.indexOf(oneCase.y) < 0,
     "C7 one 分支：只点名已耗尽的「" + oneCase.x + "」", txt);
} else {
  ck(false, "C7 one 分支：构造不出耗尽场景（数据可能无此形态）");
}

/* ---------- C8 解锁链 ---------- */
group("C8 解锁链");
fresh();
E.tryMerge("木", "木");            // 林
E.tryMerge("林", "木");            // 森（第一个三叠字）
ck(ZZSH.state.partUnlocked("心") && ZZSH.state.partUnlocked("力"),
   "C8 第一个三叠字解锁「心」「力」");

/* ---------- C9 成就 ---------- */
group("C9 成就判定");
function achvWith(chars, opts) {
  fresh();
  give(chars);
  if (opts && opts.hints) ZZSH.state.data.stats.hints = opts.hints;
  if (opts && opts.panels) ZZSH.state.data.stats.panels = opts.panels;
  return E.checkAchievements().map(a => a.id);
}
ck(achvWith(["明"]).indexOf("first") >= 0, "C9 初见（收集第 1 字）");
ck(achvWith(["森"]).indexOf("triple1") >= 0, "C9 三生万物（第一个三叠字）");
ck(achvWith(["明"], { panels: 1 }).indexOf("panel") >= 0, "C9 同字不同命（用过选择面板）");
ck(achvWith(["明", "昌"]).indexOf("sunmoon") >= 0, "C9 日月同辉（明+昌）");
const wf = ALL.filter(c => D.chars[c].line === "shuihuo").slice(0, 5);
ck(achvWith(wf).indexOf("waterfire") >= 0, "C9 水火交融（水火线 5 字）");
const rare = ALL.filter(c => D.chars[c].rare);
ck(achvWith(rare).indexOf("seeker") >= 0, "C9 寻珍者（全部生僻字）");
ck(achvWith(ALL).indexOf("all") >= 0, "C9 字字生花（图鉴集满）");
ck(achvWith(ALL, { hints: 0 }).indexOf("thinker") >= 0, "C9 独立思考（0 提示 · 30 字）");
ck(achvWith(ALL, { hints: 3 }).indexOf("thinker") < 0, "C9 用过提示则「独立思考」不达成");

/* ---------- C10 结局 ---------- */
group("C10 结局判定");
fresh();
give(D.endings.minor.triples);
let e1 = E.checkEndings();
ck(e1.minor === true, "C10 六三叠齐 → 小通关");
ck(E.checkEndings().minor === false, "C10 小通关只触发一次");
fresh();
give(ALL);
let e2 = E.checkEndings();
ck(e2.major === true, "C10 全收集 → 大通关");
ck(E.checkEndings().major === false, "C10 大通关只触发一次");

/* ---------- C11 真引擎全流程 ---------- */
group("C11 真引擎全流程");
fresh();
(function () {
  let guard = 0, merges = 0, panelUses = 0;
  while (guard++ < 1200) {
    const ps = E.craftablePairs();
    if (!ps.length) break;
    let did = false;
    for (let i = 0; i < ps.length && !did; i++) {
      const rc = ZZSH.findRecipe(ps[i][0], ps[i][1]);
      if (!rc) continue;
      const target = rc.results.find(c => !E.has(c));
      if (!target) continue;
      const m = rc.results.length > 1
        ? (panelUses++, E.resolvePanelChoice(rc, target))
        : E.tryMerge(ps[i][0], ps[i][1]);
      if (m && m.ok && E.has(m.result)) { merges++; did = true; }
    }
    if (!did) break;
  }
  const got = ZZSH.state.data.got;
  ck(got.length === ALL.length, "C11 收集 " + got.length + "/" + ALL.length + "（合成 " + merges + " 次，面板 " + panelUses + " 次）");
  ck(new Set(got).size === got.length, "C11 过程中 got 无重复");
  ck(ZZSH.state.data.achievements.length === D.achievements.length,
     "C11 成就全达成 " + ZZSH.state.data.achievements.length + "/" + D.achievements.length);
  ck(ZZSH.state.data.flags.endingMajor === true, "C11 大通关标记已置位");
})();

/* ---------- C12 add 去重 ---------- */
group("C12 收集去重");
fresh();
const c0 = ZZSH.state.data.got.length;
for (let i = 0; i < 100; i++) ZZSH.state.add("明");
ck(ZZSH.state.data.got.length === c0 + 1, "C12 连 add 同一字 100 次只 +1", ZZSH.state.data.got.length);

console.log("\n结果：" + (fail ? fail + " 项失败" : "全部通过 ✅"));
process.exit(fail ? 1 : 0);
