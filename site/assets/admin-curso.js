// Панель управления → «Обучение»: метки доступа к курсу, оплаты в Telegram, настройки продажи, уроки.
// Все изменения идут через функции базы admin_curso_*, которые сами проверяют права администратора.
(function () {
  "use strict";
  const A = window.Auth;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = (d) => { if (!d) return "—"; const x = new Date(d); return isNaN(x) ? d : x.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); };
  // дата из поля <input type=date> → начало этого дня по местному времени
  const fromDate = (v) => (v ? new Date(v + "T00:00:00").toISOString() : null);
  const toDate = (iso) => { if (!iso) return ""; const d = new Date(iso); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  let rows = [], lessons = [], loaded = false;

  const rpc = async (name, args) => {
    const { data, error } = await A.client.rpc(name, args || {});
    if (error) throw error;
    return data;
  };
  function msg(text, err) {
    const m = $("#msg"); m.textContent = text; m.className = "adm-msg" + (err ? " err" : ""); m.hidden = false;
    clearTimeout(msg._t); msg._t = setTimeout(() => (m.hidden = true), err ? 8000 : 3500);
  }
  const fail = (e) => { console.error(e); msg("Ошибка: " + (e && e.message ? e.message : e), true); };

  // ---------- настройки и бот
  async function loadCfg() {
    const { data, error } = await A.client.from("settings").select("key,value").like("key", "curso\\_%");
    if (error) throw error;
    const s = {}; data.forEach((r) => (s[r.key] = r.value));
    $("#cPrice").value = s.curso_precio_xtr || "";
    $("#cDias").value = s.curso_dias || "";
    $("#cGoteo").checked = s.curso_goteo !== "false";
    $("#cVenta").checked = s.curso_venta === "true";
    const issues = [];
    if (!s.curso_bot) issues.push("бот не подключён");
    if (!s.curso_precio_xtr) issues.push("цена не указана");
    if (s.curso_venta !== "true") issues.push("продажа выключена");
    $("#cBot").innerHTML = (s.curso_bot ? `Бот: <a href="https://t.me/${esc(s.curso_bot)}" target="_blank" rel="noopener">@${esc(s.curso_bot)}</a>. ` : "")
      + (issues.length ? `Курс сейчас не продаётся: ${esc(issues.join(", "))}.` : `Продажа идёт: ${esc(s.curso_precio_xtr)} Stars.`);
  }
  async function bot(action) {
    const { data, error } = await A.client.functions.invoke("tg-curso", { body: { action } });
    if (error) throw error;
    if (!data.ok) throw new Error(data.error || "бот не ответил");
    const parts = [`Бот @${data.bot}`, data.webhook ? "вебхук подключён" : "вебхук НЕ подключён"];
    if (data.pending) parts.push(`в очереди ${data.pending} апдейтов`);
    if (data.last_error) parts.push(`последняя ошибка Telegram: ${data.last_error}`);
    msg(parts.join(" · "), !data.webhook || !!data.last_error);
    await loadCfg();
  }

  // ---------- метки доступа
  function status(r) {
    if (r.estado === "cerrado") return `<span class="c-st bad">закрыт</span>`;
    if (r.fin && new Date(r.fin) <= new Date()) return `<span class="c-st warn">истёк</span>`;
    if (new Date(r.inicio) > new Date()) return `<span class="c-st warn">старт впереди</span>`;
    return `<span class="c-st ok">открыт</span>`;
  }
  function row(r, i) {
    const src = r.origen === "telegram" ? `Telegram${r.pagos ? ` · ${r.pagos} опл. · ${r.total_xtr} ★` : ""}` : "вручную";
    return `<tr data-i="${i}">
      <td><span class="u-mail">${esc(r.email || r.user_id)}</span><span class="u-sub">${esc(src)} · изм. ${esc(when(r.updated_at))}${r.updated_by ? " · " + esc(r.updated_by) : ""}</span></td>
      <td><input type="text" data-f="etiqueta" value="${esc(r.etiqueta)}" maxlength="60" aria-label="Метка"></td>
      <td>${status(r)}</td>
      <td><input type="date" data-f="inicio" value="${esc(toDate(r.inicio))}" aria-label="Старт"></td>
      <td><input type="date" data-f="fin" value="${esc(toDate(r.fin))}" aria-label="Доступ до"><span class="u-sub">пусто — бессрочно</span></td>
      <td><label class="chk-inline"><input type="checkbox" data-f="todo" ${r.todo_abierto ? "checked" : ""}> все сразу</label></td>
      <td><input type="text" data-f="nota" value="${esc(r.nota || "")}" maxlength="200" aria-label="Заметка"></td>
      <td class="acts">
        <button class="btn" data-save disabled>Сохранить</button>
        ${r.estado === "cerrado" ? `<button class="btn soft" data-estado="activo">Открыть</button>` : `<button class="btn ghost" data-estado="cerrado">Закрыть</button>`}
      </td></tr>`;
  }
  async function loadRows() {
    rows = await rpc("admin_curso_list", { p_search: $("#cQ").value });
    $("#cRows").innerHTML = rows.length ? rows.map(row).join("") : `<tr><td colspan="8" class="muted">Пока никого.</td></tr>`;
    $("#cCount").textContent = `Всего: ${rows.length}, открыто: ${rows.filter((r) => r.activo).length}`;
  }
  async function saveRow(tr, estado) {
    const r = rows[+tr.dataset.i];
    const f = (n) => tr.querySelector(`[data-f="${n}"]`);
    const fin = f("fin").value;
    await rpc("admin_curso_set", {
      p_email: r.email, p_estado: estado || null,
      p_inicio: f("inicio").value !== toDate(r.inicio) ? fromDate(f("inicio").value) : null,
      // дату меняем, только если её правили: иначе пересохранение сдвигало бы время на часовой пояс
      p_fin: fin && fin !== toDate(r.fin) ? fromDate(fin) : null, p_clear_fin: !fin,
      p_todo: f("todo").checked, p_etiqueta: f("etiqueta").value, p_nota: f("nota").value
    });
    msg(estado === "cerrado" ? `Доступ закрыт: ${r.email}` : estado === "activo" ? `Доступ открыт: ${r.email}` : `Сохранено: ${r.email}`);
    await loadRows();
  }

  // ---------- оплаты
  async function loadPays() {
    const p = await rpc("admin_curso_pagos", { p_limit: 300 });
    const lost = p.filter((x) => !x.user_id).length;
    $("#cursoBadge").textContent = lost; $("#cursoBadge").hidden = !lost;
    $("#cPays").innerHTML = p.length ? p.map((x) => `<tr>
      <td>${esc(when(x.created_at))}</td>
      <td>${x.user_id ? `<span class="u-mail">${esc(x.email)}</span>` : `<form class="c-assign" data-pay="${x.id}"><span class="c-st bad">не привязана</span>
        <input type="email" required placeholder="почта на сайте" aria-label="Почта пользователя"><button class="btn">Привязать и открыть</button></form>`}</td>
      <td>${x.tg_username ? "@" + esc(x.tg_username) : esc(x.tg_user_id)}</td>
      <td>${esc(x.amount)} ${x.currency === "XTR" ? "★" : esc(x.currency)}${x.reembolsado ? " · возврат" : ""}</td>
      <td><code class="c-id">${esc(x.charge_id)}</code></td></tr>`).join("") : `<tr><td colspan="5" class="muted">Оплат пока нет.</td></tr>`;
  }

  // ---------- уроки
  async function loadLessons() {
    const { data, error } = await A.client.from("curso_lecciones").select("*").order("orden");
    if (error) throw error;
    lessons = data;
    $("#cLessons").innerHTML = lessons.map((l, i) => `<tr data-l="${i}">
      <td><span class="c-num">${esc(l.id)}</span> ${esc(l.titulo.ru || l.titulo.es)}</td>
      <td>${esc(l.dia)}</td>
      <td>${l.publicada ? `<span class="c-st ok">да</span>` : `<span class="c-st">нет</span>`}</td>
      <td class="acts"><button class="btn ghost" data-edit>Редактировать</button></td></tr>`).join("");
  }
  async function openEditor(l) {
    const d = await rpc("admin_curso_leccion", { p_id: l.id });
    const f = $("#cEditF"), b = d.cuerpo || {};
    $("#cEditT").textContent = `Урок ${l.id}`;
    f.dataset.id = l.id;
    f.elements.dia.value = l.dia; f.elements.publicada.checked = l.publicada;
    ["es", "en", "ru"].forEach((x) => { f.elements["t_" + x].value = l.titulo[x] || ""; f.elements[x].value = b[x] || ""; });
    $("#cPreview").href = `curso.html?l=${encodeURIComponent(l.id)}`;
    $("#cEdit").showModal();
  }
  async function saveEditor() {
    const f = $("#cEditF");
    await rpc("admin_curso_leccion_save", {
      p_id: f.dataset.id, p_publicada: f.elements.publicada.checked, p_dia: Math.max(0, parseInt(f.elements.dia.value, 10) || 0),
      p_titulo: { es: f.elements.t_es.value.trim(), en: f.elements.t_en.value.trim(), ru: f.elements.t_ru.value.trim() },
      p_es: f.elements.es.value, p_en: f.elements.en.value, p_ru: f.elements.ru.value
    });
    msg(`Урок ${f.dataset.id} сохранён.`);
    await loadLessons();
  }

  async function loadAll() {
    await Promise.all([loadCfg(), loadRows(), loadPays(), loadLessons()]);
    loaded = true;
  }

  function bind() {
    const tab = $('.adm-tabs [data-tab="curso"]');
    if (!tab) return;
    tab.addEventListener("click", () => { loadAll().catch(fail); });

    $("#cCfg").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const price = parseInt($("#cPrice").value, 10), dias = parseInt($("#cDias").value, 10);
        if ($("#cVenta").checked && !(price > 0)) throw new Error("Чтобы включить продажу, укажите цену в Stars.");
        await rpc("admin_curso_config", {
          p_venta: $("#cVenta").checked, p_precio_xtr: price > 0 ? price : null, p_goteo: $("#cGoteo").checked,
          p_dias: dias > 0 ? dias : null, p_clear_dias: !(dias > 0)
        });
        msg("Настройки курса сохранены."); await loadCfg();
      } catch (err) { fail(err); }
    });
    $("#cSetup").onclick = () => bot("setup").catch(fail);
    $("#cCheck").onclick = () => bot("status").catch(fail);

    $("#cGrant").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const end = $("#gEnd").value;
        await rpc("admin_curso_set", {
          p_email: $("#gEmail").value.trim(), p_estado: "activo", p_inicio: fromDate($("#gStart").value),
          p_fin: end ? fromDate(end) : null, p_clear_fin: !end, p_todo: $("#gAll").checked, p_etiqueta: $("#gTag").value || null, p_nota: null
        });
        msg(`Доступ выдан: ${$("#gEmail").value.trim()}`);
        e.target.reset(); await loadRows();
      } catch (err) { fail(err); }
    });

    let qT;
    $("#cQ").addEventListener("input", () => { clearTimeout(qT); qT = setTimeout(() => loadRows().catch(fail), 300); });
    $("#cRows").addEventListener("input", (e) => { const tr = e.target.closest("tr"); if (tr) { tr.classList.add("dirty"); tr.querySelector("[data-save]").disabled = false; } });
    $("#cRows").addEventListener("change", (e) => { const tr = e.target.closest("tr"); if (tr) { tr.classList.add("dirty"); tr.querySelector("[data-save]").disabled = false; } });
    $("#cRows").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-save],[data-estado]");
      if (!b) return;
      const tr = b.closest("tr");
      if (b.dataset.estado === "cerrado" && !confirm(`Закрыть доступ к курсу для ${rows[+tr.dataset.i].email}?`)) return;
      b.disabled = true;
      try { await saveRow(tr, b.dataset.estado); } catch (err) { b.disabled = false; fail(err); }
    });
    $("#cPays").addEventListener("submit", async (e) => {
      const f = e.target.closest("[data-pay]");
      if (!f) return;
      e.preventDefault();
      try {
        const email = f.querySelector("input").value.trim();
        await rpc("admin_curso_pago_asignar", { p_id: +f.dataset.pay, p_email: email });
        msg(`Оплата привязана, доступ открыт: ${email}`);
        await Promise.all([loadPays(), loadRows()]);
      } catch (err) { fail(err); }
    });
    $("#cLessons").addEventListener("click", (e) => {
      const b = e.target.closest("[data-edit]");
      if (b) openEditor(lessons[+b.closest("tr").dataset.l]).catch(fail);
    });
    $("#cEdit").addEventListener("close", () => {
      if ($("#cEdit").returnValue === "save") saveEditor().catch(fail);
    });
  }

  // бейдж «оплаты без привязки» и переход по ссылке admin.html#curso — когда панель открылась администратору
  function whenReady() {
    const app = $("#app");
    if (!app) return;
    const go = () => {
      if (app.hidden) return false;
      if (location.hash === "#curso") { const t = $('.adm-tabs [data-tab="curso"]'); if (t) t.click(); }
      else if (!loaded) loadPays().catch(() => {});
      return true;
    };
    if (go()) return;
    const mo = new MutationObserver(() => { if (go()) mo.disconnect(); });
    mo.observe(app, { attributes: true, attributeFilter: ["hidden"] });
  }

  bind();
  whenReady();
})();
