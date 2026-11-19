/**
 * Backend do painel de super admin. Roda só no servidor (Vercel Function em produção,
 * middleware do Vite em desenvolvimento). Usa a service_role, que NUNCA vai para o navegador.
 *
 * Variáveis de ambiente do servidor (sem prefixo VITE_, então não entram no bundle):
 *   SUPABASE_URL (ou VITE_SUPABASE_URL)  ·  SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { BillingError, setPlanManually } from "./billing.js";

type Env = Record<string, string | undefined>;
type Body = { action?: string; [k: string]: unknown };

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const fail = (status: number, error: string) => json(status, { error });

const BAN_FOREVER = "876000h"; // ~100 anos
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Senha temporária legível: 4 grupos, sem caracteres ambíguos. */
function tempPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

function toPortuguese(message: string) {
  if (/already been registered|already registered|already exists/i.test(message)) return "Já existe uma conta com este e-mail.";
  if (/password.*(at least|short|weak)/i.test(message)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/rate limit/i.test(message)) return "Limite de envio de e-mails atingido. Tente de novo em alguns minutos ou defina a senha manualmente.";
  return message;
}

export async function handleAdmin(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return fail(405, "Use POST.");
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return fail(503, "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada. Adicione a variável no painel da Vercel (ou no .env.local para desenvolvimento).");

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "Sessão ausente. Entre de novo.");

  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who, error: whoErr } = await sb.auth.getUser(token);
  if (whoErr || !who.user) return fail(401, "Sessão inválida ou expirada. Entre de novo.");
  const actor = who.user;
  const { data: adminRow } = await sb.from("platform_admins").select("user_id").eq("user_id", actor.id).maybeSingle();
  if (!adminRow) return fail(403, "Acesso restrito ao super admin.");

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return fail(400, "Corpo da requisição inválido."); }

  const audit = (action: string, target: { id?: string; email?: string } | null, detail: Record<string, unknown> = {}) =>
    sb.from("admin_audit").insert({ actor_id: actor.id, actor_email: actor.email, action, target_id: target?.id ?? null, target_email: target?.email ?? null, detail });

  try {
    switch (body.action) {
      case "list": return json(200, await listUsers(sb));
      case "set_plan": {
        const wsId = String(body.workspaceId ?? "");
        const { data: w } = await sb.from("workspaces").select("id, name").eq("id", wsId).maybeSingle();
        if (!w) return fail(404, "Espaço não encontrado.");
        try { await setPlanManually(sb, wsId, { plan: String(body.plan ?? ""), status: String(body.status ?? ""), until: body.until ? String(body.until) : null, note: body.note ? String(body.note) : null }); }
        catch (e) { if (e instanceof BillingError) return fail(400, e.message); throw e; }
        await audit("alterou_plano", null, { espaco: w.name, plano: body.plan, status: body.status, ate: body.until ?? null });
        return json(200, { ok: true });
      }
      case "audit": {
        const { data, error } = await sb.from("admin_audit").select("id, actor_email, action, target_email, detail, created_at").order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        return json(200, { entries: data });
      }
      case "create": {
        const email = str(body.email).toLowerCase();
        const fullName = str(body.fullName, 120);
        const workspaceName = str(body.workspaceName, 120);
        const mode = body.mode === "invite" ? "invite" : "password";
        if (!isEmail(email)) return fail(400, "E-mail inválido.");
        if (fullName.length < 2) return fail(400, "Informe o nome.");
        let user: User;
        let password: string | undefined;
        if (mode === "invite") {
          const redirectTo = str(body.redirectTo, 300) || undefined;
          const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo });
          if (error) return fail(400, toPortuguese(error.message));
          user = data.user;
        } else {
          password = str(body.password, 72) || tempPassword();
          if (password.length < 8) return fail(400, "A senha precisa ter pelo menos 8 caracteres.");
          const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
          if (error) return fail(400, toPortuguese(error.message));
          user = data.user;
        }
        const targetWs = str(body.workspaceId, 64);
        let espaco = workspaceName || "Meu espaço";
        if (targetWs) {
          // Equipe de um cliente existente: entra no espaço escolhido e o espaço pessoal criado pelo gatilho é removido.
          if (!isUuid(targetWs)) return fail(400, "Espaço de trabalho inválido.");
          const { data: wsRow } = await sb.from("workspaces").select("id, name").eq("id", targetWs).maybeSingle();
          if (!wsRow) return fail(404, "Espaço de trabalho não encontrado.");
          const role = ["owner", "admin", "member"].includes(String(body.role)) ? String(body.role) : "member";
          const { error: mErr } = await sb.from("workspace_members").upsert({ workspace_id: targetWs, user_id: user.id, role }, { onConflict: "workspace_id,user_id" });
          if (mErr) return fail(500, mErr.message);
          await sb.from("workspaces").delete().eq("created_by", user.id).neq("id", targetWs);
          espaco = `${wsRow.name as string} (${role})`;
        } else if (workspaceName) {
          // O gatilho handle_new_user já criou "Meu espaço"; renomeia para o nome do cliente.
          await sb.from("workspaces").update({ name: workspaceName }).eq("created_by", user.id);
        }
        if (body.makeAdmin === true) await sb.from("platform_admins").upsert({ user_id: user.id });
        await audit("criou_usuario", { id: user.id, email }, { modo: mode, espaco, super_admin: body.makeAdmin === true });
        return json(200, { id: user.id, email, password, invited: mode === "invite" });
      }
      default: break;
    }

    // Ações sobre um usuário existente
    const id = str(body.userId, 64);
    if (!isUuid(id)) return fail(400, "Usuário inválido.");
    const { data: target, error: tErr } = await sb.auth.admin.getUserById(id);
    if (tErr || !target.user) return fail(404, "Usuário não encontrado.");
    const tgt = { id, email: target.user.email ?? undefined };
    const self = id === actor.id;

    switch (body.action) {
      case "ban": {
        if (self) return fail(400, "Você não pode bloquear a própria conta.");
        const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: BAN_FOREVER });
        if (error) throw error;
        await audit("bloqueou_usuario", tgt);
        return json(200, { ok: true });
      }
      case "unban": {
        const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: "none" });
        if (error) throw error;
        await audit("desbloqueou_usuario", tgt);
        return json(200, { ok: true });
      }
      case "reset_password": {
        const password = str(body.password, 72) || tempPassword();
        if (password.length < 8) return fail(400, "A senha precisa ter pelo menos 8 caracteres.");
        const { error } = await sb.auth.admin.updateUserById(id, { password });
        if (error) return fail(400, toPortuguese(error.message));
        await audit("redefiniu_senha", tgt);
        return json(200, { password });
      }
      case "rename": {
        const fullName = str(body.fullName, 120);
        if (fullName.length < 2) return fail(400, "Informe o nome.");
        const { error } = await sb.from("profiles").update({ full_name: fullName }).eq("id", id);
        if (error) throw error;
        await sb.auth.admin.updateUserById(id, { user_metadata: { ...target.user.user_metadata, full_name: fullName } });
        await audit("renomeou_usuario", tgt, { nome: fullName });
        return json(200, { ok: true });
      }
      case "set_admin": {
        const on = body.value === true;
        if (self && !on) return fail(400, "Você não pode remover o próprio acesso de super admin.");
        const { error } = on
          ? await sb.from("platform_admins").upsert({ user_id: id })
          : await sb.from("platform_admins").delete().eq("user_id", id);
        if (error) throw error;
        await audit(on ? "concedeu_super_admin" : "removeu_super_admin", tgt);
        return json(200, { ok: true });
      }
      case "add_member": {
        const wsId = str(body.workspaceId, 64);
        const role = ["owner", "admin", "member"].includes(String(body.role)) ? String(body.role) : "member";
        if (!isUuid(wsId)) return fail(400, "Espaço de trabalho inválido.");
        const { data: wsRow } = await sb.from("workspaces").select("name").eq("id", wsId).maybeSingle();
        if (!wsRow) return fail(404, "Espaço de trabalho não encontrado.");
        const { error } = await sb.from("workspace_members").upsert({ workspace_id: wsId, user_id: id, role }, { onConflict: "workspace_id,user_id" });
        if (error) throw error;
        await audit("adicionou_ao_espaco", tgt, { espaco: wsRow.name, papel: role });
        return json(200, { ok: true });
      }
      case "remove_member": {
        const wsId = str(body.workspaceId, 64);
        if (!isUuid(wsId)) return fail(400, "Espaço de trabalho inválido.");
        const { data: members } = await sb.from("workspace_members").select("user_id, role").eq("workspace_id", wsId);
        const me = members?.find((m) => m.user_id === id);
        if (!me) return fail(404, "A pessoa não faz parte deste espaço.");
        if (me.role === "owner" && (members ?? []).filter((m) => m.role === "owner").length <= 1) return fail(400, "Este é o único proprietário do espaço. Defina outro proprietário antes de remover.");
        const { error } = await sb.from("workspace_members").delete().eq("workspace_id", wsId).eq("user_id", id);
        if (error) throw error;
        const { data: wsRow } = await sb.from("workspaces").select("name").eq("id", wsId).maybeSingle();
        await audit("removeu_do_espaco", tgt, { espaco: wsRow?.name ?? wsId });
        return json(200, { ok: true });
      }
      case "delete": {
        if (self) return fail(400, "Você não pode excluir a própria conta.");
        // Espaços onde a pessoa é a única integrante saem junto (com campanhas, leads etc.).
        const { data: owned } = await sb.from("workspace_members").select("workspace_id").eq("user_id", id).eq("role", "owner");
        const orphan: string[] = [];
        for (const w of owned ?? []) {
          const { count } = await sb.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", w.workspace_id);
          if ((count ?? 0) <= 1) orphan.push(w.workspace_id);
        }
        const { error } = await sb.auth.admin.deleteUser(id);
        if (error) throw error;
        if (orphan.length) await sb.from("workspaces").delete().in("id", orphan);
        await audit("excluiu_usuario", tgt, { espacos_excluidos: orphan.length });
        return json(200, { ok: true, deletedWorkspaces: orphan.length });
      }
      default:
        return fail(400, "Ação desconhecida.");
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
    return fail(500, toPortuguese(message));
  }
}

