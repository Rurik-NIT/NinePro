import { BellRing, Clock3, FlaskConical, Plus, Scissors, ShieldCheck, Trash2, TrendingUp, Workflow } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PLATFORMS, RULE_CATEGORIES, RULE_TEMPLATES, type RuleCategory, type RuleTemplate } from "@/data/demo";
import { useLocalState } from "@/lib/useLocalState";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Button, IconButton } from "@/components/ui/Button";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Controls";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/Dialog";
import { Field, Input, SearchInput } from "@/components/ui/Input";
import { Select } from "@/components/ui/Menu";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { DemoBadge, EmptyState, InlineNotice } from "@/components/feedback/States";
import { DataTable, type Column } from "@/components/data/DataTable";
import { PlatformDot } from "@/components/data/Platform";
import { RuleSimulation } from "./automations/RuleSimulation";

const CAT_ICON: Record<RuleCategory, ReactNode> = { cortar: <Scissors />, escalar: <TrendingUp />, alertar: <BellRing />, horario: <Clock3 /> };
interface InstalledRule { id: string; templateId: string; name: string; target: string; active: boolean; createdAt: string }

export default function Automations({ defaultTab = "regras" }: { defaultTab?: string }) {
  const toast = useToast();
  const [tab, setTab] = useState(defaultTab);
  const [rules, setRules] = useLocalState<InstalledRule[]>("ninepro.demo.rules", []);
  const [cat, setCat] = useState<RuleCategory | "todas">("todas");
  const [q, setQ] = useState("");
  const [installing, setInstalling] = useState<RuleTemplate | null>(null);
  const [target, setTarget] = useState("");
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [master, setMaster] = useLocalState("ninepro.demo.rulesMaster", true);
  const [cap, setCap] = useLocalState("ninepro.demo.rulesCap", "30");
  const [removing, setRemoving] = useState<InstalledRule | null>(null);
  const [simulating, setSimulating] = useState<InstalledRule | null>(null);

  const templates = RULE_TEMPLATES.filter((t) => (cat === "todas" || t.category === cat) && (!q || `${t.name} ${t.description}`.toLowerCase().includes(q.toLowerCase())));

  const install = () => {
    if (!installing || !target.trim()) return;
    setRules((r) => [...r, { id: `rule-${Date.now()}`, templateId: installing.id, name: installing.name, target: target.trim(), active: true, createdAt: new Date().toISOString() }]);
    toast({ tone: "success", title: "Regra adicionada", description: "Modo demonstração: a regra fica salva neste navegador e não executa ações reais." });
    setInstalling(null); setTarget(""); setTab("regras");
  };

  const columns: Column<InstalledRule>[] = [
    { id: "name", header: "Regra", sticky: true, sortValue: (r) => r.name, cell: (r) => {
      const t = RULE_TEMPLATES.find((x) => x.id === r.templateId)!;
      return <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-md bg-surface-2 text-text-muted [&_svg]:size-4">{CAT_ICON[t.category]}</span><div className="flex flex-col"><span className="text-body font-semibold">{r.name}</span><span className="t-caption">{RULE_CATEGORIES[t.category].label}</span></div></div>;
    } },
    { id: "cond", header: "Quando", cell: (r) => <span className="text-secondary text-text-soft">{RULE_TEMPLATES.find((x) => x.id === r.templateId)!.condition}</span> },
    { id: "action", header: "Então", cell: (r) => <span className="text-secondary text-text-soft">{RULE_TEMPLATES.find((x) => x.id === r.templateId)!.action}</span> },
    { id: "target", header: "Alvo", cell: (r) => <Tag>{r.target}</Tag> },
    { id: "status", header: "Status", cell: (r) => (
      <div className="flex items-center gap-2.5">
        <Switch size="sm" ariaLabel={`Ativar ${r.name}`} checked={r.active && master} disabled={!master} onCheckedChange={(v) => setRules((s) => s.map((x) => x.id === r.id ? { ...x, active: v } : x))} />
        <StatusBadge tone={!master ? "warning" : r.active ? "positive" : "neutral"}>{!master ? "Suspensa" : r.active ? "Ativa" : "Desligada"}</StatusBadge>
      </div>
    ) },
    { id: "rm", header: <span className="sr-only">Ações</span>, width: 140, cell: (r) => (
      <div className="flex items-center justify-end gap-1">
        <Button size="sm" variant="ghost" icon={<FlaskConical />} onClick={() => setSimulating(r)}>Simular</Button>
        <IconButton label={`Remover ${r.name}`} size="sm" onClick={() => setRemoving(r)}><Trash2 /></IconButton>
      </div>
    ) },
  ];

  return (
    <Page>
      <PageHeader meta={<DemoBadge />} title="Regras automáticas"
        description="Proteja o orçamento e escale o que funciona com regras que agem em horário marcado ou ao atingir uma condição."
        actions={<>
          <Button icon={<ShieldCheck />} onClick={() => setLimitsOpen(true)}>Limites</Button>
          <Button variant="primary" icon={<Plus />} onClick={() => setTab("modelos")}>Nova regra</Button>
        </>} />

      {!master && <InlineNotice tone="warning" icon={<ShieldCheck />} action={<Button size="sm" onClick={() => setMaster(true)}>Retomar</Button>}>Todas as regras estão suspensas pela chave geral em Limites.</InlineNotice>}

      <Tabs value={tab} onValueChange={setTab} items={[{ value: "regras", label: "Minhas regras", count: rules.length }, { value: "modelos", label: "Modelos", count: RULE_TEMPLATES.length }]}>
        <TabPanel value="regras" className="pt-4">
          <section className="panel overflow-hidden">
            {rules.length === 0 ? (
              <EmptyState icon={<Workflow />} title="Nenhuma regra ainda"
                description="Comece por um modelo: pausar o que gasta sem converter ou escalar campanhas com bom retorno."
                actions={<Button variant="primary" icon={<Plus />} onClick={() => setTab("modelos")}>Explorar modelos</Button>} />
            ) : (
              <DataTable caption="Regras instaladas" rows={rules} columns={columns} getId={(r) => r.id} />
            )}
          </section>
        </TabPanel>

        <TabPanel value="modelos" className="flex flex-col gap-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onValueChange={setQ} size="sm" placeholder="Buscar modelo" wrapperClassName="w-full sm:w-[260px]" />
            <div role="radiogroup" aria-label="Categoria" className="flex flex-wrap gap-1.5">
              {(["todas", ...Object.keys(RULE_CATEGORIES)] as (RuleCategory | "todas")[]).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={cat === c} onClick={() => setCat(c)}
                  className={cn("inline-flex h-control-sm items-center gap-1.5 rounded-full border px-3 text-secondary font-semibold transition-colors [&_svg]:size-3.5",
                    cat === c ? "border-accent-line-strong bg-accent-tint text-text" : "border-line text-text-muted hover:border-line-strong hover:text-text")}>
                  {c !== "todas" && CAT_ICON[c]}{c === "todas" ? "Todas" : RULE_CATEGORIES[c].label}
                </button>
              ))}
            </div>
          </div>
          {templates.length === 0 ? <div className="panel"><EmptyState compact icon={<Workflow />} title="Nenhum modelo encontrado" /></div> : (
            <ul className="grid grid-cols-1 gap-gutter md:grid-cols-2 2xl:grid-cols-3">
              {templates.map((t) => (
                <li key={t.id} className="panel flex flex-col gap-4 p-4 transition-colors hover:border-line-strong">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-9 place-items-center rounded-md border border-line bg-surface-2 text-text-soft [&_svg]:size-4">{CAT_ICON[t.category]}</span>
                    <Tag>{RULE_CATEGORIES[t.category].label}</Tag>
                  </div>
                  <div className="flex flex-col gap-1"><h3 className="t-title">{t.name}</h3><p className="t-secondary">{t.description}</p></div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-md bg-surface-2 p-3 text-secondary">
                    <dt className="t-label !text-[10px] leading-[18px]">Quando</dt><dd className="num text-text-soft">{t.condition}</dd>
                    <dt className="t-label !text-[10px] leading-[18px]">Então</dt><dd className="text-text-soft">{t.action}</dd>
                  </dl>
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-line-soft pt-3">
                    <span className="flex items-center gap-1.5 t-caption">
                      {t.platforms === "todas" ? "Todas as plataformas" : t.platforms.map((p) => <span key={p} className="inline-flex items-center gap-1"><PlatformDot id={p} className="size-2" />{PLATFORMS[p].label}</span>)}
                    </span>
                    <Button size="sm" variant="secondary" icon={<FlaskConical />} onClick={() => setInstalling(t)}>Simular e usar</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabPanel>
      </Tabs>

      <Modal open={!!installing} onOpenChange={(o) => { if (!o) { setInstalling(null); setTarget(""); } }} size="lg" icon={installing ? CAT_ICON[installing.category] : undefined}
        title={installing?.name ?? ""} description={installing?.description}
        footer={<><Button variant="ghost" onClick={() => setInstalling(null)}>Cancelar</Button><Button variant="primary" disabled={!target} onClick={install}>Adicionar regra</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Aplicar em" required hint="Escolha onde a regra vai olhar.">
            {(p) => <Select id={p.id} value={target || undefined} onValueChange={setTarget} placeholder="Selecionar alvo"
              options={[{ value: "Todas as campanhas", label: "Todas as campanhas" }, { value: "Campanhas de vendas", label: "Campanhas de vendas" }, { value: "Campanhas de leads", label: "Campanhas de leads" }]} />}
          </Field>
          {installing && <RuleSimulation templateId={installing.id} target={target} capPct={Number(cap) || 30} />}
          <InlineNotice tone="info">Demonstração: a regra é salva neste navegador e não altera nenhuma campanha.</InlineNotice>
        </div>
      </Modal>

      <Drawer open={!!simulating} onOpenChange={(o) => !o && setSimulating(null)} width={600} icon={<FlaskConical />}
        title={simulating ? `Simular: ${simulating.name}` : ""} description={simulating ? `Alvo: ${simulating.target}` : undefined}>
        {simulating && <RuleSimulation templateId={simulating.templateId} target={simulating.target} capPct={Number(cap) || 30} />}
      </Drawer>

      <Drawer open={limitsOpen} onOpenChange={setLimitsOpen} title="Limites das regras" icon={<ShieldCheck />}
        description="Valem para todas as regras da equipe. Religar a chave geral devolve cada regra ao estado anterior.">
        <div className="flex flex-col gap-5">
          <div className="rounded-md border border-line p-4">
            <Switch checked={master} onCheckedChange={setMaster} label="Executar regras automáticas" description="Desligado, nenhuma regra age — útil durante revisões de conta ou datas sensíveis." />
          </div>
          <Field label="Aumento máximo de orçamento por dia" hint="Teto somado de todas as regras de escala, por campanha.">
            {(p) => <Input {...p} value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, "").slice(0, 3))} suffix={<span className="text-secondary font-bold">%</span>} className="num" />}
          </Field>
          <p className="t-caption">As contas de anúncio aparecem aqui quando uma regra passa a usá-las.</p>
        </div>
      </Drawer>

      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remover regra?" confirmLabel="Remover"
        description={`"${removing?.name}" deixa de ser avaliada. O histórico de execuções não é afetado.`}
        onConfirm={() => { if (removing) { setRules((s) => s.filter((x) => x.id !== removing.id)); toast({ tone: "info", title: "Regra removida" }); } }} />
    </Page>
  );
}
