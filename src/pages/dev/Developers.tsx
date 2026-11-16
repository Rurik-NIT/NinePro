import { Activity, Copy, KeyRound, Pause, Play, Plus, Radio, ScrollText, Trash2, UserPlus, Users as UsersIcon, Webhook } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { API_KEYS, LOGS, MEMBERS, WEBHOOKS } from "@/data/demo/extra";
import { WEBHOOK_EVENTS } from "../../../server/events";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/lib/supabase";
import { MoreHorizontal, Send, Eye } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/Menu";
import { useData, type ApiKey, type Webhook as WebhookRow } from "@/data/source";
import { formatDateLong, formatDateTime } from "@/lib/format";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Avatar, StatusBadge, Tag } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Checkbox, Switch } from "@/components/ui/Controls";
import { ConfirmDialog, Modal } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { MultiSelect, Select } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { DemoBadge, EmptyState, InlineNotice } from "@/components/feedback/States";
import { DataTable, TableToolbar, type Column } from "@/components/data/DataTable";
import { ListScreen } from "@/components/templates/ListScreen";

/* ------------------------------------------------------------------ Chaves de API */
export function ApiKeys() {
  const toast = useToast();
  const data = useData();
  const live = data.mode === "supabase";
  const [localKeys, setKeys] = useState<ApiKey[]>(API_KEYS as ApiKey[]);
  const keys = live ? data.apiKeys : localKeys;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [perm, setPerm] = useState("Leitura e escrita");
  const [created, setCreated] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<string | null>(null);
  type K = ApiKey;
  const create = async () => {
    if (live) {
      const r = await data.createApiKey(name.trim(), perm);
      if (r.error) { toast({ tone: "error", title: "Não foi possível criar", description: r.error }); return; }
      setCreated(r.secret ?? null); setName(""); return;
    }
    const secret = `np_live_${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 18)}`;
    setKeys((k) => [{ id: `k${Date.now()}`, name: name.trim(), key: `${secret.slice(0, 12)}…${secret.slice(-4)}`, scope: "Todos os perfis", status: "Ativa", permission: perm, createdAt: new Date() }, ...k]);
    setCreated(secret); setName("");
  };
  return (
    <>
      <ListScreen<K>
        title="Chaves de API" description="Chaves para integrar o NinePro aos seus sistemas e agentes. Trate como senha."
        rows={keys} liveable onRefresh={data.refresh} refreshable getId={(k) => k.id} searchText={(k) => k.name}
        filters={[
          { id: "st", label: "Status", options: [{ value: "Ativa", label: "Ativa" }, { value: "Revogada", label: "Revogada" }], match: (k, v) => k.status === v },
          { id: "pm", label: "Permissão", options: [{ value: "Leitura e escrita", label: "Leitura e escrita" }, { value: "Somente leitura", label: "Somente leitura" }], match: (k, v) => k.permission === v },
        ]}
        actions={<Button variant="primary" icon={<Plus />} onClick={() => { setCreated(null); setOpen(true); }}>Criar chave</Button>}
        columns={[
          { id: "name", header: "Nome", sticky: true, sortValue: (k) => k.name, cell: (k) => <div className="flex flex-col"><span className="font-semibold">{k.name}</span><span className="t-caption">Criada em {formatDateLong(k.createdAt)}</span></div> },
          { id: "key", header: "Chave", cell: (k) => <span className="font-mono text-[12px] text-text-soft">{k.key}</span> },
          { id: "scope", header: "Escopo", cell: (k) => <span className="text-text-soft">{k.scope}</span> },
          { id: "st", header: "Status", cell: (k) => <StatusBadge tone={k.status === "Ativa" ? "positive" : "neutral"}>{k.status}</StatusBadge> },
          { id: "pm", header: "Permissão", cell: (k) => <Tag>{k.permission}</Tag> },
          ...(live ? [{ id: "used", header: "Último uso", align: "right" as const, sortValue: (k: K) => k.lastUsedAt?.getTime() ?? 0, cell: (k: K) => <span className="text-text-soft">{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : "Nunca"}</span> }] : []),
          { id: "act", header: <span className="sr-only">Ações</span>, width: 48, cell: (k) => k.status === "Ativa" ? <IconButton label={`Revogar ${k.name}`} size="sm" onClick={() => setRevoke(k.id)}><Trash2 /></IconButton> : null },
        ]}
        empty={{ icon: <KeyRound />, title: "Nenhuma chave", description: "Crie uma chave para acessar a API." }}
      />
      <Modal open={open} onOpenChange={setOpen} icon={<KeyRound />} title={created ? "Chave criada" : "Criar chave de API"} description={created ? "Copie agora — ela não será exibida de novo." : "Dê um nome que explique onde ela será usada."}
        footer={created ? <Button variant="primary" onClick={() => setOpen(false)}>Concluído</Button> : <><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" disabled={!name.trim()} onClick={create}>Criar chave</Button></>}>
        {created ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-3"><code className="flex-1 break-all font-mono text-[12px]">{created}</code><IconButton label="Copiar chave" size="sm" onClick={() => navigator.clipboard?.writeText(created).then(() => toast({ tone: "info", title: "Chave copiada" }), () => undefined)}><Copy /></IconButton></div>
            <InlineNotice tone="warning">{live ? "Guardamos só o hash desta chave. Se perder, revogue e crie outra." : "Chave de demonstração: ela não dá acesso a nada."}</InlineNotice>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label="Nome" required>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Integração BI" />}</Field>
            <Field label="Permissão">{(p) => <Select id={p.id} value={perm} onValueChange={setPerm} options={[{ value: "Leitura e escrita", label: "Leitura e escrita" }, { value: "Somente leitura", label: "Somente leitura" }]} />}</Field>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!revoke} onOpenChange={(o) => !o && setRevoke(null)} title="Revogar chave?" confirmLabel="Revogar"
        description="Integrações que usam esta chave param de funcionar imediatamente."
        onConfirm={async () => { if (live) { const err = revoke ? await data.revokeApiKey(revoke) : null; if (err) { toast({ tone: "error", title: "Não foi possível revogar", description: err }); return; } } else setKeys((k) => k.map((x) => (x.id === revoke ? { ...x, status: "Revogada" } : x))); toast({ tone: "success", title: "Chave revogada" }); }} />
    </>
  );
}

/* ------------------------------------------------------------------ Usuários */
export function Members({ title = "Usuários" }: { title?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Membro");
  type M = (typeof MEMBERS)[number];
  const roles = ["Proprietário", "Administrador", "Membro"];
  return (
    <>
      <ListScreen<M>
        title={title} description="Quem acessa este espaço de trabalho e com qual papel."
        rows={MEMBERS} getId={(m) => m.id} searchText={(m) => `${m.name} ${m.email}`} searchPlaceholder="Buscar pessoas"
        filters={[
          { id: "role", label: "Papel", options: roles.map((r) => ({ value: r, label: r })), match: (m, v) => m.role === v },
          { id: "acc", label: "Acesso", options: ["Acesso total", "Perfis selecionados", "Somente anúncios"].map((r) => ({ value: r, label: r })), match: (m, v) => m.access === v },
        ]}
        actions={<><Button icon={<Activity />} onClick={() => toast({ tone: "info", title: "Atividade da equipe", description: "Registro de ações chega com autenticação." })}>Atividade</Button><Button variant="primary" icon={<UserPlus />} onClick={() => setOpen(true)}>Convidar</Button></>}
        columns={[
          { id: "m", header: "Membro", sticky: true, sortValue: (m) => m.name, cell: (m) => <div className="flex items-center gap-2.5"><Avatar name={m.name} /><div className="flex flex-col"><span className="font-semibold">{m.name}</span><span className="t-caption">{m.email}</span></div></div> },
          { id: "role", header: "Papel", sortValue: (m) => m.role, cell: (m) => <Tag tone={m.role === "Proprietário" ? "accent" : undefined}>{m.role}</Tag> },
          { id: "acc", header: "Acesso", cell: (m) => <span className="text-text-soft">{m.access}</span> },
          { id: "last", header: "Último acesso", align: "right", sortValue: (m) => m.lastLogin.getTime(), cell: (m) => <span className="text-text-soft">{formatDateTime(m.lastLogin)}</span> },
        ]}
        empty={{ icon: <UsersIcon />, title: "Só você por aqui", description: "Convide a equipe para dividir o trabalho." }}
      />
      <Modal open={open} onOpenChange={setOpen} icon={<UserPlus />} title="Convidar pessoa" description="O convite chega por e-mail."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" disabled={!/\S+@\S+\.\S+/.test(email)} onClick={() => { toast({ tone: "success", title: "Convite validado", description: "Envio real exige autenticação." }); setOpen(false); setEmail(""); }}>Enviar convite</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="E-mail" required>{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" />}</Field>
          <Field label="Papel">{(p) => <Select id={p.id} value={role} onValueChange={setRole} options={roles.slice(1).map((r) => ({ value: r, label: r }))} />}</Field>
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ Webhooks */
export function Webhooks() {
  const toast = useToast();
  const data = useData();
  const live = data.mode === "supabase";
  const [localHooks, setHooks] = useState<WebhookRow[]>(WEBHOOKS as WebhookRow[]);
  const hooks = live ? data.webhooks : localHooks;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["lead.criado"]);
  const [secretOf, setSecretOf] = useState<WebhookRow | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  type W = WebhookRow;
  const toggle = async (w: W) => { if (live) { const err = await data.toggleWebhook(w.id); if (err) toast({ tone: "error", title: "Não foi possível alterar", description: err }); } else setHooks((h) => h.map((x) => (x.id === w.id ? { ...x, status: x.status === "Ativo" ? "Pausado" : "Ativo" } : x))); };
  const test = async (w: W) => {
    if (!live || !supabase) { toast({ tone: "info", title: "Teste disponível com o banco conectado" }); return; }
    setTesting(w.id);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/app", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "test_webhook", webhookId: w.id }) });
      const r = (await res.json()) as { status?: number; durationMs?: number; error?: string };
      if (!res.ok) toast({ tone: "error", title: "Não foi possível testar", description: r.error });
      else if (r.status && r.status >= 200 && r.status < 300) toast({ tone: "success", title: `Entregue: HTTP ${r.status}`, description: `${w.endpoint} respondeu em ${r.durationMs} ms.` });
      else toast({ tone: "error", title: r.status ? `O destino respondeu HTTP ${r.status}` : "Sem resposta do destino", description: r.error ?? "Confira se o endereço aceita POST com JSON." });
      await data.refresh();
    } finally { setTesting(null); }
  };
  const valid = name.trim() && /^https:\/\/\S+/.test(url) && events.length;
  return (
    <>
      <ListScreen<W>
        title="Webhooks" description="Receba eventos do NinePro no seu sistema assim que acontecem."
        rows={hooks} liveable getId={(w) => w.id} searchText={(w) => `${w.name} ${w.endpoint}`}
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>Criar webhook</Button>}
        columns={[
          { id: "name", header: "Nome", sticky: true, sortValue: (w) => w.name, cell: (w) => <span className="font-semibold">{w.name}</span> },
          { id: "ep", header: "Endpoint", cell: (w) => <span className="max-w-[260px] truncate font-mono text-[12px] text-text-soft">{w.endpoint}</span> },
          { id: "st", header: "Status", cell: (w) => <StatusBadge tone={w.status === "Ativo" ? "positive" : "neutral"}>{w.status}</StatusBadge> },
          { id: "ev", header: "Eventos", cell: (w) => <div className="flex flex-wrap gap-1">{w.events.map((e) => <Tag key={e}>{e}</Tag>)}</div> },
          { id: "h", header: "Saúde", align: "right", sortValue: (w) => (Number.isNaN(w.health) ? -1 : w.health), cell: (w) => Number.isNaN(w.health) ? <span className="text-text-dim">—</span> : <span className={cn("num font-bold", w.health >= 98 ? "text-positive" : w.health >= 90 ? "text-warning" : "text-negative")}>{w.health.toFixed(1).replace(".", ",")}%</span> },
          { id: "last", header: "Última entrega", align: "right", cell: (w) => w.lastDelivery ? <span className="flex flex-col items-end"><span className="text-text-soft">{formatDateTime(w.lastDelivery)}</span>{w.lastStatus !== undefined && w.lastStatus !== null && <span className={cn("t-caption num", w.lastStatus >= 200 && w.lastStatus < 300 ? "text-positive" : "text-negative")}>{w.lastStatus ? `HTTP ${w.lastStatus}` : "sem resposta"}</span>}</span> : <span className="text-text-dim">Nenhuma</span> },
          { id: "act", header: <span className="sr-only">Ações</span>, width: 48, cell: (w) => (
            <Menu><MenuTrigger asChild><IconButton label={`Ações de ${w.name}`} size="sm"><MoreHorizontal /></IconButton></MenuTrigger>
              <MenuContent align="end">
                <MenuItem icon={<Send />} disabled={testing === w.id} onSelect={() => void test(w)}>Enviar evento de teste</MenuItem>
                {live && <MenuItem icon={<Eye />} onSelect={() => setSecretOf(w)}>Ver segredo de assinatura</MenuItem>}
                <MenuItem icon={w.status === "Ativo" ? <Pause /> : <Play />} onSelect={() => void toggle(w)}>{w.status === "Ativo" ? "Pausar" : "Retomar"}</MenuItem>
              </MenuContent></Menu>
          ) },
        ]}
        empty={{ icon: <Webhook />, title: "Nenhum webhook ainda", description: "Crie o primeiro para ser avisado quando os eventos acontecerem.", action: <Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>Criar webhook</Button> }}
      />
      <Modal open={open} onOpenChange={setOpen} size="lg" icon={<Webhook />} title="Criar webhook" description="Enviamos um POST em JSON, assinado, para cada evento escolhido."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" disabled={!valid} onClick={async () => { if (live) { const err = await data.createWebhook(name.trim(), url, events); if (err) { toast({ tone: "error", title: "Não foi possível criar", description: err }); return; } toast({ tone: "success", title: "Webhook salvo", description: "Use “Enviar evento de teste” para conferir a entrega." }); } else { setHooks((h) => [{ id: `w${Date.now()}`, name: name.trim(), endpoint: url, status: "Ativo", events, health: 100, lastDelivery: new Date() }, ...h]); toast({ tone: "success", title: "Webhook criado (demonstração)" }); } setOpen(false); setName(""); setUrl(""); }}>Criar webhook</Button></>}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Field label="Nome" required>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Leads para o CRM" />}</Field>
            <Field label="URL do endpoint" required hint="Precisa usar HTTPS." error={url && !/^https:\/\/\S+/.test(url) ? "Use um endereço https://" : undefined}>{(p) => <Input {...p} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />}</Field>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-secondary font-semibold text-text-soft">Eventos</span>
            <div className="flex flex-col gap-2.5 rounded-md border border-line p-3">
              {WEBHOOK_EVENTS.map((e) => <Checkbox key={e.id} checked={events.includes(e.id)} onCheckedChange={(v) => setEvents((s) => (v ? [...s, e.id] : s.filter((x) => x !== e.id)))} label={<span className="flex flex-col"><span className="font-mono text-[12px]">{e.id}</span><span className="t-caption">{e.label}</span></span>} />)}
            </div>
          </div>
        </div>
      </Modal>
      <Modal open={!!secretOf} onOpenChange={(o) => !o && setSecretOf(null)} icon={<Webhook />} title="Segredo de assinatura" description={secretOf?.name}
        footer={<Button variant="primary" onClick={() => setSecretOf(null)}>Fechar</Button>}>
        {secretOf?.secret && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-3"><code className="flex-1 break-all font-mono text-[12px]">{secretOf.secret}</code><IconButton label="Copiar segredo" size="sm" onClick={() => navigator.clipboard?.writeText(secretOf.secret!).then(() => toast({ tone: "info", title: "Segredo copiado" }), () => undefined)}><Copy /></IconButton></div>
            <InlineNotice tone="info">Cada entrega leva o cabeçalho <code className="font-mono">X-NinePro-Signature: sha256=…</code>, um HMAC-SHA256 do corpo com este segredo. Compare no seu servidor para garantir que o evento veio do NinePro.</InlineNotice>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ Logs */
export function Logs() {
  const [period, setPeriod] = useState("7");
  const [status, setStatus] = useState<string[]>([]);
  const [live, setLive] = useState(false);
  const [extra, setExtra] = useState<typeof LOGS>([]);
  const db = useAuth().mode === "supabase";
  const { current } = useWorkspace();
  const [dbRows, setDbRows] = useState<typeof LOGS>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!db || !supabase || !current) return;
    let cancel = false;
    void supabase.from("request_logs").select("id, at, status, activity, platform, profile, duration_ms").eq("workspace_id", current.id)
      .gte("at", new Date(Date.now() - Number(period) * 86_400_000).toISOString()).order("at", { ascending: false }).limit(1000)
      .then(({ data }) => { if (!cancel) setDbRows((data ?? []).map((l) => ({ id: String(l.id), at: new Date(l.at as string), status: l.status as number, activity: l.activity as string, platform: l.platform === "api" ? "API" : ((l.platform as string) ?? "—"), profile: (l.profile as string) ?? "—", durationMs: (l.duration_ms as number) ?? 0 }))); });
    return () => { cancel = true; };
  }, [db, current, period, tick]);
  useEffect(() => {
    if (!db || !live) return;
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [db, live]);
  useEffect(() => {
    if (db || !live) return;
    const t = setInterval(() => setExtra((e) => [{ ...LOGS[Math.floor(Math.random() * LOGS.length)], id: `live-${Date.now()}`, at: new Date() }, ...e].slice(0, 30)), 2500);
    return () => clearInterval(t);
  }, [live]);
  const since = Date.now() - Number(period) * 86_400_000;
  const rows = useMemo(() => (db ? dbRows : [...extra, ...LOGS]).filter((l) => l.at.getTime() >= since).filter((l) => !status.length || status.some((s) => (s === "erro" ? l.status >= 400 : l.status < 400))), [db, dbRows, extra, since, status]);
  const errors = rows.filter((l) => l.status >= 400).length;
  type L = (typeof LOGS)[number];
  const cols: Column<L>[] = [
    { id: "at", header: "Hora", sticky: true, sortValue: (l) => l.at.getTime(), cell: (l) => <span className="num font-mono text-[12px] text-text-soft">{formatDateTime(l.at)}</span> },
    { id: "st", header: "Status", sortValue: (l) => l.status, cell: (l) => <span className={cn("num rounded-xs px-1.5 py-0.5 font-mono text-[11px] font-bold", l.status >= 500 ? "bg-negative-tint text-negative" : l.status >= 400 ? "bg-warning-tint text-warning" : "bg-positive-tint text-positive")}>{l.status}</span> },
    { id: "act", header: "Atividade", cell: (l) => <span className="font-mono text-[12px]">{l.activity}</span> },
    { id: "pl", header: "Plataforma", cell: (l) => <span className="text-text-soft">{l.platform}</span> },
    { id: "pr", header: db ? "Chave" : "Perfil", cell: (l) => <span className="text-text-soft">{l.profile}</span> },
    { id: "d", header: "Duração", align: "right", sortValue: (l) => l.durationMs, cell: (l) => (l.durationMs >= 1000 ? `${(l.durationMs / 1000).toFixed(1).replace(".", ",")} s` : `${l.durationMs} ms`) },
  ];
  return (
    <Page>
      <PageHeader meta={<DemoBadge liveable />} title="Logs" description="Toda chamada à API do NinePro (REST e MCP), com status, chave usada e duração." />
      <section className="panel overflow-hidden">
        <TableToolbar actions={<div className="flex items-center gap-2"><Radio className={cn("size-4", live ? "animate-pulse text-positive" : "text-text-dim")} /><Switch size="sm" checked={live} onCheckedChange={setLive} ariaLabel="Ao vivo" /><span className="t-secondary">Ao vivo</span></div>}>
          <SegmentedControl ariaLabel="Período" size="sm" value={period} onValueChange={setPeriod} options={[{ value: "1", label: "24 h" }, { value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }]} />
          <MultiSelect label="Status" size="sm" value={status} onValueChange={setStatus} options={[{ value: "ok", label: "Sucesso (2xx)" }, { value: "erro", label: "Erro (4xx/5xx)" }]} />
          <span className="num t-secondary"><b className="text-text">{rows.length}</b> eventos · <b className={errors ? "text-negative" : "text-text"}>{errors}</b> erros ({rows.length ? ((errors / rows.length) * 100).toFixed(1).replace(".", ",") : "0,0"}%)</span>
        </TableToolbar>
        <DataTable caption="Logs" rows={rows} columns={cols} getId={(l) => l.id} defaultSort={{ id: "at", dir: "desc" }} density="compact" className="max-h-[calc(100dvh-300px)]"
          empty={<EmptyState icon={<ScrollText />} title="Nenhum evento no período" />} />
      </section>
    </Page>
  );
}

