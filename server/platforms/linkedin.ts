/**
 * LinkedIn Ads — LinkedIn Marketing API (REST versionada, Rest.li 2.0).
 * App do NinePro: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET. Opcional: LINKEDIN_API_VERSION (AAAAMM, padrão 202606).
 * Mapeamento: grupo de campanhas → campanha; campanha → conjunto; criativo → anúncio.
 */
import { http, num, PlatformError, type Delivery, type Env, type NInsight, type Objective, type Provider, type StoredAuth } from "./types.js";

const API = "https://api.linkedin.com/rest";
const SCOPES = ["r_ads", "r_ads_reporting", "rw_ads"];
const enc = (urn: string) => urn.replace(/:/g, "%3A");
const idOf = (urn: string | number) => String(urn).split(":").pop()!;

export function liMapStatus(s?: string): Delivery {
  switch (s) {
    case "ACTIVE": return "active";
    case "PAUSED": case "DRAFT": return "paused";
    case "ARCHIVED": case "CANCELED": case "COMPLETED": case "REMOVED": case "PENDING_DELETION": return "ended";
    default: return "paused";
  }
}
export function liMapObjective(o?: string): Objective {
  switch (o) {
    case "WEBSITE_CONVERSION": case "TALENT_LEADS": return "vendas";
    case "LEAD_GENERATION": return "leads";
    case "WEBSITE_VISIT": case "WEBSITE_VISITS": case "JOB_APPLICANT": return "trafego";
    default: return "reconhecimento";
  }
}

