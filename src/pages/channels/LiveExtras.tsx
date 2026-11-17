import { BarChart3, Bot, Contact, Download, ExternalLink, Heart, Instagram, MessageCircle, MessagesSquare, Plus, Send, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/lib/supabase";
import { formatDateTime, formatValue } from "@/lib/format";
import { channelCall } from "@/lib/channelsApi";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Button, buttonClasses, IconButton } from "@/components/ui/Button";
import { Checkbox, Switch } from "@/components/ui/Controls";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, InlineNotice, LoadingState } from "@/components/feedback/States";
import { ListScreen } from "@/components/templates/ListScreen";
import { MetricCard } from "@/components/data/Metrics";
import { axisProps, ChartContainer, ChartLegend, ChartTooltip, gridProps } from "@/components/charts/Chart";
import { bodyOf, TEMPLATE_COLS, useChannelAccounts, varsOf, type WaTemplate } from "./shared";

const DAY = 86_400_000;
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const shortDay = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const lastDays = (n: number) => Array.from({ length: n }, (_, i) => dayKey(new Date(Date.now() - (n - 1 - i) * DAY)));

/* ------------------------------------------------------------------ Fluxos (respostas automáticas) */
interface Flow { id: string; name: string; status: "ativo" | "pausado"; trigger: "mensagem" | "primeira_mensagem" | "comentario" | "fora_do_horario"; channel: "todos" | "WhatsApp" | "Instagram"; match: "qualquer" | "contem" | "exata"; keywords: string[]; reply: string; comment_reply: string; hours: { start: string; end: string; days: number[] }; runs: number; last_run_at: string | null }
const TRIGGER_LABEL: Record<Flow["trigger"], string> = { mensagem: "Mensagem recebida", primeira_mensagem: "Primeira mensagem do contato", comentario: "Comentário no Instagram", fora_do_horario: "Mensagem fora do horário" };
const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const blankFlow = (): Omit<Flow, "id" | "runs" | "last_run_at"> => ({ name: "", status: "ativo", trigger: "primeira_mensagem", channel: "todos", match: "qualquer", keywords: [], reply: "", comment_reply: "", hours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] } });

