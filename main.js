/* ============================================================
 * 字字生花 · main.js
 * 启动初始化：字体预加载、iOS vh 修正、模块 init
 * ============================================================ */
(function () {
  "use strict";
  var ZZSH = window.ZZSH;

  /* iOS Safari 地址栏抖动修正：--vh 变量
   * 注意：这个变量必须真正被 CSS 消费（见 style.css .screen 的 height），
   * 否则只是个死变量，iPhone 上底部库存条仍会被地址栏遮住。 */
  function fixVH() {
    document.documentElement.style.setProperty("--vh", window.innerHeight * 0.01 + "px");
  }

  /* 首次交互解锁音频（移动端自动播放策略） */
  /* 修复：原实现新建一个探针上下文后立即关闭，对真正发声的上下文没有任何作用；
   * 现在直接在手势回调里唤醒 fx 使用的那一个 AudioContext。 */
  function unlockAudio() {
    document.removeEventListener("pointerdown", unlockAudio);
    try {
      if (ZZSH.state.data.settings.sound && ZZSH.fx.unlock) ZZSH.fx.unlock();
    } catch (e) { /* ignore */ }
  }

  document.addEventListener("DOMContentLoaded", function () {
    fixVH();
    window.addEventListener("resize", fixVH);
    window.addEventListener("orientationchange", function () {
      setTimeout(fixVH, 300);
    });
    /* iOS 地址栏收缩不一定触发 resize，visualViewport 的信号更可靠 */
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", fixVH);
    }

    ZZSH.board.init();
    ZZSH.ui.init();
    ZZSH.share.bind();
    document.addEventListener("pointerdown", unlockAudio);

    /* 断网/CDN 失败时无需处理：Hanzi Writer 按需加载自带回退 */

    /* 防微信长按弹菜单（全局兜底） */
    document.addEventListener("contextmenu", function (e) {
      if (e.target.closest(".tile, .board, .codex-cell")) e.preventDefault();
    });

    console.log("%c字字生花 %cv" + ZZSH.DATA.meta.release +
      " · 数据自检见 tools/validate_data.js",
      "font-family:serif;font-size:16px;color:#C8102E", "color:#6b6455");
  });
})();
