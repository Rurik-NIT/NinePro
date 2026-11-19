/**
 * ⚠️ DADOS FICTÍCIOS DE DEMONSTRAÇÃO
 * Gerados deterministicamente (seed fixa) para exercitar o Design System.
 * Não representam contas, campanhas ou pessoas reais e não vêm de nenhuma integração.
 * Toda tela que os consome exibe o selo <DemoBadge />.
 */
import { sumTotals, type Totals } from "@/config/metrics";

export const IS_DEMO = true;

/* ---------- PRNG determinístico ---------- */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(9009);
const between = (a: number, b: number) => a + (b - a) * rnd();
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];

/* ---------- Tipos ---------- */
export type PlatformId = "meta" | "google" | "tiktok" | "linkedin";
export const PLATFORMS: Record<PlatformId, { label: string; series: string }> = {
  meta: { label: "Meta Ads", series: "var(--series-1)" },
  google: { label: "Google Ads", series: "var(--series-2)" },
  tiktok: { label: "TikTok Ads", series: "var(--series-3)" },
  linkedin: { label: "LinkedIn Ads", series: "var(--series-4)" },
};
export const PLATFORM_ORDER: PlatformId[] = ["meta", "google", "tiktok", "linkedin"];

export type Objective = "vendas" | "leads" | "trafego" | "reconhecimento";
export const OBJECTIVES: Record<Objective, string> = { vendas: "Vendas", leads: "Leads", trafego: "Tráfego", reconhecimento: "Reconhecimento" };

export type DeliveryStatus = "active" | "learning" | "limited" | "paused" | "ended";
export const STATUS: Record<DeliveryStatus, { label: string; tone: "positive" | "info" | "warning" | "neutral" }> = {
  active: { label: "Ativa", tone: "positive" },
  learning: { label: "Em aprendizado", tone: "info" },
  limited: { label: "Limitada", tone: "warning" },
  paused: { label: "Pausada", tone: "neutral" },
  ended: { label: "Encerrada", tone: "neutral" },
};

export interface DayPoint extends Totals { date: Date }
export interface Ad { id: string; name: string; format: "Imagem" | "Vídeo" | "Carrossel"; share: number; status: DeliveryStatus; hue: number }
export interface AdSet { id: string; name: string; audience: string; share: number; status: DeliveryStatus; ads: Ad[] }
export interface Campaign {
  id: string; name: string; platform: PlatformId; account: string; objective: Objective; status: DeliveryStatus;
  budget: number; budgetType: "diario" | "total"; startedAt: Date; days: DayPoint[]; adSets: AdSet[];
}

/* ---------- Geração ---------- */
const DAY = 86_400_000;
export const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const HISTORY = 180;

const ACCOUNTS: Record<PlatformId, string[]> = {
  meta: ["Loja Aurora — BM principal", "Aurora Outlet"],
  google: ["Aurora Search", "Aurora Shopping"],
  tiktok: ["Aurora TikTok"],
  linkedin: ["Aurora B2B"],
};

const SEED: Array<[string, PlatformId, Objective, DeliveryStatus, number]> = [
  ["Black Friday — Prospecção ampla", "meta", "vendas", "active", 1800],
  ["Remarketing — Carrinho 7d", "meta", "vendas", "active", 650],
  ["Lançamento Coleção Verão", "meta", "reconhecimento", "learning", 900],
  ["Captação — Lista VIP", "meta", "leads", "active", 420],
  ["Pesquisa — Marca", "google", "trafego", "active", 380],
  ["Shopping — Catálogo completo", "google", "vendas", "active", 1500],
  ["Pesquisa — Concorrentes", "google", "vendas", "limited", 520],
  ["Performance Max — Verão", "google", "vendas", "learning", 1100],
  ["Spark Ads — Criadores", "tiktok", "vendas", "active", 700],
  ["TopView — Lançamento", "tiktok", "reconhecimento", "paused", 1200],
  ["ABM — Decisores varejo", "linkedin", "leads", "active", 480],
  ["Webinar Outubro", "linkedin", "leads", "ended", 300],
];

