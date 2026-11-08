// Уведомления о новой заявке на сопровождение: администратору и подтверждение клиенту (Resend).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const ADMIN = "subastaradar@gmail.com";
const PK: Record<string, string> = { p1: "1 · Юр. анализ лота (1 000 €)", p2: "2 · Сопровождение на аукционе (5 %)", p3: "3 · Покупка под ключ (10 %)", p4: "4 · Полный цикл (50 % прибыли)", consulta: "Нужен совет" };
const CONF: Record<string, { s: string; b: string }> = {
  es: { s: "Hemos recibido tu solicitud", b: "Gracias. Hemos recibido tu solicitud n.º {n} y te contactaremos en 24 horas laborables para hablar de tu caso." },
  en: { s: "We've received your request", b: "Thank you. We've received your request #{n} and will contact you within 24 working hours to discuss your case." },
  ru: { s: "Мы получили вашу заявку", b: "Спасибо! Мы получили заявку № {n} и свяжемся с вами в течение 24 рабочих часов, чтобы обсудить задачу." },
};

async function send(key: string, to: string, subject: string, html: string, replyTo?: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("NOTA_FROM") ?? "Subástica <no-reply@subastica.es>", to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  return r.ok ? "" : `${r.status} ${await r.text()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ ok: false, error: "no_resend_key" });
    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "auth" }, 401);
    const { id } = await req.json();
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: a } = await admin.from("solicitudes_ayuda").select("*").eq("id", id).eq("user_id", u.user.id).single();
    if (!a) return json({ ok: false, error: "not_found" }, 404);
    if (Date.now() - new Date(a.created_at).getTime() > 10 * 60 * 1000) return json({ ok: false, error: "old" }, 400);
    const rows = [["Пакет", PK[a.paquete] ?? a.paquete], ["Аукцион", [a.subasta_id, a.subasta_resumen].filter(Boolean).join(" · ")], ["Имя", a.nombre], ["Email", a.email], ["Телефон", a.telefono],
      ["Язык", a.idioma], ["Бюджет", a.presupuesto ? `${Number(a.presupuesto).toLocaleString("ru-RU")} €` : ""], ["Финансирование", a.financiacion], ["NIE", a.nie], ["Подпись", a.firma], ["Цель", a.objetivo], ["Комментарий", a.comentario]]
      .filter(([, v]) => v).map(([k, v]) => `<tr><td style="color:#56625D;padding:4px 12px 4px 0;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join("");
    const e1 = await send(key, ADMIN, `Новая заявка на сопровождение #${a.id} — ${a.nombre}`,
      `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16201D"><p><b>Новая заявка #${a.id}</b></p><table>${rows}</table>
       <p><a href="https://subastica.es/admin.html">Открыть панель</a></p></div>`, a.email);
    const c = CONF[a.idioma] ?? CONF.es;
    const e2 = await send(key, a.email, `${c.s} — Subástica`,
      `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16201D;line-height:1.5"><p>${esc(c.b.replace("{n}", String(a.id)))}</p><p>Subástica · subastica.es</p></div>`, ADMIN);
    return json({ ok: !e1 && !e2, admin: e1 || "ok", client: e2 || "ok" });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
