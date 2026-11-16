import { AppWindow, Boxes, Cable, Phone, Plus, Radio, UserRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { MultiSelect, Select, Tooltip } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { ListScreen } from "@/components/templates/ListScreen";
import { initials } from "@/pages/connections/Onboarding";

/* Catálogo observado no Console da referência: 38 plataformas, slug, autenticação e capacidades. */
type Cap = "Publicação" | "Análises" | "Caixa de entrada" | "Anúncios" | "Comércio" | "E-mail" | "Agenda" | "Contatos";
const P = (name: string, slug: string, auth: string, caps: Cap[], via?: string) => ({ name, slug, auth, caps, via, accounts: 0 });
export const PLATFORMS_CATALOG = [
  P("Instagram", "instagram", "OAuth2", ["Publicação", "Análises", "Caixa de entrada"]), P("TikTok", "tiktok", "OAuth2", ["Publicação", "Análises", "Caixa de entrada"]),
  P("WhatsApp", "whatsapp", "OAuth2", ["Caixa de entrada"]), P("Facebook", "facebook", "OAuth2", ["Publicação", "Análises", "Caixa de entrada"]),
  P("YouTube", "youtube", "OAuth2", ["Publicação", "Análises", "Caixa de entrada"]), P("iMessage", "imessage", "Credenciais", ["Caixa de entrada"]),
  P("LinkedIn", "linkedin", "OAuth2", ["Publicação", "Análises", "Caixa de entrada"]), P("X", "twitter", "OAuth2", ["Publicação", "Análises", "Caixa de entrada"]),
  P("Meta Ads", "metaads", "OAuth2", ["Anúncios"], "via Facebook"), P("Threads", "threads", "OAuth2", ["Publicação", "Análises", "Caixa de entrada"]),
  P("Google Meu Negócio", "googlebusiness", "OAuth2", ["Publicação", "Caixa de entrada"]), P("Google Ads", "googleads", "OAuth2", ["Anúncios"]),
  P("Pinterest", "pinterest", "OAuth2", ["Publicação", "Análises"]), P("Reddit", "reddit", "OAuth2", ["Publicação", "Análises", "Caixa de entrada"]),
  P("LINE", "line", "Credenciais", ["Caixa de entrada"]), P("WeChat", "wechat", "Credenciais", ["Caixa de entrada"]),
  P("Telegram", "telegram", "Token de bot", ["Publicação", "Caixa de entrada"]), P("TikTok Ads", "tiktokads", "OAuth2", ["Anúncios"]),
  P("LinkedIn Ads", "linkedinads", "OAuth2", ["Anúncios"], "via LinkedIn"), P("Shopify", "shopify", "OAuth2", ["Publicação", "Comércio"]),
  P("Bluesky", "bluesky", "OAuth2", ["Publicação", "Análises", "Caixa de entrada"]), P("Discord", "discord", "OAuth2", ["Publicação"]),
  P("OpenAI Ads", "openaiads", "Credenciais", ["Anúncios"]), P("X Ads", "xads", "OAuth2", ["Anúncios"]), P("Slack", "slack", "OAuth2", ["Publicação", "Caixa de entrada"]),
  P("WordPress", "wordpress", "Credenciais", ["Publicação"]), P("Pinterest Ads", "pinterestads", "OAuth2", ["Anúncios"], "via Pinterest"),
  P("Reddit Ads", "redditads", "OAuth2", ["Anúncios"]), P("Microsoft Ads", "microsoftads", "OAuth2", ["Anúncios"]), P("Snapchat", "snapchat", "OAuth2", ["Publicação", "Análises"]),
  P("Wix", "wix", "OAuth2", ["Publicação"]), P("Webflow", "webflow", "Credenciais", ["Publicação"]), P("Google", "google", "OAuth2", ["E-mail", "Agenda", "Contatos"]),
  P("Microsoft", "microsoft", "OAuth2", ["E-mail", "Agenda", "Contatos"]), P("Caixa IMAP", "imap", "Credenciais", ["E-mail"]), P("HubSpot", "hubspot", "OAuth2", ["Contatos"]),
  P("Stripe", "stripe", "OAuth2", ["Análises"]), P("Google Analytics", "googleanalytics", "OAuth2", ["Análises"]),
];
const CAPS: Cap[] = ["Publicação", "Análises", "Caixa de entrada", "Anúncios", "Comércio", "E-mail", "Agenda", "Contatos"];

export function ConsolePlatforms() {
  type R = (typeof PLATFORMS_CATALOG)[number];
  return (
    <ListScreen<R> title="Plataformas" description="Plataformas que os seus usuários podem conectar pelo seu app, com o tipo de autenticação e o que cada uma permite."
      rows={PLATFORMS_CATALOG} getId={(p) => p.slug} searchText={(p) => `${p.name} ${p.slug}`} searchPlaceholder="Buscar plataforma ou slug"
      filters={[
        { id: "cap", label: "Categoria", options: CAPS.map((c) => ({ value: c, label: c })), match: (p, v) => p.caps.includes(v as Cap) },
        { id: "auth", label: "Autenticação", options: ["OAuth2", "Credenciais", "Token de bot"].map((a) => ({ value: a, label: a })), match: (p, v) => p.auth === v },
      ]}
      columns={[
        { id: "n", header: "Plataforma", sticky: true, sortValue: (p) => p.name, cell: (p) => <span className="flex items-center gap-2.5"><span className="grid size-7 place-items-center rounded-sm bg-soft font-mono text-[10.5px] font-bold text-text-soft">{initials(p.name)}</span><span className="font-semibold">{p.name}</span></span> },
        { id: "slug", header: "Slug", sortValue: (p) => p.slug, cell: (p) => <span className="font-mono text-[12px] text-text-soft">{p.slug}</span> },
        { id: "auth", header: "Autenticação", cell: (p) => <span className="flex items-center gap-1.5"><Tag>{p.auth}</Tag>{p.via && <span className="t-caption">{p.via}</span>}</span> },
        { id: "caps", header: "Capacidades", cell: (p) => <div className="flex flex-wrap gap-1">{p.caps.map((c) => <Tag key={c}>{c}</Tag>)}</div> },
        { id: "acc", header: "Contas", align: "right", sortValue: (p) => p.accounts, cell: (p) => p.accounts },
      ]}
      empty={{ icon: <Boxes />, title: "Nenhuma plataforma" }} />
  );
}

export function ConsoleProfiles() {
  const toast = useToast();
  const [rows, setRows] = useState([{ id: "default", name: "Padrão", slug: "padrao", profileId: "np_prof_6afb04…5f", platforms: 0, active: 0, reconnect: 0, last: "—" }]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  type R = (typeof rows)[number];
  return (
    <>
      <ListScreen<R> title="Perfis" description="Cada perfil agrupa as contas conectadas de um usuário ou cliente do seu app."
        rows={rows} getId={(r) => r.id} searchText={(r) => `${r.name} ${r.profileId}`}
        filters={[{ id: "st", label: "Status", options: [{ value: "ok", label: "Ativos" }, { value: "rc", label: "Precisam reconectar" }], match: (r, v) => (v === "rc" ? r.reconnect > 0 : r.reconnect === 0) }]}
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>Novo perfil</Button>}
        columns={[
          { id: "n", header: "Perfil", sticky: true, cell: (r) => <div className="flex flex-col"><span className="font-semibold">{r.name}</span><span className="t-caption font-mono">{r.slug}</span></div> },
          { id: "id", header: "ID do perfil", cell: (r) => <span className="font-mono text-[12px] text-text-soft">{r.profileId}</span> },
          { id: "p", header: "Plataformas conectadas", align: "right", cell: (r) => r.platforms || "—" },
          { id: "a", header: "Ativas", align: "right", cell: (r) => r.active || "—" },
          { id: "r", header: "Precisam reconectar", align: "right", cell: (r) => r.reconnect || "—" },
          { id: "l", header: "Última atividade", align: "right", cell: (r) => <span className="text-text-soft">{r.last}</span> },
        ]}
        empty={{ icon: <UserRound />, title: "Nenhum perfil" }} />
      <Modal open={open} onOpenChange={setOpen} icon={<UserRound />} title="Novo perfil"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" disabled={!name.trim()} onClick={() => { const slug = name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-"); setRows((r) => [...r, { id: slug, name: name.trim(), slug, profileId: `np_prof_${Math.random().toString(16).slice(2, 8)}…`, platforms: 0, active: 0, reconnect: 0, last: "—" }]); toast({ tone: "success", title: "Perfil criado (demonstração)" }); setOpen(false); setName(""); }}>Criar perfil</Button></>}>
        <Field label="Nome" required hint="Normalmente o nome do cliente ou do usuário no seu app.">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      </Modal>
    </>
  );
}

