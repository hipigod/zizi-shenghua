/* 四层玩法验收（CDP 直连真实页面）
 * 1 下一个目标条：文案随进度变化、「就差最后一个」判定
 * 2 里程碑：第 10 个字触发「已集 10 字」飘字
 * 3 连击：连续 3 个新字触发「连中 3」
 * 4 灵感线索：整十后给一条本义描述（不含字本身）
 * 5 主线集满：金色播报
 * 用法：node tools/check_engage.js（需先起 tools/serve.py）
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const os = require("os");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9491;
const URL = "http://127.0.0.1:8765/index.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port: PORT, path: p }, (r) => {
    let b = ""; r.on("data", (d) => (b += d));
    r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on("error", rej);
});

let fails = 0;
function ok(cond, msg, extra) {
  console.log((cond ? "✓ " : "✗ ") + msg + (cond || !extra ? "" : "  ← " + extra));
  if (!cond) fails++;
}

/* 注入页面侧拖放助手 */
const HELPER = `(function(){
  function pe(t,x,y,bt){return new PointerEvent(t,{bubbles:true,cancelable:true,pointerId:31,pointerType:"touch",isPrimary:true,button:0,buttons:bt,clientX:x,clientY:y});}
  function el(char){
    return document.querySelector('.partbar .tile[data-char="'+char+'"]') ||
           document.querySelector('.inventory .tile[data-char="'+char+'"]') ||
           document.querySelector('.board .tile[data-char="'+char+'"]');
  }
  function center(char){
    var t=document.querySelector('.board .tile[data-char="'+char+'"]');
    if(!t) return null; var r=t.getBoundingClientRect();
    return {x:r.left+r.width/2, y:r.top+r.height/2};
  }
  window.__E = {
    hideGuide: function(){ var g=document.getElementById('guide-mask'); if(g) g.classList.add('hidden'); },
    drag: function(char, x, y){
      var t=el(char); if(!t) return 'no-tile:'+char;
      var r=t.getBoundingClientRect();
      t.dispatchEvent(pe('pointerdown', r.left+r.width/2, r.top+r.height/2, 1));
      document.dispatchEvent(pe('pointermove',(r.left+x)/2,(r.top+y)/2,1));
      document.dispatchEvent(pe('pointermove',x,y,1));
      document.dispatchEvent(pe('pointerup',x,y,0));
      return 'ok';
    },
    center: center,
    board: function(){ var b=document.querySelector('.board').getBoundingClientRect(); return {l:b.left,t:b.top,w:b.width,h:b.height}; },
    pt: function(b, fx, fy){ return {x: Math.round(b.l + b.w*fx), y: Math.round(b.t + b.h*fy)}; },
    setGot: function(list){ ZZSH.state.data.got=list.slice(); ZZSH.ui.renderAll(); },
    clear: function(){ ZZSH.board.clearBoard(); var d=document.getElementById('card-drawer'); if(d) d.classList.add('hidden'); }
  };
  return 1;
})()`;

