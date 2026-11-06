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

  let lang = store.get("lang", CFG.defaultLang || "es");
  let all = [], meta = {}, isDemo = false;
  let shown = CFG.pageSize || 24;
  let favs = new Set(store.get("favs", []));
  let onlyFavs = false;
  let map, mapLayer;

  const state = { q: "", origin: [], cat: "", prov: "", status: "open", min: "", max: "", fresh: "", sort: "new" };

  // ---------- i18n
  const t = (k) => (I18N[lang] && I18N[lang][k]) || (I18N.es[k]) || k;
  function applyI18n() {
    document.documentElement.lang = lang;
    $$("[data-i]").forEach((el) => (el.textContent = t(el.dataset.i)));
    $$("[data-i-ph]").forEach((el) => (el.placeholder = t(el.dataset.iPh)));
    $$(".lang button").forEach((b) => b.classList.toggle("on", b.dataset.lang === lang));
    $("#pMin").placeholder = t("f_min"); $("#pMax").placeholder = t("f_max");
    buildControls();
    render();
  }

  // ---------- formatting
  const locale = () => (lang === "ru" ? "ru-RU" : "es-ES");
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
  const isNew = (s, hours = 24) => s.detectada && (Date.now() - new Date(s.detectada).getTime()) < hours * 36e5;

  // ---------- controls
  function opt(v, label, sel) { return `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(label)}</option>`; }
  function buildControls() {
    $("#fOrigin").innerHTML = ORIGINS.map((o) => `<button type="button" class="chip${state.origin.includes(o) ? " on" : ""}" data-o="${o}">${esc(t("o_" + o))}</button>`).join("");
    const catCounts = count((s) => s.categoria);
    $("#fCat").innerHTML = opt("", t("any"), !state.cat) + CATS.filter((c) => catCounts[c]).map((c) => opt(c, `${t("c_" + c)} (${catCounts[c]})`, state.cat === c)).join("");
    const provCounts = count((s) => s._prov);
    const provs = Object.keys(provCounts).filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
    $("#fProv").innerHTML = opt("", t("any_f"), !state.prov) + provs.map((p) => opt(p, `${title(p)} (${provCounts[p]})`, state.prov === p)).join("");
    $("#fStatus").innerHTML = STATUSES.map((s) => opt(s, s === "open" ? `${t("s_activa")} + ${t("s_proxima")}` : s === "all" ? t("any") : t("s_" + s), state.status === s)).join("");
    $("#fFresh").innerHTML = opt("", t("any_f"), !state.fresh) + opt("24", t("fresh_24"), state.fresh === "24") + opt("168", t("fresh_7"), state.fresh === "168");
    $("#sort").innerHTML = ["new", "end", "price_asc", "price_desc", "discount"].map((s) => opt(s, t("sort_" + s), state.sort === s)).join("");
    $("#q").value = state.q; $("#pMin").value = state.min; $("#pMax").value = state.max;
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
  function card(s) {
    const loc = [title(s.localidad), title(s._prov)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
    const d = disc(s);
    return `<article class="card" data-id="${esc(s.id)}" tabindex="0">
      <button class="fav${favs.has(s.id) ? " on" : ""}" data-fav="${esc(s.id)}" aria-label="fav">${favs.has(s.id) ? "★" : "☆"}</button>
      <div class="card-top">
        ${isNew(s) ? `<span class="tag new">${t("new_badge")}</span>` : ""}
        <span class="tag">${esc(t("o_" + s.origen))}</span>
        <span class="tag">${esc(t("c_" + s.categoria))}</span>
        <span class="st ${s.estado}">${esc(t("s_" + s.estado))}</span>
      </div>
      <h3>${esc(sentence(s.titulo))}</h3>
      <div class="loc">${esc(loc || "—")}</div>
      <div class="money">
        <div><small>${t("value")}</small><span class="v">${eur(s.valor_subasta)}</span></div>
        <div class="right">${d > 0 ? `${t("appraisal")}: ${eur(s.tasacion)}<br>` : ""}${esc(timeLeft(s))}</div>
      </div>
    </article>`;
  }

  function render() {
    const list = sorted(all.filter((s) => matches(s)));
    $("#resCount").textContent = list.length.toLocaleString(locale());
    $("#list").innerHTML = list.length ? list.slice(0, shown).map(card).join("") : `<div class="empty">${onlyFavs ? t("saved_empty") : t("none")}</div>`;
    $("#more").hidden = list.length <= shown;
    renderMap(list);
    renderProvList();
    writeUrl();
  }

  function renderStats() {
    const active = all.filter((s) => ["activa", "proxima"].includes(s.estado)).length;
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
        radius: 7 + 22 * Math.sqrt(n / max), color: sel ? "#1d2433" : "#c4512b", weight: sel ? 3 : 1.5,
        fillColor: "#c4512b", fillOpacity: sel ? .75 : .45
      }).bindTooltip(`${title(p)}: ${n}`).on("click", () => { state.prov = sel ? "" : p; shown = CFG.pageSize; buildControls(); render(); })
        .addTo(mapLayer);
    });
  }

  // ---------- detail
  function openDetail(id) {
    const s = all.find((x) => x.id === id); if (!s) return;
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
        <div class="card-top">${isNew(s) ? `<span class="tag new">${t("new_badge")}</span>` : ""}<span class="tag">${esc(t("o_" + s.origen))}</span><span class="tag">${esc(t("c_" + s.categoria))}</span><span class="st ${s.estado}">${esc(t("s_" + s.estado))}</span></div>
        <h2>${esc(sentence(s.titulo))}</h2>
        <div class="loc">${esc([title(s.localidad), title(s._prov)].filter(Boolean).join(", "))} · ${esc(s.id)}</div>
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
      $(sel).addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => { state[k] = e.target.value; render(); }, 300); }));
    $("#reset").onclick = () => { Object.assign(state, { q: "", origin: [], cat: "", prov: "", status: "open", min: "", max: "", fresh: "", sort: "new" }); onlyFavs = false; shown = CFG.pageSize; buildControls(); render(); };
    $("#saveSearch").onclick = saveSearch;
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
      if (n === "list" || n === "saved") { e.preventDefault(); onlyFavs = n === "saved"; shown = CFG.pageSize; render(); window.scrollTo({ top: $(".layout").offsetTop - 70, behavior: "smooth" }); }
      $$(".nav a").forEach((x) => x.classList.toggle("on", x === a));
    }));
    window.addEventListener("hashchange", () => { const m = location.hash.match(/^#\/s\/(.+)$/); if (m) openDetail(decodeURIComponent(m[1])); });
  }

  // ---------- boot
  async function boot() {
    $("#brandName").textContent = CFG.name || "SubastaRadar";
    $("#brandTag").textContent = CFG.tagline || "";
    if (CFG.rssUrl) $("#rssLink").href = CFG.rssUrl;
    if (CFG.telegramUrl) { $("#tgLink").href = CFG.telegramUrl; $("#tgLink").hidden = false; }
    $("#favCount").textContent = favs.size;
    readUrl(); bind();
    try {
      const [d, m] = await Promise.all([
        fetch("data/subastas.json", { cache: "no-cache" }).then((r) => r.json()),
        fetch("data/meta.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({}))
      ]);
      all = (d.subastas || d || []);
      isDemo = !!d.demo; meta = m || {};
      if (!meta.actualizado) meta.actualizado = d.generado;
    } catch (e) {
      all = window.DEMO_DATA ? window.DEMO_DATA.subastas : [];
      isDemo = !!window.DEMO_DATA; meta = { actualizado: window.DEMO_DATA && window.DEMO_DATA.generado };
    }
    all.forEach((s) => {
      s._prov = window.normProvince(s.provincia);
      s._text = [s.id, s.titulo, s.localidad, s.provincia, s.direccion, s.cp, s.autoridad, s.tipo,
        ...(s.bienes || []).map((b) => [b.descripcion, b.ref_catastral, b.matricula].join(" "))]
        .join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    });
    $("#demoBanner").hidden = !isDemo;
    applyI18n(); renderStats(); checkSaved();
    const m = location.hash.match(/^#\/s\/(.+)$/); if (m) openDetail(decodeURIComponent(m[1]));
    setInterval(() => { if (!document.hidden) render(); }, 60000); // обновить таймеры
  }
  boot();
})();