const AUDIENCES = ["Interesses: moda", "Lookalike 1% compradores", "Visitantes 30d", "Amplo 25–44", "Palavras-chave exatas", "Cargos: gerência", "Engajados 60d", "Lista de clientes"];
const AD_NAMES = ["Vídeo depoimento", "Carrossel mais vendidos", "Estático oferta", "UGC unboxing", "Banner frete grátis", "Vídeo 15s produto", "Carrossel lookbook", "Estático prova social"];

function genDays(budget: number, obj: Objective, status: DeliveryStatus, platform: PlatformId): DayPoint[] {
  const profile = {
    vendas: { ctr: 0.017, cvr: 0.032, aov: 260 },
    leads: { ctr: 0.012, cvr: 0.09, aov: 0 },
    trafego: { ctr: 0.045, cvr: 0.018, aov: 210 },
    reconhecimento: { ctr: 0.006, cvr: 0.006, aov: 230 },
  }[obj];
  const cpmBase = { meta: 24, google: 38, tiktok: 14, linkedin: 92 }[platform];
  const eff = between(0.75, 1.3);
  const out: DayPoint[] = [];
  for (let i = HISTORY - 1; i >= 0; i--) {
    const date = new Date(TODAY.getTime() - i * DAY);
    const dow = date.getDay();
    const weekend = dow === 0 || dow === 6 ? 0.82 : 1;
    const trend = 0.78 + (HISTORY - i) / HISTORY * 0.4;
    const off = (status === "paused" && i < 9) || (status === "ended" && i < 26);
    const spend = off ? 0 : budget * weekend * trend * between(0.82, 1.08);
    const cpm = cpmBase * between(0.85, 1.2);
    const impressions = spend > 0 ? Math.round((spend / cpm) * 1000) : 0;
    const reach = Math.round(impressions / between(1.4, 2.4));
    const clicks = Math.round(impressions * profile.ctr * eff * between(0.85, 1.15));
    const linkClicks = Math.round(clicks * between(0.62, 0.8));
    const conversions = Math.round(clicks * profile.cvr * eff * between(0.7, 1.25));
    const leads = obj === "leads" ? conversions : Math.round(conversions * 0.08);
    const purchases = obj === "leads" ? 0 : conversions;
    const revenue = purchases * profile.aov * between(0.85, 1.2);
    out.push({ date, spend, impressions, reach, clicks, linkClicks, conversions, leads, purchases, revenue });
  }
  return out;
}

function shares(n: number) {
  const w = Array.from({ length: n }, () => between(0.4, 1));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}

export const CAMPAIGNS: Campaign[] = SEED.map(([name, platform, objective, status, budget], i) => {
  const setShares = shares(2 + Math.floor(rnd() * 3));
  const adSets: AdSet[] = setShares.map((s, j) => {
    const adShares = shares(1 + Math.floor(rnd() * 3));
    return {
      id: `as-${i}-${j}`, name: `Conjunto ${String.fromCharCode(65 + j)} — ${pick(AUDIENCES)}`, audience: pick(AUDIENCES), share: s,
      status: status === "active" && rnd() < 0.2 ? "paused" : status,
      ads: adShares.map((a, k) => ({
        id: `ad-${i}-${j}-${k}`, name: pick(AD_NAMES), format: pick(["Imagem", "Vídeo", "Carrossel"] as const), share: a,
        status: status === "active" && rnd() < 0.15 ? "paused" : status, hue: Math.floor(rnd() * 360),
      })),
    };
  });
  return {
    id: `cmp-${i + 1}`, name, platform, account: pick(ACCOUNTS[platform]), objective, status, budget,
    budgetType: rnd() < 0.85 ? "diario" : "total", startedAt: new Date(TODAY.getTime() - (40 + Math.floor(rnd() * 120)) * DAY),
    days: genDays(budget, objective, status, platform), adSets,
  };
});

