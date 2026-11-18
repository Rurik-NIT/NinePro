/**
 * Slack — publica mensagens (texto, imagens, vídeos e arquivos) em canais. Cada canal vira uma conta.
 * App do NinePro: SLACK_CLIENT_ID / SLACK_CLIENT_SECRET (OAuth v2, bot). Ou token de bot (xoxb-…).
 */
import { download, http, optBool, optStr, PlatformError, type ChannelProvider, type Env, type ExchangeResult, type StoredAuth } from "./types.js";

const SCOPES = ["chat:write", "chat:write.public", "channels:read", "groups:read", "files:write"];
type SlackRes = { ok: boolean; error?: string } & Record<string, unknown>;
async function slack<T extends SlackRes>(token: string, method: string, body?: Record<string, unknown>, form = false): Promise<T> {
  const init: RequestInit = body === undefined ? { headers: { authorization: `Bearer ${token}` } }
    : form ? { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])) }
    : { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) };
  const r = await http<T>("Slack", `https://slack.com/api/${method}`, init, () => false);
  if (!r.ok) {
    const e = r.error ?? "erro";
    const expired = ["invalid_auth", "token_revoked", "account_inactive", "not_authed"].includes(e);
    throw new PlatformError(expired ? "Slack: a autorização expirou ou foi revogada. Conecte de novo." : e === "not_in_channel" ? "Slack: o app precisa ser adicionado ao canal privado (/invite @app)." : e === "missing_scope" ? "Slack: faltam permissões no app. Conecte de novo." : `Slack: ${e}`, expired);
  }
  return r;
}
const tok = (a: StoredAuth) => { if (!a.accessToken) throw new PlatformError("Slack: conexão sem token.", true); return a.accessToken; };
async function result(token: string, team: string, extra: Record<string, string>, scopes: string[]): Promise<ExchangeResult> {
  const t = await slack<SlackRes & { team: string; team_id: string; url: string; user_id: string }>(token, "auth.test", {});
  return { auth: { accessToken: token, extra: { ...extra, team: t.team || team, teamId: t.team_id, url: t.url } }, expiresAt: null, user: { id: t.team_id, name: t.team || team }, scopes };
}

export const slackProvider: ChannelProvider = {
  id: "slack",
  label: "Slack",
  limits: { text: 40000, images: 10, videos: 10, textOnly: true, mixed: true },
  nineproApp: (env: Env) => (env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET ? { appId: env.SLACK_CLIENT_ID, appSecret: env.SLACK_CLIENT_SECRET } : null),
  scopes: () => SCOPES,
  appFields: [
    { key: "appId", label: "Client ID", placeholder: "1234567890.1234567890", hint: "api.slack.com/apps › seu app › Basic Information (Bot Token Scopes: chat:write, chat:write.public, channels:read, groups:read, files:write)" },
    { key: "appSecret", label: "Client secret", secret: true },
  ],
  tokenFields: [{ key: "accessToken", label: "Token do bot", secret: true, placeholder: "xoxb-…", hint: "api.slack.com/apps › seu app › OAuth & Permissions › Bot User OAuth Token (instale o app no workspace)." }],
  authorizeUrl(_env, app, redirectUri, state) {
    const u = new URL("https://slack.com/oauth/v2/authorize");
    u.search = new URLSearchParams({ client_id: app.appId, scope: SCOPES.join(","), redirect_uri: redirectUri, state }).toString();
    return u.toString();
  },
  async exchangeCode(_env, app, code, redirectUri) {
    const r = await http<SlackRes & { access_token?: string; scope?: string; team?: { name?: string } }>("Slack", "https://slack.com/api/oauth.v2.access", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, code, redirect_uri: redirectUri }) });
    if (!r.ok || !r.access_token) throw new PlatformError(`Slack: ${r.error ?? "não autorizou"}`);
    return result(r.access_token, r.team?.name ?? "Slack", {}, (r.scope ?? SCOPES.join(",")).split(","));
  },
  async fromToken(_env, f) {
    const t = (f.accessToken ?? "").trim();
    if (!/^xox[bp]-/.test(t)) throw new PlatformError("Cole o token do bot (começa com xoxb-).");
    return result(t, "Slack", {}, SCOPES);
  },
  async ready(_env, auth) { return auth; },
  async discover(_env, auth) {
    const out = [];
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const r = await slack<SlackRes & { channels: { id: string; name: string; is_private: boolean; is_member: boolean; num_members?: number; is_archived?: boolean }[]; response_metadata?: { next_cursor?: string } }>(tok(auth), `conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      for (const c of r.channels ?? []) if (!c.is_archived && (c.is_member || !c.is_private)) out.push({ externalId: c.id, name: `#${c.name}`, displayName: auth.extra?.team ?? null, status: "ativo", detail: { privado: c.is_private, membros: c.num_members ?? null, link: auth.extra?.url ? `${auth.extra.url}archives/${c.id}` : null } });
      cursor = r.response_metadata?.next_cursor ?? "";
      if (!cursor) break;
    }
    return out.slice(0, 300);
  },
  async subscribe() { return null; },
  async accountStats(_env, auth, account) {
    const r = await slack<SlackRes & { channel: { num_members?: number } }>(tok(auth), `conversations.info?channel=${account.externalId}&include_num_members=true`);
    return { followers: r.channel.num_members ?? null };
  },
  async publish(_env, auth, account, p) {
    const token = tok(auth); const channel = account.externalId;
    const o = p.options; const text = p.text.trim();
    const thread = optStr(o, "responder_em");
    const unfurl = !optBool(o, "sem_previa_de_link");
    if (!p.media.length) {
      if (!text) throw new PlatformError("Slack: escreva um texto ou adicione mídia.");
      const r = await slack<SlackRes & { ts: string }>(token, "chat.postMessage", { channel, text, unfurl_links: unfurl, unfurl_media: unfurl, ...(thread ? { thread_ts: thread } : {}) });
      const link = await slack<SlackRes & { permalink: string }>(token, `chat.getPermalink?channel=${channel}&message_ts=${r.ts}`).catch(() => null);
      return { id: r.ts, permalink: link?.permalink ?? null };
    }
    const files: { id: string; title: string }[] = [];
    for (const m of p.media.slice(0, 10)) {
      const f = await download("Slack", m.url, 1_000_000_000);
      const up = await slack<SlackRes & { upload_url: string; file_id: string }>(token, "files.getUploadURLExternal", { filename: f.name || (m.type === "video" ? "video.mp4" : "imagem.jpg"), length: f.size }, true);
      const put = await fetch(up.upload_url, { method: "POST", body: f.bytes as BodyInit });
      if (!put.ok) throw new PlatformError(`Slack: falha no envio do arquivo (HTTP ${put.status}).`);
      files.push({ id: up.file_id, title: f.name || "arquivo" });
    }
    const r = await slack<SlackRes & { files?: { id: string; permalink?: string }[] }>(token, "files.completeUploadExternal", { files, channel_id: channel, ...(text ? { initial_comment: text } : {}), ...(thread ? { thread_ts: thread } : {}) });
    return { id: r.files?.[0]?.id ?? files[0].id, permalink: r.files?.[0]?.permalink ?? null };
  },
  async comment(_env, auth, account, postId, text) {
    if (!/^\d+\.\d+$/.test(postId)) throw new PlatformError("Slack: primeiro comentário só em mensagens de texto.");
    const r = await slack<SlackRes & { ts: string }>(tok(auth), "chat.postMessage", { channel: account.externalId, text, thread_ts: postId });
    return { id: r.ts };
  },
};
