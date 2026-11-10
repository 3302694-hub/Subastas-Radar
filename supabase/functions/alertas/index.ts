// Почтовые оповещения о новых аукционах.
// POST {baja: token}           — отписка по ссылке из письма (страница baja.html), без входа.
// POST {envios: [...]}         — рассылка; вызывает только наш сервер с ключом service_role.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const SITE = "https://subastica.es";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, KEY);

type Lang = "es" | "en" | "ru";
const CAT: Record<Lang, Record<string, string>> = {
  es: { vivienda: "Vivienda", garaje: "Garaje", trastero: "Trastero", local: "Local", nave: "Nave", solar: "Solar", rustica: "Finca rústica", inmueble: "Inmueble", otros: "Bien" },
  en: { vivienda: "Home", garaje: "Parking space", trastero: "Storage room", local: "Commercial unit", nave: "Warehouse", solar: "Plot", rustica: "Rural land", inmueble: "Property", otros: "Asset" },
  ru: { vivienda: "Жильё", garaje: "Гараж", trastero: "Кладовая", local: "Помещение", nave: "Склад", solar: "Участок", rustica: "Земля", inmueble: "Недвижимость", otros: "Имущество" },
};
const GRP: Record<Lang, Record<string, string>> = {
  es: { vivienda: "Viviendas", g_garaje: "Garajes y trasteros", g_local: "Locales y naves", g_terreno: "Terrenos", oculta: "Vivienda oculta" },
  en: { vivienda: "Homes", g_garaje: "Parking and storage", g_local: "Shops and warehouses", g_terreno: "Land", oculta: "Hidden homes" },
  ru: { vivienda: "Жильё", g_garaje: "Гаражи и кладовые", g_local: "Помещения и склады", g_terreno: "Земля", oculta: "Скрытое жильё" },
};
const TX: Record<Lang, Record<string, string>> = {
  es: {
    subj1: "1 subasta nueva", subjN: "{n} subastas nuevas", any: "Todo tipo de bienes", spain: "toda España", upto: "hasta {v}",
    intro: "Hay subastas nuevas que coinciden con tu alerta:", start: "Precio de salida", ends: "Termina", hidden: "En el BOE figura como «{t}», por la descripción es vivienda",
    open: "Ver la subasta", more: "Ver las {n} en Subástica", why: "Recibes este correo porque creaste una alerta en Subástica.",
    off: "Desactivar esta alerta", soon: "pronto",
  },
  en: {
    subj1: "1 new auction", subjN: "{n} new auctions", any: "All asset types", spain: "all of Spain", upto: "up to {v}",
    intro: "New auctions match your alert:", start: "Starting price", ends: "Ends", hidden: "Listed in the BOE as “{t}”, the description says it's a home",
    open: "View the auction", more: "See all {n} on Subástica", why: "You get this email because you created an alert on Subástica.",
    off: "Turn off this alert", soon: "soon",
  },
  ru: {
    subj1: "1 новый аукцион", subjN: "Новых аукционов: {n}", any: "Любое имущество", spain: "вся Испания", upto: "до {v}",
    intro: "Появились новые аукционы по вашему оповещению:", start: "Стартовая цена", ends: "Конец торгов", hidden: "В BOE указано «{t}», по описанию это жильё",
    open: "Открыть аукцион", more: "Все {n} на Subástica", why: "Вы получили это письмо, потому что создали оповещение на Subástica.",
    off: "Отключить это оповещение", soon: "скоро",
  },
};
const fill = (s: string, o: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k) => String(o[k] ?? ""));
const loc = (l: Lang) => ({ es: "es-ES", en: "en-GB", ru: "ru-RU" }[l]);
const eur = (v: unknown, l: Lang) => v == null || v === "" ? "—" : new Intl.NumberFormat(loc(l), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(v));
const date = (iso: string | null, l: Lang) => iso ? new Date(iso).toLocaleString(loc(l), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }) : "";
const cap = (s: string) => { s = (s || "").toLowerCase(); return s.replace(/(^|[\s(-])\p{L}/gu, (m) => m.toUpperCase()); };

type Item = { id: string; categoria: string; oculta?: string; localidad?: string; provincia?: string; valor_subasta?: number; fecha_fin?: string | null };
type Envio = { alerta_id: number; total: number; url: string; items: Item[] };

function summary(a: Record<string, unknown>, l: Lang) {
  const t = TX[l];
  return [a.categoria ? GRP[l][a.categoria as string] || a.categoria : t.any, a.provincia ? cap(a.provincia as string) : t.spain,
    a.max_valor ? fill(t.upto, { v: eur(a.max_valor, l) }) : ""].filter(Boolean).join(" · ");
}

function render(a: Record<string, unknown>, e: Envio) {
  const l = (["es", "en", "ru"].includes(a.idioma as string) ? a.idioma : "es") as Lang;
  const t = TX[l];
  const rows = e.items.map((s) => {
    const what = CAT[l][s.oculta ? "vivienda" : s.categoria] || CAT[l].otros;
    const place = [cap(s.localidad || ""), cap(s.provincia || "")].filter((x, i, arr) => x && arr.indexOf(x) === i).join(", ");
    const link = `${SITE}/#/s/${encodeURIComponent(s.id)}`;
    return `<tr><td style="padding:14px 0;border-bottom:1px solid #E3DED2">
      <a href="${link}" style="font:600 17px Georgia,serif;color:#1A1F1C;text-decoration:none">${esc(what)}${place ? ", " + esc(place) : ""}</a>
      ${s.oculta ? `<div style="margin-top:4px;font:600 12px Arial,sans-serif;color:#7A4E00">${esc(fill(t.hidden, { t: s.oculta }))}</div>` : ""}
      <div style="margin-top:6px;font:14px Arial,sans-serif;color:#4A564F">${esc(t.start)}: <b style="color:#1A1F1C">${esc(eur(s.valor_subasta, l))}</b>${s.fecha_fin ? ` · ${esc(t.ends)}: ${esc(date(s.fecha_fin, l))}` : ""}</div>
      <div style="margin-top:8px"><a href="${link}" style="font:600 14px Arial,sans-serif;color:#1F4D3A">${esc(t.open)} →</a></div>
    </td></tr>`;
  }).join("");
  const off = `${SITE}/baja.html?t=${a.token}&l=${l}`;
  const html = `<div style="background:#F4F1EA;padding:24px 12px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px">
    <div style="font:700 18px Georgia,serif;letter-spacing:.08em;color:#1F4D3A">SUBÁSTICA</div>
    <p style="font:15px Arial,sans-serif;color:#1A1F1C;margin:18px 0 4px">${esc(t.intro)}</p>
    <p style="font:13px Arial,sans-serif;color:#4A564F;margin:0 0 6px">${esc(summary(a, l))}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>
    ${e.total > e.items.length ? `<p style="margin:18px 0 0"><a href="${esc(e.url)}" style="display:inline-block;background:#1F4D3A;color:#fff;font:600 14px Arial,sans-serif;padding:11px 18px;border-radius:6px;text-decoration:none">${esc(fill(t.more, { n: e.total }))}</a></p>` : ""}
    <p style="font:12px Arial,sans-serif;color:#7A847E;margin:24px 0 0">${esc(t.why)} <a href="${off}" style="color:#7A847E">${esc(t.off)}</a></p>
  </div></div>`;
  const subject = `Subástica: ${e.total === 1 ? t.subj1 : fill(t.subjN, { n: e.total })} · ${summary(a, l)}`;
  return { subject, html, off };
}

async function send(to: string, subject: string, html: string, off: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return "no_resend_key";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("NOTA_FROM") ?? "Subástica <no-reply@subastica.es>", to: [to], subject, html,
      headers: { "List-Unsubscribe": `<${off}>` },
    }),
  });
  return r.ok ? "" : `${r.status} ${(await r.text()).slice(0, 200)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "json" }, 400); }

  // отписка: только деактивация по случайному токену, больше ничего не раскрываем
  if (typeof body.baja === "string") {
    if (!/^[0-9a-f-]{36}$/i.test(body.baja)) return json({ ok: false }, 400);
    const { data } = await db.from("alertas").update({ activa: false }).eq("token", body.baja).select("id");
    return json({ ok: !!(data && data.length) });
  }

  // рассылка — только с ключом service_role (его знает только наш сервер)
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!KEY || auth !== KEY) return json({ ok: false, error: "auth" }, 401);
  const envios = Array.isArray(body.envios) ? body.envios as Envio[] : [];
  const out: Record<string, string> = {};
  for (const e of envios.slice(0, 500)) {
    const { data: a } = await db.from("alertas").select("*").eq("id", e.alerta_id).eq("activa", true).maybeSingle();
    if (!a || !a.email || !e.items?.length) { out[e.alerta_id] = "skip"; continue; }
    const m = render(a, e);
    const err = body.dry ? "" : await send(a.email, m.subject, m.html, m.off);
    if (!err && !body.dry) await db.from("alertas").update({ last_sent: new Date().toISOString(), enviados: (a.enviados || 0) + 1 }).eq("id", a.id);
    out[e.alerta_id] = err || (body.dry ? "dry" : "ok");
    await new Promise((r) => setTimeout(r, 250)); // Resend: не больше нескольких писем в секунду
  }
  return json({ ok: true, result: out });
});
