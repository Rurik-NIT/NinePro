/**
 * Simulação de regras (backtest).
 * Origem: endpoints `automations/preview` e `automations/backtest` recuperados pelo REA no
 * sistema de referência (docs/reverse-engineering/10-rea-evidence.md §2.3). A UI de lá não foi
 * observada, então este fluxo é desenho próprio do NinePro.
 *
 * Modelo (simplificado e declarado na tela):
 * - Reproduz a regra dia a dia sobre o histórico diário de cada campanha (nível campanha).
 * - "Pausar" evita o gasto (e perde as conversões/receita) do dia seguinte ao disparo.
 * - "Escalar" aplica o aumento ao dia seguinte, mantendo o ROAS/CPA observado naquele dia.
 * - Regras por horário não são simuláveis com dados diários.
 */
import { CAMPAIGNS, TODAY, type Campaign, type DayPoint } from "@/data/demo";
import { sumTotals } from "@/config/metrics";

export interface SimParams {
  /** Filtro de alvo, igual ao do modal: todas, vendas ou leads. */
  target: string;
  /** Meta de custo por resultado (R$) — usada pelas regras de CPA. */
  cpaTarget: number;
  /** Janela simulada, em dias. */
  days: number;
  /** Teto de aumento diário somado, em % (Limites das regras). */
  capPct: number;
}

export type SimEffect = "pause" | "scale" | "alert";
export interface SimEvent { date: Date; campaign: Campaign; effect: SimEffect; detail: string; spendDelta: number; convDelta: number; revenueDelta: number }
export interface SimResult {
  simulable: boolean;
  reason?: string;
  effect?: SimEffect;
  events: SimEvent[];
  campaignsAffected: number;
  spendDelta: number;
  convDelta: number;
  revenueDelta: number;
  baseline: { spend: number; conversions: number; revenue: number };
  daily: { date: Date; events: number }[];
  window: { from: Date; to: Date };
}

const DAY = 86_400_000;
const sum = (rows: DayPoint[], k: keyof Omit<DayPoint, "date">) => rows.reduce((a, r) => a + r[k], 0);

function targetFilter(target: string) {
  if (target.includes("vendas")) return (c: Campaign) => c.objective === "vendas";
  if (target.includes("leads")) return (c: Campaign) => c.objective === "leads";
  return () => true;
}

type Rule = (ctx: { c: Campaign; days: DayPoint[]; i: number; p: SimParams }) => Omit<SimEvent, "date" | "campaign"> | null;

/** Efeito no dia seguinte ao disparo. */
const pauseNext = (next: DayPoint | undefined, detail: string) =>
  next && next.spend > 0 ? { effect: "pause" as const, detail, spendDelta: -next.spend, convDelta: -next.conversions, revenueDelta: -next.revenue } : null;
const scaleNext = (next: DayPoint | undefined, pct: number, detail: string) =>
  next && next.spend > 0 ? { effect: "scale" as const, detail, spendDelta: next.spend * pct, convDelta: next.conversions * pct, revenueDelta: next.revenue * pct } : null;
const alert = (detail: string) => ({ effect: "alert" as const, detail, spendDelta: 0, convDelta: 0, revenueDelta: 0 });