function hdr(env: Env, auth: StoredAuth, extra: Record<string, string> = {}) {
  if (!auth.accessToken) throw new PlatformError("LinkedIn: conexão sem token. Conecte de novo.", true);
  return { authorization: `Bearer ${auth.accessToken}`, "LinkedIn-Version": env.LINKEDIN_API_VERSION || "202606", "X-Restli-Protocol-Version": "2.0.0", "content-type": "application/json", ...extra };
}
/** Rest.li: os parâmetros com List()/() não podem ter parênteses codificados, então a query é montada à mão. */
async function li<T>(env: Env, auth: StoredAuth, pathAndQuery: string, init?: RequestInit): Promise<T> {
  return http<T>("LinkedIn", `${API}${pathAndQuery}`, { ...init, headers: { ...hdr(env, auth), ...(init?.headers as Record<string, string> | undefined) } });
}
async function search<T>(env: Env, auth: StoredAuth, pathAndQuery: string): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 100; i++) {
    const r = await li<{ elements?: T[]; metadata?: { nextPageToken?: string } }>(env, auth, `${pathAndQuery}&pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
    out.push(...(r.elements ?? []));
    pageToken = r.metadata?.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}
const day = (s: string) => { const [y, m, d] = s.split("-").map(Number); return `(year:${y},month:${m},day:${d})`; };

export const linkedinProvider: Provider = {
  id: "linkedin",
  label: "LinkedIn Ads",
  nineproApp: (env) => (env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET ? { appId: env.LINKEDIN_CLIENT_ID, appSecret: env.LINKEDIN_CLIENT_SECRET } : null),
  scopes: () => SCOPES,
  appFields: [
    { key: "appId", label: "Client ID", placeholder: "86abc123xyz", hint: "LinkedIn Developers › seu app › Auth (o app precisa do produto Advertising API)" },
    { key: "appSecret", label: "Client secret", secret: true },
  ],
  tokenFields: [{ key: "accessToken", label: "Token de acesso", secret: true, multiline: true, hint: "Gerado no LinkedIn Developers › Token generator com r_ads, r_ads_reporting e rw_ads. Vale 60 dias." }],
  authorizeUrl(_env, app, redirectUri, state) {
    const u = new URL("https://www.linkedin.com/oauth/v2/authorization");
    u.search = new URLSearchParams({ response_type: "code", client_id: app.appId, redirect_uri: redirectUri, state, scope: SCOPES.join(" ") }).toString();
    return u.toString();
  },
  async exchangeCode(env, app, code, redirectUri) {
    const r = await http<{ access_token: string; expires_in: number; refresh_token?: string; scope?: string }>("LinkedIn", "https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: app.appId, client_secret: app.appSecret }),
    });
    const auth: StoredAuth = { accessToken: r.access_token, ...(r.refresh_token ? { refreshToken: r.refresh_token, app } : {}) };
    const accs = await this.accounts(env, auth);
    return { auth, expiresAt: new Date(Date.now() + r.expires_in * 1000).toISOString(), user: { id: accs[0]?.externalId ?? "linkedin", name: `LinkedIn (${accs.length} conta${accs.length === 1 ? "" : "s"})` }, scopes: (r.scope ?? SCOPES.join(",")).split(/[ ,]/) };
  },
  async fromToken(env, f) {
    const t = (f.accessToken ?? "").trim();
    if (t.length < 30 || /\s/.test(t)) throw new PlatformError("Cole o token completo, sem espaços.");
    const auth: StoredAuth = { accessToken: t };
    const accs = await this.accounts(env, auth);
    if (!accs.length) throw new PlatformError("Nenhuma conta de anúncios acessível com esse token.");
    return { auth, expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString(), user: { id: accs[0].externalId, name: accs[0].name }, scopes: SCOPES };
  },
  async ready(_env, auth) {
    if (!auth.refreshToken || !auth.app) return auth;
    const r = await http<{ access_token: string; refresh_token?: string }>("LinkedIn", "https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: auth.refreshToken, client_id: auth.app.appId, client_secret: auth.app.appSecret }),
    }).catch(() => null);
    return r ? { ...auth, accessToken: r.access_token, refreshToken: r.refresh_token ?? auth.refreshToken } : auth;
  },
  async accounts(env, auth) {
    const rows = await search<{ id: number; name: string; currency: string; status: string }>(env, auth, "/adAccounts?q=search&search=(status:(values:List(ACTIVE,DRAFT,CANCELED)))");
    return rows.map((a) => ({ externalId: String(a.id), name: a.name, currency: a.currency, timezone: "UTC", active: a.status === "ACTIVE" }));
  },
  async structure(env, auth, acc) {
    const statuses = "search=(status:(values:List(ACTIVE,PAUSED,DRAFT,COMPLETED)))";
    const [groups, camps, creatives] = await Promise.all([
      search<{ id: number; name: string; status: string; totalBudget?: { amount: string }; runSchedule?: { start?: number } }>(env, auth, `/adAccounts/${acc.externalId}/adCampaignGroups?q=search&${statuses}`),
      search<{ id: number; name: string; status: string; campaignGroup: string; objectiveType?: string; dailyBudget?: { amount: string } }>(env, auth, `/adAccounts/${acc.externalId}/adCampaigns?q=search&${statuses}`),
      li<{ elements?: { id: string; name?: string; campaign: string; intendedStatus?: string; content?: Record<string, unknown> }[] }>(env, auth, `/adAccounts/${acc.externalId}/creatives?q=criteria&pageSize=100`).then((r) => r.elements ?? []),
    ]);
    const objByGroup = new Map<string, string | undefined>();
    const dailyByGroup = new Map<string, number>();
    for (const c of camps) {
      const g = idOf(c.campaignGroup);
      if (!objByGroup.has(g)) objByGroup.set(g, c.objectiveType);
      dailyByGroup.set(g, (dailyByGroup.get(g) ?? 0) + num(c.dailyBudget?.amount));
    }
    return {
      campaigns: groups.map((g) => {
        const gid = String(g.id);
        const total = num(g.totalBudget?.amount);
        return { externalId: gid, name: g.name, objective: liMapObjective(objByGroup.get(gid)), status: liMapStatus(g.status), budget: total || dailyByGroup.get(gid) || 0, budgetType: total ? "total" : "diario", startedAt: g.runSchedule?.start ? new Date(g.runSchedule.start).toISOString().slice(0, 10) : null };
      }),
      adSets: camps.map((c) => ({ externalId: String(c.id), campaignExternalId: idOf(c.campaignGroup), name: c.name, status: liMapStatus(c.status), audience: c.objectiveType ?? null })),
      ads: creatives.map((c) => ({ externalId: idOf(c.id), adSetExternalId: idOf(c.campaign), name: c.name || `Criativo ${idOf(c.id)}`, status: liMapStatus(c.intendedStatus), format: c.content && "media" in c.content ? "Imagem" : "Imagem", thumbnail: null })),
    };
  },
  async insights(env, auth, acc, since, until): Promise<NInsight[]> {
    const r = await li<{ elements?: { pivotValues: string[]; dateRange: { start: { year: number; month: number; day: number } }; costInLocalCurrency?: string; impressions?: number; clicks?: number; landingPageClicks?: number; externalWebsiteConversions?: number; oneClickLeads?: number; conversionValueInLocalCurrency?: string }[] }>(env, auth,
      `/adAnalytics?q=analytics&pivot=CREATIVE&timeGranularity=DAILY&dateRange=(start:${day(since)},end:${day(until)})&accounts=List(${enc(`urn:li:sponsoredAccount:${acc.externalId}`)})&fields=pivotValues,dateRange,costInLocalCurrency,impressions,clicks,landingPageClicks,externalWebsiteConversions,oneClickLeads,conversionValueInLocalCurrency`);
    return (r.elements ?? []).map((e) => {
      const s = e.dateRange.start;
      const purchases = num(e.externalWebsiteConversions), leads = num(e.oneClickLeads);
      return { adExternalId: idOf(e.pivotValues[0] ?? ""), date: `${s.year}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`, spend: num(e.costInLocalCurrency), impressions: num(e.impressions), reach: 0, clicks: num(e.clicks), link_clicks: num(e.landingPageClicks), conversions: purchases + leads, leads, purchases, revenue: num(e.conversionValueInLocalCurrency) };
    });
  },
  async setCampaignStatus(env, auth, acc, id, status) {
    await li(env, auth, `/adAccounts/${acc.externalId}/adCampaignGroups/${id}`, { method: "POST", headers: { "X-RestLi-Method": "PARTIAL_UPDATE" }, body: JSON.stringify({ patch: { $set: { status: status === "active" ? "ACTIVE" : "PAUSED" } } }) });
  },
};
