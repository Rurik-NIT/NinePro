import { Code2, Copy, Globe, KeyRound, MoreHorizontal, Plus, Trash2, UserMinus, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/lib/workspace";
import { formatDateTime } from "@/lib/format";
import { Page, PageHeader, Section } from "@/components/layout/AppShell";
import { Avatar, StatusBadge, Tag } from "@/components/ui/Badge";
import { Button, buttonClasses, IconButton } from "@/components/ui/Button";
import { ConfirmDialog, Modal } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { Menu, MenuContent, MenuItem, MenuTrigger, Select } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, InlineNotice, LoadingState } from "@/components/feedback/States";
import { ListScreen } from "@/components/templates/ListScreen";
import { MetricCard } from "@/components/data/Metrics";
import { axisProps, ChartContainer, ChartTooltip, gridProps } from "@/components/charts/Chart";

async function appCall<T>(body: Record<string, unknown>): Promise<T> {
  const token = (await supabase!.auth.getSession()).data.session?.access_token;
  const res = await fetch("/api/app", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const r = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(r.error ?? `Erro ${res.status}`);
  return r;
}
const ROLE_LABEL: Record<string, string> = { owner: "Proprietário", admin: "Administrador", member: "Membro" };
const ROLE_DESC: Record<string, string> = { owner: "Tudo, inclusive gerenciar proprietários.", admin: "Conecta contas, gerencia equipe, regras e chaves de API.", member: "Usa o dia a dia: campanhas, leads, caixa de entrada, publicações." };
const copy = (text: string, toast: ReturnType<typeof useToast>, label = "Copiado") => navigator.clipboard?.writeText(text).then(() => toast({ tone: "info", title: label }), () => undefined);

/* ------------------------------------------------------------------ Equipe do espaço */
interface Member { id: string; role: "owner" | "admin" | "member"; email: string; name: string; lastSignInAt: string | null; confirmed: boolean; joinedAt: string; you: boolean }
export function LiveTeam({ title = "Usuários" }: { title?: string }) {
  const toast = useToast();
  const { current } = useWorkspace();
  const ws = current?.id;
  const [rows, setRows] = useState<Member[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const load = useCallback(async () => {
    if (!ws) return;
    try { const r = await appCall<{ members: Member[]; canManage: boolean }>({ action: "team_list", workspaceId: ws }); setRows(r.members); setCanManage(r.canManage); }
    catch (e) { toast({ tone: "error", title: "Não foi possível carregar a equipe", description: e instanceof Error ? e.message : String(e) }); setRows([]); }
  }, [ws, toast]);
  useEffect(() => { void load(); }, [load]);
  const changeRole = async (m: Member, role: string) => {
    try { await appCall({ action: "team_role", workspaceId: ws, userId: m.id, role }); toast({ tone: "success", title: "Papel alterado" }); await load(); }
    catch (e) { toast({ tone: "error", title: "Não foi possível alterar", description: e instanceof Error ? e.message : String(e) }); }
  };
  if (rows === null) return <Page><PageHeader title={title} /><LoadingState /></Page>;
  return (
    <>
      <ListScreen<Member> demo={false} title={title} description={`Quem acessa ${current?.name ?? "este espaço"} e com qual papel.`}
        rows={rows} getId={(m) => m.id} searchText={(m) => `${m.name} ${m.email}`} refreshable onRefresh={load}
        filters={[{ id: "r", label: "Papel", options: Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })), match: (m, v) => m.role === v }]}
        actions={canManage ? <Button variant="primary" icon={<UserPlus />} onClick={() => setInviting(true)}>Adicionar pessoa</Button> : undefined}
        columns={[
          { id: "m", header: "Pessoa", sticky: true, sortValue: (m) => m.name || m.email, cell: (m) => <div className="flex items-center gap-2.5"><Avatar name={m.name || m.email} /><div className="flex flex-col"><span className="font-semibold">{m.name || m.email}{m.you ? <span className="font-normal text-text-dim"> (você)</span> : null}</span><span className="t-caption">{m.email}</span></div></div> },
          { id: "r", header: "Papel", cell: (m) => <Tag tone={m.role === "owner" ? "accent" : undefined}>{ROLE_LABEL[m.role]}</Tag> },
          { id: "s", header: "Situação", cell: (m) => (m.confirmed ? <StatusBadge tone="positive">Ativo</StatusBadge> : <StatusBadge tone="warning">Convite pendente</StatusBadge>) },
          { id: "l", header: "Último acesso", align: "right", sortValue: (m) => Date.parse(m.lastSignInAt ?? "") || 0, cell: (m) => <span className="text-text-soft">{m.lastSignInAt ? formatDateTime(new Date(m.lastSignInAt)) : "—"}</span> },
          { id: "a", header: "", align: "right", cell: (m) => (canManage || m.you) ? (
            <Menu><MenuTrigger asChild><IconButton size="sm" label={`Ações para ${m.email}`}><MoreHorizontal /></IconButton></MenuTrigger>
              <MenuContent align="end">
                {canManage && Object.keys(ROLE_LABEL).filter((r) => r !== m.role).map((r) => <MenuItem key={r} onSelect={() => void changeRole(m, r)}>Tornar {ROLE_LABEL[r].toLowerCase()}</MenuItem>)}
                <MenuItem danger icon={<UserMinus />} onSelect={() => setRemoving(m)}>{m.you ? "Sair do espaço" : "Remover do espaço"}</MenuItem>
              </MenuContent>
            </Menu>) : null },
        ]}
        empty={{ icon: <Users />, title: "Só você por aqui", description: "Adicione a equipe para dividir o trabalho." }}
        after={<p className="t-caption">{Object.entries(ROLE_DESC).map(([k, v]) => `${ROLE_LABEL[k]}: ${v}`).join(" · ")}</p>} />
      {ws && <InviteModal open={inviting} onOpenChange={setInviting} ws={ws} onDone={(r) => { setInviting(false); if (r.password) setCreated({ email: r.email, password: r.password }); void load(); }} />}
      <Modal open={!!created} onOpenChange={(o) => !o && setCreated(null)} icon={<KeyRound />} title="Conta criada" description="Envie estes dados para a pessoa. A senha não aparece de novo."
        footer={<Button variant="primary" onClick={() => setCreated(null)}>Concluído</Button>}>
        {created && <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-2.5"><span className="t-caption w-[70px]">E-mail</span><code className="flex-1 font-mono text-[12.5px]">{created.email}</code></div>
          <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-2.5"><span className="t-caption w-[70px]">Senha</span><code className="flex-1 font-mono text-[12.5px]">{created.password}</code><IconButton size="sm" label="Copiar senha" onClick={() => void copy(created.password, toast, "Senha copiada")}><Copy /></IconButton></div>
          <p className="t-caption">Endereço de acesso: {window.location.origin}. A pessoa pode trocar a senha em Configurações.</p>
        </div>}
      </Modal>
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={removing?.you ? "Sair do espaço?" : "Remover do espaço?"} confirmLabel={removing?.you ? "Sair" : "Remover"}
        description={removing?.you ? "Você perde o acesso a este espaço." : `${removing?.email} perde o acesso a este espaço. A conta continua existindo.`}
        onConfirm={async () => { try { await appCall({ action: "team_remove", workspaceId: ws, userId: removing!.id }); toast({ tone: "info", title: "Removido do espaço" }); if (removing!.you) window.location.assign("/"); else await load(); } catch (e) { toast({ tone: "error", title: "Não foi possível remover", description: e instanceof Error ? e.message : String(e) }); } }} />
    </>
  );
}