const RULES: Record<string, Rule | { unsupported: string }> = {
  // Pausar conjuntos acima da meta: CPA 3d > meta × 1,3 e gasto 3d ≥ 2 × meta
  r1: ({ days, i, p }) => {
    const w = days.slice(Math.max(0, i - 2), i + 1);
    const spend = sum(w, "spend"), conv = sum(w, "conversions");
    const cpa = conv ? spend / conv : Infinity;
    return spend >= p.cpaTarget * 2 && cpa > p.cpaTarget * 1.3 ? pauseNext(days[i + 1], `CPA 3d ${conv ? `R$ ${cpa.toFixed(2).replace(".", ",")}` : "sem conversões"} acima de R$ ${(p.cpaTarget * 1.3).toFixed(2).replace(".", ",")}`) : null;
  },
  // Escalar vencedores: ROAS 3d ≥ 3 → +15%
  r2: ({ days, i, p }) => {
    const w = days.slice(Math.max(0, i - 2), i + 1);
    const spend = sum(w, "spend"), rev = sum(w, "revenue");
    const roas = spend ? rev / spend : 0;
    return roas >= 3 ? scaleNext(days[i + 1], Math.min(0.15, p.capPct / 100), `ROAS 3d ${roas.toFixed(2).replace(".", ",")}× ≥ 3×`) : null;
  },
  // Anúncios sem conversão (nível campanha): gasto 7d ≥ R$ 300 e conversões = 0
  r3: ({ days, i }) => {
    const w = days.slice(Math.max(0, i - 6), i + 1);
    return sum(w, "spend") >= 300 && sum(w, "conversions") === 0 ? pauseNext(days[i + 1], "Gasto 7d ≥ R$ 300 sem conversões") : null;
  },
  // Fadiga: frequência 7d > 3
  r4: ({ c, days, i }) => {
    if (c.platform !== "meta" && c.platform !== "tiktok") return null;
    const w = days.slice(Math.max(0, i - 6), i + 1);
    const reach = sum(w, "reach");
    const f = reach ? sum(w, "impressions") / reach : 0;
    return f > 3 ? alert(`Frequência 7d ${f.toFixed(2).replace(".", ",")}`) : null;
  },
  // Pico de gasto: hoje > 140% da média 7d anterior
  r5: ({ days, i }) => {
    if (i < 7) return null;
    const avg = sum(days.slice(i - 7, i), "spend") / 7;
    return avg > 0 && days[i].spend > avg * 1.4 ? alert(`Gasto ${Math.round((days[i].spend / avg - 1) * 100)}% acima da média 7d`) : null;
  },
  r6: { unsupported: "Regras por horário precisam de dados por hora; o histórico disponível é diário." },
  r7: { unsupported: "Regras por horário precisam de dados por hora; o histórico disponível é diário." },
  // Escada: CPA do dia < meta → +10%
  r8: ({ days, i, p }) => {
    const d = days[i];
    const cpa = d.conversions ? d.spend / d.conversions : Infinity;
    return cpa < p.cpaTarget ? scaleNext(days[i + 1], Math.min(0.1, p.capPct / 100), `CPA do dia R$ ${cpa.toFixed(2).replace(".", ",")} abaixo da meta`) : null;
  },
  r9: { unsupported: "Redistribuição entre campanhas depende de ranking conjunto; a simulação por campanha ainda não cobre esse caso." },
  // CAC acima do limite: investimento 7d > 50% da receita 7d
  r10: ({ days, i }) => {
    const w = days.slice(Math.max(0, i - 6), i + 1);
    const spend = sum(w, "spend"), rev = sum(w, "revenue");
    return rev > 0 && spend / rev > 0.5 ? pauseNext(days[i + 1], `Investimento 7d = ${Math.round((spend / rev) * 100)}% da receita`) : null;
  },
};

export function simulateRule(templateId: string, p: SimParams): SimResult {
  const window = { from: new Date(TODAY.getTime() - (p.days - 1) * DAY), to: TODAY };
  const empty = { events: [], campaignsAffected: 0, spendDelta: 0, convDelta: 0, revenueDelta: 0, daily: [], window, baseline: { spend: 0, conversions: 0, revenue: 0 } };
  const rule = RULES[templateId];
  if (!rule) return { simulable: false, reason: "Modelo sem simulação definida.", ...empty };
  if ("unsupported" in rule) return { simulable: false, reason: rule.unsupported, ...empty };

  const campaigns = CAMPAIGNS.filter(targetFilter(p.target));
  const events: SimEvent[] = [];
  const pausedUntil = new Map<string, number>(); // evita contar o mesmo dia pausado duas vezes

  for (const c of campaigns) {
    const days = c.days;
    for (let i = 0; i < days.length; i++) {
      if (days[i].date < window.from || days[i].date > window.to) continue;
      if ((pausedUntil.get(c.id) ?? -1) >= i) continue;
      const r = rule({ c, days, i, p });
      if (!r) continue;
      events.push({ ...r, date: days[i].date, campaign: c });
      if (r.effect === "pause") pausedUntil.set(c.id, i + 1);
    }
  }

  const base = sumTotals(campaigns.flatMap((c) => c.days.filter((d) => d.date >= window.from && d.date <= window.to)));
  const daily: SimResult["daily"] = [];
  for (let t = window.from.getTime(); t <= window.to.getTime(); t += DAY) {
    daily.push({ date: new Date(t), events: events.filter((e) => e.date.getTime() === t).length });
  }
  return {
    simulable: true,
    effect: events[0]?.effect ?? (templateId === "r4" || templateId === "r5" ? "alert" : undefined),
    events: events.sort((a, b) => b.date.getTime() - a.date.getTime()),
    campaignsAffected: new Set(events.map((e) => e.campaign.id)).size,
    spendDelta: events.reduce((a, e) => a + e.spendDelta, 0),
    convDelta: events.reduce((a, e) => a + e.convDelta, 0),
    revenueDelta: events.reduce((a, e) => a + e.revenueDelta, 0),
    baseline: { spend: base.spend, conversions: base.conversions, revenue: base.revenue },
    daily,
    window,
  };
}

export const RULE_NEEDS_CPA = new Set(["r1", "r8"]);
