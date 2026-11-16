/**
 * API de agentes do NinePro.
 *  - REST:  /api/v1/...            (Authorization: Bearer np_live_…)
 *  - OpenAPI: /api/v1/openapi.json (público, para configurar o agente)
 *  - MCP:   /api/mcp               (Streamable HTTP, JSON-RPC sem estado)
 * A chave de API define o espaço de trabalho e a permissão (leitura ou leitura e escrita).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runTool, ToolError, TOOLS, type ToolCtx } from "./agentTools.js";

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, x-api-key, mcp-protocol-version, mcp-session-id", "access-control-allow-methods": "GET, POST, PATCH, OPTIONS" };
const json = (status: number, data: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS, ...extra } });
const fail = (status: number, message: string) => json(status, { erro: message });

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function service(env: Env): SupabaseClient | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

interface KeyAuth { ctx: ToolCtx; keyId: string; keyName: string }
async function authenticate(req: Request, sb: SupabaseClient): Promise<KeyAuth | Response> {
  const raw = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || (req.headers.get("x-api-key") ?? "").trim();
  if (!raw) return fail(401, "Envie a chave de API no cabeçalho Authorization: Bearer np_live_…");
  if (!/^np_live_[0-9a-f]{20,}$/.test(raw)) return fail(401, "Chave de API inválida.");
  const { data, error } = await sb.from("api_keys").select("id, name, workspace_id, permission, revoked_at").eq("key_hash", await sha256Hex(raw)).maybeSingle();
  if (error) return fail(500, error.message);
  if (!data) return fail(401, "Chave de API inválida.");
  if (data.revoked_at) return fail(401, "Esta chave foi revogada.");
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { ctx: { sb, ws: data.workspace_id as string, canWrite: data.permission === "Leitura e escrita" }, keyId: data.id as string, keyName: data.name as string };
}

async function logRequest(sb: SupabaseClient, ws: string, keyName: string, activity: string, status: number, started: number) {
  await sb.from("request_logs").insert({ workspace_id: ws, status, activity: activity.slice(0, 200), platform: "api", profile: keyName.slice(0, 120), duration_ms: Date.now() - started });
}

/* ------------------------------------------------------------------ REST */
interface Route { method: "GET" | "POST" | "PATCH"; path: string; tool: string; summary: string }
export const ROUTES: Route[] = [
  { method: "GET", path: "/resumo", tool: "resumo_desempenho", summary: "Resumo de desempenho do período" },
  { method: "GET", path: "/campanhas", tool: "listar_campanhas", summary: "Listar campanhas com métricas" },
  { method: "GET", path: "/campanhas/{campanha_id}", tool: "detalhar_campanha", summary: "Detalhar campanha" },
  { method: "PATCH", path: "/campanhas/{campanha_id}", tool: "alterar_status_campanha", summary: "Pausar ou ativar campanha" },
  { method: "GET", path: "/leads", tool: "listar_leads", summary: "Listar leads" },
  { method: "POST", path: "/leads", tool: "criar_lead", summary: "Registrar lead" },
  { method: "PATCH", path: "/leads/{lead_id}", tool: "atualizar_status_lead", summary: "Alterar status do lead" },
  { method: "GET", path: "/publicos", tool: "listar_publicos", summary: "Listar públicos" },
  { method: "POST", path: "/publicos", tool: "criar_publico", summary: "Criar público" },
  { method: "GET", path: "/regras", tool: "listar_regras", summary: "Listar regras automáticas" },
  { method: "POST", path: "/regras", tool: "criar_regra", summary: "Criar regra automática" },
  { method: "PATCH", path: "/regras/{regra_id}", tool: "ativar_regra", summary: "Ligar ou desligar regra" },
  { method: "GET", path: "/conversoes", tool: "listar_conversoes", summary: "Listar eventos de conversão" },
  { method: "GET", path: "/contas", tool: "listar_contas_anuncio", summary: "Listar contas de anúncio" },
];