(async () => {
  const child = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-proxy-server", "--proxy-bypass-list=*",
    "--no-first-run", "--remote-debugging-port=" + PORT,
    "--user-data-dir=" + path.join(os.tmpdir(), "zzsh-eng-" + Date.now()),
    "--window-size=1200,860", "about:blank",
  ], { stdio: "ignore" });

  let tab = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    try { const l = await getJSON("/json/list"); tab = (l || []).find((t) => t.type === "page"); if (tab) break; } catch (e) {}
    await sleep(300);
  }
  if (!tab) { console.error("Chrome 没起来"); child.kill(); process.exit(1); }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const P = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && P.has(m.id)) { P.get(m.id)(m); P.delete(m.id); }
  });
  const send = (method, params) => new Promise((res) => {
    const i = ++id; P.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");

  const errs = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === "Runtime.exceptionThrown") {
      errs.push(String(m.params.exceptionDetails.text || "") + " " +
        ((m.params.exceptionDetails.exception || {}).description || "").slice(0, 120));
    }
  });

  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 200) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  async function boot() {
    await send("Page.navigate", { url: URL + "?t=" + Date.now() });
    for (let i = 0; i < 60; i++) {
      const ready = await ev('typeof ZZSH==="object" && !!ZZSH.ui && !!document.getElementById("btn-start")');
      if (ready === true) break;
      await sleep(250);
    }
    await ev('document.getElementById("btn-start").click()');
    await sleep(400);
    await ev(HELPER);
    await ev('window.__E.hideGuide()');
    await ev('window.__E.clear()');
  }

  /* ---------- 1. 目标条：无进度时的文案 ---------- */
  await boot();
  await ev('window.__E.setGot([])');
  let r = await ev(`(function(){
    var el=document.getElementById('next-goal');
    return { hidden: el.hidden, text: document.getElementById('ng-text').innerText,
             dot: getComputedStyle(document.getElementById('ng-dot')).backgroundColor };
  })()`);
  ok(r && r.hidden === false, "目标条在开局可见", JSON.stringify(r));
  ok(r && /去碰碰看/.test(r.text), "目标条给出「拿某个字去碰」的方向", r && r.text);
  ok(r && r.dot && r.dot !== "rgba(0, 0, 0, 0)", "目标条带主线色点", r && r.dot);

  /* ---------- 2. 目标条：只差一个字 ---------- */
  r = await ev(`(function(){
    var all=Object.keys(ZZSH.DATA.chars);
    ZZSH.state.data.got=all.filter(function(c){return c!=='瑚';});
    ZZSH.ui.renderAll();
    return { text: document.getElementById('ng-text').innerText,
             hidden: document.getElementById('next-goal').hidden };
  })()`);
  ok(r && /就差最后一个/.test(r.text), "只剩 1 字时文案变成「就差最后一个」", r && r.text);
  ok(r && /玉之斑斓|水火之间|厚土田园|草木之间/.test(r.text), "文案点明是哪条主线", r && r.text);

  /* ---------- 3. 里程碑 + 灵感线索（第 10 字） ---------- */
  await boot();
  await ev(`window.__E.setGot(['昌','晶','旦','杲','杳','朋','早','是','亘'])`);
  let b = await ev('window.__E.board()');
  let P1 = await ev(`window.__E.pt(window.__E.board(), 0.35, 0.4)`);
  await ev(`window.__E.drag('日', ${P1.x}, ${P1.y})`);
  await sleep(150);
  let c = await ev(`window.__E.center('日')`);
  await ev(`window.__E.drag('月', ${Math.round(c.x)}, ${Math.round(c.y)})`);
  await sleep(900);
  r = await ev(`(function(){
    var f=[].slice.call(document.querySelectorAll('.float-word')).map(function(e){return e.className+'|'+e.textContent;});
    return { floats:f, got: ZZSH.state.data.got.length };
  })()`);
  ok(r && r.got === 10, "合成后收集数到 10", r && String(r.got));
  ok(r && r.floats.some((s) => /milestone/.test(s) && /已集 10 字/.test(s)), "第 10 字触发里程碑飘字", JSON.stringify(r && r.floats));
  /* 灵感线索要排在解锁/成就播报之后（toast 已队列化），最多等 15s */
  let clue = "";
  for (let i = 0; i < 60; i++) {
    clue = await ev(`document.getElementById('toast').innerText`);
    if (/灵感/.test(clue || "")) break;
    await sleep(250);
  }
  ok(/灵感/.test(clue || ""), "整十后给出一条灵感线索", clue);
  ok(/画/.test(clue || ""), "灵感线索带笔画数", clue);

  /* ---------- 4. 连击（连续 3 个新字） ---------- */
  await boot();
  await ev('window.__E.setGot([])');
  b = await ev('window.__E.board()');
  const spots = [
    await ev(`window.__E.pt(window.__E.board(), 0.25, 0.3)`),
    await ev(`window.__E.pt(window.__E.board(), 0.65, 0.3)`),
    await ev(`window.__E.pt(window.__E.board(), 0.25, 0.65)`),
    await ev(`window.__E.pt(window.__E.board(), 0.65, 0.65)`),
  ];
  const seq = [["日", "月"], ["木", "木"], ["人", "人"]];
  for (let i = 0; i < seq.length; i++) {
    const [p1, p2] = seq[i];
    await ev(`window.__E.drag('${p1}', ${spots[i].x}, ${spots[i].y})`);
    await sleep(140);
    const ctr = await ev(`window.__E.center('${p1}')`);
    if (!ctr) { ok(false, "拖出「" + p1 + "」失败"); break; }
    await ev(`window.__E.drag('${p2}', ${Math.round(ctr.x)}, ${Math.round(ctr.y)})`);
    await sleep(700);
  }
  r = await ev(`(function(){
    var f=[].slice.call(document.querySelectorAll('.float-word')).map(function(e){return e.className+'|'+e.textContent;});
    return { floats:f, got: ZZSH.state.data.got.length };
  })()`);
  ok(r && r.got >= 3, "连做 3 次合成都成功", r && String(r.got));
  ok(r && r.floats.some((s) => /combo/.test(s) && /连中 3/.test(s)), "连续 3 个新字触发「连中 3」", JSON.stringify(r && r.floats));

  /* ---------- 5. 主线集满播报 ---------- */
  await boot();
  await ev(`(function(){
    var ri=Object.keys(ZZSH.DATA.chars).filter(function(c){return ZZSH.DATA.chars[c].line==='riyue' && c!=='明';});
    window.__E.setGot(ri);
  })()`);
  b = await ev('window.__E.board()');
  let P2 = await ev(`window.__E.pt(window.__E.board(), 0.35, 0.4)`);
  await ev(`window.__E.drag('日', ${P2.x}, ${P2.y})`);
  await sleep(150);
  c = await ev(`window.__E.center('日')`);
  await ev(`window.__E.drag('月', ${Math.round(c.x)}, ${Math.round(c.y)})`);
  await sleep(900);
  r = await ev(`document.getElementById('toast').innerText`);
  ok(/集满/.test(r || ""), "主线集满时给金色播报", r);

  console.log("");
  ok(errs.length === 0, "0 个 JS 异常", errs.slice(0, 3).join(" | "));
  console.log(fails ? "失败 " + fails + " 项" : "全部通过");
  ws.close(); child.kill();
  setTimeout(() => process.exit(fails ? 1 : 0), 300);
})();
