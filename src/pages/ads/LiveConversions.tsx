/** Conversões com dados reais: visão geral e destinos (API de Conversões da Meta e Events API do TikTok). */
import { Check, Code2, KeyRound, Send, Store, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/lib/workspace";
import { appCall } from "@/lib/channelsApi";
import { formatDateTime, formatValue } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useData } from "@/data/source";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Button, buttonClasses, IconButton } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Controls";
import { ConfirmDialog, Modal } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { InlineNotice, LoadingState } from "@/components/feedback/States";
import { KpiStrip } from "@/components/data/Metrics";

interface Dest { id: string; platform: "meta" | "tiktok"; pixel_id: string; test_code: string | null; enabled: boolean; sent_count: number; error_count: number; last_sent_at: string | null; last_error: string | null }
const DEST_COLS = "id, platform, pixel_id, test_code, enabled, sent_count, error_count, last_sent_at, last_error";
const PERIOD = [{ value: "7", label: "Últimos 7 dias" }, { value: "30", label: "Últimos 30 dias" }, { value: "90", label: "Últimos 90 dias" }];
const INFO = {
  meta: { label: "Meta (Facebook e Instagram)", api: "API de Conversões", pixel: "ID do conjunto de dados (pixel)", pixelHint: "Gerenciador de Eventos › Fontes de dados › seu pixel › Configurações › ID", token: "Token de acesso", tokenHint: "Gerenciador de Eventos › seu pixel › Configurações › API de Conversões › Gerar token de acesso", test: "Gerenciador de Eventos › Testar eventos › código (ex.: TEST12345)" },
  tiktok: { label: "TikTok", api: "Events API", pixel: "Código do pixel", pixelHint: "TikTok Ads Manager › Ferramentas › Eventos › seu pixel (ex.: C1ABC…)", token: "Token de acesso", tokenHint: "Eventos › seu pixel › Configurações › Events API › Gerar token de acesso", test: "Eventos › seu pixel › Testar eventos › código" },
} as const;

function useDestinations() {
  const { current } = useWorkspace();
  const ws = current?.id;
  const [rows, setRows] = useState<Dest[] | null>(null);
  const load = useCallback(async () => {
    if (!supabase || !ws) return;
    const { data } = await supabase.from("conversion_destinations").select(DEST_COLS).eq("workspace_id", ws);
    setRows((data as Dest[] | null) ?? []);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  return { rows, load, ws, admin: current?.role === "owner" || current?.role === "admin" };
}

export function LiveConversionsOverview() {
  const { convEvents } = useData();
  const { current } = useWorkspace();
  const { rows: dests } = useDestinations();
  const [sites, setSites] = useState<number | null>(null);
  const [period, setPeriod] = useState("7");
  useEffect(() => { if (supabase && current?.id) supabase.from("tracked_sites").select("id", { count: "exact", head: true }).eq("workspace_id", current.id).then(({ count }) => setSites(count ?? 0)); }, [current?.id]);
  const since = Date.now() - Number(period) * 86_400_000;
  const ev = convEvents.filter((e) => e.receivedAt.getTime() >= since);
  const purchases = ev.filter((e) => e.type === "Compra");
  const sent = ev.filter((e) => e.sentTo.length > 0);
  const active = (dests ?? []).filter((d) => d.enabled).length;
  const steps = [
    { icon: <Store />, t: "Receba as conversões", d: "Pela tag no site ou pela API (seu sistema, loja ou agente de IA).", done: ev.length > 0 || (sites ?? 0) > 0, to: "/anuncios/conversoes/fontes", cta: "Ver fontes" },
    { icon: <Code2 />, t: "Instale a tag no site", d: "Visitas, UTMs e IDs de clique (fbclid, ttclid, gclid) ficam guardados para atribuir a venda.", done: (sites ?? 0) > 0, to: "/anuncios/conversoes/fontes", cta: "Instalar a tag" },
    { icon: <Send />, t: "Envie para as plataformas", d: "A Meta e o TikTok recebem cada conversão pelo servidor e otimizam a entrega dos anúncios.", done: active > 0, to: "/anuncios/conversoes/destinos", cta: "Configurar destinos" },
  ];
  return (
    <Page>
      <PageHeader title="Conversões" description="Toda venda e lead contados nos anúncios: de onde vêm, a tag no site e as plataformas que recebem os eventos."
        actions={<div className="w-[180px]"><Select ariaLabel="Período" value={period} onValueChange={setPeriod} options={PERIOD} /></div>} />
      <KpiStrip hero={false} items={[
        { id: "e", label: "Eventos recebidos", value: ev.length, format: "integer" },
        { id: "p", label: "Compras", value: purchases.length, format: "integer" },
        { id: "v", label: "Valor das compras", value: purchases.reduce((a, e) => a + e.value, 0), format: "currency" },
        { id: "a", label: "Enviados às plataformas", value: ev.length && active ? sent.length / ev.length : NaN, format: "percent" },
        { id: "s", label: "Sites com a tag", value: sites ?? 0, format: "integer" },
        { id: "d", label: "Destinos ativos", value: active, format: "integer" },
      ]} />
      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.t} className="panel flex flex-col gap-3 p-4">
            <div className="flex gap-3">
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-md font-mono text-[12px] font-bold", s.done ? "bg-accent text-accent-ink" : "bg-soft text-text-muted")}>{s.done ? <Check className="size-4" /> : i + 1}</span>
              <div className="flex flex-col gap-1"><span className="t-title">{s.t}</span><span className="t-secondary">{s.d}</span></div>
            </div>
            <Link to={s.to} className={cn(buttonClasses(s.done ? "outline" : "primary", "sm"), "self-start")}>{s.cta}</Link>
          </div>
        ))}
      </div>
    </Page>
  );
}

