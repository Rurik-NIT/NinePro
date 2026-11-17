import { Ban, Building2, Copy, KeyRound, MoreHorizontal, RefreshCw, ScrollText, ShieldCheck, ShieldOff, Trash2, UserCheck, UserPen, UserPlus, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminCall, type AdminUser, type AdminWorkspace, type AuditEntry } from "@/lib/adminApi";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { formatDateTime } from "@/lib/format";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Avatar, StatusBadge, Tag } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Controls";
import { ConfirmDialog, Modal } from "@/components/ui/Dialog";
import { Field, Input, SearchInput } from "@/components/ui/Input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Select } from "@/components/ui/Menu";
import { SegmentedControl, TabPanel, Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, ErrorState, InlineNotice } from "@/components/feedback/States";
import { DataTable, TableToolbar, type Column } from "@/components/data/DataTable";
import { KpiStrip } from "@/components/data/Metrics";

const ACTION_LABEL: Record<string, string> = {
  criou_usuario: "Criou usuário", bloqueou_usuario: "Bloqueou", desbloqueou_usuario: "Desbloqueou", redefiniu_senha: "Redefiniu senha",
  renomeou_usuario: "Renomeou", concedeu_super_admin: "Concedeu super admin", removeu_super_admin: "Removeu super admin", excluiu_usuario: "Excluiu usuário",
  adicionou_ao_espaco: "Adicionou a um espaço", removeu_do_espaco: "Removeu de um espaço",
};
const ROLE_LABEL: Record<string, string> = { owner: "Proprietário", admin: "Administrador", member: "Membro" };
type StatusFilter = "todos" | "ativos" | "bloqueados" | "pendentes" | "admins";

function status(u: AdminUser) {
  if (u.banned) return { tone: "negative" as const, label: "Bloqueado" };
  if (!u.confirmed) return { tone: "warning" as const, label: "Convite pendente" };
  return { tone: "positive" as const, label: "Ativo" };
}

