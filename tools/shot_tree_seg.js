/**
 * 字族树全貌截图：把 11 个族框全部铺开（不横向滚动、卡片不限宽），
 * 先出一张完整长图，再按族框分段出图，便于看清每个节点。
 *
 * 用法：node tools/shot_tree_seg.js [收集比例]   默认 3（每 3 个收 2 个）
 * 产物：tools/shots/tree_full.png、tree_seg1~3.png
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const os = require("os");
const fs = require("fs");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9430;
const URL = "http://127.0.0.1:8765/index.html";
const OUT = path.join(__dirname, "shots");
const STEP = parseInt(process.argv[2] || "3", 10);

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
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const child = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-proxy-server", "--proxy-bypass-list=*",
    "--no-first-run", "--remote-debugging-port=" + PORT,
    "--user-data-dir=" + path.join(os.tmpdir(), "zzsh-seg-" + Date.now()),
    "--window-size=2100,1400", "about:blank",
  ], { stdio: "ignore" });

  let tab = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    try {
      const l = await getJSON("/json/list");
      tab = (l || []).find((t) => t.type === "page");
      if (tab) break;
    } catch (e) { /* 还没起来 */ }
    await sleep(300);
  }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const P = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && P.has(m.id)) { P.get(m.id)(m); P.delete(m.id); }
  });
  const send = (m, p) => new Promise((res) => {
    const i = ++id; P.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} }));
  });
  await new Promise((r) => ws.addEventListener("open", r));

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 2100, height: 1400, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(2600);

  const ev = async (e) => {
    const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) console.log("EX", JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result.result ? r.result.result.value : undefined;
  };

  await ev('document.getElementById("btn-start").click()');
  await sleep(600);
  await ev(`(function(){
    var Z=ZZSH, all=Object.keys(Z.DATA.chars);
    Z.state.data.got=all.filter(function(c,i){return i%${STEP}!==0;});
    Z.state.data.unlockedParts=['日','月','木','人','口','一','水','火','十','心','力','小','正','门','土','田','目','大'];
    Z.ui.renderAll();
    document.getElementById('btn-codex').click();
    document.getElementById('tab-tree').click();
    /* 树一律铺开：不横向滚动、卡片不限宽，让最宽的木族也能整棵露出 */
    var css=document.createElement('style');
    css.textContent='.fam-scroll{overflow:visible!important;-webkit-mask-image:none!important;mask-image:none!important;}'+
      '.fam-box{max-width:none!important;}.fam-svg{margin:0!important;}';
    document.head.appendChild(css);
    [].slice.call(document.querySelectorAll('.fam-scroll')).forEach(function(e){e.scrollLeft=0;});
    return 1;
  })()`);
  await sleep(900);

  const size = await ev(`(function(){
    var sc=document.getElementById('screen-codex');
    var t=document.getElementById('codex-tree');
    sc.style.setProperty('position','static','important');
    sc.style.setProperty('height','auto','important');
    sc.style.setProperty('inset','auto','important');
    t.style.setProperty('flex','none','important');
    t.style.setProperty('height','auto','important');
    t.style.setProperty('overflow','visible','important');
    var widest=0;
    [].slice.call(document.querySelectorAll('.fam-svg')).forEach(function(e){widest=Math.max(widest,e.getBoundingClientRect().width);});
    return {h:t.scrollHeight, w:Math.ceil(widest)};
  })()`);

  const W = Math.max(1500, size.w + 140);
  const FULLH = Math.min(size.h + 60, 15000);
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: FULLH, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);

  // 视口定成全高后重新量坐标，避免重排导致 clip 偏移
  const boxes = await ev(`[].slice.call(document.querySelectorAll('.fam-box')).map(function(e){var b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom};})`);
  console.log("族框 " + boxes.length + " 个，树高 " + size.h + "，最宽一族 " + size.w + "，视口 " + W + "x" + FULLH);

  // 全貌长图
  const full = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: FULLH, scale: 1 } });
  fs.writeFileSync(path.join(OUT, "tree_full.png"), Buffer.from(full.result.data, "base64"));
  console.log("tree_full.png " + Math.round(fs.statSync(path.join(OUT, "tree_full.png")).size / 1024) + " KB");

  // 按族分段：0-3 / 4-7 / 8-10
  const segs = [[0, 3], [4, 7], [8, 10]];
  for (let i = 0; i < segs.length; i++) {
    const a = boxes[segs[i][0]], b = boxes[segs[i][1]];
    if (!a || !b) continue;
    const y0 = Math.max(0, a.top - 20);
    const y1 = Math.min(FULLH, b.bottom + 16);
    const shot = await send("Page.captureScreenshot", {
      format: "png", clip: { x: 0, y: y0, width: W, height: Math.ceil(y1 - y0), scale: 1 },
    });
    const f = path.join(OUT, "tree_seg" + (i + 1) + ".png");
    fs.writeFileSync(f, Buffer.from(shot.result.data, "base64"));
    console.log("tree_seg" + (i + 1) + ".png  y " + Math.round(y0) + "~" + Math.round(y1) +
      "  " + Math.round(fs.statSync(f).size / 1024) + " KB");
  }

  ws.close();
  child.kill();
  setTimeout(() => process.exit(0), 300);
})();
