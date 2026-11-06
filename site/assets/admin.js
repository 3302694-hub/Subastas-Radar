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
      `<span><b>${s.new_7d}</b>новых за 7 дней</span>`,
      `<span><b>${s.active_7d}</b>заходили за 7 дней</span>`,
      `<span><b>${s.subastas_actuales}</b>текущих аукционов в базе</span>`,
      `<span>Бесплатный период для новых: <b>${day(s.default_trial_until)}</b></span>`
    ].join("");
    $("#defDate").value = s.default_trial_until || "";
    if (!$("#bFrom").value) $("#bFrom").value = s.default_trial_until || "";
  }

  // ---------- пользователи
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
      <td>${status(u)}</td>
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

  // ---------- события
  function bind() {
    $$(".adm-tabs [data-tab]").forEach((b) => b.addEventListener("click", () => {
      $$(".adm-tabs [data-tab]").forEach((x) => x.setAttribute("aria-selected", x === b));
      $$(".adm-tab").forEach((s) => (s.hidden = s.id !== "tab-" + b.dataset.tab));
      if (b.dataset.tab === "trusted") loadTrusted().catch(fail);
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
  }

  (async () => {
    bind();
    try { await A.init(); } catch (e) { console.error(e); }
    start();
  })();
})();
