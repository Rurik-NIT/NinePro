import { Check, Code2, Copy, Globe, Plus, Radar, RefreshCw, ScrollText, Send, Store, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { CONV_EVENTS, OTHER_SOURCES, TRACKED_SITES, type ConvEvent } from "@/data/demo/extra";
import { PLATFORMS, PLATFORM_ORDER } from "@/data/demo";
import { formatDateTime, formatValue } from "@/lib/format";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Button, IconButton } from "@/components/ui/Button";
import { Count, StatusBadge, Tag } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { Select, Tooltip } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { DemoBadge, EmptyState } from "@/components/feedback/States";
import { DataTable, TableToolbar, type Column } from "@/components/data/DataTable";
import { KpiStrip } from "@/components/data/Metrics";
import { PlatformDot, PlatformLabel } from "@/components/data/Platform";
import { ListScreen } from "@/components/templates/ListScreen";

const PERIOD = [{ value: "7", label: "Últimos 7 dias" }, { value: "30", label: "Últimos 30 dias" }, { value: "90", label: "Últimos 90 dias" }];
const tone = (s: ConvEvent["status"]) => (s === "Aceito" ? "positive" : s === "Parcial" ? "warning" : "negative");

/* ------------------------------------------------------------------ Visão geral */
export function ConversionsOverview() {
  const [period, setPeriod] = useState("7");
  const [wizard, setWizard] = useState(false);
  const since = Date.now() - Number(period) * 86_400_000;
  const ev = CONV_EVENTS.filter((e) => e.receivedAt.getTime() >= since);
  const purchases = ev.filter((e) => e.type === "Compra");
  const accepted = ev.filter((e) => e.status === "Aceito").length;
  return (
    <Page>
      <PageHeader meta={<DemoBadge />} title="Conversões" description="Toda venda e lead contados nos anúncios: onde acontecem, a tag no site e as plataformas que recebem os eventos."
        actions={<><Select className="w-[180px]" ariaLabel="Período" value={period} onValueChange={setPeriod} options={PERIOD} /><Button variant="primary" icon={<Radar />} onClick={() => setWizard(true)}>Configurar rastreamento</Button></>} />
      <KpiStrip hero={false} items={[
        { id: "e", label: "Eventos recebidos", value: ev.length, format: "integer" },
        { id: "p", label: "Compras", value: purchases.length, format: "integer" },
        { id: "v", label: "Valor das compras", value: purchases.reduce((a, e) => a + e.value, 0), format: "currency" },
        { id: "a", label: "Aceitos pelas plataformas", value: ev.length ? accepted / ev.length : NaN, format: "percent" },
        { id: "s", label: "Fontes ativas", value: TRACKED_SITES.filter((s) => s.status === "Ativo").length, format: "integer" },
        { id: "d", label: "Destinos", value: 2, format: "integer" },
      ]} />
      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
        {[
          { n: 1, icon: <Store />, t: "Onde as vendas acontecem", d: "Loja virtual, pagamentos, CRM ou o seu backend.", done: true },
          { n: 2, icon: <Code2 />, t: "A tag no seu site", d: "Registra visitas e eventos com primeira parte.", done: true },
          { n: 3, icon: <Send />, t: "Para onde enviamos", d: "Meta, Google e as plataformas que você já conectou.", done: false },
        ].map((s) => (
          <div key={s.n} className="panel flex gap-3 p-4">
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-md font-mono text-[12px] font-bold", s.done ? "bg-accent text-accent-ink" : "bg-soft text-text-muted")}>{s.done ? <Check className="size-4" /> : s.n}</span>
            <div className="flex flex-col gap-1"><span className="t-title">{s.t}</span><span className="t-secondary">{s.d}</span></div>
          </div>
        ))}
      </div>
      <TrackingWizard open={wizard} onOpenChange={setWizard} />
    </Page>
  );
}

function TrackingWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [site, setSite] = useState("");
  const snippet = `<script async src="https://t.ninepro.app/tag.js" data-site="${site || "seusite.com.br"}"></script>`;
  const steps = ["Fonte das vendas", "Tag no site", "Destinos"];
  return (
    <Modal open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setStep(0); }} size="lg" icon={<Radar />} title="Configurar rastreamento de conversões" description="Três passos. Usamos o que você já conectou."
      footer={<><Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Voltar</Button><span className="flex-1" />
        {step < 2 ? <Button variant="primary" onClick={() => setStep(step + 1)}>Continuar</Button> : <Button variant="primary" onClick={() => { toast({ tone: "success", title: "Rastreamento configurado (demonstração)", description: "Nenhum evento real será enviado sem integração." }); onOpenChange(false); setStep(0); }}>Concluir</Button>}</>}>
      <ol className="mb-5 flex gap-2">{steps.map((s, i) => <li key={s} className={cn("flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-secondary font-semibold", i === step ? "border-accent-line-strong bg-accent-tint" : "border-line text-text-muted")}><span className="num font-mono text-[11px]">{String(i + 1).padStart(2, "0")}</span>{s}</li>)}</ol>
      {step === 0 && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{["Loja virtual", "Pagamentos", "CRM", "Meu backend (API)"].map((s, i) => <label key={s} className="flex cursor-pointer items-center gap-3 rounded-md border border-line p-3 hover:border-line-strong"><input type="radio" name="src" defaultChecked={i === 0} className="accent-[var(--accent)]" /><span className="text-body font-semibold">{s}</span></label>)}</div>}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <Field label="Endereço do site">{(p) => <Input {...p} value={site} onChange={(e) => setSite(e.target.value)} prefix={<Globe />} placeholder="seusite.com.br" />}</Field>
          <div className="flex flex-col gap-1.5"><span className="text-secondary font-semibold text-text-soft">Cole antes de &lt;/head&gt;</span>
            <div className="flex items-start gap-2 rounded-md border border-line bg-surface-2 p-3"><code className="flex-1 break-all font-mono text-[12px] text-text-soft">{snippet}</code><IconButton label="Copiar código" size="sm" onClick={() => navigator.clipboard?.writeText(snippet).then(() => toast({ tone: "info", title: "Código copiado" }), () => undefined)}><Copy /></IconButton></div>
          </div>
        </div>
      )}
      {step === 2 && <ul className="flex flex-col gap-2">{PLATFORM_ORDER.map((p) => <li key={p} className="flex items-center justify-between rounded-md border border-line p-3"><PlatformLabel id={p} /><Tag>Requer conexão</Tag></li>)}</ul>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ Eventos */
export function ConversionEvents() {
  const [source, setSource] = useState("todas");
  const [type, setType] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [loading, setLoading] = useState(false);
  const rows = useMemo(() => CONV_EVENTS.filter((e) => (source === "todas" || e.source === source) && (type === "todos" || e.type === type) && (status === "todos" || e.status === status)), [source, type, status]);
  const cols: Column<ConvEvent>[] = [
    { id: "type", header: "Evento", sticky: true, sortValue: (e) => e.type, cell: (e) => <div className="flex flex-col"><span className="font-semibold">{e.type}</span><span className="t-caption font-mono">{e.id}</span></div> },
    { id: "source", header: "Fonte", sortValue: (e) => e.source, cell: (e) => <span className="text-text-soft">{e.source}</span> },
    { id: "sent", header: "Enviado para", cell: (e) => <div className="flex items-center gap-2"><span className="flex gap-1">{e.sentTo.map((p) => <Tooltip key={p} content={PLATFORMS[p].label}><span><PlatformDot id={p} /></span></Tooltip>)}</span><StatusBadge tone={tone(e.status)}>{e.status}</StatusBadge></div> },
    { id: "page", header: "Página", cell: (e) => <span className="font-mono text-[12px] text-text-soft">{e.page}</span> },
    { id: "campaign", header: "Campanha", cell: (e) => <span className="max-w-[220px] truncate text-text-soft">{e.campaign}</span> },
    { id: "value", header: "Valor", align: "right", sortValue: (e) => e.value, cell: (e) => (e.value ? formatValue(e.value, "currency") : "—") },
    { id: "at", header: "Recebido", align: "right", sortValue: (e) => e.receivedAt.getTime(), cell: (e) => <span className="text-text-soft">{formatDateTime(e.receivedAt)}</span> },
  ];
  const opts = (vals: string[], all: string) => [{ value: all === "todas" ? "todas" : "todos", label: all === "todas" ? "Todas" : "Todos" }, ...vals.map((v) => ({ value: v, label: v }))];
  return (
    <Page>
      <PageHeader meta={<DemoBadge />} title={<span className="inline-flex items-center gap-3">Eventos <Count>{rows.length}</Count></span>} description="Compras, leads, negócios e pagamentos aparecem segundos depois de acontecer, com a resposta de cada plataforma." />
      <section className="panel overflow-hidden">
        <TableToolbar actions={<IconButton label="Atualizar" variant="outline" size="sm" onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 600); }}><RefreshCw className={loading ? "animate-spin" : ""} /></IconButton>}>
          <Select size="sm" className="w-[190px]" ariaLabel="Fonte" prefix={<span className="t-caption">Fonte:</span>} value={source} onValueChange={setSource} options={opts(["Site (tag)", "Loja virtual", "Pagamentos", "CRM", "API"], "todas")} />
          <Select size="sm" className="w-[210px]" ariaLabel="Evento" prefix={<span className="t-caption">Evento:</span>} value={type} onValueChange={setType} options={opts(["Compra", "Lead", "Cadastro", "Início de checkout", "Negócio ganho"], "todos")} />
          <Select size="sm" className="w-[170px]" ariaLabel="Status" prefix={<span className="t-caption">Status:</span>} value={status} onValueChange={setStatus} options={opts(["Aceito", "Parcial", "Rejeitado"], "todos")} />
        </TableToolbar>
        <DataTable caption="Eventos de conversão" rows={rows} columns={cols} getId={(e) => e.id} loading={loading} defaultSort={{ id: "at", dir: "desc" }} className="max-h-[calc(100dvh-300px)]"
          empty={<EmptyState icon={<ScrollText />} title="Aguardando o primeiro evento" description="Assim que uma fonte enviar uma conversão, ela aparece aqui com o retorno de cada plataforma." />} />
      </section>
    </Page>
  );
}