export function ConsoleApps() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState("instagram");
  const [clientId, setClientId] = useState("");
  return (
    <>
      <ListScreen<{ id: string }> title="Seus apps" description="Apps OAuth próprios: a tela de consentimento mostra a sua marca em vez da nossa."
        rows={[]} getId={(r) => r.id}
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>Adicionar app</Button>}
        columns={["App", "Plataforma", "Status", "Client ID", "Permissões", "ID do app OAuth", "Contas"].map((h) => ({ id: h, header: h, cell: () => null }))}
        empty={{ icon: <AppWindow />, title: "Nenhum app OAuth ainda", description: "Adicione o seu próprio app para exibir sua marca na tela de consentimento.", action: <Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>Adicionar app</Button> }} />
      <Modal open={open} onOpenChange={setOpen} icon={<AppWindow />} title="Adicionar app OAuth"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" disabled={!clientId.trim()} onClick={() => { toast({ tone: "info", title: "App validado (demonstração)", description: "Credenciais reais exigem backend seguro." }); setOpen(false); }}>Adicionar</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Plataforma">{(p) => <Select id={p.id} value={platform} onValueChange={setPlatform} options={PLATFORMS_CATALOG.filter((x) => x.auth === "OAuth2").map((x) => ({ value: x.slug, label: x.name }))} />}</Field>
          <Field label="Client ID" required>{(p) => <Input {...p} value={clientId} onChange={(e) => setClientId(e.target.value)} className="font-mono" />}</Field>
          <Field label="Client secret" hint="Guardado criptografado; nunca exibido de novo.">{(p) => <Input {...p} type="password" autoComplete="off" />}</Field>
        </div>
      </Modal>
    </>
  );
}

