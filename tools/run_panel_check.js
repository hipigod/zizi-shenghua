/**
 * 多解面板全量验证（2026-10-29 改成摆法面板后）。
 *
 * 面板上不再显示结果字，只画「部件怎么摆」。这个脚本逐个配方、逐个摆法点一遍，
 * 确认点出来的仍然是正确的那个字，且画布上只留一块。
 *
 * 用法：node tools/run_panel_check.js
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const os = require("os");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9405;
const URL = "http://127.0.0.1:8765/index.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (p) =>
  new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port: PORT, path: p }, (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on("error", rej);
  });

(async () => {
  const child = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-proxy-server", "--proxy-bypass-list=*", "--no-first-run",
    "--remote-debugging-port=" + PORT,
    "--user-data-dir=" + path.join(os.tmpdir(), "zzsh-panel-" + Date.now()),
    "--window-size=1280,860", "about:blank",
  ], { stdio: "ignore" });

  let tab = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    try {
      const list = await getJSON("/json/list");
      tab = (list || []).find((t) => t.type === "page");
      if (tab) break;
    } catch (e) { /* 等浏览器 */ }
    await sleep(300);
  }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params) => new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Page.navigate", { url: URL });
  await sleep(2400);

  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) {
      console.log("EX", JSON.stringify(r.result.exceptionDetails).slice(0, 240));
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await ev('document.getElementById("btn-start").click()');
  await sleep(700);

  const multi = await ev(`(function(){
    var g=document.getElementById('guide-mask'); if(g) g.classList.add('hidden');
    var gs=document.getElementById('guide-skip'); if(gs) gs.style.display='none';
    return ZZSH.DATA.recipes.filter(function(r){return r.results.length>1;})
      .map(function(r){return {a:r.a,b:r.b,results:r.results};});
  })()`);

  console.log("多解配方", multi.length, "个");
  let ok = 0, bad = [];

  for (const rc of multi) {
    for (let i = 0; i < rc.results.length; i++) {
      const want = rc.results[i];
      const res = await ev(`(async function(){
        var A=${JSON.stringify(rc.a)}, B=${JSON.stringify(rc.b)}, IDX=${i};
        var Z=ZZSH, board=document.querySelector('.board');
        document.getElementById('choose-mask').classList.add('hidden');
        document.getElementById('card-drawer').classList.add('hidden');
        Z.state.data.got=[];                          // 每次都当新字，避免已收录淡化干扰
        Z.board.clearBoard();
        var br=board.getBoundingClientRect();
        function pe(t,x,y,bt){return new PointerEvent(t,{bubbles:true,cancelable:true,pointerId:97,pointerType:'mouse',isPrimary:true,button:0,buttons:bt,clientX:x,clientY:y});}
        var a=Z.board.createTile(A, br.width*0.3, br.height*0.32);
        var b=Z.board.createTile(B, br.width*0.58, br.height*0.32);
        await new Promise(function(x){setTimeout(x,60);});
        var ar=a.el.getBoundingClientRect(), brr=b.el.getBoundingClientRect();
        a.el.dispatchEvent(pe('pointerdown', ar.left+ar.width/2, ar.top+ar.height/2, 1));
        document.dispatchEvent(pe('pointermove', brr.left+brr.width/2, brr.top+brr.height/2, 1));
        document.dispatchEvent(pe('pointerup', brr.left+brr.width/2, brr.top+brr.height/2, 0));
        // 等面板
        var mask=document.getElementById('choose-mask'), tries=0;
        while((mask.classList.contains('hidden')) && tries++<30){ await new Promise(function(x){setTimeout(x,60);}); }
        if(mask.classList.contains('hidden')) return {err:'面板没弹出'};
        var items=[].slice.call(document.querySelectorAll('.choose-item'));
        if(items.length!==${rc.results.length}) return {err:'卡片数 '+items.length};
        // 卡片上不能出现结果字，否则等于报答案
        var leak=[];
        items.forEach(function(e){
          var t=e.textContent.replace(/[✓已收录\\s]/g,'');
          ${JSON.stringify(rc.results)}.forEach(function(c){ if(t.indexOf(c)>=0) leak.push(c); });
        });
        items[IDX].click();
        await new Promise(function(x){setTimeout(x,900);});
        var chars=[].slice.call(board.querySelectorAll('.tile')).map(function(e){return e.dataset.char;});
        return {chars:chars, leak:leak, got:Z.state.data.got.slice()};
      })()`);

      const pass = res && !res.err && res.chars.length === 1 && res.chars[0] === want && res.leak.length === 0;
      if (pass) { ok++; }
      else bad.push(rc.a + "+" + rc.b + " → " + want + "：" + JSON.stringify(res));
    }
  }

  console.log("通过 " + ok + " / " + multi.reduce((s, r) => s + r.results.length, 0));
  if (bad.length) { console.log("失败："); bad.forEach((b) => console.log("  - " + b)); }

  // 顺手检查面板文字里到底有哪些字（确认没有直接报答案）
  const sample = await ev(`(function(){
    return [].slice.call(document.querySelectorAll('.choose-item')).map(function(e){return e.textContent.trim();});
  })()`);
  if (sample && sample.length) console.log("最后一轮面板文字：", JSON.stringify(sample));

  ws.close();
  child.kill();
  setTimeout(() => process.exit(bad.length ? 1 : 0), 300);
})();
