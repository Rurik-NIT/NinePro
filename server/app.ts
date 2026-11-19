/**
 * Ações do app que precisam do servidor, autenticadas pela sessão do usuário (não por chave de API).
 *  - test_webhook: envia um evento de teste para um webhook do espaço
 *  - team_list / team_invite / team_role / team_remove: equipe do espaço (administradores do cliente)
 *  - rule_preview / rule_run: testar uma regra automática nas campanhas reais (simulação ou execução agora)
 */
import { DestinationError, saveDestination } from "./destinations.js";
import { billingStatus, BillingError, createCheckout, createPortal, requireActive, requireLimit } from "./billing.js";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { runRule } from "./rules.js";
import { dispatchEvent } from "./webhooks.js";
import { approve, clientInfo, parseScopes } from "./oauth.js";

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const ROLES = ["owner", "admin", "member"];
const tempPassword = () => randomBytes(9).toString("base64url");
function toPortuguese(m: string) {
  if (/already been registered|already exists/i.test(m)) return "Já existe uma conta com este e-mail.";
  if (/rate limit/i.test(m)) return "Limite de e-mails atingido. Tente em alguns minutos ou use “Definir senha”.";
  if (/password/i.test(m)) return "Senha fraca. Use pelo menos 8 caracteres.";
  return m;
}
async function findUserByEmail(sb: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 20; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data?.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (!data || data.users.length < 200) return null;
  }
  return null;
}