/* ------------------------------------------------------------------ Destinos */
export function ConversionDestinations() {
  const [period, setPeriod] = useState("7");
  return (
    <Page>
      <PageHeader meta={<DemoBadge />} title="Destinos" description="Plataformas de anúncio que recebem os eventos de conversão para otimizar a entrega."
        actions={<><Select className="w-[180px]" ariaLabel="Período" value={period} onValueChange={setPeriod} options={PERIOD} /><Tooltip content="Requer integração"><span tabIndex={0}><Button variant="primary" icon={<Plus />} disabled>Conectar plataforma</Button></span></Tooltip></>} />
      <section className="panel overflow-hidden">
        <div className="t-label border-b border-line bg-surface-2 px-4 py-2.5">Plataformas de anúncio</div>
        <ul className="divide-y divide-line-soft">
          {PLATFORM_ORDER.map((p, i) => {
            const sent = CONV_EVENTS.filter((e) => e.sentTo.includes(p)).length;
            return (
              <li key={p} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                <span className="grid size-9 place-items-center rounded-md border border-line bg-surface-2"><PlatformDot id={p} className="size-3" /></span>
                <div className="flex min-w-[180px] flex-1 flex-col"><span className="text-body font-semibold">{PLATFORMS[p].label}</span><span className="t-caption">{i < 2 ? "API de conversões" : "Não configurado"}</span></div>
                <div className="flex flex-col items-end"><span className="num text-body font-bold">{i < 2 ? formatValue(sent, "integer") : "—"}</span><span className="t-caption">eventos no período</span></div>
                <StatusBadge tone={i < 2 ? "positive" : "neutral"}>{i < 2 ? "Recebendo" : "Desconectado"}</StatusBadge>
              </li>
            );
          })}
        </ul>
      </section>
    </Page>
  );
}

