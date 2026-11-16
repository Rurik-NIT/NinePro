import { ArrowRight, Gauge, SlidersHorizontal, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { DEFAULT_KPIS, METRICS, sumTotals, type MetricId, type Totals } from "@/config/metrics";
import { CAMPAIGNS, PLATFORMS, PLATFORM_ORDER, campaignTotals, dailySeries, STATUS, type PlatformId } from "@/data/demo";
import { useFilters, GlobalFilters } from "@/lib/filters";
import { formatDateShort, formatValue } from "@/lib/format";
import { useLocalState } from "@/lib/useLocalState";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/Tabs";
import { StatusBadge } from "@/components/ui/Badge";
import { DemoBadge, EmptyState } from "@/components/feedback/States";
import { Delta, KpiStrip, Progress } from "@/components/data/Metrics";
import { MetricConfigurator } from "@/components/data/MetricConfigurator";
import { PlatformDot, PlatformLabel } from "@/components/data/Platform";
import { ChartContainer, ChartLegend, ChartTooltip, axisProps, gridProps } from "@/components/charts/Chart";

type TrendMetric = "spend" | "revenue" | "conversions" | "cpa";
const TREND_OPTIONS: { value: TrendMetric; label: string }[] = [
  { value: "spend", label: "Investimento" },
  { value: "revenue", label: "Receita" },
  { value: "conversions", label: "Conversões" },
  { value: "cpa", label: "CPA" },
];

export default function Dashboard() {
  const { range, previous, activePlatforms } = useFilters();
  const [kpis, setKpis] = useLocalState<MetricId[]>("ninepro.dashboard.kpis", DEFAULT_KPIS);
  const [configOpen, setConfigOpen] = useState(false);
  const [trend, setTrend] = useState<TrendMetric>("spend");
  const [compare, setCompare] = useState(true);

  const campaigns = useMemo(() => CAMPAIGNS.filter((c) => activePlatforms.includes(c.platform)), [activePlatforms]);
  const cur = useMemo(() => sumTotals(campaigns.map((c) => campaignTotals(c, range))), [campaigns, range]);
  const prev = useMemo(() => sumTotals(campaigns.map((c) => campaignTotals(c, previous))), [campaigns, previous]);
  const series = useMemo(() => dailySeries(campaigns, range), [campaigns, range]);
  const prevSeries = useMemo(() => dailySeries(campaigns, previous), [campaigns, previous]);

  const kpiItems = kpis.map((id) => ({
    id, label: METRICS[id].label, format: METRICS[id].format, better: METRICS[id].better, hint: METRICS[id].description,
    value: METRICS[id].compute(cur), previous: METRICS[id].compute(prev),
    spark: series.map((d) => METRICS[id].compute(d)).filter(Number.isFinite),
  }));

  const metricOf = (t: Totals) => METRICS[trend].compute(t);
  const trendData = series.map((d, i) => ({ date: d.date, atual: metricOf(d), anterior: prevSeries[i] ? metricOf(prevSeries[i]) : null }));

  const byPlatform = PLATFORM_ORDER.filter((p) => activePlatforms.includes(p)).map((p) => {
    const t = sumTotals(campaigns.filter((c) => c.platform === p).map((c) => campaignTotals(c, range)));
    const tp = sumTotals(campaigns.filter((c) => c.platform === p).map((c) => campaignTotals(c, previous)));
    return { id: p, t, tp, share: cur.spend ? t.spend / cur.spend : 0 };
  });

  const ranked = campaigns
    .map((c) => ({ c, t: campaignTotals(c, range), tp: campaignTotals(c, previous) }))
    .filter((r) => r.t.spend > 0)
    .sort((a, b) => b.t.spend - a.t.spend);

  /* Alertas derivados dos dados — nada inventado: cada alerta cita a regra que o gerou. */
  const alerts = ranked.flatMap(({ c, t, tp }) => {
    const out: { id: string; tone: "negative" | "warning" | "positive"; title: string; detail: string }[] = [];
    const cpa = METRICS.cpa.compute(t), cpaP = METRICS.cpa.compute(tp);
    if (Number.isFinite(cpa) && Number.isFinite(cpaP) && cpa > cpaP * 1.15) out.push({ id: c.id + "cpa", tone: "negative", title: c.name, detail: `CPA ${formatValue(cpa, "currency")} · +${Math.round((cpa / cpaP - 1) * 100)}% vs. anterior` });
    if (c.status === "limited") out.push({ id: c.id + "lim", tone: "warning", title: c.name, detail: "Entrega limitada pelo orçamento ou lance" });
    const roas = METRICS.roas.compute(t);
    if (roas >= 4) out.push({ id: c.id + "roas", tone: "positive", title: c.name, detail: `ROAS ${formatValue(roas, "ratio")} — candidata a escalar` });
    return out;
  }).sort((a, b) => ["negative", "warning", "positive"].indexOf(a.tone) - ["negative", "warning", "positive"].indexOf(b.tone)).slice(0, 5);

  /* Ritmo de orçamento: mês corrente */
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthRange = { from: new Date(now.getFullYear(), now.getMonth(), 1), to: range.to };
  const pacing = PLATFORM_ORDER.filter((p) => activePlatforms.includes(p)).map((p) => {
    const cs = campaigns.filter((c) => c.platform === p && c.status !== "ended");
    const spent = cs.reduce((a, c) => a + campaignTotals(c, monthRange).spend, 0);
    const planned = cs.reduce((a, c) => a + (c.budgetType === "diario" ? c.budget * daysInMonth : c.budget * 20), 0);
    return { id: p, spent, planned, expected: now.getDate() / daysInMonth };
  });

  const trendFormat = METRICS[trend].format;

  return (
    <Page>
      <PageHeader
        meta={<DemoBadge />}
        title="Visão geral"
        description="Desempenho consolidado das contas de anúncio no período, comparado ao período anterior de mesma duração."
        actions={<><GlobalFilters /><Button icon={<SlidersHorizontal />} onClick={() => setConfigOpen(true)}>Indicadores</Button></>}
      />

      <KpiStrip items={kpiItems} />

      <div className="grid grid-cols-1 gap-gutter xl:grid-cols-[minmax(0,1fr)_380px]">
        <ChartContainer
          title={`${METRICS[trend].label} por dia`}
          subtitle={`${formatDateShort(range.from)} – ${formatDateShort(range.to)} · todas as plataformas selecionadas`}
          actions={<SegmentedControl ariaLabel="Métrica do gráfico" size="sm" value={trend} onValueChange={setTrend} options={TREND_OPTIONS} />}
          legend={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ChartLegend
                items={[
                  { id: "atual", label: "Período atual", color: "var(--accent-text)", value: formatValue(metricOf(cur), trendFormat) },
                  ...(compare ? [{ id: "anterior", label: "Período anterior", color: "var(--text-dim)", dashed: true, value: formatValue(metricOf(prev), trendFormat) }] : []),
                ]}
              />
              <label className="flex cursor-pointer items-center gap-2 t-secondary">
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
                Comparar
              </label>
            </div>
          }
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-text)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--accent-text)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={(d: Date) => formatDateShort(d)} minTickGap={28} />
                <YAxis {...axisProps} width={64} tickFormatter={(v: number) => formatValue(v, trendFormat === "currency" ? "compact" : trendFormat === "integer" ? "compact" : trendFormat)} />
                <RTooltip cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }} content={<ChartTooltip format={trendFormat} labelFormatter={(l) => formatDateShort(l as unknown as Date)} names={{ atual: "Atual", anterior: "Anterior" }} />} />
                {compare && <Line type="monotone" dataKey="anterior" stroke="var(--text-dim)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />}
                <Area type="monotone" dataKey="atual" stroke="var(--accent-text)" strokeWidth={2} fill="url(#trendFill)" activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartContainer>

        <ChartContainer title="Investimento por plataforma" subtitle="Participação no investimento e retorno de cada canal" bodyClassName="px-4">
          <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Participação no investimento por plataforma">
            {byPlatform.map((p) => <span key={p.id} style={{ width: `${p.share * 100}%`, background: PLATFORMS[p.id].series }} className="h-full first:rounded-l-full last:rounded-r-full" />)}
          </div>
          <ul className="mt-4 flex flex-col">
            {byPlatform.map((p) => (
              <li key={p.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-line-soft py-3 last:border-b-0">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <PlatformLabel id={p.id} />
                  <span className="num t-caption pl-[18px]">{(p.share * 100).toFixed(1).replace(".", ",")}% do total</span>
                </span>
                <span className="flex flex-col items-end gap-0.5">
                  <span className="num text-body font-bold">{formatValue(p.t.spend, "currency0")}</span>
                  <Delta current={p.t.spend} previous={p.tp.spend} better="neutral" size="xs" />
                </span>
                <span className="flex w-16 flex-col items-end gap-0.5">
                  <span className="num text-body font-bold">{formatValue(METRICS.roas.compute(p.t), "ratio")}</span>
                  <span className="t-caption">ROAS</span>
                </span>
              </li>
            ))}
          </ul>
        </ChartContainer>
      </div>

      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <section className="panel flex flex-col lg:col-span-2 2xl:col-span-1">
          <header className="flex items-center justify-between px-4 pb-3 pt-4">
            <div><h3 className="t-title">Campanhas com maior investimento</h3><p className="t-secondary">Top 5 no período</p></div>
            <Link to="/campanhas" className="inline-flex h-control-sm items-center gap-1.5 rounded-sm px-2 text-secondary font-semibold text-text-muted transition-colors hover:bg-soft hover:text-text">
              Ver todas <ArrowRight className="size-3.5" />
            </Link>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-y border-line bg-surface-2">
                  <th className="t-label h-8 pl-4 text-left">Campanha</th>
                  <th className="t-label h-8 px-3 text-right">Investimento</th>
                  <th className="t-label h-8 px-3 text-right">CPA</th>
                  <th className="t-label h-8 pr-4 text-right">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {ranked.slice(0, 5).map(({ c, t, tp }) => (
                  <tr key={c.id} className="border-b border-line-soft last:border-b-0 hover:bg-surface-2">
                    <td className="h-12 pl-4">
                      <span className="flex items-center gap-2.5">
                        <PlatformDot id={c.platform} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-body font-semibold">{c.name}</span>
                          <StatusBadge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</StatusBadge>
                        </span>
                      </span>
                    </td>
                    <td className="num px-3 text-right text-body">{formatValue(t.spend, "currency0")}</td>
                    <td className="px-3 text-right"><span className="num block text-body">{formatValue(METRICS.cpa.compute(t), "currency")}</span><Delta current={METRICS.cpa.compute(t)} previous={METRICS.cpa.compute(tp)} better="down" size="xs" /></td>
                    <td className="pr-4 text-right"><span className="num block text-body font-bold">{formatValue(METRICS.roas.compute(t), "ratio")}</span><Delta current={METRICS.roas.compute(t)} previous={METRICS.roas.compute(tp)} better="up" size="xs" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel flex flex-col">
          <header className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
            <div><h3 className="t-title">Ritmo do orçamento</h3><p className="t-secondary">Gasto do mês vs. planejado</p></div>
            <Gauge className="size-4 text-text-dim" />
          </header>
          <ul className="flex flex-col gap-4 px-4 pb-4">
            {pacing.map((p) => {
              const ratio = p.planned ? p.spent / p.planned : 0;
              const ahead = ratio > p.expected * 1.1;
              return (
                <li key={p.id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <PlatformLabel id={p.id} muted />
                    <span className="num text-secondary"><b className="text-text">{formatValue(p.spent, "currency0")}</b> <span className="text-text-dim">/ {formatValue(p.planned, "currency0")}</span></span>
                  </div>
                  <div className="relative">
                    <Progress value={ratio} tone={ahead ? "warning" : "accent"} ariaLabel={`Ritmo de ${PLATFORMS[p.id].label}`} />
                    <span className="absolute -top-1 h-3.5 w-px bg-text-soft" style={{ left: `${p.expected * 100}%` }} title="Esperado para hoje" aria-hidden />
                  </div>
                  <span className="t-caption">{ahead ? "Acima do ritmo esperado para hoje" : "Dentro do ritmo"}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel flex flex-col">
          <header className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
            <div><h3 className="t-title">Pontos de atenção</h3><p className="t-secondary">Gerados a partir das métricas do período</p></div>
            <TriangleAlert className="size-4 text-text-dim" />
          </header>
          {alerts.length === 0 ? (
            <EmptyState compact icon={<TrendingUp />} title="Nada fora do esperado" description="Nenhuma campanha disparou os critérios de atenção neste período." />
          ) : (
            <ul className="flex flex-col px-2 pb-2">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link to="/campanhas" className="flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-2">
                    <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-sm ${a.tone === "negative" ? "bg-negative-tint text-negative" : a.tone === "warning" ? "bg-warning-tint text-warning" : "bg-positive-tint text-positive"}`}>
                      {a.tone === "positive" ? <TrendingUp className="size-3.5" /> : a.tone === "negative" ? <TrendingDown className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-body font-semibold">{a.title}</span>
                      <span className="num t-secondary">{a.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ChartContainer title="Conversões por plataforma" subtitle="Volume diário empilhado — cada cor é uma plataforma, em ordem fixa"
        legend={<ChartLegend items={PLATFORM_ORDER.filter((p) => activePlatforms.includes(p)).map((p) => ({ id: p, label: PLATFORMS[p].label, color: PLATFORMS[p].series }))} />}>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={convByPlatform(campaigns, range, activePlatforms)} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barCategoryGap={3}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" {...axisProps} tickFormatter={(d: Date) => formatDateShort(d)} minTickGap={28} />
              <YAxis {...axisProps} width={40} />
              <RTooltip cursor={{ fill: "var(--soft)" }} content={<ChartTooltip format="integer" labelFormatter={(l) => formatDateShort(l as unknown as Date)} names={Object.fromEntries(PLATFORM_ORDER.map((p) => [p, PLATFORMS[p].label]))} />} />
              {PLATFORM_ORDER.filter((p) => activePlatforms.includes(p)).map((p, i, arr) => (
                <Bar key={p} dataKey={p} stackId="c" fill={PLATFORMS[p].series} stroke="var(--surface)" strokeWidth={1} radius={i === arr.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartContainer>

      <MetricConfigurator
        open={configOpen} onOpenChange={setConfigOpen} title="Indicadores do painel" icon={<SlidersHorizontal />}
        description="Escolha até 6 indicadores. A ordem de cima para baixo é a ordem da esquerda para a direita."
        value={kpis} defaults={DEFAULT_KPIS} max={6} onApply={setKpis}
      />
    </Page>
  );
}

function convByPlatform(campaigns: typeof CAMPAIGNS, range: { from: Date; to: Date }, platforms: PlatformId[]) {
  const map = new Map<number, Record<string, number | Date>>();
  for (const c of campaigns) {
    if (!platforms.includes(c.platform)) continue;
    for (const d of c.days) {
      if (d.date < range.from || d.date > range.to) continue;
      const k = d.date.getTime();
      const row = map.get(k) ?? { date: d.date, meta: 0, google: 0, tiktok: 0, linkedin: 0 };
      row[c.platform] = (row[c.platform] as number) + d.conversions;
      map.set(k, row);
    }
  }
  return [...map.values()].sort((a, b) => (a.date as Date).getTime() - (b.date as Date).getTime());
}
