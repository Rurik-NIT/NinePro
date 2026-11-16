import { Bell, Eye, Filter, Maximize2, Megaphone, Minus, Plus, Settings2, Trash2, Zap, CalendarClock, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { formatDateShort } from "@/lib/format";
import { useLocalState } from "@/lib/useLocalState";
import { useData } from "@/data/source";
import { simulateConditions, UNSIMULABLE_METRICS, type CondMetric, type CondOp, type CondPeriod, type Condition } from "@/lib/ruleSimulation";
import { Button, IconButton } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Controls";
import { Modal } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select, Tooltip } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { DemoBadge, EmptyState, InlineNotice } from "@/components/feedback/States";
import { PlatformDot } from "@/components/data/Platform";

/* ---------------------------------------------------------------- catálogos (mapeados em docs/reverse-engineering/12) */
type TriggerKind = "anuncios" | "publicacoes" | "evento";
const METRICS: { value: CondMetric; label: string; unit?: string }[] = [
  { value: "spend", label: "Investimento", unit: "R$" }, { value: "impressions", label: "Impressões" }, { value: "clicks", label: "Cliques" },
  { value: "conversions", label: "Conversões" }, { value: "ctr", label: "CTR %", unit: "%" }, { value: "cpc", label: "CPC", unit: "R$" },
  { value: "cpm", label: "CPM", unit: "R$" }, { value: "cpa", label: "CPA", unit: "R$" }, { value: "roas", label: "ROAS", unit: "×" },
  { value: "dailyBudget", label: "Orçamento diário", unit: "R$" }, { value: "budgetUsed", label: "% do orçamento usado", unit: "%" },
  { value: "dayOfMonth", label: "Dia do mês" }, { value: "workdayOfMonth", label: "Dia útil do mês" }, { value: "cac", label: "%CAC", unit: "%" },
  { value: "costPerSale", label: "Custo por venda", unit: "R$" }, { value: "costPerQualifiedLead", label: "Custo por lead qualificado", unit: "R$" },
  { value: "leadToSale", label: "Lead → venda", unit: "%" }, { value: "qualifiedRate", label: "Taxa de qualificação", unit: "%" },
];
const PERIODS: { value: CondPeriod; label: string }[] = [
  { value: "hoje", label: "hoje" }, { value: "ontem", label: "ontem" }, { value: "3d", label: "últimos 3 dias" }, { value: "7d", label: "últimos 7 dias" },
  { value: "14d", label: "últimos 14 dias" }, { value: "30d", label: "últimos 30 dias" }, { value: "mes", label: "este mês" },
];
const OPS: { value: CondOp; label: string }[] = [{ value: ">", label: ">" }, { value: ">=", label: "≥" }, { value: "<", label: "<" }, { value: "<=", label: "≤" }, { value: "=", label: "=" }, { value: "!=", label: "≠" }];
const CHANGES = [
  { value: "pausar", label: "Pausar" }, { value: "reativar", label: "Reativar o que uma regra pausou" }, { value: "orcamento", label: "Ajustar orçamento diário", amount: true },
  { value: "lance", label: "Ajustar lance ou teto de custo", amount: true }, { value: "alvo", label: "Ajustar CPA ou ROAS alvo (Google)", amount: true },
  { value: "mover", label: "Mover orçamento do pior para o melhor", amount: true }, { value: "duplicar", label: "Duplicar (a cópia começa pausada)" }, { value: "marcar", label: "Marcar no nome" },
] as const;
const EVENTS: { group: string; items: string[] }[] = [
  { group: "Publicações", items: ["Uma publicação falhou", "Publicou em algumas plataformas e falhou em outras", "Uma publicação foi publicada", "Uma publicação foi agendada", "Uma publicação foi reaproveitada", "Publicou em uma plataforma", "Falhou em uma plataforma", "Uma publicação foi excluída", "Publicação feita fora do NinePro"] },
  { group: "Contas", items: ["Uma conta foi conectada", "Uma conta foi desconectada", "Uma conta perdeu permissões", "Conta em pausa de envio", "Modelo do WhatsApp mudou de status", "Qualidade do WhatsApp mudou"] },
  { group: "Anúncios", items: ["Conta de anúncios parou de sincronizar", "Um objeto de anúncio mudou de status", "Um anúncio foi reprovado", "Um anúncio tem problema de entrega", "Uma campanha ficou sem orçamento", "Conta de anúncios mudou de status", "Uma campanha mudou de status"] },
  { group: "Caixa de entrada", items: ["Chegou uma mensagem", "Uma mensagem não foi entregue", "Começou uma nova conversa", "Alguém reagiu a uma mensagem", "Mensagem vinda de anúncio ou link"] },
  { group: "Comentários", items: ["Chegou um comentário"] },
  { group: "Avaliações", items: ["Chegou uma avaliação"] },
  { group: "Chamadas", items: ["Chegou uma chamada", "Uma chamada terminou", "Uma chamada falhou"] },
  { group: "Leads", items: ["Chegou um novo lead"] },
  { group: "Pedidos", items: ["Chegou um pedido", "Um pedido mudou", "Um pedido foi reembolsado"] },
];
const FREQ = [{ value: "15m", label: "A cada 15 minutos" }, { value: "1h", label: "A cada hora" }, { value: "6h", label: "A cada 6 horas" }, { value: "1d", label: "Uma vez por dia" }];

