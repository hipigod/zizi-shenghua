/**
 * 专项验证新收的字：从部件条拖两个字合成，检查画布只剩结果、字源卡齐全、笔顺可用。
 * 用法：node tools/run_newchar_check.js 水 心 沁
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const os = require("os");

const [A = "水", B = "心", WANT = "沁"] = process.argv.slice(2);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9393;
const URL = "http://127.0.0.1:8765/index.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (p) =>
  new Promise((res, rej) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path: p }, (r) => {
        let b = "";
        r.on("data", (d) => (b += d));
        r.on("end", () => {
          try { res(JSON.parse(b)); } catch (e) { rej(e); }
        });
      })
      .on("error", rej);
  });

(async () => {
  const child = spawn(
    CHROME,
    [
      "--headless=new", "--disable-gpu", "--no-proxy-server", "--proxy-bypass-list=*", "--no-first-run",
      "--remote-debugging-port=" + PORT,
      "--user-data-dir=" + path.join(os.tmpdir(), "zzsh-nc-" + Date.now()),
      "--window-size=1280,860", "about:blank",
    ],
    { stdio: "ignore" }
  );

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
  const send = (method, params) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Page.navigate", { url: URL });
  await sleep(2400);

  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (r.result && r.result.exceptionDetails) {
      console.log("EX", JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await ev('document.getElementById("btn-start").click()');
  await sleep(700);

  const script = `(async function(){
    var A=${JSON.stringify(A)}, B=${JSON.stringify(B)}, WANT=${JSON.stringify(WANT)};
    var Z=ZZSH, board=document.querySelector(".board"), out=[];
    var g=document.getElementById("guide-mask"); if(g) g.classList.add("hidden");
    var gs=document.getElementById("guide-skip"); if(gs) gs.style.display="none";
    // 两个部件先解锁，再重绘部件条
    [A,B].forEach(function(c){ if(Z.state.data.unlockedParts.indexOf(c)<0) Z.state.data.unlockedParts.push(c); });
    Z.ui.renderAll();
    Z.board.clearBoard();
    var br=board.getBoundingClientRect();
    function pe(t,x,y,bt){ return new PointerEvent(t,{bubbles:true,cancelable:true,pointerId:41,pointerType:"mouse",isPrimary:true,button:0,buttons:bt,clientX:x,clientY:y}); }
    async function drag(c,cx,cy){
      var t=document.querySelector('.partbar .tile[data-char="'+c+'"]');
      if(!t) return c+" 不在部件条";
      var r=t.getBoundingClientRect();
      t.dispatchEvent(pe("pointerdown", r.left+r.width/2, r.top+r.height/2, 1));
      document.dispatchEvent(pe("pointermove",(r.left+cx)/2,(r.top+cy)/2,1));
      document.dispatchEvent(pe("pointermove",cx,cy,1));
      document.dispatchEvent(pe("pointerup",cx,cy,0));
      await new Promise(function(r2){setTimeout(r2,120);});
      return "ok";
    }
    var p1={x:br.left+br.width*0.35, y:br.top+br.height*0.3};
    out.push("拖 "+A+"：" + await drag(A,p1.x,p1.y));
    var t1=board.querySelector('.tile[data-char="'+A+'"]');
    if(!t1) { out.push("画布上没有 "+A); return out; }
    var r1=t1.getBoundingClientRect();
    out.push("拖 "+B+"：" + await drag(B, r1.left+r1.width/2, r1.top+r1.height/2));
    await new Promise(function(r2){setTimeout(r2,800);});
    var cs=[].slice.call(board.querySelectorAll(".tile")).map(function(e){return e.dataset.char;});
    out.push("合成后画布 "+cs.length+" 块：" + (cs.join("")||"空"));
    out.push("结果是否为"+WANT+"：" + (cs.length===1 && cs[0]===WANT));
    /* 字源卡：走真实路径——合成新字后游戏会自动弹卡，这里不额外调 showCard，
       否则两次渲染互相清空容器，笔顺 svg 会被抹掉（上一版脚本就栽在这）。 */
    await new Promise(function(r2){setTimeout(r2,900);});
    var card=document.querySelector("#cardcol .char-card") || document.querySelector("#card-drawer-inner .char-card");
    if(card){
      out.push("字源卡：字="+card.querySelector(".cc-char").textContent.trim()
        +" 拼音="+(card.querySelector(".cc-meta .pinyin")?card.querySelector(".cc-meta .pinyin").textContent.trim():"-")
        +" 本义="+(!!card.querySelector(".cc-origin"))
        +" 想象="+(!!card.querySelector(".cc-fun"))
        +" 组词="+(!!card.querySelector(".cc-words"))
        +" 笔顺按钮="+(!!card.querySelector(".cc-stroke-btn")));
    } else out.push("字源卡没渲染");
    // 笔顺
    var btn=card && card.querySelector(".cc-stroke-btn");
    if(btn){
      btn.click();
      var ok=false;
      for(var k=0;k<120;k++){
        await new Promise(function(r2){setTimeout(r2,80);});
        var box=document.querySelector("#cardcol .cc-stroke-box")||document.querySelector("#card-drawer-inner .cc-stroke-box");
        if(box && box.querySelector("svg path")) { ok=true; break; }
        if(box && /暂时取不到/.test(box.textContent)) break;
      }
      out.push("笔顺动画：" + (ok?"画出":"未能画出"));
    }
    // 图鉴 + 字族树
    Z.ui.renderAll();
    document.getElementById("btn-codex").click();
    await new Promise(function(r2){setTimeout(r2,200);});
    var cells=[].slice.call(document.querySelectorAll(".codex-cell")).map(function(e){return e.textContent.trim();});
    out.push("图鉴收录：" + (cells.indexOf(WANT)>=0));
    document.getElementById("tab-tree").click();
    await new Promise(function(r2){setTimeout(r2,200);});
    var nodes=[].slice.call(document.querySelectorAll(".fam-node-g .glyph")).map(function(e){return e.textContent.trim();});
    out.push("字族树可见：" + (nodes.indexOf(WANT)>=0));
    out.push("顶栏总数：" + (document.getElementById("codex-badge-total")||{}).textContent);
    return out;
  })()`;

  const res = await ev(script);
  console.log((res || []).join("\n"));
  ws.close();
  child.kill();
  setTimeout(() => process.exit(0), 300);
})();
