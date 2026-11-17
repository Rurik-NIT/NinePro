/**
 * Envio de mídia por link (para agentes de IA, que não leem arquivos do computador da pessoa).
 *  1. O agente chama gerar_link_de_envio → recebe https://…/enviar/<token> (vale 30 minutos)
 *  2. A pessoa abre o link e solta as fotos e vídeos (página pública, protegida pelo token)
 *  3. O agente chama verificar_envio → recebe as URLs públicas para publicar
 * O token é assinado (HMAC) com TOKEN_ENCRYPTION_KEY; os arquivos ficam em midia/<espaço>/envios/<id>/.
 *  - POST /api/midia { acao: "assinar", token, nome, tipo, tamanho } → URL assinada de upload direto ao Storage
 *  - POST /api/midia { acao: "status", token }                       → arquivos já enviados
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Env = Record<string, string | undefined>;
const TTL_MIN = 30;
export const UPLOAD_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm", avi: "video/x-msvideo", pdf: "application/pdf",
};
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });

const keyOf = (env: Env) => { const k = env.TOKEN_ENCRYPTION_KEY; if (!k) throw new Error("Servidor sem TOKEN_ENCRYPTION_KEY configurada."); return k; };
const sign = (env: Env, payload: string) => createHmac("sha256", keyOf(env)).update(`midia:${payload}`).digest("base64url").slice(0, 32);

export function makeUploadToken(env: Env, ws: string) {
  const id = randomBytes(8).toString("hex");
  const exp = Math.floor(Date.now() / 1000) + TTL_MIN * 60;
  const payload = `${id}.${ws}.${exp}`;
  return { token: `${Buffer.from(payload).toString("base64url")}.${sign(env, payload)}`, id, expiresAt: new Date(exp * 1000).toISOString() };
}
export function readUploadToken(env: Env, token: string): { id: string; ws: string; exp: number; expired: boolean } | null {
  const [b64, sig] = String(token ?? "").split(".");
  if (!b64 || !sig) return null;
  let payload: string;
  try { payload = Buffer.from(b64, "base64url").toString("utf8"); } catch { return null; }
  const want = Buffer.from(sign(env, payload)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [id, ws, exp] = payload.split(".");
  if (!/^[0-9a-f]{16}$/.test(id) || !/^[0-9a-f-]{36}$/.test(ws) || !/^\d+$/.test(exp)) return null;
  return { id, ws, exp: Number(exp), expired: Number(exp) * 1000 < Date.now() };
}

export async function listUploads(sb: SupabaseClient, ws: string, id: string) {
  const folder = `${ws}/envios/${id}`;
  const { data } = await sb.storage.from("midia").list(folder, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
  return (data ?? []).filter((f) => f.name && !f.name.startsWith(".")).map((f) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    return { nome: f.name.replace(/^\d+-/, ""), tipo: UPLOAD_TYPES[ext] ?? "arquivo", tamanho: (f.metadata as { size?: number } | null)?.size ?? null, url: sb.storage.from("midia").getPublicUrl(`${folder}/${f.name}`).data.publicUrl };
  });
}

export async function handleMedia(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(503, { error: "Servidor indisponível." });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const t = readUploadToken(env, String(b.token ?? ""));
  if (!t) return json(400, { error: "Link de envio inválido. Peça um novo link ao agente." });
  if (b.acao === "status") return json(200, { expirado: t.expired, expira_em: new Date(t.exp * 1000).toISOString(), arquivos: await listUploads(sb, t.ws, t.id) });
  if (t.expired) return json(410, { error: "Este link expirou. Peça um novo link ao agente." });
  if (b.acao === "assinar") {
    const nome = String(b.nome ?? "arquivo").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "arquivo";
    const ext = nome.split(".").pop()?.toLowerCase() ?? "";
    if (!UPLOAD_TYPES[ext]) return json(400, { error: "Formato não aceito. Use JPG, PNG, WebP, GIF, MP4, MOV, M4V, WebM, AVI ou PDF." });
    const existing = await listUploads(sb, t.ws, t.id);
    if (existing.length >= 20) return json(400, { error: "Até 20 arquivos por link." });
    const path = `${t.ws}/envios/${t.id}/${Date.now()}-${nome}`;
    const { data, error } = await sb.storage.from("midia").createSignedUploadUrl(path);
    if (error || !data) return json(500, { error: error?.message ?? "Não foi possível preparar o envio." });
    return json(200, { path, token: data.token, url: data.signedUrl, tipo: UPLOAD_TYPES[ext] });
  }
  return json(400, { error: "Ação desconhecida." });
}
