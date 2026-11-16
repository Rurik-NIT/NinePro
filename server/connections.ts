/**
 * Conexões com plataformas de anúncio (Meta, Google, TikTok, LinkedIn): OAuth, token, sincronização
 * e escrita de volta (pausar/ativar). Cada plataforma é um Provider em ./platforms.
 *  - POST /api/connect  (sessão do usuário): options | start | connect_token | sync | set_status | toggle_account | disconnect
 *  - GET  /api/connect  (retorno do OAuth: ?code&state — o state diz a plataforma)
 *  - GET  /api/sync     (Vercel Cron, Authorization: Bearer CRON_SECRET)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken, signState, verifyState } from "./crypto.js";
import { isPlatform, PlatformError, PROVIDERS, type AppCreds, type AuthMode, type ExchangeResult, type NAccount, type PlatformId, type StoredAuth } from "./platforms/index.js";

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
const DAY = 86_400_000;
const FRIENDLY = "Não foi possível conectar agora. Tente de novo em alguns minutos.";
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to, "cache-control": "no-store" } });
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

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

/* ------------------------------------------------------------------ segredos */
async function loadAuth(sb: SupabaseClient, env: Env, connectionId: string): Promise<StoredAuth> {
  const { data } = await sb.from("platform_tokens").select("access_token_enc").eq("connection_id", connectionId).maybeSingle();
  if (!data) throw new PlatformError("Conexão sem credenciais. Conecte de novo.", true);
  const raw = await decryptToken(env, data.access_token_enc as string);
  try { const v = JSON.parse(raw) as StoredAuth; if (v && typeof v === "object") return v; } catch { /* formato antigo: só o token */ }
  return { accessToken: raw };
}

async function saveConnection(sb: SupabaseClient, env: Env, p: PlatformId, c: { ws: string; uid: string; mode: AuthMode; appId?: string | null } & ExchangeResult) {
  const { data: conn, error } = await sb.from("platform_connections").upsert({
    workspace_id: c.ws, platform: p, external_user_id: c.user.id, external_user_name: c.user.name, scopes: c.scopes, auth_mode: c.mode, app_id: c.appId ?? null,
    status: "ativa", last_error: null, token_expires_at: c.expiresAt, connected_by: c.uid, updated_at: now(),
  }, { onConflict: "workspace_id,platform" }).select("id").single();
  if (error || !conn) throw new Error(error?.message ?? "Não foi possível salvar a conexão.");
  const { error: tErr } = await sb.from("platform_tokens").upsert({ connection_id: conn.id, access_token_enc: await encryptToken(env, JSON.stringify(c.auth)), updated_at: now() });
  if (tErr) throw new Error(tErr.message);
  return conn.id as string;
}

async function loadOwnApp(sb: SupabaseClient, env: Env, ws: string, p: PlatformId): Promise<AppCreds | null> {
  const { data } = await sb.from("platform_app_credentials").select("app_id, app_secret_enc").eq("workspace_id", ws).eq("platform", p).maybeSingle();
  if (!data) return null;
  const raw = await decryptToken(env, data.app_secret_enc as string);
  try { const v = JSON.parse(raw) as { appSecret: string; extra?: Record<string, string> }; if (v?.appSecret) return { appId: data.app_id as string, appSecret: v.appSecret, extra: v.extra }; } catch { /* formato antigo */ }
  return { appId: data.app_id as string, appSecret: raw };
}

