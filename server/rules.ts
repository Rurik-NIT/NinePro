/**
 * Motor das regras automáticas de anúncios. Roda de hora em hora (Vercel Cron, depois da sincronização)
 * sobre as métricas reais de cada campanha e age na plataforma de origem: pausar, reativar o que uma regra
 * pausou, ajustar orçamento diário (Meta e TikTok) e redistribuir verba. Alertas viram histórico + webhook.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyCampaignStatus, loadAuth, serviceClient } from "./connections.js";
import { isPlatform, PROVIDERS, type PlatformId } from "./platforms/index.js";
import { dispatchEvent } from "./webhooks.js";

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
export type Metric = "spend" | "impressions" | "clicks" | "conversions" | "ctr" | "cpc" | "cpm" | "cpa" | "roas" | "dailyBudget" | "budgetUsed" | "dayOfMonth" | "cac" | "costPerSale" | "frequency" | "spendVsAvg";
type Period = "hoje" | "ontem" | "3d" | "7d" | "14d" | "30d" | "mes";
type Op = ">" | ">=" | "<" | "<=" | "=" | "!=";
interface Cond { metric: Metric; period: Period; op: Op; value: number }
type Act = { kind: "pausar" } | { kind: "reativar" } | { kind: "orcamento"; amount: number } | { kind: "alerta" } | { kind: "redistribuir"; amount: number };
interface Spec { conds: Cond[]; logic: "E" | "OU"; actions: Act[]; every: number; atHour?: number; filter: (c: Camp) => boolean; teto?: number; minDays?: number; unsupported?: string }

export const SUPPORTED_METRICS: Metric[] = ["spend", "impressions", "clicks", "conversions", "ctr", "cpc", "cpm", "cpa", "roas", "dailyBudget", "budgetUsed", "dayOfMonth", "cac", "costPerSale", "frequency", "spendVsAvg"];
const HOUR = 3_600_000;
const TZ = "America/Sao_Paulo";
const now = () => new Date().toISOString();
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const localDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const localHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d)) % 24;
const dayShift = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

interface Camp { id: string; name: string; objective: string; status: string; budget: number; budget_type: string; started_at: string | null; paused_by_rule_at: string | null; external_id: string | null; ad_accounts: { id: string; platform: string; external_id: string | null; parent_external_id: string | null; name: string; currency: string; timezone: string } | null }
interface Day { campaign_id: string; date: string; spend: number; impressions: number; reach: number; clicks: number; conversions: number; purchases: number; revenue: number }
const ACTIVE = ["active", "learning", "limited"];

/* ------------------------------------------------------------------ de regra salva para especificação executável */
function targetFilter(target: string | null): (c: Camp) => boolean {
  const t = (target ?? "").trim().toLowerCase();
  if (!t || t.startsWith("todas")) return () => true;
  if (t.includes("vendas")) return (c) => c.objective === "vendas";
  if (t.includes("leads")) return (c) => c.objective === "leads";
  if (t.includes("tráfego") || t.includes("trafego")) return (c) => c.objective === "trafego";
  const needle = t.replace(/^nome contém:?\s*/, "").replace(/^campanhas?\s+/, "");
  return (c) => c.name.toLowerCase().includes(needle);
}

