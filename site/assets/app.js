(function () {
  "use strict";
  const CFG = window.SITE_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("sr_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("sr_" + k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ } }
  };

  const ORIGINS = ["judicial", "notarial", "hacienda", "seguridad_social", "administracion"];
  const CATS = ["vivienda", "garaje", "trastero", "local", "nave", "solar", "rustica", "inmueble", "vehiculo", "embarcacion", "joyas_arte", "maquinaria", "derechos", "otros"];
  // Группы для режима «Новичок»
  const GROUPS = [
    { id: "vivienda", cats: ["vivienda", "inmueble"], icon: "vivienda" },
    { id: "g_garaje", cats: ["garaje", "trastero"], icon: "garaje" },
    { id: "g_local", cats: ["local", "nave"], icon: "local" },
    { id: "g_terreno", cats: ["solar", "rustica"], icon: "rustica" },
    { id: "g_otros", cats: ["vehiculo", "embarcacion", "joyas_arte", "maquinaria", "derechos", "otros"], icon: "otros" }
  ];
  const STATUSES = ["open", "activa", "proxima", "finalizada", "cancelada", "all"];
  const MODES = ["novato", "inversor", "pro"];
  const PRICES = [25000, 50000, 100000, 150000, 250000, 500000, 1000000];
  const DEFAULTS = { q: "", origin: [], cat: "", prov: "", status: "open", min: "", max: "", fresh: "", sort: "end", norisk: "" };

  const LANGS = ["es", "en", "ru"];
  const browserLang = ((navigator.language || "").slice(0, 2) || "").toLowerCase();
  let lang = store.get("lang", null) || (LANGS.includes(browserLang) ? browserLang : (CFG.defaultLang || "es"));
  if (!LANGS.includes(lang)) lang = "es";
  { const ul = new URLSearchParams(location.search).get("l"); if (LANGS.includes(ul)) { lang = ul; store.set("lang", ul); } } // ссылки со страниц провинций

  let mode = store.get("mode", null) || CFG.defaultMode || "novato";
  if (!MODES.includes(mode)) mode = "novato";

  let all = [], meta = {}, isDemo = false, newShare = 0;
  let shown = CFG.pageSize || 24;
  let favs = new Set(store.get("favs", []));
  let onlyFavs = false;
  let selected = null;           // выбранный аукцион (таблица / список Про)
  let current = [];              // текущий отфильтрованный список
  let map, mapLayer;
  let hist = null, histIdx = null, histLoading = null;   // архив завершённых (data/historico)
  // Без полного доступа по умолчанию показываем и завершённые аукционы (их список открыт всем)
  let statusTouched = false;
  const defStatus = () => (locked() ? "all" : "open");
  // Тариф пользователя: novato < inversor < pro. В открытом режиме (без Supabase) — всё
  const TIERS = ["novato", "inversor", "pro"];
  function tier() {
    if (!AUTH.enabled) return "pro";
    if (locked() || !(AUTH.user && AUTH.user())) return "";
    const st = AUTH.status || {};
    if (st.trusted) return "pro";
    const m = Array.isArray(st.allowed_modes) ? st.allowed_modes : TIERS;
    return m.includes("pro") ? "pro" : m.includes("inversor") ? "inversor" : "novato";
  }
  const atLeast = (n) => TIERS.indexOf(tier()) >= TIERS.indexOf(n);
  const histView = () => ["finalizada", "cancelada", "all"].includes(state.status);
  const done = (s) => ["finalizada", "cancelada", "suspendida"].includes(s.estado);
  const state = Object.assign({}, DEFAULTS, { origin: [] });

  const AUTH = window.Auth || { enabled: false, hasAccess: () => true, user: () => null };
  const narrow = () => window.matchMedia("(max-width:760px)").matches;
  const locked = () => AUTH.enabled && !AUTH.hasAccess();

  // ---------- i18n
  const t = (k, vars) => {
    let v = (I18N[lang] && I18N[lang][k]) || (I18N.es[k]) || k;
    if (vars) Object.keys(vars).forEach((n) => { v = v.split("{" + n + "}").join(vars[n]); });
    return v;
  };
  const locale = () => ({ ru: "ru-RU", en: "en-GB", es: "es-ES" }[lang] || "es-ES");
  const num = (v) => Number(v).toLocaleString(locale());
  const eur = (v) => v == null ? "—" : new Intl.NumberFormat(locale(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  const dateFmt = (iso, withYear) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString(locale(), { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit" });
  };
  const day = (d) => { if (!d) return "—"; const x = new Date(d + (String(d).length === 10 ? "T12:00:00" : "")); return isNaN(x) ? d : x.toLocaleDateString(locale(), { day: "2-digit", month: "2-digit", year: "numeric" }); };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sentence = (s) => { s = String(s || ""); if (s !== s.toUpperCase()) return s; s = s.toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
  // Названия мест: исправляем битую кодировку BOE и испанские/каталанские служебные слова
  const LOWER = new Set(["de", "del", "la", "las", "los", "el", "y", "i", "en", "les", "dels", "da", "do"]);
  function place(s) {
    s = String(s || "").replace(/\b([LD])\s?¿\s?/g, "$1'").replace(/¿/g, "'");
    return s.toLowerCase().split(/(\s+|-|\/|\()/).map((w, i) => {
      if (!w.trim() || /^(\s+|-|\/|\()$/.test(w)) return w;
      if (i > 0 && LOWER.has(w)) return w;
      if (/^[ld]'/.test(w)) return w.charAt(0).toUpperCase() + "'" + w.charAt(2).toUpperCase() + w.slice(3);
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join("");
  }

  // ---------- icons
  const ICONS = {
    "chev-l": '<path d="M15 5l-7 7 7 7"/>', "chev-r": '<path d="M9 5l7 7-7 7"/>',
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
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    door: '<path d="M5 21V4h11v17"/><path d="M3 21h18"/><circle cx="13" cy="12.5" r=".8"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    file: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5a3 3 0 00-3-1.5c-1.7 0-3 1-3 2.2 0 2.8 6 1.6 6 4.4 0 1.3-1.3 2.4-3 2.4a3.2 3.2 0 01-3-1.7M12 6v2M12 16v2"/>',
    ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v6H4V5h6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>'
  };
  ICONS.inmueble = ICONS.inmueble || ICONS.vivienda;
  const ic = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.otros}</svg>`;

  // ---------- риски: разбор полей BOE
  const MONEY = /(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)\s*€/;
  const asset0 = (s) => (s.bienes || [])[0] || {};
  function riskOf(s) {
    const b = asset0(s);
    const pos = String(b.situacion_posesoria || ""), vis = String(b.visitable || ""), car = String(b.cargas || "");
    let occ;
    if (/sin ocupantes/i.test(pos)) occ = { tone: "ok", key: "occ_free" };
    else if (/ocupantes sin derecho/i.test(pos)) occ = { tone: "bad", key: "occ_illegal" };
    else if (/ocupantes con derecho|arrendat|inquilin/i.test(pos)) occ = { tone: "bad", key: "occ_legal" };
    else if (/vivienda habitual/i.test(pos)) occ = { tone: "warn", key: "occ_home" };
    else occ = { tone: "warn", key: "occ_unknown" };
    // отдельное поле BOE «Vivienda habitual: Sí» — жильё должника, выселение может затянуться
    if (/^s[ií]/i.test(String(b.vivienda_habitual || "")) && occ.tone !== "bad") occ = { tone: "warn", key: "occ_home" };
    let visit;
    if (/^s[ií]/i.test(vis)) visit = { tone: "ok", key: "vis_yes" };
    else if (/^no consta/i.test(vis) || !vis) visit = { tone: "warn", key: "vis_unknown" };
    else visit = { tone: "warn", key: "vis_no" };
    let charges;
    const m = car.match(MONEY);
    const amount = m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : null;
    if (amount != null && amount > 0) charges = { tone: "bad", key: "car_amount", amount };
    else if (amount === 0 || /sin cargas|libre de cargas/i.test(car)) charges = { tone: "ok", key: "car_none" };
    else if (car.trim()) charges = { tone: "n", key: "car_text", text: car };
    else charges = { tone: "warn", key: "car_missing" };
    const bad = [occ, visit, charges].filter((r) => r.tone === "bad").length;
    const unknown = [occ, visit, charges].filter((r) => r.tone === "warn").length;
    return { occ, visit, charges, bad, unknown, score: bad * 3 + unknown, applies: !["vehiculo", "embarcacion", "maquinaria", "derechos", "joyas_arte"].includes(s.categoria) };
  }
  function riskPill(r, small) {
    const icon = { occ: "door", visit: "eye", charges: "file" };
    const parts = [["occ", r.occ], ["visit", r.visit], ["charges", r.charges]];
    // В таблице — только важное: плохие и хорошие признаки, а «нет данных» одной плашкой
    const html = parts.filter(([, x]) => !(small && (x.tone === "n" || x.tone === "warn"))).map(([k, x]) => {
      const label = x.key === "car_amount" ? t("pill_car_amount", { amount: eur(x.amount) }) : t("pill_" + x.key);
      return `<span class="rp ${x.tone}${small ? " sm" : ""}">${small ? "" : ic(icon[k])}${esc(label)}</span>`;
    }).join("");
    return html + (small && r.unknown ? `<span class="rp warn sm">${esc(t("pill_unknown_n", { n: r.unknown }))}</span>` : "");
  }

  // ---------- автомобиль: марка, модель, год (из полей BOE или из описания)
  const capWords = (x) => String(x || "").trim().split(/\s+/)
    .filter((w, i, arr) => i === 0 || w.toLowerCase() !== arr[i - 1].toLowerCase())
    .map((w) => /[\d.]/.test(w) || w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  function vehicleName(s) {
    if (s.categoria !== "vehiculo") return "";
    const b = asset0(s);
    let name = b.marca ? [b.marca, b.modelo].filter(Boolean).join(" ") : "", m;
    if (!name) {
      let x = String(b.descripcion || s.titulo || "").replace(/\s+/g, " ");
      if ((m = x.match(/marca\s+y\s+modelo[:\s]+(.+)/i))) x = m[1];
      else if ((m = x.match(/marca[:\s]+([^,.;]+?)\s*[,.;]?\s*modelo[:\s]+([^,;]+)/i))) x = m[1] + " " + m[2];
      x = x.replace(/\b(matr[ií]cula|bastidor|de color|color|valor de uso)\b.*$/i, "")
        .replace(/\b\d{4}\s?[A-Z]{3}\b/g, " ")
        .replace(/^(bien|descripci[oó]n)\s*:\s*/i, "")
        .replace(/\b(veh[ií]culo|turismo|nacional\/importac|motocicleta|sin sidecar|tractocami[oó]n|mixto adaptable|cami[oó]n|furgoneta|marca|modelo)\b:?/gi, " ")
        .replace(/[:,]/g, " ").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
      name = x.split(" ").slice(0, 5).join(" ");
    }
    if (!name || name.length > 45) return "";
    const year = String(b.fecha_matriculacion || "").match(/(19|20)\d\d/);
    return capWords(name) + (year ? " · " + year[0] : "");
  }
  const what = (s) => vehicleName(s) || t("c_" + (s.oculta ? "vivienda" : s.categoria));

  // ---------- вид объекта: фото BOE → фасад Кадастра → Google Maps
  const NO_MAP = ["vehiculo", "embarcacion", "maquinaria", "derechos", "joyas_arte"];
  function cleanAddress(a) {
    return String(a || "").replace(/\bn[º°o]\.?\s*/gi, "")
      .replace(/,?\s*\b(esc(alera)?\.?|planta|pl\.|puerta|pta\.?|piso|bajo|bloque|portal|local|apartamento|plaza\s+\d|letra)\b.*$/i, "")
      .replace(/\s+/g, " ").trim();
  }
  function mapQuery(s) {
    if (NO_MAP.includes(s.categoria)) return "";
    const b = asset0(s);
    const addr = cleanAddress(s.direccion || b.direccion);
    const parts = [addr, s.cp || b.cp, place(s.localidad || b.localidad), place((s.provincia || b.provincia || "").split("/")[0])].filter(Boolean);
    return parts.length ? { q: parts.join(", ") + ", España", exact: !!addr } : "";
  }
  const gmapEmbed = (m) => `https://maps.google.com/maps?q=${encodeURIComponent(m.q)}&t=k&z=${m.exact ? 19 : 13}&hl=${lang}&output=embed`;
  const gmapLink = (m) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.q)}`;
  function cadastreRef(s) {
    for (const b of s.bienes || []) {
      const rc = String(b.ref_catastral || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
      if (rc.length >= 14) return rc.slice(0, 14);
    }
    return "";
  }
  const facadeUrl = (rc) => `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/OVCFotoFachada.svc/RecuperarFotoFachadaGet?ReferenciaCatastral=${rc}`;
  // Точное место по координатам Катастро — только в тарифе Про
  const exact = (s) => (atLeast("pro") && s._pro && s._pro.lat) ? s._pro : null;
  // Street View: панорама с улицы, камера повёрнута на объект. Нужен ключ Maps Embed API (бесплатно, без лимита)
  const svKey = () => (window.SITE_CONFIG || {}).mapsEmbedKey || "";
  const svEmbed = (ex, heading, pano) => `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(svKey())}&${pano ? `pano=${encodeURIComponent(pano)}` : `location=${ex.lat},${ex.lon}`}&fov=80&pitch=5${heading != null ? `&heading=${Math.round(heading)}` : ""}&language=${lang}`;
  function photoSlides(s) {
    const where = place(s.localidad) || place(s._prov);
    const out = (s.fotos || []).map((src) => {
      const air = /aereo-pnoa/.test(src);
      return { src, alt: air ? t("map_of", { place: where }) : t("photo_boe"), tag: air ? "© IGN-PNOA · Catastro" : /\/storage\/v1\/object\/public\/fotos\//.test(src) ? t("src_docs") : "BOE" };
    });
    const rc = cadastreRef(s);
    if (rc && !NO_MAP.includes(s.categoria)) out.push({ src: facadeUrl(rc), alt: t("photo_cadastre") + " · " + where, tag: t("src_cadastre") });
    return out;
  }
  function media(s, big) {
    const ex = exact(s);
    const m = ex ? { q: `${ex.lat},${ex.lon}`, exact: true } : mapQuery(s);
    const cls = big ? "c-media big" : "c-media";
    const where = place(s.localidad) || place(s._prov);
    const fb = m ? ` data-map="${esc(gmapEmbed(m))}" data-title="${esc(t("map_of", { place: where }))}"` : "";
    const slides = photoSlides(s).map((x, i) => `<figure class="car-s"><img src="${esc(x.src)}" loading="${i ? "lazy" : big ? "eager" : "lazy"}" alt="${esc(x.alt)}"${fb}><span class="m-tag">${esc(x.tag)}</span></figure>`);
    if (big && ex && svKey() && !NO_MAP.includes(s.categoria)) slides.push(`<figure class="car-s sv"><iframe data-sv="${ex.lat},${ex.lon}" data-r="${["solar", "rustica"].includes(s.categoria) ? 250 : 60}" src="${esc(svEmbed(ex))}" loading="lazy" title="${esc(t("sv_title", { place: where }))}" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe><span class="m-tag">Google Street View</span></figure>`);
    if (slides.length > 1) return `<div class="${cls} car"${fb}><div class="car-track" tabindex="0"${big ? "" : ` data-open="${esc(s.id)}"`} aria-label="${esc(t("photos_n", { n: slides.length }))}">${slides.join("")}</div>
      <button type="button" class="car-btn prev" data-car="-1" aria-label="${esc(t("prev_photo"))}" hidden>${ic("chev-l")}</button><button type="button" class="car-btn next" data-car="1" aria-label="${esc(t("next_photo"))}">${ic("chev-r")}</button><span class="car-count">1 / ${slides.length}</span></div>`;
    if (slides.length === 1) return `<div class="${cls}"${fb}>${slides[0].replace(/^<figure class="car-s[^"]*">|<\/figure>$/g, "")}</div>`;
    if (m) return `<div class="${cls}"><iframe src="${esc(gmapEmbed(m))}" loading="lazy" title="${esc(t("map_of", { place: where }))}" tabindex="-1" referrerpolicy="no-referrer-when-downgrade"></iframe><span class="m-tag">Google Maps</span></div>`;
    return `<div class="${cls} m-empty">${ic(s.categoria)}</div>`;
  }
  // карусель: только ручная прокрутка — стрелки, свайп, клавиши
  function carSync(track) {
    const box = track.closest(".car"); if (!box) return;
    const n = track.children.length, i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const c = box.querySelector(".car-count"); if (c) c.textContent = `${Math.min(i + 1, n)} / ${n}`;
    const pr = box.querySelector(".prev"), nx = box.querySelector(".next");
    if (pr) pr.hidden = i <= 0; if (nx) nx.hidden = i >= n - 1;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-car]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const tr = b.closest(".car").querySelector(".car-track");
    tr.scrollBy({ left: +b.dataset.car * tr.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, true);
  document.addEventListener("scroll", (e) => { if (e.target.classList && e.target.classList.contains("car-track")) carSync(e.target); }, true);
  document.addEventListener("keydown", (e) => {
    if (!e.target.classList || !e.target.classList.contains("car-track") || !/Arrow(Left|Right)/.test(e.key)) return;
    e.preventDefault(); e.target.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * e.target.clientWidth });
  });
  // камера Street View — на объект: ближайшая панорама из бесплатного Metadata API, курс считаем сами
  async function svAim(root) {
    for (const fr of root.querySelectorAll("iframe[data-sv]")) {
      const [la, lo] = fr.dataset.sv.split(",").map(Number); fr.removeAttribute("data-sv");
      const rad = +fr.dataset.r || 60; // у участков и земли дорога бывает дальше — ищем панораму в большем радиусе
      try {
        const r = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${la},${lo}&radius=${rad}&source=outdoor&key=${encodeURIComponent(svKey())}`);
        const d = await r.json();
        if (d.status !== "OK") { const f = fr.closest(".car-s"); const tr = f && f.parentElement; if (f) f.remove(); if (tr) carSync(tr); continue; }
        const y = (la - d.location.lat) * Math.PI / 180, p1 = d.location.lat * Math.PI / 180, p2 = la * Math.PI / 180, dl = (lo - d.location.lng) * Math.PI / 180;
        const h = (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * 180 / Math.PI + 360) % 360;
        // та самая панорама, от которой считали курс, — иначе Google может подставить соседнюю
        if (y || dl) fr.src = svEmbed({ lat: la, lon: lo }, h, /google/i.test(d.copyright || "") ? d.pano_id : null);
      } catch (err) { /* без курса панорама всё равно откроется */ }
    }
  }
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!img || img.tagName !== "IMG" || !img.closest(".c-media")) return;
    const box = img.closest(".c-media");
    const slide = img.closest(".car-s");
    if (slide && box.querySelectorAll(".car-s").length > 1) { const tr = slide.parentElement; slide.remove(); carSync(tr); if (tr.children.length === 1) { box.querySelectorAll(".car-btn,.car-count").forEach((x) => x.remove()); } return; }
    if (img.dataset.map) box.innerHTML = `<iframe src="${img.dataset.map}" loading="lazy" title="${img.dataset.title || "Google Maps"}" tabindex="-1"></iframe><span class="m-tag">Google Maps</span>`;
    else { box.classList.add("m-empty"); box.innerHTML = ""; }
  }, true);
  document.addEventListener("load", (e) => {
    const img = e.target;
    if (img && img.tagName === "IMG" && img.closest(".c-media") && img.naturalWidth > 0 && img.naturalWidth < 60) img.dispatchEvent(new Event("error"));
  }, true);

  // ---------- время и цифры
  function left(s) {
    const now = Date.now();
    const start = s.fecha_inicio ? new Date(s.fecha_inicio).getTime() : null;
    const end = s.fecha_fin ? new Date(s.fecha_fin).getTime() : null;
    if (start && start > now) { const d = Math.ceil((start - now) / 864e5); return { hot: false, short: t("opens_in", { n: d }), long: t("opens_in", { n: d }) }; }
    if (!end) return { hot: false, short: "—", long: "" };
    if (end <= now) return { hot: false, short: t("s_finalizada"), long: t("s_finalizada") };
    const ms = end - now, d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5);
    if (d >= 1) return { hot: d < 3, short: t("d_short", { n: d }), long: d === 1 ? t("day_left_1") : t("days_left", { n: d }) };
    return { hot: true, short: t("h_short", { n: Math.max(h, 1) }), long: t("hours_left", { n: Math.max(h, 1) }) };
  }
  const disc = (s) => (s.tasacion && s.valor_subasta && s.tasacion > s.valor_subasta) ? Math.round((1 - s.valor_subasta / s.tasacion) * 100) : 0;
  const isNew = (s) => !s.historico && !done(s) && newShare < 0.3 && s.detectada && (Date.now() - new Date(s.detectada).getTime()) < 864e5;
  // «Добавлено сегодня» — по календарю Мадрида, а не последние 24 часа
  const madridDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  const FRESH_OLD = { "24": "today", "168": "7" };   // старые сохранённые поиски
  function freshOk(s, f) {
    f = FRESH_OLD[f] || f;
    if (!f) return true;
    if (!s.detectada) return false;
    if (f === "today") return madridDay(s.detectada) === madridDay(Date.now());
    return Date.now() - new Date(s.detectada).getTime() < +f * 864e5;
  }
  const addedLine = (s) => s.detectada && !s.historico ? t("added_at", { d: dateFmt(s.detectada) }) : "";
  const cancelledEarly = (s) => ["cancelada", "suspendida"].includes(s.estado);
  const depPct = (s) => (s.deposito && s.valor_subasta) ? Math.round((s.deposito / s.valor_subasta) * 100) : null;

  // ---------- фильтрация
  function matches(s, st = state) {
    if (onlyFavs && !favs.has(s.id)) return false;
    if (st.origin.length && !st.origin.includes(s.origen)) return false;
    if (st.cat === "oculta") { if (!s.oculta) return false; }
    else if (st.cat) { const g = GROUPS.find((x) => x.id === st.cat); if (g ? !(g.cats.includes(s.categoria) || (g.id === "vivienda" && s.oculta)) : s.categoria !== st.cat) return false; }
    if (st.prov && s._prov !== st.prov) return false;
    if (st.status === "open" && !["activa", "proxima"].includes(s.estado)) return false;
    if (!["open", "all"].includes(st.status) && s.estado !== st.status) return false;
    const v = s.valor_subasta;
    if (st.min !== "" && (v == null || v < +st.min)) return false;
    if (st.max !== "" && (v == null || v > +st.max)) return false;
    if (st.fresh && !freshOk(s, st.fresh)) return false;
    if (st.norisk && (s._risk.bad || s._risk.unknown > 1)) return false;
    if (st.q) {
      const words = st.q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(Boolean);
      if (!words.every((w) => s._text.includes(w))) return false;
    }
    return true;
  }
  function sorted(list) {
    const by = {
      end: histView() ? (a, b) => (b.fecha_fin || "").localeCompare(a.fecha_fin || "") : (a, b) => (a.fecha_fin || "9").localeCompare(b.fecha_fin || "9"),
      bid_ratio: (a, b) => (ratio(a) ?? 9) - (ratio(b) ?? 9),
      new: (a, b) => (b.detectada || "").localeCompare(a.detectada || "") || (b.fecha_inicio || "").localeCompare(a.fecha_inicio || ""),
      price_asc: (a, b) => (a.valor_subasta ?? 1e15) - (b.valor_subasta ?? 1e15),
      price_desc: (a, b) => (b.valor_subasta ?? -1) - (a.valor_subasta ?? -1),
      discount: (a, b) => disc(b) - disc(a),
      deposit: (a, b) => (a.deposito ?? 1e15) - (b.deposito ?? 1e15),
      risk: (a, b) => a._risk.score - b._risk.score || (a.fecha_fin || "9").localeCompare(b.fecha_fin || "9")
    }[state.sort] || ((a, b) => 0);
    return list.slice().sort(by);
  }
  // Итог торгов: максимальная ставка и её доля от стоимости
  const ratio = (s) => (s.puja_maxima && s.valor_subasta) ? s.puja_maxima / s.valor_subasta : null;
  function result(s) {
    if (!done(s)) return null;
    if (s.estado === "cancelada") return { tone: "n", label: t("s_cancelada") };
    if (s.puja_maxima) { const q = ratio(s); return { tone: "ok", label: eur(s.puja_maxima), pct: q ? Math.round(q * 100) : null }; }
    if (s.sin_pujas) return { tone: "warn", label: t("hist_no_bids") };
    return s.historico ? { tone: "n", label: "—" } : null;
  }
  const resultLine = (q) => q ? `<b class="res ${q.tone}">${esc(q.label)}</b>${q.pct ? `<small>${esc(t("hist_pct", { p: q.pct }))}</small>` : ""}` : "";
  function count(fn, list = all) { const o = {}; list.forEach((s) => { const k = fn(s); if (k != null) o[k] = (o[k] || 0) + 1; }); return o; }
  const openNow = () => all.filter((s) => ["activa", "proxima"].includes(s.estado));

  // ---------- элементы управления
  const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(label)}</option>`;
  function buildControls() {
    const catCounts = count((s) => (s.oculta ? null : s.categoria), openNow());
    const nHidden = openNow().filter((s) => s.oculta).length;
    const base = locked() && meta.por_categoria ? meta.por_categoria : catCounts;
    $("#segs").setAttribute("aria-label", t("f_category"));
    $("#segs").innerHTML = `<button type="button" class="seg" data-cat="" aria-pressed="${!state.cat}">${esc(t("all_types"))}</button>` +
      GROUPS.map((g) => {
        const n = g.cats.reduce((a, c) => a + (base[c] || 0), 0) + (g.id === "vivienda" ? nHidden : 0);
        if (!n) return "";
        const seg = `<button type="button" class="seg" data-cat="${g.id}" aria-pressed="${state.cat === g.id}">${ic(g.icon)}${esc(t("grp_" + g.id))}<em>${num(n)}</em></button>`;
        return g.id === "vivienda" && nHidden ? seg + `<button type="button" class="seg seg-hid" data-cat="oculta" aria-pressed="${state.cat === "oculta"}" title="${esc(t("hid_tip"))}">${ic("vivienda")}${esc(t("grp_oculta"))}<em>${num(nHidden)}</em></button>` : seg;
      }).join("");
    const isGroup = GROUPS.some((g) => g.id === state.cat && g.cats.length > 1);
    $("#fCat").innerHTML = opt("", t("all_types"), !state.cat) +
      (isGroup ? opt(state.cat, t("grp_" + state.cat), true) : "") + (state.cat === "oculta" ? opt("oculta", t("grp_oculta"), true) : "") +
      CATS.filter((c) => base[c]).map((c) => opt(c, `${t("c_" + c)} · ${num(base[c])}`, state.cat === c)).join("");
    const provCounts = count((s) => s._prov || null, openNow());
    const provs = Object.keys(provCounts).sort((a, b) => a.localeCompare(b, "es"));
    $("#fProv").innerHTML = opt("", t("all_spain"), !state.prov) + provs.map((p) => opt(p, `${place(p)} · ${provCounts[p]}`, state.prov === p)).join("");
    const preset = PRICES.map(String).includes(String(state.max));
    $("#fPrice").innerHTML = opt("", t("any_price"), state.max === "") + PRICES.map((v) => opt(String(v), t("upto", { v: eur(v) }), String(state.max) === String(v))).join("")
      + (state.max !== "" && !preset ? opt(String(state.max), t("upto", { v: eur(+state.max) }), true) : "");
    $("#fOrigin").innerHTML = ORIGINS.map((o) => `<button type="button" class="chip" data-o="${o}" aria-pressed="${state.origin.includes(o)}">${esc(t("o_" + o))}</button>`).join("");
    $("#fStatus").innerHTML = STATUSES.map((s) => opt(s, s === "open" ? t("st_open") : s === "all" ? t("any") : t("s_" + s), state.status === s)).join("");
    state.fresh = FRESH_OLD[state.fresh] || state.fresh;
    $("#fFresh").innerHTML = opt("", t("any_f"), !state.fresh) + ["today", "3", "7", "30"].map((f) => opt(f, t("fresh_" + f), state.fresh === f)).join("");
    const sorts = histView() ? ["end", "price_asc", "price_desc", "bid_ratio"] : mode === "novato" ? ["end", "new", "price_asc", "price_desc", "risk"] : ["end", "new", "price_asc", "price_desc", "discount", "deposit", "risk"];
    if (!sorts.includes(state.sort)) state.sort = "end";
    $("#sort").innerHTML = sorts.map((s) => opt(s, t("sort_" + s), state.sort === s)).join("");
    $("#q").value = state.q; $("#pMin").value = state.min; $("#pMax").value = state.max; $("#fRisk").checked = !!state.norisk;
    const adv = (state.origin.length ? 1 : 0) + (state.status !== defStatus() ? 1 : 0) + (state.fresh ? 1 : 0) + (state.min !== "" ? 1 : 0) + (state.norisk ? 1 : 0);
    $("#advCount").textContent = adv; $("#advCount").hidden = !adv;
  }

  // Активные фильтры — снимаются одним нажатием
  function activeChips() {
    const chips = [];
    const x = ic("x");
    if (state.q) chips.push(["q", `“${state.q}”`]);
    if (state.cat) chips.push(["cat", GROUPS.some((g) => g.id === state.cat) || state.cat === "oculta" ? t("grp_" + state.cat) : t("c_" + state.cat)]);
    if (state.prov) chips.push(["prov", place(state.prov)]);
    if (state.min !== "" || state.max !== "") chips.push(["price", state.min !== "" && state.max !== "" ? `${eur(+state.min)} – ${eur(+state.max)}` : state.max !== "" ? t("upto", { v: eur(+state.max) }) : t("from", { v: eur(+state.min) })]);
    state.origin.forEach((o) => chips.push(["origin:" + o, t("o_" + o)]));
    if (state.status !== defStatus()) chips.push(["status", state.status === "all" ? t("st_all") : t("s_" + state.status)]);
    if (state.fresh) chips.push(["fresh", t("fresh_" + (FRESH_OLD[state.fresh] || state.fresh))]);
    if (state.norisk) chips.push(["norisk", t("f_norisk")]);
    if (onlyFavs) chips.push(["favs", t("nav_saved")]);
    $("#active").innerHTML = chips.map(([k, l]) => `<button type="button" class="a-chip" data-rm="${esc(k)}" aria-label="${esc(t("remove_filter", { f: l }))}">${esc(l)}${x}</button>`).join("")
      + (chips.length > 1 ? `<button type="button" class="a-chip clear" data-rm="*">${esc(t("clear_all"))}</button>` : "");
    $("#clearFilters").hidden = !chips.length;
  }
  function removeFilter(k) {
    if (k === "*") { Object.assign(state, DEFAULTS, { origin: [], sort: state.sort, status: defStatus() }); onlyFavs = false; }
    else if (k === "q") state.q = "";
    else if (k === "cat") state.cat = "";
    else if (k === "prov") state.prov = "";
    else if (k === "price") { state.min = ""; state.max = ""; }
    else if (k.startsWith("origin:")) state.origin = state.origin.filter((o) => o !== k.slice(7));
    else if (k === "favs") onlyFavs = false;
    else if (k === "status") state.status = defStatus();
    else state[k] = DEFAULTS[k];
    shown = CFG.pageSize; buildControls(); render();
  }

  // Заголовок, который описывает выбор: «264 viviendas hasta 150.000 €, en toda España»
  function resultTitle(n) {
    if (onlyFavs) return t("title_favs");
    const what = state.cat ? (GROUPS.some((g) => g.id === state.cat) || state.cat === "oculta" ? t("grp_" + state.cat) : t("c_" + state.cat)) : t("title_any");
    const where = state.prov ? t("in_place", { p: place(state.prov) }) : t("in_spain");
    const price = state.max !== "" ? " · " + t("upto", { v: eur(+state.max) }) : "";
    const st = histView() ? " · " + (state.status === "all" ? t("st_all") : t("title_" + state.status)) : "";
    return `${what}${price} · ${where}${st}`;
  }

  // ---------- карточки и строки
  const favBtn = (s) => { const on = favs.has(s.id); return `<button type="button" class="fav" data-fav="${esc(s.id)}" aria-pressed="${on}" aria-label="${esc(on ? t("fav_del") : t("fav_add"))}">${ic("star")}</button>`; };
  function novCard(s) {
    const city = place(s.localidad) || place(s._prov) || "—";
    const l = left(s), r = s._risk;
    return `<article class="n-card${cancelledEarly(s) ? " is-off" : ""}">
      ${isNew(s) ? `<span class="new-flag">${esc(t("new_badge"))}</span>` : ""}
      ${locked() && done(s) ? `<div class="c-media m-empty">${ic(s.categoria)}</div>` : media(s)}
      <div class="n-body">
        <div class="n-head"><div><h3><a href="#/s/${encodeURIComponent(s.id)}" data-open="${esc(s.id)}">${esc(city === "—" ? what(s) : t("card_title", { what: what(s), city }))}</a></h3>
          <span class="n-sub">${esc([place(s._prov) !== city ? place(s._prov) : "", t("origin_" + s.origen)].filter(Boolean).join(" · "))}</span>${addedLine(s) ? `<span class="n-added">${esc(addedLine(s))}</span>` : ""}${s.oculta ? `<span class="hid-tag">${esc(t("hid_card", { t: s.oculta }))}</span>` : ""}</div>
          ${favBtn(s)}</div>
        ${r.applies ? `<div class="risk">${riskPill(r)}${s._inv && s._inv.valoracion && s._inv.valoracion.descuento > 0 && !done(s) ? `<span class="rp ok">${esc(t("mk_pill", { p: s._inv.valoracion.descuento }))}</span>` : ""}</div>` : ""}
        <div class="n-foot">
          <div class="n-price"><small>${esc(done(s) ? t("value") : t("start_price"))}</small><b>${eur(s.valor_subasta)}</b>${s.deposito && !done(s) ? `<span>${esc(t("deposit_needed", { v: eur(s.deposito) }))}</span>` : ""}</div>
          ${cancelledEarly(s) ? `<div class="n-when"><span>${esc(t("off_was", { d: dateFmt(s.fecha_fin) }))}</span><b class="off">${esc(t("off_" + s.estado))}</b></div>`
          : done(s) ? `<div class="n-when n-res"><span>${esc(t("ended_on", { d: day(s.fecha_fin) }))} · ${esc(t("col_bid"))}</span>${resultLine(result(s)) || "—"}</div>`
          : `<div class="n-when"><span>${esc(t("closes_on", { d: dateFmt(s.fecha_fin) }))}</span><b class="${l.hot ? "hot" : ""}">${esc(l.long)}</b></div>`}
        </div>
      </div>
    </article>`;
  }
  function tableRow(s) {
    const city = place(s.localidad) || place(s._prov) || "—";
    const l = left(s), d = disc(s), sel = selected === s.id;
    return `<tr data-id="${esc(s.id)}" aria-selected="${sel}">
      <td><span class="who">${ic(s.categoria)}<button type="button" data-open="${esc(s.id)}"><b>${esc(city)}</b><small>${esc(what(s))} · ${esc(place(s._prov))}</small></button></span></td>
      <td>${esc(t("o_" + s.origen))}</td>
      <td class="num"><b>${eur(s.valor_subasta)}</b></td>
      <td class="num">${s.tasacion ? eur(s.tasacion) : "—"}</td>
      <td class="num">${d ? `<span class="d-good">−${d}%</span>` : "—"}${s._inv && s._inv.valoracion && s._inv.valoracion.descuento != null ? `<small class="mk ${s._inv.valoracion.descuento > 0 ? "d-good" : ""}">${esc(t("mk_short", { p: (s._inv.valoracion.descuento > 0 ? "−" : "+") + Math.abs(s._inv.valoracion.descuento) }))}</small>` : ""}</td>
      ${histView() ? `<td class="num">${resultLine(result(s)) || "—"}</td><td class="num">${day(s.fecha_fin)}</td>`
      : `<td class="num">${eur(s.deposito)}</td><td class="num"><span class="${l.hot ? "hot" : ""}">${esc(l.short)}</span></td>`}
      <td>${s._risk.applies ? `<span class="risk">${riskPill(s._risk, true)}</span>` : ""}${s._inv && s._inv.pujas && !done(s) ? `<span class="rp sm ${s._inv.pujas === "con_pujas" ? "warn" : "ok"}">${esc(t("bids_" + s._inv.pujas))}</span>` : ""}</td>
      <td>${favBtn(s)}</td>
    </tr>`;
  }
  function proRow(s) {
    const city = place(s.localidad) || place(s._prov) || "—";
    const l = left(s);
    const bad = s._risk.applies && s._risk.bad > 0;
    return `<button type="button" class="p-row" data-open="${esc(s.id)}" aria-selected="${selected === s.id}">
      <span class="p-thumb">${ic(s.categoria)}</span>
      <span class="p-mid"><b>${esc(city)}</b><small>${esc(what(s))} · ${esc(t("o_" + s.origen))}</small>
        ${done(s) ? `<small>${esc(t("ended_on", { d: day(s.fecha_fin) }))}</small>` : `<small class="${l.hot ? "hot" : ""}" style="${l.hot ? "color:var(--bad);font-weight:600" : ""}">${esc(t("closes_short", { d: dateFmt(s.fecha_fin) }))} · ${esc(l.short)}${bad ? " · " + esc(t("risk_high")) : ""}</small>`}</span>
      <span class="p-end"><b>${eur(s.valor_subasta)}</b>${done(s) ? `<small>${esc(t("col_bid"))}: ${esc((result(s) || {}).label || "—")}</small>` : `<small>${esc(t("deposit"))} ${eur(s.deposito)}</small>`}${disc(s) ? `<small style="color:var(--ok);font-weight:700">−${disc(s)}%</small>` : ""}${s._inv && s._inv.valoracion && s._inv.valoracion.descuento > 0 ? `<small style="color:var(--ok)">${esc(t("mk_short", { p: "−" + s._inv.valoracion.descuento }))}</small>` : ""}</span>
    </button>`;
  }

  // ---------- рендер
  function hiddenCount() { return Math.max(0, (meta.actuales || 0) - openNow().length); }
  function lockedBlock() {
    const hidden = hiddenCount();
    if (!locked() || !hidden || onlyFavs) return "";
    const u = AUTH.user && AUTH.user();
    return `<div class="locked-row"><span><b>${esc(t("locked_card", { n: num(hidden) }))}</b></span><button type="button" class="btn" data-locked="1">${esc(u ? t("lock_cta_user") : t("lock_cta_guest"))}</button></div>`;
  }
  function emptyBlock() {
    const blockers = [];
    if (state.q) blockers.push(`“${state.q}”`);
    if (state.cat) blockers.push(GROUPS.some((g) => g.id === state.cat) || state.cat === "oculta" ? t("grp_" + state.cat) : t("c_" + state.cat));
    if (state.prov) blockers.push(place(state.prov));
    if (state.max !== "" || state.min !== "") blockers.push(t("f_price_max").replace(/\.$/, ""));
    return `<div class="empty"><h2>${esc(onlyFavs ? t("saved_empty_t") : t("none_t"))}</h2>
      <p>${esc(onlyFavs ? t("saved_empty") : blockers.length ? t("none_because", { f: blockers.join(", ") }) : t("none"))}</p>
      <div>${state.q ? `<button type="button" class="btn ghost" data-rm="q">${esc(t("clear_search"))}</button>` : ""}
      ${(blockers.length || onlyFavs) ? `<button type="button" class="btn" data-rm="*">${esc(t("clear_all"))}</button>` : ""}</div></div>`;
  }

  function render() {
    document.documentElement.dataset.mode = mode;
    if (histView() && !hist) ensureHistory().then(() => { buildControls(); render(); });
    current = sorted(all.filter((s) => matches(s)));
    const n = current.length;
    $("#resTitle").textContent = resultTitle(n);
    const totalOpen = Math.max(openNow().length, meta.actuales || 0);
    $("#resCount").textContent = histView()
      ? (hist ? t(state.status === "all" ? "res_short" : "res_count_hist", { n: num(n) }) + (histIdx && histIdx.desde ? " · " + t("hist_since", { m: monthName(histIdx.desde) }) : "") : t("hist_loading"))
      : t("res_count", { n: num(n), total: num(totalOpen) });
    activeChips();
    const page = current.slice(0, shown);
    let html;
    if (!n && histView() && !hist) html = `<div class="empty"><p>${esc(t("hist_loading"))}</p></div>`;
    else if (!n) html = emptyBlock();
    else if (mode === "inversor" && !narrow()) {
      const th = (k, label, cls) => `<th scope="col" class="${cls || ""}">${k ? `<button type="button" data-sort="${k}" aria-pressed="${state.sort === k}">${esc(label)}${state.sort === k ? " ↓" : ""}</button>` : esc(label)}</th>`;
      html = `<div class="t-box"><div class="t-scroll"><table class="t" aria-describedby="resTitle"><thead><tr>
        ${th("", t("col_what"))}${th("", t("col_origin"))}${th("price_asc", t("col_value"), "num")}${th("", t("appraisal"), "num")}${th("discount", t("col_disc"), "num")}${histView() ? th("bid_ratio", t("col_bid"), "num") + th("end", t("col_ended"), "num") : th("deposit", t("deposit"), "num") + th("end", t("col_closes"), "num")}${th("risk", t("col_risks"))}<th scope="col"><span class="sr">${esc(t("fav_add"))}</span></th>
        </tr></thead><tbody>${page.map(tableRow).join("")}</tbody></table></div>
        <div class="t-foot"><span>${esc(t("shown_of", { a: num(Math.min(shown, n)), n: num(n) }))}</span><span>${t("kbd_inline")}</span></div></div>`;
    } else if (mode === "pro" || mode === "inversor") {
      html = `<div class="p-head"><h2>${esc(state.prov ? place(state.prov) : t("all_spain"))}</h2><span class="muted">${esc(t("res_short", { n: num(n) }))}</span></div><div class="p-list">${page.map(proRow).join("")}</div>`;
    } else {
      html = `<div class="n-list">${page.map(novCard).join("")}</div>`;
    }
    $("#list").innerHTML = html + lockedBlock();
    $("#more").hidden = n <= shown;
    renderLock();
    renderSide();
    placeMap();
    renderMap();
    renderProvList();
    writeUrl();
  }

  // Боковая панель: в «Инвесторе» — детали выбранного, в «Новичке» — памятка
  function renderSide() {
    const panel = $("#panel");
    if (mode === "inversor" && window.matchMedia("(min-width:1001px)").matches) {
      if (!selected || !current.some((s) => s.id === selected)) selected = current[0] ? current[0].id : null;
      const s = all.find((x) => x.id === selected);
      panel.hidden = !s;
      if (s) { panel.innerHTML = detailHTML(s, "p"); if (svKey()) svAim(panel); }
      $$(".t tbody tr").forEach((tr) => tr.setAttribute("aria-selected", tr.dataset.id === selected));
    } else panel.hidden = true;
    $("#guideTrial").textContent = AUTH.enabled ? t("guide_trial", { date: trialDate() }) : "";
  }

  // ---------- карточка аукциона (панель и окно)
  function checkItem(tone, title, text) {
    const icon = tone === "ok" ? "check" : tone === "n" ? "info" : "alert";
    return `<li class="${tone}">${ic(icon)}<div><b>${esc(title)}</b><span>${esc(text)}</span></div></li>`;
  }
  // Без полного доступа у завершённого аукциона видна только сводка — как в списке
  function lockedDoneHTML(s, idp) {
    const q = result(s) || {};
    const city = place(s.localidad) || place(s._prov) || "";
    const u = AUTH.user && AUTH.user();
    return `<div class="dv">
      <div class="c-media big m-empty">${ic(s.categoria)}</div>
      <div class="dv-head"><div><span class="muted" style="font-size:13px">${esc(what(s))} · ${esc(t("origin_" + s.origen))}</span>
        <h2 id="${idp}Title">${esc(city)}</h2><span class="dv-id">${esc(place(s._prov))}</span></div></div>
      <div class="dv-kv">
        <div><small>${esc(t("value"))}</small><b>${eur(s.valor_subasta)}</b></div>
        <div><small>${esc(t("col_ended"))}</small><b>${day(s.fecha_fin)}</b></div>
        <div class="${q.tone === "ok" ? "good" : ""}"><small>${esc(t("col_bid"))}</small><b>${esc(q.label || "—")}</b></div>
      </div>
      <div class="locked-box" style="margin-top:16px"><h3 style="margin:0 0 6px">${esc(t("done_locked_t"))}</h3>
        <p class="muted" style="margin:0 0 12px">${esc(t("done_locked_d"))}</p>
        ${u ? (CFG.contactEmail ? `<a class="btn" href="mailto:${esc(CFG.contactEmail)}">${esc(t("lock_cta_user"))}</a>` : "") : `<button class="btn" data-locked="1">${esc(t("lock_cta_guest"))}</button>`}</div>
    </div>`;
  }
  // Цены объявлений в районе — открываем сами порталы (мы их данные не копируем)
  const REAL_ESTATE_UI = ["vivienda", "garaje", "trastero", "local", "nave", "solar", "rustica", "inmueble"];
  function priceLinks(s) {
    const town = place(s.localidad) || place(s._prov);
    if (!town) return "";
    const q = (site) => `https://www.google.com/search?q=${encodeURIComponent(`${site} precio m2 ${(I18N.es["c_" + s.categoria] || "vivienda").toLowerCase()} ${town} ${place(s._prov)}`)}`;
    return `<a class="btn ghost" href="${esc(q("idealista"))}" target="_blank" rel="noopener">${esc(t("prices_on", { site: "idealista" }))} ${ic("ext")}</a>
      <a class="btn ghost" href="${esc(q("fotocasa"))}" target="_blank" rel="noopener">${esc(t("prices_on", { site: "Fotocasa" }))} ${ic("ext")}</a>`;
  }
  // Только для администраторов: где взять все документы по аукциону
  // ---------- соцсети: админ отмечает аукцион для сценария рилс/сторис/Telegram
  const SOC = [["r1", "Рилс 1 · Цена-крючок"], ["r2", "Рилс 2 · Разбор цифр"], ["r3", "Рилс 3 · Топ-10 недели"], ["r4", "Рилс 4 · Чем закончилось"], ["r6", "Рилс 6 · Дом с бассейном по цене квартиры"], ["r7", "Рилс 7 · Авто дешевле телефона (топ-5)"], ["r8", "Рилс 8 · Авто недели"],
    ["s1", "Сторис · Закрывается сегодня"], ["s2", "Сторис · Объект дня"], ["tg", "Telegram · подборка"]];
  const isAdm = () => !!(AUTH.status && AUTH.status.is_admin);
  function socBlock(s) {
    if (!isAdm() || !AUTH.client) return "";
    setTimeout(socFill, 0);
    // r4 — только завершённые, r6 и Telegram — любые, остальные — только идущие
    const car = s.categoria === "vehiculo";
    const list = SOC.filter(([k]) => {
      if (k === "tg") return true;
      if (k === "r7") return car && !!done(s);          // авто из архива: подборка «дешевле телефона»
      if (k === "r8") return car && !done(s);           // авто, которое можно купить сейчас
      if (car) return false;                            // остальные сценарии — про недвижимость
      if (k === "r6") return true;
      return (k === "r4") === !!done(s);
    });
    return `<div class="soc" data-soc="${esc(s.id)}"><h3>В соцсети <a class="fine" href="admin.html#soc">очередь →</a></h3>
      <div class="soc-chips">${list.map(([k, l]) => `<button type="button" class="soc-chip" data-soc-k="${k}" aria-pressed="false" disabled>${esc(l)}</button>`).join("")}</div></div>`;
  }
  async function socFill() {
    for (const box of $$("[data-soc]:not([data-ok])")) {
      box.dataset.ok = "1";
      try {
        const { data, error } = await AUTH.client.from("social_cola").select("escenario,estado").eq("subasta_id", box.dataset.soc);
        if (error) throw error;
        const st = Object.fromEntries(data.map((r) => [r.escenario, r.estado]));
        box.querySelectorAll("[data-soc-k]").forEach((b) => {
          const e = st[b.dataset.socK];
          b.setAttribute("aria-pressed", !!e);
          b.disabled = !!e && e !== "pendiente";       // уже в обработке/опубликовано — не трогаем
          b.title = e ? "Статус: " + e : "";
        });
      } catch (e) { console.error(e); }
    }
  }
  async function socToggle(btn) {
    const box = btn.closest("[data-soc]"), id = box.dataset.soc, k = btn.dataset.socK;
    const s = all.find((x) => x.id === id) || (hist || []).find((x) => x.id === id) || {};
    const on = btn.getAttribute("aria-pressed") === "true";
    btn.disabled = true;
    try {
      if (on) {
        const { error } = await AUTH.client.from("social_cola").delete().eq("subasta_id", id).eq("escenario", k).eq("estado", "pendiente");
        if (error) throw error;
      } else {
        const b = (s.bienes || [])[0] || {}, x = s._inv || {}, c = s.catastro || {};
        const resumen = { categoria: s.categoria, localidad: s.localidad || b.localidad, provincia: s.provincia || s._prov, cp: s.cp || b.cp,
          valor_subasta: s.valor_subasta, deposito: s.deposito, fecha_fin: s.fecha_fin, url: s.url, sup: c.sup, anio: c.anio,
          valoracion: x.valoracion || null, pujas: x.pujas || null, estado: s.estado, puja_maxima: s.puja_maxima || null, sin_pujas: s.sin_pujas || null, titulo: sentence(b.descripcion || b.titulo || "").slice(0, 200) };
        const { error } = await AUTH.client.from("social_cola").insert({ subasta_id: id, escenario: k, resumen, creado_por: (AUTH.user() || {}).email });
        if (error) throw error;
      }
      btn.setAttribute("aria-pressed", !on);
    } catch (e) { console.error(e); alert("Не удалось: " + (e.message || e)); }
    btn.disabled = false;
  }
  function adminDocs(s) {
    if (!(AUTH.status && AUTH.status.is_admin)) return "";
    const rc = (s.bienes || []).map((b) => String(b.ref_catastral || "").replace(/\s/g, "")).find((x) => x.length >= 14) || "";
    const idufir = (s.bienes || []).map((b) => b.idufir).find(Boolean) || "";
    return `<div class="adm-docs"><h3>${esc(t("adm_docs_t"))}</h3><p class="fine">${esc(t("adm_docs_d"))}</p><div class="dv-more">
      <a class="btn" href="https://subastas.boe.es/detalleSubasta.php?idSub=${encodeURIComponent(s.id)}&ver=1" target="_blank" rel="noopener">${ic("file")} ${esc(t("adm_docs_boe"))} ${ic("ext")}</a>
      ${s.anuncio_boe ? `<a class="btn ghost" href="https://www.boe.es/diario_boe/txt.php?id=${encodeURIComponent(s.anuncio_boe)}" target="_blank" rel="noopener">${esc(t("adm_docs_edict"))} ${ic("ext")}</a>` : ""}
      ${rc ? `<a class="btn ghost" href="https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx?rc1=${encodeURIComponent(rc.slice(0, 7))}&rc2=${encodeURIComponent(rc.slice(7, 14))}" target="_blank" rel="noopener">${esc(t("adm_docs_cat"))} ${ic("ext")}</a>` : ""}
      <a class="btn ghost" href="https://sede.registradores.org/site/home" target="_blank" rel="noopener">${esc(t("adm_docs_nota"))}${idufir ? " · IDUFIR " + esc(idufir) : rc ? " · " + esc(rc) : ""} ${ic("ext")}</a>
    </div>${filesBlock(s)}</div>`;
  }
  // ---------- файлы аукциона (только админ): автоскачивание с BOE + Катастро, ручная загрузка
  function filesBlock(s) {
    if (!AUTH.client) return "";
    setTimeout(filesFill, 0);
    return `<div class="adm-files" data-files-sub="${esc(s.id)}">
      <div class="af-head"><b>Файлы аукциона</b>
        <button type="button" class="btn soft" data-docs-boe>${ic("file")} Скачать документы с BOE</button>
        <label class="btn ghost af-up">Загрузить файлы<input type="file" multiple data-docs-up hidden></label></div>
      <p class="fine af-msg" hidden></p><ul class="af-list"><li class="muted">…</li></ul>
      <div class="af-fotos"></div></div>`;
  }
  const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + " МБ" : Math.max(1, Math.round(n / 1024)) + " КБ";
  const ORIG = { boe: "BOE", catastro: "Катастро", manual: "вручную", chrome: "через Chrome" };
  async function filesFill(force) {
    for (const box of $$("[data-files-sub]" + (force ? "" : ":not([data-ok])"))) {
      box.dataset.ok = "1";
      const { data, error } = await AUTH.client.from("subasta_docs").select("*").eq("subasta_id", box.dataset.filesSub).order("path");
      const ul = box.querySelector(".af-list");
      if (error) { ul.innerHTML = `<li class="muted">Ошибка: ${esc(error.message)}</li>`; continue; }
      ul.innerHTML = data.length ? data.map((f) => `<li data-path="${esc(f.path)}" data-fid="${f.id}">
          <button type="button" class="link-btn" data-doc-open>${/^image\//.test(f.mime || "") ? "🖼️" : ic("file")} ${esc(f.nombre)}</button>
          <span class="fine">${esc(ORIG[f.origen] || f.origen)} · ${kb(f.bytes || 0)}</span>
          <button type="button" class="link-btn af-del" data-doc-del title="Удалить">✕</button></li>`).join("")
        : `<li class="muted">Файлов пока нет.</li>`;
      const pend = data.filter((f) => !f.fotos_ok && (/pdf|image/.test(f.mime || ""))).length;
      const { data: fotos } = await AUTH.client.from("subasta_fotos").select("*").eq("subasta_id", box.dataset.filesSub).order("portada", { ascending: false }).order("score", { ascending: false });
      const base = CFG.supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/public/fotos/";
      box.querySelector(".af-fotos").innerHTML = (fotos && fotos.length ? `<b class="af-ft">Фото из документов (${fotos.length})</b><div class="af-grid">${fotos.map((f) => `
        <figure class="af-foto${f.visible ? "" : " off"}${f.portada ? " main" : ""}" data-foto="${f.id}">
          <img src="${esc(base + f.path)}" loading="lazy" alt="">
          <figcaption>${f.portada ? "★ на плашке" : `<button type="button" class="link-btn" data-foto-main>★ на плашку</button>`}
            <button type="button" class="link-btn" data-foto-vis>${f.visible ? "скрыть" : "показать"}</button></figcaption></figure>`).join("")}</div>` : "")
        + (pend ? `<p class="fine">Фото ищутся в ${pend} документ(ах) — появятся в течение ~15 минут.</p>` : "");
    }
  }
  async function fotoAction(btn) {
    const fig = btn.closest("[data-foto]"), id = +fig.dataset.foto, box = btn.closest("[data-files-sub]"), sid = box.dataset.filesSub;
    try {
      if (btn.hasAttribute("data-foto-main")) {
        await AUTH.client.from("subasta_fotos").update({ portada: false }).eq("subasta_id", sid).eq("portada", true);
        const { error } = await AUTH.client.from("subasta_fotos").update({ portada: true, visible: true }).eq("id", id); if (error) throw error;
      } else {
        const off = !fig.classList.contains("off");
        const { error } = await AUTH.client.from("subasta_fotos").update(off ? { visible: false, portada: false } : { visible: true }).eq("id", id); if (error) throw error;
      }
      await filesFill(true);
      await loadFotos(); applyFotos(all); render();
    } catch (e) { alert(e.message || e); }
  }
  const afMsg = (box, text) => { const m = box.querySelector(".af-msg"); m.textContent = text; m.hidden = !text; };
  async function docsBoe(btn) {
    const box = btn.closest("[data-files-sub]"), id = box.dataset.filesSub;
    const s = all.find((x) => x.id === id) || (hist || []).find((x) => x.id === id) || {};
    btn.disabled = true; afMsg(box, "Скачиваю с BOE и Катастро… обычно 10–30 секунд.");
    try {
      const { data, error } = await AUTH.client.functions.invoke("docs-boe", { body: { id, rcs: (s.bienes || []).map((b) => b.ref_catastral).filter(Boolean) } });
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      afMsg(box, `Сохранено файлов: ${data.saved.length}.` + (data.needLogin ? " Документы этого аукциона на BOE видны только после входа на портал — загрузите их вручную или попросите Claude забрать через ваш Chrome." : "")
        + (data.errors.length ? " Не удалось: " + data.errors.join("; ") : ""));
      await filesFill(true);
    } catch (e) { console.error(e); afMsg(box, "Ошибка: " + (e.message || e)); }
    btn.disabled = false;
  }
  document.addEventListener("change", (e) => { const u = e.target.closest && e.target.closest("[data-docs-up]"); if (u && u.files.length) docsUpload(u); });
  async function docsUpload(inp) {
    const box = inp.closest("[data-files-sub]"), id = box.dataset.filesSub;
    const safe = (n) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").slice(-80);
    afMsg(box, "Загружаю…");
    try {
      for (const f of inp.files) {
        const path = `${id}/manual-${Date.now()}-${safe(f.name)}`;
        const up = await AUTH.client.storage.from("docs").upload(path, f, { contentType: f.type || "application/octet-stream" });
        if (up.error) throw up.error;
        const { error } = await AUTH.client.from("subasta_docs").insert({ subasta_id: id, nombre: f.name, path, origen: "manual", mime: f.type, bytes: f.size, subido_por: (AUTH.user() || {}).email });
        if (error) throw error;
      }
      afMsg(box, `Загружено: ${inp.files.length}.`); inp.value = "";
      await filesFill(true);
    } catch (e) { console.error(e); afMsg(box, "Ошибка: " + (e.message || e)); }
  }
  // ---------- Nota simple: заказ выписки из Registro de la Propiedad (17 € + IVA)
  const NOTA = { precio: 17, iva: 21 };
  const NOTA_CATS = ["vivienda", "garaje", "trastero", "local", "nave", "solar", "rustica", "inmueble"];
  const eur2 = (v) => new Intl.NumberFormat(locale(), { style: "currency", currency: "EUR" }).format(v);
  // Регистрационные данные из описания лота в BOE
  function regData(a) {
    const txt = String(a.descripcion || "") + " " + String(a.titulo || "");
    const reg = txt.match(/registro\s+de\s+la\s+propiedad\s*(?:(?:n[º°o.]*|n\.º|número|num\.?)\s*)?(\d+)?\s*(?:de|del)\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñüÀ-ÿ' .-]{2,40}?)(?=\s*[,.;:(]|\s+al\s|\s+tomo|\s+con\s|\s+bajo|\s+como|$)/i);
    const finca = txt.match(/finca\s*(?:registral)?\s*(?:n[º°o.]*|n\.º|número|num\.?)?\s*:?\s*(\d[\d.\/-]*)/i);
    const pick = (re) => { const m = txt.match(re); return m ? m[1].replace(/\.$/, "") : ""; };
    const tomo = pick(/tomo\s*:?\s*([\d.]+)/i), libro = pick(/libro\s*:?\s*([\d.]+)/i), folio = pick(/folio\s*:?\s*([\d.]+)/i);
    return {
      registro: reg ? ("Registro de la Propiedad" + (reg[1] ? " nº " + reg[1] : "") + " de " + sentence(reg[2].trim())) : "",
      finca: finca ? finca[1].replace(/[.\/-]$/, "") : "",
      datos: [tomo && "tomo " + tomo, libro && "libro " + libro, folio && "folio " + folio].filter(Boolean).join(", ")
    };
  }
  const notaAssets = (s) => (s.bienes || []).filter((a) => !a.matricula && (a.idufir || String(a.ref_catastral || "").replace(/\s/g, "").length >= 14 || /registro\s+de\s+la\s+propiedad|finca/i.test(a.descripcion || "")));
  const PRICE = { nota: 17, pack: 120 };
  const canNota = (s) => AUTH.enabled && NOTA_CATS.includes(s.categoria) && notaAssets(s).length > 0;
  function actButtons(s) {
    if (!REAL_ESTATE_UI.includes(s.categoria)) return "";
    const r = [I18N.es["c_" + s.categoria] || "", place(s.localidad) || place(s._prov), s.valor_subasta ? eur(s.valor_subasta) : ""].filter(Boolean).join(" · ");
    return (canNota(s) ? `<button type="button" class="btn soft" data-nota="${esc(s.id)}" title="${esc(t("nota_d"))}">${esc(t("act_nota", { p: eur2(PRICE.nota) }))}</button>
      <button type="button" class="btn soft" data-pack="${esc(s.id)}" title="${esc(t("pack_d"))}">${esc(t("act_pack", { p: eur2(PRICE.pack) }))}</button>` : "")
      + `<a class="btn ghost" href="servicios.html?sub=${encodeURIComponent(s.id)}&r=${encodeURIComponent(r)}#solicitud" title="${esc(t("help_d"))}">${esc(t("help_btn"))}</a>`;
  }
  const actHint = (s) => REAL_ESTATE_UI.includes(s.categoria) && canNota(s) ? `<p class="fine dv-hint">${esc(t("acts_hint"))}</p>` : "";
  function notaDialog() {
    let d = $("#notaDlg");
    if (!d) {
      d = document.createElement("dialog"); d.id = "notaDlg"; d.className = "dlg nota";
      d.setAttribute("aria-labelledby", "notaTitle");
      document.body.appendChild(d);
      d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
    }
    return d;
  }
  const closeBtn = () => `<button class="d-close" data-close aria-label="${esc(t("close"))}">${ic("x")}</button>`;
  function openNota(id, tipo) {
    tipo = tipo === "pack" ? "pack" : "nota";
    const s = all.find((x) => x.id === id);
    if (!s) return;
    const u = AUTH.user && AUTH.user();
    if (!u) { if ($("#detail").open) $("#detail").close(); openAuth("login"); return; }
    const assets = notaAssets(s);
    const d = notaDialog();
    const fill = (i) => {
      const a = assets[i] || {}, r = regData(a);
      return { idufir: a.idufir || "", rc: String(a.ref_catastral || "").replace(/\s/g, ""), registro: r.registro, finca: r.finca, datos: r.datos,
        dir: [a.direccion, a.cp, place(a.localidad), place(a.provincia)].filter(Boolean).join(", "), bien: sentence(a.descripcion || a.titulo || "").slice(0, 280) };
    };
    const last = store.get("nota_me") || {};
    const f0 = fill(0);
    const inp = (name, label, val, attrs = "") => `<label><span>${esc(t(label))}</span><input name="${name}" value="${esc(val || "")}" ${attrs}></label>`;
    const precio = PRICE[tipo], total = precio * (1 + NOTA.iva / 100);
    d.innerHTML = `<div class="d-head">${closeBtn()}<h2 id="notaTitle">${esc(t(tipo === "pack" ? "pack_form_t" : "nota_form_t"))}</h2>
        <p class="muted" style="margin:6px 0 0">${esc(what(s))} · ${esc(place(s.localidad) || place(s._prov) || "")} · ${esc(s.id)}</p></div>
      <form class="d-body nota-form" id="notaForm" novalidate>
        <p class="nf-what">${esc(t(tipo === "pack" ? "pack_d" : "nota_d"))}</p>
        <h3>${esc(t("nota_finca"))}</h3>
        ${assets.length > 1 ? `<label><span>${esc(t("nota_bien"))}</span><select name="bien_i">${assets.map((a, i) => `<option value="${i}">${i + 1}. ${esc(sentence(a.descripcion || a.titulo || "").slice(0, 80))}</option>`).join("")}</select></label>` : ""}
        <div class="nf-grid">
          ${inp("idufir", "nota_idufir", f0.idufir, 'maxlength="40"')}
          ${inp("rc", "nota_rc", f0.rc, 'maxlength="25"')}
          ${inp("registro", "nota_registro", f0.registro, 'maxlength="160"')}
          ${inp("finca", "nota_num_finca", f0.finca, 'maxlength="60"')}
          ${inp("datos", "nota_datos", f0.datos, 'maxlength="300"')}
          ${inp("dir", "nota_dir", f0.dir, 'maxlength="300"')}
        </div>
        <p class="fine">${esc(t("nota_hint"))}</p>
        <h3>${esc(t("nota_you"))}</h3>
        <div class="nf-grid">
          ${inp("nombre", "nota_name", last.nombre, 'required maxlength="160" autocomplete="name"')}
          ${inp("dni", "nota_dni", "", 'required maxlength="12" autocapitalize="characters"')}
          ${inp("email", "nota_email", last.email || u.email, 'type="email" required autocomplete="email"')}
          ${inp("tel", "nota_phone", last.tel, 'type="tel" maxlength="30" autocomplete="tel"')}
        </div>
        <label><span>${esc(t("nota_purpose"))}</span><select name="fin">${["subasta", "inversion", "juridica", "otra"].map((k) => `<option value="${k}">${esc(t("nota_p_" + k))}</option>`).join("")}</select></label>
        <label class="nf-check"><input type="checkbox" name="ok" required> <span>${esc(t("nota_consent"))}</span></label>
        <div class="nf-total"><span>${esc(t("nota_price", { p: eur2(precio), t: eur2(total) }))}</span></div>
        ${AUTH.notaPago ? "" : `<p class="nf-soon">${esc(t("nota_soon"))}</p>`}
        <p class="auth-msg" id="notaMsg" role="status" hidden></p>
        <button class="btn big" type="submit">${esc(t(AUTH.notaPago ? "nota_send_pay" : "nota_send_free"))}</button>
      </form>`;
    const form = $("#notaForm");
    const sel = form.querySelector("[name=bien_i]");
    if (sel) sel.onchange = () => { const f = fill(+sel.value); form.idufir.value = f.idufir; form.rc.value = f.rc; form.registro.value = f.registro; form.finca.value = f.finca; form.datos.value = f.datos; form.dir.value = f.dir; };
    const msg = (text, ok) => { const m = $("#notaMsg"); m.textContent = text; m.className = "auth-msg " + (ok ? "ok" : "err"); m.hidden = false; };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const v = (n) => (form[n] ? form[n].value.trim() : "");
      const dni = v("dni").toUpperCase().replace(/[\s-]/g, "");
      if (!v("nombre") || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("email")) || !form.ok.checked) { msg(t("nota_err_fields"), false); return; }
      if (!/^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[A-HJ-NP-SUVW][0-9]{7}[0-9A-J])$/.test(dni)) { msg(t("nota_err_dni"), false); return; }
      if (!v("idufir") && !v("rc") && !v("finca")) { msg(t("nota_err_finca"), false); return; }
      const btn = form.querySelector("[type=submit]"); btn.disabled = true;
      const f = fill(sel ? +sel.value : 0);
      try {
        const r = await AUTH.notaCrear({ p_subasta_id: s.id, p_bien: f.bien, p_idufir: v("idufir"), p_ref_catastral: v("rc"), p_registro: v("registro"),
          p_finca: v("finca"), p_datos_registrales: v("datos"), p_direccion: v("dir"), p_nombre: v("nombre"), p_dni: dni, p_email: v("email"),
          p_telefono: v("tel"), p_finalidad: v("fin"), p_tipo: tipo });
        store.set("nota_me", { nombre: v("nombre"), email: v("email"), tel: v("tel") });
        msg(t("nota_ok", { n: r.id, e: r.email }), true);
        btn.hidden = true;
      } catch (err) {
        console.error(err);
        const c = String(err && err.message || "");
        msg(t(c.includes("dni") ? "nota_err_dni" : c.includes("finca") ? "nota_err_finca" : c.includes("demasiados") ? "nota_err_many" : "nota_err"), false);
        btn.disabled = false;
      }
    };
    if (!d.open) d.showModal();
  }
  async function openMyNotas() {
    if (!(AUTH.user && AUTH.user())) { openAuth("login"); return; }
    const d = notaDialog();
    d.innerHTML = `<div class="d-head">${closeBtn()}<h2 id="notaTitle">${esc(t("nota_mine"))}</h2></div><div class="d-body" id="myNotas"><p class="muted">…</p></div>`;
    if (!d.open) d.showModal();
    let rows = [];
    try { rows = await AUTH.misNotas(); } catch (e) { console.error(e); $("#myNotas").innerHTML = `<p class="auth-msg err">${esc(t("nota_err"))}</p>`; return; }
    $("#myNotas").innerHTML = rows.length ? `<ul class="nota-list">${rows.map((r) => `<li>
        <div><b>#${r.id} · ${esc(t(r.tipo === "pack" ? "pack_short" : "nota_short"))} · ${esc(r.registro || r.direccion || r.subasta_id)}</b>
          <span class="fine">${esc(dateFmt(r.created_at))} · ${esc([r.idufir && "IDUFIR " + r.idufir, r.finca && "finca " + r.finca, r.ref_catastral].filter(Boolean).join(" · "))}</span></div>
        <span class="ns ns-${esc(r.estado)}">${esc(t("ns_" + r.estado))}</span>
        ${r.estado === "entregado" && r.pdf_path ? `<div class="nota-files" data-files="${esc(r.pdf_path)}"><span class="muted">…</span></div>` : ""}
        ${["solicitado", "pendiente_pago"].includes(r.estado) ? `<button class="link-btn" data-nota-cancel="${r.id}">${esc(t("nota_cancel"))}</button>` : ""}
      </li>`).join("")}</ul>` : `<p class="muted">${esc(t("nota_none"))}</p>`;
    // файлы заказа: старые — один PDF, новые — папка {user}/{id}/
    $$("#myNotas [data-files]").forEach(async (box) => {
      try {
        const files = await AUTH.notaFiles(box.dataset.files);
        box.innerHTML = files.map((f) => `<button class="btn soft" data-nota-pdf="${esc(f.path)}">${ic("file")} ${esc(files.length > 1 ? f.name : t("nota_dl"))}</button>`).join("");
      } catch (e) { console.error(e); box.innerHTML = ""; }
    });
  }
  // ---------- Сколько всего заплатить: ITP по регионам (общая ставка 2026, guiafiscal.es) и тариф Реестра (RD 1427/1989)
  const CCAA = { "ANDALUCÍA": 7, "ARAGÓN": 8, "ASTURIAS": 8, "ILLES BALEARS": 8, "CANARIAS": 6.5, "CANTABRIA": 9, "CASTILLA Y LEÓN": 8,
    "CASTILLA-LA MANCHA": 9, "CATALUÑA": 10, "C. VALENCIANA": 9, "EXTREMADURA": 8, "GALICIA": 8, "LA RIOJA": 7, "MADRID": 6, "MURCIA": 7.75,
    "NAVARRA": 6, "PAÍS VASCO": 4, "CEUTA": 6, "MELILLA": 6 };
  const PROV_CCAA = { "ALMERÍA": "ANDALUCÍA", "CÁDIZ": "ANDALUCÍA", "CÓRDOBA": "ANDALUCÍA", "GRANADA": "ANDALUCÍA", "HUELVA": "ANDALUCÍA", "JAÉN": "ANDALUCÍA", "MÁLAGA": "ANDALUCÍA", "SEVILLA": "ANDALUCÍA",
    "HUESCA": "ARAGÓN", "TERUEL": "ARAGÓN", "ZARAGOZA": "ARAGÓN", "ASTURIAS": "ASTURIAS", "ILLES BALEARS": "ILLES BALEARS", "LAS PALMAS": "CANARIAS", "SANTA CRUZ DE TENERIFE": "CANARIAS",
    "CANTABRIA": "CANTABRIA", "ÁVILA": "CASTILLA Y LEÓN", "BURGOS": "CASTILLA Y LEÓN", "LEÓN": "CASTILLA Y LEÓN", "PALENCIA": "CASTILLA Y LEÓN", "SALAMANCA": "CASTILLA Y LEÓN", "SEGOVIA": "CASTILLA Y LEÓN", "SORIA": "CASTILLA Y LEÓN", "VALLADOLID": "CASTILLA Y LEÓN", "ZAMORA": "CASTILLA Y LEÓN",
    "ALBACETE": "CASTILLA-LA MANCHA", "CIUDAD REAL": "CASTILLA-LA MANCHA", "CUENCA": "CASTILLA-LA MANCHA", "GUADALAJARA": "CASTILLA-LA MANCHA", "TOLEDO": "CASTILLA-LA MANCHA",
    "BARCELONA": "CATALUÑA", "GIRONA": "CATALUÑA", "LLEIDA": "CATALUÑA", "TARRAGONA": "CATALUÑA", "ALICANTE/ALACANT": "C. VALENCIANA", "CASTELLÓN/CASTELLÓ": "C. VALENCIANA", "VALENCIA/VALÈNCIA": "C. VALENCIANA",
    "BADAJOZ": "EXTREMADURA", "CÁCERES": "EXTREMADURA", "A CORUÑA": "GALICIA", "LUGO": "GALICIA", "OURENSE": "GALICIA", "PONTEVEDRA": "GALICIA", "LA RIOJA": "LA RIOJA", "MADRID": "MADRID",
    "MURCIA": "MURCIA", "NAVARRA": "NAVARRA", "ARABA/ÁLAVA": "PAÍS VASCO", "BIZKAIA": "PAÍS VASCO", "GIPUZKOA": "PAÍS VASCO", "CEUTA": "CEUTA", "MELILLA": "MELILLA" };
  const regFee = (v) => { // Arancel registral, número 2 (RD 1427/1989), con la rebaja del 5 %
    const steps = [[6010.12, 0], [30050.61, 1.75], [60101.21, 1.25], [150253.03, 0.75], [601012.10, 0.30], [Infinity, 0.20]];
    let fee = 24.04, prev = 6010.12;
    for (const [top, perMil] of steps.slice(1)) { if (v <= prev) break; fee += (Math.min(v, top) - prev) * perMil / 1000; prev = top; }
    return Math.min(fee, 2181.67) * 0.95;
  };
  const byIdAll = (id) => all.find((x) => x.id === id);
  const ccaaOf = (s) => PROV_CCAA[String(s.provincia || "").toUpperCase()] || "";
  function costCalc(bid, s) {
    const r = CCAA[ccaaOf(s)] || 0, itp = bid * r / 100, reg = regFee(bid);
    return { r, itp, reg, total: bid + itp + reg };
  }
  function costBlock(s) {
    if (done(s) || !REAL_ESTATE_UI.includes(s.categoria) || !s.valor_subasta || !ccaaOf(s)) return "";
    const v = +s.valor_subasta, start = s.origen === "judicial" ? 0.7 : 1, bid = Math.round(v * start), c = costCalc(bid, s);
    const thr = s.origen === "judicial" ? `<div class="thr"><b>${esc(t("thr_t"))}</b><ul>
        <li>${esc(t("thr_70", { v: eur(v * 0.7) }))}</li><li>${esc(t("thr_50", { v: eur(v * 0.5) }))}</li><li>${esc(t("thr_low"))}</li></ul></div>` : "";
    return `<section class="cost" data-cost="${esc(s.id)}"><h3>${esc(t("cost_t"))}</h3>
      <label class="cost-bid"><span>${esc(t("cost_bid"))}: <b data-c="bid">${eur(bid)}</b> <small data-c="pct">${esc(t("cost_pct", { p: Math.round(start * 100) }))}</small></span>
        <input type="range" min="10" max="150" step="1" value="${Math.round(start * 100)}" data-cost-range="${esc(s.id)}" aria-label="${esc(t("cost_bid"))}"></label>
      <dl class="cost-rows"><dt>${esc(t("cost_itp", { r: String(c.r).replace(".", locale().startsWith("en") ? "." : ",") }))}</dt><dd data-c="itp">${eur(c.itp)}</dd>
        <dt>${esc(t("cost_reg"))}</dt><dd data-c="reg">${eur(c.reg)}</dd>
        <dt class="tot">${esc(t("cost_total"))}</dt><dd class="tot" data-c="total">${eur(c.total)}</dd></dl>
      ${s.deposito ? `<p class="fine">${esc(t("cost_dep", { v: eur(s.deposito) }))}</p>` : ""}
      ${thr}<p class="fine">${esc(t("cost_note", { c: ccaaOf(s).charAt(0) + ccaaOf(s).slice(1).toLowerCase() }))}</p></section>`;
  }
  function costUpdate(input) {
    const s = byIdAll(input.dataset.costRange); if (!s) return;
    const box = input.closest("[data-cost]"), pct = +input.value, bid = Math.round(s.valor_subasta * pct / 100), c = costCalc(bid, s);
    const set = (k, v) => { const el = box.querySelector(`[data-c="${k}"]`); if (el) el.textContent = v; };
    set("bid", eur(bid)); set("pct", t("cost_pct", { p: pct })); set("itp", eur(c.itp)); set("reg", eur(c.reg)); set("total", eur(c.total));
  }
  // ---------- Что известно о лоте
  function knownBlock(s) {
    if (!REAL_ESTATE_UI.includes(s.categoria)) return "";
    const a = asset0(s), has = (v) => !!(v && !/no consta|desconoc|sin datos/i.test(String(v)));
    const items = [["kn_occ", has(a.situacion_posesoria)], ["kn_visit", has(a.visitable)], ["kn_charges", has(a.cargas)],
      ["kn_rc", String(a.ref_catastral || "").replace(/\s/g, "").length >= 14], ["kn_sup", !!(s.catastro && s.catastro.sup)],
      ["kn_photos", !!(s.fotos && s.fotos.length)], ["kn_appr", !!s.tasacion], ["kn_docs", !!((s.documentos || []).length)]];
    const yes = items.filter((x) => x[1]), no = items.filter((x) => !x[1]);
    return `<section class="known"><h3>${esc(t("kn_t"))} <small>${yes.length}/${items.length}</small></h3>
      <p>${yes.map((x) => `<span class="kn ok">${ic("check")} ${esc(t(x[0]))}</span>`).join("")}${no.map((x) => `<span class="kn no">? ${esc(t(x[0]))}</span>`).join("")}</p>
      ${no.length ? `<p class="fine">${esc(t("kn_hint"))}</p>` : ""}</section>`;
  }
  // ---------- Напоминание в календарь
  function calLinks(s) {
    if (done(s) || !s.fecha_fin) return "";
    const end = new Date(s.fecha_fin); if (isNaN(end)) return "";
    const f = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    const u = location.origin + location.pathname + "#/s/" + encodeURIComponent(s.id);
    const city = place(s.localidad) || place(s._prov) || "";
    const g = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(t("cal_title", { id: s.id })) +
      "&dates=" + f(start) + "/" + f(end) + "&details=" + encodeURIComponent(t("cal_desc", { c: city, u }));
    return `<a class="btn ghost" href="${esc(g)}" target="_blank" rel="noopener">${ic("clock")} ${esc(t("cal_google"))}</a>
      <button type="button" class="btn ghost" data-ics="${esc(s.id)}">${ic("clock")} ${esc(t("cal_ics"))}</button>`;
  }
  function downloadIcs(id) {
    const s = byIdAll(id); if (!s || !s.fecha_fin) return;
    const end = new Date(s.fecha_fin), start = new Date(end.getTime() - 60 * 60 * 1000), alarm = "-PT24H";
    const f = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const u = location.origin + location.pathname + "#/s/" + encodeURIComponent(s.id);
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Subastica//ES", "BEGIN:VEVENT", "UID:" + s.id + "@subastica.es", "DTSTAMP:" + f(new Date()),
      "DTSTART:" + f(start), "DTEND:" + f(end), "SUMMARY:" + t("cal_title", { id: s.id }), "DESCRIPTION:" + t("cal_desc", { c: place(s.localidad) || "", u }),
      "URL:" + u, "BEGIN:VALARM", "TRIGGER:" + alarm, "ACTION:DISPLAY", "DESCRIPTION:" + t("cal_title", { id: s.id }), "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = s.id + ".ics";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function detailHTML(s, idp) {
    if (locked() && done(s)) return lockedDoneHTML(s, idp);
    const r = s._risk, l = left(s), d = disc(s), b = asset0(s);
    const city = place(s.localidad) || place(s._prov) || "";
    const checks = [];
    if (r.applies && !done(s)) {
      const c = r.charges;
      checks.push(checkItem(c.tone, c.key === "car_amount" ? t("chk_car_amount", { v: eur(c.amount) }) : t("chk_" + c.key), c.key === "car_text" ? sentence(c.text).slice(0, 180) : t("chkd_" + c.key)));
      checks.push(checkItem(r.occ.tone, t("chk_" + r.occ.key), t("chkd_" + r.occ.key)));
      checks.push(checkItem(r.visit.tone, t("chk_" + r.visit.key), t("chkd_" + r.visit.key)));
    }
    if (s.deposito && !done(s)) checks.push(checkItem("ok", t("chk_deposit", { v: eur(s.deposito), p: depPct(s) != null ? depPct(s) + "%" : "" }), t("chkd_deposit")));
    if (s.origen === "hacienda" && d >= 30 && !done(s)) checks.push(checkItem("n", t("chk_hacienda"), t("chkd_hacienda")));
    const ex = exact(s);
    const mq = ex ? { q: `${ex.lat},${ex.lon}`, exact: true } : (mapQuery(s) || { q: [city, place(s._prov), "España"].filter(Boolean).join(", ") });
    const cat = s.catastro, val = s._inv && s._inv.valoracion, pj = s._inv && s._inv.pujas;
    const facts = cat ? [cat.sup ? t("cat_sup", { v: num(cat.sup) }) : "", cat.anio ? t("cat_year", { v: cat.anio }) : "", cat.uso || ""].filter(Boolean).join(" · ") : "";
    const valBlock = !done(s) && s.categoria === "vivienda" && cat && cat.sup
      ? (val ? `<div class="mv"><div><small>${esc(t("mv_title"))}</small><b>≈ ${eur(val.estimado)}</b></div>
          <p>${esc(t(val.descuento > 0 ? "mv_below" : "mv_above", { p: Math.abs(val.descuento || 0) }))}</p>
          <p class="fine">${esc(t("mv_how", { m2: eur(val.eur_m2), sup: num(val.sup), where: val.nivel === "municipio" ? city : place(s._prov), per: val.periodo || "" }))}</p>
          <p class="mv-warn">${ic("info")} ${esc(t(val.nivel === "municipio" ? "mv_check" : "mv_check_prov"))}</p></div>`
        : !atLeast("inversor") ? `<div class="mv locked"><div><small>${esc(t("mv_title"))}</small><b>${ic("lock")} ${esc(t("tier_inversor"))}</b></div><p>${esc(t("mv_locked"))}</p></div>` : "")
      : "";
    const bidsLine = !done(s) && s.estado === "activa" ? (pj ? `<span class="rp ${pj === "con_pujas" ? "warn" : "ok"}">${esc(t("bids_" + pj))}</span>` : (!atLeast("inversor") ? `<span class="rp">${ic("lock")} ${esc(t("bids_locked"))}</span>` : "")) : "";
    const assets = (s.bienes || []).map((a) => {
      const row = (k, v) => v ? `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>` : "";
      const rc = String(a.ref_catastral || "").replace(/\s/g, "");
      const rcLink = rc.length >= 14 ? `<a href="https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx?rc1=${encodeURIComponent(rc.slice(0, 7))}&rc2=${encodeURIComponent(rc.slice(7, 14))}" target="_blank" rel="noopener">${esc(a.ref_catastral)}</a>` : esc(a.ref_catastral || "");
      return `<div class="asset"><p>${esc(sentence(a.descripcion))}</p><dl>
        ${row("d_address", [a.direccion, a.cp, place(a.localidad), place(a.provincia)].filter(Boolean).join(", "))}
        ${rc ? `<dt>${esc(t("d_cadastre"))}</dt><dd>${rcLink}</dd>` : ""}
        ${row("d_possession", a.situacion_posesoria)}${row("d_visitable", a.visitable)}${row("d_charges", a.cargas)}</dl></div>`;
    }).join("");
    return `<div class="dv">
      ${media(s, true)}
      <div class="dv-head"><div><span class="muted" style="font-size:13px">${esc(what(s))} · ${esc(t("origin_" + s.origen))}</span>
        <h2 id="${idp}Title">${esc(city)}</h2><span class="dv-id">${esc(s.id)}</span>${addedLine(s) ? `<span class="dv-added">${isNew(s) ? `<span class="new-flag inline">${esc(t("new_badge"))}</span> ` : ""}${esc(addedLine(s))}</span>` : ""}</div>${favBtn(s)}</div>
      ${s.oculta ? `<div class="hid-note"><b>${esc(t("grp_oculta"))}</b><span>${esc(t("hid_note", { t: s.oculta }))}</span></div>` : ""}
      ${cancelledEarly(s) ? `<div class="off-note"><b>${esc(t("off_" + s.estado))}</b><span>${esc(t("off_note_" + s.estado))}</span></div>` : ""}
      <div class="dv-kv">
        <div><small>${esc(t("value"))}</small><b>${eur(s.valor_subasta)}</b></div>
        <div><small>${esc(t("appraisal"))}</small><b>${s.tasacion ? eur(s.tasacion) : "—"}</b></div>
        ${done(s) ? `<div class="${(result(s) || {}).tone === "ok" ? "good" : ""}"><small>${esc(t("col_bid"))}</small><b>${esc((result(s) || {}).label || "—")}</b></div>`
        : d ? `<div class="good"><small>${esc(t("col_disc"))}</small><b>−${d}%</b></div>` : `<div><small>${esc(t("min_bid"))}</small><b>${s.puja_minima != null ? eur(s.puja_minima) : esc(t("no_min"))}</b></div>`}
      </div>
      ${facts || bidsLine ? `<p class="cat-facts">${facts ? `<span>${esc(facts)}</span>` : ""}${bidsLine}</p>` : ""}
      ${ex && ex.dir ? `<p class="fine ex-dir">${ic("door")} ${esc(ex.dir)}</p>` : ""}
      ${valBlock}
      ${costBlock(s)}
      ${knownBlock(s)}
      ${checks.length ? `<h3>${esc(t("before_bid"))}</h3><ul class="chk">${checks.join("")}</ul>` : ""}
      ${done(s) && result(s) && result(s).pct ? `<p class="muted" style="margin:0 0 14px">${esc(t("hist_explain", { p: result(s).pct, v: eur(s.valor_subasta) }))}</p>` : ""}
      <div class="dv-cta"><div><small>${esc(done(s) ? t("ended_on", { d: dateFmt(s.fecha_fin, true) }) : t("closes_on", { d: dateFmt(s.fecha_fin, true) }))}</small><b class="${l.hot ? "hot" : ""}">${esc(done(s) ? t("s_" + s.estado) : l.long)}</b></div>
        <div class="dv-acts"><a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(t(s.fuente === "tgss" ? "open_tgss" : "open_boe"))} ${ic("ext")}</a>${done(s) ? "" : actButtons(s)}</div></div>
      ${s.fuente === "tgss" && !done(s) ? `<p class="fine">${esc(t("tgss_note", { l: s.lugar_subasta || s.autoridad || "" }))}</p>` : ""}
      ${done(s) ? "" : actHint(s)}
      <div class="dv-more">${NO_MAP.includes(s.categoria) ? "" : `<a class="btn ghost" href="${esc(gmapLink(mq))}" target="_blank" rel="noopener">${esc(t(ex ? "open_map_exact" : "open_map"))} ${ic("ext")}</a>`}
        ${ex && ex.mapa ? `<a class="btn ghost" href="${esc(ex.mapa)}" target="_blank" rel="noopener">${esc(t("open_cat_map"))} ${ic("ext")}</a>` : ""}
        ${calLinks(s)}
        ${atLeast("pro") && REAL_ESTATE_UI.includes(s.categoria) ? priceLinks(s) : ""}
        ${(s.documentos || []).slice(0, 6).map((d, i) => { const u = typeof d === "string" ? d : d.url; const n = typeof d === "string" ? `${t("doc")} ${i + 1}` : sentence(d.nombre); return `<a class="btn ghost" href="${esc(u)}" target="_blank" rel="noopener">${ic("file")} ${esc(n.length > 42 ? n.slice(0, 40) + "…" : n)}</a>`; }).join("")}</div>
      ${s.docs_login ? `<p class="fine" style="margin:8px 0 0">${esc(t("docs_login"))}</p>` : ""}
      ${adminDocs(s)}
      ${socBlock(s)}
      <details><summary>${esc(t("d_all"))}</summary>
        <div class="asset"><dl>
          <dt>${esc(t("date_start"))}</dt><dd>${dateFmt(s.fecha_inicio, true)}</dd>
          <dt>${esc(t("date_end"))}</dt><dd>${dateFmt(s.fecha_fin, true)}</dd>
          ${s.cantidad_reclamada ? `<dt>${esc(t("claimed"))}</dt><dd>${eur(s.cantidad_reclamada)}</dd>` : ""}
          ${s.tipo ? `<dt>${esc(t("d_type"))}</dt><dd>${esc(s.tipo)}</dd>` : ""}
          ${s.anuncio_boe ? `<dt>${esc(t("d_boe"))}</dt><dd>${esc(s.anuncio_boe)}</dd>` : ""}
          ${s.lotes ? `<dt>${esc(t("d_lots"))}</dt><dd>${esc(s.lotes)}</dd>` : ""}
          ${s.autoridad ? `<dt>${esc(t("d_authority"))}</dt><dd>${esc(s.autoridad)}</dd>` : ""}
        </dl></div>${assets}</details>
    </div>`;
  }
  function openDetail(id) {
    const s = all.find((x) => x.id === id);
    if (mode === "inversor" && s && window.matchMedia("(min-width:1001px)").matches) { selected = id; renderSide(); return; }
    const body = $("#detailBody");
    if (!s) {
      if (!locked()) return;
      body.innerHTML = `<div class="d-head"><button class="d-close" data-close aria-label="${esc(t("close"))}">${ic("x")}</button><h2 id="dTitle">${esc(t("locked_detail"))}</h2></div>
        <div class="d-body locked-box"><p class="muted">${esc(AUTH.user && AUTH.user() ? "" : t("lead_signup", { date: trialDate() }))}</p>${AUTH.user && AUTH.user() ? "" : `<button class="btn" data-locked="1">${esc(t("lock_cta_guest"))}</button>`}</div>`;
    } else {
      selected = id;
      body.innerHTML = `<div class="d-head"><button class="d-close" data-close aria-label="${esc(t("close"))}">${ic("x")}</button><h2 style="font-size:16px;color:var(--muted);font-weight:600">${esc(t("c_" + s.categoria))}</h2></div><div class="d-body">${detailHTML(s, "d")}</div>`;
    }
    const dlg = $("#detail");
    if (!dlg.open) dlg.showModal();
    if (svKey()) svAim(body);
    if (s && location.hash !== "#/s/" + encodeURIComponent(id)) history.replaceState(null, "", location.pathname + location.search + "#/s/" + encodeURIComponent(id));
    if (mode === "pro") $$(".p-row").forEach((b) => b.setAttribute("aria-selected", b.dataset.open === selected));
  }
  function closeDetail() {
    $("#detail").close();
    if (location.hash.startsWith("#/s/")) history.replaceState(null, "", location.pathname + location.search);
  }

  // ---------- карта
  function placeMap() {
    const m = $("#map");
    const target = mode === "pro" ? $("#proMap") : $("#mapWrap");
    $("#proMap").hidden = mode !== "pro";
    if (m.parentNode !== target) { target.insertBefore(m, target.firstChild); if (map) setTimeout(() => map.invalidateSize(), 50); }
  }
  let mapProv = "";
  function renderMap() {
    if (!window.L) return;
    if (!map) {
      map = L.map("map", { scrollWheelZoom: mode === "pro" });
      // подпись библиотеки — простой текстовой ссылкой, без значка-флага
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 18 }).addTo(map);
      map.fitBounds([[35.6, -9.6], [43.9, 4.5]]);
      mapLayer = L.layerGroup().addTo(map);
    }
    mapLayer.clearLayers();
    const st = Object.assign({}, state, { prov: "" });
    const c = count((s) => (matches(s, st) ? s._prov : null));
    const max = Math.max(1, ...Object.values(c));
    if (mode === "pro" && atLeast("pro")) {
      current.filter((s) => s._pro && s._pro.lat).slice(0, 600).forEach((s) => {
        L.circleMarker([s._pro.lat, s._pro.lon], { radius: 4, color: "#D24A0D", weight: 1, fillColor: "#D24A0D", fillOpacity: .9 })
          .bindTooltip(`${what(s)} · ${place(s.localidad) || ""} · ${eur(s.valor_subasta)}`).on("click", () => openDetail(s.id)).addTo(mapLayer);
      });
    }
    // выбрана провинция — на карте остаётся только она, карта приближается к ней
    if (state.prov !== mapProv) {
      mapProv = state.prov;
      const ll = PROVINCES[state.prov];
      if (ll) map.flyTo(ll, 8, { duration: .6 }); else map.flyToBounds([[35.6, -9.6], [43.9, 4.5]], { duration: .6 });
    }
    Object.entries(c).forEach(([p, n]) => {
      const ll = PROVINCES[p]; if (!ll) return;
      const sel = state.prov === p;
      if (state.prov && !sel) return;
      L.circleMarker(ll, { radius: 7 + 20 * Math.sqrt(n / max), color: sel ? "#1A1F1C" : "#1F4D3A", weight: sel ? 3 : 1.5, fillColor: sel ? "#D4A017" : "#1F4D3A", fillOpacity: sel ? .85 : .45 })
        .bindTooltip(`${place(p)}: ${n}`).on("click", () => { state.prov = sel ? "" : p; shown = CFG.pageSize; buildControls(); render(); })
        .addTo(mapLayer);
    });
  }
  function renderProvList() {
    const st = Object.assign({}, state, { prov: "" });
    const c = count((s) => (matches(s, st) ? s._prov || null : null));
    $("#provList").innerHTML = Object.entries(c).sort((a, b) => b[1] - a[1])
      .map(([p, n]) => `<button type="button" data-prov="${esc(p)}" aria-pressed="${state.prov === p}"><span>${esc(place(p))}</span><em>${n}</em></button>`).join("");
  }

  // ---------- режим отображения
  function allowedModes() {
    const st = AUTH.status || {};
    if (!AUTH.enabled || !AUTH.user || !AUTH.user() || st.trusted) return MODES;
    return Array.isArray(st.allowed_modes) && st.allowed_modes.length ? st.allowed_modes : MODES;
  }
  async function setMode(m, fromUser) {
    if (!MODES.includes(m) || !allowedModes().includes(m)) { if (fromUser) note(t("mode_locked")); return; }
    mode = m; store.set("mode", m);
    if (fromUser && AUTH.enabled && AUTH.user && AUTH.user() && AUTH.setViewMode) {
      try { await AUTH.setViewMode(m); } catch (e) { console.error(e); }
    }
    selected = null; shown = CFG.pageSize;
    renderModes(); buildControls(); render();
    if (map) setTimeout(() => { map.invalidateSize(); map.scrollWheelZoom[mode === "pro" ? "enable" : "disable"](); }, 60);
  }
  function renderModes() {
    const allow = allowedModes();
    $$("#modeSwitch button").forEach((b) => { b.setAttribute("aria-pressed", b.dataset.mode === mode); b.disabled = !allow.includes(b.dataset.mode); b.title = allow.includes(b.dataset.mode) ? t("mode_" + b.dataset.mode + "_d") : t("mode_locked"); });
    $("#modeCards").innerHTML = MODES.map((m) => `<button type="button" class="mode-card" role="radio" data-mode="${m}" aria-checked="${m === mode}"${allow.includes(m) ? "" : " disabled"}><div><b>${esc(t("mode_" + m))}</b><span>${esc(t("mode_" + m + "_d"))}</span></div></button>`).join("");
    $("#modeNote").hidden = allow.length === MODES.length;
    $("#modeNote").textContent = t("mode_locked");
  }

  // ---------- аккаунт и доступ
  function trialDate() { return day(AUTH.trialUntil || "2027-12-31"); }
  function renderAccount() {
    if (!AUTH.enabled) { $("#account").hidden = true; $("#setAccount").innerHTML = ""; return; }
    $("#account").hidden = false;
    const u = AUTH.user();
    $("#loginBtn").hidden = !!u; $("#signupTop").hidden = !!u; $("#userChip").hidden = !u;
    const st = AUTH.status || {};
    const access = u ? (st.trusted ? t("access_unlimited") : st.has_access ? t("access_until", { date: day(st.access_until) }) : t("access_none")) : "";
    if (u) {
      $("#userEmail").textContent = u.email || "";
      $("#userAccess").textContent = access;
      $("#userChip").classList.toggle("no-access", !st.has_access);
      $("#adminLink").hidden = !st.is_admin;
    }
    $("#setAccount").innerHTML = u
      ? `<p class="fine" style="width:100%;margin:0">${esc(u.email || "")} · ${esc(access)}</p><button class="btn soft" data-my-notas="1">${esc(t("nota_mine"))}</button>${st.is_admin ? `<a class="btn soft" href="admin.html">Панель управления</a>` : ""}<button class="btn ghost" data-act="logout">${esc(t("logout"))}</button>`
      : `<button class="btn" data-act="signup">${esc(t("cta_start"))}</button><button class="btn ghost" data-act="login">${esc(t("login"))}</button>`;
  }
  function renderLock() {
    const b = $("#lockBanner");
    if (!locked()) { b.hidden = true; return; }
    const u = AUTH.user && AUTH.user();
    const st = AUTH.status || {};
    const v = num(openNow().length), n = num(Math.max(meta.actuales || 0, openNow().length));
    let text = !u ? t("lock_guest", { v, n, date: trialDate() }) : (st.reason && !st.access_until) ? t("lock_denied") : t("lock_expired", { v, n });
    if (u && CFG.contactEmail) text += " " + t("lock_contact", { email: CFG.contactEmail });
    $("#lockText").textContent = text;
    $("#lockBtn").textContent = u ? t("lock_cta_user") : t("lock_cta_guest");
    $("#lockBtn").hidden = !!u && !CFG.contactEmail;
    b.hidden = false;
  }
  function lockAction() {
    if (AUTH.user && AUTH.user()) { if (CFG.contactEmail) location.href = "mailto:" + CFG.contactEmail; }
    else { if ($("#detail").open) $("#detail").close(); openAuth("signup"); }
  }
  let authMode = "signup";
  function openAuth(m) {
    if (!AUTH.enabled) return;
    authMode = m || "signup";
    const dlg = $("#authDlg");
    $$("#authTabs button").forEach((b) => b.classList.toggle("on", b.dataset.mode === authMode));
    $("#authTabs").hidden = authMode === "reset" || authMode === "recovery";
    const providers = CFG.oauthProviders || [];
    $$(".oauth-btn").forEach((b) => (b.hidden = !providers.includes(b.dataset.provider)));
    if (providers.includes("google") && CFG.googleClientId) renderGoogleButton();
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
    if ($("#settingsDlg").open) $("#settingsDlg").close();
    if (!dlg.open) dlg.showModal();
  }
  // Кнопка Google Identity Services: окно входа Google показывает домен сайта.
  // Если библиотека Google не загрузилась, остаётся обычная кнопка (вход через Supabase).
  let gsiNonce = "", gsiReady = false;
  async function sha256hex(s) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function renderGoogleButton() {
    const box = $("#gsiBtn"), fallback = $('.oauth-btn[data-provider="google"]');
    if (!window.google || !google.accounts || !google.accounts.id || !window.crypto || !crypto.subtle) {
      if (!renderGoogleButton._wait) { renderGoogleButton._wait = setTimeout(() => { renderGoogleButton._wait = 0; if ($("#authDlg").open) renderGoogleButton(); }, 800); }
      return;
    }
    gsiNonce = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)) + Date.now();
    google.accounts.id.initialize({
      client_id: CFG.googleClientId,
      nonce: await sha256hex(gsiNonce),
      callback: onGoogleCredential,
      use_fedcm_for_button: true,
      ux_mode: "popup",
      context: authMode === "login" ? "signin" : "signup"
    });
    box.innerHTML = "";
    google.accounts.id.renderButton(box, {
      type: "standard", theme: "outline", size: "large", shape: "rectangular",
      text: authMode === "login" ? "signin_with" : "signup_with",
      width: Math.min(400, Math.max(240, box.parentElement.clientWidth || 320)),
      locale: lang
    });
    box.hidden = false; fallback.hidden = true; gsiReady = true;
  }
  async function onGoogleCredential(resp) {
    try {
      const { error } = await AUTH.googleIdToken(resp.credential, gsiNonce);
      if (error) throw error;
      $("#authDlg").close();
    } catch (err) {
      console.error(err);
      authMsg(`${t("err_generic")} (${err.message || err})`);
    }
  }
  function authMsg(text, ok) { const m = $("#authMsg"); m.textContent = text; m.className = "auth-msg" + (ok ? " ok" : " err"); m.hidden = false; }
  async function submitAuth(e) {
    e.preventDefault();
    const email = $("#authEmail").value.trim(), pw = $("#authPw").value;
    const btn = $("#authSubmit"); btn.disabled = true;
    try {
      if (authMode === "signup") {
        const { data, error } = await AUTH.signUp(email, pw, lang);
        if (error) throw error;
        if (data.session) $("#authDlg").close(); else authMsg(t("msg_check_email"), true);
      } else if (authMode === "login") {
        const { error } = await AUTH.signIn(email, pw);
        if (error) return authMsg(t("err_login"));
        $("#authDlg").close();
      } else if (authMode === "reset") {
        await AUTH.reset(email); authMsg(t("msg_reset_sent"), true);
      } else if (authMode === "recovery") {
        const { error } = await AUTH.updatePassword(pw);
        if (error) throw error;
        authMsg(t("msg_pw_updated"), true); setTimeout(() => $("#authDlg").close(), 1200);
      }
    } catch (err) {
      console.error(err);
      authMsg(err && err.message ? `${t("err_generic")} (${err.message})` : t("err_generic"));
    } finally { btn.disabled = false; }
  }

  // ---------- избранное и сохранённые поиски
  function toggleFav(id) {
    favs.has(id) ? favs.delete(id) : favs.add(id);
    store.set("favs", [...favs]);
    updateFavCount();
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => { const on = favs.has(id); b.setAttribute("aria-pressed", on); b.setAttribute("aria-label", on ? t("fav_del") : t("fav_add")); });
    if (onlyFavs) render();
    favSync(id, favs.has(id));
  }
  // Избранное хранится и на сервере (таблица favoritos) — видно на всех устройствах.
  // У администратора добавление в избранное сразу скачивает документы аукциона с BOE.
  function favSync(id, on) {
    if (!AUTH.client || !(AUTH.user && AUTH.user())) return;
    const q = on ? AUTH.client.from("favoritos").upsert({ subasta_id: id }, { onConflict: "user_id,subasta_id", ignoreDuplicates: true })
      : AUTH.client.from("favoritos").delete().eq("subasta_id", id);
    q.then(({ error }) => { if (error) console.warn("favoritos", error.message); });
    if (on && isAdm()) {
      const s = all.find((x) => x.id === id) || (hist || []).find((x) => x.id === id) || {};
      AUTH.client.functions.invoke("docs-boe", { body: { id, rcs: (s.bienes || []).map((b) => b.ref_catastral).filter(Boolean) } })
        .then(() => filesFill(true)).catch((e) => console.warn("docs-boe", e));
    }
  }
  async function favPull() {
    if (!AUTH.client || !(AUTH.user && AUTH.user())) return;
    const { data, error } = await AUTH.client.from("favoritos").select("subasta_id");
    if (error) return console.warn("favoritos", error.message);
    const server = new Set(data.map((r) => r.subasta_id));
    const missing = [...favs].filter((id) => !server.has(id));   // локальные — отправляем на сервер
    if (missing.length) AUTH.client.from("favoritos").upsert(missing.map((subasta_id) => ({ subasta_id })), { onConflict: "user_id,subasta_id", ignoreDuplicates: true }).then(() => {});
    server.forEach((id) => favs.add(id));
    store.set("favs", [...favs]); updateFavCount();
  }
  function updateFavCount() {
    $("#favCount").textContent = favs.size;
    $("#favCountTab").textContent = favs.size; $("#favCountTab").hidden = !favs.size;
  }
  const searches = () => store.get("searches", (() => { const old = store.get("saved", null); return old ? [{ id: "s1", name: "", state: old.state, seen: old.seen || [] }] : []; })());
  function saveSearch() {
    const list = searches();
    const st = Object.assign({}, state, { origin: state.origin.slice() });
    const name = resultTitle(current.length);
    const same = list.find((x) => JSON.stringify(x.state) === JSON.stringify(st));
    if (same) { note(t("saved_dup")); return; }
    list.unshift({ id: "s" + Date.now(), name, state: st, seen: all.filter((s) => matches(s, st)).map((s) => s.id) });
    store.set("searches", list.slice(0, 10));
    renderSaved(); note(t("saved_ok"));
  }
  function renderSaved() {
    const list = searches();
    $("#savedList").innerHTML = list.length ? list.map((x) => {
      const seen = new Set(x.seen || []);
      const fresh = all.filter((s) => matches(s, Object.assign({}, DEFAULTS, x.state)) && !seen.has(s.id)).length;
      return `<li><span>${esc(x.name || "—")}${fresh ? ` · <b>${esc(t("n_new", { n: fresh }))}</b>` : ""}</span><div><button class="btn soft" data-ss="${x.id}">${esc(t("show"))}</button><button class="btn ghost" data-ssdel="${x.id}" aria-label="${esc(t("remove"))}">${ic("x")}</button></div></li>`;
    }).join("") : `<li><span class="muted">${esc(t("saved_none"))}</span></li>`;
  }
  function applySaved(id) {
    const list = searches(); const x = list.find((y) => y.id === id); if (!x) return;
    Object.assign(state, DEFAULTS, x.state, { origin: (x.state.origin || []).slice() });
    x.seen = all.filter((s) => matches(s, Object.assign({}, DEFAULTS, x.state))).map((s) => s.id);
    store.set("searches", list); onlyFavs = false; shown = CFG.pageSize;
    buildControls(); render(); renderSaved(); $("#savedNotice").hidden = true;
    $("#catalogo").scrollIntoView({ block: "start" }); $("#catalogo").focus({ preventScroll: true });
  }
  function checkSaved() {
    const list = searches();
    let total = 0, first = null;
    list.forEach((x) => { const seen = new Set(x.seen || []); const n = all.filter((s) => matches(s, Object.assign({}, DEFAULTS, x.state)) && !seen.has(s.id)).length; if (n && !first) first = x; total += n; });
    if (!total) return;
    note(`<b>${num(total)}</b> ${esc(t("new_since"))} <button class="btn white" data-ss="${first.id}">${esc(t("show"))}</button>`, true, true);
  }
  function note(html, sticky, raw) {
    const n = $("#savedNotice"); n.firstElementChild.innerHTML = raw ? html : esc(html); n.hidden = false;
    clearTimeout(note._t); if (!sticky) note._t = setTimeout(() => (n.hidden = true), 4500);
  }

  // ---------- почтовые оповещения о новых аукционах
  const AL_CATS = [["vivienda", "al_c_viv"], ["g_garaje", "al_c_gar"], ["g_local", "al_c_loc"], ["g_terreno", "al_c_ter"], ["", "al_c_any"]];
  const AL_MAX = ["50000", "100000", "200000", ""];
  let myAlerts = null, alSel = null, alBound = false, alBroken = false;
  const canAlerts = () => !!(AUTH.enabled && AUTH.alertas && AUTH.user && AUTH.user());
  function alertLabel(a) {
    const c = a.categoria ? t(a.categoria === "oculta" ? "grp_oculta" : (AL_CATS.find((x) => x[0] === a.categoria) || [, "al_c_any"])[1]) : t("al_c_any");
    return [c, a.provincia ? place(a.provincia) : t("all_spain"), a.max_valor ? t("upto", { v: eur(+a.max_valor) }) : ""].filter(Boolean).join(" · ");
  }
  async function loadAlerts() {
    if (!canAlerts()) { myAlerts = null; renderAlerts(); return; }
    try { myAlerts = await AUTH.alertas.list(); alBroken = false; } catch (e) { console.error("alertas", e); myAlerts = null; alBroken = true; }
    renderAlerts();
  }
  function renderAlerts() {
    const box = $("#mailAlerts"); if (!box) return;
    box.hidden = !AUTH.enabled || alBroken;
    if (box.hidden) return;
    const u = AUTH.user && AUTH.user();
    $("#alertList").innerHTML = !u ? `<li><span class="muted">${esc(t("al_login"))}</span></li>`
      : myAlerts && myAlerts.length ? myAlerts.map((a) => `<li class="${a.activa ? "" : "al-off"}"><span>${esc(alertLabel(a))}${a.activa ? "" : ` · <em>${esc(t("al_paused"))}</em>`}</span><div>
          <button class="btn soft" data-altog="${a.id}" data-on="${a.activa ? 0 : 1}">${esc(t(a.activa ? "al_pause" : "al_resume"))}</button>
          <button class="btn ghost" data-aldel="${a.id}" aria-label="${esc(t("remove"))}">${ic("x")}</button></div></li>`).join("")
      : `<li><span class="muted">${esc(t("al_none"))}</span></li>`;
    $("#alertNew").textContent = t(u ? "al_new" : "lock_cta_guest");
  }
  function alertCount(sel) {
    const st = Object.assign({}, DEFAULTS, { prov: sel.prov, cat: sel.cat, max: sel.max, status: "open" });
    const f = onlyFavs; onlyFavs = false;
    const list = all.filter((s) => matches(s, st));
    onlyFavs = f;
    return list;
  }
  function alertDialogHTML() {
    const list = alertCount(alSel);
    const ex = list.slice().sort((a, b) => (b.detectada || "").localeCompare(a.detectada || "")).slice(0, 3);
    const provs = Object.keys(PROVINCES).sort((a, b) => place(a).localeCompare(place(b), "es"));
    const chip = (k, v, label) => `<button type="button" class="al-chip" data-al="${k}" data-v="${esc(v)}" aria-pressed="${alSel[k] === v}">${esc(label)}</button>`;
    return `<div class="d-head">${closeBtn()}<h2 id="alTitle">${esc(t("al_q_title"))}</h2><p class="muted" style="margin:6px 52px 0 0">${esc(t("al_q_lead"))}</p></div>
      <div class="d-body al-form">
        <label class="al-l">${esc(t("al_q_prov"))}<select id="alProv"><option value="">${esc(t("all_spain"))}</option>${provs.map((p) => `<option value="${esc(p)}"${alSel.prov === p ? " selected" : ""}>${esc(place(p))}</option>`).join("")}</select></label>
        <div class="al-l">${esc(t("al_q_what"))}<div class="al-chips">${AL_CATS.map(([v, k]) => chip("cat", v, t(k))).join("")}</div></div>
        <div class="al-l">${esc(t("al_q_max"))}<div class="al-chips">${AL_MAX.map((v) => chip("max", v, v ? eur(+v) : t("al_nolimit"))).join("")}</div></div>
        <div class="al-res"><b>${esc(t("al_q_now", { n: num(list.length) }))}</b>
          ${ex.length ? `<ul>${ex.map((s) => `<li><span>${esc(what(s))}, ${esc(place(s.localidad) || place(s._prov))}</span><b>${eur(s.valor_subasta)}</b></li>`).join("")}</ul>` : ""}
          <small>${esc(t("al_q_how"))}</small></div>
        <div class="al-acts"><button type="button" class="btn" id="alSave">${esc(t("al_activate"))}</button><button type="button" class="btn ghost" data-close>${esc(t("al_later"))}</button></div>
        <p class="fine al-err" id="alErr" hidden></p>
      </div>`;
  }
  function openAlertDialog(pre) {
    if (!canAlerts()) { openAuth("signup"); return; }
    const grp = AL_CATS.some((x) => x[0] === pre.cat) ? pre.cat : (GROUPS.find((g) => g.cats.includes(pre.cat)) || {}).id || "";
    alSel = { prov: pre.prov || "", cat: grp, max: AL_MAX.includes(String(pre.max || "")) ? String(pre.max || "") : (pre.max ? "" : "") };
    let d = $("#alertDlg");
    if (!d) {
      d = document.createElement("dialog"); d.id = "alertDlg"; d.className = "dlg alert-dlg"; d.setAttribute("aria-labelledby", "alTitle");
      document.body.appendChild(d);
      d.addEventListener("click", async (e) => {
        if (e.target === d || e.target.closest("[data-close]")) { d.close(); return; }
        const c = e.target.closest("[data-al]");
        if (c) { alSel[c.dataset.al] = c.dataset.v; d.innerHTML = alertDialogHTML(); return; }
        if (e.target.closest("#alSave")) {
          const b = $("#alSave"); b.disabled = true;
          try {
            await AUTH.alertas.create({ provincia: alSel.prov || null, categoria: alSel.cat || null, max_valor: alSel.max ? +alSel.max : null, idioma: lang });
            d.close(); note(t("al_ok")); await loadAlerts();
          } catch (err) {
            b.disabled = false; const m = $("#alErr"); m.hidden = false;
            m.textContent = String(err && err.message || "").includes("too_many") ? t("al_err_many") : t("err_generic");
          }
        }
      });
      d.addEventListener("change", (e) => { if (e.target.id === "alProv") { alSel.prov = e.target.value; d.innerHTML = alertDialogHTML(); } });
    }
    d.innerHTML = alertDialogHTML();
    if (!d.open) d.showModal();
  }
  // Сразу после регистрации/входа: один раз предлагаем включить оповещение (как у конкурентов, но без навязчивости)
  async function maybeAskAlert() {
    if (!canAlerts() || !all.length) return;
    const k = "alert_ask_" + AUTH.user().id;
    if (store.get(k)) return;
    if (myAlerts === null) await loadAlerts();
    if (myAlerts === null) return;
    store.set(k, 1);
    if (myAlerts.length || $("dialog[open]")) return;
    openAlertDialog({ prov: state.prov, cat: state.cat, max: state.max });
  }
  function bindAlerts() {
    if (alBound || !$("#mailAlerts")) return; alBound = true;
    $("#mailAlerts").addEventListener("click", async (e) => {
      if (e.target.closest("#alertNew")) { if (canAlerts()) openAlertDialog({ prov: state.prov, cat: state.cat, max: state.max }); else openAuth("signup"); return; }
      const del = e.target.closest("[data-aldel]");
      const tog = e.target.closest("[data-altog]");
      try {
        if (del) { await AUTH.alertas.remove(+del.dataset.aldel); await loadAlerts(); }
        if (tog) { await AUTH.alertas.toggle(+tog.dataset.altog, tog.dataset.on === "1"); await loadAlerts(); }
      } catch (err) { console.error(err); note(t("err_generic")); }
    });
  }

  // ---------- URL
  function writeUrl() {
    const p = new URLSearchParams();
    Object.entries(state).forEach(([k, v]) => {
      const def = k === "status" ? defStatus() : DEFAULTS[k];
      if (Array.isArray(v) ? v.length : v !== "" && v !== def) p.set(k, Array.isArray(v) ? v.join(",") : v);
    });
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }
  function readUrl() {
    const p = new URLSearchParams(location.search);
    Object.keys(state).forEach((k) => { if (p.has(k)) state[k] = k === "origin" ? p.get(k).split(",").filter(Boolean) : p.get(k); });
    statusTouched = p.has("status");
    if (p.has("mode") && MODES.includes(p.get("mode"))) mode = p.get("mode");
  }

  // ---------- i18n применить
  function applyI18n() {
    document.documentElement.lang = lang;
    $$("[data-i]").forEach((el) => (el.textContent = t(el.dataset.i)));
    $$("[data-i-ph]").forEach((el) => (el.placeholder = t(el.dataset.iPh)));
    $$("[data-i-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.iAria)));
    $$(".lang button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === lang));
    $("#pMin").placeholder = t("f_min"); $("#pMax").placeholder = t("f_max");
    $("#kbdHelpDummy");
    renderModes(); buildControls(); render(); renderAccount(); renderSaved(); renderAlerts();
  }

  // ---------- события
  function onType(el) { const tg = el.target || el; return tg && (tg.tagName === "INPUT" || tg.tagName === "SELECT" || tg.tagName === "TEXTAREA" || tg.isContentEditable); }
  function moveSel(dir) {
    if (!current.length) return;
    let i = current.findIndex((s) => s.id === selected);
    i = Math.max(0, Math.min(current.length - 1, (i < 0 ? -1 : i) + dir));
    if (i >= shown) { shown = i + 1; render(); }
    selected = current[i].id;
    if (mode === "inversor") renderSide();
    const el = $(`[data-id="${CSS.escape(selected)}"]`) || $(`.p-row[data-open="${CSS.escape(selected)}"]`);
    $$(".p-row").forEach((b) => b.setAttribute("aria-selected", b.dataset.open === selected));
    if (el) el.scrollIntoView({ block: "nearest" });
  }
  function bind() {
    let timer;
    $("#q").addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); shown = CFG.pageSize; render(); }, 180); });
    $("#segs").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (!b) return; state.cat = b.dataset.cat; shown = CFG.pageSize; buildControls(); render(); });
    $("#fOrigin").addEventListener("click", (e) => {
      const b = e.target.closest("[data-o]"); if (!b) return;
      const o = b.dataset.o; state.origin = state.origin.includes(o) ? state.origin.filter((x) => x !== o) : [...state.origin, o];
      shown = CFG.pageSize; buildControls(); render();
    });
    [["#fCat", "cat"], ["#fProv", "prov"], ["#fStatus", "status"], ["#fFresh", "fresh"], ["#sort", "sort"], ["#fPrice", "max"]].forEach(([sel, k]) =>
      $(sel).addEventListener("change", (e) => { state[k] = e.target.value; if (k === "status") statusTouched = true; shown = CFG.pageSize; buildControls(); render(); }));
    $("#fRisk").addEventListener("change", (e) => { state.norisk = e.target.checked ? "1" : ""; buildControls(); render(); });
    const range = () => {
      const a = $("#pMin").value, b = $("#pMax").value;
      const bad = a !== "" && b !== "" && +a > +b;
      $("#rangeErr").hidden = !bad; $("#rangeErr").textContent = bad ? t("range_err") : "";
      if (bad) return;
      state.min = a; state.max = b; shown = CFG.pageSize; buildControls(); render();
    };
    ["#pMin", "#pMax"].forEach((sel) => $(sel).addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(range, 350); }));
    $("#moreFilters").onclick = () => { const a = $("#adv"); a.hidden = !a.hidden; $("#moreFilters").setAttribute("aria-expanded", !a.hidden); };
    $("#saveSearch").onclick = saveSearch;
    $("#more").onclick = () => { shown += CFG.pageSize || 24; render(); };
    document.addEventListener("input", (e) => { if (e.target.matches && e.target.matches("[data-cost-range]")) costUpdate(e.target); });
    document.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]"); if (rm) { removeFilter(rm.dataset.rm); return; }
      const f = e.target.closest("[data-fav]"); if (f) { e.preventDefault(); e.stopPropagation(); toggleFav(f.dataset.fav); return; }
      const lk = e.target.closest("[data-locked]"); if (lk) { lockAction(); return; }
      const nt = e.target.closest("[data-nota]"); if (nt) { openNota(nt.dataset.nota, "nota"); return; }
      const pk = e.target.closest("[data-pack]"); if (pk) { openNota(pk.dataset.pack, "pack"); return; }
      const sc = e.target.closest("[data-soc-k]"); if (sc) { socToggle(sc); return; }
      const db = e.target.closest("[data-docs-boe]"); if (db) { docsBoe(db); return; }
      const fa = e.target.closest("[data-foto-main],[data-foto-vis]"); if (fa) { fotoAction(fa); return; }
      const ics = e.target.closest("[data-ics]"); if (ics) { downloadIcs(ics.dataset.ics); return; }
      const dop = e.target.closest("[data-doc-open]"); if (dop) {
        const path = dop.closest("[data-path]").dataset.path;
        AUTH.client.storage.from("docs").createSignedUrl(path, 600).then(({ data, error }) => { if (error) throw error; window.open(data.signedUrl, "_blank", "noopener"); }).catch((er) => alert(er.message || er));
        return;
      }
      const dd = e.target.closest("[data-doc-del]"); if (dd) {
        const li = dd.closest("[data-path]");
        if (!confirm("Удалить файл?")) return;
        (async () => {
          await AUTH.client.storage.from("docs").remove([li.dataset.path]);
          const { error } = await AUTH.client.from("subasta_docs").delete().eq("id", li.dataset.fid);
          if (error) alert(error.message); else li.remove();
        })();
        return;
      }
      const nm = e.target.closest("[data-my-notas]"); if (nm) { e.preventDefault(); $("#settingsDlg").open && $("#settingsDlg").close(); openMyNotas(); return; }
      const np = e.target.closest("[data-nota-pdf]"); if (np) { np.disabled = true; AUTH.notaUrl(np.dataset.notaPdf).then((u) => { window.open(u, "_blank", "noopener"); }).catch(console.error).finally(() => { np.disabled = false; }); return; }
      const nc = e.target.closest("[data-nota-cancel]"); if (nc) { AUTH.notaCancelar(+nc.dataset.notaCancel).then(openMyNotas).catch(console.error); return; }
      const ss = e.target.closest("[data-ss]"); if (ss) { applySaved(ss.dataset.ss); return; }
      const sd = e.target.closest("[data-ssdel]"); if (sd) { store.set("searches", searches().filter((x) => x.id !== sd.dataset.ssdel)); renderSaved(); return; }
      const so = e.target.closest("[data-sort]"); if (so) { state.sort = so.dataset.sort; buildControls(); render(); return; }
      const op = e.target.closest("[data-open]"); if (op) { e.preventDefault(); openDetail(op.dataset.open); return; }
      const tr = e.target.closest(".t tbody tr"); if (tr) { openDetail(tr.dataset.id); return; }
      const act = e.target.closest("[data-act]");
      if (act) { const a = act.dataset.act; if (a === "logout") { $("#settingsDlg").close(); AUTH.signOut(); } else openAuth(a); return; }
    });
    $("#provList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-prov]"); if (!b) return;
      state.prov = state.prov === b.dataset.prov ? "" : b.dataset.prov; shown = CFG.pageSize; buildControls(); render();
      $("#catalogo").scrollIntoView({ block: "start" });
    });
    $("#detail").addEventListener("click", (e) => { if (e.target.id === "detail" || e.target.closest("[data-close]")) closeDetail(); });
    $("#detail").addEventListener("cancel", (e) => { e.preventDefault(); closeDetail(); });
    ["#settingsDlg", "#authDlg"].forEach((sel) => $(sel).addEventListener("click", (e) => { if (e.target === $(sel) || e.target.closest("[data-close]")) $(sel).close(); }));
    $$(".lang button").forEach((b) => (b.onclick = () => { lang = b.dataset.lang; store.set("lang", lang); applyI18n(); }));
    $("#modeSwitch").addEventListener("click", (e) => { const b = e.target.closest("[data-mode]"); if (b) setMode(b.dataset.mode, true); });
    $("#modeCards").addEventListener("click", (e) => { const b = e.target.closest("[data-mode]"); if (b) setMode(b.dataset.mode, true); });
    $("#settingsBtn").onclick = () => $("#settingsDlg").showModal();
    $$("[data-nav]").forEach((a) => a.addEventListener("click", (e) => {
      const n = a.dataset.nav;
      if (n === "hist") { e.preventDefault(); onlyFavs = false; state.status = "finalizada"; statusTouched = true; shown = CFG.pageSize; buildControls(); render(); $("#catalogo").scrollIntoView({ block: "start" }); }
      if (n === "list" || n === "saved") { e.preventDefault(); onlyFavs = n === "saved"; shown = CFG.pageSize; render(); $("#catalogo").scrollIntoView({ block: "start" }); }
      if (n === "map" && mode === "pro") { e.preventDefault(); $("#proMap").scrollIntoView({ block: "start" }); }
      $$(".nav a").forEach((x) => x.classList.toggle("on", x === a));
    }));
    $("#tabbar").addEventListener("click", (e) => {
      const a = e.target.closest("[data-tab]"); if (!a) return;
      const k = a.dataset.tab;
      $$("#tabbar [data-tab]").forEach((x) => x.setAttribute("aria-current", x === a));
      if (k === "settings") { e.preventDefault(); $("#settingsDlg").showModal(); return; }
      if (k === "search") { e.preventDefault(); onlyFavs = false; render(); window.scrollTo({ top: 0 }); $("#q").focus(); }
      if (k === "saved") { e.preventDefault(); onlyFavs = true; render(); $("#catalogo").scrollIntoView({ block: "start" }); }
      if (k === "map" && mode === "pro") { e.preventDefault(); $("#proMap").scrollIntoView({ block: "start" }); }
    });
    // Горячие клавиши (Инвестор / Про)
    document.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/" && !onType(e)) { e.preventDefault(); $("#q").focus(); return; }
      if (onType(e) || mode === "novato" || $("dialog[open]")) return;
      if (e.key === "j" || e.key === "ArrowDown" && e.target === document.body) { e.preventDefault(); moveSel(1); }
      else if (e.key === "k" || e.key === "ArrowUp" && e.target === document.body) { e.preventDefault(); moveSel(-1); }
      else if (e.key === "Enter" && selected && e.target === document.body) { e.preventDefault(); openDetail(selected); }
      else if (e.key === "s" && selected) { e.preventDefault(); toggleFav(selected); }
    });
    window.addEventListener("hashchange", () => { const m = location.hash.match(/^#\/s\/(.+)$/); if (m) openDetail(decodeURIComponent(m[1])); });
    let rz, wasNarrow = narrow(); window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (narrow() !== wasNarrow) { wasNarrow = narrow(); render(); } else renderSide(); }, 150); });
  }
  function bindAuth() {
    if (!AUTH.enabled) return;
    $("#loginBtn").onclick = () => openAuth("login");
    $("#signupTop").onclick = () => openAuth("signup");
    $("#lockBtn").onclick = lockAction;
    $("#authTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-mode]"); if (b) openAuth(b.dataset.mode); });
    $("#forgotBtn").onclick = () => openAuth("reset");
    $("#authForm").addEventListener("submit", submitAuth);
    $$(".oauth-btn").forEach((b) => (b.onclick = async () => { const { error } = await AUTH.oauth(b.dataset.provider); if (error) authMsg(`${t("err_generic")} (${error.message})`); }));
    $("#userBtn").onclick = () => { const m = $("#userMenu"); m.hidden = !m.hidden; $("#userBtn").setAttribute("aria-expanded", !m.hidden); };
    $("#logoutBtn").onclick = async () => { $("#userMenu").hidden = true; await AUTH.signOut(); };
    AUTH.on(async (type) => {
      if (type === "recovery") return openAuth("recovery");
      if (goNext()) return;
      syncModeFromProfile();
      favPull();
      await loadData();
      if (!statusTouched) state.status = defStatus();
      applyI18n(); checkSaved();
      await loadAlerts(); setTimeout(maybeAskAlert, 1200);
    });
  }
  // после входа возвращаем туда, откуда пришли (не дольше 30 минут)
  function goNext() {
    const n = store.get("next");
    if (!n || !(AUTH.user && AUTH.user())) return false;
    store.set("next", null);
    if (Date.now() - n.ts > 30 * 60 * 1000 || !/^[a-z0-9_-]+\.html/i.test(n.u)) return false;
    location.href = n.u;
    return true;
  }
  function syncModeFromProfile() {
    const st = AUTH.status || {};
    if (st.view_mode && MODES.includes(st.view_mode) && allowedModes().includes(st.view_mode)) { mode = st.view_mode; store.set("mode", mode); }
    if (!allowedModes().includes(mode)) mode = allowedModes()[0] || "novato";
  }

  // ---------- данные
  async function loadData() {
    meta = await fetch("data/meta.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({}));
    try {
      if (AUTH.enabled) {
        all = await AUTH.loadSubastas(); isDemo = false;
        const ex = await AUTH.loadExtra().catch(() => ({}));
        all.forEach((s) => { const e = ex[s.id]; if (e) { s._inv = e.inversor; s._pro = e.pro; } });
      }
      // база ещё пустая (первый запуск) — показываем открытый файл, если он есть
      if (!AUTH.enabled || !all.length) {
        const d = await fetch("data/subastas.json", { cache: "no-cache" }).then((r) => r.json());
        all = d.subastas || d || []; isDemo = !!d.demo;
        if (!meta.actualizado) meta.actualizado = d.generado;
      }
    } catch (e) { console.error("data", e); all = []; }
    all.forEach(prep);
    if (hist) mergeHist();
    await loadFotos();
    applyFotos(all);
    const fresh = all.filter((s) => s.detectada && (Date.now() - new Date(s.detectada).getTime()) < 864e5).length;
    newShare = all.length ? fresh / all.length : 0;
  }
  function prep(s) {
      s._prov = window.normProvince(s.provincia);
      s._risk = riskOf(s);
      s._text = [s.id, s.titulo, s.localidad, s.provincia, s.direccion, s.cp, s.tipo,
        ...(s.bienes || []).map((b) => [b.descripcion, b.ref_catastral, b.matricula].join(" "))]
        .join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  // Фото объекта из документов аукциона (таблица subasta_fotos, публичное хранилище fotos/)
  let fotoMap = new Map();
  async function loadFotos() {
    if (!AUTH.client) return;
    try {
      const { data, error } = await AUTH.client.from("subasta_fotos").select("subasta_id,path,portada,visible,score").eq("visible", true).order("portada", { ascending: false }).order("score", { ascending: false }).limit(5000);
      if (error) throw error;
      const base = CFG.supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/public/fotos/";
      fotoMap = new Map();
      data.forEach((f) => { if (!fotoMap.has(f.subasta_id)) fotoMap.set(f.subasta_id, []); fotoMap.get(f.subasta_id).push(base + f.path.split("/").map(encodeURIComponent).join("/")); });
    } catch (e) { console.warn("fotos", e); }
  }
  function applyFotos(list) {
    list.forEach((s) => {
      if (!("_fotos0" in s)) s._fotos0 = s.fotos || [];
      const extra = fotoMap.get(s.id);
      s.fotos = extra ? [...extra, ...s._fotos0] : s._fotos0;
    });
  }
  function mergeHist() {
    const byId = new Map(all.map((s) => [s.id, s]));
    hist.forEach((s) => byId.set(s.id, s));   // в архиве есть итоговая ставка — он важнее
    all = [...byId.values()];
    applyFotos(all);
  }
  // Архив грузится только когда пользователь выбрал завершённые
  function ensureHistory() {
    if (hist) return Promise.resolve();
    if (histLoading) return histLoading;
    histLoading = (async () => {
      histIdx = await fetch("data/historico/index.json", { cache: "no-cache" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      const months = histIdx ? Object.keys(histIdx.meses || {}).filter((m) => histIdx.meses[m].count).sort().reverse() : [];
      const v = histIdx && histIdx.actualizado ? encodeURIComponent(histIdx.actualizado) : "";
      const parts = await Promise.all(months.map((m) => fetch(`data/historico/${m}.json?v=${v}`).then((x) => x.json()).then((d) => d.subastas || []).catch(() => [])));
      hist = parts.flat();
      // координаты архивных лотов (по кадастровому номеру) — для точной карты и Street View в тарифе Про
      if (AUTH.enabled && AUTH.archivoGeo && atLeast("pro")) {
        const geo = await AUTH.archivoGeo().catch(() => ({}));
        hist.forEach((s) => { const g = geo[s.id]; if (g && !s._pro) s._pro = { lat: g[0], lon: g[1] }; });
      }
      hist.forEach(prep);
      mergeHist();
    })();
    return histLoading;
  }
  function monthName(ym) { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: "long", year: "numeric" }); }

  // ---------- старт
  async function boot() {
    $("#brandName").textContent = CFG.name || "Subástica";
    if (CFG.rssUrl) $("#rssLink").href = CFG.rssUrl;
    if (CFG.telegramUrl) { $("#tgLink").href = CFG.telegramUrl; $("#tgLink").hidden = false; }
    updateFavCount();
    if (AUTH.enabled) { try { await AUTH.init(); } catch (e) { console.error(e); } syncModeFromProfile(); favPull(); }
    readUrl(); bind(); bindAuth();
    if (!statusTouched) state.status = defStatus();
    await loadData();
    $("#demoBanner").hidden = !isDemo;
    applyI18n(); checkSaved();
    const m = location.hash.match(/^#\/s\/(.+)$/); if (m) openDetail(decodeURIComponent(m[1]));
    bindAlerts(); loadAlerts().then(() => setTimeout(maybeAskAlert, 1500));
    // переход с других страниц: ./?auth=login&next=servicios.html…
    const qa = new URLSearchParams(location.search);
    if (qa.get("next")) { const nx = qa.get("next"); if (/^[a-z0-9_-]+\.html/i.test(nx)) store.set("next", { u: nx, ts: Date.now() }); }
    if (!goNext() && ["login", "signup"].includes(qa.get("auth")) && !(AUTH.user && AUTH.user())) openAuth(qa.get("auth"));
    setInterval(() => { if (!document.hidden && !$("dialog[open]")) render(); }, 60000);
  }
  boot();
})();
