/* 回归：提示寻路必须覆盖全部 10 条主线
 * 背景：pickHintTarget 原先硬编码 6 条主线 id，2026-10-30 拆出
 * 身体发肤/心之所向/口舌之间/玉之斑斓 后，这四线的字永远当不上提示目标，
 * 玩家卡在这些字上时点💡只会得到"先多解锁一些部件吧"。
 * 做法：逐条主线只留该线的字未收集，看 nextHint 是否真能指向该线的字。 */
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
    data: { got: got.slice(), unlockedParts: parts.slice(), stats: { hints: 0 }, flags: {} },
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

console.log("");
if (fails.length) {
  console.log("失败 " + fails.length + " 条：");
  fails.forEach(function (f) { console.log("  ✗ " + f); });
  process.exit(1);
}
console.log("全部 " + lines.length + " 条主线提示寻路通过");
