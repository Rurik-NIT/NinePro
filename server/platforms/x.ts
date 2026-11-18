/**
 * X (Twitter) — API v2 com OAuth 2.0 (PKCE). App do NinePro: X_CLIENT_ID / X_CLIENT_SECRET.
 * Publica texto, até 4 imagens ou 1 vídeo (envio de mídia v2 em partes).
 */
import { createHash, createHmac } from "node:crypto";
import { blob, download, graphemes, http, optList, optNum, optStr, PlatformError, sleep, type PostStat, type ChannelProvider, type Env, type ExchangeResult, type StoredAuth } from "./types.js";

const tweetId = (s: string) => s.match(/status(?:es)?\/(\d+)/)?.[1] ?? (/^\d{5,25}$/.test(s.trim()) ? s.trim() : "");

const API = "https://api.x.com/2";
const SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];
const creds = (env: Env, a?: StoredAuth) => ({ id: a?.extra?.clientId || env.X_CLIENT_ID || "", secret: a?.extra?.clientSecret || env.X_CLIENT_SECRET || "" });
const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
/** O verificador PKCE é derivado do state (não precisa guardar nada entre a ida e a volta). */
const verifier = (env: Env, state: string) => { if (!env.TOKEN_ENCRYPTION_KEY) throw new PlatformError("Servidor sem TOKEN_ENCRYPTION_KEY."); return createHmac("sha256", env.TOKEN_ENCRYPTION_KEY).update(`x-pkce:${state}`).digest("base64url"); };
const x = <T>(a: StoredAuth, path: string, init?: RequestInit) => http<T>("X", `${API}${path}`, { ...init, headers: { authorization: `Bearer ${a.accessToken}`, ...(init?.headers as Record<string, string> | undefined) } });
interface Tokens { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }
const tokenCall = (id: string, secret: string, body: Record<string, string>) => http<Tokens>("X", `${API}/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic(id, secret) }, body: new URLSearchParams({ ...body, client_id: id }) }, (s, b) => s === 400 && b.error === "invalid_request" && /refresh/i.test(String(b.error_description)));

async function result(t: Tokens, extra: Record<string, string>): Promise<ExchangeResult> {
  const me = await x<{ data: { id: string; username: string; name: string } }>({ accessToken: t.access_token }, "/users/me");
  return { auth: { accessToken: t.access_token, refreshToken: t.refresh_token, extra: { ...extra, refreshedAt: new Date().toISOString() } }, expiresAt: null, user: { id: me.data.id, name: `@${me.data.username}` }, scopes: (t.scope ?? SCOPES.join(" ")).split(" ") };
}

export const xProvider: ChannelProvider = {
  id: "x",
  label: "X (Twitter)",
  limits: { text: 280, images: 4, videos: 1, textOnly: true, mixed: false },
  nineproApp: (env) => { const c = creds(env); return c.id && c.secret ? { appId: c.id, appSecret: c.secret } : null; },
  scopes: () => SCOPES,
  appFields: [
    { key: "appId", label: "Client ID (OAuth 2.0)", hint: "developer.x.com › seu app › User authentication settings (Web App, Read and write) › Keys and tokens" },
    { key: "appSecret", label: "Client secret (OAuth 2.0)", secret: true },
  ],
  tokenFields: [
    { key: "appId", label: "Client ID (OAuth 2.0)" },
    { key: "appSecret", label: "Client secret (OAuth 2.0)", secret: true },
    { key: "refreshToken", label: "Refresh token", secret: true, multiline: true, hint: "Gerado pelo login OAuth 2.0 do seu app com offline.access." },
  ],
  authorizeUrl(env, app, redirectUri, state) {
    const u = new URL("https://x.com/i/oauth2/authorize");
    u.search = new URLSearchParams({ response_type: "code", client_id: app.appId, redirect_uri: redirectUri, scope: SCOPES.join(" "), state, code_challenge: createHash("sha256").update(verifier(env, state)).digest("base64url"), code_challenge_method: "S256" }).toString();
    return u.toString();
  },
  async exchangeCode(env, app, code, redirectUri, state) {
    if (!state) throw new PlatformError("X: retorno sem state.");
    const t = await tokenCall(app.appId, app.appSecret, { code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: verifier(env, state) });
    return result(t, { clientId: app.appId, clientSecret: app.appSecret });
  },
  async fromToken(_env, f) {
    const t = await tokenCall(f.appId.trim(), f.appSecret.trim(), { grant_type: "refresh_token", refresh_token: f.refreshToken.trim() });
    return result(t, { clientId: f.appId.trim(), clientSecret: f.appSecret.trim() });
  },
  /** Acesso dura 2 h; renova depois de 100 minutos (o refresh token muda a cada renovação). */
  async ready(env, auth) {
    const at = Date.parse(auth.extra?.refreshedAt ?? "");
    if (Number.isFinite(at) && Date.now() - at < 100 * 60_000) return auth;
    const c = creds(env, auth);
    const t = await tokenCall(c.id, c.secret, { grant_type: "refresh_token", refresh_token: auth.refreshToken ?? "" }).catch((e) => { throw new PlatformError(`X: ${(e as Error).message}. Conecte de novo.`, true); });
    return { ...auth, accessToken: t.access_token, refreshToken: t.refresh_token ?? auth.refreshToken, extra: { ...auth.extra, refreshedAt: new Date().toISOString() } };
  },
  async discover(_env, auth) {
    const me = await x<{ data: { id: string; username: string; name: string; profile_image_url?: string; public_metrics?: { followers_count?: number; tweet_count?: number } } }>(auth, "/users/me?user.fields=profile_image_url,public_metrics");
    const u = me.data;
    return [{ externalId: u.id, name: `@${u.username}`, displayName: u.name, picture: u.profile_image_url ?? null, status: "ativo", detail: { usuario: u.username, seguidores: u.public_metrics?.followers_count ?? null, publicacoes: u.public_metrics?.tweet_count ?? null } }];
  },
  async subscribe() { return null; },
  async stats(_env, auth, account, limit) {
    type T = { id: string; text: string; created_at?: string; public_metrics?: { like_count?: number; reply_count?: number; retweet_count?: number; quote_count?: number; bookmark_count?: number; impression_count?: number }; attachments?: { media_keys?: string[] } };
    const r = await x<{ data?: T[] }>(auth, `/users/${account.externalId}/tweets?max_results=${Math.max(5, Math.min(limit, 100))}&exclude=replies,retweets&tweet.fields=created_at,public_metrics,attachments`);
    const user = String(account.detail.usuario ?? "");
    return (r.data ?? []).map((t): PostStat => { const m = t.public_metrics ?? {}; return { id: t.id, text: t.text, permalink: user ? `https://x.com/${user}/status/${t.id}` : `https://x.com/i/web/status/${t.id}`, type: t.attachments?.media_keys?.length ? "midia" : "texto", postedAt: t.created_at ?? null, likes: m.like_count ?? 0, comments: m.reply_count ?? 0, shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0), saves: m.bookmark_count ?? null, impressions: m.impression_count ?? null }; });
  },
  async accountStats(_env, auth) {
    const me = await x<{ data: { public_metrics?: { followers_count?: number; following_count?: number; tweet_count?: number } } }>(auth, "/users/me?user.fields=public_metrics");
    const m = me.data.public_metrics ?? {};
    return { followers: m.followers_count ?? null, following: m.following_count ?? null, posts: m.tweet_count ?? null };
  },
  async publish(_env, auth, account, p) {
    const text = p.text.trim();
    const ids: string[] = [];
    const images = p.media.filter((m) => m.type === "image").slice(0, 4);
    const video = p.media.find((m) => m.type === "video");
    if (video && images.length) throw new PlatformError("X: publique imagens ou um vídeo, não os dois juntos.");
    for (const m of images) {
      const f = await download("X", m.url, 5_000_000);
      const fd = new FormData(); fd.set("media", blob(f.bytes, f.type), f.name); fd.set("media_category", "tweet_image"); fd.set("media_type", f.type);
      ids.push((await x<{ data: { id: string } }>(auth, "/media/upload", { method: "POST", body: fd })).data.id);
    }
    if (video) {
      const f = await download("X", video.url, 512_000_000);
      const init = await x<{ data: { id: string } }>(auth, "/media/upload/initialize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ media_type: f.type || "video/mp4", total_bytes: f.size, media_category: "tweet_video" }) });
      const id = init.data.id; const SEG = 4 * 1024 * 1024;
      for (let i = 0, start = 0; start < f.size; i++, start += SEG) {
        const fd = new FormData(); fd.set("media", blob(f.bytes.subarray(start, start + SEG), "application/octet-stream"), "parte"); fd.set("segment_index", String(i));
        await x(auth, `/media/upload/${id}/append`, { method: "POST", body: fd });
      }
      let info = (await x<{ data: { processing_info?: { state: string; check_after_secs?: number; error?: { message?: string } } } }>(auth, `/media/upload/${id}/finalize`, { method: "POST" })).data.processing_info;
      for (let i = 0; info && info.state !== "succeeded" && i < 60; i++) {
        if (info.state === "failed") throw new PlatformError(`X recusou o vídeo: ${info.error?.message ?? "erro no processamento"}`);
        await sleep(Math.min(10, info.check_after_secs ?? 3) * 1000);
        info = (await x<{ data: { processing_info?: { state: string; check_after_secs?: number; error?: { message?: string } } } }>(auth, `/media/upload?command=STATUS&media_id=${id}`)).data.processing_info;
      }
      ids.push(id);
    }
    if (!text && !ids.length) throw new PlatformError("X: escreva um texto ou adicione mídia.");
    const o = p.options;
    const poll = optList(o, "enquete_opcoes");
    const reply = tweetId(optStr(o, "responder_a")), quote = tweetId(optStr(o, "citar"));
    const who = optStr(o, "quem_responde");
    const body: Record<string, unknown> = { ...(text ? { text } : {}), ...(ids.length ? { media: { media_ids: ids } } : {}) };
    if (poll.length >= 2 && !ids.length) body.poll = { options: poll.slice(0, 4).map((s) => s.slice(0, 25)), duration_minutes: optNum(o, "enquete_minutos") ?? 1440 };
    if (reply) body.reply = { in_reply_to_tweet_id: reply };
    else if (quote) body.quote_tweet_id = quote;
    if (who === "seguidos") body.reply_settings = "following";
    else if (who === "mencionados") body.reply_settings = "mentionedUsers";
    const post = (b: Record<string, unknown>) => x<{ data: { id: string } }>(auth, "/tweets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    const r = await post(body);
    const user = String(account.detail.usuario ?? "");
    const avisos: string[] = [];
    if (graphemes(text) > 280) avisos.push("Texto acima de 280 caracteres: só contas Premium publicam assim.");
    let prev = r.data.id;
    for (const [i, t] of optList(o, "thread").entries()) {
      try { prev = (await post({ text: t, reply: { in_reply_to_tweet_id: prev } })).data.id; }
      catch (e) { avisos.push(`Thread parou no item ${i + 1}: ${(e as Error).message}`); break; }
    }
    return { id: r.data.id, permalink: user ? `https://x.com/${user}/status/${r.data.id}` : `https://x.com/i/web/status/${r.data.id}`, aviso: avisos.join(" ") || undefined };
  },
};
