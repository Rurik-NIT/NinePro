/**
 * Google Meu Negócio (Google Business Profile) — publicações locais (novidade, evento, oferta).
 * App do NinePro: GOOGLE_BUSINESS_CLIENT_ID / GOOGLE_BUSINESS_CLIENT_SECRET (ou o cliente do YouTube/Google Ads),
 * com as APIs "My Business Account Management", "My Business Business Information" e "Google My Business" ativadas.
 * Atenção: o Google libera essas APIs por pedido (a cota começa em zero até a aprovação).
 */
import { http, optStr, PlatformError, type ChannelProvider, type Env, type ExchangeResult, type StoredAuth } from "./types.js";

const SCOPES = ["https://www.googleapis.com/auth/business.manage", "openid", "email"];
const creds = (env: Env, a?: StoredAuth) => ({
  id: a?.extra?.clientId || env.GOOGLE_BUSINESS_CLIENT_ID || env.YOUTUBE_CLIENT_ID || env.GOOGLE_ADS_CLIENT_ID || "",
  secret: a?.extra?.clientSecret || env.GOOGLE_BUSINESS_CLIENT_SECRET || env.YOUTUBE_CLIENT_SECRET || env.GOOGLE_ADS_CLIENT_SECRET || "",
});
const g = <T>(a: StoredAuth, url: string, init?: RequestInit) => http<T>("Google Meu Negócio", url, { ...init, headers: { authorization: `Bearer ${a.accessToken}`, ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers as Record<string, string> | undefined) } }, (s, b) => s === 401 || (b.error as { status?: string } | undefined)?.status === "UNAUTHENTICATED");
async function refresh(id: string, secret: string, refreshToken: string) {
  return http<{ access_token: string }>("Google Meu Negócio", "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refreshToken, grant_type: "refresh_token" }) }, (s, b) => s === 400 && b.error === "invalid_grant");
}
async function result(accessToken: string, refreshToken: string, extra: Record<string, string>): Promise<ExchangeResult> {
  const u = await http<{ sub: string; email?: string }>("Google", "https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${accessToken}` } }).catch(() => ({ sub: "google", email: undefined }));
  return { auth: { accessToken, refreshToken, extra: { ...extra, refreshedAt: new Date().toISOString() } }, expiresAt: null, user: { id: u.sub, name: u.email ?? "Google" }, scopes: SCOPES };
}
const parts = (iso: string) => { const d = new Date(iso); const z = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })); return { date: { year: z.getFullYear(), month: z.getMonth() + 1, day: z.getDate() }, time: { hours: z.getHours(), minutes: z.getMinutes() } }; };

