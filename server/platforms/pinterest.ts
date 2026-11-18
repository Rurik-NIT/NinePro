/**
 * Pinterest — API v5. App do NinePro: PINTEREST_APP_ID / PINTEREST_APP_SECRET.
 * Publica pins de imagem (1 a 5 fotos) ou de vídeo numa pasta (board). Título até 100, descrição até 800.
 * Apps em "Trial access" só criam pins visíveis para a própria conta até o Pinterest liberar o acesso padrão.
 */
import { download, http, optStr, PlatformError, sleep, type PostStat, type ChannelProvider, type Env, type ExchangeResult, type StoredAuth } from "./types.js";

const API = "https://api.pinterest.com/v5";
const SCOPES = ["boards:read", "boards:write", "pins:read", "pins:write", "user_accounts:read"];
const creds = (env: Env, a?: StoredAuth) => ({ id: a?.extra?.clientId || env.PINTEREST_APP_ID || "", secret: a?.extra?.clientSecret || env.PINTEREST_APP_SECRET || "" });
const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
const pin = <T>(a: StoredAuth, path: string, init?: RequestInit) => http<T>("Pinterest", `${API}${path}`, { ...init, headers: { authorization: `Bearer ${a.accessToken}`, ...(init?.body && typeof init.body === "string" ? { "content-type": "application/json" } : {}), ...(init?.headers as Record<string, string> | undefined) } });
interface Tokens { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }
const token = (id: string, secret: string, body: Record<string, string>) => http<Tokens>("Pinterest", `${API}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic(id, secret) }, body: new URLSearchParams(body) }, (s) => s === 401);
interface Board { id: string; name: string; privacy?: string }

async function boards(a: StoredAuth) {
  const r = await pin<{ items?: Board[] }>(a, "/boards?page_size=100").catch(() => ({ items: [] as Board[] }));
  return (r.items ?? []).map((b) => ({ id: b.id, nome: b.name, secreta: b.privacy === "SECRET" }));
}
async function result(t: Tokens, refreshToken: string | undefined, extra: Record<string, string>): Promise<ExchangeResult> {
  const me = await pin<{ username: string; id?: string }>({ accessToken: t.access_token }, "/user_account");
  return { auth: { accessToken: t.access_token, refreshToken: t.refresh_token ?? refreshToken, extra: { ...extra, refreshedAt: new Date().toISOString() } }, expiresAt: null, user: { id: me.id ?? me.username, name: me.username }, scopes: (t.scope ?? SCOPES.join(",")).split(/[ ,]+/) };
}

export const pinterestProvider: ChannelProvider = {
  id: "pinterest",
  label: "Pinterest",
  limits: { text: 800, images: 5, videos: 1, textOnly: false, mixed: false, titleMax: 100 },
  nineproApp: (env) => { const c = creds(env); return c.id && c.secret ? { appId: c.id, appSecret: c.secret } : null; },
  scopes: () => SCOPES,
  appFields: [
    { key: "appId", label: "App ID", placeholder: "1234567", hint: "developers.pinterest.com › My apps › seu app" },
    { key: "appSecret", label: "App secret key", secret: true },
  ],
  tokenFields: [
    { key: "appId", label: "App ID" },
    { key: "appSecret", label: "App secret key", secret: true },
    { key: "refreshToken", label: "Refresh token", secret: true, multiline: true, hint: "Gerado pelo login OAuth do seu app (vale 1 ano)." },
  ],
  authorizeUrl(_env, app, redirectUri, state) {
    const u = new URL("https://www.pinterest.com/oauth/");
    u.search = new URLSearchParams({ client_id: app.appId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(","), state }).toString();
    return u.toString();
  },
  async exchangeCode(_env, app, code, redirectUri) {
    const t = await token(app.appId, app.appSecret, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
    return result(t, undefined, { clientId: app.appId, clientSecret: app.appSecret });
  },
  async fromToken(_env, f) {
    const t = await token(f.appId.trim(), f.appSecret.trim(), { grant_type: "refresh_token", refresh_token: f.refreshToken.trim() });
    return result(t, f.refreshToken.trim(), { clientId: f.appId.trim(), clientSecret: f.appSecret.trim() });
  },
  /** Acesso dura 30 dias; renova a cada 20. */
  async ready(env, auth) {
    const at = Date.parse(auth.extra?.refreshedAt ?? "");
    if (auth.accessToken && Number.isFinite(at) && Date.now() - at < 20 * 86_400_000) return auth;
    const c = creds(env, auth);
    const t = await token(c.id, c.secret, { grant_type: "refresh_token", refresh_token: auth.refreshToken ?? "" }).catch((e) => { throw new PlatformError(`Pinterest: ${(e as Error).message}. Conecte de novo.`, true); });
    return { ...auth, accessToken: t.access_token, refreshToken: t.refresh_token ?? auth.refreshToken, extra: { ...auth.extra, refreshedAt: new Date().toISOString() } };
  },
  async discover(_env, auth) {
    const me = await pin<{ username: string; id?: string; profile_image?: string; follower_count?: number; pin_count?: number; business_name?: string }>(auth, "/user_account");
    const pastas = await boards(auth);
    return [{ externalId: me.id ?? me.username, name: me.username, displayName: me.business_name ?? null, picture: me.profile_image ?? null, status: pastas.length ? "ativo" : "erro", detail: { usuario: me.username, seguidores: me.follower_count ?? null, publicacoes: me.pin_count ?? null, pastas, ...(pastas.length ? {} : { aviso: "Crie uma pasta no Pinterest para poder publicar." }) } }];
  },
  async subscribe() { return null; },
  async stats(_env, auth, _account, limit) {
    type P = { id: string; title?: string; description?: string; created_at?: string; media?: { media_type?: string; images?: Record<string, { url: string }> } };
    const r = await pin<{ items?: P[] }>(auth, `/pins?page_size=${Math.min(limit, 100)}`);
    const end = new Date().toISOString().slice(0, 10), start = new Date(Date.now() - 89 * 86_400_000).toISOString().slice(0, 10);
    const out: PostStat[] = [];
    for (const p of r.items ?? []) {
      const a = await pin<{ all?: { lifetime_metrics?: Record<string, number>; summary_metrics?: Record<string, number> } }>(auth, `/pins/${p.id}/analytics?start_date=${start}&end_date=${end}&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK`).catch(() => null);
      const m = a?.all?.lifetime_metrics ?? a?.all?.summary_metrics ?? {};
      out.push({ id: p.id, text: p.description || p.title || null, permalink: `https://www.pinterest.com/pin/${p.id}/`, thumbnail: p.media?.images?.["600x"]?.url ?? p.media?.images?.["400x300"]?.url ?? null, type: p.media?.media_type ?? "image", postedAt: p.created_at ?? null, saves: m.SAVE ?? null, impressions: m.IMPRESSION ?? null, clicks: m.PIN_CLICK != null || m.OUTBOUND_CLICK != null ? (m.PIN_CLICK ?? 0) + (m.OUTBOUND_CLICK ?? 0) : null, likes: 0, comments: 0 });
    }
    return out;
  },
  async accountStats(_env, auth) {
    const me = await pin<{ follower_count?: number; following_count?: number; pin_count?: number; monthly_views?: number }>(auth, "/user_account");
    return { followers: me.follower_count ?? null, following: me.following_count ?? null, posts: me.pin_count ?? null, extra: { visualizacoes_mensais: me.monthly_views ?? null } };
  },
  async publish(_env, auth, account, p) {
    const o = p.options;
    const pastas = (account.detail.pastas as { id: string }[] | undefined) ?? [];
    const board = optStr(o, "pasta") || pastas[0]?.id || (await boards(auth))[0]?.id;
    if (!board) throw new PlatformError("Pinterest: a conta não tem pastas. Crie uma pasta e tente de novo.");
    const images = p.media.filter((m) => m.type === "image").slice(0, 5);
    const video = p.media.find((m) => m.type === "video");
    let media_source: Record<string, unknown>;
    if (video) {
      const reg = await pin<{ media_id: string; upload_url: string; upload_parameters: Record<string, string> }>(auth, "/media", { method: "POST", body: JSON.stringify({ media_type: "video" }) });
      const f = await download("Pinterest", video.url, 2_000_000_000);
      const fd = new FormData();
      for (const [k, v] of Object.entries(reg.upload_parameters ?? {})) fd.set(k, v);
      fd.set("file", new Blob([f.bytes as BlobPart], { type: f.type }), f.name);
      const up = await fetch(reg.upload_url, { method: "POST", body: fd });
      if (!up.ok) throw new PlatformError(`Pinterest: falha no envio do vídeo (HTTP ${up.status}).`);
      for (let i = 0; i < 60; i++) {
        const s = await pin<{ status?: string }>(auth, `/media/${reg.media_id}`);
        if (s.status === "succeeded") break;
        if (s.status === "failed") throw new PlatformError("Pinterest não conseguiu processar o vídeo.");
        await sleep(3000);
      }
      media_source = { source_type: "video_id", media_id: reg.media_id, cover_image_key_frame_time: 1 };
    } else if (images.length > 1) media_source = { source_type: "multiple_image_urls", items: images.map((m) => ({ url: m.url })) };
    else if (images.length) media_source = { source_type: "image_url", url: images[0].url };
    else throw new PlatformError("Pinterest: adicione uma imagem ou um vídeo.");
    const title = (p.title || p.text.split("\n")[0] || "").slice(0, 100);
    const r = await pin<{ id: string }>(auth, "/pins", { method: "POST", body: JSON.stringify({ board_id: board, ...(title ? { title } : {}), description: p.text.slice(0, 800), ...(optStr(o, "link") ? { link: optStr(o, "link") } : {}), ...(optStr(o, "texto_alternativo") ? { alt_text: optStr(o, "texto_alternativo").slice(0, 500) } : {}), media_source }) });
    return { id: r.id, permalink: `https://www.pinterest.com/pin/${r.id}/` };
  },
};
