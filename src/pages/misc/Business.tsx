import { ArrowRight, Bot, Cable, Code2, Copy, CreditCard, Gauge, Plus, Receipt, ShoppingBag, Sparkles, Terminal, Wallet } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { CREATOR_CAMPAIGNS, USAGE } from "@/data/demo/extra";
import { formatValue } from "@/lib/format";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Button, IconButton, buttonClasses } from "@/components/ui/Button";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { Select, Tooltip } from "@/components/ui/Menu";
import { SegmentedControl, TabPanel, Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { DemoBadge, EmptyState, InlineNotice } from "@/components/feedback/States";
import { Progress } from "@/components/data/Metrics";
import { DataTable } from "@/components/data/DataTable";
import { ListScreen } from "@/components/templates/ListScreen";

/* ------------------------------------------------------------------ Comércio (4 telas, mesmo estado na referência) */
function NoStore({ title }: { title: string }) {
  return (
    <Page>
      <PageHeader title={title} />
      <div className="panel"><EmptyState icon={<ShoppingBag />} title="Nenhuma loja conectada" description="Conecte uma loja Shopify ou um site WordPress com WooCommerce para gerenciar produtos, coleções e descontos aqui."
        actions={<Tooltip content="Requer integração com a loja"><span tabIndex={0}><Button variant="primary" icon={<Cable />} disabled>Conectar loja</Button></span></Tooltip>} /></div>
    </Page>
  );
}
export const CommerceProducts = () => <NoStore title="Produtos" />;
export const CommerceCollections = () => <NoStore title="Coleções" />;
export const CommerceDiscounts = () => <NoStore title="Descontos" />;
export const CommerceSync = () => <NoStore title="Sincronização de catálogo" />;

/* ------------------------------------------------------------------ Criadores */
export function Creators() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [model, setModel] = useState("cpm");
  type C = (typeof CREATOR_CAMPAIGNS)[number];
  return (
    <>
      <ListScreen<C> title="Criadores" description="Pague criadores por publicações que performam: cada post enviado é acompanhado, as views passam por checagem de autenticidade e os ganhos ficam registrados."
        rows={CREATOR_CAMPAIGNS} getId={(c) => c.id} searchText={(c) => c.name}
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>Criar campanha</Button>}
        before={
          <div className="grid grid-cols-1 gap-gutter md:grid-cols-3">
            {[["Crie a campanha", "Defina como os criadores recebem, o orçamento e as plataformas que contam."], ["Convide criadores", "Um link aberto ou convites individuais. Eles conectam as contas e enviam os posts."], ["Revise e pague", "Cada post aguarda sua decisão. Ganhos aprovados ficam pagáveis após o período de carência."]].map(([t, d], i) => (
              <div key={t} className="panel flex gap-3 p-4"><span className="num grid size-8 shrink-0 place-items-center rounded-md bg-soft font-mono text-[12px] font-bold">{i + 1}</span><div className="flex flex-col gap-1"><span className="t-title">{t}</span><span className="t-secondary">{d}</span></div></div>
            ))}
          </div>
        }
        columns={[
          { id: "n", header: "Campanha", sticky: true, cell: (c) => <span className="font-semibold">{c.name}</span> },
          { id: "st", header: "Status", cell: (c) => <StatusBadge tone={c.status === "Ativa" ? "positive" : "neutral"}>{c.status}</StatusBadge> },
          { id: "t", header: "Condições", cell: (c) => <Tag>{c.terms}</Tag> },
          { id: "b", header: "Orçamento usado", cell: (c) => <div className="flex w-40 flex-col gap-1"><Progress size="sm" value={c.budgetUsed} tone={c.budgetUsed >= 1 ? "neutral" : "accent"} ariaLabel="Orçamento usado" /><span className="num t-caption">{formatValue(c.budget * c.budgetUsed, "currency0")} de {formatValue(c.budget, "currency0")}</span></div> },
          { id: "cr", header: "Criadores", align: "right", cell: (c) => c.creators },
          { id: "w", header: "Aguardando você", align: "right", cell: (c) => <span className={c.waiting ? "font-bold text-warning" : "text-text-dim"}>{c.waiting}</span> },
        ]}
        empty={{ icon: <Sparkles />, title: "Nenhuma campanha com criadores" }} />
      <Modal open={open} onOpenChange={setOpen} icon={<Sparkles />} title="Criar campanha com criadores"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" disabled={!name.trim()} onClick={() => { toast({ tone: "success", title: "Campanha validada (demonstração)", description: "Pagamentos reais exigem saldo e integração." }); setOpen(false); setName(""); }}>Criar campanha</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Nome" required>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Unboxing Verão" />}</Field>
          <Field label="Como o criador recebe">{(p) => <Select id={p.id} value={model} onValueChange={setModel} options={[{ value: "cpm", label: "Por mil visualizações" }, { value: "post", label: "Valor fixo por post aprovado" }]} />}</Field>
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ Início */
export function Home() {
  const toast = useToast();
  const [mode, setMode] = useState<"mcp" | "cli">("mcp");
  const [tab, setTab] = useState("agente");
  const cmd = mode === "mcp" ? "claude mcp add --transport http ninepro https://mcp.ninepro.app/mcp" : "npx ninepro@latest login";
  return (
    <Page>
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <DemoBadge />
        <h1 className="t-display text-display-lg">Uma conexão.</h1>
        <p className="text-display-lg font-bold tracking-[-0.025em] text-text-dim max-sm:text-display">O NinePro opera todos os canais.</p>
      </div>
      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
        <div className="flex flex-col gap-gutter">
          <section className="panel flex flex-col gap-3 p-5">
            <Tag className="self-start">Plataformas</Tag>
            <h2 className="t-headline">Conecte suas contas</h2>
            <p className="t-secondary">Faça uma vez e qualquer agente consegue publicar, responder e ler as análises delas.</p>
            <Link to="/conexoes" className={buttonClasses("outline", "md", "self-start")}><Cable className="size-4" />Conectar contas</Link>
          </section>
          <section className="panel flex flex-col gap-3 p-5">
            <Tag className="self-start">Agentes</Tag>
            <ul className="flex flex-col divide-y divide-line-soft">
              {["Claude", "ChatGPT", "Cursor", "Gemini"].map((a) => (
                <li key={a} className="flex items-center justify-between py-2.5"><span className="flex items-center gap-2.5 text-body font-semibold"><Bot className="size-4 text-text-dim" />{a}</span><IconButton label={`Copiar instrução para ${a}`} size="sm" variant="outline" onClick={() => toast({ tone: "info", title: `Instrução para ${a} copiada` })}><Copy /></IconButton></li>
              ))}
            </ul>
          </section>
        </div>
        <section className="panel flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between"><Tag className="self-start">Início rápido</Tag><Link to="/chaves-api" className="flex items-center gap-1 text-secondary font-semibold text-text-muted hover:text-text">Gerenciar chaves <ArrowRight className="size-3.5" /></Link></div>
          <Tabs value={tab} onValueChange={setTab} items={[{ value: "agente", label: "Adicionar ao meu agente" }, { value: "app", label: "Integrar ao meu app" }]}>
            <TabPanel value="agente" className="flex flex-col gap-4 pt-4">
              <div className="flex flex-col gap-2"><span className="flex items-center gap-2 t-title"><span className="num grid size-6 place-items-center rounded-sm bg-soft font-mono text-[11px]">1</span>Conecte seu agente</span>
                <SegmentedControl ariaLabel="Método" size="sm" value={mode} onValueChange={setMode} options={[{ value: "mcp", label: "MCP", icon: <Terminal /> }, { value: "cli", label: "CLI", icon: <Code2 /> }]} />
                <div className="flex items-start gap-2 rounded-md border border-line bg-surface-2 p-3"><code className="flex-1 break-all font-mono text-[12px]">{cmd}</code><IconButton label="Copiar comando" size="sm" onClick={() => navigator.clipboard?.writeText(cmd).then(() => toast({ tone: "info", title: "Comando copiado" }), () => undefined)}><Copy /></IconButton></div>
                <p className="t-caption">Rode no terminal e entre com sua conta quando o agente pedir. (Endpoint ilustrativo — o servidor MCP do NinePro ainda não existe.)</p>
              </div>
              <div className="flex flex-col gap-2"><span className="flex items-center gap-2 t-title"><span className="num grid size-6 place-items-center rounded-sm bg-soft font-mono text-[11px]">2</span>Experimente</span>
                {["Agende o post de lançamento no LinkedIn e no Instagram para amanhã às 9h", "Responda as DMs não lidas", "Monte o relatório semanal de anúncios"].map((s) => <div key={s} className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-secondary"><span className="flex-1">{s}</span><IconButton label="Copiar" size="sm" onClick={() => toast({ tone: "info", title: "Exemplo copiado" })}><Copy /></IconButton></div>)}
              </div>
            </TabPanel>
            <TabPanel value="app" className="pt-4">
              <pre className="overflow-x-auto rounded-md border border-line bg-surface-2 p-4 font-mono text-[12px] leading-5 text-text-soft">{`const ninepro = new NinePro({ apiKey: process.env.NINEPRO_KEY });
await ninepro.posts.create({
  conteudo: "Acabamos de lançar",
  plataformas: ["linkedin", "instagram"],
  publicarAgora: true,
});`}</pre>
              <p className="mt-2 t-caption">SDK ilustrativo — a API pública do NinePro ainda não existe.</p>
            </TabPanel>
          </Tabs>
        </section>
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------------ Faturamento */
export function Billing() {
  const [auto, setAuto] = useState(true);
  return (
    <Page>
      <PageHeader meta={<DemoBadge />} title="Faturamento" description="Plano, saldo e forma de pagamento. Sem assinatura: desconecte contas e você para de pagar por elas." />
      {auto && <InlineNotice tone="warning" icon={<CreditCard />} action={<Button size="sm" disabled>Adicionar cartão</Button>}>A recarga automática está ligada, mas não há cartão. Adicione um cartão ou saldo para usar SMS, chamadas e novos números. Publicações e contas conectadas continuam funcionando.</InlineNotice>}
      <div className="grid grid-cols-1 gap-gutter md:grid-cols-3">
        <div className="panel flex flex-col gap-2 p-4"><span className="t-label">Plano</span><span className="text-kpi font-bold">Grátis</span><span className="t-secondary">Sem cartão cadastrado</span></div>
        <div className="panel flex flex-col gap-2 p-4"><span className="t-label">Contas conectadas</span><span className="num text-kpi font-bold">0 de 2</span><Progress size="sm" value={0} ariaLabel="Contas" /><span className="t-secondary">Grátis para sempre até 2 contas</span></div>
        <div className="panel flex flex-col gap-2 p-4"><span className="t-label">Saldo</span><span className="num text-kpi font-bold">{formatValue(0, "currency")}</span><div className="flex items-center justify-between"><span className="t-secondary">Recarga automática</span><button type="button" onClick={() => setAuto(!auto)} className={cn("rounded-sm px-2 py-0.5 text-caption font-bold", auto ? "bg-accent-tint text-accent-text" : "bg-soft text-text-muted")}>{auto ? "Ligada" : "Desligada"}</button></div></div>
      </div>
      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="t-title">O que um cartão libera</h2>
        <ul className="grid grid-cols-1 gap-2 text-secondary text-text-soft md:grid-cols-2">
          <li className="flex gap-2"><Receipt className="mt-0.5 size-4 shrink-0 text-text-dim" />Contas sociais adicionais, cobradas por mês; se a fatura passar de R$ 50 antes do dia 1º, é cobrada antes.</li>
          <li className="flex gap-2"><Wallet className="mt-0.5 size-4 shrink-0 text-text-dim" />SMS, chamadas, números e WhatsApp, pagos do saldo com recarga automática.</li>
        </ul>
        <div className="flex gap-2"><Button variant="primary" icon={<CreditCard />} disabled>Adicionar cartão</Button><Button disabled>Adicionar saldo</Button></div>
        <p className="t-caption">Pagamentos não estão disponíveis nesta versão.</p>
      </section>
    </Page>
  );
}

/* ------------------------------------------------------------------ Uso */
export function Usage() {
  const [period, setPeriod] = useState("30");
  const [tab, setTab] = useState("produto");
  const total = USAGE.reduce((a, u) => a + u.amount, 0);
  return (
    <Page>
      <PageHeader meta={<DemoBadge />} title="Uso" description="O que foi consumido e de onde saiu o pagamento."
        actions={<><Select className="w-[180px]" ariaLabel="Período" value={period} onValueChange={setPeriod} options={[{ value: "30", label: "Últimos 30 dias" }, { value: "90", label: "Últimos 90 dias" }]} /><Link to="/faturamento" className={buttonClasses("outline")}><Receipt className="size-4" />Faturamento</Link></>} />
      <Tabs value={tab} onValueChange={setTab} items={[{ value: "produto", label: "Por produto" }, { value: "conta", label: "Por conta" }]}>
        <TabPanel value="produto" className="pt-4">
          <section className="panel overflow-hidden">
            <DataTable caption="Uso por produto" rows={USAGE} getId={(u) => u.product} footerRow
              columns={[
                { id: "p", header: "Produto", sticky: true, cell: (u) => <span className="font-semibold">{u.product}</span>, footer: "Total" },
                { id: "u", header: "Usado", cell: (u) => <span className="num text-text-soft">{u.used}</span> },
                { id: "f", header: "Pago com", cell: (u) => <Tag>{u.paidFrom}</Tag> },
                { id: "v", header: "Valor", align: "right", sortValue: (u) => u.amount, cell: (u) => formatValue(u.amount, "currency"), footer: formatValue(total, "currency") },
                { id: "s", header: "Participação", align: "right", cell: (u) => <div className="ml-auto flex w-28 items-center gap-2"><Progress size="sm" value={total ? u.amount / total : 0} ariaLabel="Participação" /><span className="num w-10 text-right text-caption">{total ? Math.round((u.amount / total) * 100) : 0}%</span></div> },
              ]} />
          </section>
        </TabPanel>
        <TabPanel value="conta" className="pt-4"><div className="panel"><EmptyState icon={<Gauge />} title="Nenhuma cobrança por conta no período" description="Escolha um período maior para ver o uso anterior." /></div></TabPanel>
      </Tabs>
    </Page>
  );
}