function matchRoute(method: string, path: string) {
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const names: string[] = [];
    const re = new RegExp("^" + r.path.replace(/\{(\w+)\}/g, (_, n) => { names.push(n); return "([^/]+)"; }) + "/?$");
    const m = path.match(re);
    if (m) return { route: r, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

function queryArgs(url: URL) {
  const out: Json = {};
  url.searchParams.forEach((v, k) => { if (k !== "__path") out[k] = /^\d+$/.test(v) ? Number(v) : v === "true" ? true : v === "false" ? false : v; });
  return out;
}

export async function handleRest(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const path = "/" + (url.searchParams.get("__path") ?? url.pathname.replace(/^\/api\/v1\/?/, "")).replace(/^\/+/, "");
  const origin = env.PUBLIC_URL || `${url.protocol}//${url.host}`;

  if (req.method === "GET" && (path === "/" || path === "")) {
    return json(200, { nome: "NinePro API", versao: "1.0", documentacao: `${origin}/api/v1/openapi.json`, mcp: `${origin}/api/mcp`, autenticacao: "Authorization: Bearer <chave de API criada em Desenvolvedores › Chaves de API>", rotas: ROUTES.map((r) => `${r.method} /api/v1${r.path}`) });
  }
  if (req.method === "GET" && path === "/openapi.json") return json(200, openApi(origin));

  const sb = service(env);
  if (!sb) return fail(503, "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada.");
  const started = Date.now();
  const auth = await authenticate(req, sb);
  if (auth instanceof Response) return auth;

  let activity = `${req.method} /v1${path}`;
  let status = 200;
  try {
    let args: Json = {};
    let tool: string;
    const tm = path.match(/^\/ferramentas\/([a-z_]+)\/?$/);
    if (tm && req.method === "POST") {
      tool = tm[1];
      args = (await req.json().catch(() => ({}))) as Json;
    } else {
      const m = matchRoute(req.method, path);
      if (!m) { status = 404; return fail(404, `Rota não encontrada: ${req.method} /api/v1${path}. Veja ${origin}/api/v1`); }
      tool = m.route.tool;
      activity = `${req.method} /v1${m.route.path}`;
      const body = req.method === "GET" ? {} : ((await req.json().catch(() => ({}))) as Json);
      args = { ...queryArgs(url), ...body, ...m.params };
    }
    const result = await runTool(auth.ctx, tool, args);
    return json(req.method === "POST" ? 201 : 200, result);
  } catch (e) {
    status = e instanceof ToolError ? e.status : 500;
    return fail(status, e instanceof Error ? e.message : String(e));
  } finally {
    await logRequest(sb, auth.ctx.ws, auth.keyName, activity, status, started);
  }
}

/* ------------------------------------------------------------------ OpenAPI */
function openApi(origin: string) {
  const byTool = new Map(TOOLS.map((t) => [t.name, t]));
  const paths: Json = {};
  for (const r of ROUTES) {
    const t = byTool.get(r.tool)!;
    const pathParams = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const props = Object.entries(t.input.properties).filter(([k]) => !pathParams.includes(k));
    const op: Json = {
      operationId: t.name, summary: r.summary, description: t.description + (t.write ? " Requer chave com permissão de escrita." : ""),
      parameters: [
        ...pathParams.map((n) => ({ name: n, in: "path", required: true, schema: { type: "string", format: "uuid" } })),
        ...(r.method === "GET" ? props.map(([k, s]) => ({ name: k, in: "query", required: false, schema: s })) : []),
      ],
      responses: { "200": { description: "Sucesso" }, "201": { description: "Criado" }, "400": { description: "Parâmetro inválido" }, "401": { description: "Chave ausente, inválida ou revogada" }, "403": { description: "Chave somente leitura" }, "404": { description: "Não encontrado neste espaço" } },
    };
    if (r.method !== "GET" && props.length) {
      op.requestBody = { required: true, content: { "application/json": { schema: { type: "object", properties: Object.fromEntries(props), required: (t.input.required ?? []).filter((k) => !pathParams.includes(k)) } } } };
    }
    const key = `/api/v1${r.path}`;
    paths[key] = { ...(paths[key] as Json | undefined), [r.method.toLowerCase()]: op };
  }
  return {
    openapi: "3.1.0",
    info: { title: "NinePro API", version: "1.0.0", description: "Leitura de campanhas, métricas, leads e conversões; ações em leads, campanhas, públicos e regras. Tudo restrito ao espaço de trabalho da chave de API." },
    servers: [{ url: origin }],
    security: [{ bearer: [] }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Chave criada em Desenvolvedores › Chaves de API (np_live_…)" } } },
    paths,
  };
}

/* ------------------------------------------------------------------ MCP */
const MCP_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
type RpcReq = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Json };
const rpcOk = (id: RpcReq["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id: RpcReq["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function handleMcp(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, rpcErr(null, -32000, "Use POST (transporte Streamable HTTP, sem SSE)."), { allow: "POST" });
  const sb = service(env);
  if (!sb) return json(503, rpcErr(null, -32000, "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada."));
  const auth = await authenticate(req, sb);
  if (auth instanceof Response) {
    const body = (await auth.json()) as { erro: string };
    return json(401, rpcErr(null, -32001, body.erro), { "www-authenticate": 'Bearer realm="NinePro"' });
  }
  let payload: RpcReq | RpcReq[];
  try { payload = (await req.json()) as RpcReq | RpcReq[]; } catch { return json(400, rpcErr(null, -32700, "JSON inválido.")); }
  const batch = Array.isArray(payload) ? payload : [payload];
  const out: unknown[] = [];
  for (const msg of batch) {
    const r = await mcpOne(msg, auth);
    if (r) out.push(r);
  }
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return json(200, Array.isArray(payload) ? out : out[0]);
}

async function mcpOne(msg: RpcReq, auth: KeyAuth) {
  const isNotification = msg.id === undefined || msg.id === null;
  const started = Date.now();
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return rpcOk(msg.id, {
        protocolVersion: MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "ninepro", title: "NinePro", version: "1.0.0" },
        instructions: "Ferramentas do NinePro para gestão de tráfego pago: leia desempenho, campanhas, leads e conversões, e aja em leads, campanhas, públicos e regras. Valores em reais (BRL). Tudo é restrito ao espaço de trabalho da chave." + (auth.ctx.canWrite ? "" : " Esta chave é somente leitura."),
      });
    }
    case "ping": return rpcOk(msg.id, {});
    case "tools/list":
      return rpcOk(msg.id, { tools: TOOLS.filter((t) => auth.ctx.canWrite || !t.write).map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.input, annotations: { title: t.title, readOnlyHint: !t.write, destructiveHint: false, openWorldHint: false } })) });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      let status = 200;
      try {
        const result = await runTool(auth.ctx, name, (msg.params?.arguments as Json) ?? {});
        return rpcOk(msg.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result as Json, isError: false });
      } catch (e) {
        status = e instanceof ToolError ? e.status : 500;
        return rpcOk(msg.id, { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true });
      } finally {
        await logRequest(auth.ctx.sb, auth.ctx.ws, auth.keyName, `MCP ${name}`, status, started);
      }
    }
    default:
      if (isNotification || msg.method.startsWith("notifications/")) return null;
      return rpcErr(msg.id, -32601, `Método não suportado: ${msg.method}`);
  }
}