export function specOf(rule: { template_id: string | null; target: string | null; trigger: Json; conditions: Json; actions: Json; params: Json; logic: string }): Spec {
  const p = rule.params ?? {};
  const n = (k: string, d: number) => { const v = Number(p[k]); return Number.isFinite(v) && v > 0 ? v : d; };
  const base = { logic: "E" as const, filter: targetFilter(rule.target), teto: Number(p.teto) > 0 ? Number(p.teto) : undefined };
  const meta = Number(p.meta);
  const needMeta = !(meta > 0) ? "Informe a meta de custo por resultado (CPA) nesta regra." : undefined;
  switch (rule.template_id) {
    case "r1": return { ...base, every: 1, unsupported: needMeta, conds: [{ metric: "cpa", period: "7d", op: ">", value: meta * 1.3 }, { metric: "spend", period: "7d", op: ">=", value: meta * 2 }], actions: [{ kind: "pausar" }] };
    case "r2": return { ...base, every: 24, atHour: 10, conds: [{ metric: "roas", period: "3d", op: ">=", value: n("roas", 3) }], actions: [{ kind: "orcamento", amount: n("pct", 15) }] };
    case "r3": return { ...base, every: 1, conds: [{ metric: "spend", period: "7d", op: ">=", value: n("valor", 300) }, { metric: "conversions", period: "7d", op: "=", value: 0 }], actions: [{ kind: "pausar" }] };
    case "r4": return { ...base, every: 24, atHour: 9, conds: [{ metric: "frequency", period: "7d", op: ">", value: n("frequencia", 3) }], actions: [{ kind: "alerta" }] };
    case "r5": return { ...base, every: 1, conds: [{ metric: "spendVsAvg", period: "hoje", op: ">", value: n("pct", 140) }], actions: [{ kind: "alerta" }] };
    case "r6": return { ...base, every: 24, atHour: n("hora", 23), conds: [], actions: [{ kind: "pausar" }] };
    case "r7": return { ...base, every: 24, atHour: n("hora", 7), conds: [], actions: [{ kind: "reativar" }] };
    case "r8": return { ...base, every: 24, atHour: 10, unsupported: needMeta, conds: [{ metric: "cpa", period: "ontem", op: "<", value: meta }, { metric: "conversions", period: "ontem", op: ">", value: 0 }], actions: [{ kind: "orcamento", amount: n("pct", 10) }] };
    case "r9": return { ...base, every: 24 * 7, atHour: 10, conds: [], actions: [{ kind: "redistribuir", amount: n("pct", 20) }] };
    case "r10": return { ...base, every: 1, conds: [{ metric: "cac", period: "7d", op: ">", value: n("pct", 50) }, { metric: "spend", period: "7d", op: ">", value: 0 }], actions: [{ kind: "pausar" }] };
  }
  // Regra personalizada (construtor)
  const t = (rule.trigger ?? {}) as Json;
  const rows = (((rule.conditions ?? {}) as Json).rows ?? []) as Cond[];
  const items = (((rule.actions ?? {}) as Json).items ?? []) as { kind: string; change?: string; amount?: number }[];
  const bad = rows.find((r) => !SUPPORTED_METRICS.includes(r.metric));
  const acts: Act[] = [];
  let badAct: string | undefined;
  for (const i of items) {
    if (i.kind === "alert") acts.push({ kind: "alerta" });
    else if (i.change === "pausar") acts.push({ kind: "pausar" });
    else if (i.change === "reativar") acts.push({ kind: "reativar" });
    else if (i.change === "orcamento") acts.push({ kind: "orcamento", amount: Number(i.amount) || 0 });
    else if (i.change === "mover") acts.push({ kind: "redistribuir", amount: Math.abs(Number(i.amount)) || 20 });
    else badAct = i.change;
  }
  const freq = String(t.freq ?? "1h");
  const nameFilter = String(t.nameFilter ?? "").trim().toLowerCase();
  const account = String(t.accountId ?? "");
  const minDays = Number(t.minDays) || 0;
  const filter = (c: Camp) => base.filter(c) && (!nameFilter || c.name.toLowerCase().includes(nameFilter)) && (!account || c.ad_accounts?.id === account);
  return {
    ...base, filter, logic: rule.logic === "OU" ? "OU" : "E", conds: rows.map((r) => ({ ...r, value: Number(r.value) })), actions: acts, minDays,
    every: freq === "1d" ? 24 : freq === "6h" ? 6 : 1,
    unsupported: t.kind && t.kind !== "anuncios" ? "Só regras de anúncios executam por enquanto." : bad ? `A métrica “${bad.metric}” ainda não é calculada automaticamente.` : badAct ? `A ação “${badAct}” ainda não é executada automaticamente.` : !acts.length ? "A regra não tem ação." : undefined,
  };
}

