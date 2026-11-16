/**
 * Callbacks exigidos pela Meta para apps aprovados:
 *  - POST /api/meta-exclusao       Data Deletion Request Callback (signed_request) → { url, confirmation_code }
 *  - GET  /api/meta-exclusao?codigo=…  status público do pedido (usado pela página /exclusao-de-dados)
 *  - POST /api/meta-desautorizar   Deauthorize Callback (signed_request)
 * Em ambos: remove a conexão da Meta e o token criptografado de todo espaço ligado àquele usuário do Facebook.
 */
import { serviceClient } from "./connections.js";
import { parseSignedRequest } from "./metaSignedRequest.js";

type Env = Record<string, string | undefined>;
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function signedFrom(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return String(((await req.json().catch(() => ({}))) as { signed_request?: string }).signed_request ?? "");
  return String(new URLSearchParams(await req.text()).get("signed_request") ?? "");
}

async function removeMetaUser(env: Env, externalUserId: string, kind: "exclusao" | "desautorizacao") {
  const sb = serviceClient(env);
  if (!sb) throw new Error("Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada.");
  const code = `NP-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  await sb.from("data_deletion_requests").insert({ code, platform: "meta", kind, external_user_id: externalUserId });
  // platform_tokens cai junto (on delete cascade)
  const { data: removed } = await sb.from("platform_connections").delete().eq("platform", "meta").eq("external_user_id", externalUserId).select("id");
  await sb.from("data_deletion_requests").update({ status: "concluido", connections_removed: removed?.length ?? 0, completed_at: new Date().toISOString() }).eq("code", code);
  return code;
}

export async function handleMetaDeletion(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const origin = env.PUBLIC_URL || `${url.protocol}//${url.host}`;
  if (req.method === "GET") {
    const code = (url.searchParams.get("codigo") ?? "").trim().toUpperCase();
    if (!/^NP-[0-9A-F]{12}$/.test(code)) return json(400, { error: "Código inválido." });
    const sb = serviceClient(env);
    if (!sb) return json(503, { error: "Serviço indisponível." });
    const { data } = await sb.from("data_deletion_requests").select("code, kind, status, requested_at, completed_at").eq("code", code).maybeSingle();
    return data ? json(200, data) : json(404, { error: "Pedido não encontrado." });
  }
  if (req.method !== "POST") return json(405, { error: "Método não suportado." });
  if (!env.META_APP_SECRET) return json(503, { error: "Integração com a Meta não configurada." });
  try {
    const p = await parseSignedRequest(await signedFrom(req), env.META_APP_SECRET);
    const code = await removeMetaUser(env, p.user_id, "exclusao");
    return json(200, { url: `${origin}/exclusao-de-dados?codigo=${code}`, confirmation_code: code });
  } catch (e) {
    return json(400, { error: e instanceof Error ? e.message : String(e) });
  }
}

export async function handleMetaDeauthorize(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "Método não suportado." });
  if (!env.META_APP_SECRET) return json(503, { error: "Integração com a Meta não configurada." });
  try {
    const p = await parseSignedRequest(await signedFrom(req), env.META_APP_SECRET);
    await removeMetaUser(env, p.user_id, "desautorizacao");
    return json(200, { ok: true });
  } catch (e) {
    return json(400, { error: e instanceof Error ? e.message : String(e) });
  }
}
