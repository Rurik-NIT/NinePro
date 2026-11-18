/**
 * Instagram — API do Instagram com Login do Instagram (graph.instagram.com). Não exige Página do Facebook.
 * App do NinePro: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET (produto Instagram dentro do app da Meta).
 * Opcionais: INSTAGRAM_GRAPH_VERSION (v23.0), INSTAGRAM_SCOPES.
 */
import { http, PlatformError, type ChannelProvider, type Env, type ExchangeResult, type StoredAuth } from "./types.js";

const ver = (env: Env) => env.INSTAGRAM_GRAPH_VERSION || "v23.0";
const ig = (env: Env) => `https://graph.instagram.com/${ver(env)}`;
const expired = (_s: number, b: Record<string, unknown>) => { const c = (b.error as { code?: number } | undefined)?.code; return c === 190 || c === 102; };
const call = <T = Record<string, unknown>>(url: string, init?: RequestInit) => http<T>("Instagram", url, init, expired);
const bearer = (t: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${t}`, ...extra });
export const IG_DEFAULT_SCOPES = "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish";
export const igToken = (a: StoredAuth) => { if (!a.accessToken) throw new PlatformError("Instagram: conexão sem token. Conecte de novo.", true); return a.accessToken; };
const DAY = 86_400_000;

interface Me { id: string; user_id?: string | number; username: string; name?: string; profile_picture_url?: string; account_type?: string; followers_count?: number; follows_count?: number; media_count?: number }
export const igMe = (env: Env, token: string) =>
  call<Me>(`${ig(env)}/me?${new URLSearchParams({ fields: "id,user_id,username,name,profile_picture_url,account_type,followers_count,follows_count,media_count" })}`, { headers: bearer(token) });
const igUserId = (me: Me) => String(me.user_id ?? me.id);

async function longLived(appSecret: string, short: string) {
  const r = await call<{ access_token: string; expires_in?: number }>(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: appSecret, access_token: short })}`);
  return r;
}
async function result(env: Env, token: string, expiresIn: number | undefined, extra: Record<string, string>): Promise<ExchangeResult> {
  const me = await igMe(env, token);
  if (me.account_type && !["BUSINESS", "MEDIA_CREATOR", "CREATOR"].includes(me.account_type.toUpperCase())) throw new PlatformError("Essa conta do Instagram é pessoal. Mude para conta profissional (Empresa ou Criador de conteúdo) no app do Instagram.");
  return {
    auth: { accessToken: token, extra: { ...extra, igUserId: igUserId(me), refreshedAt: new Date().toISOString() } },
    expiresAt: new Date(Date.now() + (expiresIn ?? 60 * 86400) * 1000).toISOString(),
    user: { id: igUserId(me), name: `@${me.username}` },
    scopes: IG_DEFAULT_SCOPES.split(","),
  };
}

