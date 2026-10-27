/* ============================================================
 * 字字生花 · share.js
 * Canvas 成绩卡：字体就绪后绘制、devicePixelRatio 高清、
 * 长按保存为主路径（微信），a[download] 为回退
 * ============================================================ */
(function () {
  "use strict";
  var ZZSH = window.ZZSH;
  var D = ZZSH.DATA;
  var $ = function (s) { return document.querySelector(s); };

  var W = 600, H = 800;      // 逻辑尺寸

  function showScorecard() {
    $("#scorecard-mask").classList.remove("hidden");
    return draw().then(function (url) {
      var img = $("#scorecard-img");
      if (img) { img.src = url; img.classList.remove("hidden"); }
      return url;
    }).catch(function () {
      toastSafe("成绩卡生成失败");
    });
  }

  function toastSafe(msg) { if (ZZSH.ui && ZZSH.ui.toast) ZZSH.ui.toast(msg); }

  function draw() {
    var cv = $("#scorecard-canvas");
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = "100%";
    var ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);

    var st = ZZSH.state.data;
    var s = ZZSH.engine.stats();
    var triples = D.endings.minor.triples;

    // 最爱的字：最近发现第一个
    var fav = (st.got.length ? st.got[st.got.length - 1] : "花");

    return ensureFont().then(function (fontOK) {
      var F = fontOK ? '"LXGW WenKai", ' : "";

      /* 背景：宣纸 */
      ctx.fillStyle = "#F7F1E3";
      ctx.fillRect(0, 0, W, H);

      /* 细边框 */
      ctx.strokeStyle = "rgba(43,43,43,.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, W - 48, H - 48);
      ctx.strokeStyle = "rgba(43,43,43,.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(32, 32, W - 64, H - 64);

      /* 标题 */
      ctx.fillStyle = "#2B2B2B";
      ctx.font = F + "bold 54px " + (fontOK ? "" : "") + "serif";
      ctx.textAlign = "center";
      ctx.fillText("字字生花", W / 2, 130);
      ctx.fillStyle = "#C8102E";
      ctx.fillRect(W / 2 - 34, 152, 68, 5);

      /* 六三叠花（或最爱的字） */
      ctx.fillStyle = "#2B2B2B";
      ctx.font = F + "44px serif";
      var tripleStr = s.triplesGot >= 6
        ? triples.join("")
        : triples.map(function (c) { return ZZSH.engine.has(c) ? c : "□"; }).join("");
      ctx.fillText(tripleStr, W / 2, 236);
      ctx.fillStyle = "#6b6455";
      ctx.font = "16px sans-serif";
      ctx.fillText(s.triplesGot >= 6 ? "三叠六件套已集齐" : "三叠字 " + s.triplesGot + "/6", W / 2, 272);

      /* 大数字：收集 */
      ctx.fillStyle = "#2B2B2B";
      ctx.font = "bold 84px Georgia, serif";
      ctx.fillText(s.got, W / 2, 388);
      ctx.fillStyle = "#6b6455";
      ctx.font = "17px sans-serif";
      ctx.fillText("收集 " + s.got + " / " + s.total + " 字 · 生僻 " + s.rareGot + "/" + s.rareTotal +
        " · 成就 " + st.achievements.length + "/" + ZZSH.DATA.achievements.length, W / 2, 428);

      /* 分隔线 */
      ctx.strokeStyle = "rgba(43,43,43,.2)";
      ctx.beginPath();
      ctx.moveTo(80, 470); ctx.lineTo(W - 80, 470);
      ctx.stroke();

      /* 统计 */
      ctx.fillStyle = "#2B2B2B";
      ctx.font = "20px sans-serif";
      var days = Math.max(1, Math.ceil((Date.now() - st.stats.startAt) / 86400000));
      var line1 = "尝试 " + st.stats.tries + " 次 · 提示 " + st.stats.hints + " 次";
      var line2 = "最爱的一字：「" + fav + "」";
      var line3 = "玩了 " + days + " 天";
      ctx.fillText(line1, W / 2, 520);
      ctx.fillText(line2, W / 2, 560);
      ctx.fillText(line3, W / 2, 600);

      /* 印章 */
      ctx.fillStyle = "#C8102E";
      roundRect(ctx, W / 2 - 44, 636, 88, 88, 10);
      ctx.fill();
      ctx.fillStyle = "#F7F1E3";
      ctx.font = F + "34px serif";
      ctx.fillText("生花", W / 2, 670);
      ctx.font = F + "34px serif";
      ctx.fillText("之印", W / 2, 708);

      /* 底部 */
      ctx.fillStyle = "rgba(107,100,85,.8)";
      ctx.font = "13px sans-serif";
      ctx.fillText("字字生花 · 汉字部件合成小游戏 · 用 WorkBuddy 制作", W / 2, 762);

      return cv.toDataURL("image/png");
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function ensureFont() {
    // 若已加载 LXGW 子集则等待就绪；失败/不存在则用回退字体
    if (!document.fonts || !document.fonts.load) return Promise.resolve(false);
    return Promise.race([
      document.fonts.load('44px "LXGW WenKai"').then(function (fonts) {
        return fonts && fonts.length > 0;
      }).catch(function () { return false; }),
      new Promise(function (res) { setTimeout(function () { res(false); }, 1500); })
    ]);
  }

  function download() {
    var cv = $("#scorecard-canvas");
    try {
      var url = cv.toDataURL("image/png");
      var a = document.createElement("a");
      a.href = url;
      a.download = "字字生花成绩卡.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { toastSafe("下载失败，请长按图片保存"); }
  }

  function bind() {
    $("#btn-scorecard-dl").addEventListener("click", download);
    $("#btn-scorecard-close").addEventListener("click", function () {
      $("#scorecard-mask").classList.add("hidden");
    });
  }

  ZZSH.share = {
    showScorecard: showScorecard,
    draw: draw,
    bind: bind
  };
})();