export function ConsoleSessions() {
  const [period, setPeriod] = useState<"24h" | "7d" | "30d">("7d");
  const [outcome, setOutcome] = useState<string[]>([]);
  return (
    <ListScreen<{ id: string }> title="Sessões" description="Cada tentativa de conexão feita pelos usuários do seu app, com o resultado."
      rows={[]} getId={(r) => r.id}
      toolbarExtra={<SegmentedControl ariaLabel="Período" size="sm" value={period} onValueChange={setPeriod} options={[{ value: "24h", label: "24 h" }, { value: "7d", label: "7 dias" }, { value: "30d", label: "30 dias" }]} />}
      before={<div className="flex flex-wrap gap-2"><MultiSelect label="Resultado" size="sm" value={outcome} onValueChange={setOutcome} options={[{ value: "ok", label: "Conectou" }, { value: "cancel", label: "Cancelou" }, { value: "erro", label: "Erro" }]} /><MultiSelect label="Plataformas" size="sm" value={[]} onValueChange={() => undefined} options={PLATFORMS_CATALOG.slice(0, 8).map((p) => ({ value: p.slug, label: p.name }))} /></div>}
      columns={["Quando", "Perfil", "Plataforma", "Método", "Resultado"].map((h) => ({ id: h, header: h, cell: () => null }))}
      empty={{ icon: <Radio />, title: "Nenhuma atividade de conexão neste período" }} />
  );
}

export function ConsoleNumbers() {
  return (
    <ListScreen<{ id: string }> title="Números" description="Números de WhatsApp, voz e SMS atribuídos aos perfis dos seus usuários."
      rows={[]} getId={(r) => r.id}
      actions={<><Tooltip content="Requer integração"><span tabIndex={0}><Button icon={<Cable />} disabled>Conectar um número de WhatsApp</Button></span></Tooltip><Tooltip content="Requer integração com operadora"><span tabIndex={0}><Button variant="primary" icon={<Phone />} disabled>Comprar número</Button></span></Tooltip></>}
      columns={["Número", "ID", "Tipo", "Canais", "Perfil", "Status", "Preço", "Adicionado"].map((h) => ({ id: h, header: h, cell: () => null }))}
      empty={{ icon: <Phone />, title: "Nenhum número ainda" }}
      after={<p className="t-caption">Números comprados aparecem aqui com o perfil ao qual pertencem.</p>} />
  );
}

