import { CalendarDays, Filter, LayoutGrid, List, ListChecks, MoreHorizontal, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { POSTS, QUEUES, CHANNELS, type Post, type PostStatus } from "@/data/demo/extra";
import { TODAY } from "@/data/demo";
import { formatDateLong, formatDateTime, formatValue } from "@/lib/format";
import { useLocalState } from "@/lib/useLocalState";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Button, IconButton } from "@/components/ui/Button";
import { Count, StatusBadge, Tag } from "@/components/ui/Badge";
import { Menu, MenuContent, MenuItem, MenuTrigger, MultiSelect, Select } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { DemoBadge, EmptyState } from "@/components/feedback/States";
import { DataTable, type Column } from "@/components/data/DataTable";
import { ListScreen } from "@/components/templates/ListScreen";

const STATUS_TONE: Record<PostStatus, "positive" | "info" | "neutral" | "negative" | "warning"> = { Publicada: "positive", Agendada: "info", Rascunho: "neutral", Falhou: "negative", "Aguardando aprovação": "warning" };
const SORTS = [
  { value: "agendadas-desc", label: "Agendadas (mais novas)" },
  { value: "agendadas-asc", label: "Agendadas (mais antigas)" },
  { value: "criadas-desc", label: "Publicadas recentemente" },
];

function PostCard({ p }: { p: Post }) {
  return (
    <article className="panel flex flex-col gap-3 p-4 transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between gap-2"><StatusBadge tone={STATUS_TONE[p.status]}>{p.status}</StatusBadge>
        <Menu><MenuTrigger asChild><IconButton label="Ações da publicação" size="sm"><MoreHorizontal /></IconButton></MenuTrigger><MenuContent align="end"><MenuItem disabled>Editar</MenuItem><MenuItem disabled>Duplicar</MenuItem><MenuItem danger disabled>Excluir</MenuItem></MenuContent></Menu>
      </div>
      <p className="line-clamp-3 text-body">{p.text}</p>
      <div className="flex flex-wrap gap-1">{p.channels.map((c) => <Tag key={c}>{c}</Tag>)}</div>
      <div className="mt-auto flex items-center justify-between border-t border-line-soft pt-3">
        <span className="num t-caption">{formatDateTime(p.at)}</span>
        {p.metrics ? <span className="num t-caption">{formatValue(p.metrics.likes, "compact")} curtidas · {formatValue(p.metrics.reach, "compact")} alcance</span> : <span className="t-caption">{p.profile}</span>}
      </div>
    </article>
  );
}

