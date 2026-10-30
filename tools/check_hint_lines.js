/* 回归：提示寻路必须覆盖全部 10 条主线
 * 背景：pickHintTarget 原先硬编码 6 条主线 id，2026-10-30 拆出
 * 身体发肤/心之所向/口舌之间/玉之斑斓 后，这四线的字永远当不上提示目标，
 * 玩家卡在这些字上时点💡只会得到"先多解锁一些部件吧"。
 * 做法：逐条主线只留该线的字未收集，看 nextHint 是否真能指向该线的字。
 *
 * 2026-10-30 v1.3 扩展为《测试用例_v1.3.md》D 模块（D1~D6）：
 *   D1 十条主线寻路   D2 full/assist 走面板   D3 skip 档三次递进
 *   D4 无目标计 0 次  D5 计数与封成就        D6 据义造字收录
 */
var fs = require("fs");
var path = require("path");

global.window = global;
global.ZZSH = {};
require(path.join(__dirname, "..", "data.js"));
require(path.join(__dirname, "..", "engine.js"));
var D = global.ZZSH.DATA;

var ALL = Object.keys(D.chars);

/* 最小 state 桩，engine 只用到 data / partUnlocked / save */
function makeState(got, parts) {
  return {
    data: { got: got.slice(), unlockedParts: parts.slice(), achievements: [], stats: { hints: 0 }, flags: {} },
    partUnlocked: function (p) { return this.data.unlockedParts.indexOf(p) >= 0; },
    save: function () {}
  };
}

var fails = [];
var lines = Object.keys(D.lines).sort(function (a, b) { return D.lines[a].order - D.lines[b].order; });

lines.forEach(function (lineId) {
  /* 挑一个该线上"据义造字面板"档的字（full/assist），这样 nextHint 会返回目标字本身 */
  var cand = ALL.filter(function (c) {
    var i = D.chars[c];
    if (i.line !== lineId) return false;
    if (i.quizMode !== "full" && i.quizMode !== "assist") return false;
    var r = ZZSH.engine.findRecipeFor(c);
    return !!r;
  })[0];

  if (!cand) { fails.push(lineId + " 没有 full/assist 档的字，测试无法判定"); return; }

  var recipe = ZZSH.engine.findRecipeFor(cand);
  /* 除本线外全部收集；本线只差 cand（其余本线字也当作已收集，保证目标是 cand） */
  var got = ALL.filter(function (c) { return D.chars[c].line !== lineId; });
  ALL.forEach(function (c) {
    if (D.chars[c].line === lineId && c !== cand) got.push(c);
  });
  /* cand 的两个原料必须在手 */
  [recipe.a, recipe.b].forEach(function (m) {
    if (got.indexOf(m) < 0 && D.partInfo.hasOwnProperty(m)) return; // 部件
    if (got.indexOf(m) < 0) got.push(m);
  });
  var parts = Object.keys(D.partInfo).filter(function (p) { return got.indexOf(p) < 0; });

  global.ZZSH.state = makeState(got, parts);
  var h = global.ZZSH.engine.nextHint();
  var ok = h && h.quiz === "panel" && h.char === cand;
  if (!ok) fails.push(D.lines[lineId].name + "(" + lineId + ") 期望指向「" + cand + "」，实际 " + JSON.stringify(h));
  else console.log("✓ " + D.lines[lineId].name + " → 「" + cand + "」");
});

if (fails.length) {
  console.log("D1 失败 " + fails.length + " 条：");
  fails.forEach(function (f) { console.log("  ✗ " + f); });
} else {
  console.log("D1 全部 " + lines.length + " 条主线提示寻路通过");
}

/* ================= D2~D6 ================= */
console.log("");
function ck(cond, msg, extra) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg + (cond || extra === undefined ? "" : "  ← " + extra));
  if (!cond) fails.push(msg);
}

/* 构造「只剩 cand 未收集」的状态：除 cand 外全部收集，部件全解锁。
 * 注意别把 partInfo 的键塞进 got——「目/大/土/田」同时出现在 partInfo 与 chars
 * （老存档兼容），塞进去会让 has(cand) 恒真，目标永远选不出来。 */
function targetOnly(cand) {
  var got = ALL.filter(function (c) { return c !== cand; });
  global.ZZSH.state = makeState(got, Object.keys(D.partInfo));
  return got;
}