/* ---------- Consultas ---------- */
export interface DateRange { from: Date; to: Date }
export const rangeLastDays = (n: number): DateRange => ({ from: new Date(TODAY.getTime() - (n - 1) * DAY), to: TODAY });
export const previousRange = (r: DateRange): DateRange => {
  const len = Math.round((r.to.getTime() - r.from.getTime()) / DAY) + 1;
  return { from: new Date(r.from.getTime() - len * DAY), to: new Date(r.from.getTime() - DAY) };
};
const inRange = (d: Date, r: DateRange) => d >= r.from && d <= r.to;

export const campaignTotals = (c: Campaign, r: DateRange): Totals => sumTotals(c.days.filter((d) => inRange(d.date, r)));
export const scaleTotals = (t: Totals, k: number): Totals => ({
  spend: t.spend * k, impressions: Math.round(t.impressions * k), reach: Math.round(t.reach * k), clicks: Math.round(t.clicks * k),
  linkClicks: Math.round(t.linkClicks * k), conversions: Math.round(t.conversions * k), leads: Math.round(t.leads * k),
  purchases: Math.round(t.purchases * k), revenue: t.revenue * k,
});

export function dailySeries(campaigns: Campaign[], r: DateRange) {
  const map = new Map<number, DayPoint & Record<PlatformId, number>>();
  for (const c of campaigns) for (const d of c.days) {
    if (!inRange(d.date, r)) continue;
    const k = d.date.getTime();
    const cur = map.get(k) ?? { ...sumTotals([]), date: d.date, meta: 0, google: 0, tiktok: 0, linkedin: 0 };
    const s = sumTotals([cur, d]);
    map.set(k, { ...cur, ...s, [c.platform]: cur[c.platform] + d.spend });
  }
  return [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/* ---------- Leads ---------- */
export type LeadStatus = "novo" | "contatado" | "qualificado" | "venda" | "descartado";
export const LEAD_STATUS: Record<LeadStatus, { label: string; tone: "info" | "neutral" | "warning" | "positive" | "negative" | "accent" }> = {
  // funil: novo (azul) → contatado, aguardando retorno (âmbar) → qualificado (acento) → venda (verde); descartado é neutro, não erro
  novo: { label: "Novo", tone: "info" }, contatado: { label: "Contatado", tone: "warning" }, qualificado: { label: "Qualificado", tone: "accent" },
  venda: { label: "Venda", tone: "positive" }, descartado: { label: "Descartado", tone: "neutral" },
};
const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabriela", "Heitor", "Isabela", "João", "Karina", "Lucas", "Marina", "Nicolas", "Olívia", "Pedro", "Rafaela", "Samuel", "Tainá", "Vitor"];
const LAST = ["Almeida", "Barros", "Cardoso", "Duarte", "Esteves", "Farias", "Gomes", "Lima", "Moreira", "Nogueira", "Pacheco", "Rocha", "Siqueira", "Teixeira"];
export interface Lead { id: string; name: string; email: string; form: string; campaign: string; platform: PlatformId; status: LeadStatus; submittedAt: Date }
export const LEADS: Lead[] = Array.from({ length: 48 }, (_, i) => {
  const f = pick(FIRST), l = pick(LAST);
  const c = pick(CAMPAIGNS.filter((x) => x.objective === "leads" || rnd() < 0.15));
  return {
    id: `lead-${i}`, name: `${f} ${l}`, email: `${f}.${l}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@exemplo.com",
    form: pick(["Lista VIP Verão", "Orçamento B2B", "Inscrição webinar"]), campaign: c.name, platform: c.platform,
    status: pick(["novo", "novo", "contatado", "qualificado", "venda", "descartado"] as const),
    submittedAt: new Date(TODAY.getTime() + 20 * 3600_000 - Math.floor(rnd() * 21 * DAY) - Math.floor(rnd() * 12 * 3600_000)),
  };
}).sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());

/* ---------- Modelos de regra (arquétipos observados na referência, redigidos para o NinePro) ---------- */
export type RuleCategory = "cortar" | "escalar" | "alertar" | "horario";
export const RULE_CATEGORIES: Record<RuleCategory, { label: string; description: string }> = {
  cortar: { label: "Cortar desperdício", description: "Pausa o que gasta sem retorno." },
  escalar: { label: "Escalar o que funciona", description: "Aumenta verba com limites." },
  alertar: { label: "Apenas avisar", description: "Notifica, não altera nada." },
  horario: { label: "Horários definidos", description: "Ações em hora marcada." },
};
export interface RuleTemplate { id: string; name: string; description: string; category: RuleCategory; platforms: PlatformId[] | "todas"; condition: string; action: string }
export const RULE_TEMPLATES: RuleTemplate[] = [
  { id: "r1", name: "Pausar conjuntos acima da meta", description: "Pausa conjuntos cujo custo por resultado segue acima da meta depois de gastar o suficiente para julgar.", category: "cortar", platforms: "todas", condition: "CPA > meta × 1,3 e gasto ≥ 2× meta", action: "Pausar conjunto" },
  { id: "r2", name: "Escalar vencedores em degraus", description: "Aumenta o orçamento diário de campanhas com bom retorno, em passos, até um teto.", category: "escalar", platforms: "todas", condition: "ROAS ≥ 3 nos últimos 3 dias", action: "Orçamento +15% (teto definido)" },
  { id: "r3", name: "Anúncios sem conversão", description: "Pausa anúncios que gastaram um valor relevante na semana sem nenhuma conversão.", category: "cortar", platforms: "todas", condition: "Gasto 7d ≥ R$ 300 e conversões = 0", action: "Pausar anúncio" },
  { id: "r4", name: "Fadiga de criativo", description: "Avisa quando a frequência semanal passa de 3, para você renovar o criativo.", category: "alertar", platforms: ["meta", "tiktok"], condition: "Frequência 7d > 3", action: "Notificar equipe" },
  { id: "r5", name: "Pico de gasto", description: "Avisa quando uma campanha gasta hoje mais do que o esperado, ainda com tempo de reagir.", category: "alertar", platforms: "todas", condition: "Gasto hoje > 140% da média 7d", action: "Notificar equipe" },
  { id: "r6", name: "Pausar à noite", description: "Pausa campanhas em veiculação às 23h, no fuso da conta. Combine com a regra da manhã.", category: "horario", platforms: "todas", condition: "Todos os dias, 23:00", action: "Pausar campanhas" },
  { id: "r7", name: "Retomar pela manhã", description: "Reativa às 07h somente o que uma regra pausou — nunca o que você pausou manualmente.", category: "horario", platforms: "todas", condition: "Todos os dias, 07:00", action: "Reativar campanhas pausadas por regra" },
  { id: "r8", name: "Escada de orçamento", description: "Sobe o orçamento 10% ao dia enquanto o custo por resultado fica abaixo da meta.", category: "escalar", platforms: "todas", condition: "CPA < meta (diário)", action: "Orçamento +10% (teto definido)" },
  { id: "r9", name: "Redistribuir verba", description: "Move 20% da verba das duas campanhas de menor retorno para as duas de maior. O total não muda.", category: "escalar", platforms: "todas", condition: "Ranking semanal de ROAS", action: "Remanejar 20%" },
  { id: "r10", name: "CAC acima do limite", description: "Pausa campanhas cujo investimento consome mais da metade da receita atribuída.", category: "cortar", platforms: "todas", condition: "Investimento ÷ receita > 50%", action: "Pausar campanha" },
];

export const allAds = () =>
  CAMPAIGNS.flatMap((c) => c.adSets.flatMap((s) => s.ads.map((a) => ({ ...a, campaign: c, adSet: s, weight: s.share * a.share }))));
