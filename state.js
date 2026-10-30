/* ============================================================
 * 字字生花 · state.js
 * 存档读写、版本迁移、内存档降级、Base64 存档码
 * ============================================================ */
(function () {
  "use strict";
  var ZZSH = window.ZZSH;
  var KEY = ZZSH.DATA.meta.saveKey;

  var memStorage = null;   // localStorage 不可用时的内存档
  var storageOK = true;    // 是否可用持久化存储

  function probeStorage() {
    try {
      var k = "__zzsh_probe__";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      storageOK = true;
    } catch (e) {
      storageOK = false;
    }
  }

  function defaultSave() {
    return {
      version: ZZSH.DATA.meta.version,
      got: [],                    // 已收集的字（合成字，不含部件）
      unlockedParts: ZZSH.DATA.parts.slice(), // 起始 5 部件
      achievements: [],           // 已达成成就 id
      stats: {
        tries: 0, fails: 0, hints: 0,
        panels: 0,                // 选择面板使用次数
        quizTokens: 0,            // R3 据义造字：造字令
        startAt: Date.now(),
        minorEndAt: 0             // 小通关时间戳（0=未达成）
      },
      settings: { sound: true, strokeAnim: true },
      guide: { done: false, step: 0 },   // 引导状态
      flags: {}                  // 杂项一次性标记（如 lineCount 提示）
    };
  }

  function load() {
    var raw = null;
    try { raw = storageOK ? window.localStorage.getItem(KEY) : memStorage; }
    catch (e) { raw = null; }
    if (!raw) return defaultSave();
    try {
      var data = JSON.parse(raw);
      return migrate(data);
    } catch (e) {
      // 存档损坏：备份后重置
      try {
        if (storageOK) window.localStorage.setItem(KEY + ".bak", raw);
      } catch (e2) { /* ignore */ }
      return defaultSave();
    }
  }

  function migrate(data) {
    if (!data || typeof data !== "object") return defaultSave();
    var def = defaultSave();
    if (data.version > def.version) return def; // 未来版本：不冒险，重置
    // version 1 → 当前：结构兼容，逐字段兜底合并
    var out = def;
    out.version = def.version;
    /* 去重：重复字会虚增收集数，提前触发「集字 N」解锁与大通关 */
    function uniq(arr) {
      return arr.filter(function (x, i) { return arr.indexOf(x) === i; });
    }
    out.got = Array.isArray(data.got) ? uniq(data.got.filter(function (c) {
      return ZZSH.DATA.chars.hasOwnProperty(c);
    })) : [];
    out.unlockedParts = Array.isArray(data.unlockedParts) ? uniq(data.unlockedParts.filter(function (p) {
      return ZZSH.DATA.partInfo.hasOwnProperty(p);
    })) : def.unlockedParts.slice();
    // 起始部件必须存在
    ZZSH.DATA.parts.forEach(function (p) {
      if (out.unlockedParts.indexOf(p) < 0) out.unlockedParts.push(p);
    });
    out.achievements = Array.isArray(data.achievements) ? uniq(data.achievements.filter(function (id) {
      return typeof id === "string";
    })) : [];
    if (data.stats && typeof data.stats === "object") {
      ["tries", "fails", "hints", "panels", "quizTokens", "startAt", "minorEndAt"].forEach(function (f) {
        if (typeof data.stats[f] === "number") out.stats[f] = data.stats[f];
      });
    }
    if (data.settings && typeof data.settings === "object") {
      if (typeof data.settings.sound === "boolean") out.settings.sound = data.settings.sound;
      if (typeof data.settings.strokeAnim === "boolean") out.settings.strokeAnim = data.settings.strokeAnim;
    }
    if (data.guide && typeof data.guide === "object") {
      if (typeof data.guide.done === "boolean") out.guide.done = data.guide.done;
      if (typeof data.guide.step === "number") out.guide.step = data.guide.step;
    }
    if (data.flags && typeof data.flags === "object" && !Array.isArray(data.flags)) out.flags = data.flags;
    return out;
  }

  function save(state) {
    var raw = JSON.stringify(state);
    if (storageOK) {
      try { window.localStorage.setItem(KEY, raw); return; }
      catch (e) { storageOK = false; /* 配额满等：降级内存 */ }
    }
    memStorage = raw;
  }

  function reset() {
    var s = defaultSave();
    save(s);
    return s;
  }

  function exportCode(state) {
    // Base64 存档码：UTF-8 → base64
    try {
      return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
    } catch (e) { return ""; }
  }

  function importCode(code) {
    // 返回迁移后的 state，失败返回 null
    try {
      /* 去掉微信/笔记复制时夹带的换行与空格 */
      var json = decodeURIComponent(escape(atob(String(code).replace(/\s+/g, ""))));
      var data = JSON.parse(json);
      if (!data || !Array.isArray(data.got)) return null;
      return migrate(data);
    } catch (e) { return null; }
  }

  probeStorage();

  ZZSH.state = {
    data: load(),
    persistent: function () { return storageOK; },
    save: function () { save(ZZSH.state.data); },
    reset: reset,
    exportCode: function () { return exportCode(ZZSH.state.data); },
    importCode: importCode,
    /* 把云端取回的对象（已 JSON.parse）迁移并写入本地，成功返回 true */
    applyCloud: function (obj) {
      var m = migrate(obj);
      if (!m) return false;
      ZZSH.state.data = m;
      if (ZZSH.engine && typeof ZZSH.engine.selfHeal === "function") ZZSH.engine.selfHeal();
      save(ZZSH.state.data);
      return true;
    },
    has: function (c) { return ZZSH.state.data.got.indexOf(c) >= 0; },
    add: function (c) {
      if (!ZZSH.state.data.got.includes(c)) {
        ZZSH.state.data.got.push(c);
        return true;
      }
      return false;
    },
    partUnlocked: function (p) { return ZZSH.state.data.unlockedParts.indexOf(p) >= 0; },
    achvDone: function (id) { return ZZSH.state.data.achievements.indexOf(id) >= 0; }
  };
})();