export function LiveFlows() {
  const toast = useToast();
  const { accounts, ws, admin } = useChannelAccounts();
  const [rows, setRows] = useState<Flow[] | null>(null);
  const [editing, setEditing] = useState<Flow | "novo" | null>(null);
  const [removing, setRemoving] = useState<Flow | null>(null);
  const load = useCallback(async () => {
    if (!supabase || !ws) return;
    const { data } = await supabase.from("inbox_flows").select("id, name, status, trigger, channel, match, keywords, reply, comment_reply, hours, runs, last_run_at").eq("workspace_id", ws).order("created_at");
    setRows((data as Flow[] | null) ?? []);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  if (accounts === null || rows === null) return <Page><PageHeader title="Fluxos" /><LoadingState /></Page>;
  return (
    <>
      <ListScreen<Flow> demo={false} title="Fluxos" description="Respostas automáticas: boas-vindas, fora do horário, palavras-chave e comentário que vira mensagem direta."
        rows={rows} getId={(f) => f.id} searchText={(f) => `${f.name} ${f.keywords.join(" ")}`} refreshable onRefresh={load}
        actions={admin ? <Button variant="primary" icon={<Plus />} onClick={() => setEditing("novo")}>Novo fluxo</Button> : undefined}
        before={!accounts.length ? <InlineNotice tone="info" action={<Link to="/conexoes" className={buttonClasses("outline", "sm")}>Conectar</Link>}>Os fluxos respondem pelo WhatsApp e pelo Instagram conectados. Conecte um canal para começar.</InlineNotice> : undefined}
        columns={[
          { id: "n", header: "Fluxo", sticky: true, cell: (f) => <div className="flex max-w-[420px] flex-col gap-0.5"><span className="font-semibold">{f.name}</span><span className="line-clamp-1 whitespace-normal t-secondary">{f.reply || f.comment_reply}</span></div> },
          { id: "t", header: "Quando", cell: (f) => <div className="flex flex-col"><span>{TRIGGER_LABEL[f.trigger]}</span>{f.match !== "qualquer" && f.keywords.length > 0 && <span className="t-caption">{f.match === "exata" ? "Exatamente: " : "Contém: "}{f.keywords.join(", ")}</span>}{f.trigger === "fora_do_horario" && <span className="t-caption">Atende {f.hours.days.map((d) => WEEK[d]).join(", ")} · {f.hours.start}–{f.hours.end}</span>}</div> },
          { id: "c", header: "Canal", cell: (f) => <Tag>{f.trigger === "comentario" ? "Instagram" : f.channel === "todos" ? "WhatsApp e Instagram" : f.channel}</Tag> },
          { id: "r", header: "Execuções", align: "right", sortValue: (f) => f.runs, cell: (f) => <div className="flex flex-col items-end"><span className="num">{f.runs.toLocaleString("pt-BR")}</span>{f.last_run_at && <span className="t-caption">{formatDateTime(new Date(f.last_run_at))}</span>}</div> },
          { id: "s", header: "Status", cell: (f) => <div className="flex items-center gap-2"><Switch size="sm" ariaLabel={`Ativar ${f.name}`} disabled={!admin} checked={f.status === "ativo"} onCheckedChange={async (v) => { await supabase!.from("inbox_flows").update({ status: v ? "ativo" : "pausado", updated_at: new Date().toISOString() }).eq("id", f.id); await load(); }} /><StatusBadge tone={f.status === "ativo" ? "positive" : "neutral"}>{f.status === "ativo" ? "Ativo" : "Pausado"}</StatusBadge></div> },
          { id: "a", header: "", align: "right", cell: (f) => admin ? <span className="flex justify-end gap-1"><Button size="sm" onClick={() => setEditing(f)}>Editar</Button><IconButton size="sm" label={`Excluir ${f.name}`} onClick={() => setRemoving(f)}><Trash2 /></IconButton></span> : null },
        ]}
        empty={{ icon: <Bot />, title: "Nenhum fluxo ainda", description: "Crie uma mensagem de boas-vindas, uma resposta fora do horário ou envie um cupom por DM para quem comentar uma palavra.", action: admin ? <Button variant="primary" icon={<Plus />} onClick={() => setEditing("novo")}>Novo fluxo</Button> : undefined }} />
      {ws && <FlowModal flow={editing} ws={ws} onOpenChange={(o) => !o && setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Excluir fluxo?" confirmLabel="Excluir" description={`"${removing?.name}" para de responder automaticamente.`}
        onConfirm={async () => { const { error } = await supabase!.from("inbox_flows").delete().eq("id", removing!.id); if (error) toast({ tone: "error", title: "Não foi possível excluir", description: error.message }); await load(); }} />
    </>
  );
}

function FlowModal({ flow, ws, onOpenChange, onSaved }: { flow: Flow | "novo" | null; ws: string; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(blankFlow());
  const [kw, setKw] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!flow) return; const v = flow === "novo" ? blankFlow() : { ...flow }; setF(v); setKw(v.keywords.join(", ")); }, [flow]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const isComment = f.trigger === "comentario";
  const valid = f.name.trim().length > 1 && (f.reply.trim() || (isComment && f.comment_reply.trim())) && (f.match === "qualquer" || kw.trim());
  const save = async () => {
    setBusy(true);
    const row = { ...f, name: f.name.trim(), keywords: f.match === "qualquer" ? [] : kw.split(",").map((k) => k.trim()).filter(Boolean), channel: isComment ? "Instagram" : f.channel, updated_at: new Date().toISOString() };
    const { error } = flow && flow !== "novo" ? await supabase!.from("inbox_flows").update(row).eq("id", flow.id) : await supabase!.from("inbox_flows").insert({ ...row, workspace_id: ws, created_by: (await supabase!.auth.getUser()).data.user?.id });
    setBusy(false);
    if (error) { toast({ tone: "error", title: "Não foi possível salvar", description: error.message }); return; }
    toast({ tone: "success", title: "Fluxo salvo", description: f.status === "ativo" ? "Já está respondendo." : undefined });
    onSaved();
  };
  return (
    <Modal open={!!flow} onOpenChange={onOpenChange} size="lg" icon={<Bot />} title={flow && flow !== "novo" ? "Editar fluxo" : "Novo fluxo"}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={() => void save()}>Salvar</Button></>}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Nome" required className="md:col-span-2">{(p) => <Input {...p} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Boas-vindas" />}</Field>
        <Field label="Quando">{(p) => <Select id={p.id} value={f.trigger} onValueChange={(v) => set("trigger", v as Flow["trigger"])} options={Object.entries(TRIGGER_LABEL).map(([value, label]) => ({ value, label }))} />}</Field>
        {!isComment ? <Field label="Canal">{(p) => <Select id={p.id} value={f.channel} onValueChange={(v) => set("channel", v as Flow["channel"])} options={[{ value: "todos", label: "WhatsApp e Instagram" }, { value: "WhatsApp", label: "Só WhatsApp" }, { value: "Instagram", label: "Só Instagram" }]} />}</Field> : <div />}
        <Field label="Texto recebido">{(p) => <Select id={p.id} value={f.match} onValueChange={(v) => set("match", v as Flow["match"])} options={[{ value: "qualquer", label: "Qualquer texto" }, { value: "contem", label: "Contém uma das palavras" }, { value: "exata", label: "É exatamente uma das palavras" }]} />}</Field>
        {f.match !== "qualquer" ? <Field label="Palavras" required hint="Separe por vírgula. Maiúsculas e acentos não importam.">{(p) => <Input {...p} value={kw} onChange={(e) => setKw(e.target.value)} placeholder="preço, valor, quanto custa" />}</Field> : <div />}
        {f.trigger === "fora_do_horario" && (
          <div className="flex flex-col gap-2 md:col-span-2">
            <span className="text-secondary font-semibold text-text-soft">Horário de atendimento (Brasília)</span>
            <div className="flex flex-wrap items-center gap-2"><Input type="time" value={f.hours.start} onChange={(e) => set("hours", { ...f.hours, start: e.target.value })} className="w-[120px]" /><span className="t-secondary">às</span><Input type="time" value={f.hours.end} onChange={(e) => set("hours", { ...f.hours, end: e.target.value })} className="w-[120px]" /></div>
            <div className="flex flex-wrap gap-3">{WEEK.map((d, i) => <Checkbox key={d} label={d} checked={f.hours.days.includes(i)} onCheckedChange={(v) => set("hours", { ...f.hours, days: v ? [...f.hours.days, i].sort() : f.hours.days.filter((x) => x !== i) })} />)}</div>
            <span className="t-caption">Fora desse horário, quem escrever recebe a resposta abaixo (uma vez a cada 6 horas por conversa).</span>
          </div>
        )}
        {isComment && <Field label="Resposta pública no comentário" hint="Opcional. Ex.: “Te mandei no direct! 💌”" className="md:col-span-2">{(p) => <Input {...p} value={f.comment_reply} onChange={(e) => set("comment_reply", e.target.value)} />}</Field>}
        <Field label={isComment ? "Mensagem direta para quem comentou" : "Resposta"} required={!isComment} hint="Use {{nome}} ou {{primeiro_nome}} para personalizar." className="md:col-span-2">{(p) => <Textarea id={p.id} value={f.reply} onChange={(e) => set("reply", e.target.value)} rows={4} maxLength={1000} placeholder={isComment ? "Oi! Aqui está o seu cupom: PROMO10" : "Olá {{primeiro_nome}}! Recebemos sua mensagem e já vamos te responder."} />}</Field>
        <div className="md:col-span-2"><Switch checked={f.status === "ativo"} onCheckedChange={(v) => set("status", v ? "ativo" : "pausado")} label="Ativo" description="Só o primeiro fluxo que combinar responde. A mesma conversa não recebe o mesmo fluxo de novo por 6 horas." /></div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Disparos (campanhas de mensagens) */
interface Broadcast { id: string; name: string; template_name: string | null; status: "rascunho" | "enviando" | "concluida" | "falhou"; total: number; sent: number; failed: number; created_at: string; finished_at: string | null }
const BC_STATUS: Record<Broadcast["status"], { label: string; tone: "positive" | "info" | "negative" | "neutral" }> = { rascunho: { label: "Rascunho", tone: "neutral" }, enviando: { label: "Enviando", tone: "info" }, concluida: { label: "Concluído", tone: "positive" }, falhou: { label: "Falhou", tone: "negative" } };

export function LiveBroadcasts() {
  const { accounts, ws, admin } = useChannelAccounts("whatsapp");
  const [rows, setRows] = useState<Broadcast[] | null>(null);
  const [stats, setStats] = useState<Record<string, { entregue: number; lida: number }>>({});
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    if (!supabase || !ws) return;
    const { data } = await supabase.from("msg_campaigns").select("id, name, template_name, status, total, sent, failed, created_at, finished_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(50);
    const list = (data as Broadcast[] | null) ?? [];
    setRows(list);
    const entries = await Promise.all(list.slice(0, 20).map(async (b) => {
      const [d, r] = await Promise.all(["entregue", "lida"].map((s) => supabase!.from("msg_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", b.id).eq("status", s)));
      return [b.id, { entregue: (d.count ?? 0) + (r.count ?? 0), lida: r.count ?? 0 }] as const;
    }));
    setStats(Object.fromEntries(entries));
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!rows?.some((r) => r.status === "enviando")) return; const t = setInterval(() => void load(), 10_000); return () => clearInterval(t); }, [rows, load]);
  if (accounts === null || rows === null) return <Page><PageHeader title="Campanhas" /><LoadingState /></Page>;
  if (!accounts.length) return <Page><PageHeader title="Campanhas" /><div className="panel"><EmptyState icon={<Send />} title="Conecte o WhatsApp Business" description="Os disparos usam modelos aprovados do WhatsApp para falar com vários contatos de uma vez." actions={<Link to="/conexoes" className={buttonClasses("primary")}>Conectar WhatsApp</Link>} /></div></Page>;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <>
      <ListScreen<Broadcast> demo={false} title="Campanhas" description="Disparos de um modelo do WhatsApp para uma lista de contatos, com entrega e leitura acompanhadas."
        rows={rows} getId={(b) => b.id} searchText={(b) => b.name} refreshable onRefresh={load}
        actions={admin ? <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>Novo disparo</Button> : undefined}
        columns={[
          { id: "n", header: "Disparo", sticky: true, cell: (b) => <div className="flex flex-col"><span className="font-semibold">{b.name}</span><span className="font-mono text-[11.5px] text-text-dim">{b.template_name}</span></div> },
          { id: "s", header: "Status", cell: (b) => <StatusBadge tone={BC_STATUS[b.status].tone} pulse={b.status === "enviando"}>{BC_STATUS[b.status].label}</StatusBadge> },
          { id: "t", header: "Contatos", align: "right", cell: (b) => <span className="num">{b.total.toLocaleString("pt-BR")}</span> },
          { id: "e", header: "Enviadas", align: "right", cell: (b) => <span className="num">{b.sent.toLocaleString("pt-BR")}{b.failed ? <span className="text-negative"> · {b.failed} falharam</span> : null}</span> },
          { id: "d", header: "Entregues", align: "right", cell: (b) => <span className="num">{pct(stats[b.id]?.entregue ?? 0, b.sent)}</span> },
          { id: "l", header: "Lidas", align: "right", cell: (b) => <span className="num">{pct(stats[b.id]?.lida ?? 0, b.sent)}</span> },
          { id: "c", header: "Criado", align: "right", sortValue: (b) => Date.parse(b.created_at), cell: (b) => <span className="text-text-soft">{formatDateTime(new Date(b.created_at))}</span> },
        ]}
        empty={{ icon: <Send />, title: "Nenhum disparo ainda", description: "Envie um modelo aprovado para a sua lista: promoções, lembretes, avisos de pedido.", action: admin ? <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>Novo disparo</Button> : undefined }}
        after={<p className="t-caption">Envie só para quem autorizou receber mensagens da sua empresa (regra da Meta). Respostas chegam na caixa de entrada.</p>} />
      {ws && <BroadcastModal open={creating} onOpenChange={setCreating} ws={ws} onDone={() => { setCreating(false); void load(); }} />}
    </>
  );
}