type ChangeType = (typeof CHANGES)[number]["value"];
interface ChangeNode { id: string; kind: "change"; change: ChangeType; amount: number }
interface AlertNode { id: string; kind: "alert"; dest: "slack" | "email" | "" }
type ActionNode = ChangeNode | AlertNode;
type Selected = "start" | "cond" | string;

const uid = () => Math.random().toString(36).slice(2, 9);
const metricLabel = (m: CondMetric) => METRICS.find((x) => x.value === m)!.label;
const condText = (c: Condition) => `${metricLabel(c.metric)} ${PERIODS.find((p) => p.value === c.period)!.label} ${OPS.find((o) => o.value === c.op)!.label} ${String(c.value).replace(".", ",")}`;

/* ---------------------------------------------------------------- nó do canvas */
function NodeCard({ tone, icon, kicker, lines, selected, onClick, onDelete }: { tone?: "accent"; icon: ReactNode; kicker: string; lines: string[]; selected: boolean; onClick: () => void; onDelete?: () => void }) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className={cn("group relative w-[280px] cursor-pointer rounded-lg border bg-surface p-3 text-left shadow-card transition-colors", selected ? "border-accent-line-strong ring-[3px] ring-accent-tint" : "border-line hover:border-line-strong")}>
      <div className="flex items-center gap-2">
        <span className={cn("grid size-6 place-items-center rounded-sm [&_svg]:size-3.5", tone === "accent" ? "bg-accent text-accent-ink" : "bg-soft text-text-muted")}>{icon}</span>
        <span className="t-label !text-[10px]">{kicker}</span>
        {onDelete && <button type="button" aria-label="Remover etapa" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="ml-auto grid size-6 place-items-center rounded-sm text-text-dim opacity-0 transition-opacity hover:bg-soft hover:text-negative group-hover:opacity-100 focus:opacity-100"><Trash2 className="size-3.5" /></button>}
      </div>
      <div className="mt-2 flex flex-col gap-0.5">{lines.map((l, i) => <span key={i} className={cn("truncate", i === 0 ? "text-body font-semibold" : "t-secondary")}>{l}</span>)}</div>
    </div>
  );
}
const Connector = () => <span className="h-5 w-px bg-line-strong" aria-hidden />;

