/* ============================================================
 * 字字生花 · tools/run_all.js —— 一键总跑
 *
 * 顺序：Node 四件套（A/B/C/D）→ 浏览器逐字全量（H6）→ 浏览器功能套件（E~L）
 * 产出：tools/test_report.md（可判定、可贴群），退出码非 0 表示有失败。
 *
 * 用法：node tools/run_all.js            （自动拉起 serve.py，跑完自动关闭）
 *      node tools/run_all.js --keep     （跑完保留本地服务）
 *      node tools/run_all.js --skip-browser
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.dirname(__dirname);
const args = process.argv.slice(2);
const KEEP = args.indexOf("--keep") >= 0;
const SKIP_BROWSER = args.indexOf("--skip-browser") >= 0;
const PORT = 8765;

const NODE_SUITES = [
  { id: "A", name: "数据与配方", file: "validate_data.js" },
  { id: "B", name: "存档与迁移", file: "test_migrate.js" },
  { id: "C", name: "合成引擎", file: "check_engine.js" },
  { id: "D", name: "提示系统", file: "check_hint_lines.js" }
];

function pingServer() {
  return new Promise((res) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: "/index.html" }, (r) => {
      r.resume(); res(r.statusCode === 200);
    });
    req.on("error", () => res(false));
    req.setTimeout(1500, () => { req.destroy(); res(false); });
  });
}

function runNode(file) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools", file)], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024
  });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

function runChild(file, extraArgs) {
  return new Promise((res) => {
    const c = spawn(process.execPath, [path.join(ROOT, "tools", file)].concat(extraArgs || []), {
      cwd: ROOT, stdio: ["ignore", "pipe", "pipe"]
    });
    let out = "";
    c.stdout.on("data", (d) => { out += d; process.stdout.write("."); });
    c.stderr.on("data", (d) => { out += d; });
    c.on("close", (code) => res({ code, out }));
  });
}

(async () => {
  const report = [];
  const rows = [];
  let hardFail = 0;

  console.log("=== Node 套件 ===");
  NODE_SUITES.forEach((s) => {
    process.stdout.write("▸ " + s.id + " " + s.name + " … ");
    const r = runNode(s.file);
    const lines = r.out.split(/\r?\n/).filter(Boolean);
    const bad = lines.filter((l) => /^\s*✗/.test(l)).length;
    const okAll = /全部通过|0 错误/.test(r.out) && bad === 0;
    console.log(okAll ? "通过" : "有失败（详见报告）");
    rows.push({ layer: s.id + " · " + s.name, cmd: "node tools/" + s.file, pass: okAll, bad: bad });
    if (!okAll) hardFail++;
    report.push("## " + s.id + " · " + s.name + "\n\n```\n" + r.out.trim() + "\n```\n");
  });

  if (!SKIP_BROWSER) {
    let serving = await pingServer();
    let server = null;
    if (!serving) {
      server = spawn(/^win/.test(process.platform) ? "python" : "python3",
        [path.join(ROOT, "tools", "serve.py")], { cwd: ROOT, stdio: "ignore", detached: false });
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 300));
        if (await pingServer()) { serving = true; break; }
      }
    }
    if (!serving) {
      console.error("✗ 起不来本地服务，浏览器套件跳过");
      rows.push({ layer: "浏览器套件", cmd: "-", pass: false, bad: 1 });
      hardFail++;
    } else {
      console.log("\n=== 浏览器 · 166 字逐字全量（H6）===");
      const ft = await runChild("run_fulltest.js", ["420"]);
      const ftJson = path.join(ROOT, "tools", "fulltest_result.json");
      let ftok = false, ftInfo = ft.out.trim().split(/\r?\n/).pop() || "";
      if (fs.existsSync(ftJson)) {
        const j = JSON.parse(fs.readFileSync(ftJson, "utf8"));
        ftok = j.fail === 0;
        ftInfo = j.total + " 字 × 8 列，失败 " + j.fail + (j.fail ? "：" + (j.failChars || []).join("、") : "（全通过）");
      }
      console.log("\n  " + ftInfo);
      rows.push({ layer: "H6 · 166 字逐字全量", cmd: "node tools/run_fulltest.js", pass: ftok, bad: ftok ? 0 : 1 });
      if (!ftok) hardFail++;
      report.push("## H6 · 166 字逐字全量\n\n" + ftInfo + "\n\n明细见 tools/fulltest_result.md\n");

      console.log("\n=== 浏览器 · 功能套件（E/F/G/H/I/J/K/L）===");
      const st = await runChild("run_suite.js", ["300"]);
      const stJson = path.join(ROOT, "tools", "suite_result.json");
      let stok = false, stInfo = "";
      if (fs.existsSync(stJson)) {
        const j = JSON.parse(fs.readFileSync(stJson, "utf8"));
        stok = j.fail === 0;
        stInfo = j.stat;
        const bads = (j.cases || []).filter((c) => !c.note && c.ok !== true && c.ok !== "skip");
        const skips = (j.cases || []).filter((c) => !c.note && c.ok === "skip");
        if (bads.length) {
          stInfo += "\n\n失败明细：\n" + bads.map((c) => "- ✗ " + c.id + " " + c.name +
            (c.extra ? " ← " + String(c.extra).slice(0, 200) : "")).join("\n");
        }
        if (skips.length) {
          stInfo += "\n\n跳过（环境限制）：\n" + skips.map((c) => "- — " + c.id + " " + c.name +
            (c.extra ? " ← " + String(c.extra).slice(0, 120) : "")).join("\n");
        }
      } else {
        stInfo = st.out.trim().split(/\r?\n/).slice(-3).join("\n");
      }
      console.log("\n  " + stInfo.split("\n")[0]);
      rows.push({ layer: "E~L · 功能套件", cmd: "node tools/run_suite.js", pass: stok, bad: stok ? 0 : 1 });
      if (!stok) hardFail++;
      report.push("## E~L · 功能套件\n\n" + stInfo + "\n\n明细见 tools/suite_result.json\n");

      if (server && !KEEP) { try { server.kill(); } catch (e) { /* ignore */ } }
    }
  }

  /* ---------- 汇总报告 ---------- */
  const src = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
  const rel = (/release:\s*"([^"]+)"/.exec(src) || [, "?"])[1];
  const nAll = rows.length, nPass = rows.filter((r) => r.pass).length;
  const head = [
    "# 字字生花 · 测试报告", "",
    "> 版本 v" + rel + " · 生成时间 " + new Date().toLocaleString("zh-CN", { hour12: false }),
    "> 用例定义见 [测试用例_v1.3.md](../测试用例_v1.3.md)",
    "",
    "## 总览", "",
    "| 层 | 命令 | 结果 |", "|---|---|---|"
  ].concat(rows.map((r) => "| " + r.layer + " | `" + r.cmd + "` | " + (r.pass ? "✅ 通过" : "❌ 失败") + " |"))
   .concat(["", "**" + nPass + "/" + nAll + " 层通过" + (hardFail ? "，有失败，不许上线" : "，全部通过 ✅") + "**", ""]);

  fs.writeFileSync(path.join(ROOT, "tools", "test_report.md"),
    head.join("\n") + "\n" + report.join("\n"), "utf8");

  console.log("\n=== 汇总 ===");
  rows.forEach((r) => console.log((r.pass ? "✓ " : "✗ ") + r.layer));
  console.log("\n" + nPass + "/" + nAll + " 层通过 → tools/test_report.md");
  process.exit(hardFail ? 1 : 0);
})();
