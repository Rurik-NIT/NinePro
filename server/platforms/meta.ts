/**
 * Meta Ads (Facebook/Instagram) — Graph API / Marketing API.
 * App do NinePro: META_APP_ID, META_APP_SECRET. Opcionais: META_GRAPH_VERSION (v23.0), META_SCOPES.
 */
import { http, num, PlatformError, type AppCreds, type Delivery, type Env, type ExchangeResult, type NInsight, type Objective, type Provider, type StoredAuth } from "./types.js";

export const metaVersion = (env: Env) => env.META_GRAPH_VERSION || "v23.0";
const graph = (env: Env) => `https://graph.facebook.com/${metaVersion(env)}`;
export const META_DEFAULT_SCOPES = "ads_read,ads_management,business_management";
const expired = (_s: number, b: Record<string, unknown>) => { const c = (b.error as { code?: number } | undefined)?.code; return c === 190 || c === 102; };
const call = <T = Record<string, unknown>>(url: string, init?: RequestInit) => http<T>("Meta", url, init, expired);

async function all<T>(env: Env, path: string, params: Record<string, string>, token: string, max = 50_000): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${graph(env)}/${path}?${new URLSearchParams({ ...params, access_token: token })}`;
  while (url && out.length < max) {
    const page: { data: T[]; paging?: { next?: string } } = await call(url);
    out.push(...page.data);
    url = page.paging?.next ?? null;
  }
  return out;
}

async function inspect(env: Env, token: string) {
  const me = await call<{ id: string; name: string }>(`${graph(env)}/me?${new URLSearchParams({ fields: "id,name", access_token: token })}`);
  const perms = await call<{ data: { permission: string; status: string }[] }>(`${graph(env)}/me/permissions?${new URLSearchParams({ access_token: token })}`).catch(() => ({ data: [] as { permission: string; status: string }[] }));
  return { user: me, scopes: perms.data.filter((p) => p.status === "granted").map((p) => p.permission) };
}

/* ------------------------------------------------------------------ mapeamentos */
export function mapObjective(o?: string): Objective {
  switch (o) {
    case "OUTCOME_SALES": case "CONVERSIONS": case "PRODUCT_CATALOG_SALES": return "vendas";
    case "OUTCOME_LEADS": case "LEAD_GENERATION": case "MESSAGES": return "leads";
    case "OUTCOME_TRAFFIC": case "LINK_CLICKS": case "OUTCOME_APP_PROMOTION": case "APP_INSTALLS": return "trafego";
    default: return "reconhecimento";
  }
}
export function mapStatus(s?: string): Delivery {
  switch (s) {
    case "ACTIVE": return "active";
    case "IN_PROCESS": case "PENDING_REVIEW": case "PREAPPROVED": return "learning";
    case "WITH_ISSUES": case "DISAPPROVED": case "PENDING_BILLING_INFO": return "limited";
    case "ARCHIVED": case "DELETED": return "ended";
    default: return "paused";
  }
}
export interface MetaInsight { ad_id: string; date_start: string; spend?: string; impressions?: string; reach?: string; clicks?: string; inline_link_clicks?: string; actions?: { action_type: string; value: string }[]; action_values?: { action_type: string; value: string }[] }
const pick = (list: { action_type: string; value: string }[] | undefined, types: string[]) => {
  for (const t of types) { const v = list?.find((a) => a.action_type === t); if (v) return num(v.value); }
  return 0;
};
export function mapInsight(i: MetaInsight) {
  const purchases = pick(i.actions, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]);
  const leads = pick(i.actions, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);
  return {
    spend: num(i.spend), impressions: num(i.impressions), reach: num(i.reach), clicks: num(i.clicks), link_clicks: num(i.inline_link_clicks),
    purchases, leads, conversions: purchases + leads, revenue: pick(i.action_values, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]),
  };
}

const token = (a: StoredAuth) => { if (!a.accessToken) throw new PlatformError("Meta: conexão sem token. Conecte de novo.", true); return a.accessToken; };

export const metaProvider: Provider = {
  id: "meta",
  label: "Meta Ads",
  nineproApp: (env) => (env.META_APP_ID && env.META_APP_SECRET ? { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET } : null),
  scopes: (env) => (env.META_SCOPES || META_DEFAULT_SCOPES).split(","),
  appFields: [
    { key: "appId", label: "ID do app", placeholder: "123456789012345", pattern: "^\\d{5,20}$", hint: "Configurações do app › Básico" },
    { key: "appSecret", label: "Chave secreta do app", secret: true, placeholder: "32 caracteres", pattern: "^[0-9a-fA-F]{32}$" },
  ],
  tokenFields: [{ key: "accessToken", label: "Token de acesso", secret: true, multiline: true, placeholder: "EAAG…", hint: "Token de usuário do sistema do Business Manager (validade: Nunca)." }],
  authorizeUrl(env, app, redirectUri, state) {
    const u = new URL(`https://www.facebook.com/${metaVersion(env)}/dialog/oauth`);
    u.search = new URLSearchParams({ client_id: app.appId, redirect_uri: redirectUri, state, scope: this.scopes(env).join(","), response_type: "code" }).toString();
    return u.toString();
  },
  async exchangeCode(env, app, code, redirectUri): Promise<ExchangeResult> {
    const g = graph(env);
    const short = await call<{ access_token: string }>(`${g}/oauth/access_token?${new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, redirect_uri: redirectUri, code })}`);
    const long = await call<{ access_token: string; expires_in?: number }>(`${g}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: short.access_token })}`);
    const info = await inspect(env, long.access_token);
    return { auth: { accessToken: long.access_token }, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null, ...info };
  },
  async fromToken(env, f) {
    const t = (f.accessToken ?? "").trim();
    if (t.length < 50 || /\s/.test(t)) throw new PlatformError("Cole o token completo, sem espaços.");
    const info = await inspect(env, t);
    if (info.scopes.length && !info.scopes.includes("ads_read")) throw new PlatformError("O token não tem a permissão ads_read. Gere de novo marcando ads_read e ads_management.");
    return { auth: { accessToken: t }, expiresAt: null, ...info };
  },
  async ready(_env, auth) { return auth; },
  async accounts(env, auth) {
    const rows = await all<{ id: string; name: string; currency: string; timezone_name: string; account_status: number }>(env, "me/adaccounts", { fields: "id,name,currency,timezone_name,account_status", limit: "200" }, token(auth));
    return rows.map((a) => ({ externalId: a.id, name: a.name, currency: a.currency, timezone: a.timezone_name, active: a.account_status === 1 }));
  },
  async structure(env, auth, acc) {
    const t = token(auth);
    const [c, s, a] = await Promise.all([
      all<{ id: string; name: string; objective?: string; effective_status?: string; daily_budget?: string; lifetime_budget?: string; start_time?: string }>(env, `${acc.externalId}/campaigns`, { fields: "id,name,objective,effective_status,daily_budget,lifetime_budget,start_time", limit: "200" }, t),
      all<{ id: string; name: string; campaign_id: string; effective_status?: string; optimization_goal?: string }>(env, `${acc.externalId}/adsets`, { fields: "id,name,campaign_id,effective_status,optimization_goal", limit: "200" }, t),
      all<{ id: string; name: string; adset_id: string; effective_status?: string; creative?: { object_type?: string; thumbnail_url?: string } }>(env, `${acc.externalId}/ads`, { fields: "id,name,adset_id,effective_status,creative{object_type,thumbnail_url}", limit: "200" }, t),
    ]);
    return {
      campaigns: c.map((x) => ({ externalId: x.id, name: x.name, objective: mapObjective(x.objective), status: mapStatus(x.effective_status), budget: x.daily_budget ? num(x.daily_budget) / 100 : num(x.lifetime_budget) / 100, budgetType: x.lifetime_budget && !x.daily_budget ? "total" : "diario", startedAt: x.start_time?.slice(0, 10) ?? null })),
      adSets: s.map((x) => ({ externalId: x.id, campaignExternalId: x.campaign_id, name: x.name, status: mapStatus(x.effective_status), audience: x.optimization_goal ?? null })),
      ads: a.map((x) => ({ externalId: x.id, adSetExternalId: x.adset_id, name: x.name, status: mapStatus(x.effective_status), format: x.creative?.object_type === "VIDEO" ? "Vídeo" : "Imagem", thumbnail: x.creative?.thumbnail_url ?? null })),
    };
  },
  async insights(env, auth, acc, since, until): Promise<NInsight[]> {
    const rows = await all<MetaInsight>(env, `${acc.externalId}/insights`, { level: "ad", time_increment: "1", time_range: JSON.stringify({ since, until }), fields: "ad_id,date_start,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values", limit: "500" }, token(auth), 500_000);
    return rows.map((i) => ({ adExternalId: i.ad_id, date: i.date_start, ...mapInsight(i) }));
  },
  async setCampaignStatus(env, auth, _acc, id, status) {
    await call(`${graph(env)}/${id}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ status: status === "active" ? "ACTIVE" : "PAUSED", access_token: token(auth) }) });
  },
  async setCampaignBudget(env, auth, _acc, id, daily) {
    await call(`${graph(env)}/${id}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ daily_budget: String(Math.round(daily * 100)), access_token: token(auth) }) });
  },
};

export type { AppCreds };
