import { BarChart3, Globe } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { CHANNELS, CONVERSATIONS, POSTS } from "@/data/demo/extra";
import { TODAY } from "@/data/demo";
import { formatDateShort, formatValue } from "@/lib/format";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { MultiSelect, Select, Tooltip } from "@/components/ui/Menu";
import { DemoBadge, EmptyState } from "@/components/feedback/States";
import { KpiStrip } from "@/components/data/Metrics";
import { DataTable } from "@/components/data/DataTable";
import { ChartContainer, ChartLegend, ChartTooltip, axisProps, gridProps } from "@/components/charts/Chart";

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];
const PERIODS = [{ value: "7", label: "Últimos 7 dias" }, { value: "30", label: "Últimos 30 dias" }, { value: "90", label: "Últimos 90 dias" }];
const D = 86_400_000;

function Filters({ period, setPeriod }: { period: string; setPeriod: (v: string) => void }) {
  const [a, setA] = useState<string[]>([]), [b, setB] = useState<string[]>([]), [c, setC] = useState<string[]>([]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select size="sm" className="w-[170px]" ariaLabel="Período" value={period} onValueChange={setPeriod} options={PERIODS} />
      <MultiSelect label="Plataformas" size="sm" value={a} onValueChange={setA} options={CHANNELS.map((x) => ({ value: x, label: x }))} />
      <MultiSelect label="Perfis" size="sm" value={b} onValueChange={setB} options={[{ value: "aurora", label: "Loja Aurora" }, { value: "outlet", label: "Aurora Outlet" }]} />
      <MultiSelect label="Contas" size="sm" value={c} onValueChange={setC} options={[{ value: "ig", label: "@lojaaurora" }, { value: "li", label: "Aurora (LinkedIn)" }]} />
    </div>
  );
}

/** Série diária determinística para os gráficos de demonstração. */
function daily(days: number, seed: number, base: number, amp: number) {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(TODAY.getTime() - (days - 1 - i) * D);
    const v = base + Math.sin((i + seed) / 2.3) * amp + ((i * 37 + seed * 11) % 13) - 6;
    return { date, v: Math.max(0, Math.round(v)) };
  });
}