/* ------------------------------------------------------------------ métricas */
type Agg = { spend: number; impressions: number; reach: number; clicks: number; conversions: number; purchases: number; revenue: number };
const zero = (): Agg => ({ spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0, purchases: 0, revenue: 0 });
function windowOf(period: Period, today: string): (d: string) => boolean {
  switch (period) {
    case "hoje": return (d) => d === today;
    case "ontem": { const y = dayShift(today, -1); return (d) => d === y; }
    case "mes": return (d) => d.slice(0, 7) === today.slice(0, 7) && d <= today;
    default: { const n = Number(period.replace("d", "")); const from = dayShift(today, -(n - 1)); return (d) => d >= from && d <= today; }
  }
}
function metricValue(m: Metric, period: Period, c: Camp, days: Day[], today: string): number {
  const agg = (pred: (d: string) => boolean) => days.filter((d) => pred(d.date)).reduce((a, d) => { for (const k of Object.keys(a) as (keyof Agg)[]) a[k] += Number(d[k]) || 0; return a; }, zero());
  const a = agg(windowOf(period, today));
  const div = (x: number, y: number, ifZero = 0) => (y ? x / y : ifZero);
  switch (m) {
    case "spend": return a.spend;
    case "impressions": return a.impressions;
    case "clicks": return a.clicks;
    case "conversions": return a.conversions;
    case "ctr": return div(a.clicks, a.impressions) * 100;
    case "cpc": return div(a.spend, a.clicks);
    case "cpm": return div(a.spend, a.impressions) * 1000;
    case "cpa": return a.conversions ? a.spend / a.conversions : a.spend > 0 ? Number.POSITIVE_INFINITY : 0;
    case "costPerSale": return a.purchases ? a.spend / a.purchases : a.spend > 0 ? Number.POSITIVE_INFINITY : 0;
    case "roas": return div(a.revenue, a.spend);
    case "cac": return a.revenue ? (a.spend / a.revenue) * 100 : a.spend > 0 ? Number.POSITIVE_INFINITY : 0;
    case "frequency": return div(a.impressions, a.reach);
    case "dailyBudget": return c.budget_type === "diario" ? Number(c.budget) : 0;
    case "budgetUsed": { const t = agg((d) => d === today); return c.budget_type === "diario" && Number(c.budget) ? (t.spend / Number(c.budget)) * 100 : 0; }
    case "dayOfMonth": return Number(today.slice(8, 10));
    case "spendVsAvg": {
      const t = agg((d) => d === today).spend;
      const prev = agg((d) => d >= dayShift(today, -7) && d <= dayShift(today, -1)).spend / 7;
      return prev ? (t / prev) * 100 : 0;
    }
  }
}
const compare = (v: number, op: Op, x: number) => (op === ">" ? v > x : op === ">=" ? v >= x : op === "<" ? v < x : op === "<=" ? v <= x : op === "=" ? Math.abs(v - x) < 1e-9 : Math.abs(v - x) >= 1e-9);
const fmt = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : "∞");

/* ------------------------------------------------------------------ execução */
export interface RuleTarget { id: string; nome: string; acao: string; ok: boolean; erro?: string; de?: number; para?: number; metricas?: Record<string, unknown> }
export interface RuleResult { automationId: string; nome: string; status: "executou" | "sem_alvos" | "nao_suportada" | "fora_do_horario" | "erro"; detalhe: string; alvos: RuleTarget[] }

