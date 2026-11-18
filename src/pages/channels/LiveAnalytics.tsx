/** Análises de publicações de todas as redes (dados reais). Mesmo cálculo do agente de IA (server/analytics.ts). */
import { BarChart3, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { channelCall } from "@/lib/channelsApi";
import { formatDateShort, formatDateTime, formatValue } from "@/lib/format";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Tag } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { MultiSelect, Select, Tooltip } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, InlineNotice, LoadingState } from "@/components/feedback/States";
import { KpiStrip } from "@/components/data/Metrics";
import { DataTable } from "@/components/data/DataTable";
import { ChartContainer, ChartTooltip, axisProps, gridProps } from "@/components/charts/Chart";
import { NETWORK, PUBLISH_KINDS, type ChannelKind } from "@/config/networks";
import { useChannelAccounts } from "./shared";

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7, var(--series-1))", "var(--series-8, var(--series-2))"];
const PERIODS = [{ value: "7", label: "Últimos 7 dias" }, { value: "30", label: "Últimos 30 dias" }, { value: "90", label: "Últimos 90 dias" }, { value: "180", label: "Últimos 180 dias" }];
const DAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const BUCKETS = [0, 3, 6, 9, 12, 15, 18, 21];

interface Item { midia_id: string; rede: ChannelKind; conta: string | null; formato: string; publicada_em: string | null; legenda: string; link: string | null; thumbnail: string | null; curtidas: number; comentarios: number; compartilhamentos: number | null; salvamentos: number | null; visualizacoes: number | null; impressoes: number | null; alcance: number | null; cliques: number | null; engajamento: number; taxa_engajamento: number | null; desempenho_relativo: number; feita_pelo_ninepro: boolean }
interface Analytics {
  publicacoes: number; taxa_engajamento: number | null;
  totais: { curtidas: number; comentarios: number; compartilhamentos: number; salvamentos: number; visualizacoes: number; impressoes: number; alcance: number; cliques: number; engajamento: number };
  por_rede: { rede: ChannelKind; nome: string; publicacoes: number; engajamento: number; engajamento_medio: number; visualizacoes: number; impressoes: number; alcance: number; taxa_engajamento: number | null }[];
  por_formato: { grupo: string; publicacoes: number; engajamento_medio: number }[];
  melhor_horario: { melhores: { dia: string; hora: string; publicacoes: number; desempenho: string }[]; mapa: { dia: number; hora: number; publicacoes: number; indice: number }[] };
  frequencia: { semanas: { semana: string; publicacoes: number; engajamento_medio: number; indice_medio: number }[]; leitura: string | null };
  seguidores: { contas: { conta_id: string; conta: string; rede: ChannelKind; atual: number | null; inicio: number | null; ganho: number | null }[]; ganho_total: number; serie_total: { dia: string; seguidores: number }[] };
  melhores: Item[];
}