function InviteModal({ open, onOpenChange, ws, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; ws: string; onDone: (r: { email: string; password?: string }) => void }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("member");
  const [mode, setMode] = useState<"senha" | "convite">("senha");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setEmail(""); setName(""); setRole("member"); setMode("senha"); setError(null); } }, [open]);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await appCall<{ email: string; password?: string; existing: boolean; invited: boolean }>({ action: "team_invite", workspaceId: ws, email, name, role, mode, redirectTo: `${window.location.origin}/` });
      toast({ tone: "success", title: r.existing ? "Pessoa adicionada" : r.invited ? "Convite enviado" : "Conta criada", description: r.existing ? "Ela já tinha conta no NinePro e agora vê este espaço." : r.invited ? `Um e-mail foi enviado para ${r.email}.` : undefined });
      onDone(r);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} icon={<UserPlus />} title="Adicionar pessoa" description="Se o e-mail já tiver conta no NinePro, a pessoa só ganha acesso a este espaço."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!/\S+@\S+\.\S+/.test(email)} onClick={() => void submit()}>Adicionar</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="E-mail" required>{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" />}</Field>
        <Field label="Nome" hint="Usado se a pessoa ainda não tiver conta.">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Papel">{(p) => <Select id={p.id} value={role} onValueChange={setRole} options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label: `${label} — ${ROLE_DESC[value]}` }))} />}</Field>
        <div className="flex flex-col gap-2">
          <span className="text-secondary font-semibold text-text-soft">Como a pessoa entra (se ainda não tiver conta)</span>
          <SegmentedControl ariaLabel="Forma de acesso" value={mode} onValueChange={setMode} options={[{ value: "senha", label: "Gerar senha" }, { value: "convite", label: "Convite por e-mail" }]} />
          <span className="t-caption">{mode === "senha" ? "Você recebe uma senha temporária para repassar. Funciona na hora." : "A pessoa recebe um e-mail para criar a senha."}</span>
        </div>
        {error && <InlineNotice tone="negative">{error}</InlineNotice>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Fontes de conversão: tag do site e API */
interface Site { id: string; domain: string; public_key: string; last_event_at: string | null; events_count: number; created_at: string }
export const tagSnippet = (key: string, origin = window.location.origin) =>
  `<!-- NinePro: visitas e conversões -->
<script>
!function(w,d,k,u){var s=w.localStorage,q=new URLSearchParams(location.search),t={};
["source","medium","campaign","content","term","id"].forEach(function(n){var v=q.get("utm_"+n);if(v)t[n]=v});
var c={};["fbclid","ttclid","gclid"].forEach(function(n){var v=q.get(n);if(v)c[n]=v});
try{if(Object.keys(t).length)s.setItem("np_utm",JSON.stringify(t));t=JSON.parse(s.getItem("np_utm")||"{}");
if(Object.keys(c).length)s.setItem("np_ids",JSON.stringify(c));c=JSON.parse(s.getItem("np_ids")||"{}");
var v=s.getItem("np_vid")||(Date.now().toString(36)+Math.random().toString(36).slice(2));s.setItem("np_vid",v)}catch(e){}
d.cookie.split("; ").forEach(function(x){var p=x.split("=");if(p[0]=="_fbp"||p[0]=="_fbc")c[p[0].slice(1)]=p[1]});
w.ninepro=function(e,p){fetch(u,{method:"POST",keepalive:true,headers:{"content-type":"text/plain"},
body:JSON.stringify({k:k,e:e,p:p||{},v:v,url:location.href,ref:d.referrer,utm:t,ids:c})})};
w.ninepro("page_view")}(window,document,"${key}","${origin}/api/eventos");
</script>`;

export function LiveConversionSources() {
  const toast = useToast();
  const { current } = useWorkspace();
  const ws = current?.id;
  const admin = current?.role === "owner" || current?.role === "admin";
  const [sites, setSites] = useState<Site[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [domain, setDomain] = useState("");
  const [showing, setShowing] = useState<Site | null>(null);
  const [removing, setRemoving] = useState<Site | null>(null);
  const load = useCallback(async () => {
    if (!supabase || !ws) return;
    const { data } = await supabase.from("tracked_sites").select("id, domain, public_key, last_event_at, events_count, created_at").eq("workspace_id", ws).order("created_at");
    setSites((data as Site[] | null) ?? []);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  const add = async () => {
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) { toast({ tone: "error", title: "Domínio inválido", description: "Ex.: minhaloja.com.br" }); return; }
    const { data, error } = await supabase!.from("tracked_sites").insert({ workspace_id: ws, domain: d }).select("id, domain, public_key, last_event_at, events_count, created_at").single();
    if (error) { toast({ tone: "error", title: "Não foi possível adicionar", description: error.message.includes("duplicate") ? "Este domínio já está cadastrado." : error.message }); return; }
    setAdding(false); setDomain(""); setShowing(data as Site); void load();
  };
  if (sites === null) return <Page><PageHeader title="Fontes de conversão" /><LoadingState /></Page>;
  return (
    <Page>
      <PageHeader title="Fontes de conversão" description="De onde vêm as vendas e os leads atribuídos às campanhas: a tag no seu site e a API de eventos do seu sistema."
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>Adicionar site</Button>} />
      <Section title="Tag do site" description="Registra visitas (com UTM) e conversões chamadas no site. Atribui à campanha pelo utm_campaign (nome ou ID da campanha).">
        {sites.length === 0 ? <div className="panel"><EmptyState icon={<Globe />} title="Nenhum site ainda" description="Adicione o domínio do site ou da loja e cole a tag no <head> de todas as páginas." actions={<Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>Adicionar site</Button>} /></div> : (
          <ul className="panel divide-y divide-line-soft">
            {sites.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <span className="grid size-8 place-items-center rounded-md bg-surface-2 text-text-muted [&_svg]:size-4"><Globe /></span>
                <div className="flex min-w-0 flex-1 flex-col"><span className="font-semibold">{s.domain}</span><span className="t-caption">{s.last_event_at ? `Último evento ${formatDateTime(new Date(s.last_event_at))} · ${s.events_count.toLocaleString("pt-BR")} eventos` : "Aguardando o primeiro evento"}</span></div>
                <StatusBadge tone={s.last_event_at ? "positive" : "warning"}>{s.last_event_at ? "Recebendo" : "Sem eventos"}</StatusBadge>
                <Button size="sm" icon={<Code2 />} onClick={() => setShowing(s)}>Ver tag</Button>
                {admin && <IconButton size="sm" label={`Remover ${s.domain}`} onClick={() => setRemoving(s)}><Trash2 /></IconButton>}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="API de eventos" description="Para vendas e leads registrados no seu sistema (checkout, CRM, ERP).">
        <div className="panel flex flex-col gap-3 p-4">
          <p className="t-secondary">Envie <code className="font-mono text-[12.5px]">POST {window.location.origin}/api/v1/conversoes</code> com a chave de API do espaço no cabeçalho <code className="font-mono text-[12.5px]">Authorization: Bearer np_live_…</code>.</p>
          <pre className="overflow-x-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-[12px]">{`{ "tipo": "purchase", "valor": 249.90, "id_externo": "pedido-1234",
  "utm_campaign": "black-friday", "email": "cliente@exemplo.com" }`}</pre>
          <div className="flex flex-wrap gap-2"><Link to="/chaves-api" className={buttonClasses("outline", "sm")}>Criar chave de API</Link><Link to="/integracao" className={buttonClasses("ghost", "sm")}>Documentação completa</Link></div>
        </div>
      </Section>

      <Modal open={adding} onOpenChange={setAdding} icon={<Globe />} title="Adicionar site" footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button><Button variant="primary" disabled={!domain.trim()} onClick={() => void add()}>Adicionar</Button></>}>
        <Field label="Domínio" required hint="Subdomínios do mesmo domínio também são aceitos.">{(p) => <Input {...p} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="minhaloja.com.br" />}</Field>
      </Modal>
      <Modal open={!!showing} onOpenChange={(o) => !o && setShowing(null)} size="lg" icon={<Code2 />} title={`Tag de ${showing?.domain ?? ""}`} description="Cole no <head> de todas as páginas do site (ou no Google Tag Manager, como HTML personalizado)."
        footer={<Button variant="primary" onClick={() => setShowing(null)}>Concluído</Button>}>
        {showing && (
          <div className="flex flex-col gap-4">
            <div className="relative"><pre className="max-h-[260px] overflow-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-[11.5px]">{tagSnippet(showing.public_key)}</pre><Button size="sm" className="absolute right-2 top-2" icon={<Copy />} onClick={() => void copy(tagSnippet(showing.public_key), toast, "Tag copiada")}>Copiar</Button></div>
            <div className="flex flex-col gap-1.5">
              <span className="t-title">Registrar conversões</span>
              <p className="t-secondary">Chame na página de obrigado ou no momento da conversão:</p>
              <pre className="overflow-x-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-[12px]">{`ninepro("purchase", { value: 249.90, id: "pedido-1234" });
ninepro("lead", { email: "cliente@exemplo.com" });`}</pre>
              <p className="t-caption">Eventos aceitos: purchase, lead, signup, add_to_cart, initiate_checkout, contact, schedule, subscribe (ou um nome próprio). O id evita contar a mesma venda duas vezes.</p>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remover site?" confirmLabel="Remover" description={`A tag de ${removing?.domain} para de funcionar e as visitas registradas são apagadas. As conversões continuam no histórico.`}
        onConfirm={async () => { await supabase!.from("tracked_sites").delete().eq("id", removing!.id); await load(); }} />
    </Page>
  );
}

/* ------------------------------------------------------------------ Análises do site */
interface Visit { visitor_id: string | null; path: string | null; utm_source: string | null; utm_campaign: string | null; referrer: string | null; device: string | null; at: string }
export function LiveSiteAnalytics() {
  const { current } = useWorkspace();
  const ws = current?.id;
  const [days, setDays] = useState<"7" | "30">("30");
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [conv, setConv] = useState<{ value: number; site_id: string | null }[]>([]);
  const [hasSite, setHasSite] = useState(true);
  useEffect(() => {
    if (!supabase || !ws) return;
    const since = new Date(Date.now() - Number(days) * 86_400_000).toISOString();
    void (async () => {
      const { count } = await supabase!.from("tracked_sites").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
      setHasSite((count ?? 0) > 0);
      const out: Visit[] = [];
      for (let from = 0; from < 50_000; from += 1000) {
        const { data } = await supabase!.from("site_visits").select("visitor_id, path, utm_source, utm_campaign, referrer, device, at").eq("workspace_id", ws).gte("at", since).range(from, from + 999);
        out.push(...((data as Visit[] | null) ?? []));
        if (!data || data.length < 1000) break;
      }
      setVisits(out);
      const { data: c } = await supabase!.from("conversion_events").select("value, site_id").eq("workspace_id", ws).gte("received_at", since).not("site_id", "is", null);
      setConv((c as { value: number; site_id: string | null }[] | null) ?? []);
    })();
  }, [ws, days]);
  const m = useMemo(() => {
    if (!visits) return null;
    const keys = Array.from({ length: Number(days) }, (_, i) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - (Number(days) - 1 - i) * 86_400_000)));
    const per = new Map(keys.map((k) => [k, { dia: `${k.slice(8, 10)}/${k.slice(5, 7)}`, visitas: 0 }]));
    for (const v of visits) { const k = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(v.at)); const p = per.get(k); if (p) p.visitas++; }
    const top = (f: (v: Visit) => string | null) => { const c = new Map<string, number>(); for (const v of visits) { const k = f(v) || "(direto)"; c.set(k, (c.get(k) ?? 0) + 1); } return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8); };
    const ref = (v: Visit) => v.utm_source || (v.referrer ? (() => { try { return new URL(v.referrer!).hostname.replace(/^www\./, ""); } catch { return null; } })() : null);
    return { series: [...per.values()], visits: visits.length, visitors: new Set(visits.map((v) => v.visitor_id)).size, mobile: visits.filter((v) => v.device === "Celular").length, sources: top(ref), pages: top((v) => v.path), campaigns: top((v) => v.utm_campaign).filter(([k]) => k !== "(direto)") };
  }, [visits, days]);
  if (!hasSite) return <Page><PageHeader title="Análises do site" /><div className="panel"><EmptyState icon={<Globe />} title="Instale a tag do site" description="Visitas, origens e campanhas do seu site aparecem aqui depois de instalar a tag." actions={<Link to="/anuncios/conversoes/fontes" className={buttonClasses("primary")}>Instalar a tag</Link>} /></div></Page>;
  const TopList = ({ title, rows }: { title: string; rows: [string, number][] }) => (
    <div className="panel flex flex-col p-4"><span className="t-title mb-2">{title}</span>{rows.length ? <ul className="flex flex-col gap-1.5">{rows.map(([k, n]) => <li key={k} className="flex items-center justify-between gap-3 text-secondary"><span className="truncate">{k}</span><span className="num font-semibold">{n.toLocaleString("pt-BR")}</span></li>)}</ul> : <span className="t-caption">Sem dados no período.</span>}</div>
  );
  return (
    <Page>
      <PageHeader title="Análises do site" description="Visitas registradas pela tag do NinePro, com origem e campanha."
        actions={<SegmentedControl ariaLabel="Período" value={days} onValueChange={setDays} options={[{ value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }]} />} />
      {!m ? <LoadingState /> : (
        <>
          <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
            <MetricCard label="Visitas" value={m.visits} format="integer" />
            <MetricCard label="Visitantes" value={m.visitors} format="integer" />
            <MetricCard label="Conversões pela tag" value={conv.length} format="integer" footer={<span className="t-caption">{conv.reduce((s, c) => s + Number(c.value), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em valor</span>} />
            <MetricCard label="Pelo celular" value={m.visits ? m.mobile / m.visits : NaN} format="percent" />
          </div>
          {m.visits === 0 ? <InlineNotice tone="info">Nenhuma visita no período. Confira se a tag está no &lt;head&gt; do site em Fontes de conversão.</InlineNotice> : (
            <ChartContainer title="Visitas por dia" subtitle={`Últimos ${days} dias`}>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={m.series}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="dia" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis {...axisProps} width={36} allowDecimals={false} />
                    <RTooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip format="integer" names={{ visitas: "Visitas" }} />} />
                    <Bar dataKey="visitas" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartContainer>
          )}
          <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
            <TopList title="Origens" rows={m.sources} />
            <TopList title="Campanhas (utm_campaign)" rows={m.campaigns} />
            <TopList title="Páginas" rows={m.pages} />
          </div>
        </>
      )}
    </Page>
  );
}