export const instagramProvider: ChannelProvider = {
  id: "instagram",
  label: "Instagram",
  limits: { text: 2200, images: 10, videos: 10, textOnly: false, mixed: true, needsMedia: "any" },
  nineproApp: (env) => (env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET ? { appId: env.INSTAGRAM_APP_ID, appSecret: env.INSTAGRAM_APP_SECRET } : null),
  scopes: (env) => (env.INSTAGRAM_SCOPES || IG_DEFAULT_SCOPES).split(","),
  appFields: [
    { key: "appId", label: "ID do app do Instagram", placeholder: "123456789012345", pattern: "^\\d{5,20}$", hint: "Instagram › Configuração da API com login do Instagram" },
    { key: "appSecret", label: "Chave secreta do app do Instagram", secret: true, placeholder: "32 caracteres", pattern: "^[0-9a-fA-F]{32}$" },
  ],
  tokenFields: [
    { key: "accessToken", label: "Token de acesso do Instagram", secret: true, multiline: true, placeholder: "IGAA…", hint: "Gerado em Instagram › Configuração da API com login do Instagram › Gerar token." },
    { key: "appSecret", label: "Chave secreta do app do Instagram (opcional)", secret: true, optional: true, pattern: "^[0-9a-fA-F]{32}$", hint: "Usada para conferir a assinatura dos webhooks." },
  ],
  authorizeUrl(env, app, redirectUri, state) {
    const u = new URL("https://www.instagram.com/oauth/authorize");
    u.search = new URLSearchParams({ client_id: app.appId, redirect_uri: redirectUri, response_type: "code", scope: this.scopes(env).join(","), state, enable_fb_login: "0", force_reauth: "true" }).toString();
    return u.toString();
  },
  async exchangeCode(env, app, code, redirectUri) {
    const form = new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code: code.replace(/#_$/, "") });
    const r = await call<{ access_token?: string; data?: { access_token: string }[] }>("https://api.instagram.com/oauth/access_token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
    const short = r.access_token ?? r.data?.[0]?.access_token;
    if (!short) throw new PlatformError("O Instagram não devolveu o acesso.");
    const long = await longLived(app.appSecret, short);
    return result(env, long.access_token, long.expires_in, { appSecret: app.appSecret });
  },
  async fromToken(env, f) {
    const t = (f.accessToken ?? "").trim();
    if (t.length < 50 || /\s/.test(t)) throw new PlatformError("Cole o token completo, sem espaços.");
    return result(env, t, undefined, f.appSecret ? { appSecret: f.appSecret } : {});
  },
  /** Tokens longos valem 60 dias; renova quando passou de 7 dias desde a última renovação. */
  async ready(_env, auth) {
    const at = Date.parse(auth.extra?.refreshedAt ?? "");
    if (Number.isFinite(at) && Date.now() - at < 7 * DAY) return auth;
    try {
      const r = await call<{ access_token: string; expires_in?: number }>(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: igToken(auth) })}`);
      return { ...auth, accessToken: r.access_token, extra: { ...auth.extra, refreshedAt: new Date().toISOString() } };
    } catch (e) {
      if (e instanceof PlatformError && e.expired) throw e;
      return auth; // tokens recém-criados (menos de 24 h) ainda não podem ser renovados
    }
  },
  async discover(env, auth) {
    const me = await igMe(env, igToken(auth));
    return [{
      externalId: igUserId(me), name: `@${me.username}`, displayName: me.name ?? null, picture: me.profile_picture_url ?? null, status: "ativo",
      detail: { seguidores: me.followers_count ?? null, seguindo: me.follows_count ?? null, publicacoes: me.media_count ?? null, tipo: me.account_type ?? null },
    }];
  },
  async subscribe(env, auth) {
    const t = igToken(auth);
    for (const fields of ["messages,comments,mentions,message_reactions,messaging_seen", "messages,comments,mentions", "messages,comments"]) {
      try {
        await call(`${ig(env)}/me/subscribed_apps?${new URLSearchParams({ subscribed_fields: fields })}`, { method: "POST", headers: bearer(t) });
        return null;
      } catch (e) { if (fields === "messages,comments") return e instanceof Error ? e.message : String(e); }
    }
    return null;
  },
};

/* ------------------------------------------------------------------ mensagens diretas */
export async function igSendDm(env: Env, token: string, igId: string, recipient: { id: string } | { comment_id: string }, message: Record<string, unknown>) {
  const r = await call<{ message_id?: string; recipient_id?: string }>(`${ig(env)}/${igId}/messages`, { method: "POST", headers: bearer(token, { "content-type": "application/json" }), body: JSON.stringify({ recipient, message }) });
  return r.message_id ?? null;
}
export const igSendText = (env: Env, token: string, igId: string, to: string, text: string) => igSendDm(env, token, igId, { id: to }, { text });
export const igSendImage = (env: Env, token: string, igId: string, to: string, url: string) => igSendDm(env, token, igId, { id: to }, { attachment: { type: "image", payload: { url } } });
/** Resposta privada: manda DM para quem comentou (até 7 dias depois do comentário). */
export const igPrivateReply = (env: Env, token: string, igId: string, commentId: string, text: string) => igSendDm(env, token, igId, { comment_id: commentId }, { text });
/** Resposta privada com botão de link (modelo de botão do Instagram: texto até 640, rótulo até 20 caracteres). */
export const igPrivateReplyButton = (env: Env, token: string, igId: string, commentId: string, text: string, button: { label: string; url: string }) =>
  igSendDm(env, token, igId, { comment_id: commentId }, { attachment: { type: "template", payload: { template_type: "button", text: text.slice(0, 640), buttons: [{ type: "web_url", url: button.url, title: button.label.slice(0, 20) }] } } });

export async function igProfile(env: Env, token: string, igsid: string): Promise<{ name?: string; username?: string; profile_pic?: string }> {
  return call(`${ig(env)}/${igsid}?${new URLSearchParams({ fields: "name,username,profile_pic" })}`, { headers: bearer(token) }).catch(() => ({}));
}

export interface IgThreadMsg { id: string; created_time: string; from?: { id: string; username?: string }; to?: { data: { id: string; username?: string }[] }; message?: string; attachments?: { data: { image_data?: { url: string }; video_data?: { url: string } }[] } }
export interface IgThread { id: string; updated_time?: string; participants?: { data: { id: string; username?: string }[] }; messages?: { data: IgThreadMsg[] } }
/** Conversas recentes (para trazer o histórico na conexão). */
export async function igConversations(env: Env, token: string, limit = 25): Promise<IgThread[]> {
  const r = await call<{ data: IgThread[] }>(`${ig(env)}/me/conversations?${new URLSearchParams({ platform: "instagram", limit: String(limit), fields: "id,updated_time,participants,messages.limit(20){id,created_time,from,to,message,attachments}" })}`, { headers: bearer(token) });
  return r.data ?? [];
}

/* ------------------------------------------------------------------ publicações e comentários */
export interface IgMedia { id: string; caption?: string; permalink?: string; timestamp?: string; media_type?: string; media_url?: string; thumbnail_url?: string; comments_count?: number; like_count?: number }
export async function igRecentMedia(env: Env, token: string, limit = 12): Promise<IgMedia[]> {
  const r = await call<{ data: IgMedia[] }>(`${ig(env)}/me/media?${new URLSearchParams({ fields: "id,caption,permalink,timestamp,media_type,media_url,thumbnail_url,comments_count,like_count", limit: String(limit) })}`, { headers: bearer(token) });
  return r.data ?? [];
}
export interface IgComment { id: string; text?: string; username?: string; timestamp?: string; from?: { id: string; username?: string }; parent_id?: string; replies?: { data: IgComment[] } }
export async function igComments(env: Env, token: string, mediaId: string): Promise<IgComment[]> {
  const r = await call<{ data: IgComment[] }>(`${ig(env)}/${mediaId}/comments?${new URLSearchParams({ fields: "id,text,username,timestamp,from,replies{id,text,username,timestamp,from}", limit: "50" })}`, { headers: bearer(token) });
  return r.data ?? [];
}
export async function igComment(env: Env, token: string, commentId: string): Promise<IgComment & { media?: { id: string } }> {
  return call(`${ig(env)}/${commentId}?${new URLSearchParams({ fields: "id,text,username,timestamp,from,media{id}" })}`, { headers: bearer(token) });
}
export async function igMediaInfo(env: Env, token: string, mediaId: string): Promise<IgMedia> {
  return call<IgMedia>(`${ig(env)}/${mediaId}?${new URLSearchParams({ fields: "id,caption,permalink,media_type,media_url,thumbnail_url,timestamp" })}`, { headers: bearer(token) }).catch(() => ({ id: mediaId }));
}
export const igReplyComment = (env: Env, token: string, commentId: string, message: string) =>
  call<{ id: string }>(`${ig(env)}/${commentId}/replies`, { method: "POST", headers: bearer(token, { "content-type": "application/x-www-form-urlencoded" }), body: new URLSearchParams({ message }) });
export const igHideComment = (env: Env, token: string, commentId: string, hide: boolean) =>
  call(`${ig(env)}/${commentId}`, { method: "POST", headers: bearer(token, { "content-type": "application/x-www-form-urlencoded" }), body: new URLSearchParams({ hide: String(hide) }) });
export const igDeleteComment = (env: Env, token: string, commentId: string) => call(`${ig(env)}/${commentId}`, { method: "DELETE", headers: bearer(token) });

/** Publica no feed (imagem, vídeo/reels, carrossel) ou nos stories. As mídias precisam ter URL pública. */
export interface IgExtras { collaborators?: string[]; userTags?: string[]; shareToFeed?: boolean; coverUrl?: string; locationId?: string }
export const igPostComment = (env: Env, token: string, mediaId: string, message: string) =>
  call<{ id: string }>(`${ig(env)}/${mediaId}/comments`, { method: "POST", headers: bearer(token, { "content-type": "application/x-www-form-urlencoded" }), body: new URLSearchParams({ message }) });
export async function igPublish(env: Env, token: string, igId: string, p: { type: "IMAGE" | "VIDEO" | "REELS" | "CAROUSEL" | "STORIES"; urls: string[]; caption: string; extras?: IgExtras }): Promise<{ id: string; permalink: string | null }> {
  const x = p.extras ?? {};
  const handle = (s: string) => s.trim().replace(/^@/, "");
  const collab: Record<string, string> = x.collaborators?.length ? { collaborators: JSON.stringify(x.collaborators.slice(0, 3).map(handle)) } : {};
  const loc: Record<string, string> = x.locationId ? { location_id: x.locationId } : {};
  const tagsFor = (video: boolean): Record<string, string> => (x.userTags?.length ? { user_tags: JSON.stringify(x.userTags.slice(0, 20).map((u, i) => (video ? { username: handle(u) } : { username: handle(u), x: Math.min(0.9, 0.1 + (i % 5) * 0.2), y: Math.min(0.9, 0.1 + Math.floor(i / 5) * 0.2) }))) } : {});
  const form = (o: Record<string, string>) => ({ method: "POST", headers: bearer(token, { "content-type": "application/x-www-form-urlencoded" }), body: new URLSearchParams(o) });
  const isVideo = (u: string) => /\.(mp4|mov|m4v)(\?|$)/i.test(u);
  const create = async (o: Record<string, string>) => (await call<{ id: string }>(`${ig(env)}/${igId}/media`, form(o))).id;
  const wait = async (id: string) => {
    for (let i = 0; i < 40; i++) {
      const s = await call<{ status_code?: string; status?: string }>(`${ig(env)}/${id}?fields=status_code,status`, { headers: bearer(token) });
      if (s.status_code === "FINISHED" || s.status_code === "PUBLISHED") return;
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new PlatformError(`Instagram recusou a mídia: ${s.status ?? s.status_code}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new PlatformError("Instagram: o processamento do vídeo demorou demais. Tente de novo.");
  };
  if (!p.urls.length) throw new PlatformError("Adicione ao menos uma imagem ou vídeo. O Instagram não publica só texto.");
  let container: string;
  if (p.type === "CAROUSEL") {
    if (p.urls.length < 2 || p.urls.length > 10) throw new PlatformError("Carrossel precisa de 2 a 10 mídias.");
    const children: string[] = [];
    for (const u of p.urls) {
      const id = await create(isVideo(u) ? { media_type: "VIDEO", video_url: u, is_carousel_item: "true" } : { image_url: u, is_carousel_item: "true", ...(children.length === 0 ? tagsFor(false) : {}) });
      if (isVideo(u)) await wait(id);
      children.push(id);
    }
    container = await create({ media_type: "CAROUSEL", children: children.join(","), caption: p.caption, ...collab, ...loc });
  } else if (p.type === "STORIES") {
    container = await create({ ...(isVideo(p.urls[0]) ? { media_type: "STORIES", video_url: p.urls[0] } : { media_type: "STORIES", image_url: p.urls[0] }), ...tagsFor(isVideo(p.urls[0])) });
  } else if (p.type === "VIDEO" || p.type === "REELS" || isVideo(p.urls[0])) {
    container = await create({ media_type: "REELS", video_url: p.urls[0], caption: p.caption, ...collab, ...loc, ...tagsFor(true), ...(x.shareToFeed === false ? { share_to_feed: "false" } : {}), ...(x.coverUrl ? { cover_url: x.coverUrl } : ({} as Record<string, string>)) });
  } else {
    container = await create({ image_url: p.urls[0], caption: p.caption, ...collab, ...loc, ...tagsFor(false) });
  }
  await wait(container);
  const pub = await call<{ id: string }>(`${ig(env)}/${igId}/media_publish`, form({ creation_id: container }));
  const info = await igMediaInfo(env, token, pub.id).catch(() => ({ permalink: undefined }));
  return { id: pub.id, permalink: (info as IgMedia).permalink ?? null };
}

/** Métricas de uma publicação (alcance, visualizações, salvos, compartilhamentos). Falha silenciosa: devolve vazio. */
export async function igMediaInsights(env: Env, token: string, mediaId: string, mediaType?: string): Promise<{ reach?: number; views?: number; saved?: number; shares?: number }> {
  const metrics = mediaType === "CAROUSEL_ALBUM" ? "reach,saved,views" : "reach,saved,shares,views";
  try {
    const r = await call<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`${ig(env)}/${mediaId}/insights?${new URLSearchParams({ metric: metrics })}`, { headers: bearer(token) });
    return Object.fromEntries(r.data.map((m) => [m.name, m.total_value?.value ?? m.values?.[0]?.value ?? 0]));
  } catch { return {}; }
}
