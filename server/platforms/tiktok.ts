/**
 * TikTok Ads — TikTok Business API (Marketing API).
 * App do NinePro: TIKTOK_APP_ID, TIKTOK_APP_SECRET. Opcional: TIKTOK_API_VERSION (padrão v1.3).
 * Hierarquia: campanha → grupo de anúncios (conjunto) → anúncio. O token não expira.
 */
import { http, num, PlatformError, type Delivery, type Env, type NAccount, type NInsight, type Objective, type Provider, type StoredAuth } from "./types.js";

const base = (env: Env) => `https://business-api.tiktok.com/open_api/${env.TIKTOK_API_VERSION || "v1.3"}`;
interface TTResp<T> { code: number; message: string; data: T }

/** A API responde HTTP 200 com { code != 0 } em caso de erro. */
async function tt<T>(env: Env, path: string, init: RequestInit & { token?: string }, query?: Record<string, unknown>): Promise<T> {
  const url = new URL(`${base(env)}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  const r = await http<TTResp<T>>("TikTok", url.toString(), { ...init, headers: { "content-type": "application/json", ...(init.token ? { "Access-Token": init.token } : {}), ...(init.headers ?? {}) } });
  if (r.code !== 0) throw new PlatformError(`TikTok: ${r.message}`, r.code === 40104 || r.code === 40105 || r.code === 40100);
  return r.data;
}
async function pages<T>(env: Env, path: string, token: string, query: Record<string, unknown>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 200; page++) {
    const d = await tt<{ list?: T[]; page_info?: { total_page?: number } }>(env, path, { token }, { ...query, page, page_size: 1000 });
    out.push(...(d.list ?? []));
    if (!d.page_info?.total_page || page >= d.page_info.total_page) break;
  }
  return out;
}

export function ttMapStatus(operation?: string, secondary?: string): Delivery {
  if (secondary && /DELETE|DONE|TIME_DONE/.test(secondary)) return "ended";
  if (operation === "DISABLE") return "paused";
  if (secondary && /NOT_APPROVE|REJECT|BALANCE|BUDGET_EXCEED/.test(secondary)) return "limited";
  if (secondary && /AUDIT|REVIEW|LEARNING/.test(secondary)) return "learning";
  return operation === "ENABLE" ? "active" : "paused";
}
export function ttMapObjective(o?: string): Objective {
  switch (o) {
    case "PRODUCT_SALES": case "CONVERSIONS": case "WEB_CONVERSIONS": case "SHOP_PURCHASES": return "vendas";
    case "LEAD_GENERATION": return "leads";
    case "TRAFFIC": case "APP_PROMOTION": case "APP_INSTALL": return "trafego";
    default: return "reconhecimento";
  }
}

const token = (a: StoredAuth) => { if (!a.accessToken) throw new PlatformError("TikTok: conexão sem token. Conecte de novo.", true); return a.accessToken; };

export const tiktokProvider: Provider = {
  id: "tiktok",
  label: "TikTok Ads",
  nineproApp: (env) => (env.TIKTOK_APP_ID && env.TIKTOK_APP_SECRET ? { appId: env.TIKTOK_APP_ID, appSecret: env.TIKTOK_APP_SECRET } : null),
  scopes: () => ["Ad Account Management", "Ads Management", "Reporting"],
  appFields: [
    { key: "appId", label: "App ID", placeholder: "7123456789012345678", pattern: "^\\d{6,25}$", hint: "TikTok for Business Developers › My Apps" },
    { key: "appSecret", label: "Secret", secret: true },
  ],
  tokenFields: [
    { key: "accessToken", label: "Token de acesso (long-term)", secret: true, multiline: true, hint: "Gerado no portal de desenvolvedores do TikTok for Business." },
    { key: "advertiserIds", label: "IDs das contas de anúncio (advertiser IDs)", placeholder: "7012345678901234567, 7023456789012345678", hint: "Separados por vírgula. Ficam no TikTok Ads Manager, ao lado do nome da conta." },
  ],
  authorizeUrl(_env, app, redirectUri, state) {
    const u = new URL("https://business-api.tiktok.com/portal/auth");
    u.search = new URLSearchParams({ app_id: app.appId, state, redirect_uri: redirectUri }).toString();
    return u.toString();
  },
  async exchangeCode(env, app, code) {
    const d = await tt<{ access_token: string; advertiser_ids: string[]; scope?: number[] }>(env, "/oauth2/access_token/", { method: "POST", body: JSON.stringify({ app_id: app.appId, secret: app.appSecret, auth_code: code }) });
    return { auth: { accessToken: d.access_token, extra: { advertiserIds: d.advertiser_ids.join(",") } }, expiresAt: null, user: { id: d.advertiser_ids[0] ?? "tiktok", name: `TikTok (${d.advertiser_ids.length} conta${d.advertiser_ids.length === 1 ? "" : "s"})` }, scopes: (d.scope ?? []).map(String) };
  },
  async fromToken(env, f) {
    const t = (f.accessToken ?? "").trim();
    const ids = (f.advertiserIds ?? "").split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /^\d{6,25}$/.test(s));
    if (t.length < 20) throw new PlatformError("Cole o token de acesso completo.");
    if (!ids.length) throw new PlatformError("Informe pelo menos um advertiser ID (só números).");
    const info = await tt<{ list: { advertiser_id: string; name: string }[] }>(env, "/advertiser/info/", { token: t }, { advertiser_ids: ids, fields: ["advertiser_id", "name"] });
    if (!info.list?.length) throw new PlatformError("Nenhuma conta encontrada com esse token e esses IDs.");
    return { auth: { accessToken: t, extra: { advertiserIds: ids.join(",") } }, expiresAt: null, user: { id: ids[0], name: info.list[0].name }, scopes: [] };
  },
  async ready(_env, auth) { return auth; },
  async accounts(env, auth) {
    const ids = (auth.extra?.advertiserIds ?? "").split(",").filter(Boolean);
    const out: NAccount[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const d = await tt<{ list: { advertiser_id: string; name: string; currency: string; timezone?: string; display_timezone?: string; status?: string }[] }>(env, "/advertiser/info/", { token: token(auth) },
        { advertiser_ids: ids.slice(i, i + 50), fields: ["advertiser_id", "name", "currency", "timezone", "display_timezone", "status"] });
      for (const a of d.list ?? []) out.push({ externalId: a.advertiser_id, name: a.name, currency: a.currency, timezone: a.display_timezone ?? a.timezone ?? "UTC", active: !a.status || a.status === "STATUS_ENABLE" });
    }
    return out;
  },
  async structure(env, auth, acc) {
    const t = token(auth);
    const q = { advertiser_id: acc.externalId };
    const [c, g, a] = await Promise.all([
      pages<{ campaign_id: string; campaign_name: string; objective_type?: string; operation_status?: string; secondary_status?: string; budget?: number; budget_mode?: string; create_time?: string }>(env, "/campaign/get/", t, q),
      pages<{ adgroup_id: string; adgroup_name: string; campaign_id: string; operation_status?: string; secondary_status?: string; optimization_goal?: string }>(env, "/adgroup/get/", t, q),
      pages<{ ad_id: string; ad_name: string; adgroup_id: string; operation_status?: string; secondary_status?: string; video_id?: string | null; ad_format?: string }>(env, "/ad/get/", t, q),
    ]);
    return {
      campaigns: c.map((x) => ({ externalId: x.campaign_id, name: x.campaign_name, objective: ttMapObjective(x.objective_type), status: ttMapStatus(x.operation_status, x.secondary_status), budget: num(x.budget), budgetType: x.budget_mode === "BUDGET_MODE_TOTAL" ? "total" : "diario", startedAt: x.create_time?.slice(0, 10) ?? null })),
      adSets: g.map((x) => ({ externalId: x.adgroup_id, campaignExternalId: x.campaign_id, name: x.adgroup_name, status: ttMapStatus(x.operation_status, x.secondary_status), audience: x.optimization_goal ?? null })),
      ads: a.map((x) => ({ externalId: x.ad_id, adSetExternalId: x.adgroup_id, name: x.ad_name, status: ttMapStatus(x.operation_status, x.secondary_status), format: x.video_id ? "Vídeo" : x.ad_format === "CAROUSEL_ADS" ? "Carrossel" : "Imagem", thumbnail: null })),
    };
  },
  async insights(env, auth, acc, since, until): Promise<NInsight[]> {
    const rows = await pages<{ dimensions: { ad_id: string; stat_time_day: string }; metrics: Record<string, string> }>(env, "/report/integrated/get/", token(auth), {
      advertiser_id: acc.externalId, report_type: "BASIC", data_level: "AUCTION_AD", dimensions: ["ad_id", "stat_time_day"],
      metrics: ["spend", "impressions", "reach", "clicks", "conversion"], start_date: since, end_date: until,
    });
    return rows.map((r) => ({ adExternalId: r.dimensions.ad_id, date: r.dimensions.stat_time_day.slice(0, 10), spend: num(r.metrics.spend), impressions: num(r.metrics.impressions), reach: num(r.metrics.reach), clicks: num(r.metrics.clicks), link_clicks: num(r.metrics.clicks), conversions: num(r.metrics.conversion), leads: 0, purchases: 0, revenue: 0 }));
  },
  async setCampaignStatus(env, auth, acc, id, status) {
    await tt(env, "/campaign/status/update/", { method: "POST", token: token(auth), body: JSON.stringify({ advertiser_id: acc.externalId, campaign_ids: [id], operation_status: status === "active" ? "ENABLE" : "DISABLE" }) });
  },
  async setCampaignBudget(env, auth, acc, id, daily) {
    await tt(env, "/campaign/update/", { method: "POST", token: token(auth), body: JSON.stringify({ advertiser_id: acc.externalId, campaign_id: id, budget: Math.round(daily * 100) / 100 }) });
  },
};