async function loadCampaigns(sb: SupabaseClient, ws: string) {
  const { data } = await sb.from("campaigns").select("id, name, objective, status, budget, budget_type, started_at, paused_by_rule_at, external_id, ad_accounts(id, platform, external_id, parent_external_id, name, currency, timezone)").eq("workspace_id", ws);
  return (data ?? []) as unknown as Camp[];
}
async function loadDays(sb: SupabaseClient, ws: string, since: string) {
  const out: Day[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("campaign_metrics_daily").select("campaign_id, date, spend, impressions, reach, clicks, conversions, purchases, revenue").eq("workspace_id", ws).gte("date", since).range(from, from + 999);
    out.push(...((data ?? []) as Day[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function setBudget(sb: SupabaseClient, env: Env, ws: string, c: Camp, value: number) {
  const acc = c.ad_accounts;
  const rounded = Math.round(value * 100) / 100;
  if (c.external_id && acc?.external_id && isPlatform(acc.platform)) {
    const prov = PROVIDERS[acc.platform as PlatformId];
    if (!prov.setCampaignBudget) throw new Error(`Ajuste de orçamento ainda não é suportado no ${prov.label}.`);
    const { data: conn } = await sb.from("platform_connections").select("id").eq("workspace_id", ws).eq("platform", acc.platform).maybeSingle();
    if (!conn) throw new Error(`${prov.label} desconectado.`);
    const auth = await prov.ready(env, await loadAuth(sb, env, conn.id as string));
    await prov.setCampaignBudget(env, auth, { externalId: acc.external_id, parentExternalId: acc.parent_external_id, name: acc.name, currency: acc.currency, timezone: acc.timezone, active: true }, c.external_id, rounded);
  }
  await sb.from("campaigns").update({ budget: rounded, updated_at: now() }).eq("id", c.id);
}

export async function runRule(sb: SupabaseClient, env: Env, rule: Json & { id: string; workspace_id: string; name: string }, opts: { dryRun?: boolean; force?: boolean; at?: Date; campaigns?: Camp[]; days?: Day[]; capPct?: number } = {}): Promise<RuleResult> {
  const at = opts.at ?? new Date();
  const ws = rule.workspace_id;
  const spec = specOf(rule as never);
  const res = (status: RuleResult["status"], detalhe: string, alvos: RuleTarget[] = []): RuleResult => ({ automationId: rule.id, nome: rule.name, status, detalhe, alvos });
  if (spec.unsupported) return res("nao_suportada", spec.unsupported);
  const last = rule.last_run_at ? Date.parse(String(rule.last_run_at)) : 0;
  if (!opts.force) {
    if (spec.atHour !== undefined && localHour(at) !== spec.atHour) return res("fora_do_horario", `Roda às ${String(spec.atHour).padStart(2, "0")}h.`);
    if (at.getTime() - last < spec.every * HOUR - 10 * 60_000) return res("fora_do_horario", "Ainda não chegou a hora da próxima verificação.");
  }
  const today = localDay(at);
  const campaigns = opts.campaigns ?? (await loadCampaigns(sb, ws));
  const days = opts.days ?? (await loadDays(sb, ws, dayShift(today, -31)));
  const byCamp = new Map<string, Day[]>();
  for (const d of days) { const l = byCamp.get(d.campaign_id) ?? []; l.push(d); byCamp.set(d.campaign_id, l); }
  const cap = opts.capPct ?? 30;

  // ações recentes desta regra (evita repetir orçamento/alerta na mesma campanha em 24 h)
  const { data: recent } = await sb.from("automation_runs").select("details").eq("automation_id", rule.id).gte("ran_at", new Date(at.getTime() - 24 * HOUR).toISOString());
  const touched = new Set((recent ?? []).flatMap((r) => (((r.details as Json)?.alvos ?? []) as RuleTarget[]).filter((t) => t.ok).map((t) => t.id)));

  const kinds = spec.actions.map((a) => a.kind);
  const wantsReactivate = kinds.includes("reativar");
  const pool = campaigns.filter(spec.filter).filter((c) => (wantsReactivate ? c.status === "paused" && !!c.paused_by_rule_at : ACTIVE.includes(c.status)))
    .filter((c) => !spec.minDays || !c.started_at || (Date.parse(today) - Date.parse(c.started_at)) / 86_400_000 >= spec.minDays);

  const alvos: RuleTarget[] = [];
  const redistribute = spec.actions.find((a) => a.kind === "redistribuir") as { kind: "redistribuir"; amount: number } | undefined;
  if (redistribute) {
    const ranked = pool.filter((c) => c.budget_type === "diario" && Number(c.budget) > 0 && c.ad_accounts && isPlatform(c.ad_accounts.platform) && PROVIDERS[c.ad_accounts.platform as PlatformId].setCampaignBudget)
      .map((c) => ({ c, roas: metricValue("roas", "7d", c, byCamp.get(c.id) ?? [], today), spend: metricValue("spend", "7d", c, byCamp.get(c.id) ?? [], today) }))
      .filter((x) => x.spend > 0).sort((a, b) => a.roas - b.roas);
    if (ranked.length < 4) return res("sem_alvos", "Precisa de pelo menos 4 campanhas com orçamento diário e gasto na semana (Meta ou TikTok).");
    const worst = ranked.slice(0, 2), best = ranked.slice(-2);
    const moved = worst.reduce((s, x) => s + Number(x.c.budget) * (redistribute.amount / 100), 0);
    const plan = [...worst.map((x) => ({ c: x.c, to: Number(x.c.budget) * (1 - redistribute.amount / 100), roas: x.roas })), ...best.map((x) => ({ c: x.c, to: Math.min(Number(x.c.budget) + moved / 2, Number(x.c.budget) * (1 + cap / 100)), roas: x.roas }))];
    for (const p of plan) {
      const t: RuleTarget = { id: p.c.id, nome: p.c.name, acao: p.to < Number(p.c.budget) ? "Reduziu orçamento" : "Aumentou orçamento", ok: true, de: Number(p.c.budget), para: Math.round(p.to * 100) / 100, metricas: { roas_7d: fmt(p.roas) } };
      if (!opts.dryRun) { try { await setBudget(sb, env, ws, p.c, p.to); } catch (e) { t.ok = false; t.erro = msg(e); } }
      alvos.push(t);
    }
  } else {
    for (const c of pool) {
      const d = byCamp.get(c.id) ?? [];
      const results = spec.conds.map((k) => ({ k, v: metricValue(k.metric, k.period, c, d, today) }));
      const hit = !results.length || (spec.logic === "OU" ? results.some((r) => compare(r.v, r.k.op, r.k.value)) : results.every((r) => compare(r.v, r.k.op, r.k.value)));
      if (!hit) continue;
      const metricas = Object.fromEntries(results.map((r) => [`${r.k.metric}_${r.k.period}`, fmt(r.v)]));
      for (const a of spec.actions) {
        if ((a.kind === "orcamento" || a.kind === "alerta") && touched.has(c.id) && !opts.force) continue;
        const t: RuleTarget = { id: c.id, nome: c.name, acao: "", ok: true, metricas };
        try {
          if (a.kind === "pausar") {
            t.acao = "Pausou";
            if (!opts.dryRun) {
              const [r] = await applyCampaignStatus(sb, env, ws, [c.id], "paused");
              if (r?.erro) throw new Error(r.erro);
              await sb.from("campaigns").update({ paused_by_rule_at: now() }).eq("id", c.id);
            }
          } else if (a.kind === "reativar") {
            t.acao = "Reativou";
            if (!opts.dryRun) {
              const [r] = await applyCampaignStatus(sb, env, ws, [c.id], "active");
              if (r?.erro) throw new Error(r.erro);
              await sb.from("campaigns").update({ paused_by_rule_at: null }).eq("id", c.id);
            }
          } else if (a.kind === "orcamento") {
            if (c.budget_type !== "diario" || !(Number(c.budget) > 0)) throw new Error("A campanha não tem orçamento diário próprio (o orçamento pode estar nos conjuntos).");
            const pct = Math.max(-90, Math.min(a.amount, cap));
            let to = Number(c.budget) * (1 + pct / 100);
            if (spec.teto && to > spec.teto) to = spec.teto;
            t.acao = to >= Number(c.budget) ? `Aumentou orçamento ${pct}%` : `Reduziu orçamento ${Math.abs(pct)}%`;
            t.de = Number(c.budget); t.para = Math.round(to * 100) / 100;
            if (Math.abs(to - Number(c.budget)) < 0.01) { t.acao = "Orçamento já no teto"; continue; }
            if (!opts.dryRun) await setBudget(sb, env, ws, c, to);
          } else if (a.kind === "alerta") {
            t.acao = "Alerta";
          }
        } catch (e) { t.ok = false; t.erro = msg(e); }
        alvos.push(t);
      }
    }
  }

  const ok = alvos.filter((a) => a.ok).length;
  const detalhe = alvos.length ? `${ok} ação(ões) em ${new Set(alvos.map((a) => a.id)).size} campanha(s)${alvos.length - ok ? `, ${alvos.length - ok} com erro` : ""}` : "Nenhuma campanha atendeu às condições.";
  const result = res(alvos.length ? (ok ? "executou" : "erro") : "sem_alvos", detalhe, alvos);
  if (!opts.dryRun) {
    await sb.from("automations").update({ last_run_at: at.toISOString(), last_outcome: detalhe }).eq("id", rule.id);
    if (alvos.length) {
      await sb.from("automation_runs").insert({ workspace_id: ws, automation_id: rule.id, outcome: detalhe, details: { alvos } });
      await dispatchEvent(sb, ws, "regra.disparou", { regra_id: rule.id, regra: rule.name, resumo: detalhe, alvos });
    }
  }
  return result;
}

/** Avalia todas as regras ativas (de um espaço ou de todos). */
export async function evaluateRules(sb: SupabaseClient, env: Env, workspaceId?: string, at = new Date()) {
  let q = sb.from("automations").select("id, workspace_id, name, template_id, target, trigger, conditions, actions, params, logic, last_run_at").eq("status", "ativa");
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  const { data: rules } = await q;
  const byWs = new Map<string, Json[]>();
  for (const r of rules ?? []) { const l = byWs.get(r.workspace_id as string) ?? []; l.push(r); byWs.set(r.workspace_id as string, l); }
  const results: RuleResult[] = [];
  for (const [ws, list] of byWs) {
    const { data: st } = await sb.from("automation_settings").select("run_ad_automations, max_daily_increase_pct").eq("workspace_id", ws).maybeSingle();
    if (st && st.run_ad_automations === false) continue;
    const campaigns = await loadCampaigns(sb, ws);
    const days = await loadDays(sb, ws, dayShift(localDay(at), -31));
    for (const r of list) {
      try { results.push(await runRule(sb, env, r as never, { at, campaigns, days, capPct: (st?.max_daily_increase_pct as number | undefined) ?? 30 })); }
      catch (e) { results.push({ automationId: r.id as string, nome: r.name as string, status: "erro", detalhe: msg(e), alvos: [] }); }
    }
  }
  return results;
}

/** Vercel Cron (de hora em hora, depois da sincronização). */
export async function handleRules(req: Request, env: Env): Promise<Response> {
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
  if (!env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return json(401, { error: "Não autorizado." });
  const sb = serviceClient(env);
  if (!sb) return json(503, { error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada." });
  const results = await evaluateRules(sb, env);
  return json(200, { regras: results.length, executaram: results.filter((r) => r.status === "executou").length, results: results.filter((r) => r.status !== "fora_do_horario") });
}
