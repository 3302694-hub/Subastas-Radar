// Страница курса «Обучение»: программа, оплата через Telegram-бота, уроки по расписанию от даты старта.
// Доступ решает сервер: curso_estado() и RLS на curso_contenido (текст урока приходит, только если урок открыт).
(function () {
  "use strict";
  const A = window.Auth || { enabled: false };
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("sr_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("sr_" + k, JSON.stringify(v)); } catch (e) { /* */ } }
  };
  const qs = new URLSearchParams(location.search);
  const nav = (navigator.language || "es").slice(0, 2);
  let lang = qs.get("lang") || store.get("lang") || (nav === "ru" ? "ru" : nav === "en" ? "en" : "es");
  if (!["es", "en", "ru"].includes(lang)) lang = "es";
  store.set("lang", lang);

  const T = {
    es: {
      kicker: "Curso · 34 lecciones", title: "Subastas del BOE: de cero a tu primera puja",
      lead: "Un curso para compradores extranjeros: qué se vende y quién lo vende, qué documentos necesitas, cómo leer un lote, qué cargas y deudas se quedan contigo, cuánto cuesta de verdad y cómo pujar en el Portal del BOE.",
      facts: [["6 módulos, 34 lecciones", "En español, inglés y ruso. Cada lección se lee en 5–10 minutos."], ["Desde tu fecha de inicio", "Tu curso empieza el día del pago. Dos lecciones nuevas por semana, unas 16 semanas."], ["Fuentes oficiales", "LEC, BOE, Agencia Tributaria, Catastro. Con ejemplos de lotes reales."]],
      price: "Precio", stars: "{n} Telegram Stars", pay: "Pagar en Telegram", pay_note: "El pago se hace en Telegram Stars en nuestro bot. Después el curso se abre solo en esta cuenta.",
      waiting: "Esperando el pago en Telegram… Esta página se actualizará sola.", refresh: "Ya he pagado, comprobar",
      soon: "La venta del curso abrirá pronto. Mientras tanto puedes ver el programa.",
      login_t: "Entra para comprar el curso", login_d: "El acceso se abre en tu cuenta de Subástica. La cuenta es gratuita.", signup: "Crear cuenta", login: "Entrar",
      active: "Tu curso empezó el {d}.", active_all: "Todas las lecciones publicadas están abiertas.", until: "Acceso hasta el {d}.", tag: "Etiqueta", progress: "{n} de {t} lecciones leídas",
      closed: "Tu acceso al curso está cerrado. Si crees que es un error, escríbenos a {mail}.",
      expired: "Tu acceso terminó el {d}. Puedes renovarlo pagando de nuevo.",
      admin: "Vista de administrador: ves todas las lecciones, también las no publicadas.",
      program: "Programa", m: ["Introducción", "Fundamentos: qué se vende y quién vende", "Para extranjeros: qué preparar antes de pujar", "Cómo leer un lote", "Tipos de subasta: cada uno con sus reglas", "Dinero: el presupuesto completo", "Tu primera puja y lo que viene después"],
      open: "Abierta", opens: "Se abre el {d}", draft: "En preparación", locked: "Con el curso", read: "Leída",
      back_prog: "← Programa", prev: "← Anterior", next: "Siguiente →", mark: "Marcar como leída", marked: "Leída ✓",
      no_text: "Esta lección aún no tiene texto en este idioma.", fallback: "Texto disponible en {l}:",
      not_open: "Esta lección todavía no está abierta para ti.",
      err: "No se pudo cargar. Recarga la página.", err_token: "No se pudo crear el enlace de pago. Inténtalo de nuevo en unos minutos.",
      disc: "Información general, no es asesoramiento jurídico ni de inversión.", backsite: "← Volver a Subástica", ln: { es: "español", en: "inglés", ru: "ruso" }
    },
    en: {
      kicker: "Course · 34 lessons", title: "BOE auctions: from zero to your first bid",
      lead: "A course for foreign buyers: what is sold and who sells it, which documents you need, how to read a lot, which charges and debts stay with you, what it really costs and how to bid on the BOE portal.",
      facts: [["6 modules, 34 lessons", "In Spanish, English and Russian. Each lesson takes 5–10 minutes."], ["From your own start date", "Your course starts on the day you pay. Two new lessons a week, about 16 weeks."], ["Official sources", "Civil Procedure Act, BOE, Tax Agency, Cadastre. With real lots as examples."]],
      price: "Price", stars: "{n} Telegram Stars", pay: "Pay in Telegram", pay_note: "Payment is in Telegram Stars through our bot. The course then opens in this account automatically.",
      waiting: "Waiting for payment in Telegram… This page will update by itself.", refresh: "I've paid, check now",
      soon: "Course sales will open soon. Meanwhile you can see the programme.",
      login_t: "Sign in to buy the course", login_d: "Access opens in your Subástica account. The account is free.", signup: "Create account", login: "Sign in",
      active: "Your course started on {d}.", active_all: "All published lessons are open.", until: "Access until {d}.", tag: "Tag", progress: "{n} of {t} lessons read",
      closed: "Your course access is closed. If you think this is a mistake, write to {mail}.",
      expired: "Your access ended on {d}. You can renew it by paying again.",
      admin: "Admin view: you see every lesson, including unpublished ones.",
      program: "Programme", m: ["Introduction", "Basics: what is sold and who sells it", "For foreigners: what to prepare before bidding", "How to read a lot", "Auction types: each with its own rules", "Money: the full budget", "Your first bid and what comes next"],
      open: "Open", opens: "Opens on {d}", draft: "In preparation", locked: "With the course", read: "Read",
      back_prog: "← Programme", prev: "← Previous", next: "Next →", mark: "Mark as read", marked: "Read ✓",
      no_text: "This lesson has no text in this language yet.", fallback: "Text available in {l}:",
      not_open: "This lesson isn't open for you yet.",
      err: "Could not load. Please reload the page.", err_token: "Could not create the payment link. Please try again in a few minutes.",
      disc: "General information, not legal or investment advice.", backsite: "← Back to Subástica", ln: { es: "Spanish", en: "English", ru: "Russian" }
    },
    ru: {
      kicker: "Курс · 34 урока", title: "Аукционы BOE: от новичка до первой ставки",
      lead: "Курс для иностранных покупателей: что продаётся и кто продаёт, какие документы нужны, как читать лот, какие обременения и долги останутся с вами, сколько это стоит на самом деле и как поставить ставку на портале BOE.",
      facts: [["6 модулей, 34 урока", "На испанском, английском и русском. Урок читается за 5–10 минут."], ["С вашей даты старта", "Курс начинается в день оплаты. Два новых урока в неделю, около 16 недель."], ["Официальные источники", "LEC, BOE, налоговая AEAT, Катастро. Примеры на реальных лотах."]],
      price: "Стоимость", stars: "{n} Telegram Stars", pay: "Оплатить в Telegram", pay_note: "Оплата — в Telegram Stars через нашего бота. После оплаты курс сам откроется в этом аккаунте.",
      waiting: "Ждём оплату в Telegram… Страница обновится сама.", refresh: "Я оплатил, проверить",
      soon: "Продажа курса скоро откроется. Пока можно посмотреть программу.",
      login_t: "Войдите, чтобы купить курс", login_d: "Доступ открывается в вашем аккаунте Subástica. Аккаунт бесплатный.", signup: "Создать аккаунт", login: "Войти",
      active: "Дата старта обучения: {d}", active_all: "Все опубликованные уроки открыты.", until: "Доступ до {d}.", tag: "Метка", progress: "Прочитано {n} из {t}",
      closed: "Доступ к курсу закрыт. Если это ошибка, напишите на {mail}.",
      expired: "Доступ закончился {d}. Его можно продлить, оплатив снова.",
      admin: "Режим администратора: видны все уроки, в том числе неопубликованные.",
      program: "Программа", m: ["Введение", "Основы: что продаётся и кем", "Иностранцу: что подготовить до ставки", "Как читать лот", "Типы торгов: свои правила у каждого", "Деньги: полный бюджет", "Первая ставка и что после"],
      open: "Открыт", opens: "Откроется {d}", draft: "Готовится", locked: "В курсе", read: "Прочитан",
      back_prog: "← Программа", prev: "← Назад", next: "Дальше →", mark: "Отметить прочитанным", marked: "Прочитан ✓",
      no_text: "У этого урока пока нет текста на этом языке.", fallback: "Текст есть на языке: {l}",
      not_open: "Этот урок для вас ещё не открыт.",
      err: "Не удалось загрузить. Обновите страницу.", err_token: "Не удалось создать ссылку на оплату. Попробуйте через несколько минут.",
      disc: "Общая информация, не юридическая и не инвестиционная консультация.", backsite: "← На главную Subástica", ln: { es: "испанский", en: "английский", ru: "русский" }
    }
  };
  const t = (k) => (T[lang][k] != null ? T[lang][k] : T.es[k]);
  const mail = (window.SITE_CONFIG && window.SITE_CONFIG.contactEmail) || "";
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(lang === "ru" ? "ru-RU" : lang === "en" ? "en-GB" : "es-ES", { day: "numeric", month: "long", year: "numeric" });
  const title = (l) => (l.titulo && (l.titulo[lang] || l.titulo.es)) || l.id;

  let st = null;          // ответ curso_estado()
  let loadErr = false;
  let waiting = false, pollTimer = null;
  let lesson = null;      // { id, cuerpo, lang }
  const done = () => store.get("curso_done", {});

  // ---------- упрощённый Markdown (весь текст сначала экранируется — HTML из базы не исполняется)
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|\.\/|[a-z0-9_-]+\.html)[^\s)]*)\)/gi, (m, txt, url) => {
        const ext = /^https?:/i.test(url);
        return `<a href="${url}"${ext ? ' target="_blank" rel="noopener"' : ""}>${txt}</a>`;
      });
  }
  function md(src) {
    const lines = esc(src || "").replace(/\r/g, "").split("\n");
    let out = "", list = null, para = [], quote = [];
    const flushP = () => { if (para.length) { out += `<p>${inline(para.join(" "))}</p>`; para = []; } };
    const flushL = () => { if (list) { out += `<${list.t}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.t}>`; list = null; } };
    const flushQ = () => { if (quote.length) { out += `<blockquote>${quote.map((q) => `<p>${inline(q)}</p>`).join("")}</blockquote>`; quote = []; } };
    const flush = () => { flushP(); flushL(); flushQ(); };
    for (const raw of lines) {
      const ln = raw.trimEnd();
      let m;
      if (!ln.trim()) { flush(); continue; }
      if ((m = ln.match(/^(#{2,3})\s+(.*)$/))) { flush(); out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; continue; }
      if ((m = ln.match(/^&gt;\s?(.*)$/))) { flushP(); flushL(); quote.push(m[1]); continue; }
      if ((m = ln.match(/^\s*[-•]\s+(.*)$/))) { flushP(); flushQ(); if (!list || list.t !== "ul") { flushL(); list = { t: "ul", items: [] }; } list.items.push(m[1]); continue; }
      if ((m = ln.match(/^\s*\d+[.)]\s+(.*)$/))) { flushP(); flushQ(); if (!list || list.t !== "ol") { flushL(); list = { t: "ol", items: [] }; } list.items.push(m[1]); continue; }
      flushL(); flushQ(); para.push(ln.trim());
    }
    flush();
    return out;
  }

  // ---------- данные
  async function loadState() {
    if (!A.enabled) return;
    const { data, error } = await A.client.rpc("curso_estado");
    if (error) throw error;
    st = data;
  }
  async function loadLesson(id) {
    const l = st && st.lecciones.find((x) => x.id === id);
    if (!l || !l.abierta) { lesson = { id, closed: true }; return; }
    const { data, error } = await A.client.from("curso_contenido").select("lang,cuerpo").eq("leccion_id", id);
    if (error) throw error;
    const by = {}; (data || []).forEach((r) => { if (r.cuerpo && r.cuerpo.trim()) by[r.lang] = r.cuerpo; });
    const use = by[lang] ? lang : ["es", "en", "ru"].find((x) => by[x]) || null;
    lesson = { id, cuerpo: use ? by[use] : "", lang: use };
  }

  // ---------- оплата
  async function pay(btn) {
    btn.disabled = true;
    const win = window.open("about:blank", "_blank"); // открываем окно сразу, иначе браузер заблокирует его после await
    try {
      const { data: token, error } = await A.client.rpc("curso_token");
      if (error) throw error;
      const url = `https://t.me/${encodeURIComponent(st.bot)}?start=c_${token}`;
      if (win) win.location.href = url; else location.href = url;
      waiting = true; startPolling(); render();
    } catch (e) {
      console.error(e);
      if (win) win.close();
      btn.disabled = false;
      alert(t("err_token"));
    }
  }
  function startPolling() {
    clearInterval(pollTimer);
    const until = Date.now() + 15 * 60 * 1000;
    pollTimer = setInterval(async () => {
      if (Date.now() > until) { clearInterval(pollTimer); waiting = false; render(); return; }
      try { await loadState(); if (st.activo) { clearInterval(pollTimer); waiting = false; } render(); } catch (e) { /* следующая попытка */ }
    }, 5000);
  }

  // ---------- отрисовка
  function hero() {
    const facts = t("facts").map(([h, p]) => `<li><b>${esc(h)}</b><span>${esc(p)}</span></li>`).join("");
    return `<section class="cu-hero">
      <p class="cu-kicker">${esc(t("kicker"))}</p>
      <h1>${esc(t("title"))}</h1>
      <p class="sv-lead">${esc(t("lead"))}</p>
      <ul class="cu-facts">${facts}</ul>
      <div class="cu-box" id="cuBox">${accessBox()}</div>
    </section>`;
  }

  function accessBox() {
    if (!A.enabled) return `<p class="nf-soon">${esc(t("soon"))}</p>`;
    if (loadErr) return `<p class="nf-soon">${esc(t("err"))}</p>`;
    if (!st) return `<p class="muted">…</p>`;
    const user = A.user && A.user();
    const a = st.acceso;
    if (st.admin && !st.activo) return `<p class="nf-soon">${esc(t("admin"))}</p>`;
    if (st.activo) {
      const pub = st.lecciones.filter((l) => l.publicada);
      const read = pub.filter((l) => done()[l.id]).length;
      return `<div class="cu-active">
        <p><b>${esc(t("active").replace("{d}", fmtDate(a.inicio)))}</b> ${a.todo_abierto || !st.goteo ? esc(t("active_all")) : ""}
        ${a.fin ? esc(t("until").replace("{d}", fmtDate(a.fin))) : ""}</p>
        <p class="muted">${esc(t("progress").replace("{n}", read).replace("{t}", pub.length))} · ${esc(t("tag"))}: <span class="cu-tag">${esc(a.etiqueta)}</span></p>
        <div class="cu-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${pub.length}" aria-valuenow="${read}"><span style="width:${pub.length ? Math.round(read / pub.length * 100) : 0}%"></span></div>
      </div>`;
    }
    if (!user) {
      const next = encodeURIComponent("curso.html");
      return `<div class="sv-login"><h3>${esc(t("login_t"))}</h3><p class="muted">${esc(t("login_d"))}</p>
        <a class="btn" href="./?auth=signup&next=${next}">${esc(t("signup"))}</a> <a class="btn ghost" href="./?auth=login&next=${next}">${esc(t("login"))}</a></div>`;
    }
    let pre = "";
    if (a && a.estado === "cerrado") return `<p class="nf-soon">${esc(t("closed").replace("{mail}", mail))}</p>`;
    if (a && a.fin && new Date(a.fin) <= new Date()) pre = `<p class="nf-soon">${esc(t("expired").replace("{d}", fmtDate(a.fin)))}</p>`;
    if (!st.venta) return pre + `<p class="nf-soon">${esc(t("soon"))}</p>`;
    return pre + `<div class="cu-buy">
      <p class="cu-price"><span>${esc(t("price"))}</span> <b>${esc(t("stars").replace("{n}", st.precio_xtr))}</b></p>
      <button class="btn big" id="cuPay" type="button">${esc(t("pay"))}</button>
      <p class="muted cu-note">${esc(t("pay_note"))}</p>
      ${waiting ? `<p class="nf-soon" role="status">${esc(t("waiting"))} <button class="link-btn" id="cuCheck" type="button">${esc(t("refresh"))}</button></p>` : ""}
    </div>`;
  }

  function program() {
    const L = st ? st.lecciones : [];
    if (!L.length) return "";
    const d = done();
    const mods = {};
    L.forEach((l) => { (mods[l.modulo] = mods[l.modulo] || []).push(l); });
    const now = new Date();
    const row = (l) => {
      let state, cls = "";
      if (l.abierta) { state = d[l.id] ? t("read") : t("open"); cls = d[l.id] ? "read" : "open"; }
      else if (!l.publicada) { state = t("draft"); cls = "draft"; }
      else if (l.abre_en && new Date(l.abre_en) > now) { state = t("opens").replace("{d}", fmtDate(l.abre_en)); cls = "soon"; }
      else { state = ""; cls = "locked"; } // курс не куплен: статус не нужен, сама программа — описание
      const name = `<span class="cu-num">${esc(l.id)}</span><span class="cu-name">${esc(title(l))}</span>`;
      return `<li class="cu-l ${cls}">${l.abierta ? `<a href="?l=${encodeURIComponent(l.id)}" data-lesson="${esc(l.id)}">${name}</a>` : `<div>${name}</div>`}${state ? `<span class="cu-state">${esc(state)}</span>` : ""}</li>`;
    };
    return `<section class="cu-prog"><h2>${esc(t("program"))}</h2>${Object.keys(mods).map((k) => `
      <div class="cu-mod"><h3><span class="cu-modn">${esc(k)}</span>${esc(t("m")[k] || "")}</h3><ol class="cu-list">${mods[k].map(row).join("")}</ol></div>`).join("")}</section>`;
  }

  function lessonView() {
    const L = st.lecciones;
    const i = L.findIndex((x) => x.id === lesson.id);
    const l = L[i];
    if (!l) return `<p class="nf-soon">${esc(t("not_open"))}</p>`;
    const open = (x) => x && x.abierta;
    const prev = L.slice(0, i).reverse().find(open), next = L.slice(i + 1).find(open);
    const isDone = !!done()[l.id];
    let body;
    if (lesson.closed) body = `<p class="nf-soon">${esc(t("not_open"))}</p>`;
    else if (!lesson.cuerpo) body = `<p class="nf-soon">${esc(t("no_text"))}</p>`;
    else body = (lesson.lang !== lang ? `<p class="nf-soon">${esc(t("fallback").replace("{l}", t("ln")[lesson.lang]))}</p>` : "") + `<div class="cu-text" lang="${esc(lesson.lang)}">${md(lesson.cuerpo)}</div>`;
    return `<article class="cu-lesson">
      <p><a href="curso.html" data-home="1">${esc(t("back_prog"))}</a></p>
      <p class="cu-kicker">${esc(l.id)} · ${esc(t("m")[l.modulo] || "")}</p>
      <h1>${esc(title(l))}</h1>
      ${body}
      ${lesson.closed ? "" : `<p><button class="btn ${isDone ? "soft" : ""}" id="cuDone" type="button" aria-pressed="${isDone}">${esc(isDone ? t("marked") : t("mark"))}</button></p>`}
      <nav class="cu-pn">${prev ? `<a class="btn ghost" href="?l=${encodeURIComponent(prev.id)}" data-lesson="${esc(prev.id)}">${esc(t("prev"))}</a>` : "<span></span>"}
        ${next ? `<a class="btn ghost" href="?l=${encodeURIComponent(next.id)}" data-lesson="${esc(next.id)}">${esc(t("next"))}</a>` : ""}</nav>
    </article>`;
  }

  function render() {
    document.documentElement.lang = lang;
    document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === lang));
    const foot = `<p class="muted cu-disc">${esc(t("disc"))}</p><p><a href="./">${esc(t("backsite"))}</a> · <a href="privacidad.html">Privacidad</a> · <a href="terminos.html">Términos</a></p>`;
    $("#cuRoot").innerHTML = (lesson && st ? lessonView() : hero() + program()) + foot;
    const p = $("#cuPay"); if (p) p.onclick = () => pay(p);
    const c = $("#cuCheck"); if (c) c.onclick = async () => { c.disabled = true; try { await loadState(); } catch (e) { /* */ } if (st && st.activo) waiting = false; render(); };
    const d = $("#cuDone"); if (d) d.onclick = () => { const m = done(); if (m[lesson.id]) delete m[lesson.id]; else m[lesson.id] = Date.now(); store.set("curso_done", m); render(); };
  }

  async function route(push) {
    const id = new URLSearchParams(location.search).get("l");
    if (push) history.pushState(null, "", id ? `?l=${encodeURIComponent(id)}` : "curso.html");
    lesson = null;
    if (id && st) {
      try { await loadLesson(id); } catch (e) { console.error(e); lesson = { id, closed: true }; }
    }
    render();
    window.scrollTo(0, 0);
  }

  document.addEventListener("click", (e) => {
    const l = e.target.closest(".lang [data-lang]");
    if (l) { lang = l.dataset.lang; store.set("lang", lang); route(false); return; }
    const a = e.target.closest("a[data-lesson], a[data-home]");
    if (a && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      history.pushState(null, "", a.dataset.lesson ? `?l=${encodeURIComponent(a.dataset.lesson)}` : "curso.html");
      route(false);
    }
  });
  window.addEventListener("popstate", () => route(false));
  // вернулись из Telegram — сразу проверяем оплату
  window.addEventListener("focus", async () => {
    if (!waiting) return;
    try { await loadState(); if (st.activo) waiting = false; render(); } catch (e) { /* */ }
  });

  (async () => {
    render();
    if (!A.enabled) return;
    try {
      await A.init();
      await loadState();
    } catch (e) { console.error(e); loadErr = true; }
    await route(false);
    if (A.on) A.on(async () => { try { await loadState(); loadErr = false; } catch (e) { loadErr = true; } route(false); });
  })();
})();
