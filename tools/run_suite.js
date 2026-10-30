/* 驱动 tools/suite.html 跑完功能测试套件。
 *
 * 与 run_fulltest.js 同一个套路：Chrome 常驻 + CDP 轮询 document.title
 * 直到页面自己置为 SUITE-DONE（真实时间，不冻结动画与 HanziWriter 回调），
 * 再从 window.__SUITE__ 取结构化结果写盘，供 run_all.js 汇总。
 *
 * 前置：先 python tools/serve.py（8765）
 * 用法：node tools/run_suite.js [超时秒数，默认 240]
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9341;
const URL = "http://127.0.0.1:8765/tools/suite.html";
const TIMEOUT = (parseInt(process.argv[2], 10) || 240) * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port: PORT, path: p }, (r) => {
    let b = ""; r.on("data", (d) => (b += d));
    r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on("error", rej);
});

(async () => {
  const child = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-proxy-server", "--proxy-bypass-list=*",
    "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + PORT,
    "--user-data-dir=" + path.join(os.tmpdir(), "zzsh-suite-" + Date.now()),
    "--window-size=1400,900", "about:blank",
  ], { stdio: "ignore" });

  let tab = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    try { const l = await getJSON("/json/list"); tab = (l || []).find((t) => t.type === "page"); if (tab) break; }
    catch (e) { /* 还没起来 */ }
    await sleep(300);
  }
  if (!tab || !tab.webSocketDebuggerUrl) { console.error("✗ 浏览器没起来"); child.kill(); process.exit(1); }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params) => new Promise((res) => {
    const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Page.navigate", { url: URL });

  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  let title = "", last = "";
  const start = Date.now();
  while (Date.now() - start < TIMEOUT) {
    title = await ev("document.title");
    const st = await ev("(document.getElementById('stat')||{}).textContent||''");
    if (st && st !== last) { last = st; process.stdout.write("  " + st + "\n"); }
    if (title === "SUITE-DONE") break;
    await sleep(800);
  }

  if (title !== "SUITE-DONE") {
    console.error("\n✗ 未完成（标题：'" + title + "'，最后状态：" + last + "）");
    ws.close(); child.kill();
    setTimeout(() => process.exit(2), 300);
    return;
  }

  const out = JSON.parse(await ev("JSON.stringify(window.__SUITE__||{})"));
  const cases = out.cases || [];
  let cur = "";
  cases.forEach((c) => {
    if (c.note) { cur = c.note; return; }
    const mark = c.ok === true ? "✓" : c.ok === "skip" ? "—" : "✗";
    console.log(mark + " " + c.id + " " + c.name + (c.ok === true || !c.extra ? "" : "  ← " + String(c.extra).slice(0, 160)));
  });
  console.log("\n" + out.stat);
  fs.writeFileSync(path.join(__dirname, "suite_result.json"), JSON.stringify(out, null, 2), "utf8");
  ws.close(); child.kill();
  setTimeout(() => process.exit(out.fail ? 1 : 0), 300);
})();
