/**
 * WhatsApp Business — Cloud API (Graph API da Meta).
 * App do NinePro: META_APP_ID, META_APP_SECRET (o mesmo app da Meta, com o produto WhatsApp).
 * Opcionais: META_GRAPH_VERSION, WHATSAPP_SCOPES, WHATSAPP_CONFIG_ID (Login do Facebook para Empresas).
 */
import { metaVersion } from "./meta.js";
import { http, PlatformError, type ChannelProvider, type Env, type ExchangeResult, type NChannelAccount, type StoredAuth } from "./types.js";

const graph = (env: Env) => `https://graph.facebook.com/${metaVersion(env)}`;
const expired = (_s: number, b: Record<string, unknown>) => { const c = (b.error as { code?: number } | undefined)?.code; return c === 190 || c === 102; };
const call = <T = Record<string, unknown>>(url: string, init?: RequestInit) => http<T>("WhatsApp", url, init, expired);
const bearer = (t: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${t}`, ...extra });
export const WA_DEFAULT_SCOPES = "whatsapp_business_management,whatsapp_business_messaging,business_management";
export const waToken = (a: StoredAuth) => { if (!a.accessToken) throw new PlatformError("WhatsApp: conexão sem token. Conecte de novo.", true); return a.accessToken; };

/** Contas WABA liberadas para o token (escopos granulares do debug_token), ou as informadas pelo cliente. */
async function findWabas(env: Env, token: string, hint?: string): Promise<string[]> {
  const given = (hint ?? "").split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /^\d{6,25}$/.test(s));
  if (given.length) return [...new Set(given)];
  const d = await call<{ data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }>(`${graph(env)}/debug_token?${new URLSearchParams({ input_token: token, access_token: token })}`).catch(() => ({ data: undefined }));
  const ids = (d.data?.granular_scopes ?? []).filter((g) => g.scope.startsWith("whatsapp_business")).flatMap((g) => g.target_ids ?? []);
  if (!ids.length) throw new PlatformError("Não encontramos contas do WhatsApp Business liberadas para este acesso. Informe o ID da conta do WhatsApp Business (WABA).");
  return [...new Set(ids)];
}

async function inspect(env: Env, token: string, wabaHint?: string) {
  const me = await call<{ id: string; name?: string }>(`${graph(env)}/me?${new URLSearchParams({ fields: "id,name" })}`, { headers: bearer(token) });
  const wabas = await findWabas(env, token, wabaHint);
  return { user: { id: me.id, name: me.name ?? "WhatsApp Business" }, scopes: WA_DEFAULT_SCOPES.split(","), wabas };
}

const QUALITY: Record<string, string> = { GREEN: "Alta", YELLOW: "Média", RED: "Baixa", UNKNOWN: "—" };
const STATUS: Record<string, string> = { CONNECTED: "ativo", PENDING: "pendente", FLAGGED: "sinalizado", RESTRICTED: "restrito", BANNED: "banido", DISCONNECTED: "desconectado", MIGRATED: "migrado", OFFLINE: "offline", UNVERIFIED: "não verificado" };

export const whatsappProvider: ChannelProvider = {
  id: "whatsapp",
  label: "WhatsApp Business",
  nineproApp: (env) => (env.META_APP_ID && env.META_APP_SECRET ? { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET, extra: env.WHATSAPP_CONFIG_ID ? { configId: env.WHATSAPP_CONFIG_ID } : undefined } : null),
  scopes: (env) => (env.WHATSAPP_SCOPES || WA_DEFAULT_SCOPES).split(","),
  appFields: [
    { key: "appId", label: "ID do app", placeholder: "123456789012345", pattern: "^\\d{5,20}$", hint: "Configurações do app › Básico" },
    { key: "appSecret", label: "Chave secreta do app", secret: true, placeholder: "32 caracteres", pattern: "^[0-9a-fA-F]{32}$" },
    { key: "configId", label: "ID da configuração (opcional)", optional: true, pattern: "^\\d{5,25}$", hint: "Só se usa Login do Facebook para Empresas." },
    { key: "wabaId", label: "ID da conta do WhatsApp Business (opcional)", optional: true, placeholder: "Encontramos sozinhos", hint: "WhatsApp › Configuração da API" },
  ],
  tokenFields: [
    { key: "accessToken", label: "Token de acesso permanente", secret: true, multiline: true, placeholder: "EAAG…", hint: "Token de usuário do sistema com whatsapp_business_messaging e whatsapp_business_management." },
    { key: "wabaId", label: "ID da conta do WhatsApp Business (WABA)", optional: true, pattern: "^[\\d\\s,]{6,200}$", placeholder: "Opcional: encontramos sozinhos", hint: "WhatsApp › Configuração da API" },
    { key: "appSecret", label: "Chave secreta do app (opcional)", secret: true, optional: true, pattern: "^[0-9a-fA-F]{32}$", hint: "Usada para conferir a assinatura dos webhooks." },
  ],
  authorizeUrl(env, app, redirectUri, state) {
    const u = new URL(`https://www.facebook.com/${metaVersion(env)}/dialog/oauth`);
    const p: Record<string, string> = { client_id: app.appId, redirect_uri: redirectUri, state, response_type: "code" };
    if (app.extra?.configId) { p.config_id = app.extra.configId; p.override_default_response_type = "true"; } else p.scope = this.scopes(env).join(",");
    u.search = new URLSearchParams(p).toString();
    return u.toString();
  },
  async exchangeCode(env, app, code, redirectUri): Promise<ExchangeResult> {
    const g = graph(env);
    const short = await call<{ access_token: string }>(`${g}/oauth/access_token?${new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, redirect_uri: redirectUri, code })}`);
    const long = await call<{ access_token: string; expires_in?: number }>(`${g}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: short.access_token })}`).catch(() => ({ access_token: short.access_token, expires_in: undefined }));
    const info = await inspect(env, long.access_token, app.extra?.wabaId);
    return { auth: { accessToken: long.access_token, extra: { wabas: info.wabas.join(","), appSecret: app.appSecret } }, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null, user: info.user, scopes: info.scopes };
  },
  async fromToken(env, f) {
    const t = (f.accessToken ?? "").trim();
    if (t.length < 50 || /\s/.test(t)) throw new PlatformError("Cole o token completo, sem espaços.");
    const info = await inspect(env, t, f.wabaId);
    const extra: Record<string, string> = { wabas: info.wabas.join(",") };
    if (f.appSecret) extra.appSecret = f.appSecret;
    return { auth: { accessToken: t, extra }, expiresAt: null, user: info.user, scopes: info.scopes };
  },
  async ready(_env, auth) { return auth; },
  async discover(env, auth) {
    const t = waToken(auth);
    const out: NChannelAccount[] = [];
    for (const waba of (auth.extra?.wabas ?? "").split(",").filter(Boolean)) {
      const info = await call<{ name?: string }>(`${graph(env)}/${waba}?fields=name`, { headers: bearer(t) }).catch(() => ({ name: undefined }));
      const nums = await call<{ data: { id: string; display_phone_number: string; verified_name?: string; quality_rating?: string; status?: string; code_verification_status?: string; name_status?: string; messaging_limit_tier?: string; platform_type?: string }[] }>(
        `${graph(env)}/${waba}/phone_numbers?${new URLSearchParams({ fields: "id,display_phone_number,verified_name,quality_rating,status,code_verification_status,name_status,messaging_limit_tier,platform_type", limit: "100" })}`, { headers: bearer(t) });
      for (const n of nums.data) out.push({
        externalId: n.id, parentExternalId: waba, name: n.display_phone_number, displayName: n.verified_name ?? null, status: STATUS[n.status ?? ""] ?? (n.status ?? "ativo").toLowerCase(),
        quality: QUALITY[n.quality_rating ?? "UNKNOWN"] ?? null,
        detail: { waba, wabaName: info.name ?? null, limite: n.messaging_limit_tier ?? null, verificacao: n.code_verification_status ?? null, nome: n.name_status ?? null, plataforma: n.platform_type ?? null },
      });
    }
    return out;
  },
  async subscribe(env, auth, accounts) {
    const t = waToken(auth);
    const errs: string[] = [];
    for (const waba of new Set(accounts.map((a) => a.parentExternalId).filter(Boolean) as string[])) {
      await call(`${graph(env)}/${waba}/subscribed_apps`, { method: "POST", headers: bearer(t) }).catch((e) => errs.push(e instanceof Error ? e.message : String(e)));
    }
    return errs[0] ?? null;
  },
};

