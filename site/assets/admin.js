// Панель управления SubastaRadar: пользователи, доверенные адреса, сроки доступа.
// Все изменения проходят через функции базы admin_*, которые сами проверяют, что вы администратор.
(function () {
  "use strict";
  const A = window.Auth;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const day = (d) => { if (!d) return "—"; const x = new Date(String(d).length === 10 ? d + "T12:00:00" : d); return isNaN(x) ? d : x.toLocaleDateString("ru-RU"); };
  const when = (d) => { if (!d) return "—"; const x = new Date(d); return isNaN(x) ? d : x.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); };
  const iso = (dt) => dt.toISOString().slice(0, 10);
  const MODES = [["novato", "Новичок"], ["inversor", "Инвестор"], ["pro", "Про"]];
  const REASONS = { disposable_email: "одноразовая почта", duplicate_email: "повтор адреса", duplicate_device: "то же устройство" };
  const PAGE = 50;
  let page = 0, total = 0, rows = [], defTrial = "";

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

  // ---------- сводка
  async function loadStats() {
    const s = await rpc("admin_stats");
    defTrial = s.default_trial_until || "";
    const denied = Object.entries(s.denied_by || {}).map(([k, n]) => `${REASONS[k] || "вручную"}: ${n}`).join(", ");
    $("#stats").innerHTML = [
      `<span><b>${s.users}</b>пользователей</span>`,
      `<span><b>${s.with_access}</b>с доступом</span>`,
      `<span><b>${s.expired}</b>доступ истёк</span>`,
      `<span><b>${s.denied}</b>без бесплатного периода${denied ? ` <span class="muted">(${esc(denied)})</span>` : ""}</span>`,
      `<span><b>${s.same_ip || 0}</b>с совпадающим IP</span>`,
      `<span><b>${s.new_7d}</b>новых за 7 дней</span>`,
      `<span><b>${s.active_7d}</b>заходили за 7 дней</span>`,
      `<span><b>${s.subastas_actuales}</b>текущих аукционов в базе</span>`,
      `<span>Бесплатный период для новых: <b>${day(s.default_trial_until)}</b></span>`
    ].join("");
    $("#defDate").value = s.default_trial_until || "";
    if (!$("#bFrom").value) $("#bFrom").value = s.default_trial_until || "";
  }

  // ---------- пользователи
  function sameIp(u) {
    const list = (u.same_ip || []).filter(Boolean);
    return list.length ? `<span class="rp warn" style="margin-top:6px" title="${esc(list.join(", "))}">тот же IP</span><span class="u-sub">${esc(list.slice(0, 3).join(", "))}${list.length > 3 ? ` и ещё ${list.length - 3}` : ""}</span>` : "";
  }
  function status(u) {
    if (u.trusted) return `<span class="rp ok">доверенный</span>`;
    if (!u.access_until) return `<span class="rp bad">без доступа</span>${u.reason ? `<span class="u-sub">${esc(REASONS[u.reason] || u.reason)}${u.duplicate_of_email ? ": " + esc(u.duplicate_of_email) : ""}</span>` : ""}`;
    if (u.access_until < iso(new Date())) return `<span class="rp warn">истёк ${day(u.access_until)}</span>`;
    return `<span class="rp ok">до ${day(u.access_until)}</span>`;
  }
  function row(u, i) {
    const modes = MODES.map(([m, l]) => `<label><input type="checkbox" data-mode="${m}"${(u.allowed_modes || []).includes(m) ? " checked" : ""}> ${l}</label>`).join("");
    return `<tr data-i="${i}">
      <td><span class="u-mail">${esc(u.email)}</span><span class="u-sub">${esc(u.provider || "email")} · с ${day(u.created_at)}</span></td>
      <td>${status(u)}${sameIp(u)}</td>
      <td><input type="date" data-f="until" value="${esc(u.access_until || "")}" aria-label="Доступ до для ${esc(u.email)}">
        <div class="quick"><button type="button" data-add="1">+1 мес</button><button type="button" data-add="12">+1 год</button>${defTrial ? `<button type="button" data-set="${esc(defTrial)}">до ${day(defTrial)}</button>` : ""}</div></td>
      <td><div class="modes-chk">${modes}</div></td>
      <td><input type="text" data-f="note" value="${esc(u.note || "")}" maxlength="200" aria-label="Заметка для ${esc(u.email)}"></td>
      <td><span class="u-sub" style="margin:0">вход: ${when(u.last_seen)}</span><span class="u-sub">устройств: ${u.devices}</span><span class="u-sub">режим: ${esc((MODES.find((m) => m[0] === u.view_mode) || [, u.view_mode])[1])}</span></td>
      <td><div class="acts"><button class="btn" data-save disabled>Сохранить</button>${u.access_until ? `<button class="btn ghost" data-revoke>Снять доступ</button>` : ""}</div></td>
    </tr>`;
  }
  async function loadUsers() {
    const r = await rpc("admin_list_users", { p_search: $("#q").value, p_filter: $("#filter").value, p_limit: PAGE, p_offset: page * PAGE });
    total = r.total; rows = r.rows || [];
    $("#rows").innerHTML = rows.length ? rows.map(row).join("") : `<tr><td colspan="7" class="muted">Никого не найдено.</td></tr>`;
    $("#count").textContent = `найдено: ${total}`;
    const pages = Math.max(1, Math.ceil(total / PAGE));
    $("#page").textContent = `стр. ${page + 1} из ${pages}`;
    $("#prev").disabled = page === 0; $("#next").disabled = page + 1 >= pages;
  }
  function addMonths(dateStr, n) {
    const base = dateStr && dateStr >= iso(new Date()) ? new Date(dateStr + "T12:00:00") : new Date();
    base.setMonth(base.getMonth() + n);
    return iso(base);
  }
  function markDirty(tr) { tr.classList.add("dirty"); tr.querySelector("[data-save]").disabled = false; }
  async function saveRow(tr, revoke) {
    const u = rows[+tr.dataset.i];
    const until = tr.querySelector('[data-f="until"]').value;
    const modes = $$("[data-mode]", tr).filter((c) => c.checked).map((c) => c.dataset.mode);
    if (!modes.length) return msg("Оставьте хотя бы один режим.", true);
    if (revoke && !confirm(`Снять доступ у ${u.email}?`)) return;
    try {
      await rpc("admin_update_user", {
        p_id: u.id, p_access_until: revoke ? null : (until || null), p_clear_access: !!revoke || !until,
        p_allowed_modes: modes, p_note: tr.querySelector('[data-f="note"]').value
      });
      msg(revoke ? `Доступ снят: ${u.email}` : `Сохранено: ${u.email}`);
      await Promise.all([loadUsers(), loadStats()]);
    } catch (e) { fail(e); }
  }

  // ---------- доверенные
  async function loadTrusted() {
    const list = await rpc("admin_trusted_list");
    $("#trusted").innerHTML = list.length ? list.map((t) => `<li><span><b>${esc(t.email)}</b>${t.note ? ` <span class="muted">· ${esc(t.note)}</span>` : ""}</span><span class="muted">с ${day(t.created_at)}</span><button class="btn ghost" data-untrust="${esc(t.email)}">Убрать</button></li>`).join("")
      : `<li><span class="muted">Список пуст.</span></li>`;
  }

  // ---------- заказы nota simple
  const NS = { solicitado: "Новая заявка", pendiente_pago: "Ждёт оплаты", pagado: "Оплачено", en_tramite: "В работе", entregado: "Готово", cancelado: "Отменено", error: "Проблема" };
  const FIN = { subasta: "участие в аукционе", inversion: "покупка / инвестиция", juridica: "юридическая проверка", otra: "другая цель" };
  let notas = [];
  const cp = (label, v) => v ? `<div class="cp" data-copy="${esc(v)}" title="Нажмите, чтобы скопировать"><small>${esc(label)}</small><b>${esc(v)}</b></div>` : "";
  function notaCard(n, i) {
    const total = (n.precio_cents / 100 * (1 + n.iva_pct / 100)).toFixed(2).replace(".", ",");
    return `<article class="adm-card nota-card" data-i="${i}">
      <header><b>#${n.id}</b> <span class="rp ${n.tipo === "pack" ? "ok" : ""}">${n.tipo === "pack" ? "Полный комплект" : "Nota simple"}</span> <span class="rp ${n.estado === "entregado" ? "ok" : ["error", "cancelado"].includes(n.estado) ? "bad" : "warn"}">${esc(NS[n.estado] || n.estado)}</span>
        <span class="muted">${when(n.created_at)} · ${(n.precio_cents / 100).toFixed(2).replace(".", ",")} € + IVA (${total} €)</span>
        <a class="btn ghost" href="./#/s/${encodeURIComponent(n.subasta_id)}" target="_blank" rel="noopener">Аукцион ${esc(n.subasta_id)} ↗</a></header>
      <div class="cp-grid">
        ${cp("IDUFIR / CRU", n.idufir)}${cp("Кадастровый номер", n.ref_catastral)}${cp("Реестр", n.registro)}${cp("Finca №", n.finca)}${cp("Том, книга, лист", n.datos_registrales)}${cp("Адрес", n.direccion)}
      </div>
      <div class="cp-grid">
        ${cp("Заявитель", n.nombre)}${cp("DNI / NIE / CIF", n.dni)}${cp("Email", n.email)}${cp("Телефон", n.telefono)}${cp("Законный интерес", FIN[n.finalidad] || n.finalidad)}
      </div>
      ${n.bien ? `<p class="fine nota-bien">${esc(n.bien)}</p>` : ""}
      <div class="adm-bar">
        <label class="fld"><span>Статус</span><select data-f="estado">${Object.entries(NS).map(([k, l]) => `<option value="${k}"${k === n.estado ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="fld grow"><span>Заметка (видна только админам)</span><input type="text" data-f="nota" value="${esc(n.nota_admin || "")}" maxlength="300"></label>
        <button class="btn ghost" data-nsave>Сохранить</button>
      </div>
      <div class="adm-bar">
        <label class="btn soft file-btn">${n.pdf_path ? "Добавить файлы" : "Загрузить файлы"}<input type="file" accept="application/pdf,application/zip,image/jpeg,image/png" multiple data-pdf hidden></label>
        <button class="btn ghost" data-attach-docs title="Скопировать в заказ файлы из карточки аукциона (BOE, Катастро, загруженные вручную)">Прикрепить файлы аукциона</button>
        ${n.pdf_path ? `<button class="btn ghost" data-open-pdf>Файлы заказа</button><button class="btn" data-mail>Отправить письмо клиенту</button>` : ""}
        <span class="nota-flist muted"></span>
      </div>
    </article>`;
  }
  async function loadNotas() {
    const f = $("#nFilter").value || null;
    notas = await rpc("admin_notas_list", { p_estado: f, p_limit: 300 });
    $("#notas").innerHTML = notas.length ? notas.map(notaCard).join("") : `<p class="muted">Заказов нет.</p>`;
    $("#nCount").textContent = `найдено: ${notas.length}`;
  }
  async function notasBadge() {
    try {
      const n = await rpc("admin_notas_list", { p_estado: "solicitado", p_limit: 1000 });
      const p = await rpc("admin_notas_list", { p_estado: "pagado", p_limit: 1000 });
      const c = n.length + p.length;
      $("#notasBadge").textContent = c; $("#notasBadge").hidden = !c;
    } catch (e) { console.error(e); }
  }
  function mailtoNota(n, url) {
    const subj = `${n.tipo === "pack" ? "Tus documentos" : "Tu nota simple"} #${n.id} — SubastaRadar`;
    const body = `Hola ${n.nombre}:\n\nYa tienes ${n.tipo === "pack" ? "los documentos que pediste" : "la nota simple que pediste"} (pedido #${n.id}${n.registro ? ", " + n.registro : ""}${n.finca ? ", finca " + n.finca : ""}).\n\nPuedes descargarlo en SubastaRadar → Mis pedidos:\nhttps://subasta-radar.es/\n${url ? "\nEnlace directo (válido 7 días):\n" + url + "\n" : ""}\nUn saludo,\nSubastaRadar`;
    location.href = `mailto:${encodeURIComponent(n.email)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  }
  async function sendNotaMail(n) {
    // Сначала — письмо через Resend (функция nota-email). Если её ключ ещё не задан — откроется ваша почта с готовым текстом.
    try {
      const { data, error } = await A.client.functions.invoke("nota-email", { body: { id: n.id } });
      if (error || !data || !data.ok) throw error || new Error((data && data.error) || "send failed");
      msg(`Письмо отправлено: ${n.email}`);
      return;
    } catch (e) { console.warn("nota-email", e); }
    let url = "";
    try {
      const files = await A.notaFiles(n.pdf_path);
      const urls = await Promise.all(files.map(async (f) => { const r = await A.client.storage.from("notas").createSignedUrl(f.path, 7 * 24 * 3600); return r.data ? `${f.name}: ${r.data.signedUrl}` : ""; }));
      url = urls.filter(Boolean).join("\n");
    } catch (e) { /* */ }
    mailtoNota(n, url);
  }

  // ---------- заявки на сопровождение
  const AS = { nueva: "Новая", contactada: "Связались", contrato: "Договор подписан", en_curso: "В работе", cerrada: "Закрыта", descartada: "Отказ" };
  const PK = { p1: "1 · Юр. анализ лота — 1 000 €", p2: "2 · Сопровождение на аукционе — 5 %", p3: "3 · Покупка под ключ — 10 %", p4: "4 · Полный цикл — 50 % прибыли", consulta: "Не знает, нужен совет" };
  const RU = { propios: "свои средства", hipoteca: "ипотека", mixta: "смешанное", pendiente: "не решил", si: "есть", tramite: "оформляется", no: "нет",
    certificado: "цифр. сертификат", clave: "Cl@ve", ninguno: "нет", vivir: "жить", alquilar: "сдавать", revender: "перепродать", otro: "другое" };
  let ayuda = [];
  function ayudaCard(a, i) {
    const tel = String(a.telefono || "").replace(/[^\d+]/g, "");
    return `<article class="adm-card nota-card" data-i="${i}">
      <header><b>#${a.id}</b> <span class="rp ${a.estado === "nueva" ? "warn" : a.estado === "descartada" ? "bad" : "ok"}">${esc(AS[a.estado] || a.estado)}</span>
        <span class="muted">${when(a.created_at)} · язык: ${esc(a.idioma)}</span>
        ${a.subasta_id ? `<a class="btn ghost" href="./#/s/${encodeURIComponent(a.subasta_id)}" target="_blank" rel="noopener">Аукцион ${esc(a.subasta_id)} ↗</a>` : ""}</header>
      <p style="margin:0 0 10px"><b>${esc(PK[a.paquete] || a.paquete)}</b>${a.subasta_resumen ? ` <span class="muted">· ${esc(a.subasta_resumen)}</span>` : ""}</p>
      <div class="cp-grid">
        ${cp("Имя", a.nombre)}${cp("Email", a.email)}${cp("Телефон", a.telefono)}
        ${cp("Бюджет", a.presupuesto ? Number(a.presupuesto).toLocaleString("ru-RU") + " €" : "")}${cp("Финансирование", RU[a.financiacion] || a.financiacion)}
        ${cp("NIE / DNI", RU[a.nie] || a.nie)}${cp("Эл. подпись", RU[a.firma] || a.firma)}${cp("Цель", RU[a.objetivo] || a.objetivo)}
      </div>
      ${a.comentario ? `<p class="nota-bien" style="white-space:pre-wrap">${esc(a.comentario)}</p>` : ""}
      <div class="adm-bar">
        ${tel ? `<a class="btn soft" href="https://wa.me/${esc(tel.replace(/^\+/, ""))}" target="_blank" rel="noopener">WhatsApp</a><a class="btn ghost" href="tel:${esc(tel)}">Позвонить</a>` : ""}
        <a class="btn ghost" href="mailto:${esc(a.email)}?subject=${encodeURIComponent("SubastaRadar — solicitud #" + a.id)}">Написать</a>
      </div>
      <div class="adm-bar">
        <label class="fld"><span>Статус</span><select data-f="estado">${Object.entries(AS).map(([k, l]) => `<option value="${k}"${k === a.estado ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="fld grow"><span>Заметка</span><input type="text" data-f="nota" value="${esc(a.nota_admin || "")}" maxlength="500"></label>
        <button class="btn ghost" data-asave>Сохранить</button>
      </div>
    </article>`;
  }
  async function loadAyuda() {
    ayuda = await rpc("admin_ayuda_list", { p_estado: $("#aFilter").value || null, p_limit: 300 });
    $("#ayuda").innerHTML = ayuda.length ? ayuda.map(ayudaCard).join("") : `<p class="muted">Заявок нет.</p>`;
    $("#aCount").textContent = `найдено: ${ayuda.length}`;
  }
  async function ayudaBadge() {
    try { const n = await rpc("admin_ayuda_list", { p_estado: "nueva", p_limit: 1000 }); $("#ayudaBadge").textContent = n.length; $("#ayudaBadge").hidden = !n.length; } catch (e) { console.error(e); }
  }

  // ---------- соцсети
  const SOCN = { r1: "Рилс 1 · Цена-крючок", r2: "Рилс 2 · Разбор цифр", r3: "Рилс 3 · Топ-10 недели", r4: "Рилс 4 · Чем закончилось",
    r5: "Рилс 5 · Где покупать дёшево", r6: "Рилс 6 · Дом с бассейном по цене квартиры", r7: "Рилс 7 · Авто дешевле телефона (топ-5)", r8: "Рилс 8 · Авто недели", s1: "Сторис · Закрывается сегодня", s2: "Сторис · Объект дня", tg: "Telegram · подборка" };
  const SOCS = { pendiente: "в очереди", procesar: "к обработке", listo: "готово", publicado: "опубликовано", descartado: "отклонено" };
  const eurf = (v) => v ? Number(v).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €" : "—";
  let soc = [];
  async function loadSoc() {
    const f = $("#sFilter").value;
    let q = A.client.from("social_cola").select("*").order("escenario").order("created_at");
    if (f) q = q.eq("estado", f);
    const { data, error } = await q.limit(500);
    if (error) throw error;
    soc = data;
    const groups = {};
    soc.forEach((r, i) => (groups[r.escenario] = groups[r.escenario] || []).push([r, i]));
    $("#soc").innerHTML = soc.length ? Object.entries(groups).map(([k, rows]) => `<section class="soc-group"><h3>${esc(SOCN[k] || k)} <span class="muted">· ${rows.length}</span></h3>
      ${rows.map(([r, i]) => { const x = r.resumen || {}; const v = x.valoracion || {};
        return `<div class="soc-row" data-i="${i}">
          <label class="soc-sel"><input type="checkbox" data-sel${r.estado === "pendiente" ? " checked" : ""}></label>
          <div class="soc-main"><b>${esc(x.titulo || r.subasta_id)}</b>
            <span class="muted">${esc([x.localidad, x.provincia].filter(Boolean).join(", "))} · ${esc(r.subasta_id)} · стартовая ${eurf(x.valor_subasta)}${v.estimado ? " · рынок ≈ " + eurf(v.estimado) : ""}${x.fecha_fin ? " · до " + esc(String(x.fecha_fin).slice(0, 10)) : ""}</span>
            ${r.resultado ? `<span class="soc-res">${Object.entries(r.resultado).map(([l, o]) => `${esc(l.toUpperCase())}: ${o && o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">файл</a>` : ""}${o && o.permalink ? ` · <a href="${esc(o.permalink)}" target="_blank" rel="noopener">пост</a>` : ""}`).join(" · ")}</span>` : ""}
          </div>

          <span class="rp ${r.estado === "publicado" ? "ok" : r.estado === "descartado" ? "bad" : "warn"}">${esc(SOCS[r.estado] || r.estado)}</span>
          <a class="btn ghost" href="./#/s/${encodeURIComponent(r.subasta_id)}" target="_blank" rel="noopener">↗</a>
          <button class="btn ghost" data-sdel title="Убрать из очереди">✕</button>
        </div>`; }).join("")}</section>`).join("") : `<p class="muted">Пусто. Отмечайте аукционы в карточках кнопками «В соцсети».</p>`;
    $("#sCount").textContent = `всего: ${soc.length}`;
  }
  async function socBadge() {
    try { const { count } = await A.client.from("social_cola").select("id", { count: "exact", head: true }).in("estado", ["pendiente", "listo"]); $("#socBadge").textContent = count || 0; $("#socBadge").hidden = !count; } catch (e) { console.error(e); }
  }

  // ---------- события
  function bind() {
    $$(".adm-tabs [data-tab]").forEach((b) => b.addEventListener("click", () => {
      $$(".adm-tabs [data-tab]").forEach((x) => x.setAttribute("aria-selected", x === b));
      $$(".adm-tab").forEach((s) => (s.hidden = s.id !== "tab-" + b.dataset.tab));
      if (b.dataset.tab === "trusted") loadTrusted().catch(fail);
      if (b.dataset.tab === "notas") loadNotas().catch(fail);
      if (b.dataset.tab === "ayuda") loadAyuda().catch(fail);
      if (b.dataset.tab === "soc") loadSoc().catch(fail);
    }));
    let t; $("#q").addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { page = 0; loadUsers().catch(fail); }, 300); });
    $("#filter").addEventListener("change", () => { page = 0; loadUsers().catch(fail); });
    $("#prev").onclick = () => { page--; loadUsers().catch(fail); };
    $("#next").onclick = () => { page++; loadUsers().catch(fail); };
    $("#rows").addEventListener("input", (e) => { const tr = e.target.closest("tr[data-i]"); if (tr) markDirty(tr); });
    $("#rows").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-i]"); if (!tr) return;
      const inp = tr.querySelector('[data-f="until"]');
      const add = e.target.closest("[data-add]"); if (add) { inp.value = addMonths(inp.value, +add.dataset.add); markDirty(tr); return; }
      const set = e.target.closest("[data-set]"); if (set) { inp.value = set.dataset.set; markDirty(tr); return; }
      if (e.target.closest("[data-save]")) saveRow(tr, false);
      if (e.target.closest("[data-revoke]")) saveRow(tr, true);
    });
    $("#trustForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await rpc("admin_trusted_add", { p_email: $("#tEmail").value, p_note: $("#tNote").value }); msg("Адрес добавлен в доверенные."); $("#tEmail").value = ""; $("#tNote").value = ""; await Promise.all([loadTrusted(), loadStats()]); } catch (err) { fail(err); }
    });
    $("#trusted").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-untrust]"); if (!b) return;
      if (!confirm(`Убрать ${b.dataset.untrust} из доверенных? Доступ останется по его дате.`)) return;
      try { await rpc("admin_trusted_remove", { p_email: b.dataset.untrust }); msg("Адрес убран."); await Promise.all([loadTrusted(), loadStats()]); } catch (err) { fail(err); }
    });
    $("#defForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await rpc("admin_set_default_trial", { p_date: $("#defDate").value }); msg("Срок для новых пользователей сохранён."); await Promise.all([loadStats(), loadUsers()]); } catch (err) { fail(err); }
    });
    $("#bulkForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const from = $("#bFrom").value, to = $("#bTo").value, exp = $("#bExp").checked;
      if (!confirm(`Продлить до ${day(to)} всем, у кого доступ до ${day(from)}${exp ? " или уже истёк" : ""}?`)) return;
      try { const r = await rpc("admin_bulk_extend", { p_from: from, p_to: to, p_include_expired: exp }); msg(`Продлено: ${r.updated}`); await Promise.all([loadStats(), loadUsers()]); } catch (err) { fail(err); }
    });
    $("#sFilter").addEventListener("change", () => loadSoc().catch(fail));
    $("#sAll").onclick = () => { const boxes = $$("#soc [data-sel]"); const all = boxes.every((b) => b.checked); boxes.forEach((b) => (b.checked = !all)); };
    $("#sProcess").onclick = async () => {
      const ids = $$("#soc .soc-row").filter((r) => r.querySelector("[data-sel]").checked).map((r) => soc[+r.dataset.i]).filter((r) => ["pendiente", "procesar"].includes(r.estado)).map((r) => r.id);
      if (!ids.length) return msg("Ничего не выбрано (обрабатываются только записи «в очереди»).", true);
      try {
        const { error } = await A.client.from("social_cola").update({ estado: "procesar", updated_at: new Date().toISOString() }).in("id", ids);
        if (error) throw error;
        msg(`К обработке: ${ids.length}. Теперь напишите Claude в чате: «обработай очередь соцсетей».`);
        await loadSoc(); socBadge();
      } catch (err) { fail(err); }
    };
    $("#soc").addEventListener("click", async (e) => {
      if (!e.target.closest("[data-sdel]")) return;
      const r = soc[+e.target.closest(".soc-row").dataset.i];
      try {
        const q = r.estado === "pendiente" ? A.client.from("social_cola").delete().eq("id", r.id) : A.client.from("social_cola").update({ estado: "descartado" }).eq("id", r.id);
        const { error } = await q; if (error) throw error; await loadSoc(); socBadge();
      } catch (err) { fail(err); }
    });
    $("#aFilter").addEventListener("change", () => loadAyuda().catch(fail));
    $("#ayuda").addEventListener("click", async (e) => {
      const c = e.target.closest("[data-copy]");
      if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); c.classList.add("copied"); setTimeout(() => c.classList.remove("copied"), 900); } catch (err) { fail(err); } return; }
      if (!e.target.closest("[data-asave]")) return;
      const card = e.target.closest(".nota-card"); const a = ayuda[+card.dataset.i];
      try { await rpc("admin_ayuda_update", { p_id: a.id, p_estado: card.querySelector('[data-f="estado"]').value, p_nota: card.querySelector('[data-f="nota"]').value }); msg(`Заявка #${a.id} сохранена.`); await loadAyuda(); ayudaBadge(); } catch (err) { fail(err); }
    });
    $("#nFilter").addEventListener("change", () => loadNotas().catch(fail));
    $("#notas").addEventListener("click", async (e) => {
      const c = e.target.closest("[data-copy]");
      if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); c.classList.add("copied"); setTimeout(() => c.classList.remove("copied"), 900); } catch (err) { fail(err); } return; }
      const card = e.target.closest(".nota-card"); if (!card) return;
      const n = notas[+card.dataset.i];
      if (e.target.closest("[data-nsave]")) {
        try { await rpc("admin_nota_update", { p_id: n.id, p_estado: card.querySelector('[data-f="estado"]').value, p_nota: card.querySelector('[data-f="nota"]').value }); msg(`Заказ #${n.id} сохранён.`); await loadNotas(); notasBadge(); } catch (err) { fail(err); }
      }
      if (e.target.closest("[data-open-pdf]")) {
        try {
          const files = await A.notaFiles(n.pdf_path);
          const links = await Promise.all(files.map(async (f) => { const r = await A.client.storage.from("notas").createSignedUrl(f.path, 600); if (r.error) throw r.error; return `<a href="${esc(r.data.signedUrl)}" target="_blank" rel="noopener">${esc(f.name)}</a>`; }));
          card.querySelector(".nota-flist").innerHTML = links.join(" · ") || "файлов нет";
        } catch (err) { fail(err); }
      }
      if (e.target.closest("[data-mail]")) sendNotaMail(n);
      if (e.target.closest("[data-attach-docs]")) {
        try {
          const { data: files, error } = await A.client.from("subasta_docs").select("*").eq("subasta_id", n.subasta_id).order("path");
          if (error) throw error;
          if (!files.length) return msg("В карточке аукциона нет файлов. Откройте аукцион и нажмите «Скачать документы с BOE» или загрузите их.", true);
          const folder = `${n.user_id}/${n.id}/`;
          if (n.pdf_path && !n.pdf_path.endsWith("/")) { const mv = await A.client.storage.from("notas").move(n.pdf_path, folder + "nota_simple.pdf"); if (mv.error) throw mv.error; }
          for (const f of files) {
            const dl = await A.client.storage.from("docs").download(f.path);
            if (dl.error) throw dl.error;
            const up = await A.client.storage.from("notas").upload(folder + f.path.split("/").pop(), dl.data, { upsert: true, contentType: f.mime || "application/pdf" });
            if (up.error) throw up.error;
          }
          await rpc("admin_nota_update", { p_id: n.id, p_estado: n.estado, p_pdf_path: folder });
          msg(`В заказ #${n.id} скопировано файлов: ${files.length}. Когда комплект готов, поставьте статус «Готово» и отправьте письмо.`);
          await loadNotas();
        } catch (err) { fail(err); }
      }
    });
    $("#notas").addEventListener("change", async (e) => {
      const inp = e.target.closest("[data-pdf]"); if (!inp || !inp.files.length) return;
      const n = notas[+inp.closest(".nota-card").dataset.i];
      const folder = `${n.user_id}/${n.id}/`;
      const safe = (name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").slice(-80);
      try {
        // старый заказ с одним PDF переносим в папку
        if (n.pdf_path && !n.pdf_path.endsWith("/")) {
          const mv = await A.client.storage.from("notas").move(n.pdf_path, folder + "nota_simple.pdf");
          if (mv.error) throw mv.error;
        }
        for (const file of inp.files) {
          const up = await A.client.storage.from("notas").upload(folder + safe(file.name), file, { upsert: true, contentType: file.type || "application/pdf" });
          if (up.error) throw up.error;
        }
        await rpc("admin_nota_update", { p_id: n.id, p_estado: "entregado", p_pdf_path: folder });
        msg(`Файлы загружены (${inp.files.length}), заказ #${n.id} — «Готово». Теперь отправьте письмо клиенту.`);
        await loadNotas(); notasBadge();
      } catch (err) { fail(err); }
    });
    $("#logout").onclick = async () => { await A.signOut(); location.reload(); };
    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("#lBtn").disabled = true; $("#lErr").hidden = true;
      const { error } = await A.signIn($("#lEmail").value.trim(), $("#lPw").value);
      $("#lBtn").disabled = false;
      if (error) { $("#lErr").textContent = "Неверная почта или пароль."; $("#lErr").hidden = false; return; }
      setTimeout(start, 300);
    });
  }

  async function start() {
    if (!A || !A.enabled) { $("#denied").hidden = false; $("#denied p").textContent = "Supabase не подключён в config.js."; return; }
    const { data } = await A.client.auth.getSession();
    A.session = data.session;
    await A.refreshStatus();
    const u = A.user();
    $("#loginBox").hidden = !!u; $("#logout").hidden = !u;
    $("#who").textContent = u ? u.email : "";
    if (!u) return;
    if (!(A.status && A.status.is_admin)) { $("#denied").hidden = false; $("#app").hidden = true; return; }
    $("#denied").hidden = true; $("#app").hidden = false;
    try { await loadStats(); await loadUsers(); } catch (e) { fail(e); }
    notasBadge(); ayudaBadge(); socBadge();
    if (location.hash === "#soc") { const t = $('.adm-tabs [data-tab="soc"]'); if (t) t.click(); }
  }

  (async () => {
    bind();
    try { await A.init(); } catch (e) { console.error(e); }
    start();
  })();
})();
