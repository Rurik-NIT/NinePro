/**
 * Ferramentas da API de agentes do NinePro. A mesma definição serve a REST (/api/v1), ao
 * OpenAPI e ao MCP (/api/mcp). Toda consulta é filtrada pelo espaço da chave de API.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchEvent } from "./webhooks.js";
import { applyCampaignStatus } from "./connections.js";
import { channelLabel, checkPost, createBroadcast, publishPost, refreshMediaStats, replyComment, savePost, sendTemplate, sendToConversation, type ChannelCtx } from "./channels.js";
import { cleanOptions, describeOptions, POST_OPTIONS, type OptKind } from "../src/config/postOptions.js";
import { importPostsCsv } from "./postImport.js";
import { loadAnalytics } from "./analytics.js";
const CHANNEL_LABELS: Record<string, string> = Object.fromEntries(Object.entries(CHANNELS).map(([k, v]) => [k, v.label]));
import { CHANNELS, PUBLISHABLE, type ChannelId } from "./platforms/index.js";
import { listUploads, makeUploadToken, readUploadToken } from "./media.js";
import { WEBHOOK_EVENTS } from "./events.js";
import { cleanSlots, deleteQueue, describeSlots, freeSlots, loadQueue, QUEUE_COLS, QueueError, saveQueue, type Queue } from "./queue.js";
import { countText, validateMedia } from "./validate.js";
import { enroll, saveSequence, SequenceError, sequenceStats, setSequenceStatus, unenroll } from "./sequences.js";
import { PlatformError } from "./platforms/types.js";
import { registerConversion } from "./ingest.js";

export interface ToolCtx { sb: SupabaseClient; ws: string; canWrite: boolean; scopes?: string[]; env: Record<string, string | undefined>; userId?: string | null; multi?: boolean; origin?: string }
type Json = Record<string, unknown>;
type Schema = { type: "object"; properties: Record<string, Json>; required?: string[]; additionalProperties?: boolean };
export interface Tool { name: string; title: string; description: string; write: boolean; input: Schema; run: (ctx: ToolCtx, args: Json) => Promise<unknown> }

export class ToolError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Converte erros de plataforma (WhatsApp/Instagram) em erro 400 legível para o agente. */
const queueCall = async <T>(fn: () => Promise<T>) => { try { return await fn(); } catch (e) { if (e instanceof QueueError) throw new ToolError(400, e.message); throw e; } };
const seqCall = async <T>(fn: () => Promise<T>) => { try { return await fn(); } catch (e) { if (e instanceof SequenceError || e instanceof PlatformError) throw new ToolError(400, e.message); throw e; } };
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
    name: "publicar", title: "Publicar, agendar ou salvar rascunho em várias redes", write: true,
    description: "Publica agora, agenda, manda para a fila ou salva rascunho em uma ou várias redes de uma vez: Instagram, Facebook, Threads, LinkedIn, YouTube, TikTok, X, Pinterest, Google Meu Negócio, Telegram, Discord, Slack e Bluesky. Use 'textos_por_rede' para adaptar a legenda a cada rede, 'titulo' para YouTube e Pinterest, 'opcoes' para recursos de cada rede (primeiro comentário, thread, enquete, privacidade, playlist… veja opcoes_de_publicacao), 'horarios_por_rede' para horários diferentes e 'reciclar' para republicar de tempos em tempos. Se o espaço exigir aprovação, a publicação fica 'aguardando_aprovacao' até uma pessoa aprovar no app. Mídias: URLs públicas https (use gerar_link_de_envio para arquivos do computador). Antes, confira com validar_publicacao e mostre à pessoa o pacote (contas, textos, mídia, opções) para aprovar.",
    input: { type: "object", properties: {
      contas: { type: "array", items: { type: "string", format: "uuid" }, description: "IDs das contas (listar_contas_conectadas, campo pode_publicar). Obrigatório se houver mais de uma conta." },
      legenda: { type: "string", maxLength: 63206, description: "Texto padrão de todas as redes" },
      textos_por_rede: { type: "object", description: "Texto específico por rede, ex.: { \"x\": \"…\", \"linkedin_social\": \"…\" }. Chaves: instagram, facebook, threads, linkedin_social, youtube, tiktok_social, x, pinterest, google_business, telegram, discord, slack, bluesky", additionalProperties: { type: "string" } },
      titulo: { type: "string", maxLength: 100, description: "Título (obrigatório no YouTube; usado no Pinterest)" },
      midias: { type: "array", items: { type: "string" }, maxItems: 35 }, tipo: { type: "string", enum: ["IMAGE", "REELS", "CAROUSEL", "STORIES"], description: "Formato no Instagram" },
      agendar_para: { type: "string", format: "date-time", description: "Vazio = publicar agora" }, rascunho: { type: "boolean", description: "true = só salva como rascunho" },
      fila: { type: "boolean", description: "true = entra no próximo horário livre da fila (em vez de agendar_para)" }, fila_id: { type: "string", format: "uuid", description: "Fila específica (padrão: a principal)" },
      opcoes: { type: "object", description: "Opções por rede, ex.: { \"instagram\": { \"primeiro_comentario\": \"Link na bio\", \"colaboradores\": [\"@parceiro\"] }, \"x\": { \"thread\": [\"parte 2\", \"parte 3\"] }, \"youtube\": { \"visibilidade\": \"unlisted\" } }. Chaves: instagram, facebook, threads, linkedin_social, youtube, tiktok_social, x, pinterest, google_business, telegram, discord, slack, bluesky. Campos de cada rede: opcoes_de_publicacao.", additionalProperties: { type: "object" } },
      horarios_por_rede: { type: "object", description: "Horário próprio por rede (ISO 8601), ex.: { \"linkedin_social\": \"2026-12-01T11:00:00Z\" }. Redes sem horário próprio usam agendar_para (ou agora).", additionalProperties: { type: "string", format: "date-time" } },
      reciclar: { type: "object", description: "Republicar depois de publicada: { a_cada_dias: 30, vezes: 5, variacoes: [\"texto alternativo\"] }. YouTube e TikTok ficam de fora.", properties: { a_cada_dias: { type: "integer", minimum: 1, maximum: 365 }, vezes: { type: "integer", minimum: 1, maximum: 100 }, ate: { type: "string", format: "date-time" }, variacoes: { type: "array", items: { type: "string" }, maxItems: 10 } }, required: ["a_cada_dias"], additionalProperties: false },
      exige_aprovacao: { type: "boolean", description: "true = vai para aprovação de um administrador no app antes de publicar" },
    }, additionalProperties: false },
    run: async (ctx, a) => publishFor(ctx, a, PUBLISHABLE),
  },
  {
    name: "opcoes_de_publicacao", title: "Opções de publicação de cada rede", write: false,
    description: "Lista os campos aceitos em 'opcoes' do publicar para cada rede (primeiro comentário, thread, enquete, colaboradores, privacidade do TikTok, playlist do YouTube, pasta do Pinterest, evento/oferta do Google…), com tipo, limites e valores permitidos.",
    input: { type: "object", properties: { redes: { type: "array", items: { type: "string" }, description: "Vazio = todas. instagram, facebook, threads, linkedin_social, youtube, tiktok_social, x, pinterest, google_business, telegram, discord, slack, bluesky" } }, additionalProperties: false },
    run: async (_ctx, a) => {
      const want = (Array.isArray(a.redes) && a.redes.length ? a.redes.map((r) => str(r, 30)) : Object.keys(POST_OPTIONS)).filter((k) => k in POST_OPTIONS) as OptKind[];
      return { redes: Object.fromEntries(want.map((k) => [k, { nome: channelLabel(k as ChannelId), resumo: describeOptions(k), campos: POST_OPTIONS[k].map((f) => ({ campo: f.key, nome: f.label, tipo: f.type, ...(f.options ? { valores: f.options.map((o) => o.value) } : {}), ...(f.max !== undefined ? { max: f.max } : {}), ...(f.maxItems ? { max_itens: f.maxItems } : {}), ...(f.min !== undefined ? { min: f.min } : {}), ...(f.hint ? { dica: f.hint } : {}) })) }])) };
    },
  },
  {
    name: "importar_publicacoes_csv", title: "Importar publicações em massa (CSV)", write: true,
    description: "Cria várias publicações de uma vez a partir de um CSV (uma linha por publicação). Colunas: data (dd/mm/aaaa hh:mm em Brasília, ISO com fuso, 'fila' ou vazio = rascunho), texto, redes (instagram|facebook…), contas (@nome ou ID, separados por |), midias (links separados por |), titulo, primeiro_comentario, aprovacao (sim/nao). Por padrão só simula e devolve a prévia linha a linha; mostre à pessoa e chame de novo com simular=false para criar.",
    input: { type: "object", properties: { csv: { type: "string", maxLength: 2000000 }, simular: { type: "boolean", default: true }, contas_padrao: { type: "array", items: { type: "string", format: "uuid" }, description: "Contas para linhas sem 'contas' e sem 'redes'" } }, required: ["csv"], additionalProperties: false },
    run: async (ctx, a) => channel(() => importPostsCsv(chCtx(ctx), String(a.csv ?? ""), { dryRun: a.simular !== false, defaultAccountIds: Array.isArray(a.contas_padrao) ? a.contas_padrao.map((c) => str(c, 64)) : undefined })),
  },
  {
    name: "validar_publicacao", title: "Validar publicação antes de publicar", write: false,
    description: "Confere texto, título e mídias contra os limites de cada rede escolhida (tamanho do texto, número de fotos, vídeo obrigatório, título do YouTube…) sem publicar nada. Devolve problemas (que impedem) e avisos.",
    input: { type: "object", properties: {
      contas: { type: "array", items: { type: "string", format: "uuid" } }, redes: { type: "array", items: { type: "string" }, description: "Alternativa a contas: instagram, facebook, threads, linkedin_social, youtube, tiktok_social, x, pinterest, google_business, telegram, discord, slack, bluesky" },
      legenda: { type: "string" }, textos_por_rede: { type: "object", additionalProperties: { type: "string" } }, titulo: { type: "string" }, midias: { type: "array", items: { type: "string" } },
      opcoes: { type: "object", description: "Mesmo formato do publicar", additionalProperties: { type: "object" } },
    }, additionalProperties: false },
    run: async (ctx, a) => {
      let kinds = (Array.isArray(a.redes) ? a.redes.map((r) => str(r, 30)) : []).filter((k) => PUBLISHABLE.includes(k as ChannelId)) as ChannelId[];
      if (Array.isArray(a.contas) && a.contas.length) kinds = [...kinds, ...(await q<Json[]>(ctx.sb.from("channel_accounts").select("kind").eq("workspace_id", ctx.ws).in("id", a.contas.map((c) => str(c, 64))))).map((c) => c.kind as ChannelId)];
      if (!kinds.length) throw new ToolError(400, "Informe contas ou redes.");
      return checkPost(kinds, { text: str(a.legenda, 63206), title: str(a.titulo, 200) || undefined, custom: (a.textos_por_rede ?? {}) as Record<string, string>, mediaUrls: Array.isArray(a.midias) ? a.midias.map((m) => str(m, 1000)) : [], options: cleanOptions(a.opcoes, kinds) });
    },
  },
  {
    name: "publicar_instagram", title: "Publicar, agendar ou salvar rascunho no Instagram", write: true,
    description: "Atalho de publicar só para o Instagram (post, reels, carrossel ou stories). Para várias redes use publicar.",
    input: { type: "object", properties: {
      legenda: { type: "string", maxLength: 2200 }, contas: { type: "array", items: { type: "string", format: "uuid" }, description: "IDs das contas do Instagram. Opcional se houver só uma." },
      midias: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10 }, tipo: { type: "string", enum: ["IMAGE", "REELS", "CAROUSEL", "STORIES"] },
      agendar_para: { type: "string", format: "date-time", description: "Vazio = publicar agora" }, rascunho: { type: "boolean", description: "true = só salva como rascunho" },
    }, required: ["midias"], additionalProperties: false },
    run: async (ctx, a) => publishFor(ctx, a, ["instagram"]),
  },
  /* ---------------------------------------------------------------- contas, análises e automações (agente gestor de redes sociais) */
  {
    name: "listar_contas_conectadas", title: "Listar contas conectadas", write: false,
    description: "Todas as contas do espaço: plataformas de anúncio (Meta, Google, TikTok, LinkedIn), canais (WhatsApp, Instagram) e redes de publicação (Facebook, Threads, LinkedIn, YouTube, TikTok, X, Telegram, Discord, Bluesky), com saúde da conexão, se dá para publicar e os limites de cada rede.",
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
        canais: chans.map((c) => ({ id: c.id, tipo: channelLabel(c.kind as ChannelId), rede: c.kind, nome: c.display_name || c.name, usuario: c.name, status: c.status, qualidade: c.quality, ligado: c.enabled, pode_publicar: PUBLISHABLE.includes(c.kind as ChannelId) && c.status === "ativo", limites: CHANNELS[c.kind as ChannelId]?.limits ?? null, saude: c.status === "ativo" && c.enabled !== false ? "saudável" : "reconectar" })),
      };
    },
  },
  {
    name: "analisar_publicacoes", title: "Analisar publicações de todas as redes", write: false,
    description: "Desempenho das publicações no período em todas as redes conectadas (Instagram, Facebook, Threads, LinkedIn de empresa, YouTube, TikTok, X, Pinterest e Bluesky) — inclusive as feitas fora do NinePro: totais, taxa de engajamento, comparação por rede e por formato, melhor dia e horário (Brasília, pelo desempenho relativo de cada conta), frequência × engajamento, crescimento de seguidores e as melhores e piores publicações com link. Use para decidir o que, onde e quando publicar.",
    input: { type: "object", properties: {
      dias: { type: "integer", minimum: 1, maximum: 365, default: 90, description: "Janela em dias até hoje." },
      redes: { type: "array", items: { type: "string" }, description: "Filtra por rede: instagram, facebook, threads, linkedin_social, youtube, tiktok_social, x, pinterest, google_business, telegram, slack, bluesky. Vazio = todas." },
      conta_id: { type: "string", format: "uuid", description: "Uma conta (listar_contas_conectadas). Vazio = todas." },
      ordenar_por: { type: "string", enum: ["engajamento", "alcance", "visualizacoes", "impressoes", "curtidas", "comentarios", "salvamentos", "compartilhamentos", "cliques"], default: "engajamento" },
      limite: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      atualizar: { type: "boolean", default: false, description: "Busca os números mais recentes nas redes antes de analisar (mais lento)." },
    }, additionalProperties: false },
    run: async (ctx, a) => {
      const contaId = a.conta_id ? needUuid(a.conta_id, "conta_id") : undefined;
      const kinds = (Array.isArray(a.redes) ? a.redes.map((r) => str(r, 30)) : []).filter((k) => k in CHANNEL_LABELS);
      const atualizadas = a.atualizar === true ? await refreshMediaStats(ctx.sb, ctx.env, ctx.ws, contaId, kinds as ChannelId[]) : undefined;
      const r = await loadAnalytics(ctx.sb, ctx.ws, { days: int(a.dias, 90, 1, 365), kinds, accountId: contaId, limit: int(a.limite, 10, 1, 50), sortBy: oneOf(a.ordenar_por, ["engajamento", "alcance", "visualizacoes", "impressoes", "curtidas", "comentarios", "salvamentos", "compartilhamentos", "cliques"], "ordenar_por", true) as never, labels: CHANNEL_LABELS });
      const { melhor_horario, ...rest } = r;
      if (!r.publicacoes) return { ...rest, melhor_horario: melhor_horario.melhores, aviso: "Nenhuma publicação com estatísticas no período. Confira as contas (listar_contas_conectadas) ou use atualizar=true.", atualizadas };
      return { ...rest, melhor_horario: { melhores: melhor_horario.melhores, como_ler: melhor_horario.como_ler }, seguidores: { ...r.seguidores, contas: r.seguidores.contas.map(({ serie: _s, ...c }) => c), serie_total: undefined }, atualizadas };
    },
  },
  {
    name: "melhor_horario", title: "Melhor dia e horário para publicar", write: false,
    description: "Mapa dia da semana × hora (Brasília) com o desempenho médio das publicações, em relação à média da própria conta (1 = média; 1,5 = 50% acima), e os 3 melhores horários. Filtre por rede para recomendar horários específicos (ex.: LinkedIn de manhã, Instagram à noite).",
    input: { type: "object", properties: { dias: { type: "integer", minimum: 7, maximum: 365, default: 90 }, redes: { type: "array", items: { type: "string" } }, conta_id: { type: "string", format: "uuid" } }, additionalProperties: false },
    run: async (ctx, a) => {
      const r = await loadAnalytics(ctx.sb, ctx.ws, { days: int(a.dias, 90, 7, 365), kinds: (Array.isArray(a.redes) ? a.redes.map((x) => str(x, 30)) : []).filter((k) => k in CHANNEL_LABELS), accountId: a.conta_id ? needUuid(a.conta_id, "conta_id") : undefined, labels: CHANNEL_LABELS });
      return { publicacoes_analisadas: r.publicacoes, melhores: r.melhor_horario.melhores, por_dia_da_semana: r.por_dia_da_semana.filter((d) => d.publicacoes), por_horario: r.por_horario.filter((h) => h.publicacoes), mapa: r.melhor_horario.mapa, como_ler: r.melhor_horario.como_ler, ...(r.publicacoes < 10 ? { aviso: "Poucas publicações no período: trate como indicação, não como regra." } : {}) };
    },
  },
  {
    name: "crescimento_seguidores", title: "Crescimento de seguidores", write: false,
    description: "Seguidores de cada conta (hoje e no início do período), ganho no período e a série diária. O histórico começa a contar a partir da conexão da conta no NinePro (uma foto por dia).",
    input: { type: "object", properties: { dias: { type: "integer", minimum: 1, maximum: 365, default: 30 }, redes: { type: "array", items: { type: "string" } }, conta_id: { type: "string", format: "uuid" } }, additionalProperties: false },
    run: async (ctx, a) => {
      const r = await loadAnalytics(ctx.sb, ctx.ws, { days: int(a.dias, 30, 1, 365), kinds: (Array.isArray(a.redes) ? a.redes.map((x) => str(x, 30)) : []).filter((k) => k in CHANNEL_LABELS), accountId: a.conta_id ? needUuid(a.conta_id, "conta_id") : undefined, labels: CHANNEL_LABELS });
      return { ...r.seguidores, ...(r.seguidores.contas.length ? {} : { aviso: "Ainda sem histórico de seguidores. Ele é gravado uma vez por dia depois que a conta é conectada." }) };
    },
  },
  {
    name: "listar_publicacoes", title: "Listar publicações do NinePro", write: false,
    description: "Publicações criadas pelo NinePro (rascunho, agendada, publicada, falhou), com o ID da mídia e o link de cada conta quando publicada.",
    input: { type: "object", properties: { status: { type: "string", enum: ["rascunho", "agendada", "aguardando_aprovacao", "publicada", "parcial", "falhou"] }, limite: { type: "integer", minimum: 1, maximum: 100, default: 20 } }, additionalProperties: false },
    run: async (ctx, a) => {
      let pq = ctx.sb.from("posts").select("id, content, status, media_type, media_urls, scheduled_at, published_at, result, error, created_at, options, times, recycling, recycled_from, review_note, source").eq("workspace_id", ctx.ws).order("created_at", { ascending: false }).limit(int(a.limite, 20, 1, 100));
      const st = oneOf(a.status, ["rascunho", "agendada", "aguardando_aprovacao", "publicada", "parcial", "falhou"], "status", true); if (st) pq = pq.eq("status", st);
      const rows = await q<Json[]>(pq);
      return { publicacoes: rows.map((p) => ({ id: p.id, status: p.status, legenda: String(p.content ?? "").slice(0, 400), formato: p.media_type, midias: p.media_urls, agendada_para: p.scheduled_at, publicada_em: p.published_at, erro: p.error, opcoes: p.options ?? {}, horarios_por_rede: p.times ?? {}, reciclar: p.recycling ?? null, reciclada_de: p.recycled_from ?? null, motivo_rejeicao: p.review_note ?? null, origem: p.source ?? "app", contas: Object.values((p.result ?? {}) as Record<string, Json>).map((r) => ({ rede: r.rede ?? "Instagram", conta: r.conta, midia_id: r.id ?? null, link: r.permalink ?? null, erro: r.erro ?? null, aviso: r.aviso ?? null, pendente_ate: r.pendente ?? null })) })) };
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
  /* ---------------------------------------------------------------- fila de publicação */
  {
    name: "listar_filas", title: "Listar filas de publicação", write: false,
    description: "Filas do espaço com os horários semanais (fuso de cada fila), se está ativa, se é a padrão e os próximos horários livres.",
    input: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => {
      const rows = await q<Json[]>(ctx.sb.from("post_queues").select(QUEUE_COLS).eq("workspace_id", ctx.ws).order("created_at"));
      const filas = [];
      for (const r of rows) { const fq = { ...(r as unknown as Queue), slots: cleanSlots(r.slots) }; filas.push({ id: fq.id, nome: fq.name, padrao: fq.is_default, ativa: fq.active, fuso: fq.timezone, horarios: describeSlots(fq.slots), contas_padrao: fq.account_ids, proximos_livres: (await freeSlots(ctx.sb, fq, 5)).map((d) => d.toISOString()) }); }
      return { filas };
    },
  },
  {
    name: "configurar_fila", title: "Criar ou alterar fila de publicação", write: true,
    description: "Define os horários fixos da semana em que a fila publica (ex.: segunda a sexta às 09:00 e 18:00). Sem fila_id cria uma nova (a primeira vira a padrão). reorganizar=true reagenda o que já está na fila nos novos horários, mantendo a ordem.",
    input: { type: "object", properties: {
      fila_id: { type: "string", format: "uuid" }, nome: { type: "string", maxLength: 80 },
      horarios: { type: "array", maxItems: 168, items: { type: "object", properties: { dia: { type: "integer", minimum: 0, maximum: 6, description: "0 = domingo … 6 = sábado" }, hora: { type: "string", description: "HH:MM" } }, required: ["dia", "hora"] } },
      fuso: { type: "string", default: "America/Sao_Paulo" }, contas: { type: "array", items: { type: "string", format: "uuid" }, description: "Contas usadas quando a publicação não informar contas" },
      ativa: { type: "boolean" }, padrao: { type: "boolean" }, reorganizar: { type: "boolean" },
    }, additionalProperties: false },
    run: async (ctx, a) => queueCall(() => saveQueue(ctx.sb, ctx.ws, { id: a.fila_id ? needUuid(a.fila_id, "fila_id") : undefined, name: a.nome as string | undefined, timezone: str(a.fuso, 60) || undefined, slots: a.horarios, accountIds: Array.isArray(a.contas) ? a.contas.map((c) => str(c, 64)) : undefined, active: typeof a.ativa === "boolean" ? a.ativa : undefined, setAsDefault: a.padrao === true, reshuffle: a.reorganizar === true }).then((r) => ({ ...r, fila: { ...r.fila, horarios: describeSlots(r.fila.slots) } }))),
  },
  {
    name: "proximos_horarios", title: "Próximos horários livres da fila", write: false,
    description: "Os próximos N horários livres de uma fila (padrão: a fila principal), em ISO 8601.",
    input: { type: "object", properties: { fila_id: { type: "string", format: "uuid" }, quantidade: { type: "integer", minimum: 1, maximum: 50, default: 10 } }, additionalProperties: false },
    run: async (ctx, a) => queueCall(async () => { const fq = await loadQueue(ctx.sb, ctx.ws, a.fila_id ? needUuid(a.fila_id, "fila_id") : null); return { fila: fq.name, fuso: fq.timezone, proximos: (await freeSlots(ctx.sb, fq, int(a.quantidade, 10, 1, 50))).map((d) => d.toISOString()) }; }),
  },
  {
    name: "excluir_fila", title: "Excluir fila", write: true,
    description: "Exclui uma fila. As publicações já agendadas por ela continuam agendadas no mesmo horário.",
    input: { type: "object", properties: { fila_id: { type: "string", format: "uuid" } }, required: ["fila_id"], additionalProperties: false },
    run: async (ctx, a) => queueCall(() => deleteQueue(ctx.sb, ctx.ws, needUuid(a.fila_id, "fila_id"))),
  },
  /* ---------------------------------------------------------------- validação */
  {
    name: "validar_midia", title: "Validar mídia (imagem ou vídeo)", write: false,
    description: "Confere se a URL abre e se o arquivo é mesmo imagem ou vídeo (pelos bytes, não pela extensão). Devolve formato, tamanho, dimensões, proporção, duração do vídeo e, para cada rede, se passa nos limites (tamanho, formato, duração, proporção do feed do Instagram). Recusa endereços internos.",
    input: { type: "object", properties: { url: { type: "string" }, redes: { type: "array", items: { type: "string" } } }, required: ["url"], additionalProperties: false },
    run: async (_ctx, a) => validateMedia(str(a.url, 2000), (Array.isArray(a.redes) ? a.redes.map((r) => str(r, 30)) : undefined) as ChannelId[] | undefined),
  },
  {
    name: "contar_caracteres", title: "Contar caracteres por rede", write: false,
    description: "Contagem do texto em cada rede e quanto sobra do limite. No X a contagem é ponderada (link = 23, emoji = 2). Também conta hashtags e menções (Instagram: até 30 e 20).",
    input: { type: "object", properties: { texto: { type: "string" }, redes: { type: "array", items: { type: "string" } } }, required: ["texto"], additionalProperties: false },
    run: async (_ctx, a) => countText(String(a.texto ?? ""), (Array.isArray(a.redes) ? a.redes.map((r) => str(r, 30)) : undefined) as ChannelId[] | undefined),
  },
  /* ---------------------------------------------------------------- sequências */
  {
    name: "listar_sequencias", title: "Listar sequências de mensagens", write: false,
    description: "Sequências (mensagens em etapas com intervalo, pelo WhatsApp ou Instagram) com status, número de passos e inscritos ativos, concluídos, que saíram e com falha.",
    input: { type: "object", properties: { status: { type: "string", enum: ["rascunho", "ativa", "pausada"] } }, additionalProperties: false },
    run: async (ctx, a) => {
      let sq = ctx.sb.from("sequences").select("id, name, description, status, steps, exit_on_reply, channel_account_id, channel_accounts(kind, name), created_at").eq("workspace_id", ctx.ws).order("created_at", { ascending: false });
      const st = oneOf(a.status, ["rascunho", "ativa", "pausada"], "status", true); if (st) sq = sq.eq("status", st);
      const rows = await q<Json[]>(sq);
      const stats = await sequenceStats(ctx.sb, rows.map((r) => r.id as string));
      return { sequencias: rows.map((r) => { const acc = r.channel_accounts as { kind?: string; name?: string } | null; const steps = (r.steps as Json[]) ?? []; return { id: r.id, nome: r.name, descricao: r.description, status: r.status, canal: acc?.kind ? channelLabel(acc.kind as ChannelId) : null, conta: acc?.name ?? null, passos: steps.length, sai_ao_responder: r.exit_on_reply, primeira_mensagem: steps[0]?.text ?? (steps[0] ? "(modelo do WhatsApp)" : null), inscritos: stats[r.id as string] ?? { ativos: 0, concluidos: 0, sairam: 0, falharam: 0 } }; }) };
    },
  },
  {
    name: "criar_sequencia", title: "Criar ou alterar sequência de mensagens", write: true,
    description: "Cria (ou altera, com sequencia_id) uma sequência: passos com intervalo em minutos desde o passo anterior, cada um com texto (enviado só dentro da janela de 24 h após a última mensagem do contato) ou um modelo aprovado do WhatsApp (a qualquer momento). Aceita {{nome}} e {{primeiro_nome}}. Fica em rascunho até ativar_sequencia. Mostre os passos à pessoa e peça aprovação antes de ativar.",
    input: { type: "object", properties: {
      sequencia_id: { type: "string", format: "uuid" }, nome: { type: "string", maxLength: 120 }, descricao: { type: "string", maxLength: 500 },
      conta_id: { type: "string", format: "uuid", description: "Número do WhatsApp ou conta do Instagram que envia (listar_contas_conectadas)" },
      passos: { type: "array", maxItems: 20, items: { type: "object", properties: {
        esperar_minutos: { type: "integer", minimum: 0, description: "Intervalo desde o passo anterior (o primeiro conta desde a inscrição). 1440 = 1 dia" },
        tipo: { type: "string", enum: ["texto", "modelo"] }, texto: { type: "string" }, modelo_id: { type: "string", format: "uuid" }, variaveis: { type: "array", items: { type: "string" } },
      }, required: ["esperar_minutos"] } },
      sai_ao_responder: { type: "boolean", default: true },
    }, additionalProperties: false },
    run: async (ctx, a) => seqCall(async () => {
      const s = await saveSequence(ctx.sb, ctx.ws, null, { id: a.sequencia_id ? needUuid(a.sequencia_id, "sequencia_id") : undefined, name: a.nome, description: a.descricao, channel_account_id: a.conta_id !== undefined ? (a.conta_id ? needUuid(a.conta_id, "conta_id") : null) : undefined, steps: a.passos, exit_on_reply: a.sai_ao_responder, source: a.sequencia_id ? undefined : "agente" });
      return { sequencia: { id: s.id, nome: s.name, status: s.status, passos: ((s.steps as Json[]) ?? []).length }, proximo_passo: s.status === "ativa" ? "Já está ativa." : "Revise com a pessoa e chame ativar_sequencia." };
    }),
  },
  {
    name: "ativar_sequencia", title: "Ativar ou pausar sequência", write: true,
    description: "Ativa (começa a enviar para os inscritos) ou pausa uma sequência.",
    input: { type: "object", properties: { sequencia_id: { type: "string", format: "uuid" }, acao: { type: "string", enum: ["ativar", "pausar"] } }, required: ["sequencia_id", "acao"], additionalProperties: false },
    run: async (ctx, a) => seqCall(() => setSequenceStatus(ctx.sb, ctx.ws, needUuid(a.sequencia_id, "sequencia_id"), a.acao === "ativar" ? "ativa" : "pausada")),
  },
  {
    name: "excluir_sequencia", title: "Excluir sequência", write: true,
    description: "Exclui uma sequência. As inscrições param na hora.",
    input: { type: "object", properties: { sequencia_id: { type: "string", format: "uuid" } }, required: ["sequencia_id"], additionalProperties: false },
    run: async (ctx, a) => {
      const gone = await q<Json[]>(ctx.sb.from("sequences").delete().eq("workspace_id", ctx.ws).eq("id", needUuid(a.sequencia_id, "sequencia_id")).select("id"));
      if (!gone.length) throw new ToolError(404, "Sequência não encontrada neste espaço.");
      return { ok: true };
    },
  },
  {
    name: "inscrever_na_sequencia", title: "Inscrever contatos na sequência", write: true,
    description: "Inscreve conversas (listar_conversas) ou números do WhatsApp na sequência. Quem já está inscrito é ignorado. Números sem conversa exigem que o primeiro passo seja um modelo.",
    input: { type: "object", properties: {
      sequencia_id: { type: "string", format: "uuid" }, conversas: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 5000 },
      numeros: { type: "array", maxItems: 5000, items: { type: "object", properties: { telefone: { type: "string" }, nome: { type: "string" } }, required: ["telefone"] } },
    }, required: ["sequencia_id"], additionalProperties: false },
    run: async (ctx, a) => seqCall(() => enroll(ctx.sb, ctx.ws, needUuid(a.sequencia_id, "sequencia_id"), { conversationIds: Array.isArray(a.conversas) ? a.conversas.map((c) => str(c, 64)) : [], phones: Array.isArray(a.numeros) ? a.numeros.map((n) => ({ phone: str((n as Json).telefone, 30), name: str((n as Json).nome, 120) })) : [] })),
  },
  {
    name: "listar_inscricoes", title: "Listar inscritos de uma sequência", write: false,
    description: "Contatos inscritos com status (ativa, concluída, saiu, falhou), passo atual, próximo envio e motivo de saída ou erro.",
    input: { type: "object", properties: { sequencia_id: { type: "string", format: "uuid" }, status: { type: "string", enum: ["ativa", "concluida", "saiu", "falhou"] }, limite: { type: "integer", minimum: 1, maximum: 500, default: 100 } }, required: ["sequencia_id"], additionalProperties: false },
    run: async (ctx, a) => {
      let eq = ctx.sb.from("sequence_enrollments").select("id, conversation_id, phone, contact_name, status, current_step, next_run_at, exit_reason, last_error, enrolled_at").eq("workspace_id", ctx.ws).eq("sequence_id", needUuid(a.sequencia_id, "sequencia_id")).order("enrolled_at", { ascending: false }).limit(int(a.limite, 100, 1, 500));
      const st = oneOf(a.status, ["ativa", "concluida", "saiu", "falhou"], "status", true); if (st) eq = eq.eq("status", st);
      return { inscricoes: (await q<Json[]>(eq)).map((e) => ({ id: e.id, contato: e.contact_name, conversa_id: e.conversation_id, telefone: e.phone ? `+${e.phone}` : null, status: e.status, passo_atual: (e.current_step as number) + 1, proximo_envio: e.next_run_at, motivo_saida: e.exit_reason, erro: e.last_error, inscrito_em: e.enrolled_at })) };
    },
  },
  {
    name: "remover_da_sequencia", title: "Remover contato da sequência", write: true,
    description: "Tira um inscrito da sequência (não recebe mais mensagens dela).",
    input: { type: "object", properties: { inscricao_id: { type: "string", format: "uuid" } }, required: ["inscricao_id"], additionalProperties: false },
    run: async (ctx, a) => seqCall(() => unenroll(ctx.sb, ctx.ws, needUuid(a.inscricao_id, "inscricao_id"))),
  },
  /* ---------------------------------------------------------------- mídia, publicações, perfis, disparos e webhooks */
  {
    name: "gerar_link_de_envio", title: "Gerar link para enviar fotos e vídeos", write: true,
    description: "Você (agente) não consegue ler arquivos do computador da pessoa. Gere este link, entregue a ela para abrir no navegador e soltar as fotos ou vídeos (até 20 arquivos, vale 30 minutos). Quando ela disser que terminou, chame verificar_envio com o token para receber as URLs e publicar.",
    input: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => {
      const t = makeUploadToken(ctx.env, ctx.ws);
      const origin = (ctx.env.PUBLIC_URL || ctx.origin || "https://ninepro.vercel.app").replace(/\/$/, "");
      return { link: `${origin}/enviar/${t.token}`, token: t.token, expira_em: t.expiresAt, instrucoes: "Abra o link no navegador, solte as fotos ou vídeos e me avise quando terminar." };
    },
  },
  {
    name: "verificar_envio", title: "Verificar arquivos enviados pelo link", write: false,
    description: "Situação de um link de envio: pendente (nada enviado ainda), expirado ou concluído, com nome, tipo, tamanho e URL pública de cada arquivo. Use 'midias' direto em publicar_instagram.",
    input: { type: "object", properties: { token: { type: "string", description: "Token devolvido por gerar_link_de_envio" } }, required: ["token"], additionalProperties: false },
    run: async (ctx, a) => {
      const t = readUploadToken(ctx.env, str(a.token, 400));
      if (!t || t.ws !== ctx.ws) throw new ToolError(400, "Token de envio inválido para este espaço.");
      const arquivos = await listUploads(ctx.sb, t.ws, t.id);
      return { status: arquivos.length ? "concluido" : t.expired ? "expirado" : "pendente", arquivos, midias: arquivos.filter((f) => f.tipo.startsWith("image/") || f.tipo.startsWith("video/")).map((f) => f.url) };
    },
  },
  {
    name: "detalhar_publicacao", title: "Detalhar publicação", write: false,
    description: "Uma publicação do NinePro: legenda, mídias, contas, status, agendamento, resultado por conta e erro.",
    input: { type: "object", properties: { publicacao_id: { type: "string", format: "uuid" } }, required: ["publicacao_id"], additionalProperties: false },
    run: async (ctx, a) => {
      const p = await q<Json | null>(ctx.sb.from("posts").select("id, content, status, media_type, media_urls, channel_account_ids, scheduled_at, published_at, result, error, attempts, created_at, updated_at").eq("workspace_id", ctx.ws).eq("id", needUuid(a.publicacao_id, "publicacao_id")).maybeSingle());
      if (!p) throw new ToolError(404, "Publicação não encontrada neste espaço.");
      return { publicacao: { id: p.id, status: p.status, legenda: p.content, formato: p.media_type, midias: p.media_urls, contas: p.channel_account_ids, agendada_para: p.scheduled_at, publicada_em: p.published_at, tentativas: p.attempts, erro: p.error, resultado: p.result } };
    },
  },
  {
    name: "editar_publicacao", title: "Editar publicação", write: true,
    description: "Altera legenda, mídias, contas ou horário de uma publicação em rascunho, agendada ou que falhou. Publicadas não podem ser editadas.",
    input: { type: "object", properties: {
      publicacao_id: { type: "string", format: "uuid" }, legenda: { type: "string" }, textos_por_rede: { type: "object", additionalProperties: { type: "string" } }, titulo: { type: "string" }, midias: { type: "array", items: { type: "string" }, maxItems: 35 },
      contas: { type: "array", items: { type: "string", format: "uuid" } }, tipo: { type: "string", enum: ["IMAGE", "REELS", "CAROUSEL", "STORIES"] },
      agendar_para: { type: "string", format: "date-time", description: "Novo horário. Vazio mantém como está." }, rascunho: { type: "boolean", description: "true = volta para rascunho (sai da fila)." },
      opcoes: { type: "object", additionalProperties: { type: "object" } }, horarios_por_rede: { type: "object", additionalProperties: { type: "string" } }, reciclar: { type: "object" }, exige_aprovacao: { type: "boolean" },
    }, required: ["publicacao_id"], additionalProperties: false },
    run: async (ctx, a) => {
      const id = needUuid(a.publicacao_id, "publicacao_id");
      const p = await q<Json | null>(ctx.sb.from("posts").select("id, status, content, title, custom, media_urls, media_type, channel_account_ids, scheduled_at, options, times, recycling").eq("workspace_id", ctx.ws).eq("id", id).maybeSingle());
      if (!p) throw new ToolError(404, "Publicação não encontrada neste espaço.");
      if (p.status === "publicada" || p.status === "parcial") throw new ToolError(409, p.status === "parcial" ? "Já saiu em parte das redes: use tentar_novamente para as que falharam, ou crie uma nova." : "Publicação já publicada não pode ser editada. Crie uma nova.");
      const when = str(a.agendar_para, 40) || (p.status === "agendada" ? (p.scheduled_at as string) : "");
      const mode = a.rascunho === true ? "rascunho" : when ? "agendar" : p.status === "agendada" || p.status === "aguardando_aprovacao" ? "agendar" : "rascunho";
      return channel(() => savePost(chCtx(ctx), { id, title: a.titulo !== undefined ? str(a.titulo, 200) : p.title, custom: a.textos_por_rede ?? p.custom, content: a.legenda !== undefined ? str(a.legenda, 63206) : p.content, mediaUrls: Array.isArray(a.midias) ? a.midias : p.media_urls, accountIds: Array.isArray(a.contas) ? a.contas : p.channel_account_ids, mediaType: a.tipo ?? p.media_type, scheduledAt: when || undefined, mode, options: a.opcoes ?? p.options, times: a.horarios_por_rede ?? p.times, recycling: a.reciclar ?? p.recycling, requiresApproval: a.exige_aprovacao === true }));
    },
  },
  {
    name: "excluir_publicacao", title: "Excluir publicação", write: true,
    description: "Exclui uma publicação em rascunho, agendada ou que falhou. O que já foi publicado no Instagram continua lá (a API do Instagram não permite apagar).",
    input: { type: "object", properties: { publicacao_id: { type: "string", format: "uuid" } }, required: ["publicacao_id"], additionalProperties: false },
    run: async (ctx, a) => {
      const id = needUuid(a.publicacao_id, "publicacao_id");
      const p = await q<Json | null>(ctx.sb.from("posts").select("id, status").eq("workspace_id", ctx.ws).eq("id", id).maybeSingle());
      if (!p) throw new ToolError(404, "Publicação não encontrada neste espaço.");
      if (p.status === "publicada" || p.status === "parcial") throw new ToolError(409, "Já foi publicada: apague direto na rede, se quiser.");
      await q(ctx.sb.from("posts").delete().eq("id", id));
      return { ok: true, excluida: id };
    },
  },
  {
    name: "publicar_agora", title: "Publicar agora uma publicação existente", write: true,
    description: "Publica imediatamente um rascunho ou uma publicação agendada.",
    input: { type: "object", properties: { publicacao_id: { type: "string", format: "uuid" } }, required: ["publicacao_id"], additionalProperties: false },
    run: async (ctx, a) => {
      const id = needUuid(a.publicacao_id, "publicacao_id");
      const p = await q<Json | null>(ctx.sb.from("posts").select("id, status, content, title, custom, media_urls, media_type, channel_account_ids, options, recycling").eq("workspace_id", ctx.ws).eq("id", id).maybeSingle());
      if (!p) throw new ToolError(404, "Publicação não encontrada neste espaço.");
      if (p.status === "publicada") throw new ToolError(409, "Esta publicação já foi publicada.");
      if (p.status === "aguardando_aprovacao") throw new ToolError(409, "Esta publicação aguarda a aprovação de um administrador no app. Agentes não aprovam publicações.");
      if (p.status === "parcial" || p.status === "falhou") return channel(() => publishPost(ctx.sb, ctx.env, id));
      return channel(() => savePost(chCtx(ctx), { id, title: p.title, custom: p.custom, content: p.content, mediaUrls: p.media_urls, accountIds: p.channel_account_ids, mediaType: p.media_type, mode: "agora", options: p.options, recycling: p.recycling }));
    },
  },
  {
    name: "tentar_novamente", title: "Tentar de novo publicações que falharam", write: true,
    description: "Publica de novo o que falhou: uma publicação (publicacao_id) ou todas as dos últimos 7 dias (todas=true). Nas que saíram em parte das redes, tenta só as redes que falharam.",
    input: { type: "object", properties: { publicacao_id: { type: "string", format: "uuid" }, todas: { type: "boolean" } }, additionalProperties: false },
    run: async (ctx, a) => {
      let fq = ctx.sb.from("posts").select("id").eq("workspace_id", ctx.ws).in("status", ["falhou", "parcial"]).gte("updated_at", new Date(Date.now() - 7 * DAY).toISOString()).limit(20);
      if (a.publicacao_id) fq = ctx.sb.from("posts").select("id").eq("workspace_id", ctx.ws).in("status", ["falhou", "parcial"]).eq("id", needUuid(a.publicacao_id, "publicacao_id"));
      else if (a.todas !== true) throw new ToolError(400, "Informe publicacao_id ou todas=true.");
      const list = await q<Json[]>(fq);
      if (!list.length) return { tentadas: 0, aviso: "Nenhuma publicação com falha encontrada." };
      const resultados = [];
      for (const p of list) resultados.push({ id: p.id, ...(await channel(() => publishPost(ctx.sb, ctx.env, p.id as string)).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))) });
      return { tentadas: resultados.length, publicadas: resultados.filter((r) => r.ok).length, resultados };
    },
  },
  {
    name: "listar_perfis", title: "Listar perfis (espaços de clientes)", write: false,
    description: "Espaços de trabalho (um por cliente/marca) que esta conexão pode usar. Quando a conexão libera todos os espaços, passe perfil_id em qualquer ferramenta para agir naquele cliente.",
    input: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => {
      const ids = ctx.multi && ctx.userId ? (await q<Json[]>(ctx.sb.from("workspace_members").select("workspace_id, role").eq("user_id", ctx.userId))) : [{ workspace_id: ctx.ws, role: null }];
      const ws = await q<Json[]>(ctx.sb.from("workspaces").select("id, name").in("id", ids.map((i) => i.workspace_id as string)));
      const counts = await q<Json[]>(ctx.sb.from("channel_accounts").select("workspace_id").in("workspace_id", ids.map((i) => i.workspace_id as string)));
      return { atual: ctx.ws, todos_os_espacos: !!ctx.multi, perfis: ws.map((w) => ({ id: w.id, nome: w.name, papel: ids.find((i) => i.workspace_id === w.id)?.role ?? null, canais: counts.filter((c) => c.workspace_id === w.id).length, atual: w.id === ctx.ws })) };
    },
  },
  {
    name: "criar_disparo_whatsapp", title: "Disparar modelo do WhatsApp para uma lista", write: true,
    description: "Envia um modelo aprovado para até 5.000 números (remove repetidos e inválidos). Variáveis aceitam {{nome}} e {{primeiro_nome}}. Mostre à pessoa o modelo, a quantidade e uma amostra e peça aprovação antes.",
    input: { type: "object", properties: {
      nome: { type: "string", maxLength: 120 }, modelo_id: { type: "string", format: "uuid" },
      destinatarios: { type: "array", maxItems: 5000, items: { type: "object", properties: { telefone: { type: "string" }, nome: { type: "string" } }, required: ["telefone"] } },
      variaveis: { type: "array", items: { type: "string" } }, numero_id: { type: "string", format: "uuid", description: "Número remetente (opcional)" },
    }, required: ["modelo_id", "destinatarios"], additionalProperties: false },
    run: async (ctx, a) => channel(() => createBroadcast({ sb: ctx.sb, env: ctx.env, ws: ctx.ws, userId: null }, { name: str(a.nome, 120), templateId: needUuid(a.modelo_id, "modelo_id"), accountId: a.numero_id ? needUuid(a.numero_id, "numero_id") : undefined, params: Array.isArray(a.variaveis) ? a.variaveis : [], recipients: (Array.isArray(a.destinatarios) ? a.destinatarios : []).map((r) => ({ phone: str((r as Json).telefone, 30), name: str((r as Json).nome, 120) })) })),
  },
  {
    name: "listar_disparos", title: "Listar disparos do WhatsApp", write: false,
    description: "Disparos com total, enviados, falhas e status.",
    input: { type: "object", properties: { limite: { type: "integer", minimum: 1, maximum: 100, default: 20 } }, additionalProperties: false },
    run: async (ctx, a) => ({ disparos: await q<Json[]>(ctx.sb.from("msg_campaigns").select("id, name, template_name, status, total, sent, failed, created_at, finished_at").eq("workspace_id", ctx.ws).order("created_at", { ascending: false }).limit(int(a.limite, 20, 1, 100))) }),
  },
  {
    name: "listar_webhooks", title: "Listar webhooks", write: false,
    description: "Endereços que recebem eventos do NinePro (lead criado, mensagem recebida, publicação publicada…).",
    input: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => ({ webhooks: await q<Json[]>(ctx.sb.from("webhooks").select("id, name, endpoint, events, active, created_at").eq("workspace_id", ctx.ws).order("created_at")), eventos_disponiveis: WEBHOOK_EVENTS.map((e) => e.id) }),
  },
  {
    name: "criar_webhook", title: "Criar webhook", write: true,
    description: "Cadastra um endereço https para receber eventos. Devolve o segredo de assinatura (cabeçalho X-NinePro-Signature, HMAC SHA-256) uma única vez.",
    input: { type: "object", properties: { nome: { type: "string", maxLength: 120 }, endereco: { type: "string", description: "https://…" }, eventos: { type: "array", items: { type: "string" }, description: "Vazio = todos" } }, required: ["endereco"], additionalProperties: false },
    run: async (ctx, a) => {
      const endpoint = str(a.endereco, 500);
      if (!/^https:\/\/[^\s/]+\.[^\s]+/.test(endpoint)) throw new ToolError(400, "O endereço precisa ser https.");
      const valid = WEBHOOK_EVENTS.map((e) => e.id as string);
      const events = (Array.isArray(a.eventos) ? a.eventos.map((e) => str(e, 60)) : []).filter((e) => valid.includes(e));
      const row = await q<Json>(ctx.sb.from("webhooks").insert({ workspace_id: ctx.ws, name: str(a.nome, 120) || "Agente", endpoint, events: events.length ? events : valid }).select("id, name, endpoint, events, signing_secret").single());
      return { webhook: { id: row.id, nome: row.name, endereco: row.endpoint, eventos: row.events }, segredo: row.signing_secret, aviso: "Guarde o segredo: ele não é mostrado de novo." };
    },
  },
  {
    name: "excluir_webhook", title: "Excluir webhook", write: true,
    description: "Remove um webhook.",
    input: { type: "object", properties: { webhook_id: { type: "string", format: "uuid" } }, required: ["webhook_id"], additionalProperties: false },
    run: async (ctx, a) => {
      const id = needUuid(a.webhook_id, "webhook_id");
      const found = await q<Json[]>(ctx.sb.from("webhooks").delete().eq("workspace_id", ctx.ws).eq("id", id).select("id"));
      if (!found.length) throw new ToolError(404, "Webhook não encontrado neste espaço.");
      return { ok: true };
    },
  },
];

