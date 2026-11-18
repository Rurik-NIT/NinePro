/**
 * Bluesky — AT Protocol. Conexão só por token: o @usuário e uma senha de app (Configurações › Senhas de app).
 * Publica texto (até 300 caracteres) com links e hashtags clicáveis, até 4 imagens ou 1 vídeo.
 */
import { download, graphemes, http, optList, PlatformError, type PostStat, type ChannelProvider, type Env, type StoredAuth } from "./types.js";

const DEFAULT = "https://bsky.social";
interface Session { did: string; handle: string; accessJwt: string; refreshJwt: string }
const svc = (a: StoredAuth) => (a.extra?.service || DEFAULT).replace(/\/$/, "");
const xrpc = <T>(service: string, method: string, init?: RequestInit) => http<T>("Bluesky", `${service}/xrpc/${method}`, init, (s, b) => s === 401 && b.error !== "AuthFactorTokenRequired");

async function createSession(service: string, identifier: string, password: string) {
  return xrpc<Session>(service, "com.atproto.server.createSession", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, password }) });
}
const toAuth = (s: Session, service: string, identifier: string, password: string): StoredAuth => ({ accessToken: s.accessJwt, refreshToken: s.refreshJwt, extra: { service, identifier, password, did: s.did, handle: s.handle, refreshedAt: new Date().toISOString() } });
const bearer = (a: StoredAuth) => ({ authorization: `Bearer ${a.accessToken}` });

/** Links e hashtags viram “facets” (posições em bytes UTF-8). */
function facets(text: string) {
  const enc = new TextEncoder();
  const at = (i: number) => enc.encode(text.slice(0, i)).length;
  const out: Record<string, unknown>[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g)) out.push({ index: { byteStart: at(m.index!), byteEnd: at(m.index! + m[0].length) }, features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }] });
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]{1,64})/gu)) { const s = m.index! + m[1].length; out.push({ index: { byteStart: at(s), byteEnd: at(s + 1 + m[2].length) }, features: [{ $type: "app.bsky.richtext.facet#tag", tag: m[2] }] }); }
  return out;
}