export async function handleApp(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(503, { error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada." });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await sb.auth.getUser(token);
  if (!who?.user) return json(401, { error: "Sessão inválida. Entre de novo." });
  const me = who.user;
  const body = (await req.json().catch(() => ({}))) as Json;
  const roleIn = async (ws: string) => ((await sb.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", me.id).maybeSingle()).data?.role as string | undefined) ?? null;

  if (body.action === "test_webhook") {
    const id = String(body.webhookId ?? "");
    const { data: hook } = await sb.from("webhooks").select("id, workspace_id, name").eq("id", id).maybeSingle();
    if (!hook) return json(404, { error: "Webhook não encontrado." });
    const role = await roleIn(hook.workspace_id as string);
    if (!role || !["owner", "admin"].includes(role)) return json(403, { error: "Só administradores do espaço podem testar webhooks." });
    const [r] = await dispatchEvent(sb, hook.workspace_id as string, "webhook.teste", { mensagem: "Evento de teste enviado pelo NinePro.", webhook: hook.name }, id);
    return json(200, r ?? { status: 0, error: "Nada enviado." });
  }

  // Tela de autorização OAuth de agentes de IA (/oauth/autorizar)
  if (body.action === "oauth_client") return json(200, await clientInfo(sb, str(body.clientId, 80), str(body.redirectUri, 500)));
  if (body.action === "oauth_approve") {
    const wsId = str(body.workspaceId, 64);
    const r = wsId ? await roleIn(wsId) : null;
    if (!r) return json(403, { error: "Você não faz parte deste espaço." });
    const scopes = parseScopes(body.scopes);
    if (r === "member" && scopes.some((s) => s !== "leitura" && s !== "todos_espacos")) return json(403, { error: "Como membro, você só pode liberar a leitura. Peça a um administrador do espaço para liberar as demais permissões." });
    try {
      const code = await approve(sb, me.id, { clientId: str(body.clientId, 80), redirectUri: str(body.redirectUri, 500), codeChallenge: str(body.codeChallenge, 200), method: str(body.codeChallengeMethod, 10) || "S256", scopes, workspaceId: wsId, resource: str(body.resource, 300) });
      return json(200, { code });
    } catch (e) { return json(400, { error: e instanceof Error ? e.message : String(e) }); }
  }

  const ws = str(body.workspaceId, 64);
  const role = ws ? await roleIn(ws) : null;
  if (!role) return json(403, { error: "Você não faz parte deste espaço." });
  const isAdmin = role === "owner" || role === "admin";

  const origin = env.PUBLIC_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  const billing = async (fn: () => Promise<unknown>) => { try { return json(200, await fn()); } catch (e) { if (e instanceof BillingError) return json(e.code === "config" ? 400 : 402, { error: e.message, codigo: e.code }); throw e; } };
  switch (body.action) {
    /* ---------------------------------------------------------------- plano e assinatura */
    case "billing_status": return billing(() => billingStatus(sb, env, ws));
    case "billing_checkout": {
      if (!isAdmin) return json(403, { error: "Só o dono ou um admin do espaço pode assinar." });
      return billing(() => createCheckout(sb, env, ws, str(body.plan, 20), who.user.email, origin));
    }
    case "billing_portal": {
      if (!isAdmin) return json(403, { error: "Só o dono ou um admin do espaço pode gerenciar a assinatura." });
      return billing(() => createPortal(sb, env, ws, origin));
    }
    /* ---------------------------------------------------------------- destinos de conversão (Meta, TikTok) */
    case "dest_save": {
      if (!isAdmin) return json(403, { error: "Só administradores do espaço podem configurar destinos." });
      try { return json(200, await saveDestination(sb, env, ws, who.user.id, { platform: str(body.platform, 20), pixelId: body.pixelId === undefined ? undefined : str(body.pixelId, 64), token: body.token ? str(body.token, 2000) : undefined, testCode: body.testCode === undefined ? undefined : str(body.testCode, 40), enabled: body.enabled === undefined ? undefined : body.enabled === true })); }
      catch (e) { if (e instanceof DestinationError) return json(400, { error: e.message }); throw e; }
    }
    case "dest_toggle": {
      if (!isAdmin) return json(403, { error: "Só administradores do espaço podem configurar destinos." });
      await sb.from("conversion_destinations").update({ enabled: body.enabled === true, updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("platform", str(body.platform, 20));
      return json(200, { ok: true });
    }
    case "dest_delete": {
      if (!isAdmin) return json(403, { error: "Só administradores do espaço podem configurar destinos." });
      await sb.from("conversion_destinations").delete().eq("workspace_id", ws).eq("platform", str(body.platform, 20));
      return json(200, { ok: true });
    }
    /* ---------------------------------------------------------------- agentes conectados por OAuth */
    case "oauth_revoke": {
      const id = str(body.tokenId, 64);
      const { data: t } = await sb.from("oauth_tokens").select("id, user_id").eq("id", id).eq("workspace_id", ws).maybeSingle();
      if (!t) return json(404, { error: "Conexão não encontrada." });
      if (!isAdmin && t.user_id !== me.id) return json(403, { error: "Só administradores ou quem conectou podem desconectar." });
      await sb.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
      return json(200, { ok: true });
    }
    /* ---------------------------------------------------------------- equipe */
    case "team_list": {
      const { data: members } = await sb.from("workspace_members").select("user_id, role, created_at").eq("workspace_id", ws);
      const rows = await Promise.all((members ?? []).map(async (m) => {
        const { data } = await sb.auth.admin.getUserById(m.user_id as string);
        const u = data?.user;
        return { id: m.user_id, role: m.role, email: u?.email ?? "", name: (u?.user_metadata?.full_name as string) ?? "", lastSignInAt: u?.last_sign_in_at ?? null, confirmed: !!(u?.email_confirmed_at || u?.last_sign_in_at), joinedAt: m.created_at, you: m.user_id === me.id };
      }));
      return json(200, { members: rows, canManage: isAdmin });
    }
    case "team_invite": {
      if (!isAdmin) return json(403, { error: "Só administradores do espaço podem convidar pessoas." });
      try { await requireActive(sb, ws); await requireLimit(sb, ws, "members"); } catch (e) { if (e instanceof BillingError) return json(402, { error: e.message, codigo: e.code }); throw e; }
      const email = str(body.email).toLowerCase();
      const name = str(body.name, 120);
      const newRole = ROLES.includes(String(body.role)) ? String(body.role) : "member";
      if (newRole === "owner" && role !== "owner") return json(403, { error: "Só proprietários podem adicionar outro proprietário." });
      if (!isEmail(email)) return json(400, { error: "E-mail inválido." });
      let user = await findUserByEmail(sb, email);
      let password: string | undefined;
      let created = false;
      if (!user) {
        if (name.length < 2) return json(400, { error: "Informe o nome da pessoa." });
        if (body.mode === "convite") {
          const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { data: { full_name: name }, redirectTo: str(body.redirectTo, 300) || undefined });
          if (error) return json(400, { error: toPortuguese(error.message) });
          user = data.user;
        } else {
          password = tempPassword();
          const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
          if (error) return json(400, { error: toPortuguese(error.message) });
          user = data.user;
        }
        created = true;
      }
      const { data: already } = await sb.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
      if (already) return json(409, { error: "Esta pessoa já faz parte do espaço." });
      const { error: mErr } = await sb.from("workspace_members").insert({ workspace_id: ws, user_id: user.id, role: newRole });
      if (mErr) return json(500, { error: mErr.message });
      if (created) await sb.from("workspaces").delete().eq("created_by", user.id).neq("id", ws); // espaço pessoal criado pelo gatilho
      return json(200, { ok: true, id: user.id, email, password, existing: !created, invited: created && body.mode === "convite" });
    }
    case "team_role": {
      if (!isAdmin) return json(403, { error: "Só administradores do espaço podem alterar papéis." });
      const userId = str(body.userId, 64);
      const newRole = ROLES.includes(String(body.role)) ? String(body.role) : null;
      if (!newRole) return json(400, { error: "Papel inválido." });
      const { data: target } = await sb.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", userId).maybeSingle();
      if (!target) return json(404, { error: "Pessoa não encontrada no espaço." });
      if ((newRole === "owner" || target.role === "owner") && role !== "owner") return json(403, { error: "Só proprietários podem mudar o papel de proprietário." });
      if (target.role === "owner" && newRole !== "owner") {
        const { count } = await sb.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws).eq("role", "owner");
        if ((count ?? 0) <= 1) return json(400, { error: "O espaço precisa de pelo menos um proprietário." });
      }
      await sb.from("workspace_members").update({ role: newRole }).eq("workspace_id", ws).eq("user_id", userId);
      return json(200, { ok: true });
    }
    case "team_remove": {
      const userId = str(body.userId, 64);
      if (!isAdmin && userId !== me.id) return json(403, { error: "Só administradores do espaço podem remover pessoas." });
      const { data: target } = await sb.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", userId).maybeSingle();
      if (!target) return json(404, { error: "Pessoa não encontrada no espaço." });
      if (target.role === "owner") {
        if (role !== "owner") return json(403, { error: "Só proprietários podem remover um proprietário." });
        const { count } = await sb.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws).eq("role", "owner");
        if ((count ?? 0) <= 1) return json(400, { error: "O espaço precisa de pelo menos um proprietário." });
      }
      await sb.from("workspace_members").delete().eq("workspace_id", ws).eq("user_id", userId);
      return json(200, { ok: true });
    }

    /* ---------------------------------------------------------------- regras automáticas */
    case "rule_preview":
    case "rule_run": {
      if (body.action === "rule_run" && !isAdmin) return json(403, { error: "Só administradores do espaço podem executar regras." });
      const { data: rule } = await sb.from("automations").select("id, workspace_id, name, template_id, target, trigger, conditions, actions, params, logic, last_run_at").eq("workspace_id", ws).eq("id", str(body.automationId, 64)).maybeSingle();
      if (!rule) return json(404, { error: "Regra não encontrada." });
      const { data: st } = await sb.from("automation_settings").select("max_daily_increase_pct").eq("workspace_id", ws).maybeSingle();
      const r = await runRule(sb, env, rule as never, { dryRun: body.action === "rule_preview", force: true, capPct: (st?.max_daily_increase_pct as number | undefined) ?? 30 });
      return json(200, r);
    }
  }
  return json(400, { error: "Ação desconhecida." });
}
