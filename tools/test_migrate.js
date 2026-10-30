/* ============================================================
 * 字字生花 · tools/test_migrate.js
 * 存档迁移回归，对应《测试用例_v1.3.md》B 模块（B1~B11）：
 *   B1/B2 老存档「田」「土」由解锁件改为合成字后不丢原料、不出重复字块
 *   B3/B4 新档仍是 5 起始部件，田/土靠合成且仍可作原料
 *   B5~B9 导出导入往返、非法码、未来版本号、去重、非法项剔除
 *   B10   selfHeal 补发部件/成就
 *   B11   localStorage 不可用时降级不抛异常
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

/* ---------- B5 存档码往返一致 ---------- */
console.log("\n== B5/B6/B7/B8/B9 存档码 ==");
const b64 = o => Buffer.from(JSON.stringify(o), "utf8").toString("base64");
const mid = {
  version: 1,
  got: ["明", "休", "林", "森", "困", "田", "土"],
  unlockedParts: ["日", "月", "木", "人", "口", "一", "水", "火", "心", "力"],
  achievements: ["first", "triple1"],
  stats: { tries: 33, fails: 4, hints: 0, panels: 2, startAt: 1700000000000, minorEndAt: 0 },
  settings: { sound: false, strokeAnim: false },
  guide: { done: true, step: 5 }, flags: { endingMinor: false }
};
const back = ZZSH.state.importCode(b64(mid));
ck(!!back, "中档存档码可被解析");
ck(back && back.got.length === mid.got.length &&
   mid.got.every(c => back.got.indexOf(c) >= 0), "导入后 got 完全一致");
ck(back && back.stats.tries === 33 && back.stats.panels === 2, "stats 往返一致");
ck(back && back.settings.sound === false && back.settings.strokeAnim === false, "settings 往返一致");
ck(back && back.achievements.length === 2, "achievements 往返一致");
/* 导出：直接序列化当前 state.data 再解回来 */
ZZSH.state.data = back;
ck(ZZSH.state.importCode(ZZSH.state.exportCode()) !== null, "exportCode → importCode 往返成功");

["这不是存档码", "", "   ", "eyJhIjoxfQ", null, undefined].forEach(bad => {
  let threw = false, r = null;
  try { r = ZZSH.state.importCode(bad); } catch (e) { threw = true; }
  ck(!threw && r === null, "非法存档码返回 null 且不抛异常：" + JSON.stringify(bad));
});

ck(!!ZZSH.state.importCode(b64({ version: 999, got: ["明"] })), "未来版本号也能解析（回落到默认）");
const future = ZZSH.state.importCode(b64({ version: 999, got: ["明"] }));
ck(future.got.length === 0, "B7 未来版本号 → 重置为空档");

const dup = ZZSH.state.importCode(b64({
  version: 1, got: ["明", "明", "林", "林", "林"], unlockedParts: ["日", "月", "日"],
  achievements: [], stats: {}, settings: {}, guide: { done: true, step: 9 }, flags: {}
}));
ck(dup.got.length === 2, "B8 重复字去重（5 → 2），实际 " + dup.got.length);
ck(dup.unlockedParts.filter(p => p === "日").length === 1, "B9 重复部件去重");

const junk = ZZSH.state.importCode(b64({
  version: 1, got: ["明", "这个字不存在", "林"], unlockedParts: ["日", "不存在部件"],
  achievements: [], stats: {}, settings: {}, guide: { done: true, step: 9 }, flags: {}
}));
ck(junk.got.indexOf("这个字不存在") < 0 && junk.got.length === 2, "B9 非法字被剔除");
ck(junk.unlockedParts.indexOf("不存在部件") < 0, "B9 非法部件被剔除");
ck(D.parts.every(p => junk.unlockedParts.indexOf(p) >= 0), "B9 起始 5 部件被补回");

/* ---------- B10 selfHeal ---------- */
console.log("\n== B10 自愈 ==");
ZZSH.state.data = ZZSH.state.importCode(b64({
  version: 1, got: ["明", "林", "森"], unlockedParts: D.parts.slice(),
  achievements: ["first", "已经删掉的成就"], stats: { tries: 5, fails: 0, hints: 0, panels: 0, startAt: 0, minorEndAt: 0 },
  settings: { sound: true, strokeAnim: true }, guide: { done: true, step: 9 }, flags: {}
}));
ZZSH.engine.selfHeal();
const h = ZZSH.state.data;
ck(h.achievements.indexOf("已经删掉的成就") < 0, "失效成就 id 被清除");
ck(h.achievements.indexOf("first") >= 0, "有效成就保留");
ck(h.unlockedParts.indexOf("一") >= 0 && h.unlockedParts.indexOf("水") >= 0, "遗漏部件「一」「水」补发");
ck(h.achievements.indexOf("triple1") >= 0, "三叠字成就按现状补发");
const before10 = h.got.length;
ZZSH.engine.selfHeal();
ck(h.got.length === before10, "重复 selfHeal 不虚增收集数");

/* ---------- B11 storage 不可用 ---------- */
console.log("\n== B11 存储降级 ==");
(function () {
  const real = global.localStorage;
  global.localStorage = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
    removeItem: () => { throw new Error("denied"); }
  };
  let threw = false;
  try { ZZSH.state.save(); } catch (e) { threw = true; }
  ck(!threw, "localStorage 抛异常时 save() 不冒泡");
  /* 注意：state.js 只在初始化时 probe 一次，这里的 late-fail 由 save 内部 try 兜住 */
  global.localStorage = real;
})();

console.log("\n结果：" + (fail ? fail + " 项失败" : "全部通过 ✅"));
process.exit(fail ? 1 : 0);
