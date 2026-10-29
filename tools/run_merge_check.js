/**
 * 驱动 tools/merge_check.html 跑完并打印结果。
 * 用法：node tools/run_merge_check.js
 * 为什么不用 --dump-dom：Chrome 133+ 在 load 之后就抓快照，异步断言根本跑不完。
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const os = require("os");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9391;
const URL = "http://localhost:8765/tools/merge_check.html";
const DONE = "MERGE-DONE";

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
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--remote-debugging-port=" + PORT,
      "--user-data-dir=" + path.join(os.tmpdir(), "zzsh-merge-" + Date.now()),
      "--window-size=900,900",
      "about:blank",
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
    } catch (e) { /* 浏览器还没起来 */ }
    await sleep(300);
  }
  if (!tab) { console.error("Chrome 没起来"); child.kill(); process.exit(1); }

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

  let title = "";
  for (let i = 0; i < 60; i++) {
    await sleep(600);
    const r = await send("Runtime.evaluate", { expression: "document.title", returnByValue: true });
    title = (r.result && r.result.result && r.result.result.value) || "";
    if (title.indexOf(DONE) === 0) break;
  }

  const log = await send("Runtime.evaluate", {
    expression: 'document.getElementById("log").innerText',
    returnByValue: true,
  });
  console.log("title:", title);
  console.log((log.result && log.result.result && log.result.result.value) || "(无日志)");

  ws.close();
  child.kill();
  setTimeout(() => process.exit(0), 300);
})();
