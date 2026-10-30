/* ============================================================
 * 字字生花 · tools/test_migrate.js
 * 存档迁移回归：验证「田」「土」由解锁件改为合成字之后，
 * v1.0 老存档不会丢原料、不会出现重复字块。
 * 用法：node tools/test_migrate.js
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

/* ---- stub 浏览器环境 ---- */
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

let fail = 0;
function ck(cond, msg) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg);
  if (!cond) fail++;
}

console.log("== 老存档（v1.0：田、土在 unlockedParts 里）==");
/* 模拟一个已经玩到「休」和「明」的老存档 */
store[D.meta.saveKey] = JSON.stringify({
  version: 1,
  got: ["明", "休", "林", "森"],
  unlockedParts: ["日", "月", "木", "人", "口", "一", "水", "火", "田", "土"],
  achievements: ["first"],
  stats: { tries: 10, fails: 1, hints: 0, panels: 0, startAt: Date.now(), minorEndAt: 0 },
  settings: { sound: true, strokeAnim: true },
  guide: { done: true, step: 9 },
  flags: {}
});

// 重新走一遍 load + selfHeal
ZZSH.state.data = (function () {
  // state.js 的 load 不可直接访问，借助 importCode 走同一套 migrate
  return ZZSH.state.importCode(Buffer.from(JSON.stringify(
    JSON.parse(store[D.meta.saveKey])), "utf8").toString("base64"));
})();
ZZSH.engine.selfHeal();

const st = ZZSH.state.data;
ck(st.unlockedParts.indexOf("田") < 0, "unlockedParts 不再含「田」");
ck(st.unlockedParts.indexOf("土") < 0, "unlockedParts 不再含「土」");
ck(st.got.indexOf("田") >= 0, "got 已补入「田」");
ck(st.got.indexOf("土") >= 0, "got 已补入「土」");
ck(st.got.length === 6, "收集数 4 → 6（田、土各 +1），实际 " + st.got.length);
ck(st.got.indexOf("林") >= 0 && st.got.indexOf("森") >= 0, "原有字未丢失");

/* 配方可用性：田、土作为原料仍能被 craftablePairs 找到 */
const mats = st.unlockedParts.concat(st.got.filter(c => st.unlockedParts.indexOf(c) < 0));
ck(mats.indexOf("田") >= 0 && mats.indexOf("土") >= 0, "田、土仍在可用原料集合内");
ck(!!ZZSH.findRecipe("田", "木"), "田+木 → 果 配方可命中");
ck(!!ZZSH.findRecipe("小", "土"), "小+土 → 尘 配方可命中");

console.log("\n== 新存档（不含田、土，须靠合成取得）==");
ZZSH.state.data = ZZSH.state.importCode(Buffer.from(JSON.stringify({
  version: 1, got: [], unlockedParts: D.parts.slice(), achievements: [],
  stats: { tries: 0, fails: 0, hints: 0, panels: 0, startAt: 0, minorEndAt: 0 },
  settings: { sound: true, strokeAnim: true }, guide: { done: false, step: 0 }, flags: {}
}), "utf8").toString("base64"));
ZZSH.engine.selfHeal();
const s2 = ZZSH.state.data;
ck(s2.unlockedParts.length === 5, "起始仍是 5 部件，实际 " + s2.unlockedParts.length);
ck(s2.got.indexOf("田") < 0 && s2.got.indexOf("土") < 0, "新档不含田、土");
/* 「十」现在由「休」解锁，之后即可合成田与土 */
const u = D.unlocks.find(x => x.when.type === "got" && x.when.char === "休");
ck(u && u.give.indexOf("十") >= 0 && u.give.indexOf("田") < 0, "休 → 给「火、十」，不再给「田」");
ck(!!ZZSH.findRecipe("十", "口"), "十+口 配方存在（古 / 田）");
ck(!!ZZSH.findRecipe("一", "十"), "一+十 配方存在（干 / 土）");

console.log("\n结果：" + (fail ? fail + " 项失败" : "全部通过 ✅"));
process.exit(fail ? 1 : 0);
