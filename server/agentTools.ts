/**
 * Ferramentas da API de agentes do NinePro. A mesma definição serve a REST (/api/v1), ao
 * OpenAPI e ao MCP (/api/mcp). Toda consulta é filtrada pelo espaço da chave de API.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchEvent } from "./webhooks.js";
import { applyCampaignStatus } from "./connections.js";
import { replyComment, savePost, sendTemplate, sendToConversation } from "./channels.js";
import { PlatformError } from "./platforms/types.js";

export interface ToolCtx { sb: SupabaseClient; ws: string; canWrite: boolean; env: Record<string, string | undefined> }
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
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export async function runTool(ctx: ToolCtx, name: string, args: Json) {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) throw new ToolError(404, `Ferramenta desconhecida: ${name}.`);
  if (tool.write && !ctx.canWrite) throw new ToolError(403, "Esta chave é somente leitura.");
  return tool.run(ctx, args ?? {});
}
