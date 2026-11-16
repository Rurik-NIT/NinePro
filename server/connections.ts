/**
 * Conexões com plataformas de anúncio: OAuth, sincronização e escrita de volta (pausar/ativar).
 *  - POST /api/connect  (sessão do usuário): start | disconnect | sync | set_status | toggle_account
 *  - GET  /api/connect  (retorno do OAuth da Meta: ?code&state)
 *  - GET  /api/sync     (Vercel Cron, Authorization: Bearer CRON_SECRET): sincroniza todos os espaços
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken, signState, verifyState } from "./crypto.js";
import {
  MetaError, mapInsight, mapObjective, mapStatus, metaAccounts, metaAdSets, metaAds, metaAuthorizeUrl, metaCampaigns,
  metaConfigured, metaExchangeCode, metaInsights, metaInspectToken, metaSetStatus, ninePROApp, META_DEFAULT_SCOPES, type MetaApp,
} from "./platforms/meta.js";

type AuthMode = "app_ninepro" | "app_proprio" | "token";
const FRIENDLY = "Não foi possível conectar agora. Tente de novo em alguns minutos.";

async function saveConnection(sb: SupabaseClient, env: Env, c: { ws: string; uid: string; mode: AuthMode; appId?: string | null; token: string; expiresAt: string | null; user: { id: string; name: string }; scopes: string[] }) {
  const { data: conn, error } = await sb.from("platform_connections").upsert({
    workspace_id: c.ws, platform: "meta", external_user_id: c.user.id, external_user_name: c.user.name, scopes: c.scopes, auth_mode: c.mode, app_id: c.appId ?? null,
    status: "ativa", last_error: null, token_expires_at: c.expiresAt, connected_by: c.uid, updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,platform" }).select("id").single();
  if (error || !conn) throw new Error(error?.message ?? "Não foi possível salvar a conexão.");
  const { error: tErr } = await sb.from("platform_tokens").upsert({ connection_id: conn.id, access_token_enc: await encryptToken(env, c.token), updated_at: new Date().toISOString() });
  if (tErr) throw new Error(tErr.message);
  return conn.id as string;
}

async function ownApp(sb: SupabaseClient, env: Env, ws: string): Promise<MetaApp> {
  const { data } = await sb.from("platform_app_credentials").select("app_id, app_secret_enc").eq("workspace_id", ws).eq("platform", "meta").maybeSingle();
  if (!data) throw new Error("As credenciais do seu app da Meta não foram encontradas. Informe de novo.");
  return { appId: data.app_id as string, appSecret: await decryptToken(env, data.app_secret_enc as string) };
}

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
const DAY = 86_400_000;
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to, "cache-control": "no-store" } });
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function serviceClient(env: Env): SupabaseClient | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

const originOf = (req: Request, env: Env) => { const u = new URL(req.url); return env.PUBLIC_URL || `${u.protocol}//${u.host}`; };
const redirectUri = (req: Request, env: Env) => `${originOf(req, env)}/api/connect`;

async function chunked<T>(rows: T[], size: number, fn: (part: T[]) => PromiseLike<{ error: { message: string } | null }>) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await fn(rows.slice(i, i + size));
    if (error) throw new Error(error.message);
  }
}

async function tokenFor(sb: SupabaseClient, env: Env, connectionId: string) {
  const { data } = await sb.from("platform_tokens").select("access_token_enc").eq("connection_id", connectionId).maybeSingle();
  if (!data) throw new MetaError("Conexão sem token. Conecte de novo.", undefined, true);
  return decryptToken(env, data.access_token_enc as string);
}

/* ------------------------------------------------------------------ sincronização (Meta) */
export async function syncMetaConnection(sb: SupabaseClient, env: Env, conn: { id: string; workspace_id: string }, trigger: "manual" | "agendada" | "conexao", days = 30) {
  const ws = conn.workspace_id;
  const { data: run } = await sb.from("sync_runs").insert({ workspace_id: ws, platform: "meta", trigger }).select("id").single();
  const detail: Json = { contas: 0, campanhas: 0, conjuntos: 0, anuncios: 0, linhas_de_metricas: 0, dias: days };
  try {
    const token = await tokenFor(sb, env, conn.id);
    const accounts = await metaAccounts(env, token);
    if (accounts.length) {
      await chunked(accounts.map((a) => ({ workspace_id: ws, platform: "meta", external_id: a.id, name: a.name, currency: a.currency, timezone: a.timezone_name, status: a.account_status === 1 ? "connected" : "error" })), 200,
        (part) => sb.from("ad_accounts").upsert(part, { onConflict: "workspace_id,platform,external_id" }));
    }
    const { data: accRows } = await sb.from("ad_accounts").select("id, external_id, sync_enabled").eq("workspace_id", ws).eq("platform", "meta");
    const since = isoDay(new Date(Date.now() - (days - 1) * DAY));
    const until = isoDay(new Date());
    for (const acc of accRows ?? []) {
      if (!acc.sync_enabled || !acc.external_id) continue;
      const act = acc.external_id as string;
      detail.contas = (detail.contas as number) + 1;

      const campaigns = await metaCampaigns(env, token, act);
      await chunked(campaigns.map((c) => ({
        workspace_id: ws, ad_account_id: acc.id, external_id: c.id, name: c.name, objective: mapObjective(c.objective), status: mapStatus(c.effective_status),
        budget: c.daily_budget ? Number(c.daily_budget) / 100 : c.lifetime_budget ? Number(c.lifetime_budget) / 100 : 0,
        budget_type: c.lifetime_budget && !c.daily_budget ? "total" : "diario", started_at: c.start_time ? c.start_time.slice(0, 10) : null, updated_at: new Date().toISOString(),
      })), 500, (part) => sb.from("campaigns").upsert(part, { onConflict: "workspace_id,external_id" }));
      detail.campanhas = (detail.campanhas as number) + campaigns.length;

      const { data: campMap } = await sb.from("campaigns").select("id, external_id").eq("workspace_id", ws).eq("ad_account_id", acc.id);
      const campId = new Map((campMap ?? []).map((c) => [c.external_id as string, c.id as string]));
      const adsets = (await metaAdSets(env, token, act)).filter((s) => campId.has(s.campaign_id));
      await chunked(adsets.map((s) => ({ workspace_id: ws, campaign_id: campId.get(s.campaign_id)!, external_id: s.id, name: s.name, status: mapStatus(s.effective_status), audience: s.optimization_goal ?? null })), 500,
        (part) => sb.from("ad_sets").upsert(part, { onConflict: "workspace_id,external_id" }));
      detail.conjuntos = (detail.conjuntos as number) + adsets.length;

      const { data: setMap } = await sb.from("ad_sets").select("id, external_id").eq("workspace_id", ws).in("campaign_id", [...campId.values()].length ? [...campId.values()] : ["00000000-0000-0000-0000-000000000000"]);
      const setId = new Map((setMap ?? []).map((s) => [s.external_id as string, s.id as string]));
      const ads = (await metaAds(env, token, act)).filter((a) => setId.has(a.adset_id));
      await chunked(ads.map((a) => ({ workspace_id: ws, ad_set_id: setId.get(a.adset_id)!, external_id: a.id, name: a.name, status: mapStatus(a.effective_status), format: a.creative?.object_type === "VIDEO" ? "Vídeo" : "Imagem", thumbnail_url: a.creative?.thumbnail_url ?? null })), 500,
        (part) => sb.from("ads").upsert(part, { onConflict: "workspace_id,external_id" }));
      detail.anuncios = (detail.anuncios as number) + ads.length;

      const { data: adMap } = await sb.from("ads").select("id, external_id").eq("workspace_id", ws).in("ad_set_id", [...setId.values()].length ? [...setId.values()] : ["00000000-0000-0000-0000-000000000000"]);
      const adId = new Map((adMap ?? []).map((a) => [a.external_id as string, a.id as string]));
      const insights = (await metaInsights(env, token, act, since, until)).filter((i) => adId.has(i.ad_id));
      await chunked(insights.map((i) => ({ workspace_id: ws, ad_id: adId.get(i.ad_id)!, date: i.date_start, ...mapInsight(i) })), 500,
        (part) => sb.from("ad_metrics_daily").upsert(part, { onConflict: "ad_id,date" }));
      detail.linhas_de_metricas = (detail.linhas_de_metricas as number) + insights.length;
      await sb.from("ad_accounts").update({ last_synced_at: new Date().toISOString() }).eq("id", acc.id);
    }
    await sb.from("platform_connections").update({ status: "ativa", last_error: null, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", conn.id);
    if (run) await sb.from("sync_runs").update({ status: "ok", detail, finished_at: new Date().toISOString() }).eq("id", run.id);
    return { ok: true, detail };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const expired = e instanceof MetaError && e.expired;
    await sb.from("platform_connections").update({ status: expired ? "expirada" : "erro", last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", conn.id);
    if (run) await sb.from("sync_runs").update({ status: "erro", detail, error: message.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", run.id);
    return { ok: false, error: message, detail };
  }
}

/* ------------------------------------------------------------------ escrita de volta */
/** Pausa/ativa na plataforma (quando a campanha veio de uma conta integrada) e no banco. */
export async function applyCampaignStatus(sb: SupabaseClient, env: Env, ws: string, ids: string[], status: "active" | "paused") {
  const { data: camps } = await sb.from("campaigns").select("id, external_id, ad_accounts(platform)").eq("workspace_id", ws).in("id", ids);
  const results: { id: string; plataforma: boolean; erro?: string }[] = [];
  const metaConn = await sb.from("platform_connections").select("id").eq("workspace_id", ws).eq("platform", "meta").maybeSingle();
  let token: string | null = null;
  for (const c of camps ?? []) {
    const platform = (c.ad_accounts as unknown as { platform: string } | null)?.platform;
    let pushed = false;
    try {
      if (c.external_id && platform === "meta" && metaConn.data) {
        token ??= await tokenFor(sb, env, metaConn.data.id as string);
        await metaSetStatus(env, token, c.external_id as string, status === "active" ? "ACTIVE" : "PAUSED");
        pushed = true;
      }
      const { error } = await sb.from("campaigns").update({ status, updated_at: new Date().toISOString() }).eq("id", c.id);
      if (error) throw new Error(error.message);
      results.push({ id: c.id as string, plataforma: pushed });
    } catch (e) {
      results.push({ id: c.id as string, plataforma: false, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ handlers */
async function sessionUser(sb: SupabaseClient, req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await sb.auth.getUser(token);
  return data.user ?? null;
}
async function roleIn(sb: SupabaseClient, ws: string, userId: string) {
  const { data } = await sb.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", userId).maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

export async function handleConnect(req: Request, env: Env): Promise<Response> {
  const sb = serviceClient(env);
  const origin = originOf(req, env);

  // Retorno do OAuth da Meta
  if (req.method === "GET") {
    const url = new URL(req.url);
    const back = (q: string) => redirect(`${origin}/conexoes?${q}`);
    if (url.searchParams.get("error")) return back(`meta=cancelado`);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!sb || !code || !state) return back("meta=erro&motivo=" + encodeURIComponent("Retorno incompleto da Meta."));
    try {
      const st = await verifyState<{ ws: string; uid: string; p: string; mode?: AuthMode }>(env, state);
      const role = await roleIn(sb, st.ws, st.uid);
      if (!role || !["owner", "admin"].includes(role)) throw new Error("Só administradores do espaço podem conectar contas.");
      const mode: AuthMode = st.mode === "app_proprio" ? "app_proprio" : "app_ninepro";
      const app = mode === "app_proprio" ? await ownApp(sb, env, st.ws) : ninePROApp(env);
      const ex = await metaExchangeCode(env, app, code, redirectUri(req, env));
      await saveConnection(sb, env, { ws: st.ws, uid: st.uid, mode, appId: mode === "app_proprio" ? app.appId : null, token: ex.token, expiresAt: ex.expiresAt, user: ex.user, scopes: ex.scopes });
      return back("meta=conectado");
    } catch (e) {
      return back("meta=erro&motivo=" + encodeURIComponent(e instanceof Error ? e.message : String(e)));
    }
  }

  if (req.method !== "POST") return json(405, { error: "Método não suportado." });
  if (!sb) return json(503, { error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada." });
  const user = await sessionUser(sb, req);
  if (!user) return json(401, { error: "Sessão inválida. Entre de novo." });
  const body = (await req.json().catch(() => ({}))) as Json;
  const ws = String(body.workspaceId ?? "");
  const role = await roleIn(sb, ws, user.id);
  if (!role) return json(403, { error: "Você não faz parte deste espaço." });
  const isAdmin = ["owner", "admin"].includes(role);

  switch (body.action) {
    case "options": {
      // O que a tela pode oferecer, sem expor detalhes do servidor
      const { data: own } = await sb.from("platform_app_credentials").select("app_id").eq("workspace_id", ws).eq("platform", "meta").maybeSingle();
      return json(200, { ninepro: metaConfigured(env), redirectUri: redirectUri(req, env), scopes: (env.META_SCOPES || META_DEFAULT_SCOPES).split(","), ownAppId: (own?.app_id as string | undefined) ?? null });
    }
    case "start": {
      if (!isAdmin) return json(403, { error: "Só administradores do espaço podem conectar contas." });
      if (body.platform !== "meta") return json(400, { error: "Plataforma ainda não suportada." });
      if (!env.TOKEN_ENCRYPTION_KEY) { console.error("TOKEN_ENCRYPTION_KEY ausente"); return json(503, { error: FRIENDLY }); }
      const mode: AuthMode = body.mode === "app_proprio" ? "app_proprio" : "app_ninepro";
      let app: MetaApp;
      if (mode === "app_proprio") {
        const appId = String(body.appId ?? "").trim();
        const appSecret = String(body.appSecret ?? "").trim();
        if (!/^\d{5,20}$/.test(appId)) return json(400, { error: "O ID do app tem só números (veja em Configurações do app › Básico)." });
        if (appSecret) {
          if (!/^[0-9a-f]{32}$/i.test(appSecret)) return json(400, { error: "A chave secreta do app tem 32 caracteres (letras de a a f e números)." });
          await sb.from("platform_app_credentials").upsert({ workspace_id: ws, platform: "meta", app_id: appId, app_secret_enc: await encryptToken(env, appSecret), updated_at: new Date().toISOString() });
        }
        try { app = await ownApp(sb, env, ws); } catch (e) { return json(400, { error: e instanceof Error ? e.message : String(e) }); }
        if (app.appId !== appId) return json(400, { error: "Informe a chave secreta do app para trocar o ID do app." });
      } else {
        if (!metaConfigured(env)) return json(409, { error: "Use o app da sua empresa ou um token de acesso para conectar." });
        app = ninePROApp(env);
      }
      const state = await signState(env, { ws, uid: user.id, p: "meta", mode });
      return json(200, { url: metaAuthorizeUrl(env, app, redirectUri(req, env), state) });
    }
    case "connect_token": {
      if (!isAdmin) return json(403, { error: "Só administradores do espaço podem conectar contas." });
      if (!env.TOKEN_ENCRYPTION_KEY) { console.error("TOKEN_ENCRYPTION_KEY ausente"); return json(503, { error: FRIENDLY }); }
      const token = String(body.token ?? "").trim();
      if (token.length < 50 || /\s/.test(token)) return json(400, { error: "Cole o token completo, sem espaços." });
      try {
        const info = await metaInspectToken(env, token);
        const missing = ["ads_read"].filter((p) => info.scopes.length && !info.scopes.includes(p));
        if (missing.length) return json(400, { error: `O token não tem a permissão ${missing.join(", ")}. Gere de novo marcando ads_read e ads_management.` });
        await saveConnection(sb, env, { ws, uid: user.id, mode: "token", token, expiresAt: null, user: info.user, scopes: info.scopes });
        return json(200, { ok: true, user: info.user.name });
      } catch (e) {
        return json(400, { error: e instanceof MetaError ? (e.expired ? "Este token é inválido ou expirou." : e.message) : FRIENDLY });
      }
    }
    case "disconnect": {
      if (!isAdmin) return json(403, { error: "Só administradores do espaço podem desconectar." });
      await sb.from("platform_connections").delete().eq("workspace_id", ws).eq("platform", String(body.platform ?? "meta"));
      if (body.forgetApp === true) await sb.from("platform_app_credentials").delete().eq("workspace_id", ws).eq("platform", String(body.platform ?? "meta"));
      return json(200, { ok: true });
    }
    case "sync": {
      const { data: conn } = await sb.from("platform_connections").select("id, workspace_id").eq("workspace_id", ws).eq("platform", "meta").maybeSingle();
      if (!conn) return json(404, { error: "Nenhuma conta da Meta conectada." });
      const r = await syncMetaConnection(sb, env, conn as { id: string; workspace_id: string }, "manual", Math.min(90, Math.max(1, Number(body.days ?? 30))));
      return json(r.ok ? 200 : 502, r);
    }
    case "toggle_account": {
      if (!isAdmin) return json(403, { error: "Só administradores do espaço podem alterar." });
      const { error } = await sb.from("ad_accounts").update({ sync_enabled: body.enabled === true }).eq("workspace_id", ws).eq("id", String(body.accountId ?? ""));
      return json(error ? 400 : 200, error ? { error: error.message } : { ok: true });
    }
    case "set_status": {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 200);
      const status = body.status === "active" ? "active" : body.status === "paused" ? "paused" : null;
      if (!ids.length || !status) return json(400, { error: "Informe as campanhas e o status." });
      return json(200, { results: await applyCampaignStatus(sb, env, ws, ids, status) });
    }
    default:
      return json(400, { error: "Ação desconhecida." });
  }
}

/** Vercel Cron: sincroniza todas as conexões ativas da Meta (últimos 3 dias). */
export async function handleSync(req: Request, env: Env): Promise<Response> {
  if (!env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return json(401, { error: "Não autorizado." });
  const sb = serviceClient(env);
  if (!sb) return json(503, { error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada." });
  const { data: conns } = await sb.from("platform_connections").select("id, workspace_id").eq("platform", "meta").eq("status", "ativa");
  const results = [];
  for (const c of conns ?? []) results.push({ espaco: c.workspace_id, ...(await syncMetaConnection(sb, env, c as { id: string; workspace_id: string }, "agendada", 3)) });
  return json(200, { conexoes: results.length, results });
}