export function LiveConversionDestinations() {
  const toast = useToast();
  const { rows, load, ws, admin } = useDestinations();
  const [editing, setEditing] = useState<"meta" | "tiktok" | null>(null);
  const [removing, setRemoving] = useState<Dest | null>(null);
  if (rows === null) return <Page><PageHeader title="Destinos" /><LoadingState /></Page>;
  const of = (p: "meta" | "tiktok") => rows.find((r) => r.platform === p);
  const toggle = async (d: Dest, v: boolean) => {
    try { await appCall({ action: "dest_toggle", workspaceId: ws, platform: d.platform, enabled: v }); await load(); }
    catch (e) { toast({ tone: "error", title: "Não foi possível alterar", description: e instanceof Error ? e.message : String(e) }); }
  };
  return (
    <Page>
      <PageHeader title="Destinos" description="Plataformas que recebem cada conversão pelo servidor, com o pixel e o token da sua conta. Ajuda os anúncios a encontrar quem compra, mesmo com bloqueadores e sem cookies." />
      <section className="panel overflow-hidden">
        <div className="t-label border-b border-line bg-surface-2 px-4 py-2.5">Plataformas de anúncio</div>
        <ul className="divide-y divide-line-soft">
          {(["meta", "tiktok"] as const).map((p) => {
            const d = of(p);
            return (
              <li key={p} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                <div className="flex min-w-[220px] flex-1 flex-col"><span className="text-body font-semibold">{INFO[p].label}</span><span className="t-caption">{d ? `${INFO[p].api} · pixel ${d.pixel_id}${d.test_code ? ` · modo de teste (${d.test_code})` : ""}` : `${INFO[p].api} · não configurado`}</span>
                  {d?.last_error && <span className="text-[12px] text-negative">Último erro: {d.last_error}</span>}</div>
                {d && <div className="flex flex-col items-end"><span className="num text-body font-bold">{formatValue(d.sent_count, "integer")}</span><span className="t-caption">{d.last_sent_at ? `último em ${formatDateTime(new Date(d.last_sent_at))}` : "eventos enviados"}</span></div>}
                {d ? <StatusBadge tone={!d.enabled ? "neutral" : d.last_error ? "warning" : "positive"}>{!d.enabled ? "Pausado" : d.last_error ? "Com erro" : d.test_code ? "Testando" : "Enviando"}</StatusBadge> : <StatusBadge tone="neutral">Desligado</StatusBadge>}
                {admin && (d ? <span className="flex items-center gap-1"><Switch size="sm" ariaLabel={`Ativar ${INFO[p].label}`} checked={d.enabled} onCheckedChange={(v) => void toggle(d, v)} /><Button size="sm" onClick={() => setEditing(p)}>Editar</Button><IconButton size="sm" label="Remover destino" onClick={() => setRemoving(d)}><Trash2 /></IconButton></span>
                  : <Button size="sm" variant="primary" icon={<KeyRound />} onClick={() => setEditing(p)}>Configurar</Button>)}
              </li>
            );
          })}
          {["Google Ads", "LinkedIn Ads"].map((n) => (
            <li key={n} className="flex flex-wrap items-center gap-4 px-4 py-3.5 opacity-70">
              <div className="flex min-w-[220px] flex-1 flex-col"><span className="text-body font-semibold">{n}</span><span className="t-caption">Envio de conversões em desenvolvimento. As conversões já ficam registradas e atribuídas às campanhas no NinePro.</span></div>
              <Tag>Em breve</Tag>
            </li>
          ))}
        </ul>
      </section>
      <InlineNotice tone="info">Cada conversão sai com o mesmo ID de evento do navegador: se você também usa o pixel no site, a plataforma conta uma vez só. E-mail e telefone vão criptografados (SHA-256).</InlineNotice>
      {ws && <DestinationModal platform={editing} current={editing ? of(editing) : undefined} ws={ws} onOpenChange={(o) => !o && setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remover destino?" confirmLabel="Remover" description="As próximas conversões deixam de ser enviadas para esta plataforma. O token é apagado."
        onConfirm={async () => { try { await appCall({ action: "dest_delete", workspaceId: ws, platform: removing?.platform }); await load(); } catch (e) { toast({ tone: "error", title: "Não foi possível remover", description: e instanceof Error ? e.message : String(e) }); } }} />
    </Page>
  );
}

function DestinationModal({ platform, current, ws, onOpenChange, onSaved }: { platform: "meta" | "tiktok" | null; current?: Dest; ws: string; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const toast = useToast();
  const [pixel, setPixel] = useState("");
  const [token, setToken] = useState("");
  const [test, setTest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (platform) { setPixel(current?.pixel_id ?? ""); setToken(""); setTest(current?.test_code ?? ""); setError(null); } }, [platform, current]);
  if (!platform) return null;
  const i = INFO[platform];
  const save = async () => {
    setBusy(true); setError(null);
    try { await appCall({ action: "dest_save", workspaceId: ws, platform, pixelId: pixel, token: token || undefined, testCode: test }); toast({ tone: "success", title: `${i.label} configurado`, description: "Conferimos o pixel e o token com um evento de teste." }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  return (
    <Modal open={!!platform} onOpenChange={onOpenChange} icon={<Send />} title={`${current ? "Editar" : "Configurar"} ${i.label}`} description={`${i.api}: as conversões saem do servidor do NinePro direto para a sua conta.`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!pixel.trim() || (!current && token.trim().length < 20)} onClick={() => void save()}>Conferir e salvar</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label={i.pixel} hint={i.pixelHint}>{(p) => <Input {...p} value={pixel} onChange={(e) => setPixel(e.target.value.trim())} />}</Field>
        <Field label={i.token} hint={current ? "Deixe vazio para manter o token salvo." : i.tokenHint}>{(p) => <Input {...p} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={current ? "••••••••" : undefined} />}</Field>
        <Field label="Código de teste (opcional)" hint={`Enquanto preenchido, os eventos aparecem só na tela de teste da plataforma. ${i.test}`}>{(p) => <Input {...p} value={test} onChange={(e) => setTest(e.target.value.trim())} className="max-w-[220px]" />}</Field>
        {error && <InlineNotice tone="negative">{error}</InlineNotice>}
      </div>
    </Modal>
  );
}