function parseRecipients(text: string) {
  const seen = new Set<string>();
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [a, ...rest] = l.split(/[;,\t]/);
    const phone = (a ?? "").replace(/\D/g, "");
    return { phone, name: rest.join(" ").trim() };
  }).filter((r) => r.phone.length >= 10 && r.phone.length <= 15 && !seen.has(r.phone) && (seen.add(r.phone), true));
}

function BroadcastModal({ open, onOpenChange, ws, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; ws: string; onDone: () => void }) {
  const toast = useToast();
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [name, setName] = useState("");
  const [tplId, setTplId] = useState("");
  const [vars, setVars] = useState<string[]>([]);
  const [list, setList] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !supabase) return;
    setName(""); setTplId(""); setVars([]); setList(""); setError(null);
    void supabase.from("wa_templates").select(TEMPLATE_COLS).eq("workspace_id", ws).eq("status", "APPROVED").order("name").then(({ data }) => setTemplates((data as WaTemplate[] | null) ?? []));
  }, [open, ws]);
  const tpl = templates.find((t) => t.id === tplId);
  const varList = tpl ? varsOf(bodyOf(tpl)) : [];
  const recipients = useMemo(() => parseRecipients(list), [list]);
  const importContacts = async () => {
    const { data } = await supabase!.from("conversations").select("contact_name, contact_handle, external_thread_id").eq("workspace_id", ws).eq("channel", "WhatsApp").limit(5000);
    const lines = (data ?? []).map((c) => `${String(c.external_thread_id)};${String(c.contact_name).startsWith("+") ? "" : c.contact_name}`);
    setList((l) => [l.trim(), ...lines].filter(Boolean).join("\n"));
  };
  const valid = !!tpl && name.trim().length > 1 && recipients.length > 0 && varList.every((n) => (vars[n - 1] ?? "").trim());
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await channelCall<{ status: string; sent: number; total: number }>({ action: "broadcast_create", workspaceId: ws, name, templateId: tplId, params: varList.map((n) => vars[n - 1] ?? ""), recipients });
      toast({ tone: "success", title: r.status === "concluida" ? "Disparo concluído" : "Disparo em andamento", description: `${r.sent} de ${r.total} enviadas${r.status === "enviando" ? ". O restante continua em segundo plano." : "."}` });
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" icon={<Send />} title="Novo disparo" description="Um modelo aprovado do WhatsApp para vários contatos."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={() => void submit()}>Enviar para {recipients.length.toLocaleString("pt-BR")} contato(s)</Button></>}>
      {templates.length === 0 ? <InlineNotice tone="info">Nenhum modelo aprovado. Crie um em WhatsApp › Modelos e aguarde a aprovação.</InlineNotice> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nome do disparo" required>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Black Friday — clientes" />}</Field>
          <Field label="Modelo" required>{(p) => <Select id={p.id} value={tplId} onValueChange={(v) => { setTplId(v); setVars([]); }} placeholder="Escolha" options={templates.map((t) => ({ value: t.id, label: `${t.name} · ${t.language}` }))} />}</Field>
          {tpl && <p className="whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-3 text-body md:col-span-2">{bodyOf(tpl)}</p>}
          {varList.map((n) => <Field key={n} label={`Variável {{${n}}}`} required hint="Pode usar {{nome}} para o nome de cada contato.">{(p) => <Input {...p} value={vars[n - 1] ?? ""} onChange={(e) => setVars((v) => { const c = [...v]; c[n - 1] = e.target.value; return c; })} />}</Field>)}
          <Field label="Contatos" required hint={`Um por linha: número com DDI e DDD; nome (opcional). ${recipients.length} válido(s).`} className="md:col-span-2">{(p) => <Textarea id={p.id} value={list} onChange={(e) => setList(e.target.value)} rows={7} placeholder={"5511912345678;Mariana\n5521998887777;Pedro"} className="font-mono text-[12px]" />}</Field>
          <div className="md:col-span-2"><Button size="sm" variant="ghost" icon={<Users />} onClick={() => void importContacts()}>Adicionar todos os contatos do WhatsApp</Button></div>
          {error && <div className="md:col-span-2"><InlineNotice tone="negative">{error}</InlineNotice></div>}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ Contatos */
