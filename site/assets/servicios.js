// Страница «Сопровождение в аукционе»: пакеты услуг и заявка (только для зарегистрированных)
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
  const sub = (qs.get("sub") || "").slice(0, 40);
  const subTxt = (qs.get("r") || "").slice(0, 200);
  let lang = store.get("lang") || ((navigator.language || "es").slice(0, 2) === "ru" ? "ru" : (navigator.language || "es").slice(0, 2) === "en" ? "en" : "es");
  if (!["es", "en", "ru"].includes(lang)) lang = "es";

  const T = {
    es: {
      title: "Te acompañamos en la subasta",
      lead: "Acceso legal, seguro y controlado a las subastas públicas de inmuebles en España, con lotes que suelen salir muy por debajo del valor de mercado. Te acompañamos en toda la operación: del análisis del lote a la entrega del inmueble o su venta.",
      soon: "Contratación a partir de enero de 2027. Ya puedes enviar tu solicitud: te contactamos, resolvemos dudas y preparamos el presupuesto sin compromiso.",
      packs: "Paquetes de servicio", term: "Plazo", price: "Precio", vat: "+ IVA", choose: "Solicitar este paquete",
      p0: { n: "Consulta por videollamada", s: "Resuelve tus dudas antes de pujar", i: ["Videollamada de hasta 45 minutos en español, inglés o ruso", "Revisamos juntos el lote y sus documentos", "Riesgos principales: cargas, ocupantes y costes", "Si conviene pujar y cuáles son los siguientes pasos", "Resumen por escrito después de la llamada"], t: "En 2–3 días hábiles", p: "75 €", pay: "Pago único antes de la llamada" },
      p1: { n: "Análisis jurídico del lote", s: "Para decidir si pujar", i: ["Análisis jurídico completo del inmueble", "Verificación de todos los documentos en fuentes oficiales", "Nota simple actualizada del Registro", "Deudas, embargos, cargas y procedimientos judiciales", "Riesgo de ocupación", "Valoración y precio máximo de puja seguro"], t: "3–7 días hábiles", p: "1.000 €", pay: "Precio fijo, pago único" },
      p2: { n: "Acompañamiento en la subasta", s: "Puja y pago, sin inscripción de la propiedad", i: ["Todo el paquete 1", "Alta en el Portal de Subastas del BOE", "Constitución y control del depósito", "Puja en tu nombre (con poder notarial)", "Control del pago del precio al juzgado", "Acompañamiento en la verificación del origen de los fondos", "Obtención y entrega de toda la documentación judicial"], t: "3–8 meses, según el juzgado", p: "5 %", pu: "del precio de adjudicación", pay: "3 % al ganar la subasta · 2 % al recibir los documentos del juzgado" },
      p3: { n: "Compra llave en mano", s: "Hasta la inscripción a tu nombre y la entrega", i: ["Todo el paquete 1", "Alta en subastas.boe.es, depósito y puja en tu nombre", "Control del pago y del origen de los fondos", "Documentación judicial completa", "Inscripción de la propiedad en el Registro", "Desalojo de ocupantes por vía judicial", "Entrega del inmueble llave en mano"], t: "8–18 meses", p: "10 %", pu: "del precio de compra", pay: "3 % al ganar · 4 % tras la inscripción · 3 % a la entrega" },
      p4: { n: "Ciclo de inversión completo", s: "Compra, gestión y venta", i: ["Todo lo anterior", "Estrategia de salida de la inversión", "Reforma y puesta a punto (previa aprobación)", "Gestión del inmueble hasta la venta", "Venta en el mercado al mejor precio", "Control financiero del proyecto", "Liquidación final del beneficio neto"], t: "8–24 meses", p: "50 %", pu: "del beneficio neto", pay: "Al liquidar la venta" },
      how: "Cómo trabajamos",
      steps: [["Solicitud", "Eliges el paquete y nos cuentas tu caso."], ["Llamada", "Revisamos el lote contigo y te enviamos el presupuesto."], ["Contrato", "Firmamos el encargo y, si pujamos por ti, otorgas un poder notarial."], ["Trabajo por etapas", "Cada pago corresponde a una etapa cumplida."]],
      crit: "Cómo seleccionamos los lotes",
      crits: ["Solo subastas públicas oficiales: juzgados, BOE, Agencia Tributaria, Seguridad Social y ayuntamientos.", "Buscamos lotes con un descuento del 50 % o más sobre el valor de mercado.", "Revisión jurídica completa antes de pujar.", "Cada paso por la vía legal, con documentación oficial."],
      imp: "Importante",
      imps: ["Nadie puede garantizar ganar una subasta ni un beneficio concreto: te damos los datos y el precio máximo razonable para que decidas.", "El depósito y el precio los pagas tú directamente a la cuenta del juzgado o del organismo, nunca a nosotros.", "El inmueble se adjudica e inscribe a tu nombre.", "Las actuaciones ante los tribunales las firma un abogado colegiado."],
      form: "Solicitud de acompañamiento", login_t: "Para enviar la solicitud entra en tu cuenta", login_d: "Así podemos vincularla a tu perfil y avisarte. La cuenta es gratuita.", signup: "Crear cuenta gratis", login: "Entrar",
      f_pack: "Paquete", f_cons: "No lo sé, aconsejadme", f_sub: "Subasta", f_sub_rm: "Quitar", f_name: "Nombre y apellidos", f_email: "Correo", f_phone: "Teléfono o WhatsApp", f_lang: "Idioma para hablar",
      f_budget: "Presupuesto máximo de compra, €", f_fin: "Financiación", fin: { propios: "Fondos propios", hipoteca: "Hipoteca", mixta: "Mixta", pendiente: "Aún no lo sé" },
      f_nie: "¿Tienes NIE / DNI?", nie: { si: "Sí", tramite: "En trámite", no: "No" }, f_firma: "Identificación electrónica", firma: { certificado: "Certificado digital", clave: "Cl@ve", ninguno: "Ninguna" },
      f_goal: "Objetivo", goal: { vivir: "Vivir", alquilar: "Alquilar", revender: "Revender", otro: "Otro" }, f_comment: "Comentario", f_ok: "Acepto que Subástica use estos datos para contactarme sobre esta solicitud (", privacy: "política de privacidad", f_send: "Enviar solicitud",
      sent: "Solicitud n.º {n} enviada. Te contactaremos en 24 horas laborables.", err_fields: "Rellena nombre, correo, teléfono y acepta la política de privacidad.", err_many: "Has enviado demasiadas solicitudes hoy.", err: "No se pudo enviar. Inténtalo de nuevo.",
      back: "← Volver a Subástica", ru: "", sel: "Seleccionado"
    },
    en: {
      title: "We guide you through the auction",
      lead: "Legal, safe and controlled access to Spain's public property auctions, where lots often start well below market value. We support you through the whole deal: from analysing the lot to handing over the property or selling it.",
      soon: "Contracts start in January 2027. You can already send your request: we'll contact you, answer questions and prepare a no-obligation quote.",
      packs: "Service packages", term: "Timeline", price: "Price", vat: "+ VAT", choose: "Request this package",
      p0: { n: "Video consultation", s: "Clear up your doubts before bidding", i: ["Video call of up to 45 minutes in Spanish, English or Russian", "We go through the lot and its documents together", "Main risks: charges, occupants and costs", "Whether to bid and what the next steps are", "Written summary after the call"], t: "Within 2–3 working days", p: "€75", pay: "One payment before the call" },
      p1: { n: "Legal analysis of the lot", s: "To decide whether to bid", i: ["Full legal analysis of the property", "All documents checked against official sources", "Up-to-date land registry extract (nota simple)", "Debts, liens, charges and court cases", "Squatting risk", "Valuation and safe maximum bid"], t: "3–7 working days", p: "€1,000", pay: "Fixed price, one payment" },
      p2: { n: "Auction support", s: "Bidding and payment, without registering ownership", i: ["Everything in package 1", "Registration on the BOE auction portal", "Deposit set-up and control", "Bidding on your behalf (with a notarial power of attorney)", "Control of the price payment to the court", "Support with source-of-funds checks", "Obtaining and handing over all court documents"], t: "3–8 months, depending on the court", p: "5%", pu: "of the winning price", pay: "3% on winning · 2% on receiving the court documents" },
      p3: { n: "Turnkey purchase", s: "Up to registration in your name and handover", i: ["Everything in package 1", "Portal registration, deposit and bidding for you", "Control of payment and source of funds", "Full set of court documents", "Registration of ownership at the Land Registry", "Eviction of occupants through the courts", "Turnkey handover of the property"], t: "8–18 months", p: "10%", pu: "of the purchase price", pay: "3% on winning · 4% after registration · 3% on handover" },
      p4: { n: "Full investment cycle", s: "Purchase, management and sale", i: ["Everything above", "Exit strategy", "Renovation (subject to your approval)", "Property management until sale", "Sale on the open market at the best price", "Financial control of the project", "Final settlement of net profit"], t: "8–24 months", p: "50%", pu: "of net profit", pay: "On settlement of the sale" },
      how: "How we work",
      steps: [["Request", "Choose a package and tell us about your case."], ["Call", "We review the lot with you and send a quote."], ["Contract", "We sign the engagement and, if we bid for you, you grant a notarial power of attorney."], ["Work in stages", "Each payment matches a completed stage."]],
      crit: "How we select lots",
      crits: ["Only official public auctions: courts, BOE, Tax Agency, Social Security and municipalities.", "We look for lots at 50% or more below market value.", "Full legal review before bidding.", "Every step through legal channels, with official documents."],
      imp: "Important",
      imps: ["No one can guarantee winning an auction or a specific profit: we give you the facts and a reasonable maximum price so you can decide.", "You pay the deposit and price directly to the court's or authority's account, never to us.", "The property is awarded and registered in your name.", "Court proceedings are signed by a registered lawyer (abogado colegiado)."],
      form: "Support request", login_t: "Sign in to send the request", login_d: "That way we can link it to your profile and keep you posted. The account is free.", signup: "Create free account", login: "Sign in",
      f_pack: "Package", f_cons: "Not sure, advise me", f_sub: "Auction", f_sub_rm: "Remove", f_name: "Full name", f_email: "Email", f_phone: "Phone or WhatsApp", f_lang: "Language to talk in",
      f_budget: "Maximum purchase budget, €", f_fin: "Financing", fin: { propios: "Own funds", hipoteca: "Mortgage", mixta: "Mixed", pendiente: "Not sure yet" },
      f_nie: "Do you have an NIE / DNI?", nie: { si: "Yes", tramite: "In progress", no: "No" }, f_firma: "Electronic ID", firma: { certificado: "Digital certificate", clave: "Cl@ve", ninguno: "None" },
      f_goal: "Goal", goal: { vivir: "Live in it", alquilar: "Rent out", revender: "Resell", otro: "Other" }, f_comment: "Comment", f_ok: "I agree that Subástica may use this data to contact me about this request (", privacy: "privacy policy", f_send: "Send request",
      sent: "Request #{n} sent. We'll contact you within 24 working hours.", err_fields: "Fill in name, email, phone and accept the privacy policy.", err_many: "You've sent too many requests today.", err: "Could not send. Please try again.",
      back: "← Back to Subástica", sel: "Selected"
    },
    ru: {
      title: "Сопровождаем вас на аукционе",
      lead: "Законный, безопасный и контролируемый доступ к государственным аукционам недвижимости в Испании, где лоты часто выставляются значительно ниже рыночной цены. Ведём сделку целиком: от анализа лота до передачи объекта или его продажи.",
      soon: "Договоры заключаем с января 2027 года. Заявку можно отправить уже сейчас: мы свяжемся, ответим на вопросы и подготовим расчёт без обязательств.",
      packs: "Пакеты услуг", term: "Срок", price: "Стоимость", vat: "+ IVA", choose: "Выбрать этот пакет",
      p0: { n: "Консультация по видеосвязи", s: "Разобраться в лоте до ставки", i: ["Видеозвонок до 45 минут на русском, испанском или английском", "Вместе смотрим лот и его документы", "Главные риски: обременения, жильцы и расходы", "Стоит ли участвовать и что делать дальше", "Письменное резюме после звонка"], t: "В течение 2–3 рабочих дней", p: "75 €", pay: "Один платёж до звонка" },
      p1: { n: "Юридический анализ лота", s: "Чтобы решить, участвовать ли", i: ["Полный юридический анализ объекта", "Проверка всех документов по официальным источникам", "Актуальная nota simple из Реестра", "Долги, аресты, обременения и судебные процессы", "Риск окупации", "Оценка и безопасная максимальная ставка"], t: "3–7 рабочих дней", p: "1 000 €", pay: "Фиксированная цена, один платёж" },
      p2: { n: "Сопровождение на аукционе", s: "Торги и оплата, без регистрации права собственности", i: ["Всё из пакета 1", "Регистрация на портале аукционов BOE", "Внесение депозита и контроль", "Ставки от вашего имени (по нотариальной доверенности)", "Контроль оплаты цены в суд", "Сопровождение проверки происхождения средств", "Получение и передача всех судебных документов"], t: "3–8 месяцев, зависит от суда", p: "5 %", pu: "от цены победы на аукционе", pay: "3 % после победы · 2 % после получения документов из суда" },
      p3: { n: "Покупка «под ключ»", s: "До регистрации собственности на вас и передачи объекта", i: ["Всё из пакета 1", "Регистрация на subastas.boe.es, депозит и ставки от вашего имени", "Контроль оплаты и происхождения средств", "Полный пакет судебных документов", "Регистрация права собственности в Реестре", "Выселение жильцов через суд", "Передача объекта «под ключ»"], t: "8–18 месяцев", p: "10 %", pu: "от цены покупки", pay: "3 % после победы · 4 % после регистрации · 3 % при передаче" },
      p4: { n: "Полный инвестиционный цикл", s: "Покупка, управление и продажа", i: ["Всё перечисленное выше", "Стратегия выхода из инвестиции", "Ремонт (по согласованию с вами)", "Управление объектом до продажи", "Продажа на рынке по лучшей цене", "Финансовый контроль проекта", "Итоговое распределение чистой прибыли"], t: "8–24 месяца", p: "50 %", pu: "от чистой прибыли", pay: "При расчёте после продажи" },
      how: "Как мы работаем",
      steps: [["Заявка", "Вы выбираете пакет и рассказываете о задаче."], ["Звонок", "Разбираем лот вместе и присылаем расчёт."], ["Договор", "Подписываем договор; если ставки делаем мы — вы оформляете нотариальную доверенность."], ["Работа по этапам", "Каждый платёж — за завершённый этап."]],
      crit: "Как мы отбираем лоты",
      crits: ["Только официальные государственные аукционы: суды, BOE, налоговая служба, Seguridad Social, муниципалитеты.", "Ищем лоты с дисконтом от 50 % к рыночной цене.", "Полная юридическая проверка до ставки.", "Каждый шаг — законным путём, с официальными документами."],
      imp: "Важно",
      imps: ["Никто не может гарантировать победу на аукционе или определённую прибыль: мы даём факты и разумную максимальную цену, решение за вами.", "Депозит и цену вы платите напрямую на счёт суда или ведомства, а не нам.", "Объект присуждается и регистрируется на ваше имя.", "Действия в суде подписывает адвокат, член коллегии (abogado colegiado)."],
      form: "Заявка на сопровождение", login_t: "Чтобы отправить заявку, войдите в аккаунт", login_d: "Так мы привяжем её к вашему профилю и будем держать в курсе. Аккаунт бесплатный.", signup: "Создать аккаунт", login: "Войти",
      f_pack: "Пакет", f_cons: "Не знаю, посоветуйте", f_sub: "Аукцион", f_sub_rm: "Убрать", f_name: "Имя и фамилия", f_email: "Email", f_phone: "Телефон или WhatsApp", f_lang: "Язык общения",
      f_budget: "Максимальный бюджет покупки, €", f_fin: "Финансирование", fin: { propios: "Свои средства", hipoteca: "Ипотека", mixta: "Смешанное", pendiente: "Пока не знаю" },
      f_nie: "Есть NIE / DNI?", nie: { si: "Да", tramite: "Оформляется", no: "Нет" }, f_firma: "Электронная идентификация", firma: { certificado: "Цифровой сертификат", clave: "Cl@ve", ninguno: "Нет" },
      f_goal: "Цель", goal: { vivir: "Жить", alquilar: "Сдавать", revender: "Перепродать", otro: "Другое" }, f_comment: "Комментарий", f_ok: "Я согласен, что Subástica использует эти данные, чтобы связаться со мной по заявке (", privacy: "политика конфиденциальности", f_send: "Отправить заявку",
      sent: "Заявка № {n} отправлена. Свяжемся с вами в течение 24 рабочих часов.", err_fields: "Заполните имя, email, телефон и примите политику конфиденциальности.", err_many: "Сегодня отправлено слишком много заявок.", err: "Не удалось отправить. Попробуйте ещё раз.",
      back: "← Вернуться на Subástica", sel: "Выбрано"
    }
  };
  const t = (k) => T[lang][k] != null ? T[lang][k] : T.es[k];
  const PACKS = ["p0", "p1", "p2", "p3", "p4"];
  let pack = PACKS.includes(qs.get("p")) ? qs.get("p") : "";
  let keepSub = !!sub;

  function packCard(k) {
    const p = t(k);
    return `<article class="sv-pack${pack === k ? " on" : ""}">
      <span class="sv-num">${k.slice(1)}</span><h3>${esc(p.n)}</h3><p class="muted">${esc(p.s)}</p>
      <div class="sv-price"><b>${esc(p.p)}</b> <span>${esc(p.pu ? p.pu + " " : "")}${esc(t("vat"))}</span></div>
      <p class="fine">${esc(p.pay)}</p>
      <ul>${p.i.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <p class="sv-term"><small>${esc(t("term"))}</small> ${esc(p.t)}</p>
      <button type="button" class="btn${pack === k ? "" : " ghost"}" data-pack="${k}">${esc(pack === k ? t("sel") : t("choose"))}</button>
    </article>`;
  }
  const opts = (name, obj, val) => Object.entries(obj).map(([k, l]) => `<label class="sv-chip"><input type="radio" name="${name}" value="${k}"${val === k ? " checked" : ""}><span>${esc(l)}</span></label>`).join("");

  function formHTML() {
    const u = A.user && A.user();
    if (A.enabled && !u) {
      const next = encodeURIComponent(location.pathname.split("/").pop() + location.search + "#solicitud");
      return `<div class="sv-login"><h3>${esc(t("login_t"))}</h3><p class="muted">${esc(t("login_d"))}</p>
        <a class="btn" href="./?auth=signup&next=${next}">${esc(t("signup"))}</a> <a class="btn ghost" href="./?auth=login&next=${next}">${esc(t("login"))}</a></div>`;
    }
    const me = store.get("ayuda_me") || {};
    const packOpts = Object.assign({}, ...PACKS.map((k) => ({ [k]: `${k.slice(1)}. ${t(k).n}` })), { consulta: t("f_cons") });
    return `<form id="svForm" class="sv-form" novalidate>
      <fieldset><legend>${esc(t("f_pack"))}</legend><div class="sv-chips col">${opts("paquete", packOpts, pack || "consulta")}</div></fieldset>
      ${sub && keepSub ? `<div class="sv-sub"><div><small>${esc(t("f_sub"))}</small><b>${esc(sub)}</b>${subTxt ? `<span class="muted">${esc(subTxt)}</span>` : ""}</div><button type="button" class="link-btn" id="svSubRm">${esc(t("f_sub_rm"))}</button></div>` : ""}
      <div class="nf-grid">
        <label><span>${esc(t("f_name"))}</span><input name="nombre" required maxlength="160" autocomplete="name" value="${esc(me.nombre || "")}"></label>
        <label><span>${esc(t("f_email"))}</span><input name="email" type="email" required autocomplete="email" value="${esc(me.email || (u && u.email) || "")}"></label>
        <label><span>${esc(t("f_phone"))}</span><input name="telefono" type="tel" required maxlength="30" autocomplete="tel" value="${esc(me.telefono || "")}"></label>
        <label><span>${esc(t("f_lang"))}</span><select name="idioma">${[["es", "Español"], ["en", "English"], ["ru", "Русский"]].map(([k, l]) => `<option value="${k}"${k === lang ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label><span>${esc(t("f_budget"))}</span><input name="presupuesto" type="number" min="0" step="1000" inputmode="numeric"></label>
      </div>
      <fieldset><legend>${esc(t("f_fin"))}</legend><div class="sv-chips">${opts("financiacion", t("fin"))}</div></fieldset>
      <fieldset><legend>${esc(t("f_nie"))}</legend><div class="sv-chips">${opts("nie", t("nie"))}</div></fieldset>
      <fieldset><legend>${esc(t("f_firma"))}</legend><div class="sv-chips">${opts("firma", t("firma"))}</div></fieldset>
      <fieldset><legend>${esc(t("f_goal"))}</legend><div class="sv-chips">${opts("objetivo", t("goal"))}</div></fieldset>
      <label><span>${esc(t("f_comment"))}</span><textarea name="comentario" rows="4" maxlength="2000"></textarea></label>
      <label class="nf-check"><input type="checkbox" name="ok" required> <span>${esc(t("f_ok"))}<a href="privacidad.html" target="_blank">${esc(t("privacy"))}</a>).</span></label>
      <p class="auth-msg" id="svMsg" role="status" hidden></p>
      <button class="btn big" type="submit">${esc(t("f_send"))}</button>
    </form>`;
  }

  function render() {
    document.documentElement.lang = lang;
    document.title = t("title") + " — Subástica";
    $("#svRoot").innerHTML = `
      <section class="sv-hero"><h1>${esc(t("title"))}</h1><p class="sv-lead">${esc(t("lead"))}</p>
        <p class="nf-soon">${esc(t("soon"))}</p></section>
      <h2>${esc(t("packs"))}</h2>
      <div class="sv-packs" id="precios">${PACKS.map(packCard).join("")}</div>
      <div class="sv-cols">
        <section><h2>${esc(t("how"))}</h2><ol class="sv-steps">${t("steps").map(([a, b]) => `<li><b>${esc(a)}</b><span>${esc(b)}</span></li>`).join("")}</ol></section>
        <section><h2>${esc(t("crit"))}</h2><ul class="sv-list">${t("crits").map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          <h2>${esc(t("imp"))}</h2><ul class="sv-list">${t("imps").map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
      </div>
      <section id="solicitud" class="sv-formbox"><h2>${esc(t("form"))}</h2>${formHTML()}</section>
      <p><a href="./">${esc(t("back"))}</a> · <a href="privacidad.html">Privacidad</a> · <a href="terminos.html">Términos</a></p>`;
    document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === lang));
    bindForm();
  }

  function bindForm() {
    const f = $("#svForm");
    if (!f) return;
    const rm = $("#svSubRm"); if (rm) rm.onclick = () => { keepSub = false; render(); };
    f.addEventListener("change", (e) => { if (e.target.name === "paquete") { pack = PACKS.includes(e.target.value) ? e.target.value : ""; document.querySelectorAll(".sv-pack").forEach((c, i) => c.classList.toggle("on", PACKS[i] === pack)); } });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const v = (n) => { const el = f.elements[n]; if (!el) return ""; return (el.value || "").trim(); };
      const msg = (txt, ok) => { const m = $("#svMsg"); m.textContent = txt; m.className = "auth-msg " + (ok ? "ok" : "err"); m.hidden = false; };
      if (!v("nombre") || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("email")) || v("telefono").replace(/\D/g, "").length < 9 || !f.elements.ok.checked) { msg(t("err_fields"), false); return; }
      const btn = f.querySelector("[type=submit]"); btn.disabled = true;
      try {
        const { data, error } = await A.client.rpc("ayuda_crear", {
          p_subasta_id: keepSub ? sub : "", p_subasta_resumen: keepSub ? subTxt : "", p_paquete: v("paquete") || "consulta",
          p_nombre: v("nombre"), p_email: v("email"), p_telefono: v("telefono"), p_idioma: v("idioma"),
          p_presupuesto: v("presupuesto") ? Number(v("presupuesto")) : null, p_financiacion: v("financiacion"), p_nie: v("nie"),
          p_firma: v("firma"), p_objetivo: v("objetivo"), p_comentario: v("comentario")
        });
        if (error) throw error;
        store.set("ayuda_me", { nombre: v("nombre"), email: v("email"), telefono: v("telefono") });
        msg(t("sent").replace("{n}", data.id), true);
        btn.hidden = true;
        // письма вам и клиенту — если не получится, заявка всё равно в панели
        A.client.functions.invoke("ayuda-aviso", { body: { id: data.id } }).catch(() => {});
      } catch (err) {
        console.error(err);
        msg(t(String(err && err.message || "").includes("demasiadas") ? "err_many" : String(err && err.message || "").includes("datos") ? "err_fields" : "err"), false);
        btn.disabled = false;
      }
    };
  }

  document.addEventListener("click", (e) => {
    const p = e.target.closest("[data-pack]");
    if (p) {
      pack = p.dataset.pack; render();
      const box = $("#solicitud"); if (box) box.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const l = e.target.closest(".lang [data-lang]");
    if (l) { lang = l.dataset.lang; store.set("lang", lang); render(); }
  });

  (async () => {
    render();
    if (A.enabled) {
      try { await A.init(); } catch (e) { console.error(e); }
      render();
      if (A.on) A.on(render);
      if (location.hash === "#solicitud") { const box = $("#solicitud"); if (box) box.scrollIntoView({ block: "start" }); }
    }
  })();
})();
