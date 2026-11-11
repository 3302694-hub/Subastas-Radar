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
      x.fillStyle = "#069"; x.fillText("Subástica ñ € 🏠", 2, 15);
      x.fillStyle = "rgba(102,204,0,0.7)"; x.fillText("Subástica ñ € 🏠", 4, 17);
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
      const np = await client.from("settings").select("value").eq("key", "notas_pago_activo").maybeSingle();
      A.notaPago = !!(np.data && np.data.value === "true");
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
  // lang сохраняется в профиле Supabase — по нему письма приходят на языке сайта
  A.signUp = (email, password, lang) => client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo(), data: { lang: lang || "es" } } });
  A.signIn = (email, password) => client.auth.signInWithPassword({ email, password });
  A.oauth = (provider) => client.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
  A.reset = (email) => client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
  A.updatePassword = (password) => client.auth.updateUser({ password });
  A.signOut = () => client.auth.signOut();
  // Вход по токену Google Identity Services (кнопка Google на самом сайте)
  A.googleIdToken = (token, nonce) => client.auth.signInWithIdToken({ provider: "google", token, nonce });

  // Координаты архивных лотов (RLS: только тариф Про)
  A.archivoGeo = async function () {
    if (!enabled || !A.session) return {};
    const out = {};
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from("archivo_geo").select("id,lat,lon").order("id").range(from, from + 999);
      if (error) { console.error("archivo_geo", error); return out; }
      data.forEach((r) => { out[r.id] = [r.lat, r.lon]; });
      if (data.length < 1000) return out;
    }
  };

  // Почтовые оповещения о новых аукционах (таблица alertas, RLS: только свои)
  A.alertas = {
    list: async () => { const { data, error } = await client.from("alertas").select("id,provincia,categoria,max_valor,idioma,activa,created_at").order("id"); if (error) throw error; return data || []; },
    create: async (o) => { const { data, error } = await client.from("alertas").insert(Object.assign({ user_id: A.user().id }, o)).select("id").single(); if (error) throw error; return data; },
    remove: async (id) => { const { error } = await client.from("alertas").delete().eq("id", id); if (error) throw error; },
    toggle: async (id, on) => { const { error } = await client.from("alertas").update({ activa: on }).eq("id", id); if (error) throw error; }
  };

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

  // Данные по тарифам (оценка рынка, ставки, точное место) — сервер отдаёт только то, что разрешено тарифу
  A.loadExtra = async function () {
    if (!enabled || !A.session) return {};
    const out = {};
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await client.from("subastas_extra").select("id,nivel,data").order("id").range(from, from + PAGE - 1);
      if (error) { console.error("extra", error); return out; }
      data.forEach((r) => { (out[r.id] = out[r.id] || {})[r.nivel] = r.data; });
      if (data.length < PAGE) return out;
      from += PAGE;
    }
  };

  // ---------- nota simple: заказы пользователя (запись — только через функцию nota_crear)
  A.notaCrear = async (p) => {
    const { data, error } = await client.rpc("nota_crear", p);
    if (error) throw error;
    return data;
  };
  A.misNotas = async () => {
    if (!enabled || !A.session) return [];
    const { data, error } = await client.from("notas_pedidos")
      .select("id,created_at,tipo,subasta_id,bien,direccion,idufir,ref_catastral,registro,finca,estado,pdf_path,precio_cents,iva_pct")
      .eq("user_id", A.user().id).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data;
  };
  A.notaCancelar = async (id) => { const { error } = await client.rpc("nota_cancelar", { p_id: id }); if (error) throw error; };
  A.notaFiles = async (path) => {
    if (!path.endsWith("/")) return [{ path, name: path.split("/").pop() }];
    const { data, error } = await client.storage.from("notas").list(path.slice(0, -1), { limit: 50, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    return data.filter((f) => f.id).map((f) => ({ path: path + f.name, name: f.name }));
  };
  A.notaUrl = async (path) => {
    const { data, error } = await client.storage.from("notas").createSignedUrl(path, 600);
    if (error) throw error;
    return data.signedUrl;
  };

  window.Auth = A;
})();