/** Permissão (escopo OAuth) exigida por cada ferramenta de escrita; as de leitura exigem "leitura". */
const WRITE_SCOPE: Record<string, string> = {
  alterar_status_campanha: "anuncios", criar_publico: "anuncios", criar_regra: "anuncios", ativar_regra: "anuncios",
  criar_lead: "crm", atualizar_status_lead: "crm", registrar_conversao: "crm",
  responder_conversa: "mensagens", enviar_modelo_whatsapp: "mensagens", responder_comentario: "mensagens",
  publicar_instagram: "publicacoes", publicar: "publicacoes", gerar_link_de_envio: "publicacoes", editar_publicacao: "publicacoes", excluir_publicacao: "publicacoes", publicar_agora: "publicacoes", tentar_novamente: "publicacoes",
  criar_disparo_whatsapp: "mensagens", criar_webhook: "automacoes", excluir_webhook: "automacoes",
  configurar_fila: "publicacoes", excluir_fila: "publicacoes", importar_publicacoes_csv: "publicacoes",
  criar_sequencia: "automacoes", ativar_sequencia: "automacoes", excluir_sequencia: "automacoes", inscrever_na_sequencia: "mensagens", remover_da_sequencia: "mensagens",
  criar_automacao_comentario: "automacoes", alterar_automacao: "automacoes",
};
export const scopeOf = (t: Tool) => (t.write ? WRITE_SCOPE[t.name] ?? "escrita" : "leitura");
export const allowed = (ctx: ToolCtx, t: Tool) => (ctx.scopes ? ctx.scopes.includes(scopeOf(t)) : ctx.canWrite || !t.write);


