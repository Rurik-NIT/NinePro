/**
 * Facebook (Páginas) — Graph API. Usa o mesmo app da Meta dos anúncios (META_APP_ID / META_APP_SECRET),
 * com as permissões de Página. Opcional: FACEBOOK_SCOPES.
 * Publica texto, foto, várias fotos ou vídeo na Página. O token da Página é obtido na hora (não é guardado).
 */
import { metaVersion } from "./meta.js";
import { http, PlatformError, type ChannelProvider, type Env, type ExchangeResult, type PostStat, type StoredAuth } from "./types.js";

export const FB_DEFAULT_SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts,read_insights,business_management";
const graph = (env: Env) => `https://graph.facebook.com/${metaVersion(env)}`;
const expired = (_s: number, b: Record<string, unknown>) => { const c = (b.error as { code?: number } | undefined)?.code; return c === 190 || c === 102; };
const call = <T = Record<string, unknown>>(url: string, init?: RequestInit) => http<T>("Facebook", url, init, expired);
const userToken = (a: StoredAuth) => { if (!a.accessToken) throw new PlatformError("Facebook: conexão sem token. Conecte de novo.", true); return a.accessToken; };
const form = (o: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o) });

interface Page { id: string; name: string; access_token?: string; picture?: { data?: { url?: string } }; fan_count?: number; link?: string; category?: string }

