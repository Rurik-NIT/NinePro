import { BellRing, Clock3, FlaskConical, History, Play, Plus, Scissors, ShieldCheck, Trash2, TrendingUp, Workflow } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/lib/workspace";
import { formatDateTime } from "@/lib/format";
import { RULE_CATEGORIES, RULE_TEMPLATES, type RuleCategory, type RuleTemplate } from "@/data/demo";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Button, IconButton } from "@/components/ui/Button";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Controls";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/Dialog";
import { Field, Input, SearchInput } from "@/components/ui/Input";
import { Select } from "@/components/ui/Menu";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, InlineNotice, LoadingState } from "@/components/feedback/States";
import { DataTable, type Column } from "@/components/data/DataTable";

const CAT_ICON: Record<RuleCategory, ReactNode> = { cortar: <Scissors />, escalar: <TrendingUp />, alertar: <BellRing />, horario: <Clock3 /> };
interface Rule { id: string; name: string; template_id: string | null; target: string | null; status: "rascunho" | "ativa" | "desligada"; conditions: { text?: string }; actions: { text?: string }; params: Record<string, number>; last_run_at: string | null; last_outcome: string | null; created_at: string }
interface Run { id: number; automation_id: string; ran_at: string; outcome: string; details: { alvos?: Target[] } }
interface Target { id: string; nome: string; acao: string; ok: boolean; erro?: string; de?: number; para?: number; metricas?: Record<string, unknown> }
interface Preview { status: string; detalhe: string; alvos: Target[] }

/** Parâmetros que cada modelo pede ao instalar (o motor usa os mesmos nomes). */
const PARAMS: Record<string, { key: string; label: string; unit?: string; def?: number; required?: boolean; hint?: string }[]> = {
  r1: [{ key: "meta", label: "Meta de custo por resultado (CPA)", unit: "R$", required: true, hint: "Pausa quando o CPA de 7 dias passa de 1,3× a meta e o gasto já é de 2× a meta." }],
  r2: [{ key: "roas", label: "ROAS mínimo (3 dias)", unit: "×", def: 3 }, { key: "pct", label: "Aumento por vez", unit: "%", def: 15 }, { key: "teto", label: "Teto de orçamento diário", unit: "R$", hint: "Opcional." }],
  r3: [{ key: "valor", label: "Gasto mínimo na semana sem conversão", unit: "R$", def: 300 }],
  r4: [{ key: "frequencia", label: "Frequência máxima (7 dias)", def: 3 }],
  r5: [{ key: "pct", label: "Gasto de hoje acima de (% da média de 7 dias)", unit: "%", def: 140 }],
  r6: [{ key: "hora", label: "Hora de pausar (horário de Brasília)", unit: "h", def: 23 }],
  r7: [{ key: "hora", label: "Hora de reativar (horário de Brasília)", unit: "h", def: 7 }],
  r8: [{ key: "meta", label: "Meta de custo por resultado (CPA)", unit: "R$", required: true }, { key: "pct", label: "Aumento por dia", unit: "%", def: 10 }, { key: "teto", label: "Teto de orçamento diário", unit: "R$", hint: "Opcional." }],
  r9: [{ key: "pct", label: "Parte do orçamento a remanejar", unit: "%", def: 20 }],
  r10: [{ key: "pct", label: "Investimento máximo sobre a receita", unit: "%", def: 50 }],
};
const tplOf = (r: Rule) => RULE_TEMPLATES.find((t) => t.id === r.template_id);
const money = (v?: number) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

