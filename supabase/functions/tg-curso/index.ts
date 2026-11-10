// Telegram-бот оплаты курса «Обучение» (Telegram Stars, валюта XTR).
//
// Путь пользователя: subastica.es/curso.html → кнопка «Оплатить в Telegram» → t.me/<бот>?start=c_<token>
// → бот присылает счёт в Stars → после оплаты curso_pago_registrar() создаёт метку доступа
// (curso_accesos, дата старта = момент оплаты) → бот даёт ссылку на курс.
//
// Секреты функции: CURSO_BOT_TOKEN — токен бота от @BotFather (обязателен);
// RESEND_API_KEY — если есть, владелец получает письмо о каждой оплате.
// Вебхук подключается из admin.html → «Обучение» → «Подключить бота» (действие setup).
// verify_jwt = false: Telegram не присылает JWT. Запросы Telegram проверяются по секретному заголовку,
// действия владельца — по JWT администратора.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const ok = () => new Response("ok");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SITE = (Deno.env.get("SITE_URL") ?? "https://subastica.es").replace(/\/$/, "");
const ADMIN_MAIL = Deno.env.get("CURSO_ADMIN_EMAIL") ?? "subastaradar@gmail.com";
const TOKEN = Deno.env.get("CURSO_BOT_TOKEN") ?? "";
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Lang = "es" | "en" | "ru";
const L: Record<Lang, Record<string, string>> = {
  ru: {
    title: "Курс «Аукционы BOE: от новичка до первой ставки»",
    desc: "34 урока на subastica.es: как читать лот, проверять обременения, считать бюджет и поставить первую ставку. Уроки открываются по расписанию с даты оплаты.",
    short: "Курс Subástica",
    label: "Доступ к курсу",
    hello: "Здравствуйте! Здесь оплачивается курс Subástica.\n\nЧтобы доступ открылся в вашем аккаунте, начните на сайте: откройте страницу курса, войдите и нажмите «Оплатить в Telegram».",
    expired: "Ссылка устарела или уже использована в другом аккаунте Telegram. Откройте страницу курса на сайте и нажмите кнопку оплаты ещё раз.",
    already: "Доступ к курсу уже открыт для {email}.",
    closed: "Продажа курса сейчас закрыта. Напишите нам: " + "{mail}",
    invoice: "Аккаунт на сайте: {email}\nПосле оплаты курс откроется в этом аккаунте автоматически.",
    paid: "Оплата получена, спасибо! Курс открыт для {email}. Первые уроки уже доступны, остальные будут открываться по расписанию.",
    paid_repeat: "Эта оплата уже учтена. Курс открыт.",
    paid_nolink: "Оплата получена, но мы не нашли связанный аккаунт на сайте. Мы откроем доступ вручную — напишите на {mail} и укажите email, с которым вы входите на subastica.es.",
    precheck_fail: "Не удалось проверить заказ. Откройте страницу курса на сайте и попробуйте ещё раз.",
    open: "Открыть курс",
    site: "Страница курса",
    support: "Вопросы по оплате и доступу: {mail}. Укажите email аккаунта на subastica.es и дату оплаты.\nВозврат Stars — по условиям на {site}/terminos.html",
    terms: "Условия: {site}/terminos.html",
  },
  es: {
    title: "Curso «Subastas BOE: de cero a tu primera puja»",
    desc: "34 lecciones en subastica.es: cómo leer un lote, revisar cargas, calcular el presupuesto y hacer tu primera puja. Las lecciones se abren por calendario desde la fecha de pago.",
    short: "Curso de Subástica",
    label: "Acceso al curso",
    hello: "¡Hola! Aquí se paga el curso de Subástica.\n\nPara que el acceso se abra en tu cuenta, empieza en la web: abre la página del curso, entra y pulsa «Pagar en Telegram».",
    expired: "El enlace ha caducado o ya se usó con otra cuenta de Telegram. Abre la página del curso en la web y pulsa de nuevo el botón de pago.",
    already: "El curso ya está abierto para {email}.",
    closed: "La venta del curso está cerrada ahora mismo. Escríbenos: {mail}",
    invoice: "Cuenta en la web: {email}\nTras el pago, el curso se abrirá automáticamente en esta cuenta.",
    paid: "¡Pago recibido, gracias! El curso está abierto para {email}. Las primeras lecciones ya están disponibles; el resto se abrirá según el calendario.",
    paid_repeat: "Este pago ya está registrado. El curso está abierto.",
    paid_nolink: "Pago recibido, pero no encontramos la cuenta de la web vinculada. Abriremos el acceso a mano: escribe a {mail} con el correo con el que entras en subastica.es.",
    precheck_fail: "No pudimos verificar el pedido. Abre la página del curso en la web e inténtalo de nuevo.",
    open: "Abrir el curso",
    site: "Página del curso",
    support: "Dudas sobre el pago o el acceso: {mail}. Indica el correo de tu cuenta en subastica.es y la fecha del pago.\nDevolución de Stars según las condiciones en {site}/terminos.html",
    terms: "Condiciones: {site}/terminos.html",
  },
  en: {
    title: "Course «BOE auctions: from zero to your first bid»",
    desc: "34 lessons on subastica.es: how to read a lot, check charges, budget the purchase and place your first bid. Lessons unlock on a schedule from the payment date.",
    short: "Subástica course",
    label: "Course access",
    hello: "Hello! This bot handles payment for the Subástica course.\n\nSo that access opens in your account, start on the website: open the course page, sign in and tap «Pay in Telegram».",
    expired: "This link has expired or was already used by another Telegram account. Open the course page on the website and tap the payment button again.",
    already: "The course is already open for {email}.",
    closed: "Course sales are closed right now. Write to us: {mail}",
    invoice: "Website account: {email}\nAfter payment the course opens in this account automatically.",
    paid: "Payment received, thank you! The course is open for {email}. The first lessons are available now; the rest unlock on schedule.",
    paid_repeat: "This payment is already recorded. The course is open.",
    paid_nolink: "Payment received, but we couldn't find the linked website account. We'll open access manually: write to {mail} with the email you use on subastica.es.",
    precheck_fail: "We couldn't verify the order. Open the course page on the website and try again.",
    open: "Open the course",
    site: "Course page",
    support: "Questions about payment or access: {mail}. Include your subastica.es account email and the payment date.\nStars refunds follow the terms at {site}/terminos.html",
    terms: "Terms: {site}/terminos.html",
  },
};
const langOf = (u?: { language_code?: string }): Lang => {
  const c = (u?.language_code ?? "").slice(0, 2);
  return c === "ru" || c === "uk" || c === "be" ? "ru" : c === "es" || c === "ca" || c === "gl" || c === "eu" ? "es" : "en";
};
const tx = (lang: Lang, k: string, v: Record<string, string> = {}) =>
  Object.entries({ mail: ADMIN_MAIL, site: SITE, ...v }).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, b), L[lang][k]);
