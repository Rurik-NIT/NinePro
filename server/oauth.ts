/**
 * OAuth 2.1 do NinePro para agentes de IA (Claude, ChatGPT, Grok, Cursor…) se conectarem ao MCP
 * com um clique, sem colar chave de API.
 *  - GET  /.well-known/oauth-protected-resource      (RFC 9728) → aponta o servidor de autorização
 *  - GET  /.well-known/oauth-authorization-server    (RFC 8414) → endpoints e escopos
 *  - POST /api/oauth/register                        (RFC 7591) → registro dinâmico do agente (cliente público)
 *  - GET  /oauth/autorizar                           → tela do app: a pessoa entra, escolhe o espaço e as permissões
 *  - POST /api/oauth/token                           → troca o código (PKCE S256) e renova tokens
 *  - POST /api/oauth/revoke                          (RFC 7009)
 * Tokens e códigos são guardados só como hash SHA-256.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;

/** Permissões que o agente pode receber. A ordem é a da tela de autorização. */
export const SCOPES: Record<string, { titulo: string; descricao: string }> = {
  leitura: { titulo: "Ler dados", descricao: "Campanhas, métricas, leads, contas conectadas, publicações, conversas e comentários" },
  publicacoes: { titulo: "Publicar e agendar", descricao: "Criar, agendar e publicar posts, reels, carrosséis e stories" },
  mensagens: { titulo: "Enviar mensagens", descricao: "Responder conversas e comentários e enviar modelos do WhatsApp" },
  automacoes: { titulo: "Gerenciar automações", descricao: "Criar, ligar e pausar automações de comentário → DM e respostas automáticas" },
  anuncios: { titulo: "Gerenciar anúncios", descricao: "Pausar e ativar campanhas, criar públicos e regras automáticas. Pode alterar seu investimento" },
  crm: { titulo: "Leads e conversões", descricao: "Registrar leads, mudar o status e enviar conversões" },
};
export const ALL_SCOPES = Object.keys(SCOPES);
const ACCESS_TTL = 3600;               // 1 hora
const REFRESH_TTL = 90 * 86_400;       // 90 dias (renovado a cada uso)
const CODE_TTL = 600;                  // 10 minutos

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, mcp-protocol-version", "access-control-allow-methods": "GET, POST, OPTIONS" };
const json = (status: number, data: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", pragma: "no-cache", ...CORS, ...extra } });
const oauthErr = (status: number, error: string, description: string) => json(status, { error, error_description: description });

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
const b64urlSha256 = (s: string) => createHash("sha256").update(s).digest("base64url");
const token = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;
const nowIso = () => new Date().toISOString();
const later = (secs: number) => new Date(Date.now() + secs * 1000).toISOString();

function service(env: Env): SupabaseClient | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
export const originOf = (req: Request, env: Env) => { const u = new URL(req.url); return (env.PUBLIC_URL || `${u.protocol}//${u.host}`).replace(/\/$/, ""); };

/** Escopos pedidos → só os conhecidos; vazio = todos. */
export const parseScopes = (raw: unknown) => {
  const list = (Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/[\s,]+/)).map((s) => s.trim()).filter(Boolean);
  const known = [...new Set(list.filter((s) => ALL_SCOPES.includes(s)))];
  return known.length ? known : list.length ? ["leitura"] : [...ALL_SCOPES];
};

/* ------------------------------------------------------------------ endereços de retorno */
const isLoopback = (u: URL) => u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
function validRedirect(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    if (isLoopback(u)) return true;
    // apps nativos (cursor://, vscode://, claude://…), nunca esquemas perigosos
    return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !["http:", "javascript:", "data:", "file:", "vbscript:", "blob:", "about:"].includes(u.protocol);
  } catch { return false; }
}
/** Igual ao registrado; em loopback a porta pode mudar (RFC 8252). */
export function redirectAllowed(registered: string[], asked: string) {
  if (registered.includes(asked)) return true;
  try {
    const a = new URL(asked);
    if (!isLoopback(a)) return false;
    return registered.some((r) => { try { const b = new URL(r); return isLoopback(b) && b.hostname === a.hostname && b.pathname === a.pathname; } catch { return false; } });
  } catch { return false; }
}

