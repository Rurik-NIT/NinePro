/**
 * Threads — API do Threads (graph.threads.net). App do NinePro: THREADS_APP_ID, THREADS_APP_SECRET
 * (caso de uso "Acessar a API do Threads" no app da Meta). Opcionais: THREADS_GRAPH_VERSION (v1.0), THREADS_SCOPES.
 * Publica texto (até 500), imagem, vídeo ou carrossel (2 a 20).
 */
import { http, optList, optStr, PlatformError, sleep, type PostStat, type ChannelProvider, type Env, type ExchangeResult, type StoredAuth } from "./types.js";

const ver = (env: Env) => env.THREADS_GRAPH_VERSION || "v1.0";
const th = (env: Env) => `https://graph.threads.net/${ver(env)}`;
const expired = (_s: number, b: Record<string, unknown>) => { const c = (b.error as { code?: number } | undefined)?.code; return c === 190 || c === 102; };
const call = <T = Record<string, unknown>>(url: string, init?: RequestInit) => http<T>("Threads", url, init, expired);
export const TH_DEFAULT_SCOPES = "threads_basic,threads_content_publish,threads_manage_replies,threads_read_replies,threads_manage_insights";
const tok = (a: StoredAuth) => { if (!a.accessToken) throw new PlatformError("Threads: conexão sem token. Conecte de novo.", true); return a.accessToken; };
const DAY = 86_400_000;
interface Me { id: string; username: string; name?: string; threads_profile_picture_url?: string }
const me = (env: Env, t: string) => call<Me>(`${th(env)}/me?${new URLSearchParams({ fields: "id,username,name,threads_profile_picture_url", access_token: t })}`);

async function result(env: Env, token: string, expiresIn: number | undefined, extra: Record<string, string>): Promise<ExchangeResult> {
  const m = await me(env, token);
  return { auth: { accessToken: token, extra: { ...extra, refreshedAt: new Date().toISOString() } }, expiresAt: new Date(Date.now() + (expiresIn ?? 60 * 86400) * 1000).toISOString(), user: { id: m.id, name: `@${m.username}` }, scopes: (env.THREADS_SCOPES || TH_DEFAULT_SCOPES).split(",") };
}