/** Valida os campos do formulário contra a definição da plataforma. */
function readFields(defs: { key: string; label: string; pattern?: string; optional?: boolean }[], input: Json, allowMissing: string[] = []) {
  const out: Record<string, string> = {};
  for (const d of defs) {
    const v = String(input[d.key] ?? "").trim();
    if (!v) { if (d.optional || allowMissing.includes(d.key)) continue; throw new PlatformError(`Preencha: ${d.label}.`); }
    if (d.pattern && !new RegExp(d.pattern).test(v)) throw new PlatformError(`${d.label}: formato inválido.`);
    out[d.key] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ sincronização */
type ConnRow = { id: string; workspace_id: string; platform: PlatformId };

export async function syncConnection(sb: SupabaseClient, env: Env, conn: ConnRow, trigger: "manual" | "agendada" | "conexao", days = 30) {
  const prov = PROVIDERS[conn.platform];
  const ws = conn.workspace_id;
  const { data: run } = await sb.from("sync_runs").insert({ workspace_id: ws, platform: conn.platform, trigger }).select("id").single();
  const detail: Json = { contas: 0, campanhas: 0, conjuntos: 0, anuncios: 0, linhas_de_metricas: 0, dias: days };
  const warnings: string[] = [];
  try {
    const auth = await prov.ready(env, await loadAuth(sb, env, conn.id));
    const accounts = await prov.accounts(env, auth);
    if (accounts.length) {
      await chunked(accounts.map((a) => ({ workspace_id: ws, platform: conn.platform, external_id: a.externalId, parent_external_id: a.parentExternalId ?? null, name: a.name, currency: a.currency, timezone: a.timezone, status: a.active ? "connected" : "error" })), 200,
        (part) => sb.from("ad_accounts").upsert(part, { onConflict: "workspace_id,platform,external_id" }));
    }
    const { data: accRows } = await sb.from("ad_accounts").select("id, external_id, parent_external_id, name, currency, timezone, sync_enabled").eq("workspace_id", ws).eq("platform", conn.platform);
    const since = isoDay(new Date(Date.now() - (days - 1) * DAY));
    const until = isoDay(new Date());
    for (const acc of accRows ?? []) {
      if (!acc.sync_enabled || !acc.external_id) continue;
      const nacc: NAccount = { externalId: acc.external_id as string, parentExternalId: acc.parent_external_id as string | null, name: acc.name as string, currency: acc.currency as string, timezone: acc.timezone as string, active: true };
      try {
        const st = await prov.structure(env, auth, nacc);
        await chunked(st.campaigns.map((c) => ({ workspace_id: ws, ad_account_id: acc.id, external_id: c.externalId, name: c.name, objective: c.objective, status: c.status, budget: c.budget, budget_type: c.budgetType, started_at: c.startedAt, updated_at: now() })), 500,
          (part) => sb.from("campaigns").upsert(part, { onConflict: "ad_account_id,external_id" }));
        const { data: campMap } = await sb.from("campaigns").select("id, external_id").eq("workspace_id", ws).eq("ad_account_id", acc.id);
        const campId = new Map((campMap ?? []).map((c) => [c.external_id as string, c.id as string]));
        const sets = st.adSets.filter((s) => campId.has(s.campaignExternalId));
        await chunked(sets.map((s) => ({ workspace_id: ws, campaign_id: campId.get(s.campaignExternalId)!, external_id: s.externalId, name: s.name, status: s.status, audience: s.audience })), 500,
          (part) => sb.from("ad_sets").upsert(part, { onConflict: "campaign_id,external_id" }));
        const campIds = [...campId.values()];
        const { data: setMap } = campIds.length ? await sb.from("ad_sets").select("id, external_id").eq("workspace_id", ws).in("campaign_id", campIds) : { data: [] };
        const setId = new Map((setMap ?? []).map((s) => [s.external_id as string, s.id as string]));
        const ads = st.ads.filter((a) => setId.has(a.adSetExternalId));
        await chunked(ads.map((a) => ({ workspace_id: ws, ad_set_id: setId.get(a.adSetExternalId)!, external_id: a.externalId, name: a.name, status: a.status, format: a.format, thumbnail_url: a.thumbnail })), 500,
          (part) => sb.from("ads").upsert(part, { onConflict: "ad_set_id,external_id" }));
        const setIds = [...setId.values()];
        const { data: adMap } = setIds.length ? await sb.from("ads").select("id, external_id").eq("workspace_id", ws).in("ad_set_id", setIds) : { data: [] };
        const adId = new Map((adMap ?? []).map((a) => [a.external_id as string, a.id as string]));
        const ins = (await prov.insights(env, auth, nacc, since, until)).filter((i) => adId.has(i.adExternalId));
        // várias linhas do mesmo anúncio/dia (ex.: segmentos) são somadas
        const merged = new Map<string, Json>();
        for (const i of ins) {
          const k = `${i.adExternalId}|${i.date}`;
          const prev = merged.get(k) as Record<string, number> | undefined;
          const row = { spend: i.spend, impressions: i.impressions, reach: i.reach, clicks: i.clicks, link_clicks: i.link_clicks, conversions: i.conversions, leads: i.leads, purchases: i.purchases, revenue: i.revenue };
          if (prev) for (const key of Object.keys(row) as (keyof typeof row)[]) (prev as Record<string, number>)[key] = (prev[key] ?? 0) + row[key];
          else merged.set(k, { workspace_id: ws, ad_id: adId.get(i.adExternalId)!, date: i.date, ...row });
        }
        await chunked([...merged.values()], 500, (part) => sb.from("ad_metrics_daily").upsert(part, { onConflict: "ad_id,date" }));
        detail.contas = (detail.contas as number) + 1;
        detail.campanhas = (detail.campanhas as number) + st.campaigns.length;
        detail.conjuntos = (detail.conjuntos as number) + sets.length;
        detail.anuncios = (detail.anuncios as number) + ads.length;
        detail.linhas_de_metricas = (detail.linhas_de_metricas as number) + merged.size;
        await sb.from("ad_accounts").update({ last_synced_at: now() }).eq("id", acc.id);
      } catch (e) {
        if (e instanceof PlatformError && e.expired) throw e;
        warnings.push(`${acc.name}: ${msg(e)}`);
      }
    }
    if (warnings.length) detail.avisos = warnings.slice(0, 10);
    await sb.from("platform_connections").update({ status: "ativa", last_error: warnings[0] ?? null, last_synced_at: now(), updated_at: now() }).eq("id", conn.id);
    if (run) await sb.from("sync_runs").update({ status: warnings.length && !(detail.contas as number) ? "erro" : "ok", detail, error: warnings[0] ?? null, finished_at: now() }).eq("id", run.id);
    return { ok: true, detail };
  } catch (e) {
    const expired = e instanceof PlatformError && e.expired;
    await sb.from("platform_connections").update({ status: expired ? "expirada" : "erro", last_error: msg(e).slice(0, 500), updated_at: now() }).eq("id", conn.id);
    if (run) await sb.from("sync_runs").update({ status: "erro", detail, error: msg(e).slice(0, 500), finished_at: now() }).eq("id", run.id);
    return { ok: false, error: msg(e), detail };
  }
}

/* ------------------------------------------------------------------ escrita de volta */
/** Pausa/ativa na plataforma de origem (quando a campanha veio de uma conta integrada) e no banco. */
export async function applyCampaignStatus(sb: SupabaseClient, env: Env, ws: string, ids: string[], status: "active" | "paused") {
  const { data: camps } = await sb.from("campaigns").select("id, external_id, ad_accounts(platform, external_id, parent_external_id, name, currency, timezone)").eq("workspace_id", ws).in("id", ids);
  const auths = new Map<PlatformId, StoredAuth | null>();
  const results: { id: string; plataforma: boolean; erro?: string }[] = [];
  for (const c of camps ?? []) {
    const acc = c.ad_accounts as unknown as { platform: string; external_id: string | null; parent_external_id: string | null; name: string; currency: string; timezone: string } | null;
    let pushed = false;
    try {
      if (c.external_id && acc?.external_id && isPlatform(acc.platform)) {
        const p = acc.platform;
        if (!auths.has(p)) {
          const { data: conn } = await sb.from("platform_connections").select("id").eq("workspace_id", ws).eq("platform", p).maybeSingle();
          auths.set(p, conn ? await PROVIDERS[p].ready(env, await loadAuth(sb, env, conn.id as string)) : null);
        }
        const auth = auths.get(p);
        if (auth) {
          await PROVIDERS[p].setCampaignStatus(env, auth, { externalId: acc.external_id, parentExternalId: acc.parent_external_id, name: acc.name, currency: acc.currency, timezone: acc.timezone, active: true }, c.external_id as string, status);
          pushed = true;
        }
      }
      const { error } = await sb.from("campaigns").update({ status, updated_at: now() }).eq("id", c.id);
      if (error) throw new Error(error.message);
      results.push({ id: c.id as string, plataforma: pushed });
    } catch (e) {
      results.push({ id: c.id as string, plataforma: false, erro: msg(e) });
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

  // Retorno do OAuth (qualquer plataforma)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    let platform: PlatformId = "meta";
    const back = (q: string) => redirect(`${origin}/conexoes?plataforma=${platform}&${q}`);
    try {
      if (!sb || !state) throw new Error("Retorno incompleto da plataforma.");
      const st = await verifyState<{ ws: string; uid: string; p: string; mode?: AuthMode }>(env, state);
      if (!isPlatform(st.p)) throw new Error("Plataforma desconhecida.");
      platform = st.p;
      if (url.searchParams.get("error") || url.searchParams.get("error_code")) return back("resultado=cancelado");
      const code = url.searchParams.get("code") ?? url.searchParams.get("auth_code");
      if (!code) throw new Error("A plataforma não devolveu a autorização.");
      const role = await roleIn(sb, st.ws, st.uid);
      if (!role || !["owner", "admin"].includes(role)) throw new Error("Só administradores do espaço podem conectar contas.");
      const prov = PROVIDERS[platform];
      const mode: AuthMode = st.mode === "app_proprio" ? "app_proprio" : "app_ninepro";
      const app = mode === "app_proprio" ? await loadOwnApp(sb, env, st.ws, platform) : prov.nineproApp(env);
      if (!app) throw new Error("As credenciais do app não foram encontradas. Informe de novo.");
      const ex = await prov.exchangeCode(env, app, code, redirectUri(req, env));
      await saveConnection(sb, env, platform, { ws: st.ws, uid: st.uid, mode, appId: mode === "app_proprio" ? app.appId : null, ...ex });
      return back("resultado=conectado");
    } catch (e) {
      return back("resultado=erro&motivo=" + encodeURIComponent(msg(e)));
    }
  }

  if (req.method !== "POST") return json(405, { error: "Método não suportado." });
  if (!sb) return json(503, { error: FRIENDLY });
  const user = await sessionUser(sb, req);
  if (!user) return json(401, { error: "Sessão inválida. Entre de novo." });
  const body = (await req.json().catch(() => ({}))) as Json;
  const ws = String(body.workspaceId ?? "");
  const role = await roleIn(sb, ws, user.id);
  if (!role) return json(403, { error: "Você não faz parte deste espaço." });
  const isAdmin = ["owner", "admin"].includes(role);
  const platform: PlatformId = isPlatform(body.platform) ? body.platform : "meta";
  const prov = PROVIDERS[platform];
  const adminOnly = () => json(403, { error: "Só administradores do espaço podem fazer isso." });
  const needKey = () => { if (!env.TOKEN_ENCRYPTION_KEY) { console.error("TOKEN_ENCRYPTION_KEY ausente"); return json(503, { error: FRIENDLY }); } return null; };

  try {
    switch (body.action) {
      case "options": {
        const own = await loadOwnApp(sb, env, ws, platform).catch(() => null);
        return json(200, { platform, label: prov.label, ninepro: !!prov.nineproApp(env), redirectUri: redirectUri(req, env), scopes: prov.scopes(env), ownAppId: own?.appId ?? null, appFields: prov.appFields, tokenFields: prov.tokenFields });
      }
      case "start": {
        if (!isAdmin) return adminOnly();
        const k = needKey(); if (k) return k;
        const mode: AuthMode = body.mode === "app_proprio" ? "app_proprio" : "app_ninepro";
        let app: AppCreds | null;
        if (mode === "app_proprio") {
          const input = (body.fields ?? {}) as Json;
          const existing = await loadOwnApp(sb, env, ws, platform).catch(() => null);
          const sameApp = !!existing && existing.appId === String(input.appId ?? "").trim();
          const secretKeys = prov.appFields.filter((f) => f.secret).map((f) => f.key);
          const f = readFields(prov.appFields, input, sameApp ? secretKeys : []);
          const extra: Record<string, string> = { ...(sameApp ? existing!.extra : {}) };
          for (const d of prov.appFields) if (!["appId", "appSecret"].includes(d.key) && f[d.key]) extra[d.key] = f[d.key];
          app = { appId: f.appId, appSecret: f.appSecret ?? existing!.appSecret, extra };
          await sb.from("platform_app_credentials").upsert({ workspace_id: ws, platform, app_id: app.appId, app_secret_enc: await encryptToken(env, JSON.stringify({ appSecret: app.appSecret, extra: app.extra })), updated_at: now() });
        } else {
          app = prov.nineproApp(env);
          if (!app) return json(409, { error: "Use o app da sua empresa ou um token de acesso para conectar." });
        }
        const state = await signState(env, { ws, uid: user.id, p: platform, mode });
        return json(200, { url: prov.authorizeUrl(env, app, redirectUri(req, env), state) });
      }
      case "connect_token": {
        if (!isAdmin) return adminOnly();
        const k = needKey(); if (k) return k;
        const fields = readFields(prov.tokenFields, (body.fields ?? {}) as Json);
        const ex = await prov.fromToken(env, fields);
        await saveConnection(sb, env, platform, { ws, uid: user.id, mode: "token", ...ex });
        return json(200, { ok: true, user: ex.user.name });
      }
      case "sync": {
        const { data: conn } = await sb.from("platform_connections").select("id, workspace_id, platform").eq("workspace_id", ws).eq("platform", platform).maybeSingle();
        if (!conn) return json(404, { error: `Nenhuma conta do ${prov.label} conectada.` });
        const r = await syncConnection(sb, env, conn as ConnRow, "manual", Math.min(90, Math.max(1, Number(body.days ?? 30))));
        return json(r.ok ? 200 : 502, r.ok ? r : { ...r, error: r.error });
      }
      case "toggle_account": {
        if (!isAdmin) return adminOnly();
        const { error } = await sb.from("ad_accounts").update({ sync_enabled: body.enabled === true }).eq("workspace_id", ws).eq("id", String(body.accountId ?? ""));
        return json(error ? 400 : 200, error ? { error: error.message } : { ok: true });
      }
      case "disconnect": {
        if (!isAdmin) return adminOnly();
        await sb.from("platform_connections").delete().eq("workspace_id", ws).eq("platform", platform);
        if (body.forgetApp === true) await sb.from("platform_app_credentials").delete().eq("workspace_id", ws).eq("platform", platform);
        return json(200, { ok: true });
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
  } catch (e) {
    if (e instanceof PlatformError) return json(400, { error: e.expired ? "As credenciais são inválidas ou expiraram." : e.message });
    console.error(e);
    return json(500, { error: FRIENDLY });
  }
}

/** Vercel Cron: sincroniza todas as conexões ativas (últimos 3 dias). */
export async function handleSync(req: Request, env: Env): Promise<Response> {
  if (!env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return json(401, { error: "Não autorizado." });
  const sb = serviceClient(env);
  if (!sb) return json(503, { error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada." });
  const { data: conns } = await sb.from("platform_connections").select("id, workspace_id, platform").eq("status", "ativa");
  const results = [];
  for (const c of conns ?? []) if (isPlatform(c.platform)) results.push({ espaco: c.workspace_id, plataforma: c.platform, ...(await syncConnection(sb, env, c as ConnRow, "agendada", 3)) });
  return json(200, { conexoes: results.length, results });
}