interface ContactRow { id: string; channel: string; contact_name: string; contact_handle: string | null; contact_picture: string | null; tags: string[]; notes: string | null; last_message_at: string; last_message_preview: string | null; status: string }
export function LiveContacts() {
  const toast = useToast();
  const navigate = useNavigate();
  const { ws } = useChannelAccounts();
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const load = useCallback(async () => {
    if (!supabase || !ws) return;
    const { data } = await supabase.from("conversations").select("id, channel, contact_name, contact_handle, contact_picture, tags, notes, last_message_at, last_message_preview, status").eq("workspace_id", ws).not("channel_account_id", "is", null).order("last_message_at", { ascending: false }).limit(2000);
    setRows((data as ContactRow[] | null) ?? []);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (editing) { setNotes(editing.notes ?? ""); setTags(editing.tags.join(", ")); } }, [editing]);
  const allTags = useMemo(() => [...new Set((rows ?? []).flatMap((r) => r.tags))].sort(), [rows]);
  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = ["nome;identificador;canal;etiquetas;ultima_mensagem", ...(rows ?? []).map((r) => [r.contact_name, r.contact_handle ?? "", r.channel, r.tags.join(","), r.last_message_at].map(esc).join(";"))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "contatos-ninepro.csv"; a.click();
  };
  if (rows === null) return <Page><PageHeader title="Contatos" /><LoadingState /></Page>;
  return (
    <>
      <ListScreen<ContactRow> demo={false} title="Contatos" description="Todo mundo que conversou com você no WhatsApp e no Instagram, com etiquetas e anotações da equipe."
        rows={rows} getId={(r) => r.id} searchText={(r) => `${r.contact_name} ${r.contact_handle ?? ""} ${r.tags.join(" ")} ${r.notes ?? ""}`} refreshable onRefresh={load} onRowClick={setEditing}
        filters={[{ id: "c", label: "Canal", options: [{ value: "WhatsApp", label: "WhatsApp" }, { value: "Instagram", label: "Instagram" }], match: (r, v) => r.channel === v }, ...(allTags.length ? [{ id: "t", label: "Etiqueta", options: allTags.map((t) => ({ value: t, label: t })), match: (r: ContactRow, v: string) => r.tags.includes(v) }] : [])]}
        actions={rows.length ? <Button icon={<Download />} onClick={exportCsv}>Exportar CSV</Button> : undefined}
        columns={[
          { id: "n", header: "Contato", sticky: true, sortValue: (r) => r.contact_name, cell: (r) => <div className="flex items-center gap-2.5">{r.contact_picture ? <img src={r.contact_picture} alt="" className="size-8 rounded-full object-cover" /> : <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-[11px] font-bold text-text-muted">{r.contact_name.replace(/[^\p{L}]/gu, "").slice(0, 2).toUpperCase() || "?"}</span>}<div className="flex flex-col"><span className="font-semibold">{r.contact_name}</span><span className="t-caption">{r.contact_handle}</span></div></div> },
          { id: "c", header: "Canal", cell: (r) => <Tag className="gap-1">{r.channel === "Instagram" ? <Instagram className="size-3" /> : <MessageCircle className="size-3" />}{r.channel}</Tag> },
          { id: "t", header: "Etiquetas", cell: (r) => <span className="flex flex-wrap gap-1">{r.tags.map((t) => <Tag key={t} tone="accent">{t}</Tag>)}</span> },
          { id: "o", header: "Anotação", cell: (r) => <span className="line-clamp-1 max-w-[260px] whitespace-normal t-secondary">{r.notes}</span> },
          { id: "l", header: "Última mensagem", align: "right", sortValue: (r) => Date.parse(r.last_message_at), cell: (r) => <span className="text-text-soft">{formatDateTime(new Date(r.last_message_at))}</span> },
        ]}
        empty={{ icon: <Contact />, title: "Nenhum contato ainda", description: "Os contatos aparecem quando alguém conversa com você no WhatsApp ou no Instagram." }} />
      <Drawer open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.contact_name ?? ""} description={editing ? `${editing.channel} · ${editing.contact_handle ?? ""}` : undefined} icon={<Contact />}
        footer={<><Button variant="ghost" onClick={() => navigate(`/caixa-de-entrada/mensagens?conversa=${editing?.id}`)}>Abrir conversa</Button><Button variant="primary" onClick={async () => {
          const { error } = await supabase!.from("conversations").update({ notes: notes.trim() || null, tags: [...new Set(tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))] }).eq("id", editing!.id);
          if (error) toast({ tone: "error", title: "Não foi possível salvar", description: error.message }); else { toast({ tone: "success", title: "Contato atualizado" }); setEditing(null); void load(); }
        }}>Salvar</Button></>}>
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Etiquetas" hint="Separe por vírgula. Ex.: cliente, vip, orçamento">{(p) => <Input {...p} value={tags} onChange={(e) => setTags(e.target.value)} />}</Field>
            <Field label="Anotações da equipe">{(p) => <Textarea id={p.id} value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} />}</Field>
            {editing.last_message_preview && <div className="rounded-md border border-line bg-surface-2 p-3"><span className="t-label !text-[10px]">Última mensagem</span><p className="mt-1 t-secondary">{editing.last_message_preview}</p></div>}
          </div>
        )}
      </Drawer>
    </>
  );
}