export const blueskyProvider: ChannelProvider = {
  id: "bluesky",
  label: "Bluesky",
  tokenOnly: true,
  limits: { text: 300, images: 4, videos: 1, textOnly: true, mixed: false },
  nineproApp: () => null,
  scopes: () => [],
  appFields: [],
  tokenFields: [
    { key: "identifier", label: "Usuário", placeholder: "suamarca.bsky.social", hint: "O @ da conta (sem o @) ou o e-mail." },
    { key: "password", label: "Senha de app", secret: true, placeholder: "xxxx-xxxx-xxxx-xxxx", hint: "Bluesky › Configurações › Privacidade e segurança › Senhas de app › Adicionar. Não use a senha da conta." },
    { key: "service", label: "Servidor (opcional)", optional: true, placeholder: DEFAULT, hint: "Só se a conta estiver num servidor próprio." },
  ],
  authorizeUrl() { throw new PlatformError("O Bluesky conecta com usuário e senha de app."); },
  async exchangeCode() { throw new PlatformError("O Bluesky conecta com usuário e senha de app."); },
  async fromToken(_env, f) {
    const service = (f.service || DEFAULT).trim().replace(/\/$/, "");
    if (!/^https:\/\//.test(service)) throw new PlatformError("O servidor precisa começar com https://");
    const identifier = (f.identifier ?? "").trim().replace(/^@/, "");
    const s = await createSession(service, identifier, (f.password ?? "").trim());
    return { auth: toAuth(s, service, identifier, (f.password ?? "").trim()), expiresAt: null, user: { id: s.did, name: `@${s.handle}` }, scopes: [] };
  },
  /** Sessão dura ~2 h: renova com o refresh e, se falhar, entra de novo com a senha de app. */
  async ready(_env, auth) {
    const at = Date.parse(auth.extra?.refreshedAt ?? "");
    if (Number.isFinite(at) && Date.now() - at < 60 * 60_000) return auth;
    const service = svc(auth);
    try {
      const s = await xrpc<Session>(service, "com.atproto.server.refreshSession", { method: "POST", headers: { authorization: `Bearer ${auth.refreshToken}` } });
      return toAuth(s, service, auth.extra!.identifier, auth.extra!.password);
    } catch {
      const s = await createSession(service, auth.extra?.identifier ?? "", auth.extra?.password ?? "");
      return toAuth(s, service, auth.extra!.identifier, auth.extra!.password);
    }
  },
  async discover(_env, auth) {
    const p = await xrpc<{ did: string; handle: string; displayName?: string; avatar?: string; followersCount?: number; postsCount?: number }>(svc(auth), `app.bsky.actor.getProfile?actor=${encodeURIComponent(auth.extra?.did ?? "")}`, { headers: bearer(auth) });
    return [{ externalId: p.did, name: `@${p.handle}`, displayName: p.displayName ?? null, picture: p.avatar ?? null, status: "ativo", detail: { seguidores: p.followersCount ?? null, publicacoes: p.postsCount ?? null, usuario: p.handle } }];
  },
  async subscribe() { return null; },
  async stats(_env, auth, account, limit) {
    type F = { post: { uri: string; record?: { text?: string; createdAt?: string }; likeCount?: number; replyCount?: number; repostCount?: number; quoteCount?: number; embed?: { $type?: string; thumbnail?: string; images?: { thumb?: string }[] } }; reason?: unknown };
    const r = await xrpc<{ feed?: F[] }>(svc(auth), `app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(auth.extra?.did ?? account.externalId)}&limit=${Math.min(limit, 100)}&filter=posts_no_replies`, { headers: bearer(auth) });
    const handle = String(account.detail.usuario ?? auth.extra?.handle ?? "");
    return (r.feed ?? []).filter((f) => !f.reason).map((f): PostStat => ({ id: f.post.uri, text: f.post.record?.text ?? null, permalink: handle ? `https://bsky.app/profile/${handle}/post/${f.post.uri.split("/").pop()}` : null, thumbnail: f.post.embed?.thumbnail ?? f.post.embed?.images?.[0]?.thumb ?? null, type: f.post.embed?.$type?.split(".").pop()?.replace("#view", "") ?? "texto", postedAt: f.post.record?.createdAt ?? null, likes: f.post.likeCount ?? 0, comments: f.post.replyCount ?? 0, shares: (f.post.repostCount ?? 0) + (f.post.quoteCount ?? 0) }));
  },
  async accountStats(_env, auth, account) {
    const p = await xrpc<{ followersCount?: number; followsCount?: number; postsCount?: number }>(svc(auth), `app.bsky.actor.getProfile?actor=${encodeURIComponent(auth.extra?.did ?? account.externalId)}`, { headers: bearer(auth) });
    return { followers: p.followersCount ?? null, following: p.followsCount ?? null, posts: p.postsCount ?? null };
  },
  async publish(_env: Env, auth, account, p) {
    const service = svc(auth);
    const text = p.text.trim();
    if (graphemes(text) > 300) throw new PlatformError(`Bluesky: o texto tem ${graphemes(text)} caracteres (máximo 300).`);
    const upload = async (url: string, max: number) => {
      const f = await download("Bluesky", url, max);
      const r = await xrpc<{ blob: Record<string, unknown> }>(service, "com.atproto.repo.uploadBlob", { method: "POST", headers: { ...bearer(auth), "content-type": f.type }, body: f.bytes as BodyInit });
      return r.blob;
    };
    let embed: Record<string, unknown> | undefined;
    const video = p.media.find((m) => m.type === "video");
    if (video) embed = { $type: "app.bsky.embed.video", video: await upload(video.url, 100_000_000) };
    else if (p.media.length) {
      const images = [];
      for (const m of p.media.slice(0, 4)) images.push({ alt: "", image: await upload(m.url, 1_000_000).catch((e) => { throw new PlatformError(e instanceof PlatformError && /grande/.test(e.message) ? "Bluesky: cada imagem pode ter até 1 MB. Envie uma versão menor." : (e as Error).message); }) });
      embed = { $type: "app.bsky.embed.images", images };
    }
    const langs = optList(p.options, "idiomas").filter((l) => /^[a-z]{2,3}(-[A-Z]{2})?$/.test(l)).slice(0, 3);
    const create = (t: string, extra: Record<string, unknown>) => {
      const f = facets(t);
      const record = { $type: "app.bsky.feed.post", text: t, createdAt: new Date().toISOString(), langs: langs.length ? langs : ["pt"], ...(f.length ? { facets: f } : {}), ...extra };
      return xrpc<{ uri: string; cid: string }>(service, "com.atproto.repo.createRecord", { method: "POST", headers: { ...bearer(auth), "content-type": "application/json" }, body: JSON.stringify({ repo: auth.extra?.did, collection: "app.bsky.feed.post", record }) });
    };
    const r = await create(text, embed ? { embed } : {});
    const rkey = r.uri.split("/").pop()!;
    const handle = String(account.detail.usuario ?? auth.extra?.handle ?? "");
    let parent = r; let aviso: string | undefined;
    for (const [i, t] of optList(p.options, "thread").entries()) {
      if (graphemes(t) > 300) { aviso = `Thread parou no item ${i + 1}: mais de 300 caracteres.`; break; }
      try { parent = await create(t, { reply: { root: { uri: r.uri, cid: r.cid }, parent: { uri: parent.uri, cid: parent.cid } } }); }
      catch (e) { aviso = `Thread parou no item ${i + 1}: ${(e as Error).message}`; break; }
    }
    return { id: r.uri, permalink: handle ? `https://bsky.app/profile/${handle}/post/${rkey}` : null, aviso };
  },
};
