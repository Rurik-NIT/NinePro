import { ListChecks, ListOrdered, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/format";
import { channelCall, type ChannelAccount } from "@/lib/channelsApi";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Button, buttonClasses, IconButton } from "@/components/ui/Button";
import { Checkbox, Switch } from "@/components/ui/Controls";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, InlineNotice, LoadingState } from "@/components/feedback/States";
import { ListScreen } from "@/components/templates/ListScreen";
import { NETWORK, PUBLISH_KINDS } from "@/config/networks";
import { bodyOf, TEMPLATE_COLS, useChannelAccounts, type WaTemplate } from "./shared";

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ------------------------------------------------------------------ Filas de publicação */
interface Slot { day: number; time: string }
interface Queue { id: string; name: string; timezone: string; slots: Slot[]; account_ids: string[]; active: boolean; is_default: boolean }
interface QueuedPost { id: string; content: string; title: string | null; scheduled_at: string; channel_account_ids: string[]; queue_id: string }

export function LiveQueues() {
  const toast = useToast();
  const { accounts, ws, admin } = useChannelAccounts(PUBLISH_KINDS);
  const [queues, setQueues] = useState<Queue[] | null>(null);
  const [posts, setPosts] = useState<QueuedPost[]>([]);
  const [next, setNext] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<Queue | "nova" | null>(null);
  const [removing, setRemoving] = useState<Queue | null>(null);
  const load = useCallback(async () => {
    if (!supabase || !ws) return;
    const [q, p] = await Promise.all([
      supabase.from("post_queues").select("*").eq("workspace_id", ws).order("created_at"),
      supabase.from("posts").select("id, content, title, scheduled_at, channel_account_ids, queue_id").eq("workspace_id", ws).eq("status", "agendada").not("queue_id", "is", null).order("scheduled_at").limit(200),
    ]);
    const list = (q.data as Queue[] | null) ?? [];
    setQueues(list); setPosts((p.data as QueuedPost[] | null) ?? []);
    const prev: Record<string, string[]> = {};
    for (const fq of list) prev[fq.id] = await channelCall<{ proximos: string[] }>({ action: "queue_preview", workspaceId: ws, queueId: fq.id, count: 4 }).then((r) => r.proximos).catch(() => []);
    setNext(prev);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  if (accounts === null || queues === null) return <Page><PageHeader title="Filas" /><LoadingState /></Page>;
  const accName = (id: string) => accounts.find((a) => a.id === id);
  return (
    <Page>
      <PageHeader title="Filas" description="Horários fixos da semana. Ao escolher “Adicionar à fila”, a publicação entra no próximo horário livre."
        actions={admin ? <Button variant="primary" icon={<Plus />} onClick={() => setEditing("nova")}>Nova fila</Button> : undefined} />
      {!queues.length ? (
        <EmptyState icon={<ListChecks />} title="Nenhuma fila ainda" description="Crie uma fila com os horários em que você quer publicar (ex.: seg a sex às 9h e 18h). Depois é só adicionar publicações a ela, pelo app ou pelo agente de IA."
          actions={admin ? <Button variant="primary" icon={<Plus />} onClick={() => setEditing("nova")}>Criar fila</Button> : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
          {queues.map((fq) => {
            const items = posts.filter((p) => p.queue_id === fq.id);
            return (
              <section key={fq.id} className="panel flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-2 t-title font-semibold">{fq.name}{fq.is_default && <Tag tone="info">Padrão</Tag>}{!fq.active && <Tag>Pausada</Tag>}</span>
                    <span className="t-caption">{fq.timezone.replace("America/Sao_Paulo", "Horário de Brasília")} · {fq.slots.length} horário(s) por semana</span>
                  </div>
                  {admin && <span className="flex gap-1"><Button size="sm" onClick={() => setEditing(fq)}>Editar</Button><IconButton size="sm" label={`Excluir ${fq.name}`} onClick={() => setRemoving(fq)}><Trash2 /></IconButton></span>}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {WEEK.map((d, i) => (
                    <div key={d} className="flex flex-col items-center gap-1 rounded-md bg-surface-2 p-1.5">
                      <span className="t-caption font-semibold">{d}</span>
                      {fq.slots.filter((s) => s.day === i).map((s) => <span key={s.time} className="rounded bg-accent-tint px-1 text-[11px] text-accent-text">{s.time}</span>)}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="t-label !text-[10px]">Próximos horários livres</span>
                  <span className="t-secondary">{next[fq.id]?.length ? next[fq.id].map((d) => formatDateTime(new Date(d))).join(" · ") : "Sem horários livres"}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="t-label !text-[10px]">Na fila ({items.length})</span>
                  {!items.length ? <span className="t-secondary">Nada na fila. Em Publicações › Nova publicação, escolha “Adicionar à fila”.</span> : (
                    <ul className="divide-y divide-line-soft rounded-md border border-line">
                      {items.slice(0, 8).map((p) => (
                        <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                          <span className="w-[120px] shrink-0 t-caption">{formatDateTime(new Date(p.scheduled_at))}</span>
                          <span className="flex-1 truncate">{p.title || p.content || "(sem texto)"}</span>
                          <span className="flex gap-1 [&_svg]:size-3.5 text-text-dim">{[...new Set(p.channel_account_ids.map((id) => accName(id)?.kind).filter(Boolean))].map((k) => <span key={k}>{NETWORK[k!].icon}</span>)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {ws && <QueueModal queue={editing} ws={ws} accounts={accounts} onOpenChange={(o) => !o && setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Excluir fila?" confirmLabel="Excluir" description="As publicações já agendadas por ela continuam no mesmo horário."
        onConfirm={async () => { try { await channelCall({ action: "queue_delete", workspaceId: ws, queueId: removing!.id }); await load(); } catch (e) { toast({ tone: "error", title: "Não foi possível excluir", description: errText(e) }); } }} />
    </Page>
  );
}

function QueueModal({ queue, ws, accounts, onOpenChange, onSaved }: { queue: Queue | "nova" | null; ws: string; accounts: ChannelAccount[]; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("Fila principal");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [times, setTimes] = useState("09:00, 18:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [accs, setAccs] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [def, setDef] = useState(false);
  const [reshuffle, setReshuffle] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!queue) return;
    const fq = queue === "nova" ? null : queue;
    setName(fq?.name ?? "Fila principal"); setSlots(fq?.slots ?? []); setAccs(fq?.account_ids ?? []); setActive(fq?.active ?? true); setDef(fq?.is_default ?? false); setError(null);
  }, [queue]);
  const addTimes = () => {
    const list = times.split(/[\s,;]+/).map((t) => t.trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => t.padStart(5, "0"));
    if (!list.length || !days.length) { setError("Escolha os dias e escreva horários como 09:00, 18:00."); return; }
    setError(null);
    setSlots((cur) => { const all = [...cur, ...days.flatMap((d) => list.map((time) => ({ day: d, time })))]; const seen = new Set<string>(); return all.filter((s) => !seen.has(`${s.day}-${s.time}`) && seen.add(`${s.day}-${s.time}`)).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)); });
  };
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await channelCall<{ reorganizadas: number }>({ action: "queue_save", workspaceId: ws, queueId: queue && queue !== "nova" ? queue.id : undefined, name, timezone: "America/Sao_Paulo", slots, accountIds: accs, active, setAsDefault: def, reshuffle: queue !== "nova" && reshuffle });
      toast({ tone: "success", title: "Fila salva", description: r.reorganizadas ? `${r.reorganizadas} publicação(ões) reagendada(s) nos novos horários.` : undefined });
      onSaved();
    } catch (e) { setError(errText(e)); }
    setBusy(false);
  };
  return (
    <Modal open={!!queue} onOpenChange={onOpenChange} size="lg" icon={<ListChecks />} title={queue && queue !== "nova" ? "Editar fila" : "Nova fila"}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!slots.length || !name.trim()} onClick={() => void save()}>Salvar</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Nome">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <div className="flex flex-col gap-2 rounded-md border border-line p-3">
          <span className="text-secondary font-semibold text-text-soft">Adicionar horários (horário de Brasília)</span>
          <div className="flex flex-wrap gap-3">{WEEK.map((d, i) => <Checkbox key={d} label={d} checked={days.includes(i)} onCheckedChange={(v) => setDays((cur) => (v ? [...cur, i] : cur.filter((x) => x !== i)))} />)}</div>
          <div className="flex gap-2"><Input value={times} onChange={(e) => setTimes(e.target.value)} placeholder="09:00, 12:30, 18:00" /><Button icon={<Plus />} onClick={addTimes}>Adicionar</Button></div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEK.map((d, i) => (
            <div key={d} className="flex min-h-[64px] flex-col items-center gap-1 rounded-md bg-surface-2 p-1.5">
              <span className="t-caption font-semibold">{d}</span>
              {slots.filter((s) => s.day === i).map((s) => <button key={s.time} type="button" title="Remover" onClick={() => setSlots((cur) => cur.filter((x) => !(x.day === s.day && x.time === s.time)))} className="rounded bg-accent-tint px-1 text-[11px] text-accent-text hover:line-through">{s.time}</button>)}
            </div>
          ))}
        </div>
        <span className="t-caption">Clique num horário para removê-lo. {slots.length} horário(s) por semana.</span>
        <div className="flex flex-col gap-2">
          <span className="text-secondary font-semibold text-text-soft">Contas padrão (usadas quando a publicação não escolher contas)</span>
          <div className="flex flex-wrap gap-3">{accounts.filter((a) => a.status === "ativo").map((a) => <Checkbox key={a.id} checked={accs.includes(a.id)} onCheckedChange={(v) => setAccs((cur) => (v ? [...cur, a.id] : cur.filter((x) => x !== a.id)))} label={<span className="inline-flex items-center gap-1 [&_svg]:size-3.5">{NETWORK[a.kind].icon}{a.name}</span>} />)}</div>
        </div>
        <Switch checked={active} onCheckedChange={setActive} label="Ativa" description="Pausada, não recebe publicações novas." />
        <Switch checked={def} onCheckedChange={setDef} label="Fila padrão" description="Usada quando o agente ou a publicação não escolhe uma fila." />
        {queue !== "nova" && <Switch checked={reshuffle} onCheckedChange={setReshuffle} label="Reorganizar o que já está na fila" description="Reagenda as publicações da fila nos novos horários, mantendo a ordem." />}
        {error && <InlineNotice tone="negative">{error}</InlineNotice>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Sequências de mensagens */
interface Step { delay_minutes: number; kind: "texto" | "modelo"; text?: string; template_id?: string; params?: string[] }
interface Sequence { id: string; name: string; description: string | null; status: "rascunho" | "ativa" | "pausada"; steps: Step[]; exit_on_reply: boolean; channel_account_id: string | null; source: string; created_at: string }
interface Enrollment { id: string; contact_name: string | null; phone: string | null; conversation_id: string | null; status: "ativa" | "concluida" | "saiu" | "falhou"; current_step: number; next_run_at: string | null; exit_reason: string | null; last_error: string | null; enrolled_at: string }
const SEQ_STATUS: Record<Sequence["status"], { label: string; tone: "positive" | "neutral" | "warning" }> = { ativa: { label: "Ativa", tone: "positive" }, rascunho: { label: "Rascunho", tone: "neutral" }, pausada: { label: "Pausada", tone: "warning" } };
const EN_STATUS: Record<Enrollment["status"], { label: string; tone: "positive" | "info" | "neutral" | "negative" }> = { ativa: { label: "Em andamento", tone: "info" }, concluida: { label: "Concluída", tone: "positive" }, saiu: { label: "Saiu", tone: "neutral" }, falhou: { label: "Falhou", tone: "negative" } };
const delayLabel = (m: number) => (m === 0 ? "na hora" : m % 1440 === 0 ? `${m / 1440} dia(s)` : m % 60 === 0 ? `${m / 60} hora(s)` : `${m} min`);

export function LiveSequences() {
  const toast = useToast();
  const { accounts, ws, admin } = useChannelAccounts();
  const [rows, setRows] = useState<Sequence[] | null>(null);
  const [stats, setStats] = useState<Record<string, Record<string, number>>>({});
  const [editing, setEditing] = useState<Sequence | "nova" | null>(null);
  const [viewing, setViewing] = useState<Sequence | null>(null);
  const [removing, setRemoving] = useState<Sequence | null>(null);
  const load = useCallback(async () => {
    if (!supabase || !ws) return;
    const { data } = await supabase.from("sequences").select("*").eq("workspace_id", ws).order("created_at", { ascending: false });
    const list = (data as Sequence[] | null) ?? [];
    setRows(list);
    const { data: en } = list.length ? await supabase.from("sequence_enrollments").select("sequence_id, status").in("sequence_id", list.map((s) => s.id)).limit(20000) : { data: [] };
    const st: Record<string, Record<string, number>> = {};
    for (const e of (en ?? []) as { sequence_id: string; status: string }[]) { const s = (st[e.sequence_id] ??= {}); s[e.status] = (s[e.status] ?? 0) + 1; }
    setStats(st);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (s: Sequence, on: boolean) => {
    try { await channelCall({ action: "seq_status", workspaceId: ws, sequenceId: s.id, status: on ? "ativa" : "pausada" }); toast({ tone: "success", title: on ? "Sequência ativada" : "Sequência pausada" }); }
    catch (e) { toast({ tone: "error", title: "Não foi possível mudar", description: errText(e) }); }
    await load();
  };
  if (accounts === null || rows === null) return <Page><PageHeader title="Sequências" /><LoadingState /></Page>;
  const accOf = (id: string | null) => accounts.find((a) => a.id === id);
  return (
    <>
      <ListScreen<Sequence> demo={false} title="Sequências" description="Mensagens em etapas pelo WhatsApp ou Instagram: boas-vindas agora, uma dica no dia seguinte, a oferta em três dias. Para quando o contato responde."
        rows={rows} getId={(s) => s.id} searchText={(s) => s.name} refreshable onRefresh={load}
        actions={admin ? <Button variant="primary" icon={<Plus />} onClick={() => setEditing("nova")}>Nova sequência</Button> : undefined}
        before={!accounts.length ? <InlineNotice tone="info" action={<Link to="/conexoes" className={buttonClasses("outline", "sm")}>Conectar</Link>}>As sequências enviam pelo WhatsApp ou pelo Instagram conectados.</InlineNotice> : undefined}
        columns={[
          { id: "n", header: "Sequência", sticky: true, cell: (s) => <div className="flex w-[260px] max-w-[260px] flex-col gap-0.5"><span className="truncate font-semibold">{s.name}</span><span className="truncate t-secondary">{s.steps.map((x) => (x.kind === "modelo" ? "Modelo" : x.text?.slice(0, 40))).join(" → ") || "Sem passos"}</span>{s.source === "agente" && <span><Tag tone="info">Criada por agente de IA</Tag></span>}</div> },
          { id: "c", header: "Envia por", cell: (s) => { const a = accOf(s.channel_account_id); return a ? <span className="inline-flex items-center gap-1 [&_svg]:size-3.5">{NETWORK[a.kind].icon}{a.name}</span> : <span className="t-caption">—</span>; } },
          { id: "p", header: "Passos", align: "right", cell: (s) => <span className="num">{s.steps.length}</span> },
          { id: "i", header: "Inscritos", align: "right", cell: (s) => { const st = stats[s.id] ?? {}; return <div className="flex flex-col items-end"><span className="num">{(st.ativa ?? 0) + (st.concluida ?? 0) + (st.saiu ?? 0) + (st.falhou ?? 0)}</span><span className="t-caption">{st.ativa ?? 0} em andamento · {st.concluida ?? 0} concluídos</span></div>; } },
          { id: "s", header: "Status", cell: (s) => <div className="flex items-center gap-2"><Switch size="sm" ariaLabel={`Ativar ${s.name}`} disabled={!admin} checked={s.status === "ativa"} onCheckedChange={(v) => void toggle(s, v)} /><StatusBadge tone={SEQ_STATUS[s.status].tone}>{SEQ_STATUS[s.status].label}</StatusBadge></div> },
          { id: "a", header: "", align: "right", cell: (s) => <span className="flex justify-end gap-1"><Button size="sm" icon={<Users />} onClick={() => setViewing(s)}>Inscritos</Button>{admin && <><Button size="sm" onClick={() => setEditing(s)}>Editar</Button><IconButton size="sm" label={`Excluir ${s.name}`} onClick={() => setRemoving(s)}><Trash2 /></IconButton></>}</span> },
        ]}
        empty={{ icon: <ListOrdered />, title: "Nenhuma sequência ainda", description: "Crie uma série de mensagens com intervalo e inscreva contatos, ou deixe um fluxo inscrever automaticamente quem escrever.", action: admin ? <Button variant="primary" icon={<Plus />} onClick={() => setEditing("nova")}>Nova sequência</Button> : undefined }} />
      {ws && <SequenceModal seq={editing} ws={ws} accounts={accounts} onOpenChange={(o) => !o && setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      {ws && <EnrollmentsDrawer seq={viewing} ws={ws} admin={admin} onOpenChange={(o) => !o && setViewing(null)} onChanged={load} />}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Excluir sequência?" confirmLabel="Excluir" description={`"${removing?.name}" para de enviar para todos os inscritos.`}
        onConfirm={async () => { try { await channelCall({ action: "seq_delete", workspaceId: ws, sequenceId: removing!.id }); await load(); } catch (e) { toast({ tone: "error", title: "Não foi possível excluir", description: errText(e) }); } }} />
    </>
  );
}

function SequenceModal({ seq, ws, accounts, onOpenChange, onSaved }: { seq: Sequence | "nova" | null; ws: string; accounts: ChannelAccount[]; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [exitOnReply, setExitOnReply] = useState(true);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isWa = accounts.find((a) => a.id === accountId)?.kind === "whatsapp";
  useEffect(() => {
    if (!seq) return;
    const s = seq === "nova" ? null : seq;
    setName(s?.name ?? ""); setAccountId(s?.channel_account_id ?? accounts[0]?.id ?? ""); setSteps(s?.steps ?? [{ delay_minutes: 0, kind: "texto", text: "Oi {{primeiro_nome}}! Obrigado pelo contato." }]); setExitOnReply(s?.exit_on_reply ?? true); setError(null);
    supabase?.from("wa_templates").select(TEMPLATE_COLS).eq("workspace_id", ws).eq("status", "APPROVED").order("name").then(({ data }) => setTemplates((data as WaTemplate[] | null) ?? []));
  }, [seq, accounts, ws]);
  const set = (i: number, patch: Partial<Step>) => setSteps((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const locked = seq !== "nova" && seq?.status === "ativa";
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await channelCall({ action: "seq_save", workspaceId: ws, sequence: { id: seq && seq !== "nova" ? seq.id : undefined, name, channel_account_id: accountId || null, exit_on_reply: exitOnReply, ...(locked ? {} : { steps }) } });
      onSaved();
    } catch (e) { setError(errText(e)); }
    setBusy(false);
  };
  const unit = (m: number) => (m % 1440 === 0 && m ? "dias" : m % 60 === 0 && m ? "horas" : "minutos");
  const amount = (m: number) => (unit(m) === "dias" ? m / 1440 : unit(m) === "horas" ? m / 60 : m);
  return (
    <Modal open={!!seq} onOpenChange={onOpenChange} size="lg" icon={<ListOrdered />} title={seq && seq !== "nova" ? "Editar sequência" : "Nova sequência"}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!name.trim() || !steps.length} onClick={() => void save()}>Salvar</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Nome" required>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Boas-vindas de novos leads" />}</Field>
          <Field label="Envia por">{(p) => <Select id={p.id} value={accountId} onValueChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: `${NETWORK[a.kind].label} · ${a.name}` }))} placeholder="Escolha o número ou a conta" />}</Field>
        </div>
        {locked && <InlineNotice tone="warning">Pause a sequência para mudar os passos.</InlineNotice>}
        <ol className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Passo {i + 1}</span>
                <span className="t-caption">esperar</span>
                <Input type="number" min={0} disabled={locked} value={amount(s.delay_minutes)} onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); const u = unit(s.delay_minutes); set(i, { delay_minutes: u === "dias" ? v * 1440 : u === "horas" ? v * 60 : v }); }} className="w-[80px]" />
                <Select value={unit(s.delay_minutes)} onValueChange={(u) => { const v = amount(s.delay_minutes) || 1; set(i, { delay_minutes: u === "dias" ? v * 1440 : u === "horas" ? v * 60 : v }); }} options={[{ value: "minutos", label: "minutos" }, { value: "horas", label: "horas" }, { value: "dias", label: "dias" }]} />
                <span className="t-caption">{i === 0 ? "depois da inscrição" : "depois do passo anterior"}</span>
                <span className="flex-1" />
                {isWa && <Select value={s.kind} onValueChange={(k) => set(i, { kind: k as Step["kind"] })} options={[{ value: "texto", label: "Texto" }, { value: "modelo", label: "Modelo aprovado" }]} />}
                {!locked && steps.length > 1 && <IconButton size="sm" label={`Remover passo ${i + 1}`} onClick={() => setSteps((cur) => cur.filter((_, j) => j !== i))}><Trash2 /></IconButton>}
              </div>
              {s.kind === "modelo" && isWa ? (
                <>
                  <Select value={s.template_id ?? ""} onValueChange={(v) => set(i, { template_id: v })} options={templates.map((t) => ({ value: t.id, label: `${t.name} (${t.language})` }))} placeholder={templates.length ? "Escolha o modelo" : "Nenhum modelo aprovado"} />
                  {s.template_id && templates.find((t) => t.id === s.template_id) && <span className="t-caption">{bodyOf(templates.find((t) => t.id === s.template_id)!)}</span>}
                  <Input disabled={locked} value={(s.params ?? []).join(", ")} onChange={(e) => set(i, { params: e.target.value.split(",").map((x) => x.trim()) })} placeholder="Variáveis {{1}}, {{2}}… separadas por vírgula (aceita {{nome}})" />
                </>
              ) : <Textarea disabled={locked} value={s.text ?? ""} onChange={(e) => set(i, { text: e.target.value })} rows={3} placeholder="Use {{nome}} ou {{primeiro_nome}}" />}
              <span className="t-caption">Sai {delayLabel(s.delay_minutes)}{s.kind === "texto" ? " · texto só é enviado até 24 h depois da última mensagem do contato" : ""}</span>
            </li>
          ))}
        </ol>
        {!locked && steps.length < 20 && <Button icon={<Plus />} onClick={() => setSteps((cur) => [...cur, { delay_minutes: 1440, kind: isWa && templates.length ? "modelo" : "texto", text: "" }])}>Adicionar passo</Button>}
        <Switch checked={exitOnReply} onCheckedChange={setExitOnReply} label="Parar quando o contato responder" description="Recomendado: quem responde passa para o atendimento e não recebe os próximos passos." />
        {error && <InlineNotice tone="negative">{error}</InlineNotice>}
      </div>
    </Modal>
  );
}

function EnrollmentsDrawer({ seq, ws, admin, onOpenChange, onChanged }: { seq: Sequence | null; ws: string; admin: boolean; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Enrollment[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(async () => {
    if (!supabase || !seq) return;
    const { data } = await supabase.from("sequence_enrollments").select("*").eq("sequence_id", seq.id).order("enrolled_at", { ascending: false }).limit(300);
    setRows((data as Enrollment[] | null) ?? []);
  }, [seq]);
  useEffect(() => { setRows(null); void load(); }, [load]);
  const remove = async (e: Enrollment) => {
    try { await channelCall({ action: "seq_unenroll", workspaceId: ws, enrollmentId: e.id }); await load(); onChanged(); } catch (err) { toast({ tone: "error", title: "Não foi possível remover", description: errText(err) }); }
  };
  return (
    <Drawer open={!!seq} onOpenChange={onOpenChange} width={560} title={seq?.name ?? ""} description={seq ? `${seq.steps.length} passo(s) · ${SEQ_STATUS[seq.status].label}` : undefined} icon={<Users />}
      footer={<Button variant="primary" icon={<UserPlus />} onClick={() => setAdding(true)}>Inscrever contatos</Button>}>
      {!rows ? <LoadingState /> : !rows.length ? <p className="t-secondary">Ninguém inscrito ainda.</p> : (
        <ul className="divide-y divide-line-soft">
          {rows.map((e) => (
            <li key={e.id} className="flex items-start gap-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-semibold">{e.contact_name ?? (e.phone ? `+${e.phone}` : "Contato")}</span>
                <span className="t-caption">{e.status === "ativa" ? `Passo ${e.current_step + 1} · ${e.next_run_at ? `próximo envio ${formatDateTime(new Date(e.next_run_at))}` : ""}` : e.status === "saiu" ? `Saiu: ${e.exit_reason ?? ""}` : e.status === "concluida" ? "Recebeu todos os passos" : e.last_error ?? ""}</span>
                {e.last_error && e.status === "ativa" && <span className="t-caption text-warning">{e.last_error}</span>}
              </div>
              <StatusBadge tone={EN_STATUS[e.status].tone}>{EN_STATUS[e.status].label}</StatusBadge>
              {admin && e.status === "ativa" && <IconButton size="sm" label="Remover da sequência" onClick={() => void remove(e)}><Trash2 /></IconButton>}
            </li>
          ))}
        </ul>
      )}
      {seq && <EnrollModal open={adding} seq={seq} ws={ws} onOpenChange={setAdding} onDone={() => { setAdding(false); void load(); onChanged(); }} />}
    </Drawer>
  );
}

function EnrollModal({ open, seq, ws, onOpenChange, onDone }: { open: boolean; seq: Sequence; ws: string; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const toast = useToast();
  const [convs, setConvs] = useState<{ id: string; contact_name: string | null; contact_handle: string | null; last_message_at: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [phones, setPhones] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !supabase) return;
    setPicked([]); setPhones(""); setError(null);
    let q = supabase.from("conversations").select("id, contact_name, contact_handle, last_message_at").eq("workspace_id", ws).order("last_message_at", { ascending: false }).limit(300);
    if (seq.channel_account_id) q = q.eq("channel_account_id", seq.channel_account_id);
    q.then(({ data }) => setConvs((data as typeof convs | null) ?? []));
  }, [open, ws, seq]);
  const shown = useMemo(() => convs.filter((c) => `${c.contact_name} ${c.contact_handle}`.toLowerCase().includes(search.toLowerCase())), [convs, search]);
  const firstIsTemplate = seq.steps[0]?.kind === "modelo";
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const list = phones.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [phone, ...rest] = l.split(/[;,\t]/); return { phone, name: rest.join(" ").trim() || undefined }; });
      const r = await channelCall<{ inscritos: number; ignorados: number }>({ action: "seq_enroll", workspaceId: ws, sequenceId: seq.id, conversationIds: picked, phones: list });
      toast({ tone: "success", title: `${r.inscritos} contato(s) inscrito(s)`, description: r.ignorados ? `${r.ignorados} já estavam inscritos ou eram inválidos.` : seq.status !== "ativa" ? "A sequência começa a enviar quando for ativada." : undefined });
      onDone();
    } catch (e) { setError(errText(e)); }
    setBusy(false);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" icon={<UserPlus />} title="Inscrever contatos" description={seq.name}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!picked.length && !phones.trim()} onClick={() => void submit()}>Inscrever</Button></>}>
      <div className="flex flex-col gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversa" />
        <div className="max-h-[260px] overflow-y-auto rounded-md border border-line">
          {!shown.length ? <p className="p-3 t-secondary">Nenhuma conversa{seq.channel_account_id ? " neste número ou conta" : ""}.</p> : shown.map((c) => (
            <div key={c.id} className="border-b border-line-soft px-3 py-2 last:border-0"><Checkbox checked={picked.includes(c.id)} onCheckedChange={(v) => setPicked((cur) => (v ? [...cur, c.id] : cur.filter((x) => x !== c.id)))} label={c.contact_name ?? c.contact_handle ?? "Contato"} description={c.contact_handle ?? undefined} /></div>
          ))}
        </div>
        {firstIsTemplate && <Field label="Ou números do WhatsApp" hint="Um por linha: número com DDI e DDD, e o nome depois de vírgula. Ex.: +55 11 91234-5678, Ana">{(p) => <Textarea id={p.id} value={phones} onChange={(e) => setPhones(e.target.value)} rows={4} />}</Field>}
        {!firstIsTemplate && <span className="t-caption">Para inscrever números que ainda não conversaram com você, o primeiro passo precisa ser um modelo aprovado do WhatsApp.</span>}
        {error && <InlineNotice tone="negative">{error}</InlineNotice>}
      </div>
    </Modal>
  );
}