/* ------------------------------------------------------------------ Análises da caixa de entrada */
interface MsgLite { conversation_id: string; direction: "in" | "out"; sent_at: string; kind: string }
export function LiveInboxAnalytics() {
  const { ws } = useChannelAccounts();
  const [days, setDays] = useState<"7" | "30">("30");
  const [data, setData] = useState<{ convs: { id: string; channel: string; status: string }[]; msgs: MsgLite[] } | null>(null);
  useEffect(() => {
    if (!supabase || !ws) return;
    const since = new Date(Date.now() - Number(days) * DAY).toISOString();
    void (async () => {
      const msgs: MsgLite[] = [];
      for (let from = 0; from < 20_000; from += 1000) {
        const { data: page } = await supabase!.from("messages").select("conversation_id, direction, sent_at, kind").eq("workspace_id", ws).gte("sent_at", since).order("sent_at").range(from, from + 999);
        msgs.push(...((page as MsgLite[] | null) ?? []));
        if (!page || page.length < 1000) break;
      }
      const { data: convs } = await supabase!.from("conversations").select("id, channel, status").eq("workspace_id", ws).not("channel_account_id", "is", null);
      setData({ convs: (convs as { id: string; channel: string; status: string }[] | null) ?? [], msgs });
    })();
  }, [ws, days]);
  const m = useMemo(() => {
    if (!data) return null;
    const keys = lastDays(Number(days));
    const per = new Map(keys.map((k) => [k, { dia: shortDay(k), recebidas: 0, enviadas: 0 }]));
    const byConv = new Map<string, MsgLite[]>();
    for (const x of data.msgs) { const k = dayKey(new Date(x.sent_at)); const p = per.get(k); if (p) p[x.direction === "in" ? "recebidas" : "enviadas"]++; const l = byConv.get(x.conversation_id) ?? []; l.push(x); byConv.set(x.conversation_id, l); }
    const firstResp: number[] = [];
    let auto = 0;
    for (const list of byConv.values()) {
      const i = list.findIndex((x) => x.direction === "in");
      if (i < 0) continue;
      const o = list.slice(i + 1).find((x) => x.direction === "out" && x.kind !== "auto");
      if (o) firstResp.push((Date.parse(o.sent_at) - Date.parse(list[i].sent_at)) / 60000);
    }
    for (const x of data.msgs) if (x.kind === "auto") auto++;
    const median = firstResp.length ? [...firstResp].sort((a, b) => a - b)[Math.floor(firstResp.length / 2)] : NaN;
    const active = new Set(data.msgs.map((x) => x.conversation_id));
    const chans = data.convs.filter((c) => active.has(c.id));
    return { series: [...per.values()], inbound: data.msgs.filter((x) => x.direction === "in").length, outbound: data.msgs.filter((x) => x.direction === "out").length, conversations: active.size, median, auto, wa: chans.filter((c) => c.channel === "WhatsApp").length, ig: chans.filter((c) => c.channel === "Instagram").length, resolved: chans.filter((c) => c.status === "Resolvida").length };
  }, [data, days]);
  return (
    <Page>
      <PageHeader title="Análises da caixa de entrada" description="Volume de conversas e velocidade de resposta da equipe no WhatsApp e no Instagram."
        actions={<SegmentedControl ariaLabel="Período" value={days} onValueChange={setDays} options={[{ value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }]} />} />
      {!m ? <LoadingState /> : m.conversations === 0 ? <div className="panel"><EmptyState icon={<BarChart3 />} title="Sem mensagens no período" description="As métricas aparecem quando chegarem mensagens pelo WhatsApp ou pelo Instagram." actions={<Link to="/conexoes" className={buttonClasses("outline")}>Ver conexões</Link>} /></div> : (
        <>
          <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
            <MetricCard label="Conversas com mensagens" value={m.conversations} format="integer" footer={<span className="t-caption">WhatsApp {m.wa} · Instagram {m.ig}</span>} />
            <MetricCard label="Mensagens recebidas" value={m.inbound} format="integer" />
            <MetricCard label="Mensagens enviadas" value={m.outbound} format="integer" footer={<span className="t-caption">{m.auto} automáticas (fluxos)</span>} />
            <MetricCard label="Tempo mediano da 1ª resposta" value={m.median} format="decimal" footer={<span className="t-caption">minutos, sem contar respostas automáticas</span>} />
          </div>
          <ChartContainer title="Mensagens por dia" subtitle={`Últimos ${days} dias`} legend={<ChartLegend items={[{ id: "recebidas", label: "Recebidas", color: "var(--series-1)" }, { id: "enviadas", label: "Enviadas", color: "var(--series-2)" }]} />}>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={m.series} barGap={2}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="dia" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis {...axisProps} width={36} allowDecimals={false} />
                  <RTooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip format="integer" names={{ recebidas: "Recebidas", enviadas: "Enviadas" }} />} />
                  <Bar dataKey="recebidas" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="enviadas" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartContainer>
          <p className="t-caption">{m.resolved} de {m.conversations} conversas do período estão marcadas como resolvidas.</p>
        </>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ Análises de publicações (Instagram) */
interface MediaStat { media_id: string; caption: string | null; permalink: string | null; thumbnail: string | null; media_type: string | null; posted_at: string | null; likes: number; comments: number; reach: number | null; views: number | null; saved: number | null; shares: number | null; updated_at: string }
export function LivePostAnalytics() {
  const { accounts, ws } = useChannelAccounts("instagram");
  const [rows, setRows] = useState<MediaStat[] | null>(null);
  useEffect(() => {
    if (!supabase || !ws) return;
    void supabase.from("social_media_stats").select("media_id, caption, permalink, thumbnail, media_type, posted_at, likes, comments, reach, views, saved, shares, updated_at").eq("workspace_id", ws).order("posted_at", { ascending: false }).limit(100).then(({ data }) => setRows((data as MediaStat[] | null) ?? []));
  }, [ws]);
  if (accounts === null || rows === null) return <Page><PageHeader title="Análises de publicações" /><LoadingState /></Page>;
  if (!accounts.length) return <Page><PageHeader title="Análises de publicações" /><div className="panel"><EmptyState icon={<Instagram />} title="Conecte o Instagram" description="Curtidas, comentários, alcance e salvamentos de cada publicação aparecem aqui." actions={<Link to="/conexoes" className={buttonClasses("primary")}>Conectar Instagram</Link>} /></div></Page>;
  const sum = (k: keyof MediaStat) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const engagement = sum("likes") + sum("comments") + sum("saved") + sum("shares");
  return (
    <>
      {rows.length > 0 && (
        <Page className="!pb-0">
          <PageHeader title="Análises de publicações" description={`Últimas ${rows.length} publicações do Instagram. Atualizado a cada 12 horas ou em Conexões › Atualizar.`} />
          <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
            <MetricCard label="Curtidas" value={sum("likes")} format="compact" icon={<Heart />} />
            <MetricCard label="Comentários" value={sum("comments")} format="compact" icon={<MessagesSquare />} />
            <MetricCard label="Alcance somado" value={sum("reach")} format="compact" />
            <MetricCard label="Engajamento por alcance" value={sum("reach") ? engagement / sum("reach") : NaN} format="percent" />
          </div>
        </Page>
      )}
      <ListScreen<MediaStat> demo={false} title={rows.length ? "Publicações" : "Análises de publicações"} rows={rows} getId={(r) => r.media_id} searchText={(r) => r.caption ?? ""} defaultSort={{ id: "d", dir: "desc" }}
        columns={[
          { id: "p", header: "Publicação", sticky: true, cell: (r) => <a href={r.permalink ?? undefined} target="_blank" rel="noreferrer" className="flex max-w-[380px] items-center gap-3 hover:underline">{r.thumbnail && <img src={r.thumbnail} alt="" className="size-11 shrink-0 rounded object-cover" />}<span className="line-clamp-2 whitespace-normal">{r.caption || "(sem legenda)"}</span><ExternalLink className="size-3 shrink-0 text-text-dim" /></a> },
          { id: "t", header: "Tipo", cell: (r) => <Tag>{{ IMAGE: "Imagem", VIDEO: "Vídeo", CAROUSEL_ALBUM: "Carrossel" }[r.media_type ?? ""] ?? r.media_type ?? "—"}</Tag> },
          { id: "l", header: "Curtidas", align: "right", sortValue: (r) => r.likes, cell: (r) => <span className="num">{formatValue(r.likes, "integer")}</span> },
          { id: "c", header: "Comentários", align: "right", sortValue: (r) => r.comments, cell: (r) => <span className="num">{formatValue(r.comments, "integer")}</span> },
          { id: "r", header: "Alcance", align: "right", sortValue: (r) => r.reach ?? 0, cell: (r) => <span className="num">{formatValue(r.reach, "integer")}</span> },
          { id: "v", header: "Visualizações", align: "right", sortValue: (r) => r.views ?? 0, cell: (r) => <span className="num">{formatValue(r.views, "integer")}</span> },
          { id: "s", header: "Salvos", align: "right", sortValue: (r) => r.saved ?? 0, cell: (r) => <span className="num">{formatValue(r.saved, "integer")}</span> },
          { id: "d", header: "Publicado", align: "right", sortValue: (r) => Date.parse(r.posted_at ?? ""), cell: (r) => <span className="text-text-soft">{r.posted_at ? formatDateTime(new Date(r.posted_at)) : "—"}</span> },
        ]}
        empty={{ icon: <BarChart3 />, title: "Ainda sem estatísticas", description: "Clique em Conexões › Instagram › Atualizar para trazer as publicações recentes." }} />
    </>
  );
}
