/* 三项改动的验收脚本：
 *   1) 合成新字后，从 📖 再进图鉴（tab 停在字族树上）树必须同步
 *   2) 一之族、正之族已改成小徽章
 *   3) 笔顺：断网（屏蔽 CDN）也能播；数据源没有的字要明说
 *
 * 用法：node tools/check_fix_1030.js
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const os = require("os");
const fs = require("fs");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9431;
const BASE = "http://127.0.0.1:8765/index.html";
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
      "--headless=new", "--disable-gpu", "--no-proxy-server",
      "--proxy-bypass-list=*", "--no-first-run",
      "--remote-debugging-port=" + PORT,
      "--user-data-dir=" + path.join(os.tmpdir(), "zzsh-fix" + Date.now()),
      "--window-size=1440,1000", "about:blank",
    ],
    { stdio: "ignore" }
  );

  let tab = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    try {
      const l = await getJSON("/json/list");
      tab = (l || []).find((t) => t.type === "page");
      if (tab) break;
    } catch (e) {}
    await sleep(300);
  }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const P = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && P.has(m.id)) { P.get(m.id)(m); P.delete(m.id); }
  });
  const send = (method, params) =>
    new Promise((res) => { const i = ++id; P.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await new Promise((r) => ws.addEventListener("open", r));

  await send("Page.enable");
  await send("Network.enable");
  /* 模拟断网：把两个 CDN 全屏蔽，笔顺只能靠本地 hw/ 数据 */
  await send("Network.setBlockedURLs", {
    urls: ["*cdn.jsdelivr.net*", "*npmmirror.com*"],
  });
  await send("Page.navigate", { url: BASE });
  await sleep(3000);

  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (r.result.exceptionDetails) {
      console.log("EX", JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    }
    return r.result.result ? r.result.result.value : undefined;
  };

  const out = [];
  const bad = [];

  await ev('document.getElementById("btn-start").click()');
  await sleep(600);

  /* ---------- 1. 造一个「还没有肚」的存档，先渲染一次树 ---------- */
  await ev(`(function(){
    var Z = ZZSH, all = Object.keys(Z.DATA.chars);
    Z.state.data.got = all.filter(function(c){ return c !== '肚' && c !== '怔' && c !== '三'; });
    Z.state.data.unlockedParts = ['日','月','木','人','口','一','水','火','十','心','力','小','正','门','土','田','目','大'];
    Z.ui.renderAll();
    return 1;
  })()`);

  await ev('document.getElementById("btn-codex").click()');
  await sleep(300);
  await ev('document.getElementById("tab-tree").click()');
  await sleep(700);

  const before = await ev(`(function(){
    var gs = [].slice.call(document.querySelectorAll('#codex-tree .fam-node-g'));
    function state(ch){
      for (var i=0;i<gs.length;i++){
        var t = gs[i].querySelector('.glyph');
        if (t && t.textContent.trim() === ch) {
          return gs[i].classList.contains('locked') ? 'locked' : 'got';
        }
      }
      return 'absent';
    }
    return { du: state('肚'), zheng: state('怔'), san: state('三'), boxes: document.querySelectorAll('#codex-tree .fam-box').length };
  })()`);
  out.push("进场（未合成肚）：肚=" + before.du + " 怔=" + before.zheng + " 三=" + before.san +
    " 族框=" + before.boxes);
  if (before.du !== "absent") bad.push("肚 本应还没出现在树上");

  /* ---------- 2. 退出图鉴，合成「肚」，再从 📖 进来（关键回归点） ---------- */
  await ev('document.getElementById("btn-codex-back").click()');
  await sleep(200);
  await ev(`(function(){
    var Z = ZZSH;
    Z.state.data.got.push('肚');            // 等价于合成成功后 engine 的入库
    Z.state.save();
    Z.ui.renderAll();
    return 1;
  })()`);
  await ev('document.getElementById("btn-codex").click()');
  await sleep(800);   /* 不点 tab，直接看树是否已刷新 */

  const after = await ev(`(function(){
    var gs = [].slice.call(document.querySelectorAll('#codex-tree .fam-node-g'));
    var found = null;
    for (var i=0;i<gs.length;i++){
      var t = gs[i].querySelector('.glyph');
      if (t && t.textContent.trim() === '肚') found = gs[i];
    }
    var treeVisible = !document.getElementById('codex-tree').classList.contains('hidden');
    var head = document.querySelector('#codex-tree .fam-box .fam-count');
    return {
      du: found ? (found.classList.contains('locked') ? 'locked' : 'got') : 'absent',
      treeVisible: treeVisible,
      firstCount: head ? head.textContent.trim() : ''
    };
  })()`);
  out.push("合成后再进图鉴：肚=" + after.du + " 树面板可见=" + after.treeVisible +
    " 首个族计数=" + after.firstCount);
  if (after.du !== "got") bad.push("合成后字族树没同步（肚 仍为 " + after.du + "）——同步修复失败");

  /* ---------- 3. 小徽章 ---------- */
  const mini = await ev(`(function(){
    var chips = [].slice.call(document.querySelectorAll('#codex-tree .mini-fam'));
    var bigs = [].slice.call(document.querySelectorAll('#codex-tree .fam-box:not(.fam-mini) .fam-name'))
      .map(function(e){ return e.textContent.trim(); });
    return {
      chips: chips.map(function(c){ return c.textContent.replace(/\\s+/g,' ').trim(); }),
      bigNames: bigs
    };
  })()`);
  out.push("小徽章：" + JSON.stringify(mini.chips));
  out.push("整行族框：" + mini.bigNames.join("/"));
  if (mini.chips.length !== 2) bad.push("小徽章应为 2 个，实际 " + mini.chips.length);
  if (mini.bigNames.some((n) => n.indexOf("一之族") >= 0 || n.indexOf("正之族") >= 0)) {
    bad.push("一之族/正之族 仍占用整行族框");
  }

  /* ---------- 4. 笔顺：断网下播「肚」，再看「燚」是否明说没有 ---------- */
  await ev('document.getElementById("btn-codex-back").click()');
  await sleep(200);
  const stroke = await ev(`(function(){
    return new Promise(function(resolve){
      ZZSH.ui.showCard('肚');
      var btn = document.querySelector('#cardcol .cc-stroke-btn');
      if (!btn) { resolve({ok:false, why:'没有笔顺按钮'}); return; }
      btn.click();
      var n = 0;
      (function poll(){
        var box = document.querySelector('#cardcol .cc-stroke-box');
        if (box) {
          var svg = box.querySelector('svg');
          if (svg && svg.querySelectorAll('path').length > 0) {
            resolve({ok:true, paths: svg.querySelectorAll('path').length}); return;
          }
          if (/暂无笔顺数据|暂时取不到/.test(box.textContent)) {
            resolve({ok:false, why: box.textContent.trim().slice(0,40)}); return;
          }
        }
        if (++n > 100) { resolve({ok:false, why:'点击后无响应'}); return; }
        setTimeout(poll, 80);
      })();
    });
  })()`);
  out.push("断网播「肚」笔顺：" + JSON.stringify(stroke));
  if (!stroke || !stroke.ok) bad.push("断网下笔顺播不出来：" + JSON.stringify(stroke));

  const noneCard = await ev(`(function(){
    ZZSH.ui.showCard('燚');
    var card = document.querySelector('#cardcol .char-card');
    return {
      hasBtn: !!card.querySelector('.cc-stroke-btn'),
      note: card.querySelector('.cc-stroke-none') ? card.querySelector('.cc-stroke-none').textContent.trim() : ''
    };
  })()`);
  out.push("「燚」卡片笔顺区：" + JSON.stringify(noneCard));
  if (noneCard.hasBtn) bad.push("燚 没有数据却还给了「看笔顺」按钮");
  if (!noneCard.note) bad.push("燚 卡片没告知无笔顺");

  /* ---------- 截图 ---------- */
  await ev(`(function(){
    var Z = ZZSH, all = Object.keys(Z.DATA.chars);
    Z.state.data.got = all.filter(function(c,i){ return i%3 !== 0; });
    Z.ui.renderAll();
    document.getElementById('btn-codex').click();
    document.getElementById('tab-tree').click();
    var css = document.createElement('style');
    css.textContent = '.fam-scroll{overflow:visible!important;-webkit-mask-image:none!important;mask-image:none!important;}' +
      '.fam-box{max-width:none!important;}.fam-svg{margin:0!important;}';
    document.head.appendChild(css);
    return 1;
  })()`);
  await sleep(900);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("tools/shots/tree_mini.png", Buffer.from(shot.result.data, "base64"));

  const box = await ev(`(function(){
    var b = document.querySelector('#codex-tree .fam-mini');
    if (!b) return null;
    var r = b.getBoundingClientRect();
    return {x:r.left, y:r.top, w:r.width, h:r.height};
  })()`);
  if (box) {
    const s2 = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: Math.max(0, box.x - 6), y: Math.max(0, box.y - 6), width: box.w + 12, height: box.h + 12, scale: 2 },
    });
    fs.writeFileSync("tools/shots/tree_mini_zoom.png", Buffer.from(s2.result.data, "base64"));
  }

  console.log("\n===== 结果 =====");
  out.forEach((l) => console.log("· " + l));
  console.log(bad.length ? "\n✗ 未通过：\n - " + bad.join("\n - ") : "\n✓ 三项验收全部通过");

  ws.close();
  child.kill();
  setTimeout(() => process.exit(bad.length ? 1 : 0), 300);
})();
