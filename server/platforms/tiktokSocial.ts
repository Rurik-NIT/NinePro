/**
 * TikTok (publicações) — Content Posting API (TikTok for Developers, Login Kit + Content Posting).
 * App do NinePro: TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET (não é o app do TikTok Ads).
 * Vídeo: envio do arquivo em partes (FILE_UPLOAD). Fotos: PULL_FROM_URL (o domínio das mídias precisa estar verificado no app).
 * Apps ainda não auditados pelo TikTok só publicam como privado (SELF_ONLY).
 */
import { download, http, optBool, optNum, optStr, PlatformError, sleep, type PostStat, type ChannelProvider, type Env, type ExchangeResult, type StoredAuth } from "./types.js";

const API = "https://open.tiktokapis.com/v2";
/** video.list: análises dos vídeos (conexões antigas sem ela recebem aviso para reconectar). */
const SCOPES = ["user.info.basic", "user.info.profile", "user.info.stats", "video.publish", "video.upload", "video.list"];
/** 401 por permissão faltando (scope_not_authorized) não é token expirado: pede reconexão sem derrubar a conta. */
const expired = (s: number, b: Record<string, unknown>) => { const c = (b.error as { code?: string } | undefined)?.code; return c === "access_token_invalid" || (s === 401 && c !== "scope_not_authorized"); };
const call = <T>(a: StoredAuth, path: string, body?: unknown) => http<T>("TikTok", `${API}${path}`, body === undefined ? { headers: { authorization: `Bearer ${a.accessToken}` } } : { method: "POST", headers: { authorization: `Bearer ${a.accessToken}`, "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify(body) }, expired);
const creds = (env: Env, a?: StoredAuth) => ({ key: a?.extra?.clientKey || env.TIKTOK_CLIENT_KEY || "", secret: a?.extra?.clientSecret || env.TIKTOK_CLIENT_SECRET || "" });
interface Tokens { access_token: string; refresh_token: string; expires_in: number; open_id: string; scope?: string }
const token = (body: Record<string, string>) => http<Tokens>("TikTok", `${API}/oauth/token/`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });

async function result(t: Tokens, extra: Record<string, string>): Promise<ExchangeResult> {
  const a: StoredAuth = { accessToken: t.access_token };
  const me = await call<{ data: { user: { open_id: string; display_name?: string; username?: string } } }>(a, "/user/info/?fields=open_id,display_name,username");
  return { auth: { accessToken: t.access_token, refreshToken: t.refresh_token, extra: { ...extra, openId: t.open_id, refreshedAt: new Date().toISOString() } }, expiresAt: null, user: { id: t.open_id, name: me.data.user.username ? `@${me.data.user.username}` : me.data.user.display_name ?? "TikTok" }, scopes: (t.scope ?? SCOPES.join(",")).split(",") };
}

export const tiktokSocialProvider: ChannelProvider = {
  id: "tiktok_social",
  label: "TikTok",
  limits: { text: 2200, images: 35, videos: 1, textOnly: false, mixed: false, needsMedia: "any" },
  nineproApp: (env) => { const c = creds(env); return c.key && c.secret ? { appId: c.key, appSecret: c.secret } : null; },
  scopes: () => SCOPES,
  appFields: [
    { key: "appId", label: "Client key", placeholder: "aw1b2c3d4e5f", hint: "developers.tiktok.com › seu app (Login Kit e Content Posting API)" },
    { key: "appSecret", label: "Client secret", secret: true },
  ],
  tokenFields: [
    { key: "appId", label: "Client key" },
    { key: "appSecret", label: "Client secret", secret: true },
    { key: "refreshToken", label: "Refresh token", secret: true, multiline: true, hint: "Vale 365 dias. Gerado pelo login do seu app." },
  ],
  authorizeUrl(_env, app, redirectUri, state) {
    const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
    u.search = new URLSearchParams({ client_key: app.appId, scope: SCOPES.join(","), response_type: "code", redirect_uri: redirectUri, state }).toString();
    return u.toString();
  },
  async exchangeCode(_env, app, code, redirectUri) {
    const t = await token({ client_key: app.appId, client_secret: app.appSecret, code: decodeURIComponent(code), grant_type: "authorization_code", redirect_uri: redirectUri });
    return result(t, { clientKey: app.appId, clientSecret: app.appSecret });
  },
  async fromToken(_env, f) {
    const t = await token({ client_key: f.appId.trim(), client_secret: f.appSecret.trim(), grant_type: "refresh_token", refresh_token: f.refreshToken.trim() });
    return result(t, { clientKey: f.appId.trim(), clientSecret: f.appSecret.trim() });
  },
  /** Acesso dura 24 h; renova depois de 20 h (o refresh token também é renovado). */
  async ready(env, auth) {
    const at = Date.parse(auth.extra?.refreshedAt ?? "");
    if (Number.isFinite(at) && Date.now() - at < 20 * 3_600_000) return auth;
    const c = creds(env, auth);
    const t = await token({ client_key: c.key, client_secret: c.secret, grant_type: "refresh_token", refresh_token: auth.refreshToken ?? "" }).catch((e) => { throw new PlatformError(`TikTok: ${(e as Error).message}. Conecte de novo.`, true); });
    return { ...auth, accessToken: t.access_token, refreshToken: t.refresh_token, extra: { ...auth.extra, refreshedAt: new Date().toISOString() } };
  },
  async discover(_env, auth) {
    const r = await call<{ data: { user: { open_id: string; display_name?: string; username?: string; avatar_url?: string; follower_count?: number; video_count?: number } } }>(auth, "/user/info/?fields=open_id,display_name,username,avatar_url,follower_count,video_count");
    const u = r.data.user;
    return [{ externalId: u.open_id, name: u.username ? `@${u.username}` : u.display_name ?? "TikTok", displayName: u.display_name ?? null, picture: u.avatar_url ?? null, status: "ativo", detail: { usuario: u.username ?? null, seguidores: u.follower_count ?? null, publicacoes: u.video_count ?? null } }];
  },
  async subscribe() { return null; },
  async stats(_env, auth, account, limit) {
    type V = { id: string; title?: string; video_description?: string; create_time?: number; cover_image_url?: string; share_url?: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number };
    const r = await call<{ data: { videos?: V[] } }>(auth, "/video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count", { max_count: Math.min(limit, 20) }).catch((e) => {
      throw new PlatformError(/scope|permission/i.test((e as Error).message) ? "TikTok: reconecte a conta para liberar as análises dos vídeos." : (e as Error).message, (e as PlatformError).expired);
    });
    const user = String(account.detail.usuario ?? "");
    return (r.data.videos ?? []).map((v): PostStat => ({ id: v.id, text: v.video_description || v.title || null, permalink: v.share_url ?? (user ? `https://www.tiktok.com/@${user}/video/${v.id}` : null), thumbnail: v.cover_image_url ?? null, type: "video", postedAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : null, likes: v.like_count ?? 0, comments: v.comment_count ?? 0, shares: v.share_count ?? 0, views: v.view_count ?? 0 }));
  },
  async accountStats(_env, auth) {
    const r = await call<{ data: { user: { follower_count?: number; following_count?: number; likes_count?: number; video_count?: number } } }>(auth, "/user/info/?fields=follower_count,following_count,likes_count,video_count");
    const u = r.data.user;
    return { followers: u.follower_count ?? null, following: u.following_count ?? null, posts: u.video_count ?? null, extra: { curtidas_totais: u.likes_count ?? null } };
  },
  async publish(_env, auth, account, p) {
    const info = await call<{ data: { privacy_level_options?: string[]; max_video_post_duration_sec?: number } }>(auth, "/post/publish/creator_info/query/", {});
    const opts = info.data.privacy_level_options ?? ["SELF_ONLY"];
    const o = p.options;
    const wanted = optStr(o, "privacidade") || "PUBLIC_TO_EVERYONE";
    const ORDER = ["PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"];
    const privacy = opts.includes(wanted) ? wanted : ORDER.slice(ORDER.indexOf(wanted)).find((x) => opts.includes(x)) ?? opts[0];
    const flags = { disable_comment: optBool(o, "sem_comentarios"), brand_content_toggle: optBool(o, "conteudo_de_marca"), brand_organic_toggle: optBool(o, "marca_propria"), is_aigc: optBool(o, "feito_com_ia") };
    if (flags.brand_content_toggle && privacy === "SELF_ONLY") throw new PlatformError("TikTok: parceria paga não pode ser publicada como privada.");
    const text = p.text.trim().slice(0, 2200);
    const video = p.media.find((m) => m.type === "video");
    let publishId: string;
    if (video) {
      const f = await download("TikTok", video.url, 4_000_000_000);
      const MB = 1024 * 1024;
      const chunk = f.size <= 64 * MB ? f.size : 10 * MB;
      const count = f.size <= 64 * MB ? 1 : Math.floor(f.size / chunk);
      const init = await call<{ data: { publish_id: string; upload_url: string } }>(auth, "/post/publish/video/init/", { post_info: { title: text, privacy_level: privacy, disable_duet: optBool(o, "sem_dueto"), disable_stitch: optBool(o, "sem_stitch"), ...flags, ...(optNum(o, "capa_ms") !== undefined ? { video_cover_timestamp_ms: optNum(o, "capa_ms") } : {}) }, source_info: { source: "FILE_UPLOAD", video_size: f.size, chunk_size: chunk, total_chunk_count: count } });
      for (let i = 0; i < count; i++) {
        const start = i * chunk, end = i === count - 1 ? f.size - 1 : start + chunk - 1;
        const r = await fetch(init.data.upload_url, { method: "PUT", headers: { "content-type": f.type || "video/mp4", "content-range": `bytes ${start}-${end}/${f.size}`, "content-length": String(end - start + 1) }, body: f.bytes.subarray(start, end + 1) as BodyInit });
        if (!r.ok) throw new PlatformError(`TikTok: falha no envio do vídeo (parte ${i + 1}, HTTP ${r.status}).`);
      }
      publishId = init.data.publish_id;
    } else {
      const images = p.media.filter((m) => m.type === "image").slice(0, 35);
      if (!images.length) throw new PlatformError("TikTok: adicione um vídeo ou fotos.");
      const init = await call<{ data: { publish_id: string } }>(auth, "/post/publish/content/init/", { post_info: { title: (p.title || text).slice(0, 90), description: text, privacy_level: privacy, ...flags, auto_add_music: o?.musica_automatica !== false }, source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: images.map((m) => m.url) }, post_mode: "DIRECT_POST", media_type: "PHOTO" });
      publishId = init.data.publish_id;
    }
    for (let i = 0; i < 40; i++) {
      const s = await call<{ data: { status: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] } }>(auth, "/post/publish/status/fetch/", { publish_id: publishId });
      if (s.data.status === "PUBLISH_COMPLETE") {
        const id = s.data.publicaly_available_post_id?.[0];
        const user = String(account.detail.usuario ?? "");
        return { id: id ? String(id) : publishId, permalink: id && user ? `https://www.tiktok.com/@${user}/${video ? "video" : "photo"}/${id}` : null, aviso: privacy !== wanted ? (privacy === "SELF_ONLY" && !opts.includes("PUBLIC_TO_EVERYONE") ? "Publicado como privado: o app do TikTok ainda não foi auditado." : `A conta não permite "${wanted}"; publicado como ${privacy}.`) : undefined };
      }
      if (s.data.status === "FAILED") throw new PlatformError(`TikTok recusou: ${s.data.fail_reason ?? "motivo não informado"}.`);
      await sleep(3000);
    }
    return { id: publishId, permalink: null, aviso: "O TikTok ainda está processando; a publicação aparece no perfil em instantes." };
  },
};
