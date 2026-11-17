import { CalendarClock, Cable, ExternalLink, FileText, ImagePlus, Instagram, Link2, MessageCircle, Plus, Send, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/format";
import { channelCall, type ChannelAccount } from "@/lib/channelsApi";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Button, buttonClasses, IconButton } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Controls";
import { ConfirmDialog, Modal } from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, InlineNotice, LoadingState } from "@/components/feedback/States";
import { ListScreen } from "@/components/templates/ListScreen";
import { bodyOf, CATEGORY_LABEL, SendTemplateModal, TEMPLATE_COLS, TEMPLATE_STATUS, useChannelAccounts, varsOf, type WaTemplate } from "./shared";

const connectLink = (label = "Conectar") => <Link to="/conexoes" className={buttonClasses("primary")}><Cable className="size-4" />{label}</Link>;

/* ------------------------------------------------------------------ WhatsApp › Visão geral */
export function LiveWhatsAppOverview() {
  const { accounts, ws, reload } = useChannelAccounts("whatsapp");
  const [sending, setSending] = useState(false);
  if (accounts === null) return <Page><PageHeader title="WhatsApp" /><LoadingState /></Page>;
  return (
    <>
      <ListScreen<ChannelAccount> demo={false} title="WhatsApp" description="Números do WhatsApp Business conectados: atenda na caixa de entrada, envie modelos e acompanhe a qualidade."
        rows={accounts} getId={(a) => a.id} refreshable onRefresh={reload}
        actions={<>{accounts.length > 0 && <Button variant="primary" icon={<Send />} onClick={() => setSending(true)}>Nova mensagem</Button>}<Link to="/conexoes" className={buttonClasses("outline")}><Cable className="size-4" />{accounts.length ? "Gerenciar conexão" : "Conectar WhatsApp"}</Link></>}
        columns={[
          { id: "n", header: "Número", sticky: true, cell: (a) => <div className="flex flex-col"><span className="num font-semibold">{a.name}</span><span className="t-caption">{a.display_name ?? "—"}</span></div> },
          { id: "q", header: "Qualidade", cell: (a) => (a.quality ? <StatusBadge tone={a.quality === "Alta" ? "positive" : a.quality === "Média" ? "warning" : a.quality === "Baixa" ? "negative" : "neutral"}>{a.quality}</StatusBadge> : "—") },
          { id: "l", header: "Limite de conversas", cell: (a) => (a.detail.limite ? String(a.detail.limite).replace("TIER_", "").replace("UNLIMITED", "Ilimitado").toLowerCase() + (/^\d/.test(String(a.detail.limite).replace("TIER_", "")) ? "/dia" : "") : "—") },
          { id: "w", header: "Conta WhatsApp Business", cell: (a) => <div className="flex flex-col"><span>{String(a.detail.wabaName ?? "—")}</span><span className="font-mono text-[11.5px] text-text-dim">{String(a.detail.waba ?? "")}</span></div> },
          { id: "st", header: "Status", cell: (a) => <StatusBadge tone={a.status === "ativo" ? "positive" : "warning"}>{a.status}</StatusBadge> },
        ]}
        empty={{ icon: <MessageCircle />, title: "Nenhum número conectado", description: "Conecte a conta do WhatsApp Business para receber e responder mensagens aqui.", action: connectLink("Conectar WhatsApp") }}
        after={accounts.length > 0 ? <p className="t-caption">As conversas ficam em Caixa de entrada › Mensagens. Fora da janela de 24 horas, só modelos aprovados podem ser enviados (regra da Meta).</p> : undefined} />
      {ws && <SendTemplateModal open={sending} onOpenChange={setSending} ws={ws} />}
    </>
  );
}

