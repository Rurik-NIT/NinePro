/**
 * Ferramentas da API de agentes do NinePro. A mesma definição serve a REST (/api/v1), ao
 * OpenAPI e ao MCP (/api/mcp). Toda consulta é filtrada pelo espaço da chave de API.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchEvent } from "./webhooks.js";
import { applyCampaignStatus } from "./connections.js";
import { refreshMediaStats, replyComment, savePost, sendTemplate, sendToConversation } from "./channels.js";
import { PlatformError } from "./platforms/types.js";
import { registerConversion } from "./ingest.js";

export interface ToolCtx { sb: SupabaseClient; ws: string; canWrite: boolean; scopes?: string[]; env: Record<string, string | undefined> }
type Json = Record<string, unknown>;
type Schema = { type: "object"; properties: Record<string, Json>; required?: string[]; additionalProperties?: boolean };
export interface Tool { name: string; title: string; description: string; write: boolean; input: Schema; run: (ctx: ToolCtx, args: Json) => Promise<unknown> }

export class ToolError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Converte erros de plataforma (WhatsApp/Instagram) em erro 400 legível para o agente. */
const channel = async <T>(fn: () => Promise<T>) => { try { return await fn(); } catch (e) { if (e instanceof PlatformError) throw new ToolError(400, e.message); throw e; } };

const PLATFORMS = ["meta", "google", "tiktok", "linkedin", "pinterest", "x", "reddit", "microsoft", "snapchat", "openai"];
const LEAD_STATUS = ["novo", "contatado", "qualificado", "venda", "descartado"];
const CAMPAIGN_STATUS = ["active", "learning", "limited", "paused", "ended"];
const DAY = 86_400_000;

const int = (v: unknown, def: number, min: number, max: number) => { const n = Math.round(Number(v ?? def)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const needUuid = (v: unknown, field: string) => { const s = str(v, 64); if (!isUuid(s)) throw new ToolError(400, `${field} inválido (esperado um UUID).`); return s; };
const oneOf = (v: unknown, list: string[], field: string, optional = false) => {
  const s = str(v, 40);
  if (!s && optional) return undefined;
  if (!list.includes(s)) throw new ToolError(400, `${field} deve ser um destes: ${list.join(", ")}.`);
  return s;
};
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
async function q<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new ToolError(500, error.message);
  return data as T;
}

/* ------------------------------------------------------------------ métricas */
interface Totals { investimento: number; impressoes: number; cliques: number; conversoes: number; leads: number; compras: number; receita: number }
const zero = (): Totals => ({ investimento: 0, impressoes: 0, cliques: 0, conversoes: 0, leads: 0, compras: 0, receita: 0 });
const derive = (t: Totals) => ({
  ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, round(v)])),
  ctr: t.impressoes ? round((t.cliques / t.impressoes) * 100, 2) : null,
  cpc: t.cliques ? round(t.investimento / t.cliques) : null,
  custo_por_resultado: t.conversoes ? round(t.investimento / t.conversoes) : null,
  roas: t.investimento && t.receita ? round(t.receita / t.investimento) : null,
});

/** Métricas diárias do período, agregadas por campanha (via ads → ad_sets → campaigns). */
async function campaignMetrics(ctx: ToolCtx, days: number, campaignIds?: string[]) {
  const since = isoDay(new Date(Date.now() - (days - 1) * DAY));
  let adsQ = ctx.sb.from("ads").select("id, ad_sets!inner(campaign_id)").eq("workspace_id", ctx.ws);
  if (campaignIds?.length) adsQ = adsQ.in("ad_sets.campaign_id", campaignIds);
  const ads = await q<{ id: string; ad_sets: { campaign_id: string } | { campaign_id: string }[] }[]>(adsQ);
  const campOf = new Map(ads.map((a) => [a.id, (Array.isArray(a.ad_sets) ? a.ad_sets[0] : a.ad_sets)?.campaign_id]));
  const byCampaign = new Map<string, Totals>();
  const byDay = new Map<string, Totals>();
  if (!ads.length) return { byCampaign, byDay, since };
  for (let from = 0; ; from += 1000) {
    const rows = await q<Json[]>(ctx.sb.from("ad_metrics_daily")
      .select("ad_id, date, spend, impressions, clicks, conversions, leads, purchases, revenue")
      .eq("workspace_id", ctx.ws).gte("date", since).in("ad_id", ads.map((a) => a.id)).order("date").range(from, from + 999));
    for (const r of rows) {
      const c = campOf.get(r.ad_id as string);
      if (!c) continue;
      for (const [map, key] of [[byCampaign, c], [byDay, r.date as string]] as const) {
        const t = map.get(key) ?? zero();
        t.investimento += Number(r.spend); t.impressoes += Number(r.impressions); t.cliques += Number(r.clicks);
        t.conversoes += Number(r.conversions); t.leads += Number(r.leads); t.compras += Number(r.purchases); t.receita += Number(r.revenue);
        map.set(key, t);
      }
    }
    if (rows.length < 1000) break;
  }
  return { byCampaign, byDay, since };
}

/* ------------------------------------------------------------------ ferramentas */
const days = { type: "integer", minimum: 1, maximum: 180, default: 30, description: "Janela em dias até hoje (1 a 180)." };

