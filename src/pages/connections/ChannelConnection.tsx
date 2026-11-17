import { Cable, Copy, Instagram, MessageCircle, RefreshCw, Unplug } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/lib/workspace";
import { formatDateTime, formatValue } from "@/lib/format";
import { CHANNEL_ACCOUNT_COLS, connectCall, webhookUrl, type ChannelAccount } from "@/lib/channelsApi";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { InlineNotice } from "@/components/feedback/States";
import { ConnectModal } from "./ConnectModal";
import { PLATFORM_GUIDE } from "./platformGuides";

type Kind = "whatsapp" | "instagram";
interface Conn { id: string; auth_mode: string; app_id: string | null; external_user_name: string | null; status: "ativa" | "expirada" | "erro"; last_error: string | null; last_synced_at: string | null; webhook_key: string }

const READS: Record<Kind, string[]> = {
  whatsapp: ["Mensagens recebidas", "Respostas", "Modelos", "Status de entrega"],
  instagram: ["Mensagens diretas", "Comentários", "Menções", "Publicação"],
};
const NEXT: Record<Kind, { to: string; label: string }[]> = {
  whatsapp: [{ to: "/caixa-de-entrada/mensagens", label: "Abrir conversas" }, { to: "/whatsapp/modelos", label: "Modelos" }],
  instagram: [{ to: "/caixa-de-entrada/mensagens", label: "Mensagens" }, { to: "/caixa-de-entrada/comentarios", label: "Comentários" }, { to: "/publicacoes", label: "Publicar" }],
};

function CopyRow({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-2.5">
      <span className="t-caption w-[120px] shrink-0">{label}</span>
      <code className="flex-1 break-all font-mono text-[12px]">{value}</code>
      <IconButton label={`Copiar ${label.toLowerCase()}`} size="sm" onClick={() => navigator.clipboard?.writeText(value).then(() => toast({ tone: "info", title: `${label} copiado` }), () => undefined)}><Copy /></IconButton>
    </div>
  );
}

