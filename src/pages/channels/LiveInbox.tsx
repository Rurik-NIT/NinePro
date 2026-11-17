import { AtSign, CheckCheck, EyeOff, Eye, Filter, Instagram, MessageCircle, MessageSquare, MessagesSquare, Plus, Reply, Send, Trash2, Clock } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/format";
import { attachmentUrl, channelCall } from "@/lib/channelsApi";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Avatar, StatusBadge, Tag } from "@/components/ui/Badge";
import { Button, buttonClasses, IconButton } from "@/components/ui/Button";
import { ConfirmDialog, Modal } from "@/components/ui/Dialog";
import { SearchInput, Textarea } from "@/components/ui/Input";
import { MultiSelect } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, InlineNotice, LoadingState } from "@/components/feedback/States";
import { ListScreen } from "@/components/templates/ListScreen";
import { SendTemplateModal, useChannelAccounts } from "./shared";

interface Conv { id: string; channel: string; channel_account_id: string; contact_name: string; contact_handle: string | null; contact_picture: string | null; status: "Aberta" | "Resolvida"; unread: number; last_message_preview: string | null; last_message_at: string; last_inbound_at: string | null }
interface Msg { id: number; direction: "in" | "out"; body: string; kind: string; media_url: string | null; status: string | null; error: string | null; sent_at: string }
const DAY = 86_400_000;
const time = (iso: string) => { const d = new Date(iso); return Date.now() - d.getTime() < DAY ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d) : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d); };
const STATUS_LABEL: Record<string, string> = { enviada: "Enviada", entregue: "Entregue", lida: "Lida", falhou: "Falhou" };
const channelIcon = (c: string) => (c === "Instagram" ? <Instagram className="size-3" /> : <MessageCircle className="size-3" />);

function NoChannels() {
  return (
    <div className="panel"><EmptyState icon={<MessagesSquare />} title="Nenhum canal conectado" description="Conecte um número do WhatsApp Business ou uma conta do Instagram para atender por aqui."
      actions={<Link to="/conexoes" className={buttonClasses("primary")}>Conectar canal</Link>} /></div>
  );
}

function Attachment({ m }: { m: Msg }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { void attachmentUrl(m.media_url).then(setUrl); }, [m.media_url]);
  if (!m.media_url || !url) return null;
  if (m.kind === "image" || m.kind === "sticker") return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Imagem recebida" className="max-h-64 rounded-md object-contain" /></a>;
  if (m.kind === "video" || m.kind === "ig_reel") return <video src={url} controls className="max-h-64 rounded-md" />;
  if (m.kind === "audio") return <audio src={url} controls className="w-60" />;
  return <a href={url} target="_blank" rel="noreferrer" className="underline">Abrir anexo</a>;
}

