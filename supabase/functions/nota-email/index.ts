// Письмо клиенту о готовой nota simple (через Resend).
// Вызывает только администратор. Нужен секрет RESEND_API_KEY (Supabase → Edge Functions → Secrets);
// необязательно NOTA_FROM, например "Subástica <notas@subastica.es>" — домен должен быть подтверждён в Resend.
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
    // файлы: старый формат — один PDF, новый — папка {user}/{id}/
    let paths: string[] = [n.pdf_path];
    if (n.pdf_path.endsWith("/")) {
      const { data: list } = await admin.storage.from("notas").list(n.pdf_path.slice(0, -1), { limit: 50 });
      paths = (list ?? []).filter((f) => f.id).map((f) => n.pdf_path + f.name);
    }
    if (!paths.length) return json({ ok: false, error: "no_files" }, 400);
    const links: { name: string; url: string }[] = [];
    for (const p of paths) {
      const { data: signed } = await admin.storage.from("notas").createSignedUrl(p, 7 * 24 * 3600);
      if (signed?.signedUrl) links.push({ name: p.split("/").pop()!, url: signed.signedUrl });
    }
    const pack = n.tipo === "pack";
    const finca = [n.registro, n.finca && "finca " + n.finca].filter(Boolean).join(", ");
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1A1F1C;line-height:1.5">
      <p>Hola ${esc(n.nombre)}:</p>
      <p>Ya tienes ${pack ? "los documentos que pediste" : "la nota simple que pediste"} (pedido #${n.id}${finca ? " — " + esc(finca) : ""}).</p>
      ${links.map((l) => `<p><a href="${esc(l.url)}" style="display:inline-block;background:#1F4D3A;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none">Descargar ${esc(links.length > 1 ? l.name : pack ? "los documentos" : "la nota simple")}</a></p>`).join("")}
      <p style="color:#4A564F;font-size:13px">Los enlaces son válidos 7 días. También los tienes en subastica.es → Mis pedidos.</p>
      <p>Un saludo,<br>Subástica</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("NOTA_FROM") ?? "Subástica <no-reply@subastica.es>",
        to: [n.email], reply_to: "subastaradar@gmail.com",
        subject: `${pack ? "Tus documentos" : "Tu nota simple"} #${n.id} — Subástica`, html,
      }),
    });
    if (!r.ok) return json({ ok: false, error: "resend_" + r.status, detail: await r.text() }, 502);
    await admin.from("notas_pedidos").update({ nota_admin: ((n.nota_admin ?? "") + ` [письмо ${new Date().toISOString().slice(0, 16)}]`).trim() }).eq("id", n.id);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
