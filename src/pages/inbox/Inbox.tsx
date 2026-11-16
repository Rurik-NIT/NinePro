import { AtSign, CheckCheck, Contact, Filter, MessageSquare, MessagesSquare, Plus, Send, Star, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { CHANNELS, COMMENT_POSTS, CONVERSATIONS, INBOX_WORKFLOWS, MENTIONS, REVIEWS, type Conversation } from "@/data/demo/extra";
import { formatDateLong } from "@/lib/format";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Avatar, Count, StatusBadge, Tag } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SearchInput, Textarea } from "@/components/ui/Input";
import { MultiSelect, Select } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { DemoBadge, EmptyState, InlineNotice } from "@/components/feedback/States";
import { ListScreen } from "@/components/templates/ListScreen";

const channelOpts = CHANNELS.map((c) => ({ value: c, label: c }));
const time = (d: Date) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d);

/* ------------------------------------------------------------------ Mensagens */
export function InboxMessages() {
  const toast = useToast();
  const [convs, setConvs] = useState<Conversation[]>(CONVERSATIONS);
  const [activeId, setActiveId] = useState(CONVERSATIONS[0]?.id);
  const [q, setQ] = useState("");
  const [ch, setCh] = useState<string[]>([]);
  const [view, setView] = useState<"todas" | "nao-lidas" | "resolvidas">("todas");
  const [order, setOrder] = useState("recentes");
  const [draft, setDraft] = useState("");
  const list = useMemo(() => convs
    .filter((c) => (!ch.length || ch.includes(c.channel)) && (!q || `${c.contact} ${c.snippet}`.toLowerCase().includes(q.toLowerCase())))
    .filter((c) => view === "todas" || (view === "nao-lidas" ? c.unread > 0 : c.status === "Resolvida"))
    .sort((a, b) => (order === "recentes" ? b.at.getTime() - a.at.getTime() : a.at.getTime() - b.at.getTime())), [convs, ch, q, view, order]);
  const active = convs.find((c) => c.id === activeId);
  const send = () => {
    if (!draft.trim() || !active) return;
    setConvs((cs) => cs.map((c) => (c.id === active.id ? { ...c, messages: [...c.messages, { from: "equipe", text: draft.trim(), at: new Date() }], at: new Date(), snippet: draft.trim(), unread: 0 } : c)));
    setDraft("");
    toast({ tone: "info", title: "Resposta registrada (demonstração)", description: "Nada foi enviado ao canal real." });
  };
  return (
    <Page className="h-[calc(100dvh-var(--header-h)-24px)] !pb-3">
      <PageHeader meta={<DemoBadge />} title="Mensagens" actions={<Button variant="primary" icon={<Plus />} onClick={() => toast({ tone: "info", title: "Nova mensagem", description: "Iniciar conversa exige um canal conectado." })}>Nova mensagem</Button>} />
      <div className="panel grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col border-r border-line">
          <div className="flex flex-col gap-2 border-b border-line p-3">
            <SearchInput value={q} onValueChange={setQ} size="sm" placeholder="Buscar conversas" />
            <div className="flex items-center gap-2">
              <MultiSelect label="Canal" size="sm" icon={<Filter />} options={channelOpts} value={ch} onValueChange={setCh} />
              <Select size="sm" className="w-[150px]" ariaLabel="Ordenação" value={order} onValueChange={setOrder} options={[{ value: "recentes", label: "Mais recentes" }, { value: "antigas", label: "Mais antigas" }]} />
            </div>
            <SegmentedControl ariaLabel="Situação" size="sm" value={view} onValueChange={setView} options={[{ value: "todas", label: "Todas" }, { value: "nao-lidas", label: "Não lidas" }, { value: "resolvidas", label: "Resolvidas" }]} />
          </div>
          <p className="t-label border-b border-line-soft bg-surface-2 px-3 py-2 !text-[10px]">Conversas · {list.length}</p>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {list.length === 0 && <EmptyState compact icon={<MessageSquare />} title="Nenhuma conversa encontrada" />}
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => { setActiveId(c.id); setConvs((cs) => cs.map((x) => (x.id === c.id ? { ...x, unread: 0 } : x))); }}
                  className={cn("flex w-full items-start gap-3 border-b border-line-soft px-3 py-3 text-left transition-colors", c.id === activeId ? "bg-accent-tint" : "hover:bg-surface-2")}>
                  <Avatar name={c.contact} size={34} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center justify-between gap-2"><span className={cn("truncate text-body", c.unread ? "font-bold" : "font-semibold")}>{c.contact}</span><span className="num shrink-0 t-caption">{time(c.at)}</span></span>
                    <span className="truncate t-secondary">{c.snippet}</span>
                    <span className="flex items-center gap-1.5"><Tag className="!h-4 !text-[9.5px]">{c.channel}</Tag>{c.status === "Resolvida" && <CheckCheck className="size-3.5 text-positive" />}</span>
                  </span>
                  {c.unread > 0 && <span className="num mt-1 grid size-5 place-items-center rounded-full bg-accent text-[10.5px] font-bold text-accent-ink">{c.unread}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {active ? (
          <div className="hidden min-h-0 flex-col md:flex">
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex items-center gap-3"><Avatar name={active.contact} size={34} /><div className="flex flex-col"><span className="t-title">{active.contact}</span><span className="t-caption">{active.channel} · {active.account}{active.assignedTo ? ` · com ${active.assignedTo}` : ""}</span></div></div>
              <Button size="sm" icon={<CheckCheck />} onClick={() => setConvs((cs) => cs.map((c) => (c.id === active.id ? { ...c, status: c.status === "Aberta" ? "Resolvida" : "Aberta" } : c)))}>{active.status === "Aberta" ? "Marcar como resolvida" : "Reabrir"}</Button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-surface-2 p-4">
              {active.messages.map((m, i) => (
                <div key={i} className={cn("flex max-w-[70%] flex-col gap-1 rounded-lg px-3 py-2", m.from === "equipe" ? "self-end bg-accent text-accent-ink" : "self-start border border-line bg-surface")}>
                  <span className="text-body">{m.text}</span><span className={cn("num self-end text-[10.5px]", m.from === "equipe" ? "opacity-70" : "text-text-dim")}>{time(m.at)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-end gap-2 border-t border-line p-3">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Escreva uma resposta… (Enter envia, Shift+Enter quebra linha)" className="!min-h-[44px]" rows={1} />
              <Button variant="primary" icon={<Send />} disabled={!draft.trim()} onClick={send}>Enviar</Button>
            </div>
          </div>
        ) : <div className="hidden items-center justify-center md:flex"><EmptyState icon={<MessageSquare />} title="Selecione uma conversa" /></div>}
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------------ Comentários */
export function InboxComments() {
  type P = (typeof COMMENT_POSTS)[number];
  return (
    <ListScreen<P> title="Comentários" description="Publicações com comentários para responder, por canal."
      rows={COMMENT_POSTS} getId={(p) => p.id} searchText={(p) => p.caption}
      filters={[{ id: "ch", label: "Canal", options: channelOpts, match: (p, v) => p.channel === v }]}
      defaultSort={{ id: "at", dir: "desc" }}
      columns={[
        { id: "post", header: "Publicação", sticky: true, cell: (p) => <div className="flex flex-col"><span className="font-semibold">{p.caption}</span><Tag className="mt-1 self-start">{p.channel}</Tag></div> },
        { id: "c", header: "Comentários", align: "right", sortValue: (p) => p.comments, cell: (p) => p.comments },
        { id: "u", header: "Sem resposta", align: "right", sortValue: (p) => p.unanswered, cell: (p) => <span className={p.unanswered ? "font-bold text-warning" : "text-text-dim"}>{p.unanswered}</span> },
        { id: "at", header: "Publicado", align: "right", sortValue: (p) => p.at.getTime(), cell: (p) => <span className="text-text-soft">{formatDateLong(p.at)}</span> },
      ]}
      empty={{ icon: <MessagesSquare />, title: "Nenhuma publicação encontrada" }} />
  );
}

/* ------------------------------------------------------------------ Avaliações */
export function InboxReviews() {
  const toast = useToast();
  const [rows, setRows] = useState(REVIEWS);
  type R = (typeof REVIEWS)[number];
  return (
    <ListScreen<R> title="Avaliações" description="Avaliações do Google e do Facebook, com status de resposta."
      rows={rows} getId={(r) => r.id} searchText={(r) => `${r.author} ${r.text}`}
      filters={[
        { id: "n", label: "Nota", options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} estrela${n > 1 ? "s" : ""}` })), match: (r, v) => String(r.rating) === v },
        { id: "rp", label: "Resposta", options: [{ value: "sim", label: "Respondidas" }, { value: "nao", label: "Sem resposta" }], match: (r, v) => r.replied === (v === "sim") },
      ]}
      defaultSort={{ id: "at", dir: "desc" }}
      columns={[
        { id: "a", header: "Avaliação", sticky: true, cell: (r) => <div className="flex max-w-[460px] flex-col gap-1"><span className="flex items-center gap-2"><b>{r.author}</b><span className="flex text-warning" aria-label={`${r.rating} de 5`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} className={cn("size-3.5", i < r.rating ? "fill-current" : "opacity-25")} />)}</span></span><span className="whitespace-normal t-secondary">{r.text}</span></div> },
        { id: "ch", header: "Canal", cell: (r) => <Tag>{r.channel}</Tag> },
        { id: "st", header: "Resposta", cell: (r) => r.replied ? <StatusBadge tone="positive">Respondida</StatusBadge> : <Button size="sm" onClick={() => { setRows((s) => s.map((x) => (x.id === r.id ? { ...x, replied: true } : x))); toast({ tone: "info", title: "Resposta registrada (demonstração)" }); }}>Responder</Button> },
        { id: "at", header: "Data", align: "right", sortValue: (r) => r.at.getTime(), cell: (r) => <span className="text-text-soft">{formatDateLong(r.at)}</span> },
      ]}
      empty={{ icon: <Star />, title: "Nenhuma avaliação encontrada" }} />
  );
}

/* ------------------------------------------------------------------ Menções */
export function InboxMentions() {
  type M = (typeof MENTIONS)[number];
  return (
    <ListScreen<M> title="Menções" description="Menções e marcações das suas contas no Instagram e no LinkedIn."
      rows={MENTIONS} getId={(m) => m.id} searchText={(m) => `${m.author} ${m.text}`}
      filters={[{ id: "k", label: "Tipo", options: [{ value: "Menção", label: "Menções" }, { value: "Marcação", label: "Marcado em" }], match: (m, v) => m.kind === v }]}
      defaultSort={{ id: "at", dir: "desc" }}
      columns={[
        { id: "a", header: "Autor", sticky: true, cell: (m) => <span className="font-semibold">{m.author}</span> },
        { id: "t", header: "Conteúdo", cell: (m) => <span className="text-text-soft">{m.text}</span> },
        { id: "k", header: "Tipo", cell: (m) => <Tag>{m.kind}</Tag> },
        { id: "ch", header: "Canal", cell: (m) => <Tag>{m.channel}</Tag> },
        { id: "at", header: "Data", align: "right", sortValue: (m) => m.at.getTime(), cell: (m) => <span className="text-text-soft">{formatDateLong(m.at)}</span> },
      ]}
      empty={{ icon: <AtSign />, title: "Nenhuma menção encontrada", description: "Menções às suas contas no Instagram e no LinkedIn aparecem aqui." }} />
  );
}

/* ------------------------------------------------------------------ Fluxos */
export function InboxWorkflows() {
  const toast = useToast();
  type W = (typeof INBOX_WORKFLOWS)[number];
  return (
    <ListScreen<W> title="Fluxos" description="Respostas automáticas e sequências por canal (ex.: comentário vira DM com cupom)."
      rows={INBOX_WORKFLOWS} getId={(w) => w.id} searchText={(w) => w.name}
      filters={[
        { id: "st", label: "Status", options: [{ value: "Ativo", label: "Ativo" }, { value: "Pausado", label: "Pausado" }], match: (w, v) => w.status === v },
        { id: "pl", label: "Plataforma", options: channelOpts, match: (w, v) => w.platform === v },
      ]}
      actions={<Button variant="primary" icon={<Plus />} onClick={() => toast({ tone: "info", title: "Novo fluxo", description: "O construtor de fluxos usa o mesmo editor das automações." })}>Novo fluxo</Button>}
      columns={[
        { id: "n", header: "Nome", sticky: true, sortValue: (w) => w.name, cell: (w) => <span className="font-semibold">{w.name}</span> },
        { id: "pl", header: "Plataforma", cell: (w) => <Tag>{w.platform}</Tag> },
        { id: "acc", header: "Conta", cell: (w) => <span className="text-text-soft">{w.account}</span> },
        { id: "nodes", header: "Etapas", align: "right", cell: (w) => w.nodes },
        { id: "runs", header: "Execuções", align: "right", sortValue: (w) => w.runs, cell: (w) => w.runs.toLocaleString("pt-BR") },
        { id: "st", header: "Status", cell: (w) => <StatusBadge tone={w.status === "Ativo" ? "positive" : "neutral"}>{w.status}</StatusBadge> },
        { id: "id", header: "ID", cell: (w) => <span className="font-mono text-[12px] text-text-dim">{w.id}</span> },
        { id: "c", header: "Criado", align: "right", cell: (w) => <span className="text-text-soft">{formatDateLong(w.createdAt)}</span> },
      ]}
      empty={{ icon: <Workflow />, title: "Nenhum fluxo ainda" }} />
  );
}

/* ------------------------------------------------------------------ Campanhas / Contatos (não observados na referência) */
function NotObserved({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <Page>
      <PageHeader title={<span className="inline-flex items-center gap-3">{title} <Count>—</Count></span>} meta={<Tag>Não observado na referência</Tag>} />
      <InlineNotice tone="warning">No sistema de referência esta tela retornou erro de acesso para a conta usada na engenharia reversa, então o conteúdo dela é desconhecido. Ela será construída quando for possível observá-la (ver docs/reverse-engineering/11-parity-matrix.md).</InlineNotice>
      <div className="panel"><EmptyState icon={icon} title={`${title}: conteúdo a mapear`} /></div>
    </Page>
  );
}
export const InboxCampaigns = () => <NotObserved title="Campanhas" icon={<Send />} />;
export const InboxContacts = () => <NotObserved title="Contatos" icon={<Contact />} />;