async function result(env: Env, token: string, extra: Record<string, string>): Promise<ExchangeResult> {
  const me = await call<{ id: string; name: string }>(`${graph(env)}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  return { auth: { accessToken: token, extra: { ...extra, refreshedAt: new Date().toISOString() } }, expiresAt: null, user: { id: me.id, name: me.name }, scopes: (env.FACEBOOK_SCOPES || FB_DEFAULT_SCOPES).split(",") };
}
/** Token da Página: com token de usuário, pede à Graph; com token de Página, é ele mesmo. */
async function pageToken(env: Env, auth: StoredAuth, pageId: string) {
  const t = userToken(auth);
  const r = await call<{ access_token?: string }>(`${graph(env)}/${pageId}?fields=access_token&access_token=${encodeURIComponent(t)}`).catch(() => ({ access_token: undefined }));
  return r.access_token ?? t;
}

export const facebookProvider: ChannelProvider = {
  id: "facebook",
  label: "Facebook",
  limits: { text: 63206, images: 10, videos: 1, textOnly: true, mixed: false },
  nineproApp: (env) => (env.META_APP_ID && env.META_APP_SECRET ? { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET } : null),
  scopes: (env) => (env.FACEBOOK_SCOPES || FB_DEFAULT_SCOPES).split(","),
  appFields: [
    { key: "appId", label: "ID do app", placeholder: "123456789012345", pattern: "^\\d{5,20}$", hint: "Meta for Developers › Configurações do app › Básico" },
    { key: "appSecret", label: "Chave secreta do app", secret: true, pattern: "^[0-9a-fA-F]{32}$" },
  ],
  tokenFields: [{ key: "accessToken", label: "Token de acesso (usuário ou Página)", secret: true, multiline: true, placeholder: "EAA…", hint: "Explorador da Graph API com pages_show_list, pages_read_engagement e pages_manage_posts, ou token de Página que não expira." }],
  authorizeUrl(env, app, redirectUri, state) {
    const u = new URL(`https://www.facebook.com/${metaVersion(env)}/dialog/oauth`);
    u.search = new URLSearchParams({ client_id: app.appId, redirect_uri: redirectUri, state, scope: this.scopes(env).join(","), response_type: "code" }).toString();
    return u.toString();
  },
  async exchangeCode(env, app, code, redirectUri) {
    const short = await call<{ access_token: string }>(`${graph(env)}/oauth/access_token?${new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, redirect_uri: redirectUri, code })}`);
    const long = await call<{ access_token: string }>(`${graph(env)}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: short.access_token })}`);
    return result(env, long.access_token, { appSecret: app.appSecret });
  },
  async fromToken(env, f) {
    const t = (f.accessToken ?? "").trim();
    if (t.length < 50 || /\s/.test(t)) throw new PlatformError("Cole o token completo, sem espaços.");
    return result(env, t, {});
  },
  async ready(_env, auth) { return auth; },
  async discover(env, auth) {
    const t = userToken(auth);
    let pages: Page[] = [];
    try {
      const r = await call<{ data: Page[] }>(`${graph(env)}/me/accounts?${new URLSearchParams({ fields: "id,name,picture{url},fan_count,link,category", limit: "100", access_token: t })}`);
      pages = r.data ?? [];
    } catch (e) { if (e instanceof PlatformError && e.expired) throw e; }
    if (!pages.length) {
      // token de Página: /me é a própria Página
      const me = await call<Page & { category?: string }>(`${graph(env)}/me?${new URLSearchParams({ fields: "id,name,picture{url},fan_count,link,category", access_token: t })}`).catch(() => null);
      if (me?.category) pages = [me];
    }
    return pages.map((p) => ({ externalId: p.id, name: p.name, displayName: p.category ?? null, picture: p.picture?.data?.url ?? null, status: "ativo", detail: { seguidores: p.fan_count ?? null, link: p.link ?? null } }));
  },
  async subscribe() { return null; },
  async stats(env, auth, account, limit) {
    const token = await pageToken(env, auth, account.externalId);
    type P = { id: string; message?: string; created_time?: string; permalink_url?: string; full_picture?: string; status_type?: string; shares?: { count?: number }; reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } };
    const r = await call<{ data?: P[] }>(`${graph(env)}/${account.externalId}/posts?${new URLSearchParams({ fields: "id,message,created_time,permalink_url,full_picture,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)", limit: String(Math.min(limit, 50)), access_token: token })}`);
    const out: PostStat[] = [];
    for (const p of r.data ?? []) {
      const ins = await call<{ data: { name: string; values?: { value: number }[] }[] }>(`${graph(env)}/${p.id}/insights?${new URLSearchParams({ metric: "post_impressions,post_impressions_unique,post_clicks", access_token: token })}`).catch(() => ({ data: [] }));
      const v = (k: string) => ins.data.find((x) => x.name === k)?.values?.[0]?.value ?? null;
      out.push({ id: p.id, text: p.message ?? null, permalink: p.permalink_url ?? null, thumbnail: p.full_picture ?? null, type: p.status_type ?? null, postedAt: p.created_time ?? null, likes: p.reactions?.summary?.total_count ?? 0, comments: p.comments?.summary?.total_count ?? 0, shares: p.shares?.count ?? 0, impressions: v("post_impressions"), reach: v("post_impressions_unique"), clicks: v("post_clicks") });
    }
    return out;
  },
  async accountStats(env, auth, account) {
    const token = await pageToken(env, auth, account.externalId);
    const p = await call<{ fan_count?: number; followers_count?: number }>(`${graph(env)}/${account.externalId}?${new URLSearchParams({ fields: "fan_count,followers_count", access_token: token })}`);
    const ins = await call<{ data: { name: string; values?: { value: number }[] }[] }>(`${graph(env)}/${account.externalId}/insights?${new URLSearchParams({ metric: "page_impressions,page_impressions_unique,page_views_total", period: "day", access_token: token })}`).catch(() => ({ data: [] }));
    const v = (k: string) => ins.data.find((x) => x.name === k)?.values?.at(-1)?.value ?? null;
    return { followers: p.followers_count ?? p.fan_count ?? null, impressions: v("page_impressions"), reach: v("page_impressions_unique"), profileViews: v("page_views_total"), extra: { curtidas_da_pagina: p.fan_count ?? null } };
  },
  async publish(env, auth, account, p) {
    const page = account.externalId;
    const token = await pageToken(env, auth, page);
    const text = p.text.trim();
    const images = p.media.filter((m) => m.type === "image");
    const video = p.media.find((m) => m.type === "video");
    if (video && images.length) throw new PlatformError("Facebook: publique fotos ou um vídeo, não os dois juntos.");
    let postId: string;
    if (video) {
      const r = await call<{ id: string }>(`https://graph-video.facebook.com/${metaVersion(env)}/${page}/videos`, form({ file_url: video.url, description: text, ...(p.title ? { title: p.title.slice(0, 255) } : {}), access_token: token }));
      const info = await call<{ permalink_url?: string }>(`${graph(env)}/${r.id}?fields=permalink_url&access_token=${encodeURIComponent(token)}`).catch(() => ({ permalink_url: undefined }));
      return { id: r.id, permalink: info.permalink_url ? (info.permalink_url.startsWith("http") ? info.permalink_url : `https://www.facebook.com${info.permalink_url}`) : `https://www.facebook.com/${r.id}` };
    }
    if (images.length === 1) {
      const r = await call<{ id: string; post_id?: string }>(`${graph(env)}/${page}/photos`, form({ url: images[0].url, caption: text, access_token: token }));
      postId = r.post_id ?? r.id;
    } else if (images.length > 1) {
      const ids: string[] = [];
      for (const m of images.slice(0, 10)) ids.push((await call<{ id: string }>(`${graph(env)}/${page}/photos`, form({ url: m.url, published: "false", access_token: token }))).id);
      const r = await call<{ id: string }>(`${graph(env)}/${page}/feed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text, attached_media: ids.map((id) => ({ media_fbid: id })), access_token: token }) });
      postId = r.id;
    } else {
      if (!text) throw new PlatformError("Facebook: escreva um texto ou adicione mídia.");
      postId = (await call<{ id: string }>(`${graph(env)}/${page}/feed`, form({ message: text, access_token: token }))).id;
    }
    const info = await call<{ permalink_url?: string }>(`${graph(env)}/${postId}?fields=permalink_url&access_token=${encodeURIComponent(token)}`).catch(() => ({ permalink_url: undefined }));
    return { id: postId, permalink: info.permalink_url ?? `https://www.facebook.com/${postId}` };
  },
  async comment(env, auth, account, postId, text) {
    const token = await pageToken(env, auth, account.externalId);
    return call<{ id: string }>(`${graph(env)}/${postId}/comments`, form({ message: text, access_token: token }));
  },
};