/* ------------------------------------------------------------------ metadados */
function protectedResource(origin: string) {
  return { resource: `${origin}/api/mcp`, authorization_servers: [origin], scopes_supported: ALL_SCOPES, bearer_methods_supported: ["header"], resource_name: "NinePro", resource_documentation: `${origin}/integracao` };
}
function authServer(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/autorizar`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ALL_SCOPES,
    service_documentation: `${origin}/integracao`,
  };
}

async function readBody(req: Request): Promise<Json> {
  const text = (await req.text()).slice(0, 20_000);
  if ((req.headers.get("content-type") ?? "").includes("application/json")) { try { return JSON.parse(text) as Json; } catch { return {}; } }
  return Object.fromEntries(new URLSearchParams(text));
}

/* ------------------------------------------------------------------ roteador */
export async function handleOauth(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const origin = originOf(req, env);
  const r = url.searchParams.get("r") ?? (
    url.pathname.includes("oauth-protected-resource") ? "resource"
      : /oauth-authorization-server|openid-configuration/.test(url.pathname) ? "as"
        : url.pathname.replace(/^\/api\/oauth\/?/, "").split("/")[0]);
  if (r === "resource") return json(200, protectedResource(origin), { "cache-control": "public, max-age=3600" });
  if (r === "as") return json(200, authServer(origin), { "cache-control": "public, max-age=3600" });
  if (req.method !== "POST") return oauthErr(405, "invalid_request", "Use POST.");
  const sb = service(env);
  if (!sb) return oauthErr(503, "temporarily_unavailable", "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada.");
  const body = await readBody(req);
  if (r === "register") return register(sb, body);
  if (r === "token") return tokenEndpoint(sb, body);
  if (r === "revoke") return revoke(sb, body);
  return oauthErr(404, "invalid_request", "Endereço OAuth desconhecido.");
}

async function register(sb: SupabaseClient, b: Json) {
  const uris = (Array.isArray(b.redirect_uris) ? b.redirect_uris : []).map((u) => String(u).slice(0, 500));
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) return oauthErr(400, "invalid_redirect_uri", "Informe de 1 a 10 redirect_uris válidos (https, localhost ou esquema de app).");
  const method = String(b.token_endpoint_auth_method ?? "none");
  if (method !== "none") return oauthErr(400, "invalid_client_metadata", "Só clientes públicos com PKCE (token_endpoint_auth_method=none).");
  const name = String(b.client_name ?? "").trim().slice(0, 80) || "Agente de IA";
  const client_id = `npc_${randomBytes(16).toString("hex")}`;
  const safeUri = (v: unknown) => { const s = String(v ?? ""); return /^https:\/\//.test(s) ? s.slice(0, 300) : null; };
  const { error } = await sb.from("oauth_clients").insert({ client_id, name, redirect_uris: uris, logo_uri: safeUri(b.logo_uri), client_uri: safeUri(b.client_uri) });
  if (error) return oauthErr(500, "server_error", error.message);
  return json(201, { client_id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris: uris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" });
}

async function issue(sb: SupabaseClient, p: { workspaceId: string; userId: string | null; clientId: string; clientName: string; scopes: string[] }) {
  const access = token("npo_at_"), refresh = token("npo_rt_");
  const { error } = await sb.from("oauth_tokens").insert({ workspace_id: p.workspaceId, user_id: p.userId, client_id: p.clientId, client_name: p.clientName, scopes: p.scopes, access_hash: sha256Hex(access), access_expires_at: later(ACCESS_TTL), refresh_hash: sha256Hex(refresh), refresh_expires_at: later(REFRESH_TTL) });
  if (error) throw new Error(error.message);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope: p.scopes.join(" ") };
}

async function tokenEndpoint(sb: SupabaseClient, b: Json) {
  const grant = String(b.grant_type ?? "");
  const clientId = String(b.client_id ?? "");
  if (grant === "authorization_code") {
    const code = String(b.code ?? ""), verifier = String(b.code_verifier ?? ""), redirect = String(b.redirect_uri ?? "");
    if (!code || !verifier) return oauthErr(400, "invalid_request", "code e code_verifier são obrigatórios.");
    const { data: row } = await sb.from("oauth_codes").select("*").eq("code_hash", sha256Hex(code)).maybeSingle();
    if (!row || row.used_at || Date.parse(row.expires_at as string) < Date.now()) return oauthErr(400, "invalid_grant", "Código inválido, expirado ou já usado.");
    // marca como usado antes de emitir (uso único, mesmo em corrida)
    const { data: claimed } = await sb.from("oauth_codes").update({ used_at: nowIso() }).eq("code_hash", row.code_hash).is("used_at", null).select("code_hash");
    if (!claimed?.length) return oauthErr(400, "invalid_grant", "Código já usado.");
    if (clientId && clientId !== row.client_id) return oauthErr(400, "invalid_grant", "O código é de outro cliente.");
    if (redirect && redirect !== row.redirect_uri) return oauthErr(400, "invalid_grant", "redirect_uri diferente do usado na autorização.");
    if (b64urlSha256(verifier) !== row.code_challenge) return oauthErr(400, "invalid_grant", "code_verifier não confere (PKCE).");
    const { data: client } = await sb.from("oauth_clients").select("name").eq("client_id", row.client_id).maybeSingle();
    return json(200, await issue(sb, { workspaceId: row.workspace_id as string, userId: row.user_id as string, clientId: row.client_id as string, clientName: (client?.name as string) ?? "Agente de IA", scopes: row.scopes as string[] }));
  }
  if (grant === "refresh_token") {
    const rt = String(b.refresh_token ?? "");
    const { data: row } = await sb.from("oauth_tokens").select("*").eq("refresh_hash", sha256Hex(rt)).maybeSingle();
    if (!row || row.revoked_at || !row.refresh_expires_at || Date.parse(row.refresh_expires_at as string) < Date.now()) return oauthErr(400, "invalid_grant", "Refresh token inválido, revogado ou expirado. Conecte de novo.");
    if (clientId && clientId !== row.client_id) return oauthErr(400, "invalid_grant", "O token é de outro cliente.");
    // rotação: o token antigo deixa de valer e a conexão continua na mesma linha
    const access = token("npo_at_"), refresh = token("npo_rt_");
    const asked = b.scope ? parseScopes(b.scope).filter((s) => (row.scopes as string[]).includes(s)) : (row.scopes as string[]);
    const { data: upd } = await sb.from("oauth_tokens").update({ access_hash: sha256Hex(access), access_expires_at: later(ACCESS_TTL), refresh_hash: sha256Hex(refresh), refresh_expires_at: later(REFRESH_TTL), scopes: asked.length ? asked : row.scopes }).eq("id", row.id).eq("refresh_hash", row.refresh_hash).select("scopes");
    if (!upd?.length) return oauthErr(400, "invalid_grant", "Refresh token já usado.");
    return json(200, { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope: (upd[0].scopes as string[]).join(" ") });
  }
  return oauthErr(400, "unsupported_grant_type", "Use authorization_code ou refresh_token.");
}

async function revoke(sb: SupabaseClient, b: Json) {
  const t = String(b.token ?? "");
  if (t) {
    const h = sha256Hex(t);
    await sb.from("oauth_tokens").update({ revoked_at: nowIso() }).or(`access_hash.eq.${h},refresh_hash.eq.${h}`).is("revoked_at", null);
  }
  return new Response(null, { status: 200, headers: CORS });
}

/* ------------------------------------------------------------------ usados pela tela de autorização (/api/app, sessão do usuário) */
export async function clientInfo(sb: SupabaseClient, clientId: string, redirectUri: string) {
  const { data } = await sb.from("oauth_clients").select("client_id, name, redirect_uris, client_uri, logo_uri").eq("client_id", clientId).maybeSingle();
  if (!data) return { erro: "Aplicativo não registrado. Volte ao agente e tente conectar de novo." };
  if (!redirectAllowed(data.redirect_uris as string[], redirectUri)) return { erro: "O endereço de retorno não confere com o registrado por este aplicativo." };
  let host = ""; try { host = new URL(redirectUri).host || new URL(redirectUri).protocol.replace(":", ""); } catch { /* */ }
  return { nome: data.name as string, site: (data.client_uri as string | null) ?? null, logo: (data.logo_uri as string | null) ?? null, retorno: host };
}

export async function approve(sb: SupabaseClient, userId: string, p: { clientId: string; redirectUri: string; codeChallenge: string; method: string; scopes: string[]; workspaceId: string; resource?: string }) {
  const info = await clientInfo(sb, p.clientId, p.redirectUri);
  if ("erro" in info) throw new Error(info.erro);
  if (p.method !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(p.codeChallenge)) throw new Error("O agente precisa usar PKCE (S256).");
  const code = token("npo_code_");
  const { error } = await sb.from("oauth_codes").insert({ code_hash: sha256Hex(code), client_id: p.clientId, user_id: userId, workspace_id: p.workspaceId, scopes: p.scopes, redirect_uri: p.redirectUri, code_challenge: p.codeChallenge, resource: p.resource || null, expires_at: later(CODE_TTL) });
  if (error) throw new Error(error.message);
  return code;
}
