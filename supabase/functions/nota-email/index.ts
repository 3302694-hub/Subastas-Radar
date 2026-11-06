// Письмо клиенту о готовой nota simple (через Resend).
// Вызывает только администратор. Нужен секрет RESEND_API_KEY (Supabase → Edge Functions → Secrets);
// необязательно NOTA_FROM, например "SubastaRadar <notas@subasta-radar.es>" — домен должен быть подтверждён в Resend.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ ok: false, error: "no_resend_key" });
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: isAdmin } = await asUser.rpc("is_admin");
    if (!isAdmin) return json({ ok: false, error: "forbidden" }, 403);

    const { id } = await req.json();
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: n, error } = await admin.from("notas_pedidos").select("*").eq("id", id).single();
    if (error || !n) return json({ ok: false, error: "not_found" }, 404);
    if (!n.pdf_path) return json({ ok: false, error: "no_pdf" }, 400);
    const { data: signed } = await admin.storage.from("notas").createSignedUrl(n.pdf_path, 7 * 24 * 3600);
    const link = signed?.signedUrl ?? "";
    const finca = [n.registro, n.finca && "finca " + n.finca].filter(Boolean).join(", ");
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16201D;line-height:1.5">
      <p>Hola ${esc(n.nombre)}:</p>
      <p>Ya tienes la nota simple que pediste (pedido #${n.id}${finca ? " — " + esc(finca) : ""}).</p>
      <p><a href="${esc(link)}" style="display:inline-block;background:#0B6B66;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Descargar la nota simple (PDF)</a></p>
      <p style="color:#56625D;font-size:13px">El enlace es válido 7 días. También la tienes en subasta-radar.es → Mis notas simples.</p>
      <p>Un saludo,<br>SubastaRadar</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("NOTA_FROM") ?? "SubastaRadar <no-reply@subasta-radar.es>",
        to: [n.email], reply_to: "subastaradar@gmail.com",
        subject: `Tu nota simple #${n.id} — SubastaRadar`, html,
      }),
    });
    if (!r.ok) return json({ ok: false, error: "resend_" + r.status, detail: await r.text() }, 502);
    await admin.from("notas_pedidos").update({ nota_admin: ((n.nota_admin ?? "") + ` [письмо ${new Date().toISOString().slice(0, 16)}]`).trim() }).eq("id", n.id);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
