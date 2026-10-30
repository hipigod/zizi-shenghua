/* ============================================================
 * 字字生花 · cloud.js
 * 云服务接入层：手机号验证码登录 + 进度云端存档
 *
 * 设计原则：
 *  - localStorage 仍是游戏本体的离线存档（不强制登录，适配课堂使用）；
 *  - 云端存档是「可选」的同步层：登录后自动把本地进度上传到 saves 表，
 *    也可手动「从云端恢复」跨设备取回；
 *  - 用户域数据严格走真实登录，不伪造匿名/mock 会话（遵循 cloud-service 规范）。
 * ============================================================ */
(function () {
  "use strict";
  var ZZSH = window.ZZSH;

  /* publicConfig 来自 workbuddy_cloud_service（已与 wbapp_N5h8x066L6NqApIOpTI5vu 绑定）。
     publishableKey 是公开凭证，可安全出现在前端。 */
  var CFG = {
    endpoint: "https://zizi-shenghua.app.workbuddy.host",
    oauthRelayBaseUrl: "https://www.workbuddy.cn/v2/as/genie-baas/oauth",
    publishableKey: "wbpk_N5h8x066L6NqApIOpTI5vu_SCvI19NF7IlkfG2YDzna7R6O5x3ymRI0"
  };

  var cloud = null;          // SDK 实例
  var listeners = [];        // 登录态变更回调
  var currentUser = null;
  var status = "init";       // init | offline | signed_out | signed_in
  var lastSyncAt = 0;        // 最近一次成功上传的时间戳
  var pendingPhone = null;   // 发送验证码后暂存的挑战
  var uploadTimer = null;

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](status, currentUser); } catch (e) { /* ignore */ }
    }
  }

  /* 本地优先加载 SDK，CDN 兜底 */
  function loadSDK() {
    return new Promise(function (resolve) {
      if (typeof window.WorkBuddyCloud !== "undefined") { resolve(true); return; }
      var local = document.createElement("script");
      local.src = "cloud/workbuddy-cloud-sdk.js";
      local.onload = function () { resolve(true); };
      local.onerror = function () {
        var cdn = document.createElement("script");
        cdn.src = "https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js";
        cdn.onload = function () { resolve(true); };
        cdn.onerror = function () { resolve(false); };
        document.head.appendChild(cdn);
      };
      document.head.appendChild(local);
    });
  }

  function ensureCloud() {
    if (cloud) return cloud;
    if (typeof window.WorkBuddyCloud === "undefined") return null;
    cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: CFG.endpoint,
      oauthRelayBaseUrl: CFG.oauthRelayBaseUrl,
      publishableKey: CFG.publishableKey
    });
    if (cloud.auth && typeof cloud.auth.onAuthStateChange === "function") {
      cloud.auth.onAuthStateChange(function (event, session) {
        currentUser = session && session.user ? session.user : null;
        status = currentUser ? "signed_in" : "signed_out";
        emit();
        if (currentUser) onSignIn();
      });
    }
    return cloud;
  }

  async function init() {
    var ok = await loadSDK();
    if (!ok) { status = "offline"; emit(); return; }
    ensureCloud();
    if (!cloud) { status = "offline"; emit(); return; }
    try {
      var r = await cloud.auth.getSession();
      if (r.data && r.data.user) {
        currentUser = r.data.user;
        status = "signed_in";
      } else {
        status = "signed_out";
      }
    } catch (e) {
      status = "signed_out";
    }
    emit();
  }

  /* ---------- 认证：手机号验证码 ---------- */
  async function sendPhoneCode(phone) {
    if (!cloud) return { error: { message: "云服务未就绪，请检查网络" } };
    if (!/^1\d{10}$/.test(phone || "")) {
      return { error: { message: "请输入正确的 11 位手机号" } };
    }
    var r = await cloud.auth.sendOtp({ phone: phone });
    if (!r.error && r.data) {
      pendingPhone = {
        phone: phone,
        verificationId: r.data.verificationId,
        isExistingUser: r.data.isExistingUser
      };
    }
    return r;
  }

  async function verifyPhoneCode(token) {
    if (!cloud) return { error: { message: "云服务未就绪" } };
    if (!pendingPhone) return { error: { message: "请先获取验证码" } };
    var r = await cloud.auth.verifyOtp({
      phone: pendingPhone.phone,
      verificationId: pendingPhone.verificationId,
      isExistingUser: pendingPhone.isExistingUser,
      token: token
    });
    if (!r.error) pendingPhone = null;
    return r;
  }

  async function signOut() {
    if (cloud && cloud.auth) {
      try { await cloud.auth.signOut(); } catch (e) { /* ignore */ }
    }
    currentUser = null;
    status = "signed_out";
    emit();
  }

  function maskPhone(p) {
    if (!p || p.length !== 11) return p || "";
    return p.slice(0, 3) + "****" + p.slice(7);
  }

  /* ---------- 云端存档 ---------- */
  function serialize() {
    try { return JSON.stringify(ZZSH.state.data); }
    catch (e) { return null; }
  }

  /* 把本地进度写入云端：先查是否有行，有则按 id 更新，无则插入。
     绝不手动传 owner_id（由 DEFAULT auth.uid() + RLS 决定）。 */
  async function uploadProgress() {
    if (!cloud || !currentUser) return { error: { message: "未登录" } };
    var found = await cloud.database.from("saves").select("id").maybeSingle();
    if (found.error) return found;
    var payload = serialize();
    if (!payload) return { error: { message: "本地进度序列化失败" } };
    var row = {
      payload: payload,
      got_count: ZZSH.state.data.got.length,
      owner_name: currentUser.name || null,
      client_updated_at: new Date().toISOString()
    };
    var res;
    if (found.data && found.data.id != null) {
      res = await cloud.database.from("saves").update(row).eq("id", found.data.id).select();
    } else {
      res = await cloud.database.from("saves").insert(row).select();
    }
    if (res.error) return res;
    lastSyncAt = Date.now();
    emit();
    return { data: true, error: null };
  }

  /* 本地改动后（debounce）自动上传 */
  function scheduleUpload() {
    if (status !== "signed_in") return;
    if (uploadTimer) clearTimeout(uploadTimer);
    uploadTimer = setTimeout(function () { uploadProgress(); }, 1500);
  }

  /* 从云端取回进度（返回迁移后的 state 或 null） */
  async function downloadProgress() {
    if (!cloud || !currentUser) return { error: { message: "未登录" } };
    var r = await cloud.database.from("saves")
      .select("payload, client_updated_at").maybeSingle();
    if (r.error) return r;
    if (!r.data) return { data: null, error: null };
    try {
      var obj = JSON.parse(r.data.payload);
      return { data: obj, error: null, ts: r.data.client_updated_at };
    } catch (e) {
      return { error: { message: "云端存档解析失败" } };
    }
  }

  /* 登录成功后：云端无存档则把本地推上去；已有存档则交由 UI 提示用户是否恢复 */
  async function onSignIn() {
    var r = await cloud.database.from("saves").select("id").maybeSingle();
    if (r.data && r.data.id == null) {
      uploadProgress();
    }
  }

  /* ---------- 对外接口 ---------- */
  function onAuthChange(cb) {
    if (typeof cb === "function") listeners.push(cb);
    /* 注册时立即回灌一次当前状态，避免初始渲染错过 */
    try { cb(status, currentUser); } catch (e) { /* ignore */ }
  }

  ZZSH.cloud = {
    init: init,
    sendPhoneCode: sendPhoneCode,
    verifyPhoneCode: verifyPhoneCode,
    signOut: signOut,
    onAuthChange: onAuthChange,
    uploadProgress: uploadProgress,
    downloadProgress: downloadProgress,
    scheduleUpload: scheduleUpload,
    getUser: function () { return currentUser; },
    getStatus: function () { return status; },
    getLastSyncAt: function () { return lastSyncAt; },
    maskPhone: maskPhone,
    CFG: CFG
  };

  /* wrap 本地存档：每次写 localStorage 后，若已登录则顺带（debounce）上传云端 */
  if (ZZSH.state && typeof ZZSH.state.save === "function") {
    var origSave = ZZSH.state.save;
    ZZSH.state.save = function () {
      origSave();
      ZZSH.cloud.scheduleUpload();
    };
  }
})();