/* ------------------------------------------------------------------ WhatsApp › Modelos */
export function LiveWhatsAppTemplates() {
  const toast = useToast();
  const { accounts, ws, admin } = useChannelAccounts("whatsapp");
  const [rows, setRows] = useState<WaTemplate[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [sendId, setSendId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<WaTemplate | null>(null);
  const load = useCallback(async () => {
    if (!supabase || !ws) return;
    const { data } = await supabase.from("wa_templates").select(TEMPLATE_COLS).eq("workspace_id", ws).order("name");
    setRows((data as WaTemplate[] | null) ?? []);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  if (accounts === null || rows === null) return <Page><PageHeader title="Modelos" /><LoadingState /></Page>;
  if (!accounts.length) return <Page><PageHeader title="Modelos" /><div className="panel"><EmptyState icon={<FileText />} title="Nenhum número do WhatsApp conectado" description="Conecte o WhatsApp Business para criar e enviar modelos de mensagem." actions={connectLink("Conectar WhatsApp")} /></div></Page>;
  return (
    <>
      <ListScreen<WaTemplate> demo={false} title="Modelos" description="Mensagens pré-aprovadas pela Meta. São o único jeito de iniciar uma conversa ou falar depois de 24 horas."
        rows={rows} getId={(t) => t.id} searchText={(t) => `${t.name} ${bodyOf(t)}`} refreshable onRefresh={load}
        filters={[
          { id: "s", label: "Status", options: Object.entries(TEMPLATE_STATUS).map(([value, v]) => ({ value, label: v.label })), match: (t, v) => t.status === v },
          { id: "c", label: "Categoria", options: Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label })), match: (t, v) => t.category === v },
        ]}
        actions={admin ? <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>Novo modelo</Button> : undefined}
        columns={[
          { id: "n", header: "Modelo", sticky: true, sortValue: (t) => t.name, cell: (t) => <div className="flex max-w-[460px] flex-col gap-1"><span className="font-mono text-[12.5px] font-semibold">{t.name}</span><span className="line-clamp-2 whitespace-normal t-secondary">{bodyOf(t)}</span></div> },
          { id: "c", header: "Categoria", cell: (t) => <Tag>{CATEGORY_LABEL[t.category ?? ""] ?? t.category ?? "—"}</Tag> },
          { id: "l", header: "Idioma", cell: (t) => t.language },
          { id: "s", header: "Status", cell: (t) => { const s = TEMPLATE_STATUS[t.status ?? ""]; return <span className="flex flex-col gap-0.5"><StatusBadge tone={s?.tone ?? "neutral"}>{s?.label ?? t.status ?? "—"}</StatusBadge>{t.rejected_reason && <span className="t-caption">{t.rejected_reason}</span>}</span>; } },
          { id: "a", header: "", align: "right", cell: (t) => (
            <span className="flex justify-end gap-1">
              <Button size="sm" icon={<Send />} disabled={t.status !== "APPROVED"} onClick={() => setSendId(t.id)}>Enviar</Button>
              {admin && <IconButton size="sm" label={`Excluir ${t.name}`} onClick={() => setDeleting(t)}><Trash2 /></IconButton>}
            </span>) },
        ]}
        empty={{ icon: <FileText />, title: "Nenhum modelo ainda", description: "Crie um modelo e envie para aprovação. A Meta costuma responder em minutos.", action: admin ? <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>Novo modelo</Button> : undefined }} />
      {ws && <CreateTemplateModal open={creating} onOpenChange={setCreating} ws={ws} numbers={accounts} onCreated={load} />}
      {ws && <SendTemplateModal open={!!sendId} onOpenChange={(o) => !o && setSendId(null)} ws={ws} defaultTemplateId={sendId ?? undefined} />}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title={`Excluir o modelo ${deleting?.name ?? ""}?`} confirmLabel="Excluir"
        description="O modelo é apagado da conta do WhatsApp Business em todos os idiomas. O mesmo nome só pode ser usado de novo depois de 30 dias (regra da Meta)."
        onConfirm={async () => { try { await channelCall({ action: "template_delete", workspaceId: ws, templateId: deleting?.id }); toast({ tone: "info", title: "Modelo excluído" }); await load(); } catch (e) { toast({ tone: "error", title: "Não foi possível excluir", description: e instanceof Error ? e.message : String(e) }); } }} />
    </>
  );
}

function CreateTemplateModal({ open, onOpenChange, ws, numbers, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; ws: string; numbers: ChannelAccount[]; onCreated: () => void }) {
  const toast = useToast();
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("MARKETING");
  const [language, setLanguage] = useState("pt_BR");
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [buttons, setButtons] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setAccountId(numbers[0]?.id ?? ""); setName(""); setCategory("MARKETING"); setLanguage("pt_BR"); setHeader(""); setBody(""); setFooter(""); setExamples([]); setButtons([]); setError(null); } }, [open, numbers]);
  const vars = varsOf(body);
  const wabas = [...new Map(numbers.map((n) => [String(n.detail.waba), n])).values()];
  const valid = !!accountId && name.trim().length > 1 && body.trim().length > 0 && vars.every((n) => (examples[n - 1] ?? "").trim());
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await channelCall<{ status: string }>({ action: "template_create", workspaceId: ws, accountId, name, category, language, header, body, footer, examples: vars.map((n) => examples[n - 1] ?? ""), buttons });
      toast({ tone: "success", title: "Modelo enviado para aprovação", description: r.status === "APPROVED" ? "Já aprovado." : "O status muda sozinho quando a Meta responder." });
      onOpenChange(false); onCreated();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" icon={<FileText />} title="Novo modelo do WhatsApp" description="Use {{1}}, {{2}}… no texto para partes que mudam (nome, pedido, data)."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={() => void submit()}>Enviar para aprovação</Button></>}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Nome" required hint="Letras minúsculas, números e _.">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="confirmacao_pedido" />}</Field>
        {wabas.length > 1 ? <Field label="Conta do WhatsApp Business" required>{(p) => <Select id={p.id} value={accountId} onValueChange={setAccountId} options={wabas.map((n) => ({ value: n.id, label: String(n.detail.wabaName ?? n.detail.waba) }))} />}</Field> : <div />}
        <Field label="Categoria" required>{(p) => <Select id={p.id} value={category} onValueChange={setCategory} options={[{ value: "MARKETING", label: "Marketing (promoções, novidades)" }, { value: "UTILITY", label: "Utilidade (pedidos, agendamentos)" }, { value: "AUTHENTICATION", label: "Autenticação (códigos)" }]} />}</Field>
        <Field label="Idioma" required>{(p) => <Select id={p.id} value={language} onValueChange={setLanguage} options={[{ value: "pt_BR", label: "Português (Brasil)" }, { value: "en_US", label: "Inglês (EUA)" }, { value: "es", label: "Espanhol" }]} />}</Field>
        <Field label="Cabeçalho" hint="Opcional, até 60 caracteres." className="md:col-span-2">{(p) => <Input {...p} value={header} maxLength={60} onChange={(e) => setHeader(e.target.value)} />}</Field>
        <Field label="Texto" required className="md:col-span-2">{(p) => <Textarea id={p.id} value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={1024} placeholder="Olá {{1}}, seu pedido {{2}} saiu para entrega!" />}</Field>
        {vars.map((n) => <Field key={n} label={`Exemplo para {{${n}}}`} required hint="A Meta usa para avaliar o modelo.">{(p) => <Input {...p} value={examples[n - 1] ?? ""} onChange={(e) => setExamples((v) => { const c = [...v]; c[n - 1] = e.target.value; return c; })} />}</Field>)}
        <Field label="Rodapé" hint="Opcional, até 60 caracteres." className="md:col-span-2">{(p) => <Input {...p} value={footer} maxLength={60} onChange={(e) => setFooter(e.target.value)} placeholder="Responda SAIR para não receber mais" />}</Field>
        <div className="flex flex-col gap-2 md:col-span-2">
          <span className="text-secondary font-semibold text-text-soft">Botões de resposta rápida (até 3)</span>
          {buttons.map((b, i) => <div key={i} className="flex gap-2"><Input value={b} maxLength={25} onChange={(e) => setButtons((v) => v.map((x, j) => (j === i ? e.target.value : x)))} /><IconButton label="Remover botão" onClick={() => setButtons((v) => v.filter((_, j) => j !== i))}><X /></IconButton></div>)}
          {buttons.length < 3 && <Button size="sm" variant="ghost" icon={<Plus />} className="self-start" onClick={() => setButtons((v) => [...v, ""])}>Adicionar botão</Button>}
        </div>
        {error && <div className="md:col-span-2"><InlineNotice tone="negative">{error}</InlineNotice></div>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Publicações (Instagram) */
interface Post { id: string; content: string; status: "agendada" | "publicada" | "rascunho" | "falhou" | "aguardando_aprovacao"; scheduled_at: string | null; published_at: string | null; created_at: string; channel_account_ids: string[]; media_urls: string[]; media_type: string; result: Record<string, { id?: string; permalink?: string | null; erro?: string; conta: string }>; error: string | null }
const POST_STATUS: Record<Post["status"], { label: string; tone: "positive" | "info" | "neutral" | "negative" | "warning" }> = { publicada: { label: "Publicada", tone: "positive" }, agendada: { label: "Agendada", tone: "info" }, rascunho: { label: "Rascunho", tone: "neutral" }, falhou: { label: "Falhou", tone: "negative" }, aguardando_aprovacao: { label: "Aguardando aprovação", tone: "warning" } };
const TYPE_LABEL: Record<string, string> = { IMAGE: "Imagem", CAROUSEL: "Carrossel", REELS: "Reels", VIDEO: "Reels", STORIES: "Story" };

export function LivePosts() {
  const toast = useToast();
  const { accounts, ws } = useChannelAccounts("instagram");
  const [rows, setRows] = useState<Post[] | null>(null);
  const [editing, setEditing] = useState<Post | "novo" | null>(null);
  const [deleting, setDeleting] = useState<Post | null>(null);
  const load = useCallback(async () => {
    if (!supabase || !ws) return;
    const { data } = await supabase.from("posts").select("id, content, status, scheduled_at, published_at, created_at, channel_account_ids, media_urls, media_type, result, error").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(300);
    setRows((data as Post[] | null) ?? []);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  const publishNow = async (p: Post) => {
    try {
      const r = await channelCall<{ ok: boolean; error: string | null }>({ action: "post_publish", workspaceId: ws, postId: p.id });
      toast(r.ok ? { tone: "success", title: "Publicado no Instagram" } : { tone: "error", title: "A publicação falhou", description: r.error ?? undefined });
    } catch (e) { toast({ tone: "error", title: "A publicação falhou", description: e instanceof Error ? e.message : String(e) }); }
    await load();
  };
  if (accounts === null || rows === null) return <Page><PageHeader title="Publicações" /><LoadingState /></Page>;
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "conta removida";
  return (
    <>
      <ListScreen<Post> demo={false} title="Publicações" description="Publique agora ou agende no Instagram (feed, carrossel, reels e stories)."
        rows={rows} getId={(p) => p.id} searchText={(p) => p.content} refreshable onRefresh={load}
        filters={[{ id: "s", label: "Status", options: Object.entries(POST_STATUS).map(([value, v]) => ({ value, label: v.label })), match: (p, v) => p.status === v }]}
        actions={accounts.length ? <Button variant="primary" icon={<Plus />} onClick={() => setEditing("novo")}>Nova publicação</Button> : connectLink("Conectar Instagram")}
        defaultSort={{ id: "at", dir: "desc" }}
        columns={[
          { id: "t", header: "Publicação", sticky: true, cell: (p) => (
            <div className="flex max-w-[460px] items-center gap-3">
              {p.media_urls[0] && (/\.(mp4|mov|m4v)(\?|$)/i.test(p.media_urls[0]) ? <span className="grid size-11 shrink-0 place-items-center rounded bg-surface-2 t-caption">vídeo</span> : <img src={p.media_urls[0]} alt="" className="size-11 shrink-0 rounded object-cover" />)}
              <div className="flex min-w-0 flex-col gap-0.5"><span className="line-clamp-2 whitespace-normal font-semibold">{p.content || "(sem legenda)"}</span>{p.error && <span className="whitespace-normal text-[12px] text-negative">{p.error}</span>}</div>
            </div>) },
          { id: "tp", header: "Formato", cell: (p) => <Tag>{TYPE_LABEL[p.media_type] ?? p.media_type}{p.media_urls.length > 1 ? ` · ${p.media_urls.length}` : ""}</Tag> },
          { id: "c", header: "Contas", cell: (p) => <span className="flex flex-wrap gap-1">{p.channel_account_ids.map((id) => { const r = p.result?.[id]; return r?.permalink ? <a key={id} href={r.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">{accName(id)}<ExternalLink className="size-3" /></a> : <Tag key={id}>{accName(id)}</Tag>; })}</span> },
          { id: "s", header: "Status", cell: (p) => <StatusBadge tone={POST_STATUS[p.status]?.tone ?? "neutral"}>{POST_STATUS[p.status]?.label ?? p.status}</StatusBadge> },
          { id: "at", header: "Quando", align: "right", sortValue: (p) => Date.parse(p.published_at ?? p.scheduled_at ?? p.created_at), cell: (p) => <span className="text-text-soft">{p.published_at ? formatDateTime(new Date(p.published_at)) : p.scheduled_at ? formatDateTime(new Date(p.scheduled_at)) : "—"}</span> },
          { id: "a", header: "", align: "right", cell: (p) => p.status === "publicada" ? null : (
            <span className="flex justify-end gap-1">
              <Button size="sm" onClick={() => setEditing(p)}>Editar</Button>
              {p.status !== "agendada" && <Button size="sm" icon={<Send />} onClick={() => void publishNow(p)}>Publicar</Button>}
              <IconButton size="sm" label="Excluir publicação" onClick={() => setDeleting(p)}><Trash2 /></IconButton>
            </span>) },
        ]}
        empty={accounts.length ? { icon: <ImagePlus />, title: "Nenhuma publicação ainda", description: "Crie a primeira: escolha a conta, envie a imagem ou o vídeo e publique agora ou agende.", action: <Button variant="primary" icon={<Plus />} onClick={() => setEditing("novo")}>Nova publicação</Button> }
          : { icon: <Instagram />, title: "Nenhuma conta do Instagram conectada", description: "Conecte uma conta profissional do Instagram para publicar e agendar daqui.", action: connectLink("Conectar Instagram") }} />
      {ws && <Composer post={editing} onOpenChange={(o) => !o && setEditing(null)} ws={ws} accounts={accounts} onSaved={load} />}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Excluir publicação?" confirmLabel="Excluir" description="Ela sai da lista e, se estava agendada, não será publicada."
        onConfirm={async () => { try { await channelCall({ action: "post_delete", workspaceId: ws, postId: deleting?.id }); await load(); } catch (e) { toast({ tone: "error", title: "Não foi possível excluir", description: e instanceof Error ? e.message : String(e) }); } }} />
    </>
  );
}

/** Converte imagens para JPEG (o Instagram só aceita JPEG) e reduz para no máximo 1440 px. */
async function toJpeg(file: File): Promise<Blob> {
  if (file.type === "image/jpeg" && file.size < 8 * 1024 * 1024) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1440 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Não foi possível converter a imagem."))), "image/jpeg", 0.9));
}
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function Composer({ post, onOpenChange, ws, accounts, onSaved }: { post: Post | "novo" | null; onOpenChange: (o: boolean) => void; ws: string; accounts: ChannelAccount[]; onSaved: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [type, setType] = useState("FEED");
  const [mode, setMode] = useState<"agora" | "agendar" | "rascunho">("agora");
  const [when, setWhen] = useState("");
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!post) return;
    const p = post === "novo" ? null : post;
    setSelected(p?.channel_account_ids ?? (accounts.length === 1 ? [accounts[0].id] : []));
    setContent(p?.content ?? ""); setMedia(p?.media_urls ?? []);
    setType(p?.media_type === "STORIES" ? "STORIES" : p?.media_type === "REELS" || p?.media_type === "VIDEO" ? "REELS" : "FEED");
    setMode(p?.status === "agendada" ? "agendar" : p ? "rascunho" : "agora");
    setWhen(p?.scheduled_at ? localInput(new Date(p.scheduled_at)) : localInput(new Date(Date.now() + 3600_000)));
    setUrl(""); setError(null);
  }, [post, accounts]);

  const upload = async (files: FileList | null) => {
    if (!files?.length || !supabase) return;
    setUploading(true); setError(null);
    try {
      for (const f of Array.from(files).slice(0, 10 - media.length)) {
        const video = f.type.startsWith("video/");
        if (!video && !f.type.startsWith("image/")) throw new Error(`${f.name}: envie imagem ou vídeo.`);
        if (video && f.size > 300 * 1024 * 1024) throw new Error(`${f.name}: vídeo acima de 300 MB.`);
        const blob = video ? f : await toJpeg(f);
        const path = `${ws}/${crypto.randomUUID()}.${video ? (f.name.split(".").pop() || "mp4").toLowerCase() : "jpg"}`;
        const { error: e } = await supabase.storage.from("midia").upload(path, blob, { contentType: video ? f.type : "image/jpeg" });
        if (e) throw new Error(e.message);
        const pub = supabase.storage.from("midia").getPublicUrl(path).data.publicUrl;
        setMedia((m) => [...m, pub]);
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };
  const hasVideo = media.some((m) => /\.(mp4|mov|m4v)(\?|$)/i.test(m));
  const mediaType = type === "STORIES" ? "STORIES" : media.length > 1 ? "CAROUSEL" : type === "REELS" || hasVideo ? "REELS" : "IMAGE";
  const valid = mode === "rascunho" ? content.trim().length > 0 || media.length > 0 : selected.length > 0 && media.length > 0 && (mode !== "agendar" || !!when);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await channelCall<{ ok: boolean; status: string; error?: string | null }>({ action: "post_save", workspaceId: ws, id: post && post !== "novo" ? post.id : undefined, content, accountIds: selected, mediaUrls: media, mediaType, mode, scheduledAt: mode === "agendar" ? new Date(when).toISOString() : undefined });
      if (mode === "agora" && !r.ok) { setError(r.error ?? "A publicação falhou."); setBusy(false); onSaved(); return; }
      toast({ tone: "success", title: mode === "agora" ? "Publicado no Instagram" : mode === "agendar" ? "Publicação agendada" : "Rascunho salvo" });
      onOpenChange(false); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <Modal open={!!post} onOpenChange={onOpenChange} size="lg" icon={<Instagram />} title={post && post !== "novo" ? "Editar publicação" : "Nova publicação"}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!valid || uploading} icon={mode === "agendar" ? <CalendarClock /> : mode === "agora" ? <Send /> : undefined} onClick={() => void submit()}>{mode === "agora" ? "Publicar agora" : mode === "agendar" ? "Agendar" : "Salvar rascunho"}</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-secondary font-semibold text-text-soft">Contas</span>
          <div className="flex flex-wrap gap-3">{accounts.map((a) => <Checkbox key={a.id} checked={selected.includes(a.id)} onCheckedChange={(v) => setSelected((s) => (v ? [...s, a.id] : s.filter((x) => x !== a.id)))} label={a.name} />)}</div>
        </div>
        <SegmentedControl ariaLabel="Formato" value={type} onValueChange={setType} options={[{ value: "FEED", label: "Feed / carrossel" }, { value: "REELS", label: "Reels" }, { value: "STORIES", label: "Story" }]} />
        <div className="flex flex-col gap-2">
          <span className="text-secondary font-semibold text-text-soft">Mídia {type === "FEED" ? "(até 10 para carrossel)" : "(1 arquivo)"}</span>
          <div className="flex flex-wrap gap-2">
            {media.map((m, i) => (
              <div key={m} className="relative size-20 overflow-hidden rounded-md border border-line bg-surface-2">
                {/\.(mp4|mov|m4v)(\?|$)/i.test(m) ? <video src={m} className="size-full object-cover" muted /> : <img src={m} alt="" className="size-full object-cover" />}
                <button type="button" aria-label="Remover mídia" className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-white" onClick={() => setMedia((v) => v.filter((_, j) => j !== i))}><X className="size-3" /></button>
              </div>
            ))}
            {media.length < (type === "FEED" ? 10 : 1) && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="grid size-20 place-items-center rounded-md border border-dashed border-line-strong text-text-muted hover:bg-surface-2">
                {uploading ? <span className="t-caption">Enviando…</span> : <Upload className="size-5" />}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime" multiple={type === "FEED"} hidden onChange={(e) => void upload(e.target.files)} />
          <div className="flex gap-2">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Ou cole o link público de uma imagem (JPEG) ou vídeo (MP4)" />
            <Button icon={<Link2 />} disabled={!/^https:\/\//.test(url)} onClick={() => { setMedia((m) => [...m, url.trim()]); setUrl(""); }}>Adicionar</Button>
          </div>
          <span className="t-caption">Imagens são convertidas para JPEG. Proporção aceita no feed: de 4:5 (vertical) a 1,91:1 (horizontal). Reels e stories: 9:16.</span>
        </div>
        {type !== "STORIES" && <Field label="Legenda" hint={`${content.length}/2200 · até 30 hashtags`}>{(p) => <Textarea id={p.id} value={content} onChange={(e) => setContent(e.target.value)} rows={5} maxLength={2200} />}</Field>}
        <div className="flex flex-col gap-2">
          <SegmentedControl ariaLabel="Quando" value={mode} onValueChange={setMode} options={[{ value: "agora", label: "Publicar agora" }, { value: "agendar", label: "Agendar" }, { value: "rascunho", label: "Rascunho" }]} />
          {mode === "agendar" && <Input type="datetime-local" value={when} min={localInput(new Date(Date.now() + 120_000))} onChange={(e) => setWhen(e.target.value)} className="max-w-[260px]" />}
          {mode === "agendar" && <span className="t-caption">O NinePro publica no horário escolhido (verificação a cada 5 minutos).</span>}
        </div>
        {error && <InlineNotice tone="negative">{error}</InlineNotice>}
      </div>
    </Modal>
  );
}