/* ------------------------------------------------------------------ mensagens */
type SendResult = { messages?: { id: string }[] };
const send = async (env: Env, token: string, phoneId: string, payload: Record<string, unknown>) => {
  const r = await call<SendResult>(`${graph(env)}/${phoneId}/messages`, { method: "POST", headers: bearer(token, { "content-type": "application/json" }), body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }) });
  return r.messages?.[0]?.id ?? null;
};
export const waSendText = (env: Env, token: string, phoneId: string, to: string, body: string) => send(env, token, phoneId, { to, type: "text", text: { body, preview_url: /https?:\/\//.test(body) } });
export const waSendMedia = (env: Env, token: string, phoneId: string, to: string, type: "image" | "video" | "document" | "audio", link: string, caption?: string) =>
  send(env, token, phoneId, { to, type, [type]: { link, ...(caption && type !== "audio" ? { caption } : {}) } });
export const waSendTemplate = (env: Env, token: string, phoneId: string, to: string, name: string, language: string, bodyParams: string[], headerParams: string[] = []) => {
  const components: Record<string, unknown>[] = [];
  if (headerParams.length) components.push({ type: "header", parameters: headerParams.map((text) => ({ type: "text", text })) });
  if (bodyParams.length) components.push({ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) });
  return send(env, token, phoneId, { to, type: "template", template: { name, language: { code: language }, ...(components.length ? { components } : {}) } });
};
export const waMarkRead = (env: Env, token: string, phoneId: string, messageId: string) =>
  call(`${graph(env)}/${phoneId}/messages`, { method: "POST", headers: bearer(token, { "content-type": "application/json" }), body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }) });