/* ------------------------------------------------------------------ busca de ferramentas e documentação */
const DOCS: { titulo: string; texto: string }[] = [
  { titulo: "Conectar um agente", texto: "Cole https://ninepro.vercel.app/api/mcp no agente (Claude, ChatGPT, Grok, Cursor, Claude Code). Ele abre a tela de login do NinePro; escolha o espaço e as permissões. Sem OAuth, use uma chave de API em Authorization: Bearer np_live_…" },
  { titulo: "Permissões", texto: "leitura (ler dados), publicacoes (publicar e agendar), mensagens (responder conversas, comentários e modelos do WhatsApp), automacoes (comentário → DM, respostas automáticas, webhooks), anuncios (pausar/ativar campanhas, públicos e regras), crm (leads e conversões), todos_espacos (agência: agir em todos os clientes com perfil_id)." },
  { titulo: "Publicar com vídeo ou foto do computador", texto: "Chame gerar_link_de_envio, entregue o link para a pessoa soltar os arquivos, depois verificar_envio com o token e use 'midias' em publicar_instagram. Formatos: JPG, PNG, WebP, GIF, MP4, MOV, M4V, WebM. Reels: vídeo MP4 vertical 9:16, até 15 minutos." },
  { titulo: "Publicar, agendar e rascunho", texto: "publicar publica agora, agenda (agendar_para em ISO 8601) ou salva rascunho (rascunho=true) em várias redes de uma vez. Com mais de uma conta, informe contas; sem isso a ferramenta devolve a lista para escolher. Adapte o texto por rede em textos_por_rede e confira antes com validar_publicacao. Depois: listar_publicacoes, detalhar_publicacao, editar_publicacao, publicar_agora, excluir_publicacao, tentar_novamente (status parcial = saiu em parte das redes)." },
  { titulo: "Fila de publicação", texto: "configurar_fila define horários fixos na semana (dia 0 = domingo, hora HH:MM, fuso). publicar com fila=true coloca no próximo horário livre. proximos_horarios mostra os horários livres; reorganizar=true reagenda o que já está na fila quando os horários mudam." },
  { titulo: "Validação", texto: "validar_publicacao confere texto, título e mídias contra cada rede. validar_midia abre a mídia e confere formato pelos bytes, tamanho, dimensões, proporção e duração por rede. contar_caracteres conta por rede, com a contagem ponderada do X (link = 23, emoji = 2)." },
  { titulo: "Sequências de mensagens", texto: "criar_sequencia monta passos com intervalo (esperar_minutos; 1440 = 1 dia), cada um com texto (só dentro de 24 h após a última mensagem do contato) ou modelo aprovado do WhatsApp. ativar_sequencia começa a enviar. inscrever_na_sequencia inscreve conversas ou números. Com sai_ao_responder, o contato sai quando responde. listar_inscricoes mostra o andamento." },
  { titulo: "Redes e limites", texto: "Instagram (2.200 caracteres, exige foto ou vídeo), Facebook (texto, até 10 fotos ou 1 vídeo), Threads (500, até 20 mídias), LinkedIn (3.000, fotos, 1 vídeo, PDF ou enquete), YouTube (1 vídeo, título até 100), TikTok (vídeo ou fotos, 2.200), X (280, até 4 fotos ou 1 vídeo, enquete, thread), Pinterest (descrição 800, título 100, 1 a 5 fotos ou 1 vídeo, numa pasta), Google Meu Negócio (1.500, 1 foto, novidade/evento/oferta com botão), Telegram (4.096, até 10 mídias), Discord (2.000, enquete), Slack (mensagens e arquivos em canais), Bluesky (300, até 4 fotos de 1 MB ou 1 vídeo, thread). Conecte em Conexões › Redes para publicar." },
  { titulo: "Análises das publicações", texto: "analisar_publicacoes compara todas as redes (Instagram, Facebook, Threads, LinkedIn de empresa, YouTube, TikTok, X, Pinterest, Bluesky), inclusive posts feitos fora do NinePro: totais, taxa de engajamento, por rede, por formato, melhores e piores. melhor_horario usa o desempenho relativo (1 = média da própria conta) por dia e hora de Brasília. crescimento_seguidores mostra o ganho de seguidores por conta (uma foto por dia desde a conexão). Os números são atualizados a cada 12 horas; atualizar=true busca na hora." },
  { titulo: "Opções por rede", texto: "publicar aceita 'opcoes' por rede: primeiro_comentario (Instagram, Facebook, LinkedIn, YouTube, Threads, Slack), thread (X, Threads, Bluesky), enquete (X, LinkedIn, Discord), colaboradores e marcar (Instagram), documento_url (PDF no LinkedIn), visibilidade/playlist_id/categoria/tags (YouTube), privacidade/sem_dueto/sem_stitch/conteudo_de_marca (TikTok), pasta/link (Pinterest), tipo/botao/evento/cupom (Google Meu Negócio), formatacao/silencioso (Telegram). A lista completa, com limites, vem de opcoes_de_publicacao." },
  { titulo: "Aprovação", texto: "O espaço pode exigir aprovação para publicações de agentes de IA, de membros ou de todos (Publicações › Aprovação). Nesses casos publicar devolve status aguardando_aprovacao e nada sai até uma pessoa administradora aprovar no app. Agentes não aprovam publicações. exige_aprovacao=true manda para aprovação mesmo sem a regra." },
  { titulo: "Reciclagem e horário por rede", texto: "reciclar { a_cada_dias, vezes, variacoes } agenda a mesma publicação de novo depois de publicada (YouTube e TikTok ficam fora). horarios_por_rede publica cada rede no seu horário; a publicação fica agendada até a última rede sair." },
  { titulo: "Importação por CSV", texto: "importar_publicacoes_csv cria até 500 publicações de uma vez. Colunas: data, texto, redes, contas, midias, titulo, primeiro_comentario, aprovacao. Simula por padrão (prévia linha a linha); simular=false cria." },
  { titulo: "Comentário vira DM (palavra-chave)", texto: "criar_automacao_comentario: quem comentar a palavra recebe DM com botão de link (até 20 caracteres no rótulo, link https) e resposta pública opcional. Pode valer para uma publicação (publicacao_id ou midia_ids) e uma vez por pessoa. A DM privada só pode ser enviada até 7 dias após o comentário. listar_automacoes e alterar_automacao gerenciam." },
  { titulo: "Análises", texto: "analisar_publicacoes: totais, médias, por formato, dia da semana e horário (Brasília), melhores e piores publicações do Instagram. resumo_desempenho, listar_campanhas e detalhar_campanha: anúncios (investimento, cliques, conversões, CPC, ROAS)." },
  { titulo: "WhatsApp", texto: "Fora da janela de 24 horas só modelos aprovados podem ser enviados: listar_modelos_whatsapp, enviar_modelo_whatsapp (um número) e criar_disparo_whatsapp (lista de até 5.000). Dentro da janela, responder_conversa." },
  { titulo: "Agência com vários clientes", texto: "Na tela de autorização marque 'todos os meus espaços'. listar_perfis mostra os clientes; passe perfil_id em qualquer ferramenta para agir naquele cliente. Em espaços onde você é membro, só leitura." },
  { titulo: "Webhooks", texto: "criar_webhook recebe eventos (lead.criado, mensagem.recebida, comentario.recebido, publicacao.publicada, publicacao.falhou, regra.disparou, conversao.recebida…) num endereço https, assinados com X-NinePro-Signature: sha256=HMAC do corpo." },
  { titulo: "Limites e erros", texto: "Erros voltam como texto em português com o motivo. Token OAuth vale 1 hora e renova sozinho (refresh de 90 dias). Toda chamada aparece em Logs no NinePro. Valores em reais (BRL), datas no fuso de Brasília." },
];
const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9_]+/).filter((w) => w.length > 2);
const score = (query: string, text: string) => { const t = words(text); return words(query).reduce((acc, w) => acc + t.filter((x) => x.startsWith(w) || w.startsWith(x)).length, 0); };

