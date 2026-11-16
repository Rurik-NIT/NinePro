import { Bell, Copy, Download, Inbox, MoreHorizontal, Pause, Pencil, Plus, Search, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatValue } from "@/lib/format";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { LogoMark, Logo } from "@/components/layout/Logo";
import { Button, IconButton } from "@/components/ui/Button";
import { Avatar, Count, Kbd, StatusBadge, Tag } from "@/components/ui/Badge";
import { Checkbox, RadioGroup, Switch } from "@/components/ui/Controls";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/Dialog";
import { DatePicker, DateRangePicker, RANGE_PRESETS, type Range } from "@/components/ui/DatePicker";
import { Field, Input, SearchInput, Textarea } from "@/components/ui/Input";
import { ContextMenu, Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuTrigger, MultiSelect, Select, Tooltip } from "@/components/ui/Menu";
import { SegmentedControl, TabPanel, Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { DemoBadge, EmptyState, ErrorState, InlineNotice, LoadingState, Skeleton, SuccessState } from "@/components/feedback/States";
import { Delta, KpiStrip, MetricCard, Progress, Sparkline } from "@/components/data/Metrics";
import { DataTable, TableToolbar, type Column } from "@/components/data/DataTable";
import { ChartContainer, ChartLegend } from "@/components/charts/Chart";

const SECTIONS = [
  ["fundamentos", "Fundamentos"], ["cores", "Cores"], ["tipografia", "Tipografia"], ["espaco", "Espaço e forma"],
  ["acoes", "Ações"], ["formularios", "Formulários"], ["overlays", "Sobreposições"], ["navegacao", "Navegação"],
  ["dados", "Dados"], ["graficos", "Gráficos"], ["estados", "Estados"], ["temas", "Temas lado a lado"],
] as const;

function Block({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-16 flex-col gap-4">
      <div className="flex flex-col gap-1 border-b border-line pb-3">
        <h2 className="t-headline">{title}</h2>
        {description && <p className="t-secondary max-w-[720px]">{description}</p>}
      </div>
      {children}
    </section>
  );
}
function Specimen({ label, children, className, note }: { label: string; children: ReactNode; className?: string; note?: string }) {
  return (
    <div className={cn("panel flex flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5"><span className="t-label">{label}</span>{note && <span className="t-caption">{note}</span>}</div>
      <div className="flex flex-1 flex-wrap items-center gap-3 p-4">{children}</div>
    </div>
  );
}

const COLOR_GROUPS: [string, [string, string][]][] = [
  ["Superfícies", [["canvas", "Fundo atrás de tudo"], ["surface", "Sidebar, painéis, popovers"], ["surface-2", "Cabeçalho de tabela, segmented"], ["raised", "Cards sobre painéis"], ["soft", "Hover, botão secundário"], ["overlay", "Menus e modais"]]],
  ["Linhas", [["line", "Bordas de painel, divisores"], ["line-soft", "Regras internas de tabela"], ["line-strong", "Checkbox, radio, dropzone"]]],
  ["Texto", [["text", "Títulos e números"], ["text-soft", "Corpo e linhas de tabela"], ["text-muted", "Rótulos e secundários"], ["text-dim", "Legendas e placeholders"]]],
  ["Acento Volt", [["accent", "A próxima ação — uma por tela"], ["accent-text", "Acento como texto (escurece no claro)"], ["accent-tint", "Seleção, dia atual, linha marcada"], ["accent-line", "Borda de controle ativo"]]],
  ["Sinais", [["positive", "Variações boas, dinheiro confirmado"], ["negative", "Falhas, quedas, destrutivo"], ["warning", "Atenção, ritmo acima"], ["info", "Informativo, aprendizado"]]],
  ["Séries de gráfico", [["series-1", "Meta Ads"], ["series-2", "Google Ads"], ["series-3", "TikTok Ads"], ["series-4", "LinkedIn Ads"], ["series-5", "Série 5"], ["series-6", "Série 6"]]],
];

const TYPE: [string, string, string, string][] = [
  ["Display", "t-display text-display-lg", "32 / 700", "Títulos de página"],
  ["Headline", "t-headline", "18 / 650", "Seções dentro da página"],
  ["Title", "t-title", "15 / 650", "Painéis, cards, modais"],
  ["Body", "t-body", "14 / 500", "Texto de interface padrão"],
  ["Secondary", "t-secondary", "13 / 500", "Descrições, metadados"],
  ["Caption", "t-caption", "12 / 500", "Legendas, contadores"],
  ["Label", "t-label", "11 / Mono 500", "Cabeçalhos de tabela, rótulos de KPI"],
];

interface DemoRow { id: string; name: string; status: "active" | "paused" | "learning"; spend: number; ctr: number; roas: number }
const DEMO_ROWS: DemoRow[] = [
  { id: "1", name: "Prospecção ampla", status: "active", spend: 18420.5, ctr: 0.0182, roas: 4.12 },
  { id: "2", name: "Remarketing 7 dias", status: "active", spend: 6230, ctr: 0.0291, roas: 6.4 },
  { id: "3", name: "Lançamento coleção", status: "learning", spend: 9110.2, ctr: 0.0094, roas: 1.8 },
  { id: "4", name: "Pesquisa — concorrentes", status: "paused", spend: 2840, ctr: 0.0412, roas: 2.2 },
];

export default function DesignSystem() {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [check, setCheck] = useState(true);
  const [sw, setSw] = useState(true);
  const [radio, setRadio] = useState("diario");
  const [sel, setSel] = useState("performance");
  const [multi, setMulti] = useState<string[]>(["meta"]);
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [range, setRange] = useState<Range>(RANGE_PRESETS[4].get());
  const [preset, setPreset] = useState<string | undefined>("30d");
  const [tab, setTab] = useState("a");
  const [seg, setSeg] = useState<"d" | "s" | "m">("d");
  const [loadingBtn, setLoadingBtn] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(["2"]));
  const [col, setCol] = useState(true);

  const cols: Column<DemoRow>[] = [
    { id: "name", header: "Campanha", sortValue: (r) => r.name, cell: (r) => <span className="font-semibold">{r.name}</span> },
    { id: "status", header: "Status", cell: (r) => <StatusBadge tone={r.status === "active" ? "positive" : r.status === "learning" ? "info" : "neutral"}>{r.status === "active" ? "Ativa" : r.status === "learning" ? "Em aprendizado" : "Pausada"}</StatusBadge> },
    { id: "spend", header: "Investimento", align: "right", sortValue: (r) => r.spend, cell: (r) => formatValue(r.spend, "currency"), footer: formatValue(36600.7, "currency") },
    { id: "ctr", header: "CTR", align: "right", sortValue: (r) => r.ctr, cell: (r) => formatValue(r.ctr, "percent") },
    { id: "roas", header: "ROAS", align: "right", sortValue: (r) => r.roas, cell: (r) => formatValue(r.roas, "ratio") },
  ];

  return (
    <Page className="gap-10">
      <PageHeader title="Design System" meta={<><Tag tone="accent">v0.1</Tag><Tag>Fundação</Tag></>}
        description="Biblioteca viva do NinePro. Cada peça aqui é o mesmo componente usado nas telas — alternar o tema no topo muda tudo de uma vez." />

      <nav aria-label="Seções do Design System" className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto border-b border-line bg-canvas px-1 py-2">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-sm px-2.5 py-1.5 text-secondary font-semibold text-text-muted transition-colors hover:bg-soft hover:text-text">{label}</a>
        ))}
      </nav>

      <Block id="fundamentos" title="Fundamentos" description="Precisão, controle e clareza. Profundidade por camadas de superfície, acento usado com intenção, números sempre tabulares.">
        <div className="grid grid-cols-1 gap-gutter md:grid-cols-3">
          <div className="panel flex flex-col gap-4 p-5"><Logo /><p className="t-secondary">O “9” é uma retícula: mira, alvo, controle. Funciona sozinho como ícone (16–32px).</p><div className="flex items-end gap-3"><LogoMark size={16} /><LogoMark size={24} /><LogoMark size={32} /><LogoMark size={44} /></div></div>
          <div className="panel flex flex-col gap-2 p-5"><span className="t-label">Princípio</span><p className="t-title">Uma ação primária por área</p><p className="t-secondary">O Volt marca a próxima ação, a seleção e o “agora”. Nunca decora.</p><div className="mt-2 flex gap-2"><Button variant="primary" size="sm">Ação</Button><Button size="sm">Secundária</Button></div></div>
          <div className="panel flex flex-col gap-2 p-5"><span className="t-label">Princípio</span><p className="t-title">Números primeiro</p><p className="t-secondary">Algarismos tabulares, alinhamento à direita e deltas com ícone + sinal — legíveis sem cor.</p><div className="mt-2 flex items-baseline gap-2"><span className="num text-kpi font-bold">R$ 48.210,90</span><Delta current={110} previous={100} /></div></div>
        </div>
      </Block>

      <Block id="cores" title="Cores" description="Tokens semânticos — os componentes nunca usam valores brutos. Cada token tem valor próprio no tema claro e no escuro.">
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
          {COLOR_GROUPS.map(([group, tokens]) => (
            <div key={group} className="panel overflow-hidden">
              <div className="border-b border-line-soft px-4 py-2.5"><span className="t-label">{group}</span></div>
              <ul className="divide-y divide-line-soft">
                {tokens.map(([t, use]) => (
                  <li key={t} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="size-8 shrink-0 rounded-md ring-1 ring-line" style={{ background: `var(--${t})` }} />
                    <code className="w-28 shrink-0 font-mono text-[12px] text-text">--{t}</code>
                    <span className="t-secondary">{use}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Block>

      <Block id="tipografia" title="Tipografia" description="Manrope para interface e números (tnum); IBM Plex Mono para rótulos técnicos em caixa alta.">
        <div className="panel divide-y divide-line-soft">
          {TYPE.map(([name, cls, spec, use]) => (
            <div key={name} className="grid grid-cols-1 items-baseline gap-2 px-5 py-4 md:grid-cols-[160px_1fr_220px]">
              <div className="flex flex-col"><span className="text-body font-bold">{name}</span><span className="num t-caption">{spec}</span></div>
              <span className={cls}>{name === "Label" ? "Investimento · CTR · ROAS" : "Campanhas que pagam a conta"}</span>
              <span className="t-secondary">{use}</span>
            </div>
          ))}
          <div className="grid grid-cols-1 items-baseline gap-2 px-5 py-4 md:grid-cols-[160px_1fr_220px]">
            <div className="flex flex-col"><span className="text-body font-bold">KPI</span><span className="num t-caption">34 · 26 / 700 tnum</span></div>
            <span className="flex items-baseline gap-4"><span className="num text-kpi-lg font-bold">R$ 1.132.020,59</span><span className="num text-kpi font-bold">3,92×</span></span>
            <span className="t-secondary">Indicadores e valores financeiros</span>
          </div>
        </div>
      </Block>

      <Block id="espaco" title="Espaço e forma" description="Base 4px. Gutter de 12px entre moldura, navegação e painéis. Raios crescem com o tamanho do objeto.">
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
          <Specimen label="Espaçamento">
            {[2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48].map((s) => (
              <div key={s} className="flex flex-col items-center gap-1.5"><span className="block w-3 rounded-[2px] bg-accent" style={{ height: s }} /><span className="num font-mono text-[10.5px] text-text-muted">{s}</span></div>
            ))}
          </Specimen>
          <Specimen label="Raios">
            {[["xs", 4, "Checkbox"], ["sm", 6, "Controles 28"], ["md", 8, "Inputs, botões"], ["lg", 12, "Cards, painéis"], ["xl", 16, "Modais"], ["full", 999, "Chips"]].map(([n, r, u]) => (
              <div key={String(n)} className="flex flex-col items-center gap-1.5"><span className="size-12 border border-line-strong bg-surface-2" style={{ borderRadius: Number(r) }} /><span className="font-mono text-[10.5px] text-text-muted">{n}</span><span className="t-caption">{u}</span></div>
            ))}
          </Specimen>
          <Specimen label="Alturas de controle">
            <Button size="sm">28 · sm</Button><Button>32 · md</Button><Button size="lg">40 · lg</Button>
          </Specimen>
          <Specimen label="Estrutura">
            <div className="grid w-full grid-cols-3 gap-2 font-mono text-[11px] text-text-muted">
              {[["Sidebar", "248 / 64"], ["Header", "56"], ["Linha de tabela", "44 / 36"], ["Gutter", "12"], ["Conteúdo máx.", "1600"], ["Breakpoints", "640 · 768 · 1024 · 1280 · 1536"]].map(([k, v]) => (
                <div key={k} className="rounded-md bg-surface-2 p-2.5"><div className="t-label !text-[10px]">{k}</div><div className="num mt-1 text-secondary font-bold text-text">{v}</div></div>
              ))}
            </div>
          </Specimen>
        </div>
      </Block>

      <Block id="acoes" title="Ações" description="Primário (Volt) para a próxima ação; contorno como padrão; fantasma para ações terciárias; perigo apenas para destrutivo.">
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
          <Specimen label="Variantes"><Button variant="primary" icon={<Plus />}>Nova campanha</Button><Button icon={<Download />}>Exportar</Button><Button variant="secondary">Secundário</Button><Button variant="ghost">Fantasma</Button><Button variant="danger" icon={<Trash2 />}>Excluir</Button></Specimen>
          <Specimen label="Estados"><Button variant="primary" disabled>Desabilitado</Button><Button loading={loadingBtn} onClick={() => { setLoadingBtn(true); setTimeout(() => setLoadingBtn(false), 1400); }}>Clique: carregando</Button><Button variant="outline" className="ring-[3px] ring-accent-tint">Foco</Button></Specimen>
          <Specimen label="Botões de ícone"><IconButton label="Editar"><Pencil /></IconButton><IconButton label="Mais" variant="outline"><MoreHorizontal /></IconButton><IconButton label="Configurar" variant="secondary"><Settings2 /></IconButton><IconButton label="Adicionar" variant="primary"><Plus /></IconButton><IconButton label="Pequeno" size="sm" variant="outline"><Copy /></IconButton></Specimen>
          <Specimen label="Tamanhos"><Button variant="primary" size="sm">Pequeno</Button><Button variant="primary">Médio</Button><Button variant="primary" size="lg">Grande</Button></Specimen>
        </div>
      </Block>

      <Block id="formularios" title="Formulários" description="Rótulo acima, ajuda abaixo, erro substitui a ajuda. Foco com anel no acento; erro com borda negativa.">
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
          <div className="panel flex flex-col gap-4 p-4">
            <Field label="Nome da campanha" hint="Visível só para a equipe.">{(p) => <Input {...p} placeholder="Ex.: Verão — Prospecção" />}</Field>
            <Field label="URL de destino" required error="Use um endereço completo, com https://">{(p) => <Input {...p} defaultValue="seusite" />}</Field>
            <Field label="Desabilitado">{(p) => <Input {...p} disabled value="Somente leitura" readOnly />}</Field>
            <Field label="Busca">{() => <SearchInput value={q} onValueChange={setQ} placeholder="Buscar campanhas" />}</Field>
          </div>
          <div className="panel flex flex-col gap-4 p-4">
            <Field label="Texto do anúncio">{(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value)} maxLength={125} showCount placeholder="Até 125 caracteres" />}</Field>
            <Field label="Conjunto de colunas">{(p) => <Select id={p.id} value={sel} onValueChange={setSel} options={[{ value: "performance", label: "Performance" }, { value: "leads", label: "Leads" }, { value: "vendas", label: "Vendas" }]} />}</Field>
            <div className="flex flex-col gap-1.5"><span className="text-secondary font-semibold text-text-soft">Seleção múltipla</span><MultiSelect label="Plataformas" value={multi} onValueChange={setMulti} options={[{ value: "meta", label: "Meta Ads" }, { value: "google", label: "Google Ads" }, { value: "tiktok", label: "TikTok Ads" }]} /></div>
          </div>
          <div className="panel flex flex-col gap-4 p-4">
            <Field label="Data">{() => <DatePicker value={date} onChange={setDate} />}</Field>
            <div className="flex flex-col gap-1.5"><span className="text-secondary font-semibold text-text-soft">Período</span><DateRangePicker value={range} presetId={preset} onChange={(r, p) => { setRange(r); setPreset(p); }} /></div>
            <Checkbox checked={check} onCheckedChange={setCheck} label="Criar pausada" description="Recomendado para revisar antes de veicular." />
            <Checkbox checked="indeterminate" onCheckedChange={() => undefined} label="Seleção parcial" />
            <RadioGroup label="Tipo de orçamento" value={radio} onValueChange={setRadio} options={[{ value: "diario", label: "Diário" }, { value: "total", label: "Total da campanha" }, { value: "x", label: "Indisponível", disabled: true }]} />
            <Switch checked={sw} onCheckedChange={setSw} label="Executar regras" description="Chave geral das automações." />
          </div>
        </div>
      </Block>

      <Block id="overlays" title="Sobreposições" description="Modal para tarefa focada, drawer para configurar sem perder contexto, confirmação para impacto alto, toast para retorno de ação.">
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
          <Specimen label="Diálogos"><Button onClick={() => setModal(true)}>Abrir modal</Button><Button onClick={() => setDrawer(true)} icon={<SlidersHorizontal />}>Abrir drawer</Button><Button variant="danger" icon={<Pause />} onClick={() => setConfirm(true)}>Confirmação</Button></Specimen>
          <Specimen label="Toasts">
            <Button size="sm" onClick={() => toast({ tone: "success", title: "Campanha ativada", description: "Veiculação retomada.", action: { label: "Desfazer", onClick: () => undefined } })}>Sucesso</Button>
            <Button size="sm" onClick={() => toast({ tone: "error", title: "Falha ao sincronizar", description: "A plataforma recusou a requisição." })}>Erro</Button>
            <Button size="sm" onClick={() => toast({ tone: "warning", title: "Orçamento quase no fim" })}>Atenção</Button>
            <Button size="sm" onClick={() => toast({ tone: "info", title: "Exportação iniciada" })}>Info</Button>
          </Specimen>
          <Specimen label="Menu suspenso e tooltip">
            <Menu>
              <MenuTrigger asChild><Button icon={<MoreHorizontal />}>Ações</Button></MenuTrigger>
              <MenuContent>
                <MenuLabel>Campanha</MenuLabel>
                <MenuItem icon={<Pencil />} shortcut="E">Editar</MenuItem>
                <MenuItem icon={<Copy />}>Duplicar</MenuItem>
                <MenuSub label="Exportar" icon={<Download />}><MenuItem>CSV</MenuItem><MenuItem>Planilha</MenuItem></MenuSub>
                <MenuCheckItem checked={col} onCheckedChange={setCol}>Mostrar arquivadas</MenuCheckItem>
                <MenuSeparator />
                <MenuItem icon={<Trash2 />} danger>Excluir</MenuItem>
              </MenuContent>
            </Menu>
            <Tooltip content="Custo por mil impressões"><span tabIndex={0} className="t-label cursor-help underline decoration-dotted underline-offset-4">CPM</span></Tooltip>
          </Specimen>
          <Specimen label="Menu de contexto" note="clique com o botão direito">
            <ContextMenu items={[{ label: "Copiar ID", icon: <Copy />, onSelect: () => toast({ tone: "info", title: "ID copiado" }) }, { label: "Pausar", icon: <Pause />, onSelect: () => undefined }, { label: "Excluir", icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => undefined }]}>
              <div className="flex h-20 w-full items-center justify-center rounded-md border border-dashed border-line-strong t-secondary">Área com menu de contexto</div>
            </ContextMenu>
          </Specimen>
        </div>
      </Block>

      <Block id="navegacao" title="Navegação" description="Tabs trocam visões da mesma página; segmented alterna opções curtas e exclusivas.">
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
          <div className="panel p-4"><Tabs value={tab} onValueChange={setTab} items={[{ value: "a", label: "Minhas regras", count: 4 }, { value: "b", label: "Modelos", count: 10 }, { value: "c", label: "Histórico" }]}><TabPanel value="a" className="pt-4 t-secondary">Conteúdo da aba ativa.</TabPanel><TabPanel value="b" className="pt-4 t-secondary">Modelos.</TabPanel><TabPanel value="c" className="pt-4 t-secondary">Histórico.</TabPanel></Tabs></div>
          <Specimen label="Segmented, chips e atalhos">
            <SegmentedControl ariaLabel="Granularidade" value={seg} onValueChange={setSeg} options={[{ value: "d", label: "Dia" }, { value: "s", label: "Semana" }, { value: "m", label: "Mês" }]} />
            <span className="flex items-center gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span><span className="flex items-center gap-1"><Kbd>G</Kbd><Kbd>C</Kbd></span>
            <Count>12</Count><Tag>Vendas</Tag><Tag tone="accent">Novo</Tag><DemoBadge /><Avatar name="Ana Lima" />
          </Specimen>
        </div>
      </Block>

      <Block id="dados" title="Dados" description="Faixa de KPIs contínua (sem cards soltos), métricas com contexto, tabela hierárquica com totais.">
        <KpiStrip items={[
          { id: "a", label: "Investimento", value: 289048.39, previous: 271000, format: "currency", better: "neutral", spark: [3, 4, 3.6, 5, 4.4, 6, 5.5, 6.4] },
          { id: "b", label: "Conversões", value: 4890, previous: 4780, format: "integer", better: "up", spark: [2, 3, 4, 3, 5, 4, 6, 7] },
          { id: "c", label: "Custo por resultado", value: 59.11, previous: 60.6, format: "currency", better: "down", spark: [6, 5, 5.5, 4.8, 5, 4.6, 4.4, 4.2] },
          { id: "d", label: "ROAS", value: 3.92, previous: 3.72, format: "ratio", better: "up" },
          { id: "e", label: "CTR", value: 0.0147, previous: 0.0142, format: "percent", better: "up" },
          { id: "f", label: "Receita", value: 1132020.59, previous: 1078000, format: "currency", better: "up" },
        ]} />
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
          <MetricCard label="Ticket médio" value={262.4} previous={248} format="currency" better="up" icon={<Inbox />} footer={<Progress value={0.72} label="Meta mensal" showValue />} />
          <MetricCard label="Custo por lead" value={18.9} previous={16.2} format="currency" better="down" icon={<Bell />} footer={<span className="t-secondary">Subiu após troca de criativo em 12/nov.</span>} />
          <div className="panel flex flex-col gap-4 p-4"><span className="t-label">Progresso</span><Progress value={0.42} label="Orçamento consumido" showValue /><Progress value={0.86} tone="warning" label="Ritmo acima do esperado" showValue /><Progress value={1} tone="positive" label="Meta atingida" showValue /><div className="flex gap-4"><Delta current={120} previous={100} /><Delta current={80} previous={100} /><Delta current={120} previous={100} better="down" /><Delta current={100} previous={100} /></div></div>
        </div>
        <section className="panel overflow-hidden">
          <TableToolbar actions={<IconButton label="Exportar" variant="outline" size="sm"><Download /></IconButton>}><SearchInput value={q} onValueChange={setQ} size="sm" placeholder="Buscar" wrapperClassName="w-[240px]" /><Button size="sm" icon={<SlidersHorizontal />}>Filtros</Button></TableToolbar>
          <DataTable caption="Exemplo de tabela" rows={DEMO_ROWS.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()))} columns={cols} getId={(r) => r.id} selectable selected={selected} onSelectedChange={setSelected} defaultSort={{ id: "spend", dir: "desc" }} footerRow
            empty={<EmptyState compact icon={<Search />} title="Nada encontrado" />} />
        </section>
      </Block>

      <Block id="graficos" title="Gráficos" description="Paleta categórica validada (CVD ΔE ≥ 8,3; contraste ≥ 3:1) nos dois temas; cor segue a entidade; legenda sempre presente com 2+ séries.">
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
          <ChartContainer title="Contêiner de gráfico" subtitle="Título + recorte descrito + ações + legenda" actions={<SegmentedControl ariaLabel="Métrica" size="sm" value={seg} onValueChange={setSeg} options={[{ value: "d", label: "Gasto" }, { value: "s", label: "ROAS" }]} />}
            legend={<ChartLegend items={[1, 2, 3, 4, 5, 6].map((i) => ({ id: String(i), label: ["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads", "Série 5", "Série 6"][i - 1], color: `var(--series-${i})` }))} />}>
            <div className="flex h-[180px] items-end gap-[2px] px-2">
              {[42, 64, 38, 80, 55, 70, 90, 62, 48, 76, 58, 84].map((h, i) => (
                <div key={i} className="flex flex-1 flex-col-reverse gap-[2px]" style={{ height: `${h}%` }}>
                  {[0.4, 0.3, 0.2, 0.1].map((p, j) => <span key={j} className={cn("w-full", j === 3 && "rounded-t-[3px]")} style={{ height: `${p * 100}%`, background: `var(--series-${j + 1})` }} />)}
                </div>
              ))}
            </div>
          </ChartContainer>
          <div className="grid grid-cols-2 gap-gutter">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="panel flex flex-col gap-2 p-4"><span className="t-label">Sparkline {i}</span><Sparkline data={[3, 4, 3.5, 5, 4.2, 6, 5.1, 6.8].map((v) => v * (i % 2 ? 1 : -1) + 10)} color={`var(--series-${i})`} className="h-12 w-full" /></div>
            ))}
          </div>
        </div>
      </Block>

      <Block id="estados" title="Estados" description="Todo container de dados tem vazio, carregando (skeleton no formato final), erro e sucesso desenhados.">
        <div className="grid grid-cols-1 gap-gutter md:grid-cols-2 xl:grid-cols-3">
          <div className="panel"><EmptyState compact icon={<Inbox />} title="Nenhuma campanha ainda" description="Conecte uma conta de anúncios para importar." actions={<Button size="sm" variant="primary">Conectar</Button>} /></div>
          <div className="panel"><ErrorState title="Não foi possível carregar" description="A plataforma não respondeu a tempo." onRetry={() => undefined} /></div>
          <div className="panel"><SuccessState title="Regra adicionada" description="Ela será avaliada a cada hora." /></div>
          <div className="panel flex flex-col gap-3 p-4"><span className="t-label">Skeleton</span><Skeleton className="h-7 w-32" /><Skeleton className="h-3.5 w-20" /><div className="mt-2 flex flex-col gap-2">{[1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-8 rounded-full" /><Skeleton className="h-3.5 flex-1" /><Skeleton className="h-3.5 w-14" /></div>)}</div></div>
          <div className="panel"><LoadingState label="Sincronizando métricas…" /></div>
          <div className="panel flex flex-col gap-3 p-4"><span className="t-label">Avisos e desabilitado</span><InlineNotice tone="warning">Ritmo de gasto acima do esperado.</InlineNotice><InlineNotice tone="positive">Conta conectada.</InlineNotice><div className="flex gap-2"><Button disabled>Desabilitado</Button><Switch checked disabled onCheckedChange={() => undefined} ariaLabel="Desabilitado" /></div></div>
        </div>
      </Block>

      <Block id="temas" title="Temas lado a lado" description="Mesmo componente, mesmos tokens semânticos, valores escolhidos para cada tema. O claro não é uma inversão do escuro.">
        <div className="grid grid-cols-1 gap-gutter xl:grid-cols-2">
          {(["dark", "light"] as const).map((t) => (
            <div key={t} data-theme={t} className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-4">
              <div className="flex items-center justify-between"><span className="t-label">{t === "dark" ? "Escuro" : "Claro"}</span><Logo /></div>
              <div className="panel grid grid-cols-2 overflow-hidden">
                {[["Investimento", "R$ 289.048", 0.067, "neutral"], ["ROAS", "3,92×", 0.053, "up"]].map(([l, v, d]) => (
                  <div key={String(l)} className="flex flex-col gap-2 p-4 [box-shadow:inset_-1px_0_0_var(--line)]"><span className="t-label">{l}</span><span className="num text-kpi font-bold">{v}</span><Delta current={1 + Number(d)} previous={1} /></div>
                ))}
              </div>
              <div className="panel flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between"><span className="t-title">Prospecção ampla</span><StatusBadge tone="positive">Ativa</StatusBadge></div>
                <Progress value={0.64} label="Orçamento consumido" showValue />
                <div className="flex flex-wrap gap-2"><Button variant="primary" size="sm" icon={<Plus />}>Nova regra</Button><Button size="sm">Editar</Button><Button variant="ghost" size="sm">Arquivar</Button><Tag>Vendas</Tag></div>
                <Input placeholder="Campo de texto" size="sm" />
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Modal open={modal} onOpenChange={setModal} title="Duplicar campanha" description="Cria uma cópia pausada com os mesmos conjuntos e anúncios." icon={<Copy />}
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button><Button variant="primary" onClick={() => setModal(false)}>Duplicar</Button></>}>
        <div className="flex flex-col gap-4"><Field label="Nome da cópia">{(p) => <Input {...p} defaultValue="Prospecção ampla (cópia)" />}</Field><Checkbox checked onCheckedChange={() => undefined} label="Criar pausada" /></div>
      </Modal>
      <Drawer open={drawer} onOpenChange={setDrawer} title="Filtros" description="Refine a tabela sem sair dela." icon={<SlidersHorizontal />}
        footer={<><Button variant="ghost">Limpar</Button><span className="flex-1" /><Button variant="primary" onClick={() => setDrawer(false)}>Aplicar</Button></>}>
        <div className="flex flex-col gap-4"><Field label="Objetivo">{(p) => <Select id={p.id} value="vendas" onValueChange={() => undefined} options={[{ value: "vendas", label: "Vendas" }, { value: "leads", label: "Leads" }]} />}</Field><Switch checked onCheckedChange={() => undefined} label="Somente com veiculação" /></div>
      </Drawer>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Pausar 3 campanhas?" description="A veiculação para imediatamente. O aprendizado pode reiniciar ao reativar." confirmLabel="Pausar" onConfirm={() => toast({ tone: "success", title: "3 campanhas pausadas" })} />
    </Page>
  );
}
