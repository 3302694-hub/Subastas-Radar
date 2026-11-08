// Скачивает документы аукциона с портала BOE (то, что открыто без входа) и справки Катастро
// в закрытое хранилище docs/{id}/ и записывает их в таблицу subasta_docs. Вызывает только администратор.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const UA = { "User-Agent": "Mozilla/5.0 (Subastica; +https://subastica.es)" };
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "documento";
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "application/zip": "zip" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: isAdmin } = await asUser.rpc("is_admin");
    if (!isAdmin) return json({ ok: false, error: "forbidden" }, 403);
    const { data: u } = await asUser.auth.getUser();
    const body = await req.json();
    const id = body.id;
    if (!/^SUB-[A-Z]{2}-\d{4}-[0-9A-Z]+$/.test(String(id))) return json({ ok: false, error: "bad_id" }, 400);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1) свежие ссылки на документы: идентификаторы в ссылках BOE со временем меняются
    const docs = new Map<string, { url: string; name: string }>();
    let loginNote = false;
    for (const ver of [1, 2, 3]) {
      const r = await fetch(`https://subastas.boe.es/detalleSubasta.php?idSub=${id}&ver=${ver}`, { headers: UA });
      const t = await r.text();
      if (/acceso\.php[^"]*"[^>]*>[^<]*(documentaci|consultar)/i.test(t) || /usuarios registrados/i.test(t)) loginNote = true;
      for (const m of t.matchAll(/href="([^"]*verDocumento\.php[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
        const href = new URL(decode(m[1]), "https://subastas.boe.es/").href;
        const key = (href.match(/idDoc=(\d+)-/) || [, href])[1]!;
        if (!docs.has(key)) docs.set(key, { url: href, name: decode(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) || `Documento ${key}` });
      }
    }
    const saved: unknown[] = [];
    const errors: string[] = [];
    const save = async (path: string, bytes: Uint8Array, mime: string, nombre: string, origen: string, src: string) => {
      const up = await admin.storage.from("docs").upload(path, bytes, { contentType: mime, upsert: true });
      if (up.error) throw up.error;
      const { error } = await admin.from("subasta_docs").upsert({ subasta_id: id, nombre, path, origen, mime, bytes: bytes.length, url_origen: src, subido_por: u?.user?.email ?? null }, { onConflict: "path" });
      if (error) throw error;
      saved.push({ nombre, path, bytes: bytes.length });
    };
    let n = 0;
    for (const [key, d] of docs) {
      if (++n > 20) break;
      try {
        const r = await fetch(d.url, { headers: { ...UA, Referer: `https://subastas.boe.es/detalleSubasta.php?idSub=${id}&ver=1` } });
        const mime = (r.headers.get("content-type") || "").split(";")[0].trim();
        const b = new Uint8Array(await r.arrayBuffer());
        if (!EXT[mime] || b.length < 200) { errors.push(`${d.name}: не файл (${mime || r.status})`); continue; }
        await save(`${id}/boe-${key.padStart(2, "0")}-${slug(d.name)}.${EXT[mime]}`, b, mime, d.name, "boe", d.url);
      } catch (e) { errors.push(`${d.name}: ${String(e).slice(0, 120)}`); }
    }
    // 2) справки Катастро (описательно-графическая) по кадастровым номерам лота
    const { data: rec } = await admin.from("subastas").select("data").eq("id", id).maybeSingle();
    const rcs = [...new Set([...((rec?.data?.bienes ?? []) as { ref_catastral?: string }[]).map((b) => b.ref_catastral), ...(Array.isArray(body.rcs) ? body.rcs : [])]
      .map((rc) => String(rc || "").toUpperCase().split(/\s+/)[0].replace(/[^0-9A-Z]/g, "").slice(0, 20))
      .filter((rc) => rc.length >= 14))].slice(0, 3);
    for (const rc of rcs) {
      try {
        const src = `https://www1.sedecatastro.gob.es/CYCBienInmueble/SECImprimirCroquisYDatos.aspx?refcat=${rc}`;
        const r = await fetch(src, { headers: UA });
        const b = new Uint8Array(await r.arrayBuffer());
        if ((r.headers.get("content-type") || "").includes("pdf") && b.length > 1000)
          await save(`${id}/catastro-${rc}.pdf`, b, "application/pdf", `Catastro: consulta descriptiva y gráfica ${rc}`, "catastro", src);
        else errors.push(`Catastro ${rc}: справка недоступна`);
      } catch (e) { errors.push(`Catastro ${rc}: ${String(e).slice(0, 120)}`); }
    }
    const needLogin = docs.size === 0 && (loginNote || !!rec?.data?.docs_login);
    return json({ ok: true, found: docs.size, saved, errors, needLogin });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