const courseUrl = (lang: Lang) => `${SITE}/curso.html?lang=${lang}`;
const button = (text: string, url: string) => ({ inline_keyboard: [[{ text, url }]] });

async function tg(method: string, body: Record<string, unknown>) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({ ok: false }));
  if (!j.ok) console.error(method, JSON.stringify(j).slice(0, 300));
  return j;
}

// секрет вебхука выводится из токена бота и сервисного ключа: отдельный секрет хранить не нужно
async function webhookSecret() {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`tg-curso:${TOKEN}:${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function mailAdmin(subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("NOTA_FROM") ?? "Subástica <no-reply@subastica.es>", to: [ADMIN_MAIL], subject, html }),
  }).catch((e) => console.error("mail", e));
}
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// ---------- обработка апдейтов Telegram
async function onStart(msg: any, arg: string) {
  const chat = msg.chat.id, lang = langOf(msg.from);
  const m = arg.match(/^c_([0-9a-f]{36})$/);
  if (!m) return tg("sendMessage", { chat_id: chat, text: tx(lang, "hello"), reply_markup: button(tx(lang, "site"), courseUrl(lang)) });
  const token = m[1];
  const { data: v, error } = await db.rpc("curso_vinculo_usar", { p_token: token, p_tg_user: msg.from.id });
  if (error || !v?.ok) return tg("sendMessage", { chat_id: chat, text: tx(lang, "expired"), reply_markup: button(tx(lang, "site"), courseUrl(lang)) });
  if (v.activo) return tg("sendMessage", { chat_id: chat, text: tx(lang, "already", { email: v.email ?? "" }), reply_markup: button(tx(lang, "open"), courseUrl(lang)) });
  const { data: cfg } = await db.rpc("curso_bot_config");
  if (!cfg?.venta || !cfg?.precio_xtr) return tg("sendMessage", { chat_id: chat, text: tx(lang, "closed") });
  await tg("sendMessage", { chat_id: chat, text: tx(lang, "invoice", { email: v.email ?? "" }) });
  return tg("sendInvoice", {
    chat_id: chat, title: tx(lang, "short"), description: `${tx(lang, "title")}. ${tx(lang, "desc")}`.slice(0, 255),
    payload: `c:${token}`, currency: "XTR", provider_token: "",
    prices: [{ label: tx(lang, "label"), amount: cfg.precio_xtr }],
  });
}

async function onPreCheckout(q: any) {
  const lang = langOf(q.from);
  const fail = (reason: string) => {
    console.warn("precheckout fail", reason);
    return tg("answerPreCheckoutQuery", { pre_checkout_query_id: q.id, ok: false, error_message: tx(lang, "precheck_fail") });
  };
  const token = String(q.invoice_payload ?? "").replace(/^c:/, "");
  if (!/^[0-9a-f]{36}$/.test(token)) return fail("payload");
  if (q.currency !== "XTR") return fail("currency");
  const { data: cfg } = await db.rpc("curso_bot_config");
  if (!cfg?.venta || !cfg?.precio_xtr) return fail("closed");
  if (q.total_amount !== cfg.precio_xtr) return fail("amount");
  const { data: v } = await db.rpc("curso_vinculo_usar", { p_token: token, p_tg_user: q.from.id });
  if (!v?.ok) return fail("token");
  return tg("answerPreCheckoutQuery", { pre_checkout_query_id: q.id, ok: true });
}

async function onPaid(msg: any) {
  const p = msg.successful_payment, chat = msg.chat.id, lang = langOf(msg.from);
  const token = String(p.invoice_payload ?? "").replace(/^c:/, "");
  const { data: r, error } = await db.rpc("curso_pago_registrar", {
    p_token: token, p_tg_user: msg.from.id, p_tg_username: msg.from.username ?? null,
    p_charge: p.telegram_payment_charge_id, p_provider_charge: p.provider_payment_charge_id ?? null,
    p_amount: p.total_amount, p_currency: p.currency, p_payload: p.invoice_payload, p_raw: p,
  });
  // ошибка базы: отвечаем Telegram 500, он повторит апдейт (запись платежа идемпотентна по charge_id)
  if (error) throw new Error("pago_registrar: " + error.message);
  const who = msg.from.username ? `@${msg.from.username}` : String(msg.from.id);
  if (!r?.ok) {
    await mailAdmin(`Курс: оплата без связи с аккаунтом (${p.total_amount} ${p.currency})`,
      `<p>Оплата от ${esc(who)} на ${esc(p.total_amount)} ${esc(p.currency)} пришла без действующей ссылки с сайта.</p>
       <p>Привяжите её к пользователю: <a href="${SITE}/admin.html#curso">admin.html → Обучение → Оплаты</a>.</p>`);
    return tg("sendMessage", { chat_id: chat, text: tx(lang, "paid_nolink") });
  }
  if (r.repeat) return tg("sendMessage", { chat_id: chat, text: tx(lang, "paid_repeat"), reply_markup: button(tx(lang, "open"), courseUrl(lang)) });
  const { data: u } = await db.from("profiles").select("email").eq("id", r.user_id).maybeSingle();
  await mailAdmin(`Курс оплачен: ${u?.email ?? r.user_id} (${p.total_amount} ${p.currency})`,
    `<p>${esc(u?.email)} оплатил курс в Telegram (${esc(who)}): ${esc(p.total_amount)} ${esc(p.currency)}. Метка доступа создана автоматически.</p>
     <p><a href="${SITE}/admin.html#curso">Открыть панель</a></p>`);
  return tg("sendMessage", { chat_id: chat, text: tx(lang, "paid", { email: u?.email ?? "" }), reply_markup: button(tx(lang, "open"), courseUrl(lang)) });
}

async function onUpdate(u: any) {
  if (u.pre_checkout_query) return onPreCheckout(u.pre_checkout_query);
  const msg = u.message;
  if (!msg || msg.chat?.type !== "private") return;
  if (msg.successful_payment) return onPaid(msg);
  const text = String(msg.text ?? "").trim();
  const lang = langOf(msg.from);
  if (text.startsWith("/start")) return onStart(msg, text.slice(6).trim());
  if (text.startsWith("/paysupport")) return tg("sendMessage", { chat_id: msg.chat.id, text: tx(lang, "support") });
  if (text.startsWith("/terms")) return tg("sendMessage", { chat_id: msg.chat.id, text: tx(lang, "terms") });
  return tg("sendMessage", { chat_id: msg.chat.id, text: tx(lang, "hello"), reply_markup: button(tx(lang, "site"), courseUrl(lang)) });
}

// ---------- действия владельца: подключить вебхук и проверить состояние
async function adminAction(req: Request) {
  const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: isAdmin } = await asUser.rpc("is_admin");
  if (isAdmin !== true) return json({ ok: false, error: "admin only" }, 403);
  if (!TOKEN) return json({ ok: false, error: "Не задан секрет CURSO_BOT_TOKEN в Supabase → Edge Functions → Secrets" });
  const { action } = await req.json().catch(() => ({}));
  const me = await tg("getMe", {});
  if (!me.ok) return json({ ok: false, error: "Telegram не принял токен бота" });
  if (action === "setup") {
    const hook = await tg("setWebhook", {
      url: `${SUPABASE_URL}/functions/v1/tg-curso`, secret_token: await webhookSecret(),
      allowed_updates: ["message", "pre_checkout_query"], drop_pending_updates: false,
    });
    await db.rpc("curso_set_bot", { p_bot: me.result.username });
    for (const [lc, d] of [["", "Оплата курса Subástica"], ["es", "Pago del curso de Subástica"], ["en", "Subástica course payment"]] as const) {
      await tg("setMyCommands", {
        ...(lc ? { language_code: lc } : {}),
        commands: [
          { command: "start", description: d },
          { command: "paysupport", description: lc === "es" ? "Ayuda con el pago" : lc === "en" ? "Payment support" : "Помощь с оплатой" },
          { command: "terms", description: lc === "es" ? "Condiciones" : lc === "en" ? "Terms" : "Условия" },
        ],
      });
    }
    if (!hook.ok) return json({ ok: false, error: hook.description ?? "setWebhook" });
  }
  const info = await tg("getWebhookInfo", {});
  return json({
    ok: true, bot: me.result.username,
    webhook: info.result?.url === `${SUPABASE_URL}/functions/v1/tg-curso`,
    pending: info.result?.pending_update_count ?? 0,
    last_error: info.result?.last_error_message ?? null,
    last_error_date: info.result?.last_error_date ?? null,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const hdr = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (hdr === null) {
    try { return await adminAction(req); } catch (e) { return json({ ok: false, error: String(e) }, 500); }
  }
  if (!TOKEN || hdr !== await webhookSecret()) return new Response("forbidden", { status: 403 });
  try {
    await onUpdate(await req.json());
  } catch (e) {
    console.error("update", e);
    return new Response("retry", { status: 500 }); // Telegram повторит доставку апдейта
  }
  return ok();
});