export const googleBusinessProvider: ChannelProvider = {
  id: "google_business",
  label: "Google Meu Negócio",
  limits: { text: 1500, images: 1, videos: 0, textOnly: true, mixed: false },
  nineproApp: (env) => { const c = creds(env); return c.id && c.secret ? { appId: c.id, appSecret: c.secret } : null; },
  scopes: () => SCOPES,
  appFields: [
    { key: "appId", label: "ID do cliente OAuth", placeholder: "123-abc.apps.googleusercontent.com", hint: "Google Cloud › Credenciais (Aplicativo da Web), com as APIs do Business Profile liberadas" },
    { key: "appSecret", label: "Chave secreta do cliente", secret: true },
  ],
  tokenFields: [
    { key: "appId", label: "ID do cliente OAuth" },
    { key: "appSecret", label: "Chave secreta do cliente", secret: true },
    { key: "refreshToken", label: "Refresh token", secret: true, multiline: true, hint: "Gerado no OAuth Playground com o escopo business.manage." },
  ],
  authorizeUrl(_env, app, redirectUri, state) {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({ client_id: app.appId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state }).toString();
    return u.toString();
  },
  async exchangeCode(_env, app, code, redirectUri) {
    const r = await http<{ access_token: string; refresh_token?: string }>("Google", "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: app.appId, client_secret: app.appSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
    if (!r.refresh_token) throw new PlatformError("O Google não devolveu acesso permanente. Remova o NinePro em myaccount.google.com/permissions e conecte de novo.");
    return result(r.access_token, r.refresh_token, { clientId: app.appId, clientSecret: app.appSecret });
  },
  async fromToken(_env, f) {
    const r = await refresh(f.appId.trim(), f.appSecret.trim(), f.refreshToken.trim());
    return result(r.access_token, f.refreshToken.trim(), { clientId: f.appId.trim(), clientSecret: f.appSecret.trim() });
  },
  async ready(env, auth) {
    const at = Date.parse(auth.extra?.refreshedAt ?? "");
    if (auth.accessToken && Number.isFinite(at) && Date.now() - at < 50 * 60_000) return auth;
    if (!auth.refreshToken) throw new PlatformError("Google Meu Negócio: conexão sem acesso permanente. Conecte de novo.", true);
    const c = creds(env, auth);
    const r = await refresh(c.id, c.secret, auth.refreshToken);
    return { ...auth, accessToken: r.access_token, extra: { ...auth.extra, refreshedAt: new Date().toISOString() } };
  },
  async discover(_env, auth) {
    const accs = await g<{ accounts?: { name: string; accountName?: string }[] }>(auth, "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20");
    const out = [];
    for (const a of accs.accounts ?? []) {
      const locs = await g<{ locations?: { name: string; title?: string; storefrontAddress?: { locality?: string }; metadata?: { mapsUri?: string; newReviewUri?: string } }[] }>(auth, `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title,storefrontAddress,metadata&pageSize=100`).catch(() => ({ locations: [] }));
      for (const l of locs.locations ?? []) out.push({ externalId: `${a.name}/${l.name}`, name: l.title ?? l.name, displayName: [a.accountName, l.storefrontAddress?.locality].filter(Boolean).join(" · ") || null, status: "ativo", detail: { link: l.metadata?.mapsUri ?? null, conta: a.name } });
    }
    return out;
  },
  async subscribe() { return null; },
  async accountStats(_env, auth, account) {
    const loc = account.externalId.split("/").slice(-2).join("/");
    const d = new Date(Date.now() - 86_400_000);
    const day = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    const metrics = ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS"];
    const qs = new URLSearchParams(); for (const m of metrics) qs.append("dailyMetrics", m);
    for (const [k, v] of Object.entries(day)) { qs.set(`dailyRange.start_date.${k}`, String(v)); qs.set(`dailyRange.end_date.${k}`, String(v)); }
    type S = { multiDailyMetricTimeSeries?: { dailyMetricTimeSeries?: { dailyMetric: string; timeSeries?: { datedValues?: { value?: string }[] } }[] }[] };
    const r = await g<S>(auth, `https://businessprofileperformance.googleapis.com/v1/${loc}:fetchMultiDailyMetricsTimeSeries?${qs}`);
    const val = (m: string) => (r.multiDailyMetricTimeSeries ?? []).flatMap((x) => x.dailyMetricTimeSeries ?? []).filter((x) => x.dailyMetric === m).flatMap((x) => x.timeSeries?.datedValues ?? []).reduce((s, x) => s + Number(x.value ?? 0), 0);
    return { impressions: metrics.slice(0, 4).reduce((s, m) => s + val(m), 0), extra: { ligacoes: val("CALL_CLICKS"), cliques_no_site: val("WEBSITE_CLICKS"), pedidos_de_rota: val("BUSINESS_DIRECTION_REQUESTS") } };
  },
  async publish(_env, auth, account, p) {
    const o = p.options;
    const type = optStr(o, "tipo") || "STANDARD";
    const body: Record<string, unknown> = { languageCode: "pt-BR", summary: p.text.slice(0, 1500), topicType: type };
    const img = p.media.find((m) => m.type === "image");
    if (img) body.media = [{ mediaFormat: "PHOTO", sourceUrl: img.url }];
    const btn = optStr(o, "botao");
    if (btn && btn !== "nenhum") body.callToAction = btn === "CALL" ? { actionType: "CALL" } : { actionType: btn, url: optStr(o, "botao_url") };
    if (type === "EVENT" || type === "OFFER") {
      const s = parts(optStr(o, "evento_inicio")), e = parts(optStr(o, "evento_fim"));
      body.event = { title: optStr(o, "evento_titulo").slice(0, 58), schedule: { startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time } };
    }
    if (type === "OFFER") body.offer = { ...(optStr(o, "cupom") ? { couponCode: optStr(o, "cupom") } : {}), ...(optStr(o, "link_oferta") ? { redeemOnlineUrl: optStr(o, "link_oferta") } : {}), ...(optStr(o, "termos") ? { termsConditions: optStr(o, "termos") } : {}) };
    if (!p.text.trim() && !img) throw new PlatformError("Google Meu Negócio: escreva um texto ou adicione uma foto.");
    const r = await g<{ name: string; searchUrl?: string }>(auth, `https://mybusiness.googleapis.com/v4/${account.externalId}/localPosts`, { method: "POST", body: JSON.stringify(body) }).catch((e) => {
      throw new PlatformError(/quota|has not been used|disabled/i.test((e as Error).message) ? "Google Meu Negócio: a API ainda não foi liberada para o projeto do Google (peça acesso ao Business Profile API)." : (e as Error).message, (e as PlatformError).expired);
    });
    return { id: r.name, permalink: r.searchUrl ?? (account.detail.link as string | null) ?? null };
  },
};