/** Cartão de um canal (WhatsApp Business ou Instagram): conectar, ver números/contas, webhook e sincronizar. */
export function ChannelConnection({ kind }: { kind: Kind }) {
  const guide = PLATFORM_GUIDE[kind];
  const { current } = useWorkspace();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const ws = current?.id;
  const admin = current?.role === "owner" || current?.role === "admin";
  const [conn, setConn] = useState<Conn | null | undefined>(undefined);
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const handled = useRef(false);

  const load = useCallback(async () => {
    if (!supabase || !ws) return;
    const [c, a] = await Promise.all([
      supabase.from("platform_connections").select("id, auth_mode, app_id, external_user_name, status, last_error, last_synced_at, webhook_key").eq("workspace_id", ws).eq("platform", kind).maybeSingle(),
      supabase.from("channel_accounts").select(CHANNEL_ACCOUNT_COLS).eq("workspace_id", ws).eq("kind", kind).order("name"),
    ]);
    setConn((c.data as Conn | null) ?? null);
    setAccounts((a.data as ChannelAccount[] | null) ?? []);
  }, [ws, kind]);
  useEffect(() => { void load(); }, [load]);

  const sync = useCallback(async () => {
    if (!ws) return;
    setBusy(true);
    try {
      const r = await connectCall<{ ok: boolean; detail: Record<string, unknown>; error?: string }>({ action: "sync", workspaceId: ws, platform: kind });
      if (!r.ok) throw new Error(r.error ?? "Falhou");
      const d = r.detail;
      toast({ tone: "success", title: "Canal atualizado", description: kind === "whatsapp" ? `${d.contas} número(s) e ${d.modelos ?? 0} modelo(s).` : `${d.conversas ?? 0} conversa(s) e ${d.comentarios ?? 0} comentário(s) trazidos.` });
    } catch (e) {
      toast({ tone: "error", title: "Não foi possível atualizar", description: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); await load(); }
  }, [ws, kind, toast, load]);

  useEffect(() => {
    const p = params.get("plataforma"); const r = params.get("resultado");
    if (p !== kind || !r || handled.current || !ws) return;
    handled.current = true;
    const motivo = params.get("motivo");
    setParams({}, { replace: true });
    if (r === "conectado") { toast({ tone: "success", title: `${guide.label} conectado`, description: "Buscando números, contas e histórico…" }); void sync(); }
    else if (r === "cancelado") toast({ tone: "info", title: "Conexão cancelada" });
    else toast({ tone: "error", title: `Não foi possível conectar ${guide.label}`, description: motivo ?? undefined });
  }, [params, setParams, ws, toast, sync, kind, guide.label]);

  const icon = kind === "whatsapp" ? <MessageCircle /> : <Instagram />;
  const ownWebhook = conn && conn.auth_mode !== "app_ninepro";
  const statusBadge = !conn ? <span className="t-caption">Não conectado</span>
    : conn.status === "ativa" ? <span className="flex flex-wrap items-center gap-2"><StatusBadge tone="positive">Conectado{conn.external_user_name ? ` como ${conn.external_user_name}` : ""}</StatusBadge><Tag>{conn.auth_mode === "token" ? "Token de acesso" : conn.auth_mode === "app_proprio" ? "App da empresa" : guide.loginLabel}</Tag></span>
    : conn.status === "expirada" ? <StatusBadge tone="warning">Autorização expirada</StatusBadge>
    : <StatusBadge tone="negative">Erro na última atualização</StatusBadge>;

  return (
    <li className="panel flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md border border-line bg-surface-2 text-text-muted [&_svg]:size-[18px]">{icon}</span>
          <div className="flex flex-col gap-0.5"><span className="t-title">{guide.label}</span>{conn === undefined ? <span className="t-caption">Carregando…</span> : statusBadge}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {conn && conn.status !== "expirada" && <Button size="sm" icon={<RefreshCw className={busy ? "animate-spin" : ""} />} disabled={busy} onClick={() => void sync()}>{busy ? "Atualizando…" : "Atualizar"}</Button>}
          {admin && (!conn || conn.status !== "ativa") && <Button size="sm" variant="primary" icon={<Cable />} disabled={busy} onClick={() => setConnecting(true)}>{conn ? "Reconectar" : "Conectar"}</Button>}
          {admin && conn && <Button size="sm" variant="ghost" icon={<Unplug />} disabled={busy} onClick={() => setConfirmOff(true)}>Desconectar</Button>}
        </div>
      </div>

      {!admin && !conn && <InlineNotice tone="info">Peça a um administrador do espaço para conectar este canal.</InlineNotice>}
      {conn?.last_error && <InlineNotice tone={conn.status === "expirada" ? "warning" : conn.status === "ativa" ? "warning" : "negative"}>{conn.last_error}</InlineNotice>}

      {!conn && (
        <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
          <span className="t-label !text-[10px]">O que o NinePro vai fazer</span>
          <div className="flex flex-wrap gap-1.5">{READS[kind].map((s) => <Tag key={s}>{s}</Tag>)}</div>
        </div>
      )}

      {conn && (
        <div className="flex flex-col gap-3 border-t border-line-soft pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="t-label !text-[10px]">{kind === "whatsapp" ? `Números (${accounts.length})` : `Conta (${accounts.length})`}</span>
            <span className="t-caption">{conn.last_synced_at ? `Atualizado ${formatDateTime(new Date(conn.last_synced_at))}` : "Ainda não atualizado"}</span>
          </div>
          {accounts.length === 0 ? <span className="t-secondary">Nada encontrado ainda. Clique em “Atualizar”.</span> : (
            <ul className="divide-y divide-line-soft rounded-md border border-line">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                  {a.picture_url ? <img src={a.picture_url} alt="" className="size-8 rounded-full object-cover" /> : null}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{a.name}{a.display_name ? <span className="font-normal text-text-soft"> · {a.display_name}</span> : null}</span>
                    <span className="t-caption">{kind === "whatsapp"
                      ? [a.quality ? `Qualidade ${a.quality}` : null, a.detail.limite ? `Limite ${String(a.detail.limite).replace("TIER_", "").toLowerCase()}` : null, a.detail.wabaName ? String(a.detail.wabaName) : null].filter(Boolean).join(" · ")
                      : [a.detail.seguidores != null ? `${formatValue(Number(a.detail.seguidores), "compact")} seguidores` : null, a.detail.publicacoes != null ? `${a.detail.publicacoes} publicações` : null].filter(Boolean).join(" · ")}</span>
                  </div>
                  <StatusBadge tone={a.status === "ativo" ? "positive" : a.status === "desconectado" ? "neutral" : "warning"}>{a.status}</StatusBadge>
                </li>
              ))}
            </ul>
          )}

          {ownWebhook && (
            <div className="flex flex-col gap-2">
              <span className="t-label !text-[10px]">Webhook do seu app (para receber mensagens{kind === "instagram" ? " e comentários" : ""})</span>
              <CopyRow label="URL de retorno" value={webhookUrl(conn.webhook_key)} />
              <CopyRow label="Token de verificação" value={conn.webhook_key} />
              <span className="t-caption">{kind === "whatsapp" ? "Cole em WhatsApp › Configuração › Webhook no seu app e assine o campo messages." : "Cole em Instagram › Configurar webhooks no seu app e assine messages e comments."}</span>
            </div>
          )}
          {accounts.length > 0 && <div className="flex flex-wrap gap-2">{NEXT[kind].map((n) => <Link key={n.to} to={n.to} className="t-secondary font-semibold text-accent-text hover:underline">{n.label} →</Link>)}</div>}
        </div>
      )}

      {ws && <ConnectModal platform={kind} open={connecting} onOpenChange={setConnecting} ws={ws} call={connectCall} onConnected={() => { void load().then(sync); }} />}
      <ConfirmDialog open={confirmOff} onOpenChange={setConfirmOff} title={`Desconectar ${guide.label}?`} confirmLabel="Desconectar"
        description="O NinePro para de receber e de enviar mensagens por este canal. As conversas e comentários já recebidos continuam no histórico."
        onConfirm={async () => { try { await connectCall({ action: "disconnect", workspaceId: ws, platform: kind }); toast({ tone: "info", title: `${guide.label} desconectado` }); await load(); } catch (e) { toast({ tone: "error", title: "Não foi possível desconectar", description: e instanceof Error ? e.message : String(e) }); } }} />
    </li>
  );
}