/** Painel do super admin: contas de toda a plataforma. As ações rodam no servidor (api/admin). */
export default function Admin() {
  const { mode, user } = useAuth();
  const { isPlatformAdmin, loading: wsLoading } = useWorkspace();
  const toast = useToast();
  const [tab, setTab] = useState("usuarios");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [managing, setManaging] = useState<AdminUser | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("todos");
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ title: string; email: string; password: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "ban" | "delete" | "revoke_admin"; user: AdminUser } | null>(null);
  const [renaming, setRenaming] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [{ users: list, workspaces: wsList }, { entries }] = await Promise.all([adminCall<{ users: AdminUser[]; workspaces: AdminWorkspace[] }>("list"), adminCall<{ entries: AuditEntry[] }>("audit")]);
      setUsers(list); setWorkspaces(wsList ?? []); setAudit(entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (isPlatformAdmin) void load(); }, [isPlatformAdmin, load]);

  const act = async (action: string, u: AdminUser, payload: Record<string, unknown> = {}, ok?: string) => {
    try {
      const r = await adminCall<{ password?: string }>(action, { userId: u.id, ...payload });
      if (r.password) setSecret({ title: "Nova senha temporária", email: u.email, password: r.password });
      else if (ok) toast({ tone: "success", title: ok, description: u.email });
      await load();
    } catch (e) {
      toast({ tone: "error", title: "Não foi possível concluir", description: e instanceof Error ? e.message : String(e) });
    }
  };

  const rows = useMemo(() => (users ?? []).filter((u) => {
    if (q && !`${u.name} ${u.email} ${u.workspaces.map((w) => w.name).join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "ativos") return !u.banned && u.confirmed;
    if (filter === "bloqueados") return u.banned;
    if (filter === "pendentes") return !u.confirmed && !u.banned;
    if (filter === "admins") return u.isPlatformAdmin;
    return true;
  }), [users, q, filter]);

  if (mode === "demo") return <Page><PageHeader title="Painel admin" /><div className="panel"><EmptyState icon={<ShieldCheck />} title="Disponível com o banco conectado" description="Configure o Supabase no .env.local para gerenciar contas reais." /></div></Page>;
  if (!wsLoading && !isPlatformAdmin) return <Page><PageHeader title="Painel admin" /><div className="panel"><EmptyState icon={<ShieldOff />} title="Acesso restrito" description="Esta área é só para o super admin da plataforma." /></div></Page>;

  const all = users ?? [];
  const cols: Column<AdminUser>[] = [
    { id: "u", header: "Usuário", sticky: true, sortValue: (u) => (u.name || u.email).toLowerCase(), cell: (u) => (
      <div className="flex items-center gap-2.5"><Avatar name={u.name || u.email} /><div className="flex min-w-0 flex-col"><span className="flex items-center gap-2 font-semibold">{u.name || "—"}{u.id === user?.id && <Tag>você</Tag>}</span><span className="t-caption truncate">{u.email}</span></div></div>
    ) },
    { id: "st", header: "Status", sortValue: (u) => status(u).label, cell: (u) => <StatusBadge tone={status(u).tone}>{status(u).label}</StatusBadge> },
    { id: "ws", header: "Espaço de trabalho", cell: (u) => u.workspaces.length ? <div className="flex flex-col">{u.workspaces.slice(0, 2).map((w) => <span key={w.id} className="text-text-soft">{w.name} <span className="t-caption">· {ROLE_LABEL[w.role] ?? w.role}</span></span>)}{u.workspaces.length > 2 && <span className="t-caption">+{u.workspaces.length - 2}</span>}</div> : <span className="text-text-dim">—</span> },
    { id: "adm", header: "Acesso", cell: (u) => u.isPlatformAdmin ? <Tag tone="accent">Super admin</Tag> : <Tag>Cliente</Tag> },
    { id: "last", header: "Último acesso", align: "right", sortValue: (u) => (u.lastSignInAt ? new Date(u.lastSignInAt).getTime() : 0), cell: (u) => <span className="text-text-soft">{u.lastSignInAt ? formatDateTime(new Date(u.lastSignInAt)) : "Nunca"}</span> },
    { id: "created", header: "Criado em", align: "right", sortValue: (u) => new Date(u.createdAt).getTime(), cell: (u) => <span className="text-text-soft">{formatDateTime(new Date(u.createdAt))}</span> },
    { id: "act", header: <span className="sr-only">Ações</span>, width: 48, cell: (u) => {
      const self = u.id === user?.id;
      return (
        <Menu><MenuTrigger asChild><IconButton label={`Ações de ${u.email}`} size="sm"><MoreHorizontal /></IconButton></MenuTrigger>
          <MenuContent align="end" className="w-[230px]">
            <MenuItem icon={<UserPen />} onSelect={() => setRenaming(u)}>Editar nome</MenuItem>
            <MenuItem icon={<Building2 />} onSelect={() => setManaging(u)}>Espaços de trabalho</MenuItem>
            <MenuItem icon={<KeyRound />} onSelect={() => void act("reset_password", u)}>Gerar nova senha</MenuItem>
            {u.isPlatformAdmin
              ? <MenuItem icon={<ShieldOff />} disabled={self} onSelect={() => setConfirm({ kind: "revoke_admin", user: u })}>Remover super admin</MenuItem>
              : <MenuItem icon={<ShieldCheck />} onSelect={() => void act("set_admin", u, { value: true }, "Agora é super admin")}>Tornar super admin</MenuItem>}
            <MenuSeparator />
            {u.banned
              ? <MenuItem icon={<UserCheck />} onSelect={() => void act("unban", u, {}, "Acesso liberado")}>Desbloquear</MenuItem>
              : <MenuItem icon={<Ban />} danger disabled={self} onSelect={() => setConfirm({ kind: "ban", user: u })}>Bloquear acesso</MenuItem>}
            <MenuItem icon={<Trash2 />} danger disabled={self} onSelect={() => setConfirm({ kind: "delete", user: u })}>Excluir conta</MenuItem>
          </MenuContent></Menu>
      );
    } },
  ];

  return (
    <Page>
      <PageHeader title="Painel admin" description="Contas de toda a plataforma: crie acessos para clientes, bloqueie, redefina senhas e acompanhe o que foi feito."
        actions={<><IconButton label="Atualizar" variant="outline" onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /></IconButton><Button variant="primary" icon={<UserPlus />} onClick={() => setCreating(true)}>Criar usuário</Button></>} />

      {error ? (
        <div className="panel"><ErrorState title="Não foi possível falar com o servidor admin" description={error} onRetry={() => void load()} /></div>
      ) : (
        <>
          <KpiStrip hero={false} loading={!users} items={[
            { id: "t", label: "Usuários", value: all.length, format: "integer" },
            { id: "a", label: "Ativos", value: all.filter((u) => !u.banned && u.confirmed).length, format: "integer" },
            { id: "p", label: "Convites pendentes", value: all.filter((u) => !u.confirmed && !u.banned).length, format: "integer" },
            { id: "b", label: "Bloqueados", value: all.filter((u) => u.banned).length, format: "integer" },
            { id: "s", label: "Super admins", value: all.filter((u) => u.isPlatformAdmin).length, format: "integer" },
          ]} />

          <Tabs value={tab} onValueChange={setTab} items={[{ value: "usuarios", label: "Usuários", count: all.length }, { value: "atividade", label: "Atividade", count: audit?.length }]}>
            <TabPanel value="usuarios" className="pt-4">
              <section className="panel overflow-hidden">
                <TableToolbar actions={<SegmentedControl size="sm" ariaLabel="Filtrar por status" value={filter} onValueChange={setFilter} options={[
                  { value: "todos", label: "Todos" }, { value: "ativos", label: "Ativos" }, { value: "pendentes", label: "Pendentes" }, { value: "bloqueados", label: "Bloqueados" }, { value: "admins", label: "Admins" },
                ]} />}>
                  <SearchInput className="w-full sm:w-[300px]" value={q} onValueChange={setQ} placeholder="Buscar por nome, e-mail ou espaço" />
                </TableToolbar>
                <DataTable caption="Usuários da plataforma" rows={rows} columns={cols} getId={(u) => u.id} loading={!users} defaultSort={{ id: "created", dir: "desc" }}
                  empty={<EmptyState compact icon={<Users />} title={q || filter !== "todos" ? "Nenhum usuário com esse filtro" : "Nenhum usuário ainda"} description={q || filter !== "todos" ? "Ajuste a busca ou o filtro." : "Crie o primeiro acesso para um cliente."} />} />
              </section>
            </TabPanel>
            <TabPanel value="atividade" className="pt-4">
              <section className="panel overflow-hidden">
                <DataTable caption="Registro de atividade administrativa" rows={audit ?? []} getId={(a) => String(a.id)} loading={!audit} defaultSort={{ id: "at", dir: "desc" }}
                  columns={[
                    { id: "at", header: "Quando", sticky: true, sortValue: (a) => new Date(a.created_at).getTime(), cell: (a) => <span className="num font-mono text-[12px] text-text-soft">{formatDateTime(new Date(a.created_at))}</span> },
                    { id: "who", header: "Quem", cell: (a) => <span className="text-text-soft">{a.actor_email ?? "—"}</span> },
                    { id: "what", header: "Ação", cell: (a) => <Tag tone={/excluiu|bloqueou|removeu/.test(a.action) ? "negative" : undefined}>{ACTION_LABEL[a.action] ?? a.action}</Tag> },
                    { id: "target", header: "Conta", cell: (a) => <span className="font-semibold">{a.target_email ?? "—"}</span> },
                  ]}
                  empty={<EmptyState compact icon={<ScrollText />} title="Nada registrado ainda" description="Toda ação feita neste painel aparece aqui, com autor e horário." />} />
              </section>
            </TabPanel>
          </Tabs>
        </>
      )}

      <CreateUserModal workspaces={workspaces} open={creating} onOpenChange={setCreating} onCreated={async (r) => { setCreating(false); if (r.password) setSecret({ title: "Usuário criado", email: r.email, password: r.password }); else toast({ tone: "success", title: "Convite enviado", description: r.email }); await load(); }} />

      <Modal open={!!secret} onOpenChange={(o) => !o && setSecret(null)} icon={<KeyRound />} title={secret?.title ?? ""} description="Envie estes dados para a pessoa por um canal seguro. A senha não será exibida de novo."
        footer={<Button variant="primary" onClick={() => setSecret(null)}>Concluído</Button>}>
        {secret && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[80px_1fr] items-center gap-2 rounded-md border border-line bg-surface-2 p-3 text-body">
              <span className="t-caption">E-mail</span><span className="font-semibold break-all">{secret.email}</span>
              <span className="t-caption">Senha</span>
              <span className="flex items-center gap-2"><code className="flex-1 font-mono text-[13px]">{secret.password}</code>
                <IconButton label="Copiar acesso" size="sm" onClick={() => navigator.clipboard?.writeText(`Acesso NinePro\nEndereço: ${location.origin}\nE-mail: ${secret.email}\nSenha: ${secret.password}`).then(() => toast({ tone: "info", title: "Acesso copiado" }), () => undefined)}><Copy /></IconButton></span>
            </div>
            <InlineNotice tone="info">Peça para a pessoa trocar a senha depois do primeiro acesso (Configurações › Perfil).</InlineNotice>
          </div>
        )}
      </Modal>

      <ManageWorkspacesModal user={managing ? (users ?? []).find((x) => x.id === managing.id) ?? managing : null} workspaces={workspaces} onOpenChange={(o) => !o && setManaging(null)}
        onAdd={async (wsId, role) => { if (managing) await act("add_member", managing, { workspaceId: wsId, role }, "Adicionado ao espaço"); }}
        onRemove={async (wsId) => { if (managing) await act("remove_member", managing, { workspaceId: wsId }, "Removido do espaço"); }} />

      <RenameModal user={renaming} onOpenChange={(o) => !o && setRenaming(null)} onSave={async (name) => { if (renaming) await act("rename", renaming, { fullName: name }, "Nome atualizado"); setRenaming(null); }} />

      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "delete" ? "Excluir conta?" : confirm?.kind === "ban" ? "Bloquear acesso?" : "Remover super admin?"}
        confirmLabel={confirm?.kind === "delete" ? "Excluir definitivamente" : confirm?.kind === "ban" ? "Bloquear" : "Remover"}
        description={confirm?.kind === "delete"
          ? `${confirm.user.email} perde o acesso e a conta é apagada. Espaços de trabalho em que a pessoa é a única integrante são excluídos com todos os dados. Não dá para desfazer.`
          : confirm?.kind === "ban" ? `${confirm.user.email} não consegue mais entrar até ser desbloqueado. Os dados ficam preservados.`
          : `${confirm?.user.email} deixa de ver o painel admin.`}
        onConfirm={() => { if (!confirm) return; const { kind, user: u } = confirm;
          if (kind === "delete") void act("delete", u, {}, "Conta excluída");
          else if (kind === "ban") void act("ban", u, {}, "Acesso bloqueado");
          else void act("set_admin", u, { value: false }, "Super admin removido"); }} />
    </Page>
  );
}

function CreateUserModal({ workspaces, open, onOpenChange, onCreated }: { workspaces: AdminWorkspace[]; open: boolean; onOpenChange: (o: boolean) => void; onCreated: (r: { email: string; password?: string }) => void }) {
  const [wsMode, setWsMode] = useState<"novo" | "existente">("novo");
  const [wsId, setWsId] = useState("");
  const [role, setRole] = useState("member");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [how, setHow] = useState<"gerar" | "definir" | "convite">("gerar");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(""); setEmail(""); setWorkspace(""); setHow("gerar"); setPassword(""); setMakeAdmin(false); setError(null); setWsMode("novo"); setWsId(""); setRole("member"); } }, [open]);
  const valid = name.trim().length > 1 && /\S+@\S+\.\S+/.test(email) && (how !== "definir" || password.length >= 8) && (wsMode === "novo" || !!wsId);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await adminCall<{ email: string; password?: string }>("create", {
        fullName: name.trim(), email: email.trim(), workspaceName: wsMode === "novo" ? workspace.trim() : "", workspaceId: wsMode === "existente" ? wsId : undefined, role, makeAdmin,
        mode: how === "convite" ? "invite" : "password", password: how === "definir" ? password : undefined, redirectTo: location.origin,
      });
      onCreated({ email: r.email, password: r.password });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" icon={<UserPlus />} title="Criar usuário" description="A conta já nasce confirmada. Crie o espaço de um cliente novo ou adicione a pessoa à equipe de um cliente."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={() => void submit()}>{how === "convite" ? "Enviar convite" : "Criar usuário"}</Button></>}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Nome" required>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Mariana Souza" autoComplete="off" />}</Field>
        <Field label="E-mail" required>{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@cliente.com" autoComplete="off" />}</Field>
        <div className="flex flex-col gap-2 md:col-span-2">
          <span className="text-secondary font-semibold text-text-soft">Espaço de trabalho</span>
          <SegmentedControl ariaLabel="Espaço de trabalho" value={wsMode} onValueChange={setWsMode} options={[{ value: "novo", label: "Cliente novo" }, { value: "existente", label: "Equipe de um cliente" }]} />
        </div>
        {wsMode === "novo"
          ? <Field label="Nome do cliente" hint="Vira o nome do espaço. Em branco: “Meu espaço”." className="md:col-span-2">{(p) => <Input {...p} value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="Ex.: Loja da Mariana" />}</Field>
          : <>
              <Field label="Cliente" required>{(p) => <Select id={p.id} value={wsId} onValueChange={setWsId} placeholder="Escolha o espaço" options={workspaces.map((w) => ({ value: w.id, label: `${w.name} · ${w.members} pessoa${w.members === 1 ? "" : "s"}` }))} />}</Field>
              <Field label="Papel">{(p) => <Select id={p.id} value={role} onValueChange={setRole} options={[{ value: "member", label: "Membro" }, { value: "admin", label: "Administrador" }, { value: "owner", label: "Proprietário" }]} />}</Field>
            </>}
        <Field label="Senha de acesso" className="md:col-span-2">{(p) => (
          <Select id={p.id} value={how} onValueChange={(v) => setHow(v as typeof how)} options={[
            { value: "gerar", label: "Gerar senha temporária (você envia para a pessoa)" },
            { value: "definir", label: "Definir a senha agora" },
            { value: "convite", label: "Enviar convite por e-mail (a pessoa cria a senha)" },
          ]} />
        )}</Field>
        {how === "definir" && <Field label="Senha" required hint="Pelo menos 8 caracteres." className="md:col-span-2">{(p) => <Input {...p} type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}</Field>}
        {how === "convite" && <div className="md:col-span-2"><InlineNotice tone="warning">O e-mail padrão do Supabase tem limite baixo de envios por hora. Para volume, configure um SMTP próprio no Supabase.</InlineNotice></div>}
        <div className="md:col-span-2"><Checkbox checked={makeAdmin} onCheckedChange={(v) => setMakeAdmin(!!v)} label="Tornar super admin (acesso a este painel)" /></div>
        {error && <div className="md:col-span-2"><InlineNotice tone="negative">{error}</InlineNotice></div>}
      </div>
    </Modal>
  );
}

function RenameModal({ user, onOpenChange, onSave }: { user: AdminUser | null; onOpenChange: (o: boolean) => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(user?.name ?? ""); }, [user]);
  return (
    <Modal open={!!user} onOpenChange={onOpenChange} size="sm" icon={<UserPen />} title="Editar nome" description={user?.email}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={name.trim().length < 2} onClick={async () => { setBusy(true); await onSave(name.trim()); setBusy(false); }}>Salvar</Button></>}>
      <Field label="Nome" required>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
    </Modal>
  );
}

function ManageWorkspacesModal({ user, workspaces, onOpenChange, onAdd, onRemove }: { user: AdminUser | null; workspaces: AdminWorkspace[]; onOpenChange: (o: boolean) => void; onAdd: (wsId: string, role: string) => Promise<void>; onRemove: (wsId: string) => Promise<void> }) {
  const [wsId, setWsId] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setWsId(""); setRole("member"); }, [user?.id]);
  const available = workspaces.filter((w) => !user?.workspaces.some((m) => m.id === w.id));
  return (
    <Modal open={!!user} onOpenChange={onOpenChange} icon={<Building2 />} title="Espaços de trabalho" description={user?.email}
      footer={<Button variant="primary" onClick={() => onOpenChange(false)}>Concluído</Button>}>
      {user && (
        <div className="flex flex-col gap-4">
          {user.workspaces.length === 0 ? <InlineNotice tone="warning">Esta pessoa não faz parte de nenhum espaço e não verá dados ao entrar.</InlineNotice> : (
            <ul className="divide-y divide-line-soft rounded-md border border-line">
              {user.workspaces.map((w) => (
                <li key={w.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex-1 font-semibold">{w.name}</span>
                  <Tag>{ROLE_LABEL[w.role] ?? w.role}</Tag>
                  <IconButton label={`Remover de ${w.name}`} size="sm" disabled={busy} onClick={async () => { setBusy(true); await onRemove(w.id); setBusy(false); }}><X /></IconButton>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
            <Field label="Adicionar a">{(p) => <Select id={p.id} value={wsId} onValueChange={setWsId} placeholder={available.length ? "Escolha o espaço" : "Já está em todos"} options={available.map((w) => ({ value: w.id, label: w.name }))} />}</Field>
            <Field label="Papel">{(p) => <Select id={p.id} value={role} onValueChange={setRole} options={[{ value: "member", label: "Membro" }, { value: "admin", label: "Administrador" }, { value: "owner", label: "Proprietário" }]} />}</Field>
            <Button loading={busy} disabled={!wsId} onClick={async () => { setBusy(true); await onAdd(wsId, role); setWsId(""); setBusy(false); }}>Adicionar</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