export const TOOLS: Tool[] = [
  {
    name: "resumo_desempenho", title: "Resumo de desempenho", write: false,
    description: "Totais do período (investimento, impressões, cliques, conversões, receita, CTR, CPC, custo por resultado, ROAS), separados por plataforma.",
    input: { type: "object", properties: { dias: days }, additionalProperties: false },
    run: async (ctx, a) => {
      const d = int(a.dias, 30, 1, 180);
      const camps = await q<{ id: string; ad_accounts: { platform: string } | null }[]>(ctx.sb.from("campaigns").select("id, ad_accounts(platform)").eq("workspace_id", ctx.ws));
      const { byCampaign, since } = await campaignMetrics(ctx, d);
      const total = zero(); const perPlatform = new Map<string, Totals>();
      for (const c of camps) {
        const t = byCampaign.get(c.id); if (!t) continue;
        const p = c.ad_accounts?.platform ?? "desconhecida";
        const pt = perPlatform.get(p) ?? zero();
        for (const k of Object.keys(t) as (keyof Totals)[]) { total[k] += t[k]; pt[k] += t[k]; }
        perPlatform.set(p, pt);
      }
      return { periodo: { de: since, ate: isoDay(new Date()), dias: d }, campanhas: camps.length, total: derive(total), por_plataforma: [...perPlatform].map(([plataforma, t]) => ({ plataforma, ...derive(t) })) };
    },
  },
  {
    name: "listar_campanhas", title: "Listar campanhas", write: false,
    description: "Campanhas do espaço com status, objetivo, orçamento, conta e métricas do período.",
    input: { type: "object", properties: { dias: days, status: { type: "string", enum: CAMPAIGN_STATUS }, plataforma: { type: "string", enum: PLATFORMS } }, additionalProperties: false },
    run: async (ctx, a) => {
      const d = int(a.dias, 30, 1, 180);
      const status = oneOf(a.status, CAMPAIGN_STATUS, "status", true);
      const plataforma = oneOf(a.plataforma, PLATFORMS, "plataforma", true);
      let cq = ctx.sb.from("campaigns").select("id, name, objective, status, budget, budget_type, started_at, ad_accounts!inner(name, platform)").eq("workspace_id", ctx.ws).order("name");
      if (status) cq = cq.eq("status", status);
      if (plataforma) cq = cq.eq("ad_accounts.platform", plataforma);
      const camps = await q<Json[]>(cq);
      const { byCampaign } = await campaignMetrics(ctx, d, camps.map((c) => c.id as string));
      return { dias: d, campanhas: camps.map((c) => {
        const acc = c.ad_accounts as { name: string; platform: string };
        return { id: c.id, nome: c.name, status: c.status, objetivo: c.objective, orcamento: Number(c.budget), tipo_orcamento: c.budget_type, inicio: c.started_at, conta: acc?.name, plataforma: acc?.platform, metricas: derive(byCampaign.get(c.id as string) ?? zero()) };
      }) };
    },
  },
  {
    name: "detalhar_campanha", title: "Detalhar campanha", write: false,
    description: "Uma campanha com conjuntos de anúncios, anúncios, totais e a série diária do período.",
    input: { type: "object", properties: { campanha_id: { type: "string", format: "uuid" }, dias: days }, required: ["campanha_id"], additionalProperties: false },
    run: async (ctx, a) => {
      const id = needUuid(a.campanha_id, "campanha_id");
      const d = int(a.dias, 30, 1, 180);
      const c = await q<Json | null>(ctx.sb.from("campaigns").select("id, name, objective, status, budget, budget_type, started_at, ad_accounts(name, platform), ad_sets(id, name, audience, status, ads(id, name, format, status))").eq("workspace_id", ctx.ws).eq("id", id).maybeSingle());
      if (!c) throw new ToolError(404, "Campanha não encontrada neste espaço.");
      const { byCampaign, byDay } = await campaignMetrics(ctx, d, [id]);
      return { ...c, metricas: derive(byCampaign.get(id) ?? zero()), serie_diaria: [...byDay].sort().map(([data, t]) => ({ data, ...derive(t) })) };
    },
  },
  {
    name: "alterar_status_campanha", title: "Pausar ou ativar campanha", write: true,
    description: "Pausa ou ativa uma campanha. Se a campanha veio de uma conta da Meta conectada, a alteração é feita também na Meta. Avisa os webhooks (campanha.status_alterado).",
    input: { type: "object", properties: { campanha_id: { type: "string", format: "uuid" }, status: { type: "string", enum: ["active", "paused"] } }, required: ["campanha_id", "status"], additionalProperties: false },
    run: async (ctx, a) => {
      const id = needUuid(a.campanha_id, "campanha_id");
      const status = oneOf(a.status, ["active", "paused"], "status")!;
      const before = await q<{ status: string; name: string } | null>(ctx.sb.from("campaigns").select("status, name").eq("workspace_id", ctx.ws).eq("id", id).maybeSingle());
      if (!before) throw new ToolError(404, "Campanha não encontrada neste espaço.");
      const [r] = await applyCampaignStatus(ctx.sb, ctx.env, ctx.ws, [id], status as "active" | "paused");
      if (r?.erro) throw new ToolError(502, r.erro);
      const payload = { campanha_id: id, nome: before.name, status_anterior: before.status, status, plataforma_alterada: !!r?.plataforma };
      if (before.status !== status) await dispatchEvent(ctx.sb, ctx.ws, "campanha.status_alterado", payload);
      return { ...payload, observacao: r?.plataforma ? "Alterado no NinePro e na plataforma de anúncios." : "Alterado no NinePro (campanha sem conta integrada)." };
    },
  },
  {
    name: "listar_leads", title: "Listar leads", write: false,
    description: "Leads mais recentes, com filtro por status e data.",
    input: { type: "object", properties: { status: { type: "string", enum: LEAD_STATUS }, desde: { type: "string", format: "date", description: "AAAA-MM-DD" }, limite: { type: "integer", minimum: 1, maximum: 200, default: 50 } }, additionalProperties: false },
    run: async (ctx, a) => {
      const status = oneOf(a.status, LEAD_STATUS, "status", true);
      const desde = str(a.desde, 10);
      let lq = ctx.sb.from("leads").select("id, name, email, phone, status, platform, submitted_at, updated_at, lead_forms(name), campaigns(id, name)").eq("workspace_id", ctx.ws).order("submitted_at", { ascending: false }).limit(int(a.limite, 50, 1, 200));
      if (status) lq = lq.eq("status", status);
      if (desde) { if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) throw new ToolError(400, "desde deve estar no formato AAAA-MM-DD."); lq = lq.gte("submitted_at", desde); }
      return { leads: await q<Json[]>(lq) };
    },
  },
  {
    name: "criar_lead", title: "Registrar lead", write: true,
    description: "Registra um lead (por exemplo, captado pelo agente em uma conversa) e avisa os webhooks (lead.criado).",
    input: { type: "object", properties: {
      nome: { type: "string", minLength: 2 }, email: { type: "string", format: "email" }, telefone: { type: "string" },
      campanha_id: { type: "string", format: "uuid" }, formulario_id: { type: "string", format: "uuid" }, plataforma: { type: "string", enum: PLATFORMS },
    }, required: ["nome"], additionalProperties: false },
    run: async (ctx, a) => {
      const nome = str(a.nome, 120);
      if (nome.length < 2) throw new ToolError(400, "Informe o nome do lead.");
      const email = str(a.email, 200).toLowerCase() || null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ToolError(400, "E-mail inválido.");
      const row: Json = { workspace_id: ctx.ws, name: nome, email, phone: str(a.telefone, 40) || null, platform: oneOf(a.plataforma, PLATFORMS, "plataforma", true) ?? null };
      if (a.campanha_id) {
        const id = needUuid(a.campanha_id, "campanha_id");
        if (!(await q<Json | null>(ctx.sb.from("campaigns").select("id").eq("workspace_id", ctx.ws).eq("id", id).maybeSingle()))) throw new ToolError(404, "Campanha não encontrada neste espaço.");
        row.campaign_id = id;
      }
      if (a.formulario_id) {
        const id = needUuid(a.formulario_id, "formulario_id");
        if (!(await q<Json | null>(ctx.sb.from("lead_forms").select("id").eq("workspace_id", ctx.ws).eq("id", id).maybeSingle()))) throw new ToolError(404, "Formulário não encontrado neste espaço.");
        row.form_id = id;
      }
      const lead = await q<Json>(ctx.sb.from("leads").insert(row).select("id, name, email, phone, status, platform, campaign_id, form_id, submitted_at").single());
      await dispatchEvent(ctx.sb, ctx.ws, "lead.criado", lead);
      return lead;
    },
  },
  {
    name: "atualizar_status_lead", title: "Alterar status do lead", write: true,
    description: "Move o lead no funil (novo, contatado, qualificado, venda, descartado) e avisa os webhooks (lead.atualizado).",
    input: { type: "object", properties: { lead_id: { type: "string", format: "uuid" }, status: { type: "string", enum: LEAD_STATUS } }, required: ["lead_id", "status"], additionalProperties: false },
    run: async (ctx, a) => {
      const id = needUuid(a.lead_id, "lead_id");
      const status = oneOf(a.status, LEAD_STATUS, "status")!;
      const before = await q<{ status: string } | null>(ctx.sb.from("leads").select("status").eq("workspace_id", ctx.ws).eq("id", id).maybeSingle());
      if (!before) throw new ToolError(404, "Lead não encontrado neste espaço.");
      const lead = await q<Json>(ctx.sb.from("leads").update({ status, updated_at: new Date().toISOString() }).eq("workspace_id", ctx.ws).eq("id", id).select("id, name, email, status").single());
      if (before.status !== status) await dispatchEvent(ctx.sb, ctx.ws, "lead.atualizado", { ...lead, status_anterior: before.status });
      return { ...lead, status_anterior: before.status };
    },
  },
  {
    name: "listar_publicos", title: "Listar públicos", write: false,
    description: "Públicos salvos (listas de clientes, semelhantes, retargeting etc.).",
    input: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => ({ publicos: await q<Json[]>(ctx.sb.from("audiences").select("id, name, type, size, status, created_at, ad_accounts(name, platform)").eq("workspace_id", ctx.ws).order("created_at")) }),
  },
  {
    name: "criar_publico", title: "Criar público", write: true,
    description: "Cria um público no NinePro (o envio à plataforma de anúncios depende da integração) e avisa os webhooks (publico.criado).",
    input: { type: "object", properties: { nome: { type: "string", minLength: 2 }, tipo: { type: "string", enum: ["Lista de clientes", "Semelhante", "Retargeting do site", "Engajamento", "Segmentação salva", "Receita salva"] } }, required: ["nome", "tipo"], additionalProperties: false },
    run: async (ctx, a) => {
      const nome = str(a.nome, 120);
      if (nome.length < 2) throw new ToolError(400, "Informe o nome do público.");
      const tipo = oneOf(a.tipo, ["Lista de clientes", "Semelhante", "Retargeting do site", "Engajamento", "Segmentação salva", "Receita salva"], "tipo")!;
      const p = await q<Json>(ctx.sb.from("audiences").insert({ workspace_id: ctx.ws, name: nome, type: tipo, status: "Preenchendo" }).select("id, name, type, status, created_at").single());
      await dispatchEvent(ctx.sb, ctx.ws, "publico.criado", p);
      return p;
    },
  },
  {
    name: "listar_regras", title: "Listar regras automáticas", write: false,
    description: "Regras automáticas do espaço com status, alvo, condição e ação.",
    input: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => {
      const rows = await q<Json[]>(ctx.sb.from("automations").select("id, name, template_id, target, status, conditions, actions, created_at").eq("workspace_id", ctx.ws).order("created_at"));
      return { regras: rows.map((r) => ({ id: r.id, nome: r.name, modelo: r.template_id, alvo: r.target, status: r.status, condicao: (r.conditions as Json)?.text ?? null, acao: (r.actions as Json)?.text ?? null, criada_em: r.created_at })) };
    },
  },
  {
    name: "criar_regra", title: "Criar regra automática", write: true,
    description: "Cria uma regra automática (descrição da condição e da ação em texto) e avisa os webhooks (regra.criada). A execução nas plataformas depende da integração.",
    input: { type: "object", properties: {
      nome: { type: "string", minLength: 2 }, alvo: { type: "string", description: "Ex.: Todas as campanhas" },
      condicao: { type: "string", description: "Ex.: CPA de 3 dias acima de R$ 60" }, acao: { type: "string", description: "Ex.: Pausar o conjunto e avisar" },
      ativa: { type: "boolean", default: false },
    }, required: ["nome", "condicao", "acao"], additionalProperties: false },
    run: async (ctx, a) => {
      const nome = str(a.nome, 120);
      if (nome.length < 2) throw new ToolError(400, "Informe o nome da regra.");
      const condicao = str(a.condicao, 500), acao = str(a.acao, 500);
      if (!condicao || !acao) throw new ToolError(400, "Informe a condição e a ação.");
      const r = await q<Json>(ctx.sb.from("automations").insert({
        workspace_id: ctx.ws, name: nome, template_id: null, target: str(a.alvo, 200) || "Todas as campanhas", status: a.ativa === true ? "ativa" : "rascunho",
        trigger: { kind: "agente" }, logic: "E", conditions: { text: condicao, rows: [] }, actions: { text: acao, items: [] },
      }).select("id, name, target, status, created_at").single());
      await dispatchEvent(ctx.sb, ctx.ws, "regra.criada", { ...r, condicao, acao });
      return { ...r, condicao, acao };
    },
  },
  {
    name: "ativar_regra", title: "Ligar ou desligar regra", write: true,
    description: "Liga ou desliga uma regra automática e avisa os webhooks (regra.alterada).",
    input: { type: "object", properties: { regra_id: { type: "string", format: "uuid" }, ativa: { type: "boolean" } }, required: ["regra_id", "ativa"], additionalProperties: false },
    run: async (ctx, a) => {
      const id = needUuid(a.regra_id, "regra_id");
      if (typeof a.ativa !== "boolean") throw new ToolError(400, "ativa deve ser true ou false.");
      const rows = await q<Json[]>(ctx.sb.from("automations").update({ status: a.ativa ? "ativa" : "desligada", updated_at: new Date().toISOString() }).eq("workspace_id", ctx.ws).eq("id", id).select("id, name, status"));
      if (!rows.length) throw new ToolError(404, "Regra não encontrada neste espaço.");
      await dispatchEvent(ctx.sb, ctx.ws, "regra.alterada", rows[0]);
      return rows[0];
    },
  },
  {
    name: "listar_conversoes", title: "Listar eventos de conversão", write: false,
    description: "Eventos de conversão recebidos (compras, leads, cadastros), com valor e status de envio às plataformas.",
    input: { type: "object", properties: { dias: days, tipo: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 500, default: 100 } }, additionalProperties: false },
    run: async (ctx, a) => {
      const d = int(a.dias, 30, 1, 180);
      let eq = ctx.sb.from("conversion_events").select("id, type, source, sent_to, page, value, status, received_at, campaigns(id, name)").eq("workspace_id", ctx.ws).gte("received_at", new Date(Date.now() - d * DAY).toISOString()).order("received_at", { ascending: false }).limit(int(a.limite, 100, 1, 500));
      const tipo = str(a.tipo, 60);
      if (tipo) eq = eq.eq("type", tipo);
      const rows = await q<Json[]>(eq);
      return { dias: d, total: rows.length, valor_total: round(rows.reduce((s, r) => s + Number(r.value), 0)), eventos: rows };
    },
  },
  {
    name: "listar_contas_anuncio", title: "Listar contas de anúncio", write: false,
    description: "Contas de anúncio conectadas ao espaço, com plataforma, moeda e última sincronização.",
    input: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => ({ contas: await q<Json[]>(ctx.sb.from("ad_accounts").select("id, name, platform, currency, timezone, status, last_synced_at").eq("workspace_id", ctx.ws).order("name")) }),
  },
  {
    name: "registrar_conversao", title: "Registrar conversão", write: true,
    description: "Registra uma conversão vinda do seu sistema (venda, lead, cadastro…). Atribui à campanha pela UTM (nome ou ID) e avisa os webhooks (conversao.recebida). Use id_externo para não duplicar.",
    input: { type: "object", properties: {
      tipo: { type: "string", description: "purchase, lead, signup, add_to_cart, initiate_checkout, contact, schedule, subscribe ou um nome livre" },
      valor: { type: "number", minimum: 0 }, id_externo: { type: "string", description: "ID do pedido/lead no seu sistema" },
      utm_source: { type: "string" }, utm_medium: { type: "string" }, utm_campaign: { type: "string" }, campanha_id: { type: "string", format: "uuid" },
      email: { type: "string" }, telefone: { type: "string" }, nome: { type: "string" }, pagina: { type: "string" },
    }, required: ["tipo"], additionalProperties: false },
    run: async (ctx, a) => {
      const tipo = str(a.tipo, 60);
      if (!tipo) throw new ToolError(400, "Informe o tipo da conversão.");
      const utm = Object.fromEntries([["source", a.utm_source], ["medium", a.utm_medium], ["campaign", a.utm_campaign]].map(([k, v]) => [k, str(v, 200)]).filter(([, v]) => v));
      const contact = Object.fromEntries([["email", a.email], ["phone", a.telefone], ["name", a.nome]].map(([k, v]) => [k, str(v, 200)]).filter(([, v]) => v));
      return registerConversion(ctx.sb, ctx.ws, { type: tipo, value: Number(a.valor) || 0, externalId: str(a.id_externo, 120), source: "API", page: str(a.pagina, 300), utm, contact, campaignId: a.campanha_id ? needUuid(a.campanha_id, "campanha_id") : null });
    },
  },
  {
    name: "listar_canais", title: "Listar canais de mensagem", write: false,
    description: "Números de WhatsApp e contas do Instagram conectados ao espaço.",
    input: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => ({ canais: await q<Json[]>(ctx.sb.from("channel_accounts").select("id, kind, name, display_name, status, quality, connection_id").eq("workspace_id", ctx.ws).order("kind")) }),
  },
  {
    name: "listar_conversas", title: "Listar conversas", write: false,
    description: "Conversas do WhatsApp e do Instagram (mais recentes primeiro). 'pode_responder' indica se a janela de 24 horas está aberta.",
    input: { type: "object", properties: {
      canal: { type: "string", enum: ["WhatsApp", "Instagram"] }, status: { type: "string", enum: ["Aberta", "Resolvida"] },
      nao_lidas: { type: "boolean" }, busca: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 200, default: 50 },
    }, additionalProperties: false },
    run: async (ctx, a) => {
      let cq = ctx.sb.from("conversations").select("id, channel, contact_name, contact_handle, status, unread, last_message_preview, last_message_at, last_inbound_at").eq("workspace_id", ctx.ws).not("channel_account_id", "is", null).order("last_message_at", { ascending: false }).limit(int(a.limite, 50, 1, 200));
      const canal = oneOf(a.canal, ["WhatsApp", "Instagram"], "canal", true); if (canal) cq = cq.eq("channel", canal);
      const status = oneOf(a.status, ["Aberta", "Resolvida"], "status", true); if (status) cq = cq.eq("status", status);
      if (a.nao_lidas === true) cq = cq.gt("unread", 0);
      const busca = str(a.busca, 80).replace(/[%,()]/g, ""); if (busca) cq = cq.or(`contact_name.ilike.%${busca}%,contact_handle.ilike.%${busca}%,last_message_preview.ilike.%${busca}%`);
      const rows = await q<Json[]>(cq);
      return { conversas: rows.map((r) => ({ id: r.id, canal: r.channel, contato: r.contact_name, identificador: r.contact_handle, status: r.status, nao_lidas: r.unread, ultima_mensagem: r.last_message_preview, ultima_em: r.last_message_at, pode_responder: !!r.last_inbound_at && Date.now() - Date.parse(r.last_inbound_at as string) < DAY })) };
    },
  },
  {
    name: "ler_conversa", title: "Ler conversa", write: false,
    description: "Mensagens de uma conversa, em ordem cronológica.",
    input: { type: "object", properties: { conversa_id: { type: "string", format: "uuid" }, limite: { type: "integer", minimum: 1, maximum: 500, default: 100 } }, required: ["conversa_id"], additionalProperties: false },
    run: async (ctx, a) => {
      const id = needUuid(a.conversa_id, "conversa_id");
      const conv = await q<Json | null>(ctx.sb.from("conversations").select("id, channel, contact_name, contact_handle, status, last_inbound_at").eq("workspace_id", ctx.ws).eq("id", id).maybeSingle());
      if (!conv) throw new ToolError(404, "Conversa não encontrada neste espaço.");
      const msgs = await q<Json[]>(ctx.sb.from("messages").select("direction, body, kind, status, error, sent_at").eq("workspace_id", ctx.ws).eq("conversation_id", id).order("sent_at", { ascending: false }).limit(int(a.limite, 100, 1, 500)));
      return { conversa: conv, pode_responder: !!conv.last_inbound_at && Date.now() - Date.parse(conv.last_inbound_at as string) < DAY, mensagens: msgs.reverse().map((m) => ({ de: m.direction === "in" ? "cliente" : "equipe", texto: m.body, tipo: m.kind, status: m.status, erro: m.error, em: m.sent_at })) };
    },
  },
  {
    name: "responder_conversa", title: "Responder conversa", write: true,
    description: "Envia uma mensagem numa conversa do WhatsApp ou do Instagram. Só funciona até 24 horas depois da última mensagem do cliente; fora disso, no WhatsApp use enviar_modelo_whatsapp.",
    input: { type: "object", properties: { conversa_id: { type: "string", format: "uuid" }, texto: { type: "string", minLength: 1, maxLength: 4096 }, imagem_url: { type: "string", description: "URL pública https de uma imagem (opcional)" } }, required: ["conversa_id", "texto"], additionalProperties: false },
    run: async (ctx, a) => channel(() => sendToConversation({ sb: ctx.sb, env: ctx.env, ws: ctx.ws, userId: null }, needUuid(a.conversa_id, "conversa_id"), str(a.texto, 4096), str(a.imagem_url, 1000).startsWith("https://") ? { url: str(a.imagem_url, 1000), type: "image" } : undefined)),
  },
  {
    name: "listar_modelos_whatsapp", title: "Listar modelos do WhatsApp", write: false,
    description: "Modelos de mensagem do WhatsApp com status de aprovação, idioma e texto (variáveis {{1}}, {{2}}…).",
    input: { type: "object", properties: { somente_aprovados: { type: "boolean", default: true } }, additionalProperties: false },
    run: async (ctx, a) => {
      let tq = ctx.sb.from("wa_templates").select("id, name, language, category, status, components").eq("workspace_id", ctx.ws).order("name");
      if (a.somente_aprovados !== false) tq = tq.eq("status", "APPROVED");
      const rows = await q<Json[]>(tq);
      return { modelos: rows.map((t) => ({ id: t.id, nome: t.name, idioma: t.language, categoria: t.category, status: t.status, texto: ((t.components as Json[]) ?? []).find((c) => c.type === "BODY")?.text ?? null })) };
    },
  },
  {
    name: "enviar_modelo_whatsapp", title: "Enviar modelo do WhatsApp", write: true,
    description: "Envia um modelo aprovado para um número (inicia conversa ou fala depois das 24 horas). Variáveis na ordem de {{1}}, {{2}}…",
    input: { type: "object", properties: {
      modelo_id: { type: "string", format: "uuid" }, para: { type: "string", description: "Número com DDI e DDD, ex.: +5511912345678" },
      variaveis: { type: "array", items: { type: "string" } }, nome_contato: { type: "string" }, numero_id: { type: "string", format: "uuid", description: "Número remetente (opcional)" },
    }, required: ["modelo_id", "para"], additionalProperties: false },
    run: async (ctx, a) => channel(() => sendTemplate({ sb: ctx.sb, env: ctx.env, ws: ctx.ws, userId: null }, { templateId: needUuid(a.modelo_id, "modelo_id"), to: str(a.para, 30), bodyParams: Array.isArray(a.variaveis) ? a.variaveis.map((v) => str(v, 1000)) : [], contactName: str(a.nome_contato, 120), accountId: a.numero_id ? needUuid(a.numero_id, "numero_id") : undefined })),
  },
  {
    name: "listar_comentarios", title: "Listar comentários do Instagram", write: false,
    description: "Comentários e menções recebidos no Instagram.",
    input: { type: "object", properties: { sem_resposta: { type: "boolean" }, tipo: { type: "string", enum: ["comment", "mention"] }, limite: { type: "integer", minimum: 1, maximum: 200, default: 50 } }, additionalProperties: false },
    run: async (ctx, a) => {
      let cq = ctx.sb.from("social_comments").select("id, kind, author_username, body, replied, reply_text, hidden, media_permalink, commented_at").eq("workspace_id", ctx.ws).eq("from_owner", false).order("commented_at", { ascending: false }).limit(int(a.limite, 50, 1, 200));
      if (a.sem_resposta === true) cq = cq.eq("replied", false);
      const tipo = oneOf(a.tipo, ["comment", "mention"], "tipo", true); if (tipo) cq = cq.eq("kind", tipo);
      return { comentarios: await q<Json[]>(cq) };
    },
  },
  {
    name: "responder_comentario", title: "Responder comentário do Instagram", write: true,
    description: "Responde um comentário publicamente ou por mensagem direta (privada=true, até 7 dias após o comentário).",
    input: { type: "object", properties: { comentario_id: { type: "string", format: "uuid" }, texto: { type: "string", minLength: 1, maxLength: 2200 }, privada: { type: "boolean", default: false } }, required: ["comentario_id", "texto"], additionalProperties: false },
    run: async (ctx, a) => channel(() => replyComment({ sb: ctx.sb, env: ctx.env, ws: ctx.ws, userId: null }, needUuid(a.comentario_id, "comentario_id"), str(a.texto, 2200), a.privada === true)),
  },
  {
    name: "publicar_instagram", title: "Publicar ou agendar no Instagram", write: true,
    description: "Publica agora ou agenda uma publicação no Instagram. As mídias precisam ser URLs públicas https (JPEG para imagem, MP4 para vídeo).",
    input: { type: "object", properties: {
      legenda: { type: "string", maxLength: 2200 }, contas: { type: "array", items: { type: "string", format: "uuid" }, description: "IDs das contas (listar_canais)" },
      midias: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10 }, tipo: { type: "string", enum: ["IMAGE", "REELS", "CAROUSEL", "STORIES"] },
      agendar_para: { type: "string", format: "date-time", description: "Vazio = publicar agora" },
    }, required: ["contas", "midias"], additionalProperties: false },
    run: async (ctx, a) => channel(() => savePost({ sb: ctx.sb, env: ctx.env, ws: ctx.ws, userId: null }, { content: str(a.legenda, 2200), accountIds: a.contas, mediaUrls: a.midias, mediaType: a.tipo, scheduledAt: a.agendar_para, mode: a.agendar_para ? "agendar" : "agora" })),
  },
  /* ---------------------------------------------------------------- contas, análises e automações (agente gestor de redes sociais) */
  {
    name: "listar_contas_conectadas", title: "Listar contas conectadas", write: false,
    description: "Todas as contas do espaço: plataformas de anúncio (Meta, Google, TikTok, LinkedIn) e canais (WhatsApp, Instagram), com status da conexão e da saúde. Use para conferir o que está conectado antes de agir.",
    input: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => {
      const [ws, conns, ads, chans] = await Promise.all([
        q<Json | null>(ctx.sb.from("workspaces").select("id, name").eq("id", ctx.ws).maybeSingle()),
        q<Json[]>(ctx.sb.from("platform_connections").select("id, platform, external_user_name, status, last_error, last_synced_at, token_expires_at").eq("workspace_id", ctx.ws)),
        q<Json[]>(ctx.sb.from("ad_accounts").select("id, platform, name, external_id, currency, status, last_synced_at").eq("workspace_id", ctx.ws).order("platform")),
        q<Json[]>(ctx.sb.from("channel_accounts").select("id, kind, name, display_name, status, quality, enabled, connection_id").eq("workspace_id", ctx.ws).order("kind")),
      ]);
      const health = (status: unknown, err: unknown) => (status === "ativa" ? (err ? "atenção" : "saudável") : "reconectar");
      return {
        perfil: ws?.name ?? null,
        conexoes: conns.map((c) => ({ plataforma: c.platform, conta: c.external_user_name, status: c.status, saude: health(c.status, c.last_error), aviso: c.last_error, sincronizada_em: c.last_synced_at, token_expira_em: c.token_expires_at })),
        contas_de_anuncio: ads.map((a) => ({ id: a.id, plataforma: a.platform, nome: a.name, id_externo: a.external_id, moeda: a.currency, status: a.status, sincronizada_em: a.last_synced_at })),
        canais: chans.map((c) => ({ id: c.id, tipo: c.kind === "whatsapp" ? "WhatsApp" : "Instagram", nome: c.display_name || c.name, usuario: c.name, status: c.status, qualidade: c.quality, ligado: c.enabled, saude: c.status === "ativo" && c.enabled !== false ? "saudável" : "reconectar" })),
      };
    },
  },
  {
    name: "analisar_publicacoes", title: "Analisar publicações do Instagram", write: false,
    description: "Desempenho das publicações do Instagram no período: totais, médias, o que funciona por formato (reels, imagem, carrossel), por dia da semana e horário (Brasília), e as melhores e piores publicações com legenda e link. Use para decidir o que publicar em seguida.",
    input: { type: "object", properties: {
      dias: { type: "integer", minimum: 1, maximum: 365, default: 90, description: "Janela em dias até hoje." },
      conta_id: { type: "string", format: "uuid", description: "Uma conta do Instagram (listar_contas_conectadas). Vazio = todas." },
      ordenar_por: { type: "string", enum: ["engajamento", "alcance", "visualizacoes", "curtidas", "comentarios", "salvamentos", "compartilhamentos"], default: "engajamento" },
      limite: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      atualizar: { type: "boolean", default: false, description: "Busca os números mais recentes no Instagram antes de analisar (mais lento)." },
    }, additionalProperties: false },
    run: async (ctx, a) => {
      const contaId = a.conta_id ? needUuid(a.conta_id, "conta_id") : undefined;
      const atualizadas = a.atualizar === true ? await refreshMediaStats(ctx.sb, ctx.env, ctx.ws, contaId) : undefined;
      const periodo = int(a.dias, 90, 1, 365);
      const since = new Date(Date.now() - periodo * DAY).toISOString();
      let mq = ctx.sb.from("social_media_stats").select("channel_account_id, media_id, caption, permalink, media_type, posted_at, likes, comments, reach, views, saved, shares").eq("workspace_id", ctx.ws).gte("posted_at", since).order("posted_at", { ascending: false }).limit(1000);
      if (contaId) mq = mq.eq("channel_account_id", contaId);
      const rows = await q<Json[]>(mq);
      const n = (v: unknown) => Number(v ?? 0) || 0;
      type Item = { midia_id: string; formato: string; publicada_em: string | null; legenda: string; link: unknown; curtidas: number; comentarios: number; alcance: number | null; visualizacoes: number | null; salvamentos: number | null; compartilhamentos: number | null; engajamento: number; taxa_engajamento: number | null };
      type NumKey = "curtidas" | "comentarios" | "alcance" | "visualizacoes" | "salvamentos" | "compartilhamentos" | "engajamento";
      const items: Item[] = rows.map((r) => {
        const eng = n(r.likes) + n(r.comments) + n(r.saved) + n(r.shares);
        return { midia_id: String(r.media_id), formato: String(r.media_type ?? "—"), publicada_em: (r.posted_at as string | null) ?? null, legenda: String(r.caption ?? "").slice(0, 280), link: r.permalink, curtidas: n(r.likes), comentarios: n(r.comments), alcance: r.reach == null ? null : n(r.reach), visualizacoes: r.views == null ? null : n(r.views), salvamentos: r.saved == null ? null : n(r.saved), compartilhamentos: r.shares == null ? null : n(r.shares), engajamento: eng, taxa_engajamento: n(r.reach) ? round((eng / n(r.reach)) * 100, 2) : null };
      });
      if (!items.length) return { publicacoes: 0, aviso: "Nenhuma publicação com estatísticas no período. Confira se o Instagram está conectado (listar_contas_conectadas) ou use atualizar=true.", atualizadas };
      const keys: Record<string, NumKey> = { engajamento: "engajamento", alcance: "alcance", visualizacoes: "visualizacoes", curtidas: "curtidas", comentarios: "comentarios", salvamentos: "salvamentos", compartilhamentos: "compartilhamentos" };
      const key = keys[str(a.ordenar_por, 30)] ?? "engajamento";
      const sorted = [...items].sort((x, y) => n(y[key]) - n(x[key]));
      const sum = (k: NumKey) => items.reduce((acc, it) => acc + n(it[k]), 0);
      const avg = (list: Item[], k: NumKey) => (list.length ? round(list.reduce((acc, it) => acc + n(it[k]), 0) / list.length, 1) : 0);
      const group = (fn: (it: Item) => string) => {
        const m = new Map<string, Item[]>();
        for (const it of items) { const g = fn(it); m.set(g, [...(m.get(g) ?? []), it]); }
        return [...m.entries()].map(([g, list]) => ({ grupo: g, publicacoes: list.length, engajamento_medio: avg(list, "engajamento"), alcance_medio: avg(list, "alcance"), visualizacoes_medias: avg(list, "visualizacoes") })).sort((x, y) => y.engajamento_medio - x.engajamento_medio);
      };
      const local = (iso: string, opt: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opt }).format(new Date(iso));
      const limite = int(a.limite, 10, 1, 50);
      return {
        periodo_dias: periodo, publicacoes: items.length, atualizadas,
        totais: { curtidas: sum("curtidas"), comentarios: sum("comentarios"), alcance: sum("alcance"), visualizacoes: sum("visualizacoes"), salvamentos: sum("salvamentos"), compartilhamentos: sum("compartilhamentos"), engajamento: sum("engajamento") },
        medias_por_publicacao: { engajamento: avg(items, "engajamento"), alcance: avg(items, "alcance"), visualizacoes: avg(items, "visualizacoes"), curtidas: avg(items, "curtidas"), comentarios: avg(items, "comentarios") },
        por_formato: group((it) => it.formato),
        por_dia_da_semana: group((it) => (it.publicada_em ? local(it.publicada_em, { weekday: "long" }) : "—")),
        por_horario: group((it) => (it.publicada_em ? `${local(it.publicada_em, { hour: "2-digit", hourCycle: "h23" })}h` : "—")).slice(0, 8),
        melhores: sorted.slice(0, limite),
        piores: sorted.length > limite ? sorted.slice(-Math.min(5, sorted.length - limite)).reverse() : [],
      };
    },
  },
  {
    name: "listar_publicacoes", title: "Listar publicações do NinePro", write: false,
    description: "Publicações criadas pelo NinePro (rascunho, agendada, publicada, falhou), com o ID da mídia e o link de cada conta quando publicada.",
    input: { type: "object", properties: { status: { type: "string", enum: ["rascunho", "agendada", "publicada", "falhou"] }, limite: { type: "integer", minimum: 1, maximum: 100, default: 20 } }, additionalProperties: false },
    run: async (ctx, a) => {
      let pq = ctx.sb.from("posts").select("id, content, status, media_type, media_urls, scheduled_at, published_at, result, error, created_at").eq("workspace_id", ctx.ws).order("created_at", { ascending: false }).limit(int(a.limite, 20, 1, 100));
      const st = oneOf(a.status, ["rascunho", "agendada", "publicada", "falhou"], "status", true); if (st) pq = pq.eq("status", st);
      const rows = await q<Json[]>(pq);
      return { publicacoes: rows.map((p) => ({ id: p.id, status: p.status, legenda: String(p.content ?? "").slice(0, 400), formato: p.media_type, midias: p.media_urls, agendada_para: p.scheduled_at, publicada_em: p.published_at, erro: p.error, contas: Object.values((p.result ?? {}) as Record<string, Json>).map((r) => ({ conta: r.conta, midia_id: r.id ?? null, link: r.permalink ?? null, erro: r.erro ?? null })) })) };
    },
  },
  {
    name: "criar_automacao_comentario", title: "Criar automação comentário → DM", write: true,
    description: "Quem comentar a palavra-chave numa publicação do Instagram recebe na hora uma mensagem direta (com botão de link opcional) e, se quiser, uma resposta pública no comentário. Ex.: 'Comente GUIA para receber o material'. Mostre à pessoa a palavra-chave, a resposta pública e a DM exata e peça aprovação antes de criar.",
    input: { type: "object", properties: {
      nome: { type: "string", maxLength: 120 },
      palavras_chave: { type: "array", items: { type: "string", maxLength: 60 }, maxItems: 20, description: "Ex.: [\"GUIA\"]. Sem diferenciar maiúsculas nem acentos. Vazio = qualquer comentário." },
      correspondencia: { type: "string", enum: ["contem", "exata"], default: "contem", description: "contem: o comentário contém a palavra; exata: o comentário é só a palavra." },
      mensagem_dm: { type: "string", minLength: 1, maxLength: 640, description: "Texto da DM. Aceita {{nome}}." },
      botao_texto: { type: "string", maxLength: 20, description: "Rótulo do botão (até 20 caracteres), ex.: 'Pegar o guia'." },
      botao_url: { type: "string", description: "Link https aberto pelo botão." },
      resposta_publica: { type: "string", maxLength: 300, description: "Resposta no comentário, ex.: 'Te mandei no direct!'. Opcional." },
      publicacao_id: { type: "string", format: "uuid", description: "Publicação feita pelo NinePro (publicar_instagram ou listar_publicacoes). Vale também para publicação agendada." },
      midia_ids: { type: "array", items: { type: "string" }, maxItems: 20, description: "IDs de mídia do Instagram (analisar_publicacoes). Sem publicacao_id e sem midia_ids = todas as publicações." },
      uma_vez_por_pessoa: { type: "boolean", default: true },
      ativa: { type: "boolean", default: true },
    }, required: ["mensagem_dm"], additionalProperties: false },
    run: async (ctx, a) => {
      const keywords = (Array.isArray(a.palavras_chave) ? a.palavras_chave : []).map((k) => str(k, 60)).filter(Boolean).slice(0, 20);
      const dm = str(a.mensagem_dm, 640);
      if (!dm) throw new ToolError(400, "Escreva a mensagem da DM.");
      const label = str(a.botao_texto, 20), url = str(a.botao_url, 1000);
      if (!!label !== !!url) throw new ToolError(400, "Para ter botão, informe botao_texto e botao_url juntos.");
      if (url && !/^https:\/\/[^\s/]+\.[^\s]+/.test(url)) throw new ToolError(400, "botao_url precisa ser um link https público.");
      const postId = a.publicacao_id ? needUuid(a.publicacao_id, "publicacao_id") : null;
      if (postId && !(await q<Json | null>(ctx.sb.from("posts").select("id").eq("workspace_id", ctx.ws).eq("id", postId).maybeSingle()))) throw new ToolError(404, "Publicação não encontrada neste espaço.");
      const mediaIds = (Array.isArray(a.midia_ids) ? a.midia_ids : []).map((m) => str(m, 60)).filter((m) => /^\d{5,}$/.test(m));
      const ig = await q<Json[]>(ctx.sb.from("channel_accounts").select("id").eq("workspace_id", ctx.ws).eq("kind", "instagram"));
      if (!ig.length) throw new ToolError(400, "Conecte uma conta do Instagram antes de criar a automação.");
      const row = {
        workspace_id: ctx.ws, name: str(a.nome, 120) || `Comentário ${keywords[0] ?? "qualquer"} → DM`, status: a.ativa === false ? "pausado" : "ativo", trigger: "comentario", channel: "Instagram",
        match: keywords.length ? (a.correspondencia === "exata" ? "exata" : "contem") : "qualquer", keywords, reply: dm, comment_reply: str(a.resposta_publica, 300),
        button_label: label || null, button_url: url || null, media_ids: mediaIds, post_id: postId, once_per_user: a.uma_vez_por_pessoa !== false, source: "agente",
      };
      const saved = await q<Json>(ctx.sb.from("inbox_flows").insert(row).select("id, name, status").single());
      const quem = keywords.length ? keywords.map((k) => `“${k}”`).join(" ou ") : "qualquer coisa";
      return { automacao: saved, como_funciona: `Quem comentar ${quem} ${postId || mediaIds.length ? "na publicação escolhida" : "em qualquer publicação"} recebe a DM${label ? ` com o botão “${label}”` : ""}${row.comment_reply ? " e uma resposta pública" : ""}${row.once_per_user ? ", uma vez por pessoa" : ""}.` };
    },
  },
  {
    name: "listar_automacoes", title: "Listar automações de mensagens", write: false,
    description: "Automações de comentário → DM e respostas automáticas, com quantas vezes cada uma disparou.",
    input: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => {
      const rows = await q<Json[]>(ctx.sb.from("inbox_flows").select("id, name, status, trigger, channel, match, keywords, reply, comment_reply, button_label, button_url, media_ids, post_id, once_per_user, runs, last_run_at, source").eq("workspace_id", ctx.ws).order("created_at", { ascending: false }));
      return { automacoes: rows.map((f) => ({ id: f.id, nome: f.name, status: f.status, gatilho: f.trigger, canal: f.channel, palavras_chave: f.keywords, correspondencia: f.match, mensagem: f.reply, resposta_publica: f.comment_reply || null, botao: f.button_label ? { texto: f.button_label, url: f.button_url } : null, publicacao_id: f.post_id, midia_ids: f.media_ids, uma_vez_por_pessoa: f.once_per_user, disparos: f.runs, ultimo_disparo: f.last_run_at, criada_por: f.source === "agente" ? "agente" : "app" })) };
    },
  },
  {
    name: "alterar_automacao", title: "Ligar, pausar ou excluir automação", write: true,
    description: "Liga, pausa ou exclui uma automação de mensagens.",
    input: { type: "object", properties: { automacao_id: { type: "string", format: "uuid" }, acao: { type: "string", enum: ["ativar", "pausar", "excluir"] } }, required: ["automacao_id", "acao"], additionalProperties: false },
    run: async (ctx, a) => {
      const id = needUuid(a.automacao_id, "automacao_id");
      const acao = oneOf(a.acao, ["ativar", "pausar", "excluir"], "acao");
      const found = await q<Json | null>(ctx.sb.from("inbox_flows").select("id, name").eq("workspace_id", ctx.ws).eq("id", id).maybeSingle());
      if (!found) throw new ToolError(404, "Automação não encontrada neste espaço.");
      if (acao === "excluir") { await q(ctx.sb.from("inbox_flows").delete().eq("id", id)); return { ok: true, excluida: found.name }; }
      return { automacao: await q<Json>(ctx.sb.from("inbox_flows").update({ status: acao === "ativar" ? "ativo" : "pausado", updated_at: new Date().toISOString() }).eq("id", id).select("id, name, status").single()) };
    },
  },
];

