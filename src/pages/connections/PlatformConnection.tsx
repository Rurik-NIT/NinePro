import { Cable, RefreshCw, Unplug } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/lib/workspace";
import { useData } from "@/data/source";
import { formatDateTime } from "@/lib/format";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Controls";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { InlineNotice } from "@/components/feedback/States";
import { PlatformDot } from "@/components/data/Platform";
import { ConnectModal } from "./ConnectModal";
import { PLATFORM_GUIDE } from "./platformGuides";

interface Conn { id: string; auth_mode?: string; app_id?: string | null; external_user_name: string | null; status: "ativa" | "expirada" | "erro"; last_error: string | null; last_synced_at: string | null; token_expires_at: string | null; scopes: string[] }
interface Acc { id: string; name: string; external_id: string; currency: string; status: string; sync_enabled: boolean; last_synced_at: string | null }
interface Run { status: string; detail: Record<string, number>; error: string | null; started_at: string; finished_at: string | null }

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const token = (await supabase!.auth.getSession()).data.session?.access_token;
  const res = await fetch("/api/connect", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const r = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(r.error ?? `Erro ${res.status}`);
  return r;
}

/** Cartão de uma plataforma de anúncios: conectar, escolher contas, sincronizar e desconectar. */
export function PlatformConnection({ platform }: { platform: "meta" | "google" | "tiktok" | "linkedin" }) {
  const guide = PLATFORM_GUIDE[platform];
  const { current } = useWorkspace();
  const data = useData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const ws = current?.id;
  const admin = current?.role === "owner" || current?.role === "admin";
  const [conn, setConn] = useState<Conn | null | undefined>(undefined);
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState<"connect" | "sync" | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const handled = useRef(false);

  const load = useCallback(async () => {
    if (!supabase || !ws) return;
    const [c, a, r] = await Promise.all([
      supabase.from("platform_connections").select("id, auth_mode, app_id, external_user_name, status, last_error, last_synced_at, token_expires_at, scopes").eq("workspace_id", ws).eq("platform", platform).maybeSingle(),
      supabase.from("ad_accounts").select("id, name, external_id, currency, status, sync_enabled, last_synced_at").eq("workspace_id", ws).eq("platform", platform).order("name"),
      supabase.from("sync_runs").select("status, detail, error, started_at, finished_at").eq("workspace_id", ws).eq("platform", platform).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setConn((c.data as Conn | null) ?? null);
    setAccounts((a.data as Acc[] | null) ?? []);
    setLastRun((r.data as Run | null) ?? null);
  }, [ws, platform]);
  useEffect(() => { void load(); }, [load]);

  const sync = useCallback(async (days = 30) => {
    if (!ws) return;
    setBusy("sync");
    try {
      const r = await call<{ ok: boolean; detail: Record<string, number>; error?: string }>({ action: "sync", workspaceId: ws, platform, days });
      toast({ tone: "success", title: "Sincronização concluída", description: `${r.detail.campanhas} campanhas, ${r.detail.anuncios} anúncios e ${r.detail.linhas_de_metricas} linhas de métricas (${r.detail.dias} dias).` });
      await data.refresh();
    } catch (e) {
      toast({ tone: "error", title: "A sincronização falhou", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
      await load();
    }
  }, [ws, platform, toast, data, load]);

  // Volta do OAuth: ?plataforma=<id>&resultado=conectado|erro|cancelado
  useEffect(() => {
    const p = params.get("plataforma") ?? (params.get("meta") ? "meta" : null);
    const r = params.get("resultado") ?? params.get("meta");
    if (p !== platform || !r || handled.current || !ws) return;
    handled.current = true;
    const motivo = params.get("motivo");
    setParams({}, { replace: true });
    if (r === "conectado") { toast({ tone: "success", title: `${guide.label} conectado`, description: "Buscando contas, campanhas e métricas dos últimos 30 dias…" }); void sync(30); }
    else if (r === "cancelado") toast({ tone: "info", title: "Conexão cancelada" });
    else toast({ tone: "error", title: `Não foi possível conectar ${guide.label}`, description: motivo ?? undefined });
  }, [params, setParams, ws, toast, sync, platform, guide.label]);

  const connect = () => setConnecting(true);

  const statusBadge = !conn ? <StatusBadge tone="neutral">Não conectada</StatusBadge>
    : conn.status === "ativa" ? <span className="flex flex-wrap items-center gap-2"><StatusBadge tone="positive">Conectada{conn.external_user_name ? ` como ${conn.external_user_name}` : ""}</StatusBadge><Tag>{conn.auth_mode === "token" ? "Token de acesso" : conn.auth_mode === "app_proprio" ? `App da empresa${conn.app_id ? ` · ${conn.app_id.slice(0, 24)}` : ""}` : guide.loginLabel}</Tag></span>
    : conn.status === "expirada" ? <StatusBadge tone="warning">Autorização expirada</StatusBadge>
    : <StatusBadge tone="negative">Erro na última sincronização</StatusBadge>;

  return (
    <li className="panel flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md border border-line bg-surface-2"><PlatformDot id={platform} className="size-3.5" /></span>
          <div className="flex flex-col items-start gap-1"><span className="t-title">{guide.label}</span>{conn === undefined ? <span className="t-caption">Carregando…</span> : statusBadge}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {conn && conn.status !== "expirada" && <Button size="sm" icon={<RefreshCw className={busy === "sync" ? "animate-spin" : ""} />} disabled={!!busy} onClick={() => void sync(30)}>{busy === "sync" ? "Sincronizando…" : "Sincronizar agora"}</Button>}
          {admin && (!conn || conn.status !== "ativa") && <Button size="sm" variant={conn ? "primary" : "tinted"} icon={<Cable />} disabled={!!busy} onClick={connect}>{conn ? "Reconectar" : "Conectar"}</Button>}
          {admin && conn && <Button size="sm" variant="ghost" icon={<Unplug />} disabled={!!busy} onClick={() => setConfirmOff(true)}>Desconectar</Button>}
        </div>
      </div>

      {!admin && !conn && <InlineNotice tone="info">Peça a um administrador do espaço para conectar esta plataforma.</InlineNotice>}
      {conn?.last_error && <InlineNotice tone={conn.status === "expirada" ? "warning" : "negative"}>{conn.last_error}</InlineNotice>}

      {conn && (
        <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="t-label !text-[10px]">Contas de anúncio ({accounts.length})</span>
            <span className="t-caption">{lastRun ? `Última sincronização: ${formatDateTime(new Date(lastRun.started_at))} · ${lastRun.status === "ok" ? "ok" : lastRun.status === "rodando" ? "em andamento" : "com erro"}` : "Ainda não sincronizado"} · automática todo dia</span>
          </div>
          {accounts.length === 0 ? <span className="t-secondary">Nenhuma conta encontrada. Clique em “Sincronizar agora”.</span> : (
            <ul className="divide-y divide-line-soft rounded-md border border-line">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col"><span className="truncate font-semibold">{a.name}</span><span className="t-caption">{a.external_id.replace("act_", "")} · {a.currency}{a.last_synced_at ? ` · sincronizada ${formatDateTime(new Date(a.last_synced_at))}` : ""}</span></div>
                  {a.status !== "connected" && <Tag tone="warning">Conta inativa</Tag>}
                  <Switch size="sm" ariaLabel={`Sincronizar ${a.name}`} checked={a.sync_enabled} disabled={!admin}
                    onCheckedChange={async (v) => { try { await call({ action: "toggle_account", workspaceId: ws, accountId: a.id, enabled: v }); await load(); } catch (e) { toast({ tone: "error", title: "Não foi possível alterar", description: e instanceof Error ? e.message : String(e) }); } }} />
                </li>
              ))}
            </ul>
          )}
          <span className="t-caption">Pausar ou ativar uma campanha no NinePro (ou por um agente) altera também em {guide.label}.</span>
        </div>
      )}

      {ws && <ConnectModal platform={platform} open={connecting} onOpenChange={setConnecting} ws={ws} call={call} onConnected={() => { void load().then(() => sync(30)); }} />}

      <ConfirmDialog open={confirmOff} onOpenChange={setConfirmOff} title={`Desconectar ${guide.label}?`} confirmLabel="Desconectar"
        description={`O NinePro para de sincronizar e de alterar campanhas em ${guide.label}. As campanhas e métricas já importadas continuam no histórico.`}
        onConfirm={async () => { try { await call({ action: "disconnect", workspaceId: ws, platform }); toast({ tone: "info", title: `${guide.label} desconectado` }); await load(); } catch (e) { toast({ tone: "error", title: "Não foi possível desconectar", description: e instanceof Error ? e.message : String(e) }); } }} />
    </li>
  );
}
