/**
 * Google Ads — Google Ads API (REST + GAQL).
 * App do NinePro: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN.
 * Opcionais: GOOGLE_ADS_API_VERSION (padrão v21), GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC).
 * Hierarquia: campanha → grupo de anúncios (conjunto) → anúncio.
 */
import { http, num, PlatformError, type AppCreds, type Delivery, type Env, type NAccount, type Objective, type Provider, type StoredAuth } from "./types.js";

const ver = (env: Env) => env.GOOGLE_ADS_API_VERSION || "v21";
const base = (env: Env) => `https://googleads.googleapis.com/${ver(env)}`;
const SCOPE = "https://www.googleapis.com/auth/adwords";
const digits = (s: string | undefined) => (s ?? "").replace(/\D/g, "");

export function gMapStatus(s?: string): Delivery { return s === "ENABLED" ? "active" : s === "REMOVED" ? "ended" : "paused"; }
export function gMapObjective(channel?: string): Objective {
  switch (channel) {
    case "SHOPPING": case "PERFORMANCE_MAX": return "vendas";
    case "SEARCH": case "SMART": case "LOCAL": case "MULTI_CHANNEL": return "trafego";
    case "DISPLAY": case "VIDEO": case "DISCOVERY": case "DEMAND_GEN": return "reconhecimento";
    default: return "trafego";
  }
}