function CalendarView({ posts }: { posts: Post[] }) {
  const start = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  const offset = (start.getDay() + 6) % 7;
  const days = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => i - offset + 1);
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(start);
  return (
    <section className="panel overflow-hidden">
      <header className="border-b border-line px-4 py-3 t-title capitalize">{month}</header>
      <div className="grid grid-cols-7 border-b border-line bg-surface-2">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <span key={d} className="t-label px-2 py-2 text-center">{d}</span>)}</div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const inMonth = d >= 1 && d <= days;
          const date = new Date(TODAY.getFullYear(), TODAY.getMonth(), d);
          const items = inMonth ? posts.filter((p) => p.at.toDateString() === date.toDateString()) : [];
          const today = inMonth && date.toDateString() === TODAY.toDateString();
          return (
            <div key={i} className={cn("min-h-[96px] border-b border-r border-line-soft p-1.5", !inMonth && "bg-surface-2", today && "bg-accent-tint")}>
              {inMonth && <span className={cn("num text-caption font-bold", today ? "text-accent-text" : "text-text-dim")}>{d}</span>}
              <div className="mt-1 flex flex-col gap-1">{items.slice(0, 3).map((p) => <span key={p.id} title={p.text} className="truncate rounded-xs border-l-2 border-accent bg-surface px-1.5 py-0.5 text-[11px] font-semibold">{p.text}</span>)}{items.length > 3 && <span className="t-caption">+{items.length - 3}</span>}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PostsAll() {
  const toast = useToast();
  const [view, setView] = useLocalState<"grade" | "lista" | "calendario">("ninepro.posts.view", "grade");
  const [cols, setCols] = useLocalState<"2" | "3" | "4" | "5">("ninepro.posts.cols", "3");
  const [sort, setSort] = useState("agendadas-desc");
  const [status, setStatus] = useState<string[]>([]);
  const [ch, setCh] = useState<string[]>([]);
  const rows = useMemo(() => POSTS.filter((p) => (!status.length || status.includes(p.status)) && (!ch.length || p.channels.some((c) => ch.includes(c))))
    .sort((a, b) => (sort === "agendadas-asc" ? a.at.getTime() - b.at.getTime() : b.at.getTime() - a.at.getTime())), [status, ch, sort]);
  const columns: Column<Post>[] = [
    { id: "t", header: "Publicação", sticky: true, cell: (p) => <span className="block max-w-[420px] truncate font-semibold">{p.text}</span> },
    { id: "st", header: "Status", cell: (p) => <StatusBadge tone={STATUS_TONE[p.status]}>{p.status}</StatusBadge> },
    { id: "ch", header: "Canais", cell: (p) => <div className="flex gap-1">{p.channels.map((c) => <Tag key={c}>{c}</Tag>)}</div> },
    { id: "pr", header: "Perfil", cell: (p) => <span className="text-text-soft">{p.profile}</span> },
    { id: "at", header: "Data", align: "right", sortValue: (p) => p.at.getTime(), cell: (p) => <span className="text-text-soft">{formatDateTime(p.at)}</span> },
  ];
  const grid = { "2": "md:grid-cols-2", "3": "md:grid-cols-2 xl:grid-cols-3", "4": "md:grid-cols-3 xl:grid-cols-4", "5": "md:grid-cols-3 xl:grid-cols-5" }[cols];
  return (
    <Page>
      <PageHeader meta={<DemoBadge />} title={<span className="inline-flex items-center gap-3">Todas as publicações <Count>{rows.length}</Count></span>} description="Agende, acompanhe e reaproveite publicações em todos os canais."
        actions={<Button variant="primary" icon={<Plus />} onClick={() => toast({ tone: "info", title: "Nova publicação", description: "Publicar exige um canal conectado em Conexões." })}>Nova publicação</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect label="Status" size="sm" icon={<Filter />} value={status} onValueChange={setStatus} options={Object.keys(STATUS_TONE).map((s) => ({ value: s, label: s }))} />
        <MultiSelect label="Canal" size="sm" value={ch} onValueChange={setCh} options={CHANNELS.map((c) => ({ value: c, label: c }))} />
        <Select size="sm" className="w-[240px]" ariaLabel="Ordenar" prefix={<span className="t-caption">Ordenar:</span>} value={sort} onValueChange={setSort} options={SORTS} />
        <span className="flex-1" />
        <SegmentedControl ariaLabel="Visualização" size="sm" value={view} onValueChange={setView} options={[{ value: "grade", label: "", icon: <LayoutGrid />, title: "Grade" }, { value: "lista", label: "", icon: <List />, title: "Lista" }, { value: "calendario", label: "", icon: <CalendarDays />, title: "Calendário" }]} />
        {view === "grade" && <SegmentedControl ariaLabel="Colunas" size="sm" value={cols} onValueChange={setCols} options={(["2", "3", "4", "5"] as const).map((c) => ({ value: c, label: c }))} />}
      </div>
      {rows.length === 0 ? <div className="panel"><EmptyState icon={<LayoutGrid />} title="Nenhuma publicação" description="Ajuste os filtros ou crie uma publicação." /></div>
        : view === "grade" ? <div className={cn("grid grid-cols-1 gap-gutter", grid)}>{rows.map((p) => <PostCard key={p.id} p={p} />)}</div>
        : view === "lista" ? <section className="panel overflow-hidden"><DataTable caption="Publicações" rows={rows} columns={columns} getId={(p) => p.id} /></section>
        : <CalendarView posts={rows} />}
    </Page>
  );
}

export function PostsQueues() {
  const toast = useToast();
  type Q = (typeof QUEUES)[number];
  return (
    <ListScreen<Q> title="Filas" description="Horários fixos por perfil. Ao criar uma publicação, escolha “Fila” para ela entrar no próximo horário livre."
      rows={QUEUES} getId={(q) => q.id}
      filters={[{ id: "p", label: "Perfil", options: [{ value: "Loja Aurora", label: "Loja Aurora" }, { value: "Aurora Outlet", label: "Aurora Outlet" }], match: (q, v) => q.profile === v }]}
      actions={<Button variant="primary" icon={<Plus />} onClick={() => toast({ tone: "info", title: "Criar fila (demonstração)" })}>Criar fila</Button>}
      columns={[
        { id: "p", header: "Perfil", sticky: true, cell: (q) => <span className="font-semibold">{q.profile}</span> },
        { id: "n", header: "Fila", cell: (q) => q.name },
        { id: "s", header: "Horários", cell: (q) => <div className="flex flex-wrap gap-1">{q.slots.map((s) => <Tag key={s}>{s}</Tag>)}</div> },
        { id: "next", header: "Próximo horário", cell: (q) => <span className="num text-text-soft">{formatDateLong(q.next)}</span> },
        { id: "st", header: "Status", cell: (q) => <StatusBadge tone="positive">{q.status}</StatusBadge> },
      ]}
      empty={{ icon: <ListChecks />, title: "Nenhuma fila configurada", description: "Nenhuma publicação na fila." }} />
  );
}
