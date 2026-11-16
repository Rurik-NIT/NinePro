import { Film, GalleryHorizontal, Image as ImageIcon, LayoutGrid, List } from "lucide-react";
import { useMemo, useState } from "react";
import { METRICS, type MetricId } from "@/config/metrics";
import { campaignTotals, scaleTotals, STATUS } from "@/data/demo";
import { flattenAds, useData } from "@/data/source";
import { GlobalFilters, useFilters } from "@/lib/filters";
import { formatValue } from "@/lib/format";
import { useLocalState } from "@/lib/useLocalState";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Count, StatusBadge, Tag } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/Tabs";
import { DemoBadge, EmptyState } from "@/components/feedback/States";
import { DataTable, type Column } from "@/components/data/DataTable";
import { PlatformDot } from "@/components/data/Platform";

const SORTS: { value: MetricId; label: string }[] = [
  { value: "spend", label: "Investimento" },
  { value: "ctr", label: "CTR" },
  { value: "conversions", label: "Resultados" },
  { value: "cpa", label: "Custo por resultado" },
  { value: "roas", label: "ROAS" },
];
const formatIcon = { Imagem: ImageIcon, Vídeo: Film, Carrossel: GalleryHorizontal };

/** Miniatura gerada (sem imagens reais): padrão geométrico neutro + ícone do formato. */
function Thumb({ hue, format, className }: { hue: number; format: keyof typeof formatIcon; className?: string }) {
  const Icon = formatIcon[format];
  return (
    <div className={`relative grid place-items-center overflow-hidden bg-surface-2 ${className ?? ""}`} aria-hidden>
      <svg className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 100 60">
        <defs>
          <linearGradient id={`g${hue}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor={`hsl(${hue} 30% 50%)`} stopOpacity=".28" />
            <stop offset="1" stopColor={`hsl(${(hue + 60) % 360} 30% 40%)`} stopOpacity=".08" />
          </linearGradient>
        </defs>
        <rect width="100" height="60" fill={`url(#g${hue})`} />
        <circle cx={20 + (hue % 60)} cy="44" r="26" fill={`hsl(${hue} 25% 50%)`} opacity=".12" />
      </svg>
      <Icon className="relative size-5 text-text-muted" />
    </div>
  );
}

export default function Creatives() {
  const { range, activePlatforms } = useFilters();
  const [view, setView] = useLocalState<"grid" | "table">("ninepro.creatives.view", "grid");
  const [sort, setSort] = useState<MetricId>("spend");
  const { campaigns } = useData();

  const ads = useMemo(() => {
    const totalsByCampaign = new Map<string, ReturnType<typeof campaignTotals>>();
    return flattenAds(campaigns)
      .filter((a) => activePlatforms.includes(a.campaign.platform))
      .map((a) => {
        if (!totalsByCampaign.has(a.campaign.id)) totalsByCampaign.set(a.campaign.id, campaignTotals(a.campaign, range));
        return { ...a, totals: scaleTotals(totalsByCampaign.get(a.campaign.id)!, a.weight) };
      })
      .filter((a) => a.totals.spend > 0)
      .sort((x, y) => {
        const a = METRICS[sort].compute(x.totals), b = METRICS[sort].compute(y.totals);
        const dir = METRICS[sort].better === "down" ? 1 : -1;
        return ((Number.isFinite(a) ? a : Infinity * -dir) - (Number.isFinite(b) ? b : Infinity * -dir)) * dir;
      });
  }, [campaigns, range, activePlatforms, sort]);

  type A = (typeof ads)[number];
  const columns: Column<A>[] = [
    { id: "creative", header: "Criativo", sticky: true, cell: (a) => (
      <div className="flex items-center gap-3"><Thumb hue={a.hue} format={a.format} className="h-9 w-14 rounded-sm" />
        <div className="flex min-w-0 flex-col"><span className="truncate text-body font-semibold">{a.name}</span><span className="flex items-center gap-1.5 truncate t-caption"><PlatformDot id={a.campaign.platform} className="size-2" />{a.campaign.name}</span></div></div>
    ) },
    { id: "format", header: "Formato", cell: (a) => <Tag>{a.format}</Tag> },
    { id: "status", header: "Status", cell: (a) => <StatusBadge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</StatusBadge> },
    ...(["spend", "ctr", "conversions", "cpa", "roas"] as MetricId[]).map<Column<A>>((m) => ({
      id: m, header: METRICS[m].short ?? METRICS[m].label, align: "right", sortValue: (a) => METRICS[m].compute(a.totals),
      cell: (a) => formatValue(METRICS[m].compute(a.totals), METRICS[m].format),
    })),
  ];

  return (
    <Page>
      <PageHeader meta={<DemoBadge liveable />} title={<span className="inline-flex items-center gap-3">Criativos <Count>{ads.length}</Count></span>}
        description="Desempenho por peça, para decidir o que renovar e o que replicar."
        actions={<GlobalFilters />} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select size="sm" className="w-[220px]" ariaLabel="Ordenar por" value={sort} onValueChange={(v) => setSort(v as MetricId)}
          prefix={<span className="t-caption">Ordenar:</span>} options={SORTS} />
        <SegmentedControl ariaLabel="Visualização" size="sm" value={view} onValueChange={setView}
          options={[{ value: "grid", label: "", icon: <LayoutGrid />, title: "Grade" }, { value: "table", label: "", icon: <List />, title: "Tabela" }]} />
      </div>

      {ads.length === 0 ? (
        <div className="panel"><EmptyState icon={<ImageIcon />} title="Sem criativos com veiculação no período" description="Ajuste o período ou as plataformas." /></div>
      ) : view === "grid" ? (
        <ul className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {ads.map((a, i) => {
            const roas = METRICS.roas.compute(a.totals);
            return (
              <li key={a.id} className="panel group flex flex-col overflow-hidden transition-colors hover:border-line-strong">
                <div className="relative">
                  <Thumb hue={a.hue} format={a.format} className="aspect-[2/1] w-full border-b border-line-soft" />
                  <span className="num absolute left-3 top-3 rounded-xs bg-overlay px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-text-soft ring-1 ring-line">#{String(i + 1).padStart(2, "0")}</span>
                  <span className="absolute right-3 top-3"><Tag className="bg-overlay">{a.format}</Tag></span>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex flex-col gap-1">
                    <span className="truncate t-title">{a.name}</span>
                    <span className="flex items-center gap-1.5 truncate t-caption"><PlatformDot id={a.campaign.platform} className="size-2" />{a.campaign.name}</span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 border-t border-line-soft pt-3">
                    {([["Investimento", formatValue(a.totals.spend, "currency0")], ["CTR", formatValue(METRICS.ctr.compute(a.totals), "percent")], ["ROAS", formatValue(roas, "ratio")]] as const).map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-0.5"><dt className="t-label !text-[10px]">{k}</dt><dd className="num text-body font-bold">{v}</dd></div>
                    ))}
                  </dl>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="panel overflow-hidden">
          <DataTable caption="Criativos" rows={ads} columns={columns} getId={(a) => a.id} defaultSort={{ id: sort, dir: METRICS[sort].better === "down" ? "asc" : "desc" }} />
        </section>
      )}
    </Page>
  );
}