export function LiveAnalytics() {
  const toast = useToast();
  const { accounts, ws } = useChannelAccounts(PUBLISH_KINDS);
  const [period, setPeriod] = useState("30");
  const [kinds, setKinds] = useState<string[]>([]);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    if (!ws) return;
    setError(null);
    try { setData(await channelCall<Analytics>({ action: "analytics", workspaceId: ws, days: Number(period), kinds: kinds.length ? kinds : undefined })); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setData(null); }
  }, [ws, period, kinds]);
  useEffect(() => { void load(); }, [load]);
  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await channelCall<{ atualizadas: Record<string, number | string> }>({ action: "stats_refresh", workspaceId: ws });
      const errs = Object.entries(r.atualizadas).filter(([, v]) => typeof v === "string");
      toast(errs.length ? { tone: "warning", title: "Atualizado, com avisos", description: errs.slice(0, 3).map(([k, v]) => `${k}: ${String(v).replace(/^erro: /, "")}`).join(" · ") } : { tone: "success", title: "Análises atualizadas" });
      await load();
    } catch (e) { toast({ tone: "error", title: "Não foi possível atualizar", description: e instanceof Error ? e.message : String(e) }); }
    setRefreshing(false);
  };
  const connectedKinds = useMemo(() => [...new Set((accounts ?? []).map((a) => a.kind))].filter((k) => NETWORK[k].limits), [accounts]);
  const colorOf = (k: string) => SERIES[Math.max(0, PUBLISH_KINDS.indexOf(k as ChannelKind)) % SERIES.length];

  // mapa de calor em blocos de 3 horas (média ponderada pelo número de publicações)
  const heat = useMemo(() => {
    if (!data) return [];
    return DAYS_SHORT.map((d, di) => BUCKETS.map((b) => {
      const cells = data.melhor_horario.mapa.filter((m) => m.dia === di && m.hora >= b && m.hora < b + 3);
      const n = cells.reduce((s, c) => s + c.publicacoes, 0);
      return { d, b, n, v: n ? cells.reduce((s, c) => s + c.indice * c.publicacoes, 0) / n : null };
    }));
  }, [data]);
  const maxHeat = Math.max(1, ...heat.flat().map((c) => c.v ?? 0));

  if (accounts === null) return <Page><PageHeader title="Análises de publicações" /><LoadingState /></Page>;
  if (!connectedKinds.length) return <Page><PageHeader title="Análises de publicações" /><div className="panel"><EmptyState icon={<BarChart3 />} title="Conecte suas redes" description="Curtidas, comentários, visualizações e seguidores de cada rede aparecem aqui depois de conectar as contas." actions={<Link to="/conexoes" className={buttonClasses("primary")}>Conectar redes</Link>} /></div></Page>;
  const followers = data?.seguidores.contas.reduce((s, c) => s + (c.atual ?? 0), 0) ?? 0;
  return (
    <Page>
      <PageHeader title="Análises de publicações" description="Desempenho das publicações em todas as redes conectadas, inclusive as feitas fora do NinePro. Atualiza sozinho a cada 12 horas."
        actions={<Button icon={<RefreshCw />} loading={refreshing} onClick={() => void refresh()}>Atualizar agora</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        <Select size="sm" className="w-[170px]" ariaLabel="Período" value={period} onValueChange={setPeriod} options={PERIODS} />
        <MultiSelect label="Redes" size="sm" value={kinds} onValueChange={setKinds} options={connectedKinds.map((k) => ({ value: k, label: NETWORK[k].label }))} />
      </div>
      {error && <InlineNotice tone="negative">{error}</InlineNotice>}
      {!data && !error ? <LoadingState /> : data && (
        <>
          <KpiStrip hero={false} items={[
            { id: "p", label: "Publicações", value: data.publicacoes, format: "integer" },
            { id: "e", label: "Engajamento", value: data.totais.engajamento, format: "compact", hint: "Curtidas + comentários + compartilhamentos + salvamentos" },
            { id: "t", label: "Taxa de engajamento", value: data.taxa_engajamento ?? NaN, format: "percent", hint: "Engajamento ÷ alcance (ou impressões/visualizações quando a rede não informa alcance)" },
            { id: "v", label: "Visualizações e impressões", value: data.totais.visualizacoes + data.totais.impressoes, format: "compact" },
            { id: "f", label: "Seguidores", value: followers, format: "compact" },
            { id: "g", label: "Novos seguidores", value: data.seguidores.ganho_total, format: "integer", better: "up", hint: "Desde a primeira foto diária dentro do período" },
          ]} />
          {data.publicacoes === 0 ? (
            <div className="panel"><EmptyState icon={<BarChart3 />} title="Sem publicações no período" description="Clique em Atualizar agora para buscar as publicações recentes das redes, ou aumente o período." /></div>
          ) : (
            <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
              <ChartContainer title="Engajamento por rede" subtitle="Soma no período">
                <div className="h-[240px]"><ResponsiveContainer><BarChart data={data.por_rede} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><CartesianGrid {...gridProps} /><XAxis dataKey="nome" {...axisProps} interval={0} tick={{ ...axisProps.tick, fontSize: 11 }} /><YAxis {...axisProps} width={44} tickFormatter={(v: number) => formatValue(v, "compact")} /><RTooltip cursor={{ fill: "var(--soft)" }} content={<ChartTooltip format="integer" names={{ engajamento: "Engajamento" }} />} /><Bar dataKey="engajamento" radius={[4, 4, 0, 0]} isAnimationActive={false}>{data.por_rede.map((r) => <Cell key={r.rede} fill={colorOf(r.rede)} />)}</Bar></BarChart></ResponsiveContainer></div>
              </ChartContainer>
              <ChartContainer title="Comparação entre redes" subtitle="Médias por publicação">
                <table className="w-full text-[13px]"><thead><tr className="t-label text-left"><th className="px-2 py-1.5 font-normal">Rede</th><th className="px-2 py-1.5 text-right font-normal">Posts</th><th className="px-2 py-1.5 text-right font-normal">Engaj. médio</th><th className="px-2 py-1.5 text-right font-normal">Taxa</th></tr></thead>
                  <tbody>{data.por_rede.map((r) => <tr key={r.rede} className="border-t border-line"><td className="px-2 py-1.5"><span className="inline-flex items-center gap-1.5 [&_svg]:size-3.5">{NETWORK[r.rede]?.icon}{r.nome}</span></td><td className="num px-2 py-1.5 text-right">{r.publicacoes}</td><td className="num px-2 py-1.5 text-right">{formatValue(r.engajamento_medio, "integer")}</td><td className="num px-2 py-1.5 text-right">{r.taxa_engajamento == null ? "—" : formatValue(r.taxa_engajamento, "percent")}</td></tr>)}</tbody></table>
              </ChartContainer>
              <ChartContainer title="Melhor horário para publicar" subtitle="Desempenho em relação à média de cada conta · horário de Brasília">
                <div className="flex flex-col gap-2 px-2 pb-1">
                  {data.melhor_horario.melhores.length > 0 && <div className="flex flex-wrap gap-1.5">{data.melhor_horario.melhores.map((m) => <Tag key={`${m.dia}${m.hora}`} tone="positive">{m.dia} às {m.hora} · {m.desempenho}</Tag>)}</div>}
                  <div className="overflow-x-auto"><table className="w-full border-separate border-spacing-1"><thead><tr><th />{BUCKETS.map((b) => <th key={b} className="t-label !text-[10px] font-normal">{String(b).padStart(2, "0")}h</th>)}</tr></thead>
                    <tbody>{heat.map((row) => <tr key={row[0].d}><td className="t-label pr-1 !text-[10px]">{row[0].d}</td>{row.map((c) => <td key={c.b}><Tooltip content={c.n ? `${c.d} ${String(c.b).padStart(2, "0")}h–${String(c.b + 3).padStart(2, "0")}h · ${c.n} publicação(ões) · ${Math.round((c.v ?? 0) * 100)}% da média` : `${c.d} ${String(c.b).padStart(2, "0")}h · sem publicações`}><span className="block h-6 rounded-xs" style={{ background: c.v == null ? "var(--bar-idle)" : `color-mix(in srgb, var(--accent-text) ${Math.round(((c.v ?? 0) / maxHeat) * 85) + 8}%, transparent)` }} /></Tooltip></td>)}</tr>)}</tbody></table></div>
                </div>
              </ChartContainer>
              <ChartContainer title="Seguidores" subtitle="Total de todas as contas, por dia">
                {data.seguidores.serie_total.length > 1
                  ? <div className="h-[240px]"><ResponsiveContainer><LineChart data={data.seguidores.serie_total.map((x) => ({ date: new Date(`${x.dia}T12:00:00`), v: x.seguidores }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><CartesianGrid {...gridProps} /><XAxis dataKey="date" {...axisProps} tickFormatter={(d: Date) => formatDateShort(d)} minTickGap={28} /><YAxis {...axisProps} width={52} domain={["auto", "auto"]} tickFormatter={(v: number) => formatValue(v, "compact")} /><RTooltip content={<ChartTooltip format="integer" labelFormatter={(l) => formatDateShort(l as unknown as Date)} names={{ v: "Seguidores" }} />} /><Line dataKey="v" stroke="var(--series-3)" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
                  : <ul className="flex flex-col gap-2 px-2 py-2">{data.seguidores.contas.map((c) => <li key={c.conta_id} className="flex items-center gap-2 text-[13px]"><span className="inline-flex flex-1 items-center gap-1.5 [&_svg]:size-3.5">{NETWORK[c.rede]?.icon}{c.conta}</span><span className="num font-semibold">{formatValue(c.atual ?? 0, "integer")}</span></li>)}<li className="t-caption">O histórico diário começa a ser montado a partir de hoje.</li></ul>}
              </ChartContainer>
              <ChartContainer title="Frequência × desempenho" subtitle="Publicações por semana">
                <div className="h-[200px]"><ResponsiveContainer><BarChart data={data.frequencia.semanas.map((w) => ({ ...w, label: formatDateShort(new Date(`${w.semana}T12:00:00`)) }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><CartesianGrid {...gridProps} /><XAxis dataKey="label" {...axisProps} /><YAxis {...axisProps} width={32} allowDecimals={false} /><RTooltip cursor={{ fill: "var(--soft)" }} content={<ChartTooltip format="integer" names={{ publicacoes: "Publicações", engajamento_medio: "Engajamento médio" }} />} /><Bar dataKey="publicacoes" fill="var(--accent-text)" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
                <p className="px-2 pb-2 t-caption">{data.frequencia.leitura ?? "Com 4 semanas ou mais de publicações, mostramos se publicar mais ajudou ou atrapalhou o desempenho de cada post."}</p>
              </ChartContainer>
              <ChartContainer title="Por formato" subtitle="Engajamento médio por publicação">
                <ul className="flex flex-col gap-3 px-2 py-2">{data.por_formato.slice(0, 8).map((f, i) => { const max = Math.max(1, ...data.por_formato.map((x) => x.engajamento_medio)); return <li key={f.grupo} className="flex items-center gap-3"><span className="w-28 truncate text-secondary text-text-soft" title={f.grupo}>{f.grupo.toLowerCase()}</span><span className="h-2.5 flex-1 overflow-hidden rounded-full bg-bar-idle"><span className="block h-full rounded-full" style={{ width: `${(f.engajamento_medio / max) * 100}%`, background: SERIES[i % SERIES.length] }} /></span><span className="num w-24 text-right text-secondary font-bold">{formatValue(f.engajamento_medio, "integer")} <span className="font-normal text-text-soft">({f.publicacoes})</span></span></li>; })}</ul>
              </ChartContainer>
            </div>
          )}
          {data.publicacoes > 0 && (
            <section className="panel overflow-hidden">
              <header className="px-4 pb-3 pt-4"><h3 className="t-title">Publicações com melhor desempenho</h3></header>
              <DataTable caption="Melhores publicações" rows={data.melhores} getId={(p) => `${p.rede}${p.midia_id}`} defaultSort={{ id: "eng", dir: "desc" }}
                columns={[
                  { id: "post", header: "Publicação", sticky: true, cell: (p) => <a href={p.link ?? undefined} target="_blank" rel="noreferrer" className="flex max-w-[400px] items-center gap-3 hover:underline">{p.thumbnail ? <img src={p.thumbnail} alt="" className="size-10 shrink-0 rounded object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded bg-surface-2 [&_svg]:size-4">{NETWORK[p.rede]?.icon}</span>}<span className="flex min-w-0 flex-col"><span className="truncate font-semibold">{p.legenda || "(sem texto)"}</span><span className="inline-flex items-center gap-1 t-caption [&_svg]:size-3">{NETWORK[p.rede]?.icon}{p.conta}{p.feita_pelo_ninepro && <Tag tone="info">NinePro</Tag>}{p.link && <ExternalLink className="size-3" />}</span></span></a> },
                  { id: "eng", header: "Engajamento", align: "right", sortValue: (p) => p.engajamento, cell: (p) => <span className="num">{formatValue(p.engajamento, "integer")}</span> },
                  { id: "rel", header: "Vs. média da conta", align: "right", sortValue: (p) => p.desempenho_relativo, cell: (p) => <span className={`num ${p.desempenho_relativo >= 1 ? "text-positive" : "text-text-soft"}`}>{Math.round(p.desempenho_relativo * 100)}%</span> },
                  { id: "v", header: "Visualizações", align: "right", sortValue: (p) => p.visualizacoes ?? p.impressoes ?? 0, cell: (p) => <span className="num">{p.visualizacoes ?? p.impressoes ?? "—"}</span> },
                  { id: "t", header: "Taxa", align: "right", sortValue: (p) => p.taxa_engajamento ?? 0, cell: (p) => <span className="num">{p.taxa_engajamento == null ? "—" : formatValue(p.taxa_engajamento, "percent")}</span> },
                  { id: "d", header: "Publicado", align: "right", sortValue: (p) => Date.parse(p.publicada_em ?? ""), cell: (p) => <span className="text-text-soft">{p.publicada_em ? formatDateTime(new Date(p.publicada_em)) : "—"}</span> },
                ]}
                empty={<EmptyState compact icon={<BarChart3 />} title="Nenhuma publicação no período" />} />
            </section>
          )}
          <p className="t-caption">LinkedIn: números só de Páginas da empresa. Telegram, Discord, Slack e Google Meu Negócio não informam métricas por publicação (Telegram e Slack mostram membros; Google mostra visualizações do perfil).</p>
        </>
      )}
    </Page>
  );
}