TOOLS.push(
  {
    name: "search_tools", title: "Buscar ferramentas", write: false,
    description: "Busca nas ferramentas do NinePro pelo que você quer fazer (ex.: 'enviar modelo do WhatsApp', 'pausar campanha', 'comentário vira DM') e devolve as melhores com o esquema dos argumentos. Depois use call_tool ou chame a ferramenta direto.",
    input: { type: "object", properties: { consulta: { type: "string" }, query: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 20, default: 5 } }, additionalProperties: false },
    run: async (ctx, a) => {
      const query = str(a.consulta ?? a.query, 200);
      if (!query) throw new ToolError(400, "Diga o que você quer fazer.");
      const ranked = TOOLS.filter((t) => t.name !== "search_tools" && t.name !== "call_tool" && allowed(ctx, t)).map((t) => ({ t, s: score(query, `${t.name.replace(/_/g, " ")} ${t.title} ${t.description}`) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, int(a.limite, 5, 1, 20));
      return { ferramentas: ranked.map(({ t }) => ({ nome: t.name, titulo: t.title, descricao: t.description, escrita: t.write, argumentos: t.input })) };
    },
  },
  {
    name: "call_tool", title: "Chamar ferramenta pelo nome", write: false,
    description: "Executa qualquer ferramenta do NinePro pelo nome (achada com search_tools), com os argumentos dela. As permissões da conexão continuam valendo.",
    input: { type: "object", properties: { nome: { type: "string" }, name: { type: "string" }, argumentos: { type: "object" }, arguments: { type: "object" } }, additionalProperties: false },
    run: async (ctx, a) => {
      const name = str(a.nome ?? a.name, 80);
      if (name === "call_tool") throw new ToolError(400, "call_tool não chama a si mesma.");
      return runTool(ctx, name, ((a.argumentos ?? a.arguments) as Json) ?? {});
    },
  },
  {
    name: "docs_search", title: "Buscar na documentação do NinePro", write: false,
    description: "Responde dúvidas sobre como usar o NinePro pelo agente (conectar, permissões, enviar vídeo, publicar, comentário → DM, WhatsApp, agência, webhooks, limites). Devolve os 5 trechos mais relevantes.",
    input: { type: "object", properties: { consulta: { type: "string" }, query: { type: "string" } }, additionalProperties: false },
    run: async (_ctx, a) => {
      const query = str(a.consulta ?? a.query, 200);
      const docs = DOCS.map((d) => ({ d, s: score(query, d.titulo) * 3 + score(query, d.texto) })).sort((x, y) => y.s - x.s).slice(0, 5);
      return { trechos: docs.map(({ d }) => d) };
    },
  },
);


/** Resolve as contas (recusa ambiguidade) e salva/publica. */
async function publishFor(ctx: ToolCtx, a: Json, kinds: ChannelId[]) {
  let contas = (Array.isArray(a.contas) ? a.contas : []).map((c) => str(c, 64)).filter(Boolean);
  const useQueue = a.fila === true || !!a.fila_id;
  if (useQueue && !contas.length) {
    const fq = await queueCall(() => loadQueue(ctx.sb, ctx.ws, a.fila_id ? needUuid(a.fila_id, "fila_id") : null));
    contas = fq.account_ids;
  }
  const all = await q<Json[]>(ctx.sb.from("channel_accounts").select("id, name, kind, status").eq("workspace_id", ctx.ws).in("kind", kinds).eq("status", "ativo"));
  if (!contas.length) {
    if (!all.length) throw new ToolError(400, kinds.length === 1 ? `Nenhuma conta do ${channelLabel(kinds[0])} conectada neste espaço.` : "Nenhuma rede conectada para publicar neste espaço.");
    if (all.length > 1) throw new ToolError(400, `Há ${all.length} contas. Informe 'contas' com uma ou mais destas: ${all.map((c) => `${channelLabel(c.kind as ChannelId)} ${c.name} (${c.id})`).join(", ")}.`);
    contas = [all[0].id as string];
  }
  const unknown = contas.filter((c) => !all.some((x) => x.id === c));
  if (unknown.length) throw new ToolError(400, `Conta(s) não encontrada(s) ou desconectada(s): ${unknown.join(", ")}. Use listar_contas_conectadas.`);
  return channel(() => savePost(chCtx(ctx), { content: str(a.legenda, 63206), custom: a.textos_por_rede ?? {}, title: str(a.titulo, 200) || undefined, accountIds: contas, mediaUrls: a.midias, mediaType: a.tipo, scheduledAt: a.agendar_para, queueId: a.fila_id ? needUuid(a.fila_id, "fila_id") : undefined, mode: a.rascunho === true ? "rascunho" : useQueue ? "fila" : a.agendar_para ? "agendar" : "agora", options: a.opcoes, times: a.horarios_por_rede, recycling: a.reciclar, requiresApproval: a.exige_aprovacao === true }));
}
/** Contexto de publicação de um agente: conta como "agente" (OAuth) ou "api" (chave) para a regra de aprovação. */
const chCtx = (ctx: ToolCtx): ChannelCtx => ({ sb: ctx.sb, env: ctx.env, ws: ctx.ws, userId: ctx.userId ?? null, source: ctx.userId ? "agente" : "api" });

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Escopos que valem num espaço: membro comum só lê. */
const ROLE_SCOPES = (role: string, scopes: string[]) => (role === "owner" || role === "admin" ? scopes : scopes.filter((s) => s === "leitura" || s === "todos_espacos"));

export async function runTool(ctx: ToolCtx, name: string, args: Json) {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) throw new ToolError(404, `Ferramenta desconhecida: ${name}. Use search_tools para achar a certa.`);
  args = { ...(args ?? {}) };
  const perfil = str(args.perfil_id, 64);
  delete args.perfil_id;
  if (perfil && perfil !== ctx.ws) {
    if (!ctx.multi || !ctx.userId) throw new ToolError(403, "Esta conexão vale só para um espaço. Para agir em outros clientes, conecte de novo marcando “todos os meus espaços”.");
    if (!isUuid(perfil)) throw new ToolError(400, "perfil_id inválido (use listar_perfis).");
    const m = await q<Json | null>(ctx.sb.from("workspace_members").select("role").eq("workspace_id", perfil).eq("user_id", ctx.userId).maybeSingle());
    if (!m) throw new ToolError(403, "Você não faz parte deste perfil.");
    const scopes = ROLE_SCOPES(m.role as string, ctx.scopes ?? []);
    ctx = { ...ctx, ws: perfil, scopes, canWrite: scopes.some((s) => s !== "leitura" && s !== "todos_espacos") };
  }
  if (!allowed(ctx, tool)) throw new ToolError(403, ctx.scopes && tool.write ? `Sem permissão para esta ação (precisa de “${scopeOf(tool)}”). Conecte de novo liberando essa permissão.` : "Esta chave é somente leitura.");
  return tool.run(ctx, args ?? {});
}
