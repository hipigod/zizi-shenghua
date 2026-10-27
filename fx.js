/* ============================================================
 * 字字生花 · fx.js
 * 粒子效果、飘字、Web Audio 五声音阶音效（无音频文件）
 * ============================================================ */
(function () {
  "use strict";
  var ZZSH = window.ZZSH;

  var reduceMotion = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- 音效（Web Audio 合成） ---------------- */
  var actx = null;
  function ensureCtx() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }

  /* 五声音阶（宫商角徵羽）：C D E G A */
  var PENTA = [261.63, 293.66, 329.63, 392.00, 440.00];

  function tone(freq, dur, opts) {
    opts = opts || {};
    var ctx = ensureCtx();
    if (!ctx) return;
    if (!ZZSH.state.data.settings.sound) return;
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = opts.type || "sine";
      osc.frequency.value = freq;
      var vol = opts.vol || 0.18;
      var t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
      if (opts.slideTo) {
        osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
      }
    } catch (e) { /* 音频失败不影响游戏 */ }
  }

  /* 合成成功：毛笔落纸感——低频短音 + 泛音 */
  function sndMerge() {
    tone(180, 0.18, { type: "triangle", vol: 0.22 });
    setTimeout(function () { tone(PENTA[2], 0.3, { vol: 0.12 }); }, 60);
  }
  /* 新发现：上行琶音 */
  function sndNew() {
    [0, 1, 2].forEach(function (i) {
      setTimeout(function () { tone(PENTA[i] * 2, 0.22, { vol: 0.14 }); }, i * 90);
    });
  }
  /* 失败：木鱼声——短促空心低音 */
  function sndFail() {
    tone(140, 0.09, { type: "square", vol: 0.1, slideTo: 90 });
  }
  /* 解锁 / 成就：风铃 */
  function sndChime() {
    [2, 4].forEach(function (i, k) {
      setTimeout(function () { tone(PENTA[i] * 2, 0.5, { vol: 0.1 }); }, k * 120);
    });
  }
  /* 三叠字 / 通关：五声琶音上行 */
  function sndTriple() {
    [0, 1, 2, 3, 4].forEach(function (i) {
      setTimeout(function () { tone(PENTA[i] * 2, 0.3, { vol: 0.13 }); }, i * 110);
    });
  }
  function sndTap() { tone(PENTA[0], 0.06, { vol: 0.06 }); }

  /* ---------------- 粒子（墨点飞溅） ---------------- */
  var pCanvas = null, pCtx = null;
  function ensureCanvas() {
    if (!pCanvas) {
      pCanvas = document.createElement("canvas");
      pCanvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:80;";
      document.body.appendChild(pCanvas);
      pCtx = pCanvas.getContext("2d");
    }
    resizeCanvas();
    return pCtx;
  }
  function resizeCanvas() {
    if (!pCanvas) return;
    pCanvas.width = window.innerWidth * (window.devicePixelRatio || 1);
    pCanvas.height = window.innerHeight * (window.devicePixelRatio || 1);
    pCanvas.style.width = window.innerWidth + "px";
    pCanvas.style.height = window.innerHeight + "px";
  }
  window.addEventListener("resize", resizeCanvas);

  var particles = [];
  function burst(x, y, opts) {
    if (reduceMotion) return;
    opts = opts || {};
    var ctx = ensureCanvas();
    var n = opts.n || 14;
    var color = opts.color || "#2B2B2B";
    var gold = opts.gold;
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var v = (0.5 + Math.random() * 2.2) * (window.devicePixelRatio || 1);
      particles.push({
        x: x * (window.devicePixelRatio || 1),
        y: y * (window.devicePixelRatio || 1),
        vx: Math.cos(ang) * v * 3,
        vy: Math.sin(ang) * v * 3 - 1.5,
        r: (1.5 + Math.random() * 3) * (window.devicePixelRatio || 1),
        life: 1,
        decay: 0.02 + Math.random() * 0.02,
        color: gold && Math.random() < 0.6 ? "#C9A227" : color
      });
    }
    if (!rafRunning) tick();
  }

  var rafRunning = false;
  function tick() {
    rafRunning = true;
    var ctx = pCtx;
    ctx.clearRect(0, 0, pCanvas.width, pCanvas.height);
    particles = particles.filter(function (p) { return p.life > 0; });
    if (particles.length === 0) { rafRunning = false; return; }
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.12 * (window.devicePixelRatio || 1);
      p.life -= p.decay;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  }

  /* ---------------- 飘字 ---------------- */
  function floatWord(x, y, text, cls) {
    var el = document.createElement("div");
    el.className = "float-word" + (cls ? " " + cls : "");
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1150);
  }

  /* ---------------- 大通关：满屏花瓣（汉字飘落） ---------------- */
  function petalRain(chars) {
    if (reduceMotion) return;
    var n = 36;
    for (var i = 0; i < n; i++) {
      (function (i) {
        setTimeout(function () {
          var el = document.createElement("div");
          el.textContent = chars[Math.floor(Math.random() * chars.length)];
          el.style.cssText =
            "position:fixed;top:-60px;left:" + (Math.random() * 100) + "vw;" +
            "font-family:var(--font-kai);font-size:" + (18 + Math.random() * 26) + "px;" +
            "color:" + (Math.random() < 0.25 ? "#C8102E" : (Math.random() < 0.5 ? "#C9A227" : "#2B2B2B")) + ";" +
            "opacity:.85;pointer-events:none;z-index:110;" +
            "transition:top 4.5s linear, transform 4.5s ease-in, opacity 4.5s;";
          document.body.appendChild(el);
          requestAnimationFrame(function () {
            el.style.top = "110vh";
            el.style.transform = "rotate(" + (Math.random() * 360 - 180) + "deg)";
            el.style.opacity = "0";
          });
          setTimeout(function () { el.remove(); }, 4800);
        }, i * 90);
      })(i);
    }
  }

  /* 首次用户手势时调用：在手势回调里创建/唤醒同一个 AudioContext（iOS/微信要求） */
  function unlock() { ensureCtx(); }

  ZZSH.fx = {
    unlock: unlock,
    burst: burst,
    floatWord: floatWord,
    petalRain: petalRain,
    sndMerge: sndMerge,
    sndNew: sndNew,
    sndFail: sndFail,
    sndChime: sndChime,
    sndTriple: sndTriple,
    sndTap: sndTap
  };
})();