/* ------------------------------------------------------------------ Publicações */
export function AnalyticsPosting() {
  const [period, setPeriod] = useState("30");
  const days = Number(period);
  const published = POSTS.filter((p) => p.status === "Publicada" && p.at.getTime() >= TODAY.getTime() - days * D);
  const reach = published.reduce((a, p) => a + (p.metrics?.reach ?? 0), 0);
  const likes = published.reduce((a, p) => a + (p.metrics?.likes ?? 0), 0);
  const comments = published.reduce((a, p) => a + (p.metrics?.comments ?? 0), 0);
  const byChannel = CHANNELS.slice(0, 5).map((c, i) => ({ c, n: published.filter((p) => p.channels.includes(c)).length, likes: published.filter((p) => p.channels.includes(c)).reduce((a, p) => a + (p.metrics?.likes ?? 0), 0), color: SERIES[i] }));
  const weekly = Array.from({ length: Math.ceil(days / 7) }, (_, w) => ({ label: `S${w + 1}`, n: published.filter((p) => Math.floor((TODAY.getTime() - p.at.getTime()) / (7 * D)) === Math.ceil(days / 7) - 1 - w).length }));
  const likesSeries = useMemo(() => daily(days, 3, 60, 25), [days]);
  const followers = useMemo(() => { let f = 18400; return daily(days, 7, 0, 30).map((d) => ({ date: d.date, v: (f += d.v) })); }, [days]);
  const hours = ["06h", "09h", "12h", "15h", "18h", "21h"]; const wd = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const best = wd.map((d, i) => hours.map((h, j) => ({ d, h, v: ((i * 7 + j * 5) % 11) + (j === 4 ? 6 : 0) })));
  const maxBest = Math.max(...best.flat().map((x) => x.v));
  const top = published.map((p) => ({ ...p, eng: (p.metrics!.likes + p.metrics!.comments) })).sort((a, b) => b.eng - a.eng).slice(0, 6);
  return (
    <Page>
      <PageHeader meta={<DemoBadge />} title="Análises de publicações" description="Alcance, engajamento e melhores horários das publicações orgânicas." />
      <Filters period={period} setPeriod={setPeriod} />
      <KpiStrip hero={false} items={[
        { id: "er", label: "Taxa de engajamento", value: reach ? (likes + comments) / reach : NaN, format: "percent" },
        { id: "r", label: "Alcance total", value: reach, format: "integer" },
        { id: "f", label: "Seguidores", value: followers[followers.length - 1]?.v ?? 0, format: "integer" },
        { id: "p", label: "Publicações no período", value: published.length, format: "integer" },
        { id: "l", label: "Curtidas", value: likes, format: "integer" },
        { id: "c", label: "Comentários", value: comments, format: "integer" },
      ]} />
      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
        <ChartContainer title="Publicações por plataforma" subtitle="Quantidade no período" legend={<ChartLegend items={byChannel.map((b) => ({ id: b.c, label: b.c, color: b.color }))} />}>
          <div className="h-[220px]"><ResponsiveContainer><BarChart data={byChannel} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><CartesianGrid {...gridProps} /><XAxis dataKey="c" {...axisProps} /><YAxis {...axisProps} width={32} allowDecimals={false} /><RTooltip cursor={{ fill: "var(--soft)" }} content={<ChartTooltip format="integer" names={{ n: "Publicações" }} />} /><Bar dataKey="n" radius={[4, 4, 0, 0]} isAnimationActive={false}>{byChannel.map((b) => <Cell key={b.c} fill={b.color} />)}</Bar></BarChart></ResponsiveContainer></div>
        </ChartContainer>
        <ChartContainer title="Publicações ao longo do tempo" subtitle={`Por semana · últimos ${days} dias`}>
          <div className="h-[220px]"><ResponsiveContainer><BarChart data={weekly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><CartesianGrid {...gridProps} /><XAxis dataKey="label" {...axisProps} /><YAxis {...axisProps} width={32} allowDecimals={false} /><RTooltip cursor={{ fill: "var(--soft)" }} content={<ChartTooltip format="integer" names={{ n: "Publicações" }} />} /><Bar dataKey="n" fill="var(--accent-text)" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
        </ChartContainer>
        <ChartContainer title="Curtidas por plataforma" subtitle="Soma no período">
          <ul className="flex flex-col gap-3 px-2 py-2">{byChannel.map((b) => { const max = Math.max(1, ...byChannel.map((x) => x.likes)); return <li key={b.c} className="flex items-center gap-3"><span className="w-20 text-secondary text-text-soft">{b.c}</span><span className="h-2.5 flex-1 overflow-hidden rounded-full bg-bar-idle"><span className="block h-full rounded-full" style={{ width: `${(b.likes / max) * 100}%`, background: b.color }} /></span><span className="num w-16 text-right text-secondary font-bold">{formatValue(b.likes, "integer")}</span></li>; })}</ul>
        </ChartContainer>
        <ChartContainer title="Curtidas ao longo do tempo" subtitle="Por dia">
          <div className="h-[220px]"><ResponsiveContainer><LineChart data={likesSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><CartesianGrid {...gridProps} /><XAxis dataKey="date" {...axisProps} tickFormatter={(d: Date) => formatDateShort(d)} minTickGap={28} /><YAxis {...axisProps} width={36} /><RTooltip content={<ChartTooltip format="integer" labelFormatter={(l) => formatDateShort(l as unknown as Date)} names={{ v: "Curtidas" }} />} /><Line dataKey="v" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
        </ChartContainer>
        <ChartContainer title="Melhor horário para publicar" subtitle="Engajamento médio por dia e hora">
          <div className="overflow-x-auto px-2 pb-1"><table className="w-full border-separate border-spacing-1"><thead><tr><th />{hours.map((h) => <th key={h} className="t-label !text-[10px] font-normal">{h}</th>)}</tr></thead>
            <tbody>{best.map((row) => <tr key={row[0].d}><td className="t-label pr-1 !text-[10px]">{row[0].d}</td>{row.map((c) => <td key={c.h}><Tooltip content={`${c.d} ${c.h} · índice ${c.v}`}><span className="block h-6 rounded-xs" style={{ background: `color-mix(in srgb, var(--accent-text) ${Math.round((c.v / maxBest) * 85) + 6}%, transparent)` }} /></Tooltip></td>)}</tr>)}</tbody></table></div>
        </ChartContainer>
        <ChartContainer title="Histórico de seguidores" subtitle="Total acumulado por dia">
          <div className="h-[220px]"><ResponsiveContainer><LineChart data={followers} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><CartesianGrid {...gridProps} /><XAxis dataKey="date" {...axisProps} tickFormatter={(d: Date) => formatDateShort(d)} minTickGap={28} /><YAxis {...axisProps} width={52} domain={["auto", "auto"]} tickFormatter={(v: number) => formatValue(v, "compact")} /><RTooltip content={<ChartTooltip format="integer" labelFormatter={(l) => formatDateShort(l as unknown as Date)} names={{ v: "Seguidores" }} />} /><Line dataKey="v" stroke="var(--series-3)" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
        </ChartContainer>
      </div>
      <section className="panel overflow-hidden">
        <header className="px-4 pb-3 pt-4"><h3 className="t-title">Publicações com melhor desempenho</h3></header>
        <DataTable caption="Melhores publicações" rows={top} getId={(p) => p.id} defaultSort={{ id: "eng", dir: "desc" }}
          columns={[
            { id: "post", header: "Publicação", sticky: true, cell: (p) => <span className="block max-w-[380px] truncate font-semibold">{p.text}</span> },
            { id: "eng", header: "Engajamento", align: "right", sortValue: (p) => p.eng, cell: (p) => formatValue(p.eng, "integer") },
            { id: "reach", header: "Alcance", align: "right", sortValue: (p) => p.metrics!.reach, cell: (p) => formatValue(p.metrics!.reach, "integer") },
            { id: "er", header: "Taxa", align: "right", sortValue: (p) => p.eng / p.metrics!.reach, cell: (p) => formatValue(p.eng / p.metrics!.reach, "percent") },
          ]}
          empty={<EmptyState compact icon={<BarChart3 />} title="Nenhuma publicação com engajamento no período" />} />
      </section>
    </Page>
  );
}

/* ------------------------------------------------------------------ Caixa de entrada */
export function AnalyticsInbox() {
  const [period, setPeriod] = useState("30");
  const days = Number(period);
  const recv = useMemo(() => daily(days, 1, 48, 14), [days]);
  const sent = useMemo(() => daily(days, 4, 41, 12), [days]);
  const combined = recv.map((r, i) => ({ date: r.date, recebidas: r.v, enviadas: sent[i].v }));
  const sum = (a: { v: number }[]) => a.reduce((x, y) => x + y.v, 0);
  const accounts = [{ acc: "@lojaaurora (Instagram)", recv: 820, sent: 760, conv: 312, resp: "6 min" }, { acc: "Sandbox (WhatsApp)", recv: 410, sent: 395, conv: 140, resp: "3 min" }, { acc: "Loja Aurora (Facebook)", recv: 96, sent: 80, conv: 41, resp: "22 min" }];
  return (
    <Page>
      <PageHeader meta={<DemoBadge />} title="Análises da caixa de entrada" description="Volume, tempo de resposta e horários das mensagens." />
      <Filters period={period} setPeriod={setPeriod} />
      <KpiStrip hero={false} items={[
        { id: "r", label: "Recebidas por dia", value: sum(recv) / days, format: "decimal" },
        { id: "s", label: "Enviadas por dia", value: sum(sent) / days, format: "decimal" },
        { id: "l", label: "Lidas por dia", value: (sum(recv) / days) * 0.93, format: "decimal" },
        { id: "f", label: "Falhas por dia", value: 0.4, format: "decimal" },
        { id: "t", label: "Conversas", value: CONVERSATIONS.length, format: "integer" },
        { id: "rt", label: "Tempo de resposta (mediana)", value: 7, format: "integer", hint: "Minutos" },
      ]} />
      <ChartContainer title="Mensagens por dia" subtitle="Recebidas e enviadas" legend={<ChartLegend items={[{ id: "r", label: "Recebidas", color: "var(--series-1)" }, { id: "s", label: "Enviadas", color: "var(--series-3)" }]} />}>
        <div className="h-[240px]"><ResponsiveContainer><LineChart data={combined} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><CartesianGrid {...gridProps} /><XAxis dataKey="date" {...axisProps} tickFormatter={(d: Date) => formatDateShort(d)} minTickGap={28} /><YAxis {...axisProps} width={36} /><RTooltip content={<ChartTooltip format="integer" labelFormatter={(l) => formatDateShort(l as unknown as Date)} names={{ recebidas: "Recebidas", enviadas: "Enviadas" }} />} /><Line dataKey="recebidas" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} /><Line dataKey="enviadas" stroke="var(--series-3)" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
      </ChartContainer>
      <section className="panel overflow-hidden">
        <header className="px-4 pb-3 pt-4"><h3 className="t-title">Contas com mais volume</h3></header>
        <DataTable caption="Contas" rows={accounts} getId={(a) => a.acc} footerRow
          columns={[
            { id: "a", header: "Conta", sticky: true, cell: (a) => <span className="font-semibold">{a.acc}</span>, footer: "Total" },
            { id: "r", header: "Recebidas", align: "right", sortValue: (a) => a.recv, cell: (a) => formatValue(a.recv, "integer"), footer: formatValue(accounts.reduce((x, a) => x + a.recv, 0), "integer") },
            { id: "s", header: "Enviadas", align: "right", sortValue: (a) => a.sent, cell: (a) => formatValue(a.sent, "integer"), footer: formatValue(accounts.reduce((x, a) => x + a.sent, 0), "integer") },
            { id: "c", header: "Conversas", align: "right", sortValue: (a) => a.conv, cell: (a) => formatValue(a.conv, "integer"), footer: formatValue(accounts.reduce((x, a) => x + a.conv, 0), "integer") },
            { id: "t", header: "Resposta", align: "right", cell: (a) => a.resp },
          ]} />
      </section>
    </Page>
  );
}

/* ------------------------------------------------------------------ Site */
export function AnalyticsWebsite() {
  return (
    <Page>
      <PageHeader title="Análises do site" />
      <div className="panel"><EmptyState icon={<Globe />} title="Nenhuma propriedade do Google Analytics conectada" description="Conecte uma propriedade GA4 para ver o tráfego do site ao lado dos números das redes."
        actions={<Tooltip content="Requer integração com o Google"><span tabIndex={0}><Button variant="primary" disabled>Conectar Google Analytics</Button></span></Tooltip>} /></div>
    </Page>
  );
}