async function appCall<T>(body: Record<string, unknown>): Promise<T> {
  const token = (await supabase!.auth.getSession()).data.session?.access_token;
  const res = await fetch("/api/app", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const r = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(r.error ?? `Erro ${res.status}`);
  return r;
}

function TargetsTable({ alvos }: { alvos: Target[] }) {
  if (!alvos.length) return null;
  return (
    <ul className="divide-y divide-line-soft rounded-md border border-line">
      {alvos.map((a, i) => (
        <li key={`${a.id}-${i}`} className="flex flex-col gap-1 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2"><span className="font-semibold">{a.nome}</span><StatusBadge tone={!a.ok ? "negative" : a.acao === "Alerta" ? "warning" : "info"}>{a.acao}</StatusBadge></div>
          {a.de != null && <span className="t-caption">Orçamento {money(a.de)} → {money(a.para)}</span>}
          {a.metricas && <span className="t-caption">{Object.entries(a.metricas).map(([k, v]) => `${k.replace("_", " ")}: ${v}`).join(" · ")}</span>}
          {a.erro && <span className="text-[12px] text-negative">{a.erro}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function LiveRules({ defaultTab = "regras" }: { defaultTab?: string }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { current } = useWorkspace();
  const ws = current?.id;
  const admin = current?.role === "owner" || current?.role === "admin";
  const [tab, setTab] = useState(defaultTab);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [settings, setSettings] = useState({ run_ad_automations: true, max_daily_increase_pct: 30 });
  const [cat, setCat] = useState<RuleCategory | "todas">("todas");
  const [q, setQ] = useState("");
  const [installing, setInstalling] = useState<RuleTemplate | null>(null);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [removing, setRemoving] = useState<Rule | null>(null);
  const [previewing, setPreviewing] = useState<{ rule: Rule; result: Preview | null; error?: string } | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !ws) return;
    const [r, h, s] = await Promise.all([
      supabase.from("automations").select("id, name, template_id, target, status, conditions, actions, params, last_run_at, last_outcome, created_at").eq("workspace_id", ws).order("created_at"),
      supabase.from("automation_runs").select("id, automation_id, ran_at, outcome, details").eq("workspace_id", ws).order("ran_at", { ascending: false }).limit(100),
      supabase.from("automation_settings").select("run_ad_automations, max_daily_increase_pct").eq("workspace_id", ws).maybeSingle(),
    ]);
    setRules((r.data as Rule[] | null) ?? []);
    setRuns((h.data as Run[] | null) ?? []);
    if (s.data) setSettings(s.data as typeof settings);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);

  const saveSettings = async (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    const { error } = await supabase!.from("automation_settings").upsert({ workspace_id: ws, ...next });
    if (error) toast({ tone: "error", title: "Não foi possível salvar", description: "Só administradores do espaço alteram os limites." });
  };
  const toggle = async (r: Rule, v: boolean) => {
    const { error } = await supabase!.from("automations").update({ status: v ? "ativa" : "desligada", updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) toast({ tone: "error", title: "Não foi possível alterar", description: error.message });
    await load();
  };
  const preview = async (r: Rule) => {
    setPreviewing({ rule: r, result: null });
    try { setPreviewing({ rule: r, result: await appCall<Preview>({ action: "rule_preview", workspaceId: ws, automationId: r.id }) }); }
    catch (e) { setPreviewing({ rule: r, result: null, error: e instanceof Error ? e.message : String(e) }); }
  };
  const runNow = async (r: Rule) => {
    setRunning(r.id);
    try {
      const res = await appCall<Preview>({ action: "rule_run", workspaceId: ws, automationId: r.id });
      toast({ tone: res.status === "erro" ? "error" : res.status === "nao_suportada" ? "warning" : "success", title: res.status === "executou" ? "Regra executada" : res.status === "sem_alvos" ? "Nada a fazer agora" : "Regra não executou", description: res.detalhe });
    } catch (e) { toast({ tone: "error", title: "Não foi possível executar", description: e instanceof Error ? e.message : String(e) }); }
    setRunning(null);
    await load();
  };

  const columns: Column<Rule>[] = [
    { id: "name", header: "Regra", sticky: true, sortValue: (r) => r.name, cell: (r) => {
      const t = tplOf(r);
      return <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-md bg-surface-2 text-text-muted [&_svg]:size-4">{t ? CAT_ICON[t.category] : <Workflow />}</span><div className="flex flex-col"><span className="text-body font-semibold">{r.name}</span><span className="t-caption">{t ? RULE_CATEGORIES[t.category].label : "Personalizada"}</span></div></div>;
    } },
    { id: "cond", header: "Quando", cell: (r) => <span className="text-secondary text-text-soft">{r.conditions?.text ?? tplOf(r)?.condition}{r.params?.meta ? ` (meta ${money(r.params.meta)})` : ""}</span> },
    { id: "action", header: "Então", cell: (r) => <span className="text-secondary text-text-soft">{r.actions?.text ?? tplOf(r)?.action}</span> },
    { id: "target", header: "Alvo", cell: (r) => <Tag>{r.target ?? "Todas as campanhas"}</Tag> },
    { id: "last", header: "Última verificação", cell: (r) => r.last_run_at ? <div className="flex max-w-[240px] flex-col"><span className="t-caption">{formatDateTime(new Date(r.last_run_at))}</span><span className="whitespace-normal text-secondary text-text-soft">{r.last_outcome}</span></div> : <span className="t-caption">{r.status === "ativa" ? "Na próxima hora cheia" : "—"}</span> },
    { id: "status", header: "Status", cell: (r) => (
      <div className="flex items-center gap-2.5">
        <Switch size="sm" ariaLabel={`Ativar ${r.name}`} checked={r.status === "ativa" && settings.run_ad_automations} disabled={!settings.run_ad_automations} onCheckedChange={(v) => void toggle(r, v)} />
        <StatusBadge tone={!settings.run_ad_automations ? "warning" : r.status === "ativa" ? "positive" : "neutral"}>{!settings.run_ad_automations ? "Suspensa" : r.status === "ativa" ? "Ativa" : r.status === "rascunho" ? "Rascunho" : "Desligada"}</StatusBadge>
      </div>) },
    { id: "rm", header: <span className="sr-only">Ações</span>, width: 220, cell: (r) => (
      <div className="flex items-center justify-end gap-1">
        <Button size="sm" variant="ghost" icon={<FlaskConical />} onClick={() => void preview(r)}>Simular</Button>
        {admin && <Button size="sm" variant="ghost" icon={<Play />} loading={running === r.id} onClick={() => void runNow(r)}>Executar</Button>}
        <IconButton label={`Remover ${r.name}`} size="sm" onClick={() => setRemoving(r)}><Trash2 /></IconButton>
      </div>) },
  ];
  const templates = RULE_TEMPLATES.filter((t) => (cat === "todas" || t.category === cat) && (!q || `${t.name} ${t.description}`.toLowerCase().includes(q.toLowerCase())));
  const ruleName = (id: string) => rules?.find((r) => r.id === id)?.name ?? "Regra removida";

  if (rules === null) return <Page><PageHeader title="Regras automáticas" /><LoadingState /></Page>;
  return (
    <Page>
      <PageHeader title="Regras automáticas" description="Regras verificadas de hora em hora com as métricas reais: pausam o que gasta sem retorno, escalam o que funciona e avisam a equipe."
        actions={<><Button icon={<ShieldCheck />} onClick={() => setLimitsOpen(true)}>Limites</Button><Button variant="primary" icon={<Plus />} onClick={() => navigate("/automacoes/nova")}>Nova automação</Button></>} />
      {!settings.run_ad_automations && <InlineNotice tone="warning" icon={<ShieldCheck />} action={admin ? <Button size="sm" onClick={() => void saveSettings({ run_ad_automations: true })}>Retomar</Button> : undefined}>Todas as regras estão suspensas pela chave geral em Limites.</InlineNotice>}

      <Tabs value={tab} onValueChange={setTab} items={[{ value: "regras", label: "Minhas regras", count: rules.length }, { value: "modelos", label: "Modelos", count: RULE_TEMPLATES.length }, { value: "historico", label: "Histórico", count: runs.length }]}>
        <TabPanel value="regras" className="pt-4">
          <section className="panel overflow-hidden">
            {rules.length === 0 ? (
              <EmptyState icon={<Workflow />} title="Nenhuma regra ainda" description="Comece por um modelo: pausar o que gasta sem converter ou escalar campanhas com bom retorno."
                actions={<><Button variant="primary" onClick={() => setTab("modelos")}>Explorar modelos</Button><Button icon={<Plus />} onClick={() => navigate("/automacoes/nova")}>Nova automação</Button></>} />
            ) : <DataTable caption="Regras instaladas" rows={rules} columns={columns} getId={(r) => r.id} />}
          </section>
          <p className="mt-3 t-caption">Pausar e reativar funcionam em todas as plataformas conectadas. Ajuste de orçamento: Meta e TikTok. As ações aparecem no Histórico e são enviadas aos webhooks (regra.disparou).</p>
        </TabPanel>

        <TabPanel value="modelos" className="flex flex-col gap-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onValueChange={setQ} size="sm" placeholder="Buscar modelo" wrapperClassName="w-full sm:w-[260px]" />
            <div role="radiogroup" aria-label="Categoria" className="flex flex-wrap gap-1.5">
              {(["todas", ...Object.keys(RULE_CATEGORIES)] as (RuleCategory | "todas")[]).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={cat === c} onClick={() => setCat(c)}
                  className={cn("inline-flex h-control-sm items-center gap-1.5 rounded-full border px-3 text-secondary font-semibold transition-colors [&_svg]:size-3.5", cat === c ? "border-accent-line-strong bg-accent-tint text-text" : "border-line text-text-muted hover:border-line-strong hover:text-text")}>
                  {c !== "todas" && CAT_ICON[c]}{c === "todas" ? "Todas" : RULE_CATEGORIES[c].label}
                </button>
              ))}
            </div>
          </div>
          <ul className="grid grid-cols-1 gap-gutter md:grid-cols-2 2xl:grid-cols-3">
            {templates.map((t) => (
              <li key={t.id} className="panel flex flex-col gap-4 p-4 transition-colors hover:border-line-strong">
                <div className="flex items-start justify-between gap-3"><span className="grid size-9 place-items-center rounded-md border border-line bg-surface-2 text-text-soft [&_svg]:size-4">{CAT_ICON[t.category]}</span><Tag>{RULE_CATEGORIES[t.category].label}</Tag></div>
                <div className="flex flex-col gap-1"><h3 className="t-title">{t.name}</h3><p className="t-secondary">{t.description}</p></div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-md bg-surface-2 p-3 text-secondary">
                  <dt className="t-label !text-[10px] leading-[18px]">Quando</dt><dd className="num text-text-soft">{t.condition}</dd>
                  <dt className="t-label !text-[10px] leading-[18px]">Então</dt><dd className="text-text-soft">{t.action}</dd>
                </dl>
                <div className="mt-auto flex justify-end border-t border-line-soft pt-3"><Button size="sm" variant="secondary" icon={<Plus />} onClick={() => setInstalling(t)}>Usar modelo</Button></div>
              </li>
            ))}
          </ul>
        </TabPanel>

        <TabPanel value="historico" className="pt-4">
          {runs.length === 0 ? <div className="panel"><EmptyState icon={<History />} title="Nenhuma ação ainda" description="Quando uma regra pausar, reativar, ajustar orçamento ou alertar, o registro aparece aqui." /></div> : (
            <ul className="flex flex-col gap-3">
              {runs.map((h) => (
                <li key={h.id} className="panel flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="t-title">{ruleName(h.automation_id)}</span><span className="t-caption">{formatDateTime(new Date(h.ran_at))}</span></div>
                  <span className="t-secondary">{h.outcome}</span>
                  <TargetsTable alvos={h.details?.alvos ?? []} />
                </li>
              ))}
            </ul>
          )}
        </TabPanel>
      </Tabs>

      {ws && <InstallModal template={installing} ws={ws} onOpenChange={(o) => !o && setInstalling(null)} onDone={() => { setInstalling(null); setTab("regras"); void load(); }} />}

      <Drawer open={!!previewing} onOpenChange={(o) => !o && setPreviewing(null)} width={560} icon={<FlaskConical />} title={previewing ? `Simular: ${previewing.rule.name}` : ""} description="O que a regra faria agora, com as métricas reais. Nada é alterado.">
        {previewing && (previewing.error ? <InlineNotice tone="negative">{previewing.error}</InlineNotice> : !previewing.result ? <LoadingState /> : (
          <div className="flex flex-col gap-3">
            <InlineNotice tone={previewing.result.status === "nao_suportada" ? "warning" : previewing.result.alvos.length ? "info" : "positive"}>{previewing.result.detalhe}</InlineNotice>
            <TargetsTable alvos={previewing.result.alvos} />
          </div>
        ))}
      </Drawer>

      <Drawer open={limitsOpen} onOpenChange={setLimitsOpen} title="Limites das regras" icon={<ShieldCheck />} description="Valem para todas as regras do espaço.">
        <div className="flex flex-col gap-5">
          <div className="rounded-md border border-line p-4">
            <Switch checked={settings.run_ad_automations} disabled={!admin} onCheckedChange={(v) => void saveSettings({ run_ad_automations: v })} label="Executar regras automáticas" description="Desligado, nenhuma regra age — útil durante revisões de conta ou datas sensíveis." />
          </div>
          <Field label="Aumento máximo de orçamento por vez" hint="Nenhuma regra aumenta mais do que isso de uma vez, por campanha.">
            {(p) => <Input {...p} disabled={!admin} value={String(settings.max_daily_increase_pct)} onChange={(e) => setSettings((s) => ({ ...s, max_daily_increase_pct: Number(e.target.value.replace(/\D/g, "").slice(0, 3)) || 0 }))} onBlur={() => void saveSettings({})} suffix={<span className="text-secondary font-bold">%</span>} className="num" />}
          </Field>
          {!admin && <p className="t-caption">Só administradores do espaço alteram os limites.</p>}
        </div>
      </Drawer>

      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remover regra?" confirmLabel="Remover" description={`"${removing?.name}" deixa de ser avaliada e o histórico dela é apagado.`}
        onConfirm={async () => { if (!removing) return; const { error } = await supabase!.from("automations").delete().eq("id", removing.id); if (error) toast({ tone: "error", title: "Não foi possível remover", description: "Só administradores do espaço removem regras." }); else toast({ tone: "info", title: "Regra removida" }); await load(); }} />
    </Page>
  );
}

function InstallModal({ template, ws, onOpenChange, onDone }: { template: RuleTemplate | null; ws: string; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [target, setTarget] = useState("Todas as campanhas");
  const [contains, setContains] = useState("");
  const [busy, setBusy] = useState(false);
  const defs = template ? PARAMS[template.id] ?? [] : [];
  useEffect(() => { setValues(Object.fromEntries(defs.filter((d) => d.def != null).map((d) => [d.key, String(d.def)]))); setTarget("Todas as campanhas"); setContains(""); }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = defs.some((d) => d.required && !(Number(values[d.key]?.replace(",", ".")) > 0)) || (target === "contem" && !contains.trim());
  const install = async (active: boolean) => {
    if (!template) return;
    setBusy(true);
    const params = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(String(v).replace(",", "."))]).filter(([, v]) => Number.isFinite(v as number) && (v as number) > 0));
    const user = (await supabase!.auth.getUser()).data.user;
    const { error } = await supabase!.from("automations").insert({
      workspace_id: ws, name: template.name, template_id: template.id, target: target === "contem" ? `Nome contém: ${contains.trim()}` : target, status: active ? "ativa" : "rascunho",
      trigger: { kind: "anuncios" }, logic: "E", conditions: { text: template.condition, rows: [] }, actions: { text: template.action, items: [] }, params, created_by: user?.id,
    });
    setBusy(false);
    if (error) { toast({ tone: "error", title: "Não foi possível salvar", description: error.message }); return; }
    toast({ tone: "success", title: active ? "Regra ativada" : "Regra salva desligada", description: active ? "Verificada de hora em hora. Use “Simular” para ver o que ela faria agora." : undefined });
    onDone();
  };
  return (
    <Modal open={!!template} onOpenChange={onOpenChange} size="lg" icon={template ? CAT_ICON[template.category] : undefined} title={template?.name ?? ""} description={template?.description}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={missing || busy} onClick={() => void install(false)}>Salvar desligada</Button><Button variant="primary" loading={busy} disabled={missing} onClick={() => void install(true)}>Ativar regra</Button></>}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Aplicar em" required className="md:col-span-2">{(p) => <Select id={p.id} value={target} onValueChange={setTarget} options={[{ value: "Todas as campanhas", label: "Todas as campanhas" }, { value: "Campanhas de vendas", label: "Campanhas de vendas" }, { value: "Campanhas de leads", label: "Campanhas de leads" }, { value: "contem", label: "Campanhas cujo nome contém…" }]} />}</Field>
        {target === "contem" && <Field label="Nome contém" required className="md:col-span-2">{(p) => <Input {...p} value={contains} onChange={(e) => setContains(e.target.value)} placeholder="Ex.: Remarketing" />}</Field>}
        {defs.map((d) => <Field key={d.key} label={d.label} required={d.required} hint={d.hint}>{(p) => <Input {...p} inputMode="decimal" value={values[d.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [d.key]: e.target.value.replace(/[^\d,.]/g, "") }))} prefix={d.unit === "R$" ? <span className="text-secondary font-bold">R$</span> : undefined} suffix={d.unit && d.unit !== "R$" ? <span className="text-secondary font-bold">{d.unit}</span> : undefined} className="num" />}</Field>)}
        <div className="md:col-span-2"><InlineNotice tone="info">Age nas campanhas das contas conectadas, no nível de campanha. Antes de ativar em contas grandes, salve desligada e use “Simular”.</InlineNotice></div>
      </div>
    </Modal>
  );
}
