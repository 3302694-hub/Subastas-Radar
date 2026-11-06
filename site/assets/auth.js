// Вход, регистрация и статус доступа (Supabase Auth)
(function () {
  "use strict";
  const CFG = window.SITE_CONFIG || {};
  const enabled = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase && window.supabase.createClient);
  const client = enabled
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
        auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
      })
    : null;

  const A = {
    enabled, client, session: null, status: null, trialUntil: null,
    _subs: [], _key: ""
  };
  const redirectTo = () => location.origin + location.pathname;

  // ---------- идентификатор устройства
  function localId() {
    const KEY = "sr_did";
    let id = null;
    try { id = localStorage.getItem(KEY); } catch (e) { /* */ }
    if (!id) { const m = document.cookie.match(/(?:^|; )sr_did=([^;]+)/); if (m) id = m[1]; }
    if (!id) id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
    try { localStorage.setItem(KEY, id); } catch (e) { /* */ }
    document.cookie = `sr_did=${id}; max-age=${60 * 60 * 24 * 730}; path=/; SameSite=Lax`;
    return id;
  }
  async function fingerprint() {
    const n = navigator, s = screen;
    const parts = [
      (n.userAgent || "").replace(/[\d._]+/g, ""), n.language, (n.languages || []).join(","), n.platform,
      n.hardwareConcurrency, n.deviceMemory, `${s.width}x${s.height}x${s.colorDepth}`, window.devicePixelRatio,
      (Intl.DateTimeFormat().resolvedOptions().timeZone || ""), "ontouchstart" in window, n.maxTouchPoints
    ];
    try {
      const c = document.createElement("canvas"); c.width = 240; c.height = 60;
      const x = c.getContext("2d");
      x.textBaseline = "top"; x.font = "16px Arial"; x.fillStyle = "#f60"; x.fillRect(100, 1, 62, 20);
      x.fillStyle = "#069"; x.fillText("SubastaRadar ñ € 🏠", 2, 15);
      x.fillStyle = "rgba(102,204,0,0.7)"; x.fillText("SubastaRadar ñ € 🏠", 4, 17);
      parts.push(c.toDataURL());
    } catch (e) { /* */ }
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) parts.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL), gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    } catch (e) { /* */ }
    const str = parts.join("|");
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
    } catch (e) {
      // без https crypto.subtle недоступен — простой 2×32-битный хеш
      let h1 = 0x811c9dc5, h2 = 0x01000193;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
        h2 = Math.imul(h2 + c, 2246822519) >>> 0;
      }
      return "f" + h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
    }
  }

  // ---------- статус
  A.hasAccess = () => !enabled || !!(A.status && A.status.has_access);
  A.user = () => (A.session && A.session.user) || null;
  A.on = (fn) => A._subs.push(fn);
  // Режим отображения хранится в профиле (Новичок / Инвестор / Про)
  A.setViewMode = async (m) => {
    if (!enabled || !A.session) return null;
    const { data, error } = await A.client.rpc("set_view_mode", { p_mode: m });
    if (error) throw error;
    if (A.status) A.status.view_mode = m;
    return data;
  };
  function emit(type) { A._subs.forEach((fn) => { try { fn(type); } catch (e) { console.error(e); } }); }

  A.refreshStatus = async function () {
    if (!enabled || !A.session) { A.status = null; return; }
    try {
      let fp = "";
      try { fp = await fingerprint(); } catch (e) { /* без отпечатка */ }
      const { data, error } = await client.rpc("register_device", { p_local_id: localId(), p_fingerprint: fp });
      if (error) throw error;
      A.status = data;
    } catch (e) {
      console.error("register_device", e);
      A.status = null;
    }
  };

  async function sync(force) {
    await A.refreshStatus();
    const key = (A.user() ? A.user().id : "-") + ":" + A.hasAccess();
    if (force || key !== A._key) { A._key = key; emit("change"); }
  }

  A.init = async function () {
    if (!enabled) return;
    try {
      const { data } = await client.from("settings").select("value").eq("key", "default_trial_until").maybeSingle();
      A.trialUntil = data && data.value;
    } catch (e) { /* */ }
    const { data } = await client.auth.getSession();
    A.session = data.session;
    await A.refreshStatus();
    A._key = (A.user() ? A.user().id : "-") + ":" + A.hasAccess();
    client.auth.onAuthStateChange((event, session) => {
      // вызовы Supabase внутри обработчика откладываем — так рекомендует библиотека
      setTimeout(async () => {
        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") { A.session = session; return; }
        A.session = session;
        if (event === "PASSWORD_RECOVERY") emit("recovery");
        await sync(event === "SIGNED_OUT");
      }, 0);
    });
  };

  // ---------- действия
  A.signUp = (email, password) => client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
  A.signIn = (email, password) => client.auth.signInWithPassword({ email, password });
  A.oauth = (provider) => client.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
  A.reset = (email) => client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
  A.updatePassword = (password) => client.auth.updateUser({ password });
  A.signOut = () => client.auth.signOut();

  // Загрузка аукционов, разрешённых текущему пользователю (RLS решает на сервере)
  A.loadSubastas = async function () {
    let out = [], from = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await client.from("subastas").select("data")
        .order("detectada", { ascending: false }).order("id").range(from, from + PAGE - 1);
      if (error) throw error;
      out = out.concat(data.map((r) => r.data));
      if (data.length < PAGE) return out;
      from += PAGE;
    }
  };

  window.Auth = A;
})();
