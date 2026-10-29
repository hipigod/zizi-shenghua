/* 用 CDP 截一张图（等页面自己把标题改成 SHOT-* 再下手）。
 *
 * --screenshot 在 new headless 下是 load 后立刻截，iframe 里的场景还没搭好，
 * 截出来常年是空白或半成品；这里改成等页面 ready 再 captureScreenshot。
 *
 * 用法：node tools/shot.js <url> <out.png> [宽] [高]
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const os = require("os");
const fs = require("fs");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9334;
const url = process.argv[2];
const out = process.argv[3];
const W = parseInt(process.argv[4], 10) || 1280;
const H = parseInt(process.argv[5], 10) || 820;
const PROFILE = path.join(os.tmpdir(), "zzsh-shot-" + Date.now());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (p) => new Promise((resolve, reject) => {
  http.get({ host: "127.0.0.1", port: PORT, path: p }, (res) => {
    let b = "";
    res.on("data", (d) => (b += d));
    res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
  }).on("error", reject);
});

(async () => {
  const child = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-proxy-server", "--proxy-bypass-list=*", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
    "--window-size=" + W + "," + H, "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });

  let tab = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    try {
      const list = await getJSON("/json/list");
      tab = (list || []).find((t) => t.type === "page");
      if (tab) break;
    } catch (e) { }
    await sleep(300);
  }
  if (!tab) { console.error("✗ 浏览器没起来"); child.kill(); process.exit(1); }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params) => new Promise((res) => {
    const i = ++id; pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: W, height: H, deviceScaleFactor: 2, mobile: W < 700,
  });
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 1500));

  const evalJS = async (e) => {
    const r = await send("Runtime.evaluate", { expression: e, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const start = Date.now();
  let title = "";
  while (Date.now() - start < 30000) {
    title = await evalJS("document.title");
    if (String(title).indexOf("SHOT-") === 0) break;
    await sleep(300);
  }
  await sleep(400);   // 让最后一帧样式稳定
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (!shot.result || !shot.result.data) { console.error("✗ 截图失败", title); child.kill(); process.exit(1); }
  fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log("✓ " + out + "  (" + Math.round(fs.statSync(out).size / 1024) + " KB, title=" + title + ")");
  ws.close(); child.kill();
  setTimeout(() => process.exit(0), 300);
})();
