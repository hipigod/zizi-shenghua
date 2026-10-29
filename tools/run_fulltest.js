/* 无头驱动 tools/fulltest.html 并等它真的跑完。
 *
 * 背景：Chrome 133 起 --dump-dom 只在 load 事件后立刻抓快照，测试是 load 之后
 * 异步跑的，dump 到的永远只是「准备中」。--virtual-time-budget 又会冻结
 * transition / HanziWriter 的异步回调，测出来的结果不可信。
 * 所以改成 CDP 驱动：浏览器常驻，脚本轮询 document.title，
 * 直到页面自己把标题改成 FULLTEST-DONE（真实时间，不干预动画时序）。
 *
 * 前置：先 `python tools/serve.py`（8765 端口）。
 * 用法：node tools/run_fulltest.js [超时秒数，默认 300]
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const os = require("os");
const fs = require("fs");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const URL = "http://127.0.0.1:8765/tools/fulltest.html";
const TIMEOUT = (parseInt(process.argv[2], 10) || 300) * 1000;
const PROFILE = path.join(os.tmpdir(), "zzsh-ft-" + Date.now());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: PORT, path: p }, (res) => {
      let b = "";
      res.on("data", (d) => (b += d));
      res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

(async () => {
  const child = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-proxy-server", "--proxy-bypass-list=*", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + PORT,
    "--user-data-dir=" + PROFILE,
    "--window-size=1400,900",
    "about:blank",
  ], { stdio: "ignore" });

  const t0 = Date.now();
  let tab = null;
  while (Date.now() - t0 < 30000) {
    try {
      const list = await getJSON("/json/list");
      tab = (list || []).find((t) => t.type === "page");
      if (tab) break;
    } catch (e) { /* 还没起来 */ }
    await sleep(400);
  }
  if (!tab || !tab.webSocketDebuggerUrl) {
    console.error("✗ 浏览器没起来"); child.kill(); process.exit(1);
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

  const evalJS = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  let title = "", stat = "", last = "";
  const start = Date.now();
  while (Date.now() - start < TIMEOUT) {
    title = await evalJS("document.title");
    stat = await evalJS("(document.getElementById('stat')||{}).textContent||''");
    if (stat && stat !== last) { last = stat; process.stdout.write("  " + stat + "\n"); }
    if (title === "FULLTEST-DONE") break;
    await sleep(1000);
  }

  const out = path.join(__dirname, "fulltest_result.json");
  if (title === "FULLTEST-DONE" && fs.existsSync(out)) {
    const j = JSON.parse(fs.readFileSync(out, "utf8"));
    console.log("\n" + j.stat);
    fs.writeFileSync(path.join(__dirname, "fulltest_result.md"), j.md + "\n", "utf8");
    console.log("已写入 tools/fulltest_result.md / .json");
  } else {
    console.log("\n✗ 未完成（标题：'" + title + "'，最后状态：" + stat + "）");
    process.exitCode = 2;
  }
  ws.close();
  child.kill();
  setTimeout(() => process.exit(process.exitCode || 0), 500);
})();