/** Permissão (escopo OAuth) exigida por cada ferramenta de escrita; as de leitura exigem "leitura". */
const WRITE_SCOPE: Record<string, string> = {
  alterar_status_campanha: "anuncios", criar_publico: "anuncios", criar_regra: "anuncios", ativar_regra: "anuncios",
  criar_lead: "crm", atualizar_status_lead: "crm", registrar_conversao: "crm",
  responder_conversa: "mensagens", enviar_modelo_whatsapp: "mensagens", responder_comentario: "mensagens",
  publicar_instagram: "publicacoes",
  criar_automacao_comentario: "automacoes", alterar_automacao: "automacoes",
};
export const scopeOf = (t: Tool) => (t.write ? WRITE_SCOPE[t.name] ?? "escrita" : "leitura");
export const allowed = (ctx: ToolCtx, t: Tool) => (ctx.scopes ? ctx.scopes.includes(scopeOf(t)) : ctx.canWrite || !t.write);

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export async function runTool(ctx: ToolCtx, name: string, args: Json) {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) throw new ToolError(404, `Ferramenta desconhecida: ${name}.`);
  if (!allowed(ctx, tool)) throw new ToolError(403, ctx.scopes && tool.write ? `Sem permissão para esta ação (precisa de “${scopeOf(tool)}”). Conecte de novo liberando essa permissão.` : "Esta chave é somente leitura.");
  return tool.run(ctx, args ?? {});
}