/** Baixa uma mídia recebida (a URL da Meta exige o token). */
export async function waDownloadMedia(env: Env, token: string, mediaId: string): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const meta = await call<{ url?: string; mime_type?: string }>(`${graph(env)}/${mediaId}`, { headers: bearer(token) });
  if (!meta.url) return null;
  const res = await fetch(meta.url, { headers: bearer(token), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  return { bytes: await res.arrayBuffer(), mime: meta.mime_type ?? res.headers.get("content-type") ?? "application/octet-stream" };
}

/* ------------------------------------------------------------------ modelos */
export interface WaTemplate { id: string; name: string; language: string; category?: string; status?: string; rejected_reason?: string; components?: unknown[] }
export async function waListTemplates(env: Env, token: string, waba: string): Promise<WaTemplate[]> {
  const out: WaTemplate[] = [];
  let url: string | null = `${graph(env)}/${waba}/message_templates?${new URLSearchParams({ fields: "id,name,language,category,status,rejected_reason,components", limit: "200" })}`;
  while (url && out.length < 5000) {
    const page: { data: WaTemplate[]; paging?: { next?: string } } = await call(url, { headers: bearer(token) });
    out.push(...page.data);
    url = page.paging?.next ?? null;
  }
  return out;
}
export const waCreateTemplate = (env: Env, token: string, waba: string, payload: Record<string, unknown>) =>
  call<{ id: string; status?: string; category?: string }>(`${graph(env)}/${waba}/message_templates`, { method: "POST", headers: bearer(token, { "content-type": "application/json" }), body: JSON.stringify(payload) });
export const waDeleteTemplate = (env: Env, token: string, waba: string, name: string, id?: string) =>
  call(`${graph(env)}/${waba}/message_templates?${new URLSearchParams({ name, ...(id ? { hsm_id: id } : {}) })}`, { method: "DELETE", headers: bearer(token) });
