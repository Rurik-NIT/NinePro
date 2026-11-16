/**
 * Cliente da Meta Marketing API (Graph API). Só roda no servidor.
 * Variáveis: META_APP_ID, META_APP_SECRET, META_GRAPH_VERSION (padrão v23.0), META_SCOPES.
 */
type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;

export const metaVersion = (env: Env) => env.META_GRAPH_VERSION || "v23.0";
const graph = (env: Env) => `https://graph.facebook.com/${metaVersion(env)}`;
export const META_DEFAULT_SCOPES = "ads_read,ads_management,business_management";

export class MetaError extends Error {
  constructor(message: string, public code?: number, public expired = false) { super(message); }
}

export function metaConfigured(env: Env) { return !!(env.META_APP_ID && env.META_APP_SECRET); }

export function metaAuthorizeUrl(env: Env, redirectUri: string, state: string) {
  const u = new URL(`https://www.facebook.com/${metaVersion(env)}/dialog/oauth`);
  u.searchParams.set("client_id", env.META_APP_ID!);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("scope", env.META_SCOPES || META_DEFAULT_SCOPES);
  u.searchParams.set("response_type", "code");
  return u.toString();
}

async function call<T = Json>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => ({}))) as Json & { error?: { message?: string; code?: number; error_subcode?: number } };
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    const expired = e.code === 190 || e.code === 102;
    throw new MetaError(expired ? "A autorização da Meta expirou ou foi revogada. Conecte de novo." : `Meta: ${e.message ?? `HTTP ${res.status}`}`, e.code, expired);
  }
  return body as T;
}

/** Troca o code do OAuth por um token de longa duração (~60 dias). */
export async function metaExchangeCode(env: Env, code: string, redirectUri: string) {
  const g = graph(env);
  const short = await call<{ access_token: string }>(`${g}/oauth/access_token?${new URLSearchParams({ client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, redirect_uri: redirectUri, code })}`);
  const long = await call<{ access_token: string; expires_in?: number }>(`${g}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, fb_exchange_token: short.access_token })}`);
  const me = await call<{ id: string; name: string }>(`${g}/me?${new URLSearchParams({ fields: "id,name", access_token: long.access_token })}`);
  const perms = await call<{ data: { permission: string; status: string }[] }>(`${g}/me/permissions?${new URLSearchParams({ access_token: long.access_token })}`);
  return {
    token: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null,
    user: me,
    scopes: perms.data.filter((p) => p.status === "granted").map((p) => p.permission),
  };
}

/** Percorre a paginação da Graph API. */
async function all<T = Json>(env: Env, path: string, params: Record<string, string>, token: string, max = 20_000): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${graph(env)}/${path}?${new URLSearchParams({ ...params, access_token: token })}`;
  while (url && out.length < max) {
    const page: { data: T[]; paging?: { next?: string } } = await call(url);
    out.push(...page.data);
    url = page.paging?.next ?? null;
  }
  return out;
}

export interface MetaAccount { id: string; account_id: string; name: string; currency: string; timezone_name: string; account_status: number }
export const metaAccounts = (env: Env, token: string) =>
  all<MetaAccount>(env, "me/adaccounts", { fields: "id,account_id,name,currency,timezone_name,account_status", limit: "200" }, token);

export const metaCampaigns = (env: Env, token: string, act: string) =>
  all<{ id: string; name: string; objective?: string; effective_status?: string; daily_budget?: string; lifetime_budget?: string; start_time?: string }>(
    env, `${act}/campaigns`, { fields: "id,name,objective,effective_status,daily_budget,lifetime_budget,start_time", limit: "200" }, token);

export const metaAdSets = (env: Env, token: string, act: string) =>
  all<{ id: string; name: string; campaign_id: string; effective_status?: string; optimization_goal?: string }>(
    env, `${act}/adsets`, { fields: "id,name,campaign_id,effective_status,optimization_goal", limit: "200" }, token);

export const metaAds = (env: Env, token: string, act: string) =>
  all<{ id: string; name: string; adset_id: string; effective_status?: string; creative?: { object_type?: string; thumbnail_url?: string } }>(
    env, `${act}/ads`, { fields: "id,name,adset_id,effective_status,creative{object_type,thumbnail_url}", limit: "200" }, token);

export interface MetaInsight { ad_id: string; date_start: string; spend?: string; impressions?: string; reach?: string; clicks?: string; inline_link_clicks?: string; actions?: { action_type: string; value: string }[]; action_values?: { action_type: string; value: string }[] }
export const metaInsights = (env: Env, token: string, act: string, since: string, until: string) =>
  all<MetaInsight>(env, `${act}/insights`, {
    level: "ad", time_increment: "1", time_range: JSON.stringify({ since, until }),
    fields: "ad_id,date_start,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values", limit: "500",
  }, token, 200_000);

export async function metaSetStatus(env: Env, token: string, objectId: string, status: "ACTIVE" | "PAUSED") {
  await call(`${graph(env)}/${objectId}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ status, access_token: token }) });
}

/* ------------------------------------------------------------------ mapeamentos */
export function mapObjective(o?: string): "vendas" | "leads" | "trafego" | "reconhecimento" {
  switch (o) {
    case "OUTCOME_SALES": case "CONVERSIONS": case "PRODUCT_CATALOG_SALES": return "vendas";
    case "OUTCOME_LEADS": case "LEAD_GENERATION": case "MESSAGES": return "leads";
    case "OUTCOME_TRAFFIC": case "LINK_CLICKS": case "OUTCOME_APP_PROMOTION": case "APP_INSTALLS": return "trafego";
    default: return "reconhecimento";
  }
}
export function mapStatus(s?: string): "active" | "learning" | "limited" | "paused" | "ended" {
  switch (s) {
    case "ACTIVE": return "active";
    case "IN_PROCESS": case "PENDING_REVIEW": case "PREAPPROVED": return "learning";
    case "WITH_ISSUES": case "DISAPPROVED": case "PENDING_BILLING_INFO": return "limited";
    case "ARCHIVED": case "DELETED": return "ended";
    default: return "paused";
  }
}
const pick = (list: { action_type: string; value: string }[] | undefined, types: string[]) => {
  for (const t of types) { const v = list?.find((a) => a.action_type === t); if (v) return Number(v.value) || 0; }
  return 0;
};
export function mapInsight(i: MetaInsight) {
  const purchases = pick(i.actions, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]);
  const leads = pick(i.actions, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);
  return {
    spend: Number(i.spend ?? 0), impressions: Number(i.impressions ?? 0), reach: Number(i.reach ?? 0), clicks: Number(i.clicks ?? 0),
    link_clicks: Number(i.inline_link_clicks ?? 0), purchases, leads, conversions: purchases + leads,
    revenue: pick(i.action_values, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]),
  };
}