/* ---------- D2 full / assist 档：给本义描述，让玩家自己推 ---------- */
var panelCands = ALL.filter(function (c) {
  var q = D.chars[c];
  return (q.quizMode === "full" || q.quizMode === "assist") && !!q.quizDesc && !!ZZSH.engine.findRecipeFor(c);
});
var d2bad = panelCands.filter(function (c) {
  targetOnly(c);
  var h = global.ZZSH.engine.nextHint();
  return !(h && h.quiz === "panel" && h.char === c && h.text === D.chars[c].quizDesc);
}).slice(0, 5);
ck(d2bad.length === 0, "D2 full/assist 档返回本义描述（抽查 " + panelCands.length + " 字）",
   d2bad.join("、"));

/* ---------- D3 skip 档：三次递进，第 3 级给两个原料 ---------- */
var skipCands = ALL.filter(function (c) {
  var q = D.chars[c];
  return q.quizMode === "skip" && !!ZZSH.engine.findRecipeFor(c);
});
var d3 = null;
for (var si = 0; si < skipCands.length && !d3; si++) {
  var c = skipCands[si];
  targetOnly(c);
  var lv = [];
  for (var n = 0; n < 4; n++) lv.push(global.ZZSH.engine.nextHint());
  if (lv[0].quiz === "skip" && lv[0].level === 1 && lv[1].level === 2 && lv[2].level === 3) d3 = { c: c, lv: lv };
}
ck(!!d3, "D3 skip 档递进 1 → 2 → 3", d3 && JSON.stringify(d3.lv.map(function (h) { return h.level; })));
if (d3) {
  var rc = ZZSH.engine.findRecipeFor(d3.c);
  ck(d3.lv[2].a === rc.a && d3.lv[2].b === rc.b, "D3 第 3 级给出两个原料（供画布高亮）",
     JSON.stringify(d3.lv[2]));
  ck(d3.lv[3].level === 3, "D3 第四次仍是第 3 级，不越界");
  ck(d3.lv[0].text !== d3.lv[1].text && d3.lv[1].text !== d3.lv[2].text, "D3 三级文案各不相同");
}

/* ---------- D4 无目标：level 0 且不计 hints ---------- */
global.ZZSH.state = makeState(ALL.slice(), Object.keys(D.partInfo));
var before4 = global.ZZSH.state.data.stats.hints;
var h4 = global.ZZSH.engine.nextHint();
ck(h4.level === 0 && typeof h4.text === "string" && h4.text.length > 0, "D4 全收集时给 level-0 兜底文案", JSON.stringify(h4));
ck(global.ZZSH.state.data.stats.hints === before4, "D4 无提示目标时不计 hints（不误封「独立思考」）",
   global.ZZSH.state.data.stats.hints + " vs " + before4);
ck(!global.ZZSH.state.data.flags.hintUsed, "D4 无目标时不写 hintUsed 标记");

/* 新档且部件都没解锁时同样安全 */
global.ZZSH.state = makeState([], []);
var h4b = global.ZZSH.engine.nextHint();
ck(h4b.level === 0, "D4 空档且无部件时也不报错", JSON.stringify(h4b));

/* ---------- D5 计数与「独立思考」封禁 ---------- */
global.ZZSH.state = makeState([], Object.keys(D.partInfo));
var h5 = global.ZZSH.engine.nextHint();
ck(global.ZZSH.state.data.stats.hints === 1, "D5 有效提示 hints +1", global.ZZSH.state.data.stats.hints);
ck(global.ZZSH.state.data.flags.hintUsed === true, "D5 hintUsed 置位（「独立思考」被正确封死）");

/* ---------- D6 据义造字收录 ---------- */
var d6c = panelCands[0];
targetOnly(d6c);
var q1 = global.ZZSH.engine.finishMergeByQuiz(d6c);
ck(q1 && q1.ok === true && q1.result === d6c && q1.isNew === true, "D6 未收集字 → 收录并返回 isNew",
   JSON.stringify(q1));
ck(global.ZZSH.state.data.got.indexOf(d6c) >= 0, "D6 该字进入 got");
ck(global.ZZSH.engine.finishMergeByQuiz(d6c) === null, "D6 已收集字 → 返回 null（不重复收录）");

console.log("");
console.log("D 模块结果：" + (fails.length ? fails.length + " 项失败" : "全部通过 ✅"));
if (fails.length) {
  fails.forEach(function (f) { console.log("  ✗ " + f); });
  process.exit(1);
}
