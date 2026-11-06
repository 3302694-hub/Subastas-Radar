(function () {
  "use strict";
  const CFG = window.SITE_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("sr_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("sr_" + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  const ORIGINS = ["judicial", "notarial", "hacienda", "seguridad_social", "administracion"];
  const CATS = ["vivienda", "garaje", "trastero", "local", "nave", "solar", "rustica", "vehiculo", "embarcacion", "joyas_arte", "maquinaria", "derechos", "otros"];
  const STATUSES = ["open", "activa", "proxima", "finalizada", "all"];

  const LANGS = ["es", "en", "ru"];
  const browserLang = ((navigator.language || "").slice(0, 2) || "").toLowerCase();
  let lang = store.get("lang", null) || (LANGS.includes(browserLang) ? browserLang : (CFG.defaultLang || "es"));
  if (!LANGS.includes(lang)) lang = "es";
  let all = [], meta = {}, isDemo = false;
  let shown = CFG.pageSize || 24;
  let favs = new Set(store.get("favs", []));
  let onlyFavs = false;
  let map, mapLayer;

  const state = { q: "", origin: [], cat: "", prov: "", status: "open", min: "", max: "", fresh: "", sort: "new" };

  // ---------- i18n
  const t = (k, vars) => {
    let v = (I18N[lang] && I18N[lang][k]) || (I18N.es[k]) || k;
    if (vars) Object.keys(vars).forEach((n) => { v = v.split("{" + n + "}").join(vars[n]); });
    return v;
  };
  const AUTH = window.Auth || { enabled: false, hasAccess: () => true };
  const locked = () => AUTH.enabled && !AUTH.hasAccess();
  function applyI18n() {
    document.documentElement.lang = lang;
    $$("[data-i]").forEach((el) => (el.textContent = t(el.dataset.i)));
    $$("[data-i-ph]").forEach((el) => (el.placeholder = t(el.dataset.iPh)));
    $$(".lang button").forEach((b) => b.classList.toggle("on", b.dataset.lang === lang));
    $("#pMin").placeholder = t("f_min"); $("#pMax").placeholder = t("f_max");
    buildControls();
    render();
    renderAccount();
  }

  // ---------- formatting
  const locale = () => ({ ru: "ru-RU", en: "en-GB", es: "es-ES" }[lang] || "es-ES");
  const eur = (v) => v == null ? "—" : new Intl.NumberFormat(locale(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  const dateFmt = (iso) => { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString(locale(), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sentence = (s) => { s = String(s || ""); if (s !== s.toUpperCase()) return s; s = s.toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
  const title = (s) => (s || "").toLowerCase().replace(/(^|[\s/(-])\S/g, (m) => m.toUpperCase());
  function timeLeft(s) {
    const now = Date.now();
    const start = s.fecha_inicio ? new Date(s.fecha_inicio).getTime() : null;
    const end = s.fecha_fin ? new Date(s.fecha_fin).getTime() : null;
    let label, target;
    if (start && start > now) { label = t("starts"); target = start; }
    else if (end && end > now) { label = t("ends"); target = end; }
    else if (end) return `${t("ended")} ${dateFmt(s.fecha_fin)}`;
    else return "";
    let ms = target - now;
    const d = Math.floor(ms / 864e5); ms -= d * 864e5;
    const h = Math.floor(ms / 36e5); ms -= h * 36e5;
    const m = Math.floor(ms / 6e4);
    const txt = d > 0 ? `${d} ${t("left_d")} ${h} ${t("left_h")}` : `${h} ${t("left_h")} ${m} ${t("left_m")}`;
    return `${label}: ${txt}`;
  }
  const day = (d) => { if (!d) return "—"; const x = new Date(d + (String(d).length === 10 ? "T12:00:00" : "")); return isNaN(x) ? d : x.toLocaleDateString(locale(), { day: "2-digit", month: "2-digit", year: "numeric" }); };
  const isNew = (s, hours = 24) => s.detectada && (Date.now() - new Date(s.detectada).getTime()) < hours * 36e5;

  // ---------- icons (stroke SVG)
  const ICONS = {
    vivienda: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    garaje: '<path d="M3 20V9l9-5 9 5v11"/><path d="M7 20v-7h10v7"/><path d="M7 16h10"/>',
    trastero: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 10h16M10 10v10"/>',
    local: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9h18"/><path d="M9 20v-6h6v6"/>',
    nave: '<path d="M2 20h20"/><path d="M4 20V10l5 3V10l5 3V10l6 3v7"/>',
    solar: '<path d="M3 20h18"/><path d="M5 20l3-9h8l3 9"/><path d="M12 4v3"/>',
    rustica: '<path d="M3 20h18"/><path d="M12 20v-8"/><path d="M12 12c0-4 3-6 6-6 0 4-3 6-6 6z"/><path d="M12 14c0-3-2-5-5-5 0 3 2 5 5 5z"/>',
    vehiculo: '<path d="M5 16l1.5-5h11l1.5 5"/><rect x="3" y="16" width="18" height="3" rx="1"/><circle cx="7.5" cy="19.5" r="1"/><circle cx="16.5" cy="19.5" r="1"/>',
    embarcacion: '<path d="M3 17l2 3h14l2-3H3z"/><path d="M12 4v13"/><path d="M12 5l6 9h-6"/>',
    joyas_arte: '<path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18"/>',
    maquinaria: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
    derechos: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h5"/>',
    otros: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'
  };
  const ic = (k, fill) => `<svg viewBox="0 0 24 24" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.otros}</svg>`;
  const PRICES = [25000, 50000, 100000, 150000, 250000, 500000, 1000000];

  // ---------- controls
  function opt(v, label, sel) { return `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(label)}</option>`; }
  function buildControls() {
    $("#fOrigin").innerHTML = ORIGINS.map((o) => `<button type="button" class="chip${state.origin.includes(o) ? " on" : ""}" data-o="${o}">${esc(t("o_" + o))}</button>`).join("");
    const catCounts = count((s) => s.categoria);
    $("#fCat").innerHTML = opt("", t("s_any_type"), !state.cat) + CATS.filter((c) => catCounts[c]).map((c) => opt(c, t("c_" + c), state.cat === c)).join("");
    const provCounts = count((s) => s._prov);
    const provs = Object.keys(provCounts).filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
    $("#fProv").innerHTML = opt("", t("s_any_place"), !state.prov) + provs.map((p) => opt(p, title(p), state.prov === p)).join("");
    const maxIsPreset = PRICES.map(String).includes(String(state.max));
    $("#fPrice").innerHTML = opt("", t("s_any_price"), state.max === "") + PRICES.map((v) => opt(String(v), eur(v), String(state.max) === String(v))).join("")
      + (state.max !== "" && !maxIsPreset ? opt(String(state.max), eur(+state.max), true) : "");
    $("#fStatus").innerHTML = STATUSES.map((s) => opt(s, s === "open" ? `${t("s_activa")} + ${t("s_proxima")}` : s === "all" ? t("any") : t("s_" + s), state.status === s)).join("");
    $("#fFresh").innerHTML = opt("", t("any_f"), !state.fresh) + opt("24", t("fresh_24"), state.fresh === "24") + opt("168", t("fresh_7"), state.fresh === "168");
    $("#sort").innerHTML = ["new", "end", "price_asc", "price_desc", "discount"].map((s) => opt(s, t("sort_" + s), state.sort === s)).join("");
    $("#q").value = state.q; $("#pMin").value = state.min; $("#pMax").value = state.max;
    fitPicks();
  }
  // Ширина «пилюль» поиска-фразы — по выбранному тексту: невидимая копия текста задаёт ширину
  function fitPicks() {
    $$(".pick select").forEach((sel) => {
      let sz = sel.parentNode.querySelector(".sz");
      if (!sz) { sz = document.createElement("span"); sz.className = "sz"; sz.setAttribute("aria-hidden", "true"); sel.parentNode.appendChild(sz); }
      const o = sel.options[sel.selectedIndex];
      sz.textContent = o ? o.textContent : "";
    });
  }
  function count(fn) { const o = {}; all.forEach((s) => { const k = fn(s); o[k] = (o[k] || 0) + 1; }); return o; }

  // ---------- filtering
  function matches(s, st = state) {
    if (onlyFavs && !favs.has(s.id)) return false;
    if (st.origin.length && !st.origin.includes(s.origen)) return false;
    if (st.cat && s.categoria !== st.cat) return false;
    if (st.prov && s._prov !== st.prov) return false;
    if (st.status === "open" && !["activa", "proxima"].includes(s.estado)) return false;
    if (!["open", "all"].includes(st.status) && s.estado !== st.status) return false;
    const v = s.valor_subasta;
    if (st.min !== "" && (v == null || v < +st.min)) return false;
    if (st.max !== "" && (v == null || v > +st.max)) return false;
    if (st.fresh && !isNew(s, +st.fresh)) return false;
    if (st.q) {
      const words = st.q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
      if (!words.every((w) => s._text.includes(w))) return false;
    }
    return true;
  }
  function sorted(list) {
    const by = {
      new: (a, b) => (b.detectada || "").localeCompare(a.detectada || "") || (b.fecha_inicio || "").localeCompare(a.fecha_inicio || ""),
      end: (a, b) => (a.fecha_fin || "9").localeCompare(b.fecha_fin || "9"),
      price_asc: (a, b) => (a.valor_subasta ?? 1e15) - (b.valor_subasta ?? 1e15),
      price_desc: (a, b) => (b.valor_subasta ?? -1) - (a.valor_subasta ?? -1),
      discount: (a, b) => disc(b) - disc(a)
    }[state.sort];
    return list.slice().sort(by);
  }
  const disc = (s) => (s.tasacion && s.valor_subasta && s.tasacion > s.valor_subasta) ? (1 - s.valor_subasta / s.tasacion) : -1;

  // ---------- render
  function daysLeft(s) {
    const now = Date.now();
    const start = s.fecha_inicio ? new Date(s.fecha_inicio).getTime() : null;
    const end = s.fecha_fin ? new Date(s.fecha_fin).getTime() : null;
    if (start && start > now) return { cls: "", txt: timeLeft(s), pct: 100 };
    if (!end) return { cls: "", txt: "", pct: 0 };
    if (end <= now) return { cls: "", txt: t("s_finalizada"), pct: 0 };
    const ms = end - now, d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5);
    const total = start ? Math.max(end - start, 1) : 20 * 864e5;
    const pct = Math.max(3, Math.min(100, Math.round((ms / total) * 100)));
    return { cls: d < 3 ? "hot" : "", txt: d >= 1 ? t("days_left", { n: d }) : t("hours_left", { n: Math.max(h, 1) }), pct };
  }

  function card(s) {
    const city = title(s.localidad) || title(s._prov) || "—";
    const prov = title(s._prov) && title(s._prov) !== city ? title(s._prov) : "";
    const dl = daysLeft(s);
    const sub = [s.tasacion ? `${t("appraisal")} ${eur(s.tasacion)}` : "", s.deposito ? `${t("deposit")} ${eur(s.deposito)}` : ""].filter(Boolean).join(" · ");
    const fav = favs.has(s.id);
    return `<article class="card" data-id="${esc(s.id)}" tabindex="0" aria-label="${esc(t("c_" + s.categoria) + " · " + city)}">
      <div class="c-top">
        <span class="c-tags">${isNew(s) ? `<span class="tag new">${t("new_badge")}</span>` : ""}<span class="tag">${esc(t("o_" + s.origen))}</span>${s.estado !== "activa" ? `<span class="st ${s.estado}">${esc(t("s_" + s.estado))}</span>` : ""}</span>
        <button class="fav${fav ? " on" : ""}" data-fav="${esc(s.id)}" aria-pressed="${fav}" aria-label="${esc(fav ? t("fav_del") : t("fav_add"))}">${ic("star", fav)}</button>
      </div>
      <div class="c-body">
        <span class="c-cat">${ic(s.categoria)}<span>${esc(t("c_" + s.categoria))}</span></span>
        <h3>${esc(city)}</h3>
        ${prov ? `<span class="c-prov">${esc(prov)}</span>` : ""}
        <span class="c-desc">${esc(sentence(s.titulo))}</span>
        <span class="c-price">${eur(s.valor_subasta)}</span>
        ${sub ? `<span class="c-sub">${esc(sub)}</span>` : ""}
        ${dl.pct ? `<span class="c-bar" aria-hidden="true"><i style="width:${dl.pct}%"></i></span>` : ""}
      </div>
      <div class="c-foot"><span>${esc(t("see_details"))}</span><span class="c-left ${dl.cls}">${esc(dl.txt)}</span></div>
    </article>`;
  }

  function renderTiles() {
    const c = count((s) => (["activa", "proxima"].includes(s.estado) ? s.categoria : null));
    const base = locked() && meta.por_categoria ? meta.por_categoria : c;
    $("#tiles").innerHTML = CATS.filter((k) => base[k]).map((k) => `<button class="tile${state.cat === k ? " on" : ""}" data-cat="${k}">
      <span class="ic">${ic(k)}</span><b>${(base[k] || 0).toLocaleString(locale())}</b><span>${esc(t("c_" + k))}</span></button>`).join("");
  }

  function renderSoon() {
    const now = Date.now();
    const soon = all.filter((s) => s.estado === "activa" && s.fecha_fin && new Date(s.fecha_fin).getTime() > now)
      .sort((a, b) => (a.fecha_fin || "").localeCompare(b.fecha_fin || "")).slice(0, 4);
    $("#soonBlock").hidden = !soon.length;
    $("#soon").innerHTML = soon.map(card).join("");
  }

  function renderHero() {
    const n = Math.max(all.filter((s) => ["activa", "proxima"].includes(s.estado)).length, meta.actuales || 0);
    $("#heroKicker").textContent = t("hero_kicker", { n: n.toLocaleString(locale()) });
    const cnt = all.filter((s) => matches(s)).length;
    $("#heroGo").textContent = cnt ? t("see_n", { n: cnt.toLocaleString(locale()) }) : t("see_all");
    $("#heroUpdated").textContent = meta.actualizado ? t("updated_line", { date: new Date(meta.actualizado).toLocaleString(locale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) }) : "";
    $("#soonAll").textContent = t("all_auctions_link");
    $("#how1d").textContent = t("how1_d", { date: trialDate() });
  }

  function render() {
    const list = sorted(all.filter((s) => matches(s)));
    $("#resCount").textContent = list.length.toLocaleString(locale());
    let html = list.length ? list.slice(0, shown).map(card).join("") : (locked() ? "" : `<div class="empty">${onlyFavs ? t("saved_empty") : t("none")}</div>`);
    const hidden = hiddenCount();
    if (locked() && hidden > 0 && !onlyFavs && list.length <= shown && ["open", "activa", "proxima", "all"].includes(state.status)) {
      html += `<article class="card locked-card" data-locked="1" tabindex="0"><div class="lock-ic">${ic("lock")}</div>
        <h3>${esc(t("locked_card", { n: hidden.toLocaleString(locale()) }))}</h3>
        <button class="btn" data-locked="1">${esc(AUTH.user && AUTH.user() ? t("lock_cta_user") : t("lock_cta_guest"))}</button></article>`;
    }
    $("#list").innerHTML = html;
    $("#more").hidden = list.length <= shown;
    renderLock(); renderTiles(); renderHero(); renderSoon();
    renderMap(list);
    renderProvList();
    writeUrl();
  }

  function renderStats() {
    const active = Math.max(all.filter((s) => ["activa", "proxima"].includes(s.estado)).length, meta.actuales || 0);
    $("#stActive").textContent = active.toLocaleString(locale());
    $("#stNew").textContent = all.filter((s) => isNew(s)).length.toLocaleString(locale());
    $("#stUpdated").textContent = meta.actualizado ? new Date(meta.actualizado).toLocaleString(locale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  }

  function renderProvList() {
    const st = Object.assign({}, state, { prov: "" });
    const c = {}; all.filter((s) => matches(s, st)).forEach((s) => { if (s._prov) c[s._prov] = (c[s._prov] || 0) + 1; });
    $("#provList").innerHTML = Object.entries(c).sort((a, b) => b[1] - a[1])
      .map(([p, n]) => `<button data-prov="${esc(p)}"><span>${esc(title(p))}</span><em>${n}</em></button>`).join("");
  }

  function renderMap(list) {
    if (!window.L) return;
    if (!map) {
      map = L.map("map", { scrollWheelZoom: false }).setView([39.6, -4.2], 5.4);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 18
      }).addTo(map);
      mapLayer = L.layerGroup().addTo(map);
    }
    mapLayer.clearLayers();
    const st = Object.assign({}, state, { prov: "" });
    const c = {}; all.filter((s) => matches(s, st)).forEach((s) => { c[s._prov] = (c[s._prov] || 0) + 1; });
    const max = Math.max(1, ...Object.values(c));
    Object.entries(c).forEach(([p, n]) => {
      const ll = PROVINCES[p]; if (!ll) return;
      const sel = state.prov === p;
      L.circleMarker(ll, {
        radius: 7 + 22 * Math.sqrt(n / max), color: sel ? "#0B1020" : "#2546F0", weight: sel ? 3 : 1.5,
        fillColor: "#2546F0", fillOpacity: sel ? .8 : .45
      }).bindTooltip(`${title(p)}: ${n}`).on("click", () => { state.prov = sel ? "" : p; shown = CFG.pageSize; buildControls(); render(); })
        .addTo(mapLayer);
    });
  }

  // ---------- detail
  function openDetail(id) {
    const s = all.find((x) => x.id === id);
    if (!s) { if (locked()) openLockedDetail(); return; }
    const kv = (k, v) => v == null || v === "" ? "" : `<div><small>${t(k)}</small><b>${typeof v === "number" ? eur(v) : esc(v)}</b></div>`;
    const assets = (s.bienes || []).map((b) => {
      const row = (k, v) => v ? `<dt>${t(k)}</dt><dd>${esc(v)}</dd>` : "";
      const rc = (b.ref_catastral || "").replace(/\s/g, "");
      const cat = rc.length >= 14 ? `<a href="https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx?rc1=${rc.slice(0, 7)}&rc2=${rc.slice(7, 14)}" target="_blank" rel="noopener">${esc(b.ref_catastral)}</a>` : esc(b.ref_catastral || "");
      return `<div class="asset"><p><b>${esc(b.titulo || "")}</b><br>${esc(sentence(b.descripcion))}</p><dl>
        ${row("d_address", [b.direccion, b.cp, title(b.localidad), title(b.provincia)].filter(Boolean).join(", "))}
        ${rc ? `<dt>${t("d_cadastre")}</dt><dd>${cat}</dd>` : ""}
        ${row("d_possession", b.situacion_posesoria)}${row("d_visitable", b.visitable)}${row("d_charges", b.cargas)}
      </dl></div>`;
    }).join("");
    const q = encodeURIComponent([s.direccion, s.cp, s.localidad, s._prov, "España"].filter(Boolean).join(", "));
    $("#detailBody").innerHTML = `
      <div class="d-head">
        <button class="d-close" aria-label="${t("close")}">×</button>
        <div class="c-tags">${isNew(s) ? `<span class="tag new">${t("new_badge")}</span>` : ""}<span class="tag">${esc(t("o_" + s.origen))}</span><span class="tag">${esc(t("c_" + s.categoria))}</span><span class="st ${s.estado}">${esc(t("s_" + s.estado))}</span></div>
        <h2>${esc(t("c_" + s.categoria))} · ${esc(title(s.localidad) || title(s._prov) || "")}</h2>
        <div class="muted">${esc([title(s.localidad), title(s._prov)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", "))} · ${esc(s.id)}</div>
      </div>
      <div class="d-body">
        <div class="kv">
          ${kv("value", s.valor_subasta)}${kv("appraisal", s.tasacion)}${kv("deposit", s.deposito)}
          ${s.puja_minima != null ? kv("min_bid", s.puja_minima) : `<div><small>${t("min_bid")}</small><b>${t("no_min")}</b></div>`}
          ${kv("claimed", s.cantidad_reclamada)}
        </div>
        <h4>${t("d_general")}</h4>
        <div class="kv">
          <div><small>${t("date_start")}</small><b>${dateFmt(s.fecha_inicio)}</b></div>
          <div><small>${t("date_end")}</small><b>${dateFmt(s.fecha_fin)}</b></div>
          ${kv("d_type", s.tipo)}${kv("d_boe", s.anuncio_boe)}${kv("d_lots", s.lotes)}
        </div>
        ${s.autoridad ? `<h4>${t("d_authority")}</h4><p>${esc(s.autoridad)}</p>` : ""}
        ${assets ? `<h4>${t("d_assets")}</h4>${assets}` : ""}
        <div class="d-links">
          <a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener">${t("open_boe")} ↗</a>
          <a class="btn ghost" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">${t("open_map")} ↗</a>
          <button class="btn ghost" data-fav="${esc(s.id)}">${favs.has(s.id) ? t("fav_del") : t("fav_add")}</button>
        </div>
      </div>`;
    const dlg = $("#detail");
    if (!dlg.open) dlg.showModal();
    if (location.hash !== "#/s/" + id) history.replaceState(null, "", location.pathname + location.search + "#/s/" + id);
  }
  function closeDetail() {
    $("#detail").close();
    if (location.hash.startsWith("#/s/")) history.replaceState(null, "", location.pathname + location.search);
  }

  // ---------- account & access
  function visibleCurrent() { return all.filter((s) => ["activa", "proxima"].includes(s.estado)).length; }
  function hiddenCount() { return Math.max(0, (meta.actuales || 0) - visibleCurrent()); }
  function trialDate() { return day(AUTH.trialUntil || "2027-12-31"); }

  function renderAccount() {
    if (!AUTH.enabled) { $("#account").hidden = true; return; }
    const u = AUTH.user();
    $("#loginBtn").hidden = !!u;
    $("#signupTop").hidden = !!u;
    $("#userChip").hidden = !u;
    if (u) {
      const st = AUTH.status || {};
      $("#userEmail").textContent = u.email || "";
      $("#userAccess").textContent = st.trusted ? t("access_unlimited")
        : st.has_access ? t("access_until", { date: day(st.access_until) }) : t("access_none");
      $("#userChip").classList.toggle("no-access", !st.has_access);
    }
  }

  function renderLock() {
    const b = $("#lockBanner");
    if (!locked()) { b.hidden = true; return; }
    const u = AUTH.user && AUTH.user();
    const st = AUTH.status || {};
    const v = visibleCurrent().toLocaleString(locale()), n = Math.max(meta.actuales || 0, visibleCurrent()).toLocaleString(locale());
    let text;
    if (!u) text = t("lock_guest", { v, n, date: trialDate() });
    else if (st.reason && !st.access_until) text = t("lock_denied");
    else text = t("lock_expired", { v, n });
    if (u && CFG.contactEmail) text += " " + t("lock_contact", { email: CFG.contactEmail });
    $("#lockText").textContent = text;
    $("#lockBtn").textContent = u ? t("lock_cta_user") : t("lock_cta_guest");
    $("#lockBtn").hidden = !!u && !CFG.contactEmail;
    b.hidden = false;
  }

  function lockAction() {
    if (AUTH.user && AUTH.user()) { if (CFG.contactEmail) location.href = "mailto:" + CFG.contactEmail; }
    else openAuth("signup");
  }

  function openLockedDetail() {
    $("#detailBody").innerHTML = `<div class="d-head"><button class="d-close">×</button><h2>${esc(t("locked_detail"))}</h2>
      <p class="muted">${esc(AUTH.user && AUTH.user() ? "" : t("lead_signup", { date: trialDate() }))}</p></div>
      <div class="d-body"><div class="d-links">${AUTH.user && AUTH.user() ? "" : `<button class="btn" id="lockedSignup">${esc(t("lock_cta_guest"))}</button>`}</div></div>`;
    if (!$("#detail").open) $("#detail").showModal();
    const b = $("#lockedSignup"); if (b) b.onclick = () => { $("#detail").close(); openAuth("signup"); };
  }

  let authMode = "signup";
  function openAuth(mode) {
    authMode = mode || "signup";
    const dlg = $("#authDlg");
    $$("#authTabs button").forEach((b) => b.classList.toggle("on", b.dataset.mode === authMode));
    $("#authTabs").hidden = authMode === "reset" || authMode === "recovery";
    const providers = CFG.oauthProviders || [];
    $$(".oauth-btn").forEach((b) => (b.hidden = !providers.includes(b.dataset.provider)));
    $("#oauthBox").hidden = !providers.length || authMode === "reset" || authMode === "recovery";
    $("#authLead").textContent = t({ signup: "lead_signup", login: "lead_login", reset: "lead_reset", recovery: "lead_recovery" }[authMode], { date: trialDate() });
    $("#authEmail").closest("label").hidden = authMode === "recovery";
    $("#authEmail").required = authMode !== "recovery";
    $("#pwRow").hidden = authMode === "reset";
    $("#authPw").required = authMode !== "reset";
    $("#pwRow span").textContent = authMode === "recovery" ? t("new_password") : t("password");
    $("#authPw").autocomplete = authMode === "login" ? "current-password" : "new-password";
    $("#authSubmit").textContent = { signup: t("signup"), login: t("login"), reset: t("send_link"), recovery: t("save") }[authMode];
    $("#forgotBtn").hidden = authMode !== "login";
    $("#authMsg").hidden = true;
    if (!dlg.open) dlg.showModal();
  }
  function authMsg(text, ok) { const m = $("#authMsg"); m.textContent = text; m.className = "auth-msg" + (ok ? " ok" : " err"); m.hidden = false; }

  async function submitAuth(e) {
    e.preventDefault();
    const email = $("#authEmail").value.trim(), pw = $("#authPw").value;
    const btn = $("#authSubmit"); btn.disabled = true;
    try {
      if (authMode === "signup") {
        const { data, error } = await AUTH.signUp(email, pw);
        if (error) throw error;
        if (data.session) $("#authDlg").close(); else authMsg(t("msg_check_email"), true);
      } else if (authMode === "login") {
        const { error } = await AUTH.signIn(email, pw);
        if (error) return authMsg(t("err_login"));
        $("#authDlg").close();
      } else if (authMode === "reset") {
        await AUTH.reset(email);
        authMsg(t("msg_reset_sent"), true);
      } else if (authMode === "recovery") {
        const { error } = await AUTH.updatePassword(pw);
        if (error) throw error;
        authMsg(t("msg_pw_updated"), true);
        setTimeout(() => $("#authDlg").close(), 1200);
      }
    } catch (err) {
      console.error(err);
      authMsg((err && err.message) ? `${t("err_generic")} (${err.message})` : t("err_generic"));
    } finally { btn.disabled = false; }
  }

  function bindAuth() {
    if (!AUTH.enabled) return;
    $("#loginBtn").onclick = () => openAuth("login");
    $("#signupTop").onclick = () => openAuth("signup");
    $("#lockBtn").onclick = lockAction;
    $("#authTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-mode]"); if (b) openAuth(b.dataset.mode); });
    $("#forgotBtn").onclick = () => openAuth("reset");
    $("#authForm").addEventListener("submit", submitAuth);
    $$(".oauth-btn").forEach((b) => (b.onclick = async () => {
      const { error } = await AUTH.oauth(b.dataset.provider);
      if (error) authMsg(`${t("err_generic")} (${error.message})`);
    }));
    $("#authDlg").addEventListener("click", (e) => { if (e.target.id === "authDlg" || e.target.closest("[data-close]")) $("#authDlg").close(); });
    $("#userBtn").onclick = () => ($("#userMenu").hidden = !$("#userMenu").hidden);
    $("#logoutBtn").onclick = async () => { $("#userMenu").hidden = true; await AUTH.signOut(); };
    $("#list").addEventListener("click", (e) => { if (e.target.closest("[data-locked]")) { e.stopPropagation(); lockAction(); } }, true);
    AUTH.on(async (type) => {
      if (type === "recovery") return openAuth("recovery");
      await loadData(); buildControls(); render(); renderAccount(); renderStats();
    });
  }

  // ---------- favourites & saved search
  function toggleFav(id) {
    favs.has(id) ? favs.delete(id) : favs.add(id);
    store.set("favs", [...favs]);
    $("#favCount").textContent = favs.size;
    render();
    if ($("#detail").open) openDetail(id);
  }
  function saveSearch() {
    store.set("saved", { state: Object.assign({}, state), seen: all.filter((s) => matches(s)).map((s) => s.id) });
    flash(t("saved_ok"));
  }
  function checkSaved() {
    const saved = store.get("saved", null); if (!saved) return;
    const seen = new Set(saved.seen || []);
    const fresh = all.filter((s) => matches(s, Object.assign({}, state, saved.state)) && !seen.has(s.id));
    if (!fresh.length) return;
    flash(`<b>${fresh.length}</b> ${t("new_since")} <button class="btn small" id="showSaved">${t("show")}</button>`, true);
    $("#showSaved").onclick = () => {
      Object.assign(state, saved.state); state.sort = "new";
      saved.seen = Array.from(new Set([...seen, ...fresh.map((s) => s.id)])); store.set("saved", saved);
      $("#savedNotice").hidden = true; buildControls(); render(); $("#filters").scrollIntoView();
    };
  }
  function flash(html, sticky) {
    const n = $("#savedNotice"); n.firstElementChild.innerHTML = html; n.hidden = false;
    if (!sticky) setTimeout(() => (n.hidden = true), 5000);
  }

  // ---------- URL state
  function writeUrl() {
    const p = new URLSearchParams();
    Object.entries(state).forEach(([k, v]) => {
      if (Array.isArray(v) ? v.length : v !== "" && !(k === "status" && v === "open") && !(k === "sort" && v === "new")) p.set(k, Array.isArray(v) ? v.join(",") : v);
    });
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }
  function readUrl() {
    const p = new URLSearchParams(location.search);
    Object.keys(state).forEach((k) => { if (p.has(k)) state[k] = k === "origin" ? p.get(k).split(",").filter(Boolean) : p.get(k); });
  }

  // ---------- events
  function bind() {
    let timer;
    $("#q").addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); shown = CFG.pageSize; render(); }, 180); });
    $("#fOrigin").addEventListener("click", (e) => {
      const b = e.target.closest("[data-o]"); if (!b) return;
      const o = b.dataset.o; state.origin = state.origin.includes(o) ? state.origin.filter((x) => x !== o) : [...state.origin, o];
      b.classList.toggle("on"); shown = CFG.pageSize; render();
    });
    [["#fCat", "cat"], ["#fProv", "prov"], ["#fStatus", "status"], ["#fFresh", "fresh"], ["#sort", "sort"]].forEach(([sel, k]) =>
      $(sel).addEventListener("change", (e) => { state[k] = e.target.value; shown = CFG.pageSize; render(); }));
    [["#pMin", "min"], ["#pMax", "max"]].forEach(([sel, k]) =>
      $(sel).addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => { state[k] = e.target.value; if (k === "max") buildControls(); render(); }, 300); }));
    $("#reset").onclick = () => { Object.assign(state, { q: "", origin: [], cat: "", prov: "", status: "open", min: "", max: "", fresh: "", sort: "new" }); onlyFavs = false; shown = CFG.pageSize; buildControls(); render(); };
    $("#saveSearch").onclick = saveSearch;
    $$(".pick select").forEach((el) => el.addEventListener("change", fitPicks));
    window.addEventListener("resize", fitPicks);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPicks);
    $("#fPrice").addEventListener("change", (e) => { state.max = e.target.value; $("#pMax").value = state.max; shown = CFG.pageSize; render(); });
    $("#tiles").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]"); if (!b) return;
      state.cat = state.cat === b.dataset.cat ? "" : b.dataset.cat; shown = CFG.pageSize; buildControls(); render();
      $("#catalogo").scrollIntoView({ behavior: "smooth" });
    });
    $("#soon").addEventListener("click", (e) => {
      const f = e.target.closest("[data-fav]"); if (f) { e.stopPropagation(); return toggleFav(f.dataset.fav); }
      const c = e.target.closest(".card"); if (c) openDetail(c.dataset.id);
    });
    $("#soon").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.classList.contains("card")) openDetail(e.target.dataset.id); });
    $("#more").onclick = () => { shown += CFG.pageSize || 24; render(); };
    $("#list").addEventListener("click", (e) => {
      const f = e.target.closest("[data-fav]"); if (f) { e.stopPropagation(); return toggleFav(f.dataset.fav); }
      const c = e.target.closest(".card"); if (c) openDetail(c.dataset.id);
    });
    $("#list").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.classList.contains("card")) openDetail(e.target.dataset.id); });
    $("#detail").addEventListener("click", (e) => {
      if (e.target.id === "detail" || e.target.closest(".d-close")) return closeDetail();
      const f = e.target.closest("[data-fav]"); if (f) toggleFav(f.dataset.fav);
    });
    $("#detail").addEventListener("cancel", (e) => { e.preventDefault(); closeDetail(); });
    $("#provList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-prov]"); if (!b) return;
      state.prov = b.dataset.prov; shown = CFG.pageSize; buildControls(); render(); $(".results").scrollIntoView({ behavior: "smooth" });
    });
    $$(".lang button").forEach((b) => (b.onclick = () => { lang = b.dataset.lang; store.set("lang", lang); applyI18n(); renderStats(); }));
    $$("[data-nav]").forEach((a) => a.addEventListener("click", (e) => {
      const n = a.dataset.nav;
      if (n === "list" || n === "saved") { e.preventDefault(); onlyFavs = n === "saved"; shown = CFG.pageSize; render(); $("#catalogo").scrollIntoView({ behavior: "smooth" }); }
      $$(".nav a").forEach((x) => x.classList.toggle("on", x === a));
    }));
    window.addEventListener("hashchange", () => { const m = location.hash.match(/^#\/s\/(.+)$/); if (m) openDetail(decodeURIComponent(m[1])); });
  }

  // ---------- data
  async function loadData() {
    meta = await fetch("data/meta.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({}));
    try {
      if (AUTH.enabled) {
        all = await AUTH.loadSubastas();
        isDemo = false;
      } else {
        const d = await fetch("data/subastas.json", { cache: "no-cache" }).then((r) => r.json());
        all = d.subastas || d || [];
        isDemo = !!d.demo;
        if (!meta.actualizado) meta.actualizado = d.generado;
      }
    } catch (e) {
      console.error("data", e);
      all = [];
    }
    all.forEach((s) => {
      s._prov = window.normProvince(s.provincia);
      s._text = [s.id, s.titulo, s.localidad, s.provincia, s.direccion, s.cp, s.autoridad, s.tipo,
        ...(s.bienes || []).map((b) => [b.descripcion, b.ref_catastral, b.matricula].join(" "))]
        .join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    });
  }

  // ---------- boot
  async function boot() {
    $("#brandName").textContent = CFG.name || "SubastaRadar";
    if (CFG.rssUrl) $("#rssLink").href = CFG.rssUrl;
    if (CFG.telegramUrl) { $("#tgLink").href = CFG.telegramUrl; $("#tgLink").hidden = false; }
    $("#favCount").textContent = favs.size;
    if (AUTH.enabled) { try { await AUTH.init(); } catch (e) { console.error(e); } }
    readUrl(); bind(); bindAuth();
    await loadData();
    $("#demoBanner").hidden = !isDemo;
    applyI18n(); renderStats(); checkSaved();
    const m = location.hash.match(/^#\/s\/(.+)$/); if (m) openDetail(decodeURIComponent(m[1]));
    setInterval(() => { if (!document.hidden) render(); }, 60000); // обновить таймеры
  }
  boot();
})();