async function listUsers(sb: SupabaseClient) {
  const users: User[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  const ids = users.map((u) => u.id);
  const [{ data: profiles }, { data: members }, { data: admins }] = await Promise.all([
    sb.from("profiles").select("id, full_name").in("id", ids),
    sb.from("workspace_members").select("user_id, role, workspaces(id, name)").in("user_id", ids),
    sb.from("platform_admins").select("user_id"),
  ]);
  const nameOf = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? ""]));
  const adminSet = new Set((admins ?? []).map((a) => a.user_id as string));
  const wsOf = new Map<string, { id: string; name: string; role: string }[]>();
  for (const m of members ?? []) {
    const w = m.workspaces as unknown as { id: string; name: string } | null;
    if (!w) continue;
    const list = wsOf.get(m.user_id as string) ?? [];
    list.push({ id: w.id, name: w.name, role: m.role as string });
    wsOf.set(m.user_id as string, list);
  }
  const now = Date.now();
  const full = await sb.from("workspaces").select("id, name, created_at, plan, plan_status, trial_ends_at, current_period_end, stripe_subscription_id, billing_note").order("name");
  const allWs = (full.error ? (await sb.from("workspaces").select("id, name, created_at").order("name")).data : full.data) as Record<string, unknown>[] | null;
  const memberCount = new Map<string, number>();
  for (const m of members ?? []) { const w = m.workspaces as unknown as { id: string } | null; if (w) memberCount.set(w.id, (memberCount.get(w.id) ?? 0) + 1); }
  return {
    workspaces: (allWs ?? []).map((w) => ({ id: w.id as string, name: w.name as string, members: memberCount.get(w.id as string) ?? 0, createdAt: (w.created_at as string | null) ?? null, plan: (w.plan as string | undefined) ?? null, planStatus: (w.plan_status as string | undefined) ?? null, trialEndsAt: (w.trial_ends_at as string | null | undefined) ?? null, periodEnd: (w.current_period_end as string | null | undefined) ?? null, stripe: !!w.stripe_subscription_id, note: (w.billing_note as string | null | undefined) ?? null })),
    users: users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      name: nameOf.get(u.id) || (u.user_metadata?.full_name as string | undefined) || "",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      confirmed: !!(u.email_confirmed_at || u.confirmed_at),
      banned: !!(u as User & { banned_until?: string | null }).banned_until && new Date((u as User & { banned_until?: string }).banned_until!).getTime() > now,
      isPlatformAdmin: adminSet.has(u.id),
      workspaces: wsOf.get(u.id) ?? [],
    })),
  };
}