async function accessToken(app: AppCreds, refreshToken: string) {
  const r = await http<{ access_token: string; expires_in: number }>("Google", "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  }, (s, b) => s === 400 && b.error === "invalid_grant");
  return r.access_token;
}

function headers(auth: StoredAuth, loginCustomerId?: string | null) {
  const h: Record<string, string> = { authorization: `Bearer ${auth.accessToken}`, "developer-token": auth.app?.extra?.developerToken ?? "", "content-type": "application/json" };
  const login = digits(loginCustomerId ?? auth.extra?.loginCustomerId);
  if (login) h["login-customer-id"] = login;
  return h;
}

/** GAQL com paginação (search). */
async function gaql<T>(env: Env, auth: StoredAuth, customerId: string, query: string, login?: string | null): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const r: { results?: T[]; nextPageToken?: string } = await http("Google Ads", `${base(env)}/customers/${digits(customerId)}/googleAds:search`, {
      method: "POST", headers: headers(auth, login), body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
    });
    out.push(...(r.results ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken && out.length < 500_000);
  return out;
}

const devToken = (app: AppCreds) => { const d = app.extra?.developerToken; if (!d) throw new PlatformError("Google Ads: falta o developer token."); return d; };

export const googleProvider: Provider = {
  id: "google",
  label: "Google Ads",
  nineproApp: (env) => (env.GOOGLE_ADS_CLIENT_ID && env.GOOGLE_ADS_CLIENT_SECRET && env.GOOGLE_ADS_DEVELOPER_TOKEN
    ? { appId: env.GOOGLE_ADS_CLIENT_ID, appSecret: env.GOOGLE_ADS_CLIENT_SECRET, extra: { developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN, ...(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? { loginCustomerId: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID } : {}) } } : null),
  scopes: () => [SCOPE],
  appFields: [
    { key: "appId", label: "ID do cliente OAuth", placeholder: "xxxx.apps.googleusercontent.com", pattern: "\\.apps\\.googleusercontent\\.com$", hint: "Google Cloud › APIs e serviços › Credenciais (tipo Aplicativo da Web)" },
    { key: "appSecret", label: "Chave secreta do cliente OAuth", secret: true, placeholder: "GOCSPX-…" },
    { key: "developerToken", label: "Developer token", secret: true, placeholder: "22 caracteres", hint: "Google Ads (conta de administrador) › Administrador › Central de API" },
    { key: "loginCustomerId", label: "ID da conta de administrador (MCC)", placeholder: "123-456-7890", optional: true, hint: "Preencha se acessa as contas por uma MCC." },
  ],
  tokenFields: [
    { key: "appId", label: "ID do cliente OAuth", placeholder: "xxxx.apps.googleusercontent.com" },
    { key: "appSecret", label: "Chave secreta do cliente OAuth", secret: true },
    { key: "developerToken", label: "Developer token", secret: true },
    { key: "refreshToken", label: "Refresh token", secret: true, multiline: true, placeholder: "1//0…", hint: "Gerado com o escopo adwords (por exemplo, no OAuth Playground com o seu cliente)." },
    { key: "loginCustomerId", label: "ID da conta de administrador (MCC)", placeholder: "123-456-7890", optional: true },
  ],
  authorizeUrl(_env, app, redirectUri, state) {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({ client_id: app.appId, redirect_uri: redirectUri, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state }).toString();
    return u.toString();
  },
  async exchangeCode(_env, app, code, redirectUri) {
    devToken(app);
    const r = await http<{ access_token: string; refresh_token?: string; scope?: string }>("Google", "https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    if (!r.refresh_token) throw new PlatformError("O Google não devolveu um refresh token. Remova o acesso do app na sua Conta Google e conecte de novo.");
    const info = await http<{ sub: string; name?: string; email?: string }>("Google", "https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${r.access_token}` } }).catch(() => ({ sub: "google", name: "Conta Google" } as { sub: string; name?: string; email?: string }));
    return { auth: { refreshToken: r.refresh_token, app, extra: (app.extra?.loginCustomerId ? { loginCustomerId: app.extra.loginCustomerId } : {}) as Record<string, string> }, expiresAt: null, user: { id: info.sub, name: info.name ?? info.email ?? "Conta Google" }, scopes: (r.scope ?? SCOPE).split(" ") };
  },
  async fromToken(env, f) {
    const app: AppCreds = { appId: (f.appId ?? "").trim(), appSecret: (f.appSecret ?? "").trim(), extra: { developerToken: (f.developerToken ?? "").trim(), ...(f.loginCustomerId ? { loginCustomerId: digits(f.loginCustomerId) } : {}) } };
    if (!app.appId || !app.appSecret || !app.extra?.developerToken || !(f.refreshToken ?? "").trim()) throw new PlatformError("Preencha o cliente OAuth, o developer token e o refresh token.");
    const auth: StoredAuth = { refreshToken: f.refreshToken.trim(), app, extra: app.extra?.loginCustomerId ? { loginCustomerId: app.extra.loginCustomerId } : {} };
    const ready = await this.ready(env, auth);
    const list = await http<{ resourceNames?: string[] }>("Google Ads", `${base(env)}/customers:listAccessibleCustomers`, { headers: headers(ready) });
    if (!list.resourceNames?.length) throw new PlatformError("Nenhuma conta do Google Ads acessível com essas credenciais.");
    return { auth, expiresAt: null, user: { id: digits(list.resourceNames[0]), name: `Google Ads (${list.resourceNames.length} conta${list.resourceNames.length > 1 ? "s" : ""})` }, scopes: [SCOPE] };
  },
  async ready(_env, auth) {
    if (!auth.app || !auth.refreshToken) throw new PlatformError("Google Ads: conexão incompleta. Conecte de novo.", true);
    return { ...auth, accessToken: await accessToken(auth.app, auth.refreshToken) };
  },
  async accounts(env, auth) {
    const list = await http<{ resourceNames?: string[] }>("Google Ads", `${base(env)}/customers:listAccessibleCustomers`, { headers: headers(auth) });
    const out: NAccount[] = [];
    for (const rn of list.resourceNames ?? []) {
      const id = digits(rn);
      try {
        const [c] = await gaql<{ customer: { id: string; descriptiveName?: string; currencyCode: string; timeZone: string; manager: boolean; status?: string } }>(env, auth, id, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.status FROM customer LIMIT 1", id);
        if (!c) continue;
        if (!c.customer.manager) { out.push({ externalId: id, name: c.customer.descriptiveName || id, currency: c.customer.currencyCode, timezone: c.customer.timeZone, active: c.customer.status !== "CANCELED", parentExternalId: auth.extra?.loginCustomerId ? digits(auth.extra.loginCustomerId) : null }); continue; }
        const kids = await gaql<{ customerClient: { id: string; descriptiveName?: string; currencyCode: string; timeZone: string; manager: boolean; status?: string } }>(env, auth, id,
          "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.manager = FALSE AND customer_client.level <= 2", id);
        for (const k of kids) out.push({ externalId: digits(k.customerClient.id), name: k.customerClient.descriptiveName || k.customerClient.id, currency: k.customerClient.currencyCode, timezone: k.customerClient.timeZone, active: k.customerClient.status === "ENABLED", parentExternalId: id });
      } catch { /* conta sem acesso: ignora */ }
    }
    return [...new Map(out.map((a) => [a.externalId, a])).values()];
  },
  async structure(env, auth, acc) {
    const login = acc.parentExternalId ?? acc.externalId;
    const [c, g, a] = await Promise.all([
      gaql<{ campaign: { id: string; name: string; status: string; advertisingChannelType?: string; startDate?: string }; campaignBudget?: { amountMicros?: string; period?: string } }>(env, auth, acc.externalId,
        "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.start_date, campaign_budget.amount_micros, campaign_budget.period FROM campaign WHERE campaign.status != 'REMOVED'", login),
      gaql<{ adGroup: { id: string; name: string; status: string; type?: string }; campaign: { id: string } }>(env, auth, acc.externalId,
        "SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, campaign.id FROM ad_group WHERE ad_group.status != 'REMOVED'", login),
      gaql<{ adGroupAd: { status: string; ad: { id: string; name?: string; type?: string } }; adGroup: { id: string } }>(env, auth, acc.externalId,
        "SELECT ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group.id FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED'", login),
    ]);
    return {
      campaigns: c.map((x) => ({ externalId: x.campaign.id, name: x.campaign.name, objective: gMapObjective(x.campaign.advertisingChannelType), status: gMapStatus(x.campaign.status), budget: num(x.campaignBudget?.amountMicros) / 1e6, budgetType: x.campaignBudget?.period === "CUSTOM_PERIOD" ? "total" : "diario", startedAt: x.campaign.startDate ?? null })),
      adSets: g.map((x) => ({ externalId: x.adGroup.id, campaignExternalId: x.campaign.id, name: x.adGroup.name, status: gMapStatus(x.adGroup.status), audience: x.adGroup.type ?? null })),
      ads: a.map((x) => ({ externalId: x.adGroupAd.ad.id, adSetExternalId: x.adGroup.id, name: x.adGroupAd.ad.name || `${(x.adGroupAd.ad.type ?? "Anúncio").replace(/_/g, " ").toLowerCase()} ${x.adGroupAd.ad.id}`, status: gMapStatus(x.adGroupAd.status), format: /VIDEO/.test(x.adGroupAd.ad.type ?? "") ? "Vídeo" : "Imagem", thumbnail: null })),
    };
  },
  async insights(env, auth, acc, since, until) {
    const rows = await gaql<{ adGroupAd: { ad: { id: string } }; segments: { date: string }; metrics: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number | string; conversionsValue?: number | string } }>(env, auth, acc.externalId,
      `SELECT ad_group_ad.ad.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM ad_group_ad WHERE segments.date BETWEEN '${since}' AND '${until}'`, acc.parentExternalId ?? acc.externalId);
    return rows.map((r) => {
      const conv = num(r.metrics.conversions);
      return { adExternalId: r.adGroupAd.ad.id, date: r.segments.date, spend: num(r.metrics.costMicros) / 1e6, impressions: num(r.metrics.impressions), reach: 0, clicks: num(r.metrics.clicks), link_clicks: num(r.metrics.clicks), conversions: conv, leads: 0, purchases: conv, revenue: num(r.metrics.conversionsValue) };
    });
  },
  async setCampaignStatus(env, auth, acc, id, status) {
    await http("Google Ads", `${base(env)}/customers/${digits(acc.externalId)}/campaigns:mutate`, {
      method: "POST", headers: headers(auth, acc.parentExternalId ?? acc.externalId),
      body: JSON.stringify({ operations: [{ update: { resourceName: `customers/${digits(acc.externalId)}/campaigns/${id}`, status: status === "active" ? "ENABLED" : "PAUSED" }, updateMask: "status" }] }),
    });
  },
};
