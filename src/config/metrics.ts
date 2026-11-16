import type { MetricFormat } from "@/lib/format";

/**
 * Catálogo de métricas de anúncios.
 * Origem: drawers "Edit cards" e "Customize columns" do sistema de referência
 * (docs/reverse-engineering/06-data-visualization.md). Nomes em pt-BR, fórmulas padrão de mercado.
 */
export interface Totals {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  conversions: number;
  leads: number;
  purchases: number;
  revenue: number;
}

export type MetricId =
  | "spend" | "impressions" | "reach" | "frequency" | "clicks" | "linkClicks" | "ctr" | "cpc" | "cpm"
  | "conversions" | "convRate" | "cpa" | "leads" | "cpl" | "purchases" | "revenue" | "roas" | "aov";

export interface MetricDef {
  id: MetricId;
  label: string;
  short?: string;
  format: MetricFormat;
  /** Direção desejável: define a cor do delta (alta de CPA é ruim). */
  better: "up" | "down" | "neutral";
  description: string;
  compute: (t: Totals) => number;
}

const safe = (a: number, b: number) => (b > 0 ? a / b : NaN);

export const METRICS: Record<MetricId, MetricDef> = {
  spend: { id: "spend", label: "Investimento", format: "currency", better: "neutral", description: "Total gasto no período.", compute: (t) => t.spend },
  impressions: { id: "impressions", label: "Impressões", format: "integer", better: "up", description: "Vezes que os anúncios foram exibidos.", compute: (t) => t.impressions },
  reach: { id: "reach", label: "Alcance", format: "integer", better: "up", description: "Pessoas únicas alcançadas.", compute: (t) => t.reach },
  frequency: { id: "frequency", label: "Frequência", format: "decimal", better: "neutral", description: "Impressões ÷ alcance.", compute: (t) => safe(t.impressions, t.reach) },
  clicks: { id: "clicks", label: "Cliques", format: "integer", better: "up", description: "Todos os cliques.", compute: (t) => t.clicks },
  linkClicks: { id: "linkClicks", label: "Cliques no link", format: "integer", better: "up", description: "Cliques que levaram ao destino.", compute: (t) => t.linkClicks },
  ctr: { id: "ctr", label: "CTR", format: "percent", better: "up", description: "Cliques ÷ impressões.", compute: (t) => safe(t.clicks, t.impressions) },
  cpc: { id: "cpc", label: "CPC", format: "currency", better: "down", description: "Investimento ÷ cliques.", compute: (t) => safe(t.spend, t.clicks) },
  cpm: { id: "cpm", label: "CPM", format: "currency", better: "down", description: "Custo por mil impressões.", compute: (t) => safe(t.spend, t.impressions) * 1000 },
  conversions: { id: "conversions", label: "Conversões", format: "integer", better: "up", description: "Resultados atribuídos.", compute: (t) => t.conversions },
  convRate: { id: "convRate", label: "Taxa de conversão", short: "Tx. conv.", format: "percent", better: "up", description: "Conversões ÷ cliques.", compute: (t) => safe(t.conversions, t.clicks) },
  cpa: { id: "cpa", label: "Custo por resultado", short: "CPA", format: "currency", better: "down", description: "Investimento ÷ conversões.", compute: (t) => safe(t.spend, t.conversions) },
  leads: { id: "leads", label: "Leads", format: "integer", better: "up", description: "Cadastros recebidos.", compute: (t) => t.leads },
  cpl: { id: "cpl", label: "Custo por lead", short: "CPL", format: "currency", better: "down", description: "Investimento ÷ leads.", compute: (t) => safe(t.spend, t.leads) },
  purchases: { id: "purchases", label: "Compras", format: "integer", better: "up", description: "Compras atribuídas.", compute: (t) => t.purchases },
  revenue: { id: "revenue", label: "Receita", format: "currency", better: "up", description: "Valor das conversões.", compute: (t) => t.revenue },
  roas: { id: "roas", label: "ROAS", format: "ratio", better: "up", description: "Receita ÷ investimento.", compute: (t) => (t.revenue > 0 ? safe(t.revenue, t.spend) : NaN) },
  aov: { id: "aov", label: "Ticket médio", format: "currency", better: "up", description: "Receita ÷ compras.", compute: (t) => safe(t.revenue, t.purchases) },
};

/** Presets de colunas — espelham o padrão "Performance / Leads / Sales / Delivery" observado. */
export const COLUMN_PRESETS: Record<string, { label: string; columns: MetricId[] }> = {
  performance: { label: "Performance", columns: ["spend", "impressions", "clicks", "ctr", "conversions", "cpa", "roas"] },
  leads: { label: "Leads", columns: ["spend", "leads", "cpl", "ctr", "convRate"] },
  vendas: { label: "Vendas", columns: ["spend", "purchases", "revenue", "roas", "aov", "cpa"] },
  entrega: { label: "Entrega", columns: ["spend", "impressions", "reach", "frequency", "cpm", "cpc"] },
};

/** Colunas que não podem ser removidas (padrão "locked columns" observado). */
export const LOCKED_COLUMNS: MetricId[] = ["spend"];

export const DEFAULT_KPIS: MetricId[] = ["spend", "conversions", "cpa", "roas", "ctr", "revenue"];

export const sumTotals = (rows: Totals[]): Totals =>
  rows.reduce<Totals>(
    (a, r) => ({
      spend: a.spend + r.spend, impressions: a.impressions + r.impressions, reach: a.reach + r.reach, clicks: a.clicks + r.clicks,
      linkClicks: a.linkClicks + r.linkClicks, conversions: a.conversions + r.conversions, leads: a.leads + r.leads,
      purchases: a.purchases + r.purchases, revenue: a.revenue + r.revenue,
    }),
    { spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, conversions: 0, leads: 0, purchases: 0, revenue: 0 },
  );