/* ------------------------------------------------------------------ Fontes */
export function ConversionSources() {
  const toast = useToast();
  type Site = (typeof TRACKED_SITES)[number];
  return (
    <ListScreen<Site>
      title="Fontes" description="Sites rastreados e outras origens de conversão."
      rows={TRACKED_SITES} getId={(s) => s.id} searchText={(s) => s.site} searchPlaceholder="Buscar sites"
      filters={[
        { id: "st", label: "Status", options: [{ value: "Ativo", label: "Ativo" }, { value: "Sem eventos", label: "Sem eventos" }], match: (s, v) => s.status === v },
        { id: "via", label: "Instalação", options: [{ value: "Loja virtual", label: "Loja virtual" }, { value: "Tag manual", label: "Tag manual" }], match: (s, v) => s.via === v },
      ]}
      actions={<Button variant="primary" icon={<Plus />} onClick={() => toast({ tone: "info", title: "Adicionar site", description: "Use “Configurar rastreamento” em Conversões › Visão geral." })}>Adicionar site</Button>}
      columns={[
        { id: "site", header: "Site", sticky: true, sortValue: (s) => s.site, cell: (s) => <span className="flex items-center gap-2 font-semibold"><Globe className="size-4 text-text-dim" />{s.site}</span> },
        { id: "via", header: "Instalado via", cell: (s) => <Tag>{s.via}</Tag> },
        { id: "st", header: "Status", cell: (s) => <StatusBadge tone={s.status === "Ativo" ? "positive" : "warning"}>{s.status}</StatusBadge> },
        { id: "v", header: "Visitas hoje", align: "right", sortValue: (s) => s.visitsToday, cell: (s) => formatValue(s.visitsToday, "integer") },
        { id: "sub", header: "Subdomínio", cell: (s) => <span className="font-mono text-[12px] text-text-soft">{s.subdomain}</span> },
        { id: "last", header: "Última visita", align: "right", cell: (s) => <span className="text-text-soft">{formatDateTime(s.lastVisit)}</span> },
      ]}
      empty={{ icon: <Globe />, title: "Nenhum site rastreado", description: "Ative uma loja conectada com um clique ou adicione qualquer site pelo endereço." }}
      after={
        <section className="panel overflow-hidden">
          <div className="t-label border-b border-line bg-surface-2 px-4 py-2.5">Outras fontes</div>
          <ul className="divide-y divide-line-soft">
            {OTHER_SOURCES.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-8 place-items-center rounded-md bg-surface-2 text-text-muted"><Target className="size-4" /></span>
                <div className="flex flex-1 flex-col"><span className="text-body font-semibold">{s.name}</span><span className="t-caption">{s.kind}</span></div>
                <Tooltip content="Requer integração"><span tabIndex={0}><Button size="sm" icon={<Plus />} disabled>Conectar</Button></span></Tooltip>
              </li>
            ))}
            <li className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-8 place-items-center rounded-md bg-surface-2 text-text-muted"><Code2 className="size-4" /></span>
              <div className="flex flex-1 flex-col"><span className="text-body font-semibold">Seu backend</span><span className="t-caption font-mono">POST /v1/eventos</span></div>
              <Button size="sm" onClick={() => toast({ tone: "info", title: "Guia da API de eventos", description: "Documentação chega com a API pública do NinePro." })}>Ler o guia</Button>
            </li>
          </ul>
        </section>
      }
    />
  );
}