export const threadsProvider: ChannelProvider = {
  id: "threads",
  label: "Threads",
  limits: { text: 500, images: 20, videos: 20, textOnly: true, mixed: true },
  nineproApp: (env) => (env.THREADS_APP_ID && env.THREADS_APP_SECRET ? { appId: env.THREADS_APP_ID, appSecret: env.THREADS_APP_SECRET } : null),
  scopes: (env) => (env.THREADS_SCOPES || TH_DEFAULT_SCOPES).split(","),
  appFields: [
    { key: "appId", label: "ID do app do Threads", placeholder: "123456789012345", pattern: "^\\d{5,20}$", hint: "Meta for Developers › seu app › Casos de uso › Threads › Configurações" },
    { key: "appSecret", label: "Chave secreta do app do Threads", secret: true, pattern: "^[0-9a-fA-F]{32}$" },
  ],
  tokenFields: [{ key: "accessToken", label: "Token de acesso do Threads", secret: true, multiline: true, placeholder: "THAA…", hint: "Gerado no Explorador da Graph API (graph.threads.net) com threads_basic e threads_content_publish." }],
  authorizeUrl(env, app, redirectUri, state) {
    const u = new URL("https://threads.net/oauth/authorize");
    u.search = new URLSearchParams({ client_id: app.appId, redirect_uri: redirectUri, scope: this.scopes(env).join(","), response_type: "code", state }).toString();
    return u.toString();
  },
  async exchangeCode(env, app, code, redirectUri) {
    const short = await call<{ access_token: string }>("https://graph.threads.net/oauth/access_token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code: code.replace(/#_$/, "") }) });
    const long = await call<{ access_token: string; expires_in?: number }>(`https://graph.threads.net/access_token?${new URLSearchParams({ grant_type: "th_exchange_token", client_secret: app.appSecret, access_token: short.access_token })}`);
    return result(env, long.access_token, long.expires_in, {});
  },
  async fromToken(env, f) {
    const t = (f.accessToken ?? "").trim();
    if (t.length < 40 || /\s/.test(t)) throw new PlatformError("Cole o token completo, sem espaços.");
    return result(env, t, undefined, {});
  },
  /** Token longo vale 60 dias; renova depois de 7 dias. */
  async ready(_env, auth) {
    const at = Date.parse(auth.extra?.refreshedAt ?? "");
    if (Number.isFinite(at) && Date.now() - at < 7 * DAY) return auth;
    try {
      const r = await call<{ access_token: string }>(`https://graph.threads.net/refresh_access_token?${new URLSearchParams({ grant_type: "th_refresh_token", access_token: tok(auth) })}`);
      return { ...auth, accessToken: r.access_token, extra: { ...auth.extra, refreshedAt: new Date().toISOString() } };
    } catch (e) { if (e instanceof PlatformError && e.expired) throw e; return auth; }
  },
  async discover(env, auth) {
    const m = await me(env, tok(auth));
    return [{ externalId: m.id, name: `@${m.username}`, displayName: m.name ?? null, picture: m.threads_profile_picture_url ?? null, status: "ativo", detail: { usuario: m.username } }];
  },
  async subscribe() { return null; },
  async stats(env, auth, account, limit) {
    const t = tok(auth);
    type P = { id: string; text?: string; permalink?: string; timestamp?: string; media_type?: string; media_url?: string; thumbnail_url?: string };
    const r = await call<{ data?: P[] }>(`${th(env)}/${account.externalId}/threads?${new URLSearchParams({ fields: "id,text,permalink,timestamp,media_type,media_url,thumbnail_url", limit: String(Math.min(limit, 50)), access_token: t })}`);
    const out: PostStat[] = [];
    for (const p of r.data ?? []) {
      if (p.media_type === "REPOST_FACADE") continue;
      const ins = await call<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`${th(env)}/${p.id}/insights?${new URLSearchParams({ metric: "views,likes,replies,reposts,quotes,shares", access_token: t })}`).catch(() => ({ data: [] }));
      const v = (k: string) => { const m = ins.data.find((x) => x.name === k); return m ? (m.total_value?.value ?? m.values?.[0]?.value ?? 0) : null; };
      out.push({ id: p.id, text: p.text ?? null, permalink: p.permalink ?? null, thumbnail: p.thumbnail_url ?? p.media_url ?? null, type: p.media_type ?? null, postedAt: p.timestamp ?? null, likes: v("likes") ?? 0, comments: v("replies") ?? 0, shares: (v("reposts") ?? 0) + (v("quotes") ?? 0) + (v("shares") ?? 0), views: v("views") });
    }
    return out;
  },
  async accountStats(env, auth, account) {
    const r = await call<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`${th(env)}/${account.externalId}/threads_insights?${new URLSearchParams({ metric: "followers_count,views", access_token: tok(auth) })}`);
    const f = r.data.find((x) => x.name === "followers_count"), vw = r.data.find((x) => x.name === "views");
    return { followers: f?.total_value?.value ?? null, impressions: vw ? (vw.total_value?.value ?? vw.values?.at(-1)?.value ?? null) : null };
  },
  async publish(env, auth, account, p) {
    const t = tok(auth); const uid = account.externalId;
    const create = async (o: Record<string, string>) => (await call<{ id: string }>(`${th(env)}/${uid}/threads`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...o, access_token: t }) })).id;
    const wait = async (id: string) => {
      for (let i = 0; i < 60; i++) {
        const s = await call<{ status?: string; error_message?: string }>(`${th(env)}/${id}?fields=status,error_message&access_token=${encodeURIComponent(t)}`);
        if (s.status === "FINISHED" || s.status === "PUBLISHED") return;
        if (s.status === "ERROR" || s.status === "EXPIRED") throw new PlatformError(`Threads recusou a mídia: ${s.error_message ?? s.status}`);
        await sleep(i < 5 ? 1000 : 3000);
      }
      throw new PlatformError("Threads: o processamento demorou demais. Tente de novo.");
    };
    const text = p.text.trim();
    const item = (m: PublishInput["media"][number], carousel: boolean) => ({ media_type: m.type === "video" ? "VIDEO" : "IMAGE", [m.type === "video" ? "video_url" : "image_url"]: m.url, ...(carousel ? { is_carousel_item: "true" } : {}) });
    const topic = optStr(p.options, "topico").replace(/^#/, "");
    const extra: Record<string, string> = topic ? { topic_tag: topic } : {};
    let container: string;
    if (!p.media.length) container = await create({ media_type: "TEXT", text, ...extra });
    else if (p.media.length === 1) container = await create({ ...item(p.media[0], false), text, ...extra });
    else {
      const children: string[] = [];
      for (const m of p.media.slice(0, 20)) { const id = await create(item(m, true)); await wait(id); children.push(id); }
      container = await create({ media_type: "CAROUSEL", children: children.join(","), text, ...extra });
    }
    await wait(container);
    const publish = async (c: string) => (await call<{ id: string }>(`${th(env)}/${uid}/threads_publish`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ creation_id: c, access_token: t }) })).id;
    const id = await publish(container);
    const info = await call<{ permalink?: string }>(`${th(env)}/${id}?fields=permalink&access_token=${encodeURIComponent(t)}`).catch(() => ({ permalink: undefined }));
    let prev = id; let aviso: string | undefined;
    for (const [i, txt] of optList(p.options, "thread").entries()) {
      try { const c = await create({ media_type: "TEXT", text: txt, reply_to_id: prev }); await wait(c); prev = await publish(c); }
      catch (e) { aviso = `Thread parou no item ${i + 1}: ${(e as Error).message}`; break; }
    }
    return { id, permalink: info.permalink ?? null, aviso };
  },
  async comment(env, auth, account, postId, text) {
    const t = tok(auth); const uid = account.externalId;
    const c = await call<{ id: string }>(`${th(env)}/${uid}/threads`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ media_type: "TEXT", text, reply_to_id: postId, access_token: t }) });
    await sleep(2000);
    return call<{ id: string }>(`${th(env)}/${uid}/threads_publish`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ creation_id: c.id, access_token: t }) });
  },
};
type PublishInput = import("./types.js").PublishInput;
