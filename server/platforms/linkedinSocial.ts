/**
 * LinkedIn (publicações) — Posts API. Usa o mesmo app dos anúncios (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET)
 * com o produto "Share on LinkedIn" (perfil) e, se aprovado, "Community Management API" (Páginas da empresa).
 * Opcionais: LINKEDIN_SOCIAL_SCOPES, LINKEDIN_API_VERSION.
 */
import { download, http, PlatformError, sleep, type ChannelProvider, type Env, type ExchangeResult, type StoredAuth } from "./types.js";

const API = "https://api.linkedin.com/rest";
export const LIS_DEFAULT_SCOPES = "openid profile w_member_social";
const ORG_SCOPES = ["w_organization_social", "r_organization_social", "rw_organization_admin"];
const enc = encodeURIComponent;
const tok = (a: StoredAuth) => { if (!a.accessToken) throw new PlatformError("LinkedIn: conexão sem token. Conecte de novo.", true); return a.accessToken; };
const headers = (env: Env, a: StoredAuth, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${tok(a)}`, "LinkedIn-Version": env.LINKEDIN_API_VERSION || "202606", "X-Restli-Protocol-Version": "2.0.0", "content-type": "application/json", ...extra });
const li = <T>(env: Env, a: StoredAuth, path: string, init?: RequestInit) => http<T>("LinkedIn", `${API}${path}`, { ...init, headers: { ...headers(env, a), ...(init?.headers as Record<string, string> | undefined) } });
/** “little text format”: caracteres reservados precisam de barra invertida. */
const escape = (s: string) => s.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);

async function result(token: string, expiresIn: number | undefined, scopes: string[]): Promise<ExchangeResult> {
  const u = await http<{ sub: string; name?: string }>("LinkedIn", "https://api.linkedin.com/v2/userinfo", { headers: { authorization: `Bearer ${token}` } });
  return { auth: { accessToken: token, extra: { personId: u.sub, personName: u.name ?? "Perfil" } }, expiresAt: new Date(Date.now() + (expiresIn ?? 60 * 86400) * 1000).toISOString(), user: { id: u.sub, name: u.name ?? "LinkedIn" }, scopes };
}

export const linkedinSocialProvider: ChannelProvider = {
  id: "linkedin_social",
  label: "LinkedIn",
  limits: { text: 3000, images: 20, videos: 1, textOnly: true, mixed: false },
  nineproApp: (env) => (env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET ? { appId: env.LINKEDIN_CLIENT_ID, appSecret: env.LINKEDIN_CLIENT_SECRET } : null),
  scopes: (env) => (env.LINKEDIN_SOCIAL_SCOPES || LIS_DEFAULT_SCOPES).split(/[\s,]+/),
  appFields: [
    { key: "appId", label: "Client ID", placeholder: "86abc123xyz", hint: "LinkedIn Developers › seu app › Auth (produtos: Sign In with LinkedIn using OpenID Connect e Share on LinkedIn)" },
    { key: "appSecret", label: "Client secret", secret: true },
  ],
  tokenFields: [{ key: "accessToken", label: "Token de acesso", secret: true, multiline: true, hint: "LinkedIn Developers › Token generator com openid, profile e w_member_social. Vale 60 dias." }],
  authorizeUrl(env, app, redirectUri, state) {
    const u = new URL("https://www.linkedin.com/oauth/v2/authorization");
    u.search = new URLSearchParams({ response_type: "code", client_id: app.appId, redirect_uri: redirectUri, state, scope: this.scopes(env).join(" ") }).toString();
    return u.toString();
  },
  async exchangeCode(env, app, code, redirectUri) {
    const r = await http<{ access_token: string; expires_in: number; scope?: string }>("LinkedIn", "https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: app.appId, client_secret: app.appSecret }) });
    return result(r.access_token, r.expires_in, (r.scope ?? this.scopes(env).join(" ")).split(/[\s,]+/));
  },
  async fromToken(env, f) {
    const t = (f.accessToken ?? "").trim();
    if (t.length < 30 || /\s/.test(t)) throw new PlatformError("Cole o token completo, sem espaços.");
    return result(t, undefined, this.scopes(env));
  },
  async ready(_env, auth) { return auth; },
  async discover(env, auth) {
    const out: { externalId: string; name: string; displayName: string | null; status: string; detail: Record<string, unknown> }[] = [
      { externalId: `urn:li:person:${auth.extra?.personId}`, name: auth.extra?.personName ?? "Perfil", displayName: "Perfil pessoal", status: "ativo", detail: { tipo: "perfil" } },
    ];
    try {
      const acls = await li<{ elements?: { organization: string }[] }>(env, auth, "/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100");
      for (const a of acls.elements ?? []) {
        const id = a.organization.split(":").pop()!;
        const org = await li<{ localizedName?: string; vanityName?: string }>(env, auth, `/organizations/${id}`).catch(() => ({ localizedName: `Página ${id}`, vanityName: undefined }));
        out.push({ externalId: a.organization, name: org.localizedName ?? `Página ${id}`, displayName: "Página da empresa", status: "ativo", detail: { tipo: "pagina", vanity: org.vanityName ?? null } });
      }
    } catch { /* sem Community Management API: só o perfil */ }
    return out;
  },
  async subscribe() { return null; },
  async publish(env, auth, account, p) {
    const owner = account.externalId;
    const images = p.media.filter((m) => m.type === "image");
    const video = p.media.find((m) => m.type === "video");
    if (video && images.length) throw new PlatformError("LinkedIn: publique imagens ou um vídeo, não os dois juntos.");
    const put = async (url: string, bytes: Uint8Array, type: string) => {
      const r = await fetch(url, { method: "PUT", headers: { authorization: `Bearer ${tok(auth)}`, "content-type": type }, body: bytes as BodyInit });
      if (!r.ok) throw new PlatformError(`LinkedIn: falha no envio da mídia (HTTP ${r.status}).`);
      return r.headers.get("etag") ?? "";
    };
    let content: Record<string, unknown> | undefined;
    if (images.length) {
      const urns: string[] = [];
      for (const m of images.slice(0, 20)) {
        const f = await download("LinkedIn", m.url, 36_000_000);
        const init = await li<{ value: { uploadUrl: string; image: string } }>(env, auth, "/images?action=initializeUpload", { method: "POST", body: JSON.stringify({ initializeUploadRequest: { owner } }) });
        await put(init.value.uploadUrl, f.bytes, f.type);
        urns.push(init.value.image);
      }
      content = urns.length === 1 ? { media: { id: urns[0] } } : { multiImage: { images: urns.map((id) => ({ id, altText: "" })) } };
    } else if (video) {
      const f = await download("LinkedIn", video.url, 500_000_000);
      const init = await li<{ value: { video: string; uploadToken?: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] } }>(env, auth, "/videos?action=initializeUpload", { method: "POST", body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes: f.size, uploadCaptions: false, uploadThumbnail: false } }) });
      const etags: string[] = [];
      for (const part of init.value.uploadInstructions) etags.push(await put(part.uploadUrl, f.bytes.subarray(part.firstByte, part.lastByte + 1), "application/octet-stream"));
      await li(env, auth, "/videos?action=finalizeUpload", { method: "POST", body: JSON.stringify({ finalizeUploadRequest: { video: init.value.video, uploadToken: init.value.uploadToken ?? "", uploadedPartIds: etags } }) });
      for (let i = 0; i < 30; i++) {
        const s = await li<{ status?: string }>(env, auth, `/videos/${enc(init.value.video)}`).catch(() => ({ status: undefined }));
        if (s.status === "AVAILABLE") break;
        if (s.status === "PROCESSING_FAILED") throw new PlatformError("LinkedIn não conseguiu processar o vídeo.");
        await sleep(3000);
      }
      content = { media: { id: init.value.video, ...(p.title ? { title: p.title.slice(0, 200) } : {}) } };
    }
    const body = { author: owner, commentary: escape(p.text.trim()), visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false, ...(content ? { content } : {}) };
    const r = await fetch(`${API}/posts`, { method: "POST", headers: headers(env, auth), body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
    if (!r.ok) {
      const b = (await r.json().catch(() => ({}))) as { message?: string };
      throw new PlatformError(r.status === 401 ? "LinkedIn: a autorização expirou (vale 60 dias). Conecte de novo." : r.status === 403 && owner.includes("organization") ? "LinkedIn: publicar em Página exige a Community Management API aprovada no app." : `LinkedIn: ${b.message ?? `HTTP ${r.status}`}`, r.status === 401);
    }
    const id = r.headers.get("x-restli-id") ?? "";
    return { id, permalink: id ? `https://www.linkedin.com/feed/update/${id}/` : null };
  },
};
export const LINKEDIN_ORG_SCOPES = ORG_SCOPES;
