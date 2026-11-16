/**
 * Ações do app que precisam do servidor, autenticadas pela sessão do usuário (não por chave de API).
 * Hoje: enviar um evento de teste para um webhook do espaço.
 */
import { createClient } from "@supabase/supabase-js";
import { dispatchEvent } from "./webhooks.js";

type Env = Record<string, string | undefined>;
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function handleApp(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(503, { error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada." });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await sb.auth.getUser(token);
  if (!who?.user) return json(401, { error: "Sessão inválida. Entre de novo." });
  const body = (await req.json().catch(() => ({}))) as { action?: string; webhookId?: string };

  if (body.action === "test_webhook") {
    const id = String(body.webhookId ?? "");
    const { data: hook } = await sb.from("webhooks").select("id, workspace_id, name").eq("id", id).maybeSingle();
    if (!hook) return json(404, { error: "Webhook não encontrado." });
    const { data: member } = await sb.from("workspace_members").select("role").eq("workspace_id", hook.workspace_id).eq("user_id", who.user.id).maybeSingle();
    if (!member || !["owner", "admin"].includes(member.role as string)) return json(403, { error: "Só administradores do espaço podem testar webhooks." });
    const [r] = await dispatchEvent(sb, hook.workspace_id as string, "webhook.teste", { mensagem: "Evento de teste enviado pelo NinePro.", webhook: hook.name }, id);
    return json(200, r ?? { status: 0, error: "Nada enviado." });
  }
  return json(400, { error: "Ação desconhecida." });
}
