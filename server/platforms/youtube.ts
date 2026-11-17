/**
 * YouTube — YouTube Data API v3 (envio retomável). App do NinePro: YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET
 * (ou o mesmo cliente OAuth do Google Ads, com a YouTube Data API ativada no projeto).
 * Publica um vídeo por vez (vídeo vertical de até 3 minutos vira Short). Título obrigatório (até 100).
 * Atenção: projetos do Google não auditados só podem enviar vídeos como privados.
 */
import { download, http, PlatformError, type ChannelProvider, type Env, type ExchangeResult, type StoredAuth } from "./types.js";

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly", "openid", "email"];
const creds = (env: Env, a?: StoredAuth) => ({ id: a?.extra?.clientId || env.YOUTUBE_CLIENT_ID || env.GOOGLE_ADS_CLIENT_ID || "", secret: a?.extra?.clientSecret || env.YOUTUBE_CLIENT_SECRET || env.GOOGLE_ADS_CLIENT_SECRET || "" });
const bearer = (a: StoredAuth) => ({ authorization: `Bearer ${a.accessToken}` });
const yt = <T>(a: StoredAuth, url: string, init?: RequestInit) => http<T>("YouTube", url, { ...init, headers: { ...bearer(a), ...(init?.headers as Record<string, string> | undefined) } });

async function refresh(id: string, secret: string, refreshToken: string) {
  return http<{ access_token: string; expires_in: number }>("YouTube", "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refreshToken, grant_type: "refresh_token" }) }, (s, b) => s === 400 && b.error === "invalid_grant");
}
async function result(accessToken: string, refreshToken: string, extra: Record<string, string>): Promise<ExchangeResult> {
  const a: StoredAuth = { accessToken };
  const r = await yt<{ items?: { id: string; snippet: { title: string } }[] }>(a, "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true");
  const ch = r.items?.[0];
  if (!ch) throw new PlatformError("Essa conta do Google não tem canal no YouTube. Crie o canal e conecte de novo.");
  return { auth: { accessToken, refreshToken, extra: { ...extra, refreshedAt: new Date().toISOString() } }, expiresAt: null, user: { id: ch.id, name: ch.snippet.title }, scopes: SCOPES };
}

export const youtubeProvider: ChannelProvider = {
  id: "youtube",
  label: "YouTube",
  limits: { text: 5000, images: 0, videos: 1, textOnly: false, mixed: false, needsMedia: "video", needsTitle: true, titleMax: 100 },
  nineproApp: (env) => { const c = creds(env); return c.id && c.secret ? { appId: c.id, appSecret: c.secret } : null; },
  scopes: () => SCOPES,
  appFields: [
    { key: "appId", label: "ID do cliente OAuth", placeholder: "123-abc.apps.googleusercontent.com", hint: "Google Cloud › APIs e serviços › Credenciais (tipo Aplicativo da Web, com a YouTube Data API v3 ativada)" },
    { key: "appSecret", label: "Chave secreta do cliente", secret: true },
  ],
  tokenFields: [
    { key: "appId", label: "ID do cliente OAuth", placeholder: "123-abc.apps.googleusercontent.com" },
    { key: "appSecret", label: "Chave secreta do cliente", secret: true },
    { key: "refreshToken", label: "Refresh token", secret: true, multiline: true, hint: "Gerado no OAuth Playground com o seu cliente e o escopo youtube.upload." },
  ],
  authorizeUrl(_env, app, redirectUri, state) {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({ client_id: app.appId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state }).toString();
    return u.toString();
  },
  async exchangeCode(_env, app, code, redirectUri) {
    const r = await http<{ access_token: string; refresh_token?: string }>("YouTube", "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: app.appId, client_secret: app.appSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
    if (!r.refresh_token) throw new PlatformError("O Google não devolveu acesso permanente. Remova o NinePro em myaccount.google.com/permissions e conecte de novo.");
    return result(r.access_token, r.refresh_token, { clientId: app.appId, clientSecret: app.appSecret });
  },
  async fromToken(_env, f) {
    const r = await refresh(f.appId.trim(), f.appSecret.trim(), f.refreshToken.trim());
    return result(r.access_token, f.refreshToken.trim(), { clientId: f.appId.trim(), clientSecret: f.appSecret.trim() });
  },
  /** O acesso do Google dura 1 hora; renova depois de 50 minutos. */
  async ready(env, auth) {
    const at = Date.parse(auth.extra?.refreshedAt ?? "");
    if (auth.accessToken && Number.isFinite(at) && Date.now() - at < 50 * 60_000) return auth;
    if (!auth.refreshToken) throw new PlatformError("YouTube: conexão sem acesso permanente. Conecte de novo.", true);
    const c = creds(env, auth);
    const r = await refresh(c.id, c.secret, auth.refreshToken);
    return { ...auth, accessToken: r.access_token, extra: { ...auth.extra, refreshedAt: new Date().toISOString() } };
  },
  async discover(_env, auth) {
    const r = await yt<{ items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } }; statistics?: { subscriberCount?: string; videoCount?: string } }[] }>(auth, "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true");
    return (r.items ?? []).map((c) => ({ externalId: c.id, name: c.snippet.customUrl ?? c.snippet.title, displayName: c.snippet.title, picture: c.snippet.thumbnails?.default?.url ?? null, status: "ativo", detail: { seguidores: c.statistics?.subscriberCount ? Number(c.statistics.subscriberCount) : null, publicacoes: c.statistics?.videoCount ? Number(c.statistics.videoCount) : null } }));
  },
  async subscribe() { return null; },
  async publish(_env, auth, _account, p) {
    const video = p.media.find((m) => m.type === "video");
    if (!video) throw new PlatformError("YouTube: adicione um vídeo.");
    const title = (p.title || p.text.split("\n")[0] || "").replace(/[<>]/g, "").trim().slice(0, 100);
    if (!title) throw new PlatformError("YouTube: informe o título do vídeo.");
    const f = await download("YouTube", video.url, 1_500_000_000);
    const meta = { snippet: { title, description: p.text.replace(/[<>]/g, "").slice(0, 5000), categoryId: "22", defaultLanguage: "pt-BR" }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false } };
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { method: "POST", headers: { ...bearer(auth), "content-type": "application/json; charset=UTF-8", "x-upload-content-length": String(f.size), "x-upload-content-type": f.type }, body: JSON.stringify(meta) });
    if (!init.ok) { const b = (await init.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } }; throw new PlatformError(b.error?.errors?.[0]?.reason === "quotaExceeded" ? "YouTube: cota diária da API esgotada. Tente amanhã." : `YouTube: ${b.error?.message ?? `HTTP ${init.status}`}`, init.status === 401); }
    const location = init.headers.get("location");
    if (!location) throw new PlatformError("YouTube não abriu o envio do vídeo.");
    const up = await fetch(location, { method: "PUT", headers: { ...bearer(auth), "content-type": f.type, "content-length": String(f.size) }, body: f.bytes as BodyInit });
    const v = (await up.json().catch(() => ({}))) as { id?: string; status?: { privacyStatus?: string }; error?: { message?: string } };
    if (!up.ok || !v.id) throw new PlatformError(`YouTube: ${v.error?.message ?? `falha no envio (HTTP ${up.status})`}`);
    return { id: v.id, permalink: `https://www.youtube.com/watch?v=${v.id}`, aviso: v.status?.privacyStatus === "private" ? "O YouTube deixou o vídeo privado: o projeto do Google ainda não passou pela auditoria da API." : undefined };
  },
};