/* ------------------------------------------------------------------ Mensagens */
export function LiveInboxMessages() {
  const toast = useToast();
  const { accounts, ws } = useChannelAccounts();
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [ch, setCh] = useState<string[]>([]);
  const [view, setView] = useState<"abertas" | "nao-lidas" | "resolvidas" | "todas">("abertas");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [tplOpen, setTplOpen] = useState<{ to?: string; name?: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;

  const loadConvs = useCallback(async () => {
    if (!supabase || !ws) return;
    const { data } = await supabase.from("conversations").select("id, channel, channel_account_id, contact_name, contact_handle, contact_picture, status, unread, last_message_preview, last_message_at, last_inbound_at")
      .eq("workspace_id", ws).not("channel_account_id", "is", null).order("last_message_at", { ascending: false }).limit(300);
    setConvs((data as Conv[] | null) ?? []);
  }, [ws]);
  const loadMsgs = useCallback(async (id: string) => {
    if (!supabase) return;
    const { data } = await supabase.from("messages").select("id, direction, body, kind, media_url, status, error, sent_at").eq("conversation_id", id).order("sent_at", { ascending: true }).limit(500);
    if (activeRef.current === id) setMsgs((data as Msg[] | null) ?? []);
  }, []);
  useEffect(() => { void loadConvs(); }, [loadConvs]);
  const [params] = useSearchParams();
  useEffect(() => { const c = params.get("conversa"); if (c) setActiveId(c); }, [params]);
  useEffect(() => { if (activeId) void loadMsgs(activeId); else setMsgs([]); }, [activeId, loadMsgs]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [msgs.length, activeId]);

  // Tempo real: novas conversas e mensagens aparecem sem recarregar
  useEffect(() => {
    if (!supabase || !ws) return;
    const sb = supabase;
    const chan = sb.channel(`caixa-${ws}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `workspace_id=eq.${ws}` }, () => void loadConvs())
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `workspace_id=eq.${ws}` }, (p) => { const cid = (p.new as { conversation_id?: string } | null)?.conversation_id; if (cid && cid === activeRef.current) void loadMsgs(cid); })
      .subscribe();
    const poll = setInterval(() => { void loadConvs(); if (activeRef.current) void loadMsgs(activeRef.current); }, 30_000);
    return () => { void sb.removeChannel(chan); clearInterval(poll); };
  }, [ws, loadConvs, loadMsgs]);

  const channels = useMemo(() => [...new Set((convs ?? []).map((c) => c.channel))], [convs]);
  const list = useMemo(() => (convs ?? [])
    .filter((c) => (!ch.length || ch.includes(c.channel)) && (!q || `${c.contact_name} ${c.contact_handle ?? ""} ${c.last_message_preview ?? ""}`.toLowerCase().includes(q.toLowerCase())))
    .filter((c) => view === "todas" || (view === "nao-lidas" ? c.unread > 0 : view === "abertas" ? c.status === "Aberta" : c.status === "Resolvida")), [convs, ch, q, view]);
  const active = convs?.find((c) => c.id === activeId) ?? null;
  const windowOpen = !!active?.last_inbound_at && Date.now() - Date.parse(active.last_inbound_at) < DAY;
  const hasWa = (accounts ?? []).some((a) => a.kind === "whatsapp");

  const open = async (c: Conv) => {
    setActiveId(c.id); setDraft("");
    if (c.unread > 0 && ws) { setConvs((cs) => cs?.map((x) => (x.id === c.id ? { ...x, unread: 0 } : x)) ?? cs); void channelCall({ action: "mark_read", workspaceId: ws, conversationId: c.id }).catch(() => undefined); }
  };
  const send = async () => {
    if (!active || !draft.trim() || !ws) return;
    setSending(true);
    try {
      await channelCall({ action: "send_message", workspaceId: ws, conversationId: active.id, text: draft });
      setDraft("");
      await Promise.all([loadMsgs(active.id), loadConvs()]);
    } catch (e) { toast({ tone: "error", title: "Mensagem não enviada", description: e instanceof Error ? e.message : String(e) }); }
    setSending(false);
  };
  const toggleStatus = async () => {
    if (!active || !supabase) return;
    const status = active.status === "Aberta" ? "Resolvida" : "Aberta";
    await supabase.from("conversations").update({ status }).eq("id", active.id);
    await loadConvs();
  };

  if (accounts === null || convs === null) return <Page><PageHeader title="Mensagens" /><LoadingState /></Page>;
  if (!accounts.length && !convs.length) return <Page><PageHeader title="Mensagens" /><NoChannels /></Page>;

  return (
    <Page className="h-[calc(100dvh-var(--header-h)-24px)] !pb-3">
      <PageHeader title="Mensagens" actions={<Button variant="primary" icon={<Plus />} disabled={!hasWa} onClick={() => setTplOpen({})}>Nova mensagem</Button>} />
      <div className="panel grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[340px_minmax(0,1fr)]">
        <div className={cn("min-h-0 flex-col border-r border-line", active ? "hidden md:flex" : "flex")}>
          <div className="flex flex-col gap-2 border-b border-line p-3">
            <SearchInput value={q} onValueChange={setQ} size="sm" placeholder="Buscar conversas" />
            {channels.length > 1 && <MultiSelect label="Canal" size="sm" icon={<Filter />} options={channels.map((c) => ({ value: c, label: c }))} value={ch} onValueChange={setCh} />}
            <SegmentedControl ariaLabel="Situação" size="sm" value={view} onValueChange={setView} options={[{ value: "abertas", label: "Abertas" }, { value: "nao-lidas", label: "Não lidas" }, { value: "resolvidas", label: "Resolvidas" }, { value: "todas", label: "Todas" }]} />
          </div>
          <p className="t-label border-b border-line-soft bg-surface-2 px-3 py-2 !text-[10px]">Conversas · {list.length}</p>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {list.length === 0 && <EmptyState compact icon={<MessageSquare />} title={convs.length ? "Nenhuma conversa aqui" : "Nenhuma mensagem ainda"} description={convs.length ? undefined : "Quando um cliente escrever, a conversa aparece aqui na hora."} />}
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => void open(c)} className={cn("flex w-full items-start gap-3 border-b border-line-soft px-3 py-3 text-left transition-colors", c.id === activeId ? "bg-accent-tint" : "hover:bg-surface-2")}>
                  {c.contact_picture ? <img src={c.contact_picture} alt="" className="size-[34px] shrink-0 rounded-full object-cover" /> : <Avatar name={c.contact_name} size={34} />}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center justify-between gap-2"><span className={cn("truncate text-body", c.unread ? "font-bold" : "font-semibold")}>{c.contact_name}</span><span className="num shrink-0 t-caption">{time(c.last_message_at)}</span></span>
                    <span className="truncate t-secondary">{c.last_message_preview}</span>
                    <span className="flex items-center gap-1.5"><Tag className="!h-4 gap-1 !text-[9.5px]">{channelIcon(c.channel)}{c.channel}</Tag>{c.status === "Resolvida" && <CheckCheck className="size-3.5 text-positive" />}</span>
                  </span>
                  {c.unread > 0 && <span className="num mt-1 grid size-5 place-items-center rounded-full bg-accent text-[10.5px] font-bold text-accent-ink">{c.unread}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {active ? (
          <div className="flex min-h-0 flex-col">
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" className="t-secondary md:hidden" onClick={() => setActiveId(null)}>←</button>
                {active.contact_picture ? <img src={active.contact_picture} alt="" className="size-[34px] rounded-full object-cover" /> : <Avatar name={active.contact_name} size={34} />}
                <div className="flex min-w-0 flex-col"><span className="t-title truncate">{active.contact_name}</span><span className="t-caption">{active.channel}{active.contact_handle && active.contact_handle !== active.contact_name ? ` · ${active.contact_handle}` : ""}</span></div>
              </div>
              <Button size="sm" icon={<CheckCheck />} onClick={() => void toggleStatus()}>{active.status === "Aberta" ? "Resolver" : "Reabrir"}</Button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-surface-2 p-4">
              {msgs.map((m) => (
                <div key={m.id} className={cn("flex max-w-[75%] flex-col gap-1 rounded-lg px-3 py-2", m.direction === "out" ? "self-end bg-accent text-accent-ink" : "self-start border border-line bg-surface")}>
                  <Attachment m={m} />
                  {m.body && !(m.media_url && /^\[(Foto|Vídeo|Áudio|Figurinha|Anexo)\]$/.test(m.body)) && <span className="whitespace-pre-wrap break-words text-body">{m.body}</span>}
                  <span className={cn("num flex items-center justify-end gap-1 self-end text-[10.5px]", m.direction === "out" ? "opacity-75" : "text-text-dim")}>
                    {formatDateTime(new Date(m.sent_at))}{m.direction === "out" && m.status ? ` · ${STATUS_LABEL[m.status] ?? m.status}` : ""}
                  </span>
                  {m.error && <span className="text-[11px] font-semibold">{m.error}</span>}
                </div>
              ))}
              <div ref={bottom} />
            </div>
            {windowOpen ? (
              <div className="flex items-end gap-2 border-t border-line p-3">
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Escreva uma resposta… (Enter envia, Shift+Enter quebra linha)" className="!min-h-[44px]" rows={1} />
                <Button variant="primary" icon={<Send />} loading={sending} disabled={!draft.trim()} onClick={() => void send()}>Enviar</Button>
              </div>
            ) : (
              <div className="border-t border-line p-3">
                <InlineNotice tone="info" icon={<Clock />} action={active.channel === "WhatsApp" ? <Button size="sm" variant="primary" onClick={() => setTplOpen({ to: active.contact_handle ?? undefined, name: active.contact_name })}>Enviar modelo</Button> : undefined}>
                  {active.channel === "WhatsApp" ? "Passaram mais de 24 horas desde a última mensagem do cliente. Para falar com ele agora, envie um modelo aprovado." : "Passaram mais de 24 horas desde a última mensagem do cliente. O Instagram só permite responder dentro dessa janela."}
                </InlineNotice>
              </div>
            )}
          </div>
        ) : <div className="hidden items-center justify-center md:flex"><EmptyState icon={<MessageSquare />} title="Selecione uma conversa" /></div>}
      </div>
      {ws && <SendTemplateModal open={!!tplOpen} onOpenChange={(o) => !o && setTplOpen(null)} ws={ws} defaultTo={tplOpen?.to} defaultName={tplOpen?.name} onSent={(id) => { void loadConvs().then(() => setActiveId(id)); }} />}
    </Page>
  );
}

/* ------------------------------------------------------------------ Comentários e menções */
interface Comment { id: string; kind: "comment" | "mention"; author_username: string | null; body: string; replied: boolean; reply_text: string | null; hidden: boolean; media_caption: string | null; media_permalink: string | null; media_thumbnail: string | null; commented_at: string }

export function LiveInboxComments({ kind }: { kind: "comment" | "mention" }) {
  const toast = useToast();
  const { accounts, ws } = useChannelAccounts("instagram");
  const [rows, setRows] = useState<Comment[] | null>(null);
  const [replying, setReplying] = useState<Comment | null>(null);
  const [deleting, setDeleting] = useState<Comment | null>(null);
  const load = useCallback(async () => {
    if (!supabase || !ws) return;
    const { data } = await supabase.from("social_comments").select("id, kind, author_username, body, replied, reply_text, hidden, media_caption, media_permalink, media_thumbnail, commented_at")
      .eq("workspace_id", ws).eq("kind", kind).eq("from_owner", false).order("commented_at", { ascending: false }).limit(500);
    setRows((data as Comment[] | null) ?? []);
  }, [ws, kind]);
  useEffect(() => { void load(); }, [load]);
  const act = async (body: Record<string, unknown>, ok: string) => {
    try { await channelCall({ workspaceId: ws, ...body }); toast({ tone: "success", title: ok }); await load(); }
    catch (e) { toast({ tone: "error", title: "Não foi possível concluir", description: e instanceof Error ? e.message : String(e) }); }
  };
  const title = kind === "comment" ? "Comentários" : "Menções";
  if (accounts === null || rows === null) return <Page><PageHeader title={title} /><LoadingState /></Page>;
  if (!accounts.length && !rows.length) return <Page><PageHeader title={title} /><NoChannels /></Page>;

  return (
    <>
      <ListScreen<Comment> demo={false} title={title} description={kind === "comment" ? "Comentários nas publicações do Instagram. Responda em público ou por mensagem direta." : "Publicações e comentários em que marcaram a sua conta do Instagram."}
        rows={rows} getId={(r) => r.id} searchText={(r) => `${r.author_username ?? ""} ${r.body} ${r.media_caption ?? ""}`} refreshable onRefresh={load}
        filters={kind === "comment" ? [{ id: "r", label: "Resposta", options: [{ value: "nao", label: "Sem resposta" }, { value: "sim", label: "Respondidos" }], match: (r, v) => r.replied === (v === "sim") }] : []}
        defaultSort={{ id: "at", dir: "desc" }}
        columns={[
          { id: "c", header: kind === "comment" ? "Comentário" : "Menção", sticky: true, cell: (r) => (
            <div className="flex max-w-[480px] flex-col gap-1">
              <span className="flex items-center gap-2"><b>{r.author_username ? `@${r.author_username}` : "Alguém"}</b>{r.hidden && <Tag>Oculto</Tag>}</span>
              <span className="whitespace-normal text-body">{r.body || "—"}</span>
              {r.reply_text && <span className="whitespace-normal t-secondary"><Reply className="mr-1 inline size-3" />{r.reply_text}</span>}
            </div>) },
          { id: "p", header: "Publicação", cell: (r) => (
            <a href={r.media_permalink ?? undefined} target="_blank" rel="noreferrer" className="flex max-w-[260px] items-center gap-2 hover:underline">
              {r.media_thumbnail && <img src={r.media_thumbnail} alt="" className="size-9 shrink-0 rounded object-cover" />}
              <span className="line-clamp-2 whitespace-normal t-secondary">{r.media_caption || "Ver no Instagram"}</span>
            </a>) },
          { id: "st", header: "Status", cell: (r) => (r.replied ? <StatusBadge tone="positive">Respondido</StatusBadge> : <StatusBadge tone="warning">Sem resposta</StatusBadge>) },
          { id: "at", header: "Data", align: "right", sortValue: (r) => Date.parse(r.commented_at), cell: (r) => <span className="text-text-soft">{formatDateTime(new Date(r.commented_at))}</span> },
          { id: "a", header: "", align: "right", cell: (r) => (
            <span className="flex justify-end gap-1">
              {kind === "comment" && <Button size="sm" icon={<Reply />} onClick={() => setReplying(r)}>Responder</Button>}
              {kind === "comment" && <IconButton size="sm" label={r.hidden ? "Mostrar comentário" : "Ocultar comentário"} onClick={() => void act({ action: "comment_hide", commentId: r.id, hidden: !r.hidden }, r.hidden ? "Comentário visível de novo" : "Comentário oculto")}>{r.hidden ? <Eye /> : <EyeOff />}</IconButton>}
              {kind === "comment" && <IconButton size="sm" label="Excluir comentário" onClick={() => setDeleting(r)}><Trash2 /></IconButton>}
              {kind === "mention" && r.media_permalink && <a href={r.media_permalink} target="_blank" rel="noreferrer" className={buttonClasses("outline", "sm")}>Abrir</a>}
            </span>) },
        ]}
        empty={{ icon: kind === "comment" ? <MessagesSquare /> : <AtSign />, title: kind === "comment" ? "Nenhum comentário ainda" : "Nenhuma menção ainda", description: kind === "comment" ? "Comentários novos chegam aqui na hora. Os das últimas publicações são trazidos ao conectar." : "Quando marcarem a sua conta, a menção aparece aqui." }} />
      <ReplyModal comment={replying} onOpenChange={(o) => !o && setReplying(null)} onSend={async (text, priv) => { if (replying) await act({ action: "comment_reply", commentId: replying.id, text, private: priv }, priv ? "Mensagem direta enviada" : "Resposta publicada"); }} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Excluir comentário?" confirmLabel="Excluir"
        description="O comentário é apagado do Instagram. Não dá para desfazer."
        onConfirm={async () => { if (deleting) await act({ action: "comment_delete", commentId: deleting.id }, "Comentário excluído"); }} />
    </>
  );
}

function ReplyModal({ comment, onOpenChange, onSend }: { comment: Comment | null; onOpenChange: (o: boolean) => void; onSend: (text: string, priv: boolean) => Promise<void> }) {
  const [text, setText] = useState("");
  const [priv, setPriv] = useState<"publico" | "privado">("publico");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setText(comment?.author_username ? `@${comment.author_username} ` : ""); setPriv("publico"); }, [comment]);
  return (
    <Modal open={!!comment} onOpenChange={onOpenChange} icon={<Reply />} title="Responder comentário" description={comment ? `“${comment.body.slice(0, 140)}”` : undefined}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!text.trim()} onClick={async () => { setBusy(true); await onSend(text, priv === "privado"); setBusy(false); onOpenChange(false); }}>{priv === "privado" ? "Enviar mensagem direta" : "Publicar resposta"}</Button></>}>
      <div className="flex flex-col gap-3">
        <SegmentedControl ariaLabel="Tipo de resposta" value={priv} onValueChange={setPriv} options={[{ value: "publico", label: "Responder em público" }, { value: "privado", label: "Mensagem direta" }]} />
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2200} />
        {priv === "privado" && <span className="t-caption">A mensagem direta chega na caixa de entrada da pessoa. O Instagram permite uma por comentário, até 7 dias depois dele.</span>}
      </div>
    </Modal>
  );
}