/* ---------------------------------------------------------------- tela */
export default function AutomationBuilder() {
  const toast = useToast();
  const navigate = useNavigate();
  const data = useData();
  const live = data.mode === "supabase";
  const [, setRules] = useLocalState<Record<string, unknown>[]>("ninepro.demo.rules", []);
  const [, setDrafts] = useLocalState<Record<string, unknown>[]>("ninepro.demo.drafts", []);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"Rascunho" | "Ativa">("Rascunho");
  const [selected, setSelected] = useState<Selected>("start");
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState(false);
  const [eventPicker, setEventPicker] = useState(false);

  // Início
  const [trigger, setTrigger] = useState<TriggerKind>("anuncios");
  const [freq, setFreq] = useState("1h");
  const [between, setBetween] = useState(false);
  const [skipWindow, setSkipWindow] = useState(false);
  const [account, setAccount] = useState("");
  const [level, setLevel] = useState<"campanhas" | "conjuntos" | "anuncios">("campanhas");
  const [budgetWhere, setBudgetWhere] = useState("qualquer");
  const [minDays, setMinDays] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [event, setEvent] = useState("");
  const [profile, setProfile] = useState("");
  // Só se
  const [logic, setLogic] = useState<"E" | "OU">("E");
  const [conds, setConds] = useState<Condition[]>([{ metric: "spend", period: "hoje", op: ">", value: 0 }]);
  // Ações
  const [actions, setActions] = useState<ActionNode[]>([{ id: uid(), kind: "alert", dest: "" }]);

  const startLines = trigger === "anuncios" ? [FREQ.find((f) => f.value === freq)!.label, account ? `Conta: ${account}` : "Escolha uma conta de anúncios"]
    : trigger === "publicacoes" ? [FREQ.find((f) => f.value === freq)!.label, profile ? `Perfil: ${profile}` : "Escolha um perfil"]
    : [event || "Escolha um evento", profile ? `Perfil: ${profile}` : "Escolha um perfil"];
  const condLines = trigger === "evento" && conds.length === 0 ? ["Sempre que acontecer"] : conds.length ? [conds.map(condText).join(logic === "E" ? " e " : " ou ")] : ["Sem condições"];
  const addChange = (index: number) => { const n: ChangeNode = { id: uid(), kind: "change", change: "pausar", amount: 10 }; setActions((a) => [...a.slice(0, index), n, ...a.slice(index)]); setSelected(n.id); };
  const updateAction = (id: string, patch: Partial<ChangeNode> & Partial<AlertNode>) => setActions((a) => a.map((x) => (x.id === id ? ({ ...x, ...patch } as ActionNode) : x)));

  const problems = [
    trigger === "anuncios" && !account ? "Escolha a conta de anúncios no Início." : null,
    trigger !== "anuncios" && !profile ? "Escolha o perfil no Início." : null,
    trigger === "evento" && !event ? "Escolha o evento que dispara a automação." : null,
    actions.some((a) => a.kind === "alert" && !a.dest) ? "Escolha para onde vai o alerta." : null,
  ].filter(Boolean) as string[];
  const summary = { name: name.trim() || "Automação sem nome", condition: condLines[0], action: actions.map((a) => (a.kind === "alert" ? "Enviar alerta" : CHANGES.find((c) => c.value === a.change)!.label)).join(" → "), target: trigger === "anuncios" ? (account || "—") : (profile || "—") };

  const saveDraft = async () => {
    if (live) { const err = await data.saveAutomation({ templateId: "custom", name: summary.name, target: summary.target, active: false, condition: summary.condition, action: summary.action, trigger: { kind: trigger }, conditions: conds, logic, actions }); toast(err ? { tone: "error", title: "Não foi possível salvar", description: err } : { tone: "success", title: "Rascunho salvo", description: "Fica em Todas as automações, desligado." }); return; }
    setDrafts((d) => [{ id: `d${Date.now()}`, ...summary, savedAt: new Date().toISOString() }, ...d]); toast({ tone: "success", title: "Rascunho salvo neste navegador" });
  };
  const activate = async () => {
    if (problems.length) { toast({ tone: "warning", title: "Falta pouco para ativar", description: problems[0] }); return; }
    if (live) {
      const err = await data.saveAutomation({ templateId: "custom", name: summary.name, target: summary.target, active: true, condition: summary.condition, action: summary.action, trigger: { kind: trigger }, conditions: conds, logic, actions });
      if (err) { toast({ tone: "error", title: "Não foi possível ativar", description: err }); return; }
      setStatus("Ativa");
      toast({ tone: "success", title: "Automação ativada", description: "Salva no banco. A execução nas plataformas exige integração." });
      navigate("/automacoes"); return;
    }
    setRules((r) => [...r, { id: `rule-${Date.now()}`, templateId: "custom", name: summary.name, target: summary.target, active: true, createdAt: new Date().toISOString(), condition: summary.condition, action: summary.action }]);
    setStatus("Ativa");
    toast({ tone: "success", title: "Automação ativada (demonstração)", description: "Aparece em Todas as automações. Nenhuma ação real será executada." });
    navigate("/automacoes");
  };

  return (
    <div className="flex h-[calc(100dvh-var(--header-h))] flex-col lg:h-[calc(100dvh-var(--header-h)-12px)]">
      {/* barra superior */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 lg:px-1">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dê um nome a esta automação" aria-label="Nome da automação" wrapperClassName="min-w-[220px] flex-1" />
        <DemoBadge />
        <Tag tone={status === "Ativa" ? "accent" : undefined}>{status}</Tag>
        <Button onClick={saveDraft}>Salvar rascunho</Button>
        <Button variant="primary" icon={<Zap />} onClick={activate}>Ativar</Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* canvas */}
        <div className="relative min-h-[420px] overflow-auto bg-surface-2" style={{ backgroundImage: "radial-gradient(var(--line-strong) 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
          <div className="absolute right-3 top-3 z-[1] flex gap-2">
            <Button size="sm" icon={<Eye />} onClick={() => setPreview(true)}>Prévia</Button>
          </div>
          <div className="flex min-h-full origin-top justify-center py-16 transition-transform" style={{ transform: `scale(${zoom})` }}>
            <div className="flex flex-col items-center">
              <NodeCard tone="accent" icon={trigger === "evento" ? <Zap /> : trigger === "publicacoes" ? <CalendarClock /> : <Megaphone />} kicker="Início" lines={startLines} selected={selected === "start"} onClick={() => setSelected("start")} />
              <Connector />
              <NodeCard icon={<Filter />} kicker="Só se" lines={condLines} selected={selected === "cond"} onClick={() => setSelected("cond")} />
              {actions.map((a, i) => (
                <div key={a.id} className="flex flex-col items-center">
                  <Connector />
                  <Tooltip content="Adicionar etapa"><button type="button" onClick={() => addChange(i)} aria-label="Adicionar etapa" className="grid size-6 place-items-center rounded-sm border border-line-strong bg-surface text-text-muted hover:border-accent-line-strong hover:text-accent-text"><Plus className="size-3.5" /></button></Tooltip>
                  <Connector />
                  {a.kind === "change"
                    ? <NodeCard icon={<Settings2 />} kicker="Alterar" lines={[CHANGES.find((c) => c.value === a.change)!.label + ("amount" in CHANGES.find((c) => c.value === a.change)! ? ` (${a.amount > 0 ? "+" : ""}${a.amount}%)` : "")]} selected={selected === a.id} onClick={() => setSelected(a.id)} onDelete={() => { setActions((x) => x.filter((y) => y.id !== a.id)); setSelected("cond"); }} />
                    : <NodeCard icon={<Bell />} kicker="Enviar alerta" lines={[a.dest === "slack" ? "Slack" : a.dest === "email" ? "E-mail" : "Escolha para onde vai"]} selected={selected === a.id} onClick={() => setSelected(a.id)} />}
                </div>
              ))}
            </div>
          </div>
          <div className="absolute bottom-3 left-3 flex flex-col overflow-hidden rounded-md border border-line bg-surface">
            <IconButton label="Aproximar" size="sm" onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)))}><Plus /></IconButton>
            <IconButton label="Afastar" size="sm" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))}><Minus /></IconButton>
            <IconButton label="Ajustar à tela" size="sm" onClick={() => setZoom(1)}><Maximize2 /></IconButton>
          </div>
        </div>

        {/* inspetor */}
        <aside aria-label="Propriedades da etapa" className="min-h-0 overflow-y-auto border-l border-line bg-surface">
          {selected === "start" && (
            <Inspector title="Início" subtitle={startLines.join(" · ")} icon={<Zap />}>
              <Section label="O que dispara">
                {([["anuncios", "Anúncios em horário", <Megaphone key="a" />], ["publicacoes", "Publicações em horário", <CalendarClock key="p" />], ["evento", "Quando algo acontece", <Zap key="e" />]] as const).map(([k, l, ic]) => (
                  <button key={k} type="button" onClick={() => { setTrigger(k); if (k === "evento") setConds([]); else if (!conds.length) setConds([{ metric: "spend", period: "hoje", op: ">", value: 0 }]); }}
                    className={cn("flex h-9 items-center gap-2.5 rounded-md border px-3 text-secondary font-semibold [&_svg]:size-4", trigger === k ? "border-accent-line-strong bg-accent-tint text-text" : "border-line text-text-muted hover:border-line-strong")}>{ic}{l}</button>
                ))}
              </Section>
              {trigger !== "evento" ? (
                <>
                  <Section label="Quando roda">
                    <Labeled label="Frequência"><Select size="sm" value={freq} onValueChange={setFreq} options={FREQ} /></Labeled>
                    <Switch size="sm" checked={between} onCheckedChange={setBetween} label="Só entre datas" />
                    <Switch size="sm" checked={skipWindow} onCheckedChange={setSkipWindow} label="Pular uma janela diária" />
                    {skipWindow && <div className="flex items-center gap-2"><Input size="sm" type="time" defaultValue="23:00" aria-label="Início da janela" /><span className="t-caption">até</span><Input size="sm" type="time" defaultValue="07:00" aria-label="Fim da janela" /></div>}
                  </Section>
                  <Section label="O que observa">
                    {trigger === "anuncios" ? (
                      <>
                        <Labeled label="Conexão"><Select size="sm" value={account || undefined} onValueChange={setAccount} placeholder="Escolha a conta de anúncios"
                          options={[{ value: "Loja Aurora — BM principal", label: "Loja Aurora — BM principal", icon: <PlatformDot id="meta" /> }, { value: "Aurora Search", label: "Aurora Search", icon: <PlatformDot id="google" /> }, { value: "Aurora TikTok", label: "Aurora TikTok", icon: <PlatformDot id="tiktok" /> }]} /></Labeled>
                        <Labeled label="Verificar cada"><SegmentedControl ariaLabel="Nível" size="sm" value={level} onValueChange={setLevel} options={[{ value: "campanhas", label: "Campanhas" }, { value: "conjuntos", label: "Conjuntos" }, { value: "anuncios", label: "Anúncios" }]} /></Labeled>
                        <Labeled label="Onde está o orçamento"><Select size="sm" value={budgetWhere} onValueChange={setBudgetWhere} options={[{ value: "qualquer", label: "Em qualquer nível" }, { value: "campanha", label: "Na campanha (CBO)" }, { value: "conjunto", label: "No conjunto" }]} /></Labeled>
                        <Labeled label="Ativo há pelo menos (opcional)"><div className="flex items-center gap-2"><Input size="sm" inputMode="numeric" value={minDays} onChange={(e) => setMinDays(e.target.value.replace(/\D/g, ""))} placeholder="Qualquer" wrapperClassName="w-24" /><span className="t-caption">dias</span></div></Labeled>
                        <Labeled label="Filtro por nome (opcional)"><Input size="sm" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="Contém… (ex.: Remarketing)" prefix={<Filter />} /></Labeled>
                      </>
                    ) : <Labeled label="Perfil"><Select size="sm" value={profile || undefined} onValueChange={setProfile} placeholder="Escolha o perfil" options={[{ value: "Loja Aurora", label: "Loja Aurora" }, { value: "Aurora Outlet", label: "Aurora Outlet" }]} /></Labeled>}
                  </Section>
                </>
              ) : (
                <>
                  <Section label="Quando roda"><Button size="sm" className="self-start" onClick={() => setEventPicker(true)}>{event || "Escolher evento"}</Button></Section>
                  <Section label="O que observa"><Labeled label="Perfil"><Select size="sm" value={profile || undefined} onValueChange={setProfile} placeholder="Escolha o perfil" options={[{ value: "Loja Aurora", label: "Loja Aurora" }, { value: "Aurora Outlet", label: "Aurora Outlet" }]} /></Labeled></Section>
                </>
              )}
            </Inspector>
          )}

          {selected === "cond" && (
            <Inspector title="Só se" subtitle={condLines[0]} icon={<Filter />}>
              <div className="flex items-center gap-2">
                <SegmentedControl ariaLabel="Lógica" size="sm" value={logic} onValueChange={setLogic} options={[{ value: "E", label: "E" }, { value: "OU", label: "OU" }]} />
                <span className="t-caption">{logic === "E" ? "Todas as condições precisam valer" : "Basta uma condição valer"}</span>
              </div>
              {conds.length === 0 && <p className="t-secondary">{trigger === "evento" ? "Sem condições: roda toda vez que o evento acontecer." : "Sem condições: a ação roda em toda verificação."}</p>}
              {conds.map((c, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md border border-line bg-surface-2 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="num font-mono text-[11px] text-text-dim">{String(i + 1).padStart(2, "0")}</span>
                    <Select size="sm" className="flex-1" ariaLabel="Métrica" value={c.metric} onValueChange={(v) => setConds((s) => s.map((x, j) => (j === i ? { ...x, metric: v as CondMetric } : x)))} options={METRICS.map((m) => ({ value: m.value, label: m.label }))} />
                    <IconButton label="Remover condição" size="sm" onClick={() => setConds((s) => s.filter((_, j) => j !== i))}><X /></IconButton>
                  </div>
                  <div className="grid grid-cols-[1fr_64px_96px] gap-2">
                    <Select size="sm" ariaLabel="Período" value={c.period} onValueChange={(v) => setConds((s) => s.map((x, j) => (j === i ? { ...x, period: v as CondPeriod } : x)))} options={PERIODS} />
                    <Select size="sm" ariaLabel="Operador" value={c.op} onValueChange={(v) => setConds((s) => s.map((x, j) => (j === i ? { ...x, op: v as CondOp } : x)))} options={OPS} />
                    <Input size="sm" inputMode="decimal" aria-label="Valor" className="num" value={String(c.value).replace(".", ",")} onChange={(e) => { const n = Number(e.target.value.replace(",", ".").replace(/[^\d.-]/g, "")); setConds((s) => s.map((x, j) => (j === i ? { ...x, value: Number.isFinite(n) ? n : 0 } : x))); }} suffix={<span className="text-[11px]">{METRICS.find((m) => m.value === c.metric)?.unit ?? ""}</span>} />
                  </div>
                  {UNSIMULABLE_METRICS.includes(c.metric) && <span className="t-caption">Exige dados de vendas/CRM conectados.</span>}
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus />} className="self-start" onClick={() => setConds((s) => [...s, { metric: "cpa", period: "7d", op: ">", value: 60 }])}>Adicionar condição</Button>
            </Inspector>
          )}

          {actions.map((a) => selected === a.id && (a.kind === "change" ? (
            <Inspector key={a.id} title="Alterar" subtitle={CHANGES.find((c) => c.value === a.change)!.label} icon={<Settings2 />} onDelete={() => { setActions((x) => x.filter((y) => y.id !== a.id)); setSelected("cond"); }}>
              <Labeled label="Ação"><Select size="sm" value={a.change} onValueChange={(v) => updateAction(a.id, { change: v as ChangeType })} options={CHANGES.map((c) => ({ value: c.value, label: c.label }))} /></Labeled>
              {"amount" in CHANGES.find((c) => c.value === a.change)! && (
                <Labeled label="Quanto"><div className="flex items-center gap-2"><Input size="sm" inputMode="numeric" className="num" value={String(a.amount)} onChange={(e) => updateAction(a.id, { amount: Number(e.target.value.replace(/[^\d-]/g, "")) || 0 })} wrapperClassName="w-24" suffix={<span className="text-[11px]">%</span>} /><span className="t-caption">Use negativo para reduzir. Limitado pelo teto em Limites.</span></div></Labeled>
              )}
              {a.change === "duplicar" && <InlineNotice tone="info">A cópia é criada pausada, para você testar com segurança.</InlineNotice>}
              {a.change === "reativar" && <InlineNotice tone="info">Só reativa o que uma regra pausou — nunca o que alguém pausou manualmente.</InlineNotice>}
            </Inspector>
          ) : (
            <Inspector key={a.id} title="Enviar alerta" subtitle={a.dest ? (a.dest === "slack" ? "Slack" : "E-mail") : "Escolha para onde vai"} icon={<Bell />}>
              <div className="flex gap-2">
                <Tooltip content="Conecte o Slack em Configurações › Notificações"><span tabIndex={0}><Button size="sm" icon={<Plus />} disabled>Alerta no Slack</Button></span></Tooltip>
                <Button size="sm" icon={<Plus />} variant={a.dest === "email" ? "secondary" : "outline"} onClick={() => updateAction(a.id, { dest: "email" })}>Alerta por e-mail</Button>
              </div>
              {a.dest === "email" && <p className="t-secondary">O alerta vai para o e-mail de alertas definido em Configurações › Notificações.</p>}
            </Inspector>
          )))}
        </aside>
      </div>

      {/* prévia */}
      <PreviewModal open={preview} onOpenChange={setPreview} conds={conds} logic={logic} trigger={trigger} summary={summary} problems={problems} />

      {/* seletor de evento */}
      <Modal open={eventPicker} onOpenChange={setEventPicker} size="lg" icon={<Zap />} title="Começar quando algo acontecer" description="A automação roda toda vez que isto acontecer em um dos seus perfis.">
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {EVENTS.map((g) => (
            <div key={g.group} className="flex flex-col gap-1">
              <span className="t-label !text-[10px]">{g.group}</span>
              {g.items.map((e) => <button key={e} type="button" onClick={() => { setEvent(e); setEventPicker(false); }} className={cn("rounded-sm px-2 py-1.5 text-left text-secondary transition-colors", event === e ? "bg-accent-tint font-semibold text-text" : "text-text-soft hover:bg-soft")}>{e}</button>)}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function Inspector({ title, subtitle, icon, children, onDelete }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode; onDelete?: () => void }) {
  return (
    <div className="flex flex-col">
      <header className="flex items-start gap-3 border-b border-line px-4 py-3.5">
        <span className="grid size-8 place-items-center rounded-md border border-line bg-surface-2 text-text-soft [&_svg]:size-4">{icon}</span>
        <div className="flex min-w-0 flex-1 flex-col"><span className="t-title">{title}</span><span className="truncate t-caption">{subtitle}</span></div>
        {onDelete && <IconButton label="Remover etapa" size="sm" onClick={onDelete}><Trash2 /></IconButton>}
      </header>
      <div className="flex flex-col gap-5 p-4">{children}</div>
    </div>
  );
}
const Section = ({ label, children }: { label: string; children: ReactNode }) => <div className="flex flex-col gap-2.5"><span className="t-label !text-[10px]">{label}</span>{children}</div>;
const Labeled = ({ label, children }: { label: string; children: ReactNode }) => <div className="flex flex-col gap-1.5"><span className="text-secondary font-semibold text-text-soft">{label}</span>{children}</div>;

function PreviewModal({ open, onOpenChange, conds, logic, trigger, summary, problems }: { open: boolean; onOpenChange: (o: boolean) => void; conds: Condition[]; logic: "E" | "OU"; trigger: TriggerKind; summary: { name: string; condition: string; action: string; target: string }; problems: string[] }) {
  const { campaigns } = useData();
  const r = useMemo(() => (open && trigger === "anuncios" ? simulateConditions(conds, logic, 30, campaigns) : null), [open, conds, logic, trigger, campaigns]);
  const max = Math.max(1, ...(r?.daily.map((d) => d.events) ?? [1]));
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" icon={<Eye />} title="Prévia" description={summary.name}>
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 rounded-md border border-line bg-surface-2 p-3 text-secondary">
          <dt className="t-label !text-[10px] leading-[18px]">Observa</dt><dd>{summary.target}</dd>
          <dt className="t-label !text-[10px] leading-[18px]">Só se</dt><dd className="num">{summary.condition}</dd>
          <dt className="t-label !text-[10px] leading-[18px]">Então</dt><dd>{summary.action}</dd>
        </dl>
        {problems.length > 0 && <InlineNotice tone="warning">{problems.join(" ")}</InlineNotice>}
        {trigger !== "anuncios" ? <InlineNotice tone="info">A simulação sobre o histórico vale para automações de anúncios em horário.</InlineNotice>
          : r && !r.simulable ? <InlineNotice tone="warning">{r.reason}</InlineNotice>
          : r && r.hits.length === 0 ? <EmptyState compact icon={<Filter />} title="A condição não teria sido atendida" description={`Nenhuma campanha atingiu a condição entre ${formatDateShort(r.window.from)} e ${formatDateShort(r.window.to)}.`} />
          : r && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="panel p-3"><span className="t-label !text-[10px]">Dias-campanha com a condição</span><p className="num text-kpi font-bold">{r.hits.length}</p></div>
                <div className="panel p-3"><span className="t-label !text-[10px]">Campanhas afetadas</span><p className="num text-kpi font-bold">{r.campaignsAffected}</p></div>
              </div>
              <div role="img" aria-label="Disparos por dia" className="flex h-14 items-end gap-[2px]">{r.daily.map((d) => <span key={d.date.getTime()} title={`${formatDateShort(d.date)} · ${d.events}`} className={cn("flex-1 rounded-t-[2px]", d.events ? "bg-accent" : "bg-bar-idle")} style={{ height: d.events ? `${Math.max(12, (d.events / max) * 100)}%` : "4px" }} />)}</div>
              <ul className="max-h-[160px] overflow-y-auto rounded-md border border-line">{r.hits.slice(0, 10).map((h, i) => <li key={i} className="flex items-center gap-3 border-b border-line-soft px-3 py-2 last:border-b-0"><span className="num w-14 whitespace-nowrap font-mono text-[11px] text-text-dim">{formatDateShort(h.date)}</span><PlatformDot id={h.campaign.platform} /><span className="truncate text-secondary font-semibold">{h.campaign.name}</span></li>)}</ul>
              <p className="t-caption">Simulação nos últimos 30 dias de dados fictícios, no nível de campanha.</p>
            </>
          )}
      </div>
    </Modal>
  );
}

