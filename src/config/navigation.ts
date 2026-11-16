import {
  BarChart3, Blocks, Bot, Building2, Cable, CalendarClock, ChartLine, CircleDollarSign, FileText, Gauge, Globe, Hash, Home, Image, Inbox,
  KeyRound, Layers, LayoutGrid, ListChecks, Megaphone, MessageCircle, MessageSquare, MessagesSquare, Mic, Phone, PhoneCall, Radio,
  Receipt, ScrollText, Send, Settings, ShieldCheck, ShoppingBag, Sparkles, Star, Tag, Target, Ticket, UserRound, Users, Webhook, Workflow,
  AtSign, BadgeCheck, Contact, FolderSync, Smartphone, Server, Link2, Boxes, AppWindow, type LucideIcon,
} from "lucide-react";

/**
 * Navegação do NinePro — espelho funcional do sistema de referência (docs/reverse-engineering/01-navigation-map.md
 * e 11-parity-matrix.md), com nomes e rotas em português. Fonte única para sidebar, trilha e paleta de comandos.
 *
 * Comportamento (igual à referência): módulos com `children` fazem drill-down — ao entrar no módulo,
 * a sidebar inteira vira o submenu dele, com "‹ Módulo" para voltar.
 */
export interface NavLeaf {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  shortcut?: string;
}
export interface NavSubGroup { label?: string; items: NavLeaf[] }
export interface NavItem extends NavLeaf {
  /** Submenu do módulo (drill-down). O `path` do item é a primeira tela. */
  children?: NavSubGroup[];
}
export interface NavGroup { id: string; label?: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    id: "principal",
    items: [
      { id: "home", label: "Início", path: "/", icon: Home, shortcut: "H" },
      { id: "connections", label: "Conexões", path: "/conexoes", icon: Cable, shortcut: "C" },
      {
        id: "posts", label: "Publicações", path: "/publicacoes", icon: CalendarClock, shortcut: "P",
        children: [{ items: [
          { id: "posts-all", label: "Todas as publicações", path: "/publicacoes", icon: Layers },
          { id: "posts-queues", label: "Filas", path: "/publicacoes/filas", icon: ListChecks },
        ] }],
      },
      {
        id: "analytics", label: "Análises", path: "/analises/publicacoes", icon: BarChart3, shortcut: "A",
        children: [{ items: [
          { id: "analytics-posting", label: "Publicações", path: "/analises/publicacoes", icon: ChartLine },
          { id: "analytics-inbox", label: "Caixa de entrada", path: "/analises/caixa-de-entrada", icon: MessageSquare },
          { id: "analytics-website", label: "Site", path: "/analises/site", icon: Globe },
        ] }],
      },
      {
        id: "inbox", label: "Caixa de entrada", path: "/caixa-de-entrada/mensagens", icon: Inbox, shortcut: "I",
        children: [{ items: [
          { id: "inbox-messages", label: "Mensagens", path: "/caixa-de-entrada/mensagens", icon: MessageSquare },
          { id: "inbox-comments", label: "Comentários", path: "/caixa-de-entrada/comentarios", icon: MessagesSquare },
          { id: "inbox-reviews", label: "Avaliações", path: "/caixa-de-entrada/avaliacoes", icon: Star },
          { id: "inbox-mentions", label: "Menções", path: "/caixa-de-entrada/mencoes", icon: AtSign },
          { id: "inbox-campaigns", label: "Campanhas", path: "/caixa-de-entrada/campanhas", icon: Send },
          { id: "inbox-workflows", label: "Fluxos", path: "/caixa-de-entrada/fluxos", icon: Workflow },
          { id: "inbox-contacts", label: "Contatos", path: "/caixa-de-entrada/contatos", icon: Contact },
        ] }],
      },
      {
        id: "ads", label: "Anúncios", path: "/anuncios", icon: Megaphone, shortcut: "N",
        children: [
          { items: [
            { id: "ads-overview", label: "Visão geral", path: "/anuncios", icon: LayoutGrid },
            { id: "ads-campaigns", label: "Campanhas", path: "/anuncios/campanhas", icon: Megaphone },
            { id: "ads-creatives", label: "Criativos", path: "/anuncios/criativos", icon: Image },
            { id: "ads-leads", label: "Leads", path: "/anuncios/leads", icon: UserRound },
          ] },
          { label: "Conversões", items: [
            { id: "conv-overview", label: "Visão geral", path: "/anuncios/conversoes", icon: Target },
            { id: "conv-events", label: "Eventos", path: "/anuncios/conversoes/eventos", icon: ScrollText },
            { id: "conv-destinations", label: "Destinos", path: "/anuncios/conversoes/destinos", icon: Send },
            { id: "conv-sources", label: "Fontes", path: "/anuncios/conversoes/fontes", icon: FolderSync },
          ] },
          { label: "Ativos", items: [
            { id: "ads-audiences", label: "Públicos", path: "/anuncios/publicos", icon: Users },
            { id: "ads-forms", label: "Formulários", path: "/anuncios/formularios", icon: FileText },
          ] },
        ],
      },
      {
        id: "automations", label: "Automações", path: "/automacoes", icon: Workflow, shortcut: "U",
        children: [{ items: [
          { id: "automations-all", label: "Todas as automações", path: "/automacoes", icon: Workflow },
          { id: "automations-templates", label: "Modelos", path: "/automacoes/modelos", icon: Blocks },
        ] }],
      },
      {
        id: "commerce", label: "Comércio", path: "/comercio/produtos", icon: ShoppingBag,
        children: [{ items: [
          { id: "commerce-products", label: "Produtos", path: "/comercio/produtos", icon: ShoppingBag },
          { id: "commerce-collections", label: "Coleções", path: "/comercio/colecoes", icon: Layers },
          { id: "commerce-discounts", label: "Descontos", path: "/comercio/descontos", icon: Ticket },
          { id: "commerce-sync", label: "Sincronização de catálogo", path: "/comercio/sincronizacao", icon: FolderSync },
        ] }],
      },
      { id: "creators", label: "Criadores", path: "/criadores", icon: Sparkles },
    ],
  },
  {
    id: "comunicacao",
    label: "Comunicação",
    items: [
      {
        id: "whatsapp", label: "WhatsApp", path: "/whatsapp", icon: MessageCircle,
        children: [{ items: [
          { id: "wa-overview", label: "Visão geral", path: "/whatsapp", icon: LayoutGrid },
          { id: "wa-templates", label: "Modelos", path: "/whatsapp/modelos", icon: FileText },
          { id: "wa-flows", label: "Fluxos", path: "/whatsapp/fluxos", icon: Workflow },
          { id: "wa-groups", label: "Grupos", path: "/whatsapp/grupos", icon: Users },
          { id: "wa-conversions", label: "Conversões", path: "/whatsapp/conversoes", icon: Target },
        ] }],
      },
      {
        id: "imessage", label: "iMessage", path: "/imessage", icon: MessageSquare,
        children: [{ items: [
          { id: "im-overview", label: "Visão geral", path: "/imessage", icon: LayoutGrid },
          { id: "im-optin", label: "Links de opt-in", path: "/imessage/opt-in", icon: Link2 },
          { id: "im-audience", label: "Público", path: "/imessage/publico", icon: Users },
        ] }],
      },
      {
        id: "phone", label: "Telefonia", path: "/telefonia", icon: Phone,
        children: [{ items: [
          { id: "ph-overview", label: "Visão geral", path: "/telefonia", icon: LayoutGrid },
          { id: "ph-calls", label: "Chamadas", path: "/telefonia/chamadas", icon: PhoneCall },
          { id: "ph-sip", label: "SIP", path: "/telefonia/sip", icon: Server },
          { id: "ph-branded", label: "Chamada identificada", path: "/telefonia/chamada-identificada", icon: BadgeCheck },
          { id: "ph-10dlc", label: "10DLC", path: "/telefonia/10dlc", icon: ShieldCheck },
          { id: "ph-sender", label: "IDs de remetente", path: "/telefonia/ids-remetente", icon: Hash },
          { id: "ph-rcs", label: "RCS", path: "/telefonia/rcs", icon: Smartphone },
        ] }],
      },
    ],
  },
  {
    id: "dev",
    label: "Desenvolvedores",
    items: [
      { id: "api-keys", label: "Chaves de API", path: "/chaves-api", icon: KeyRound, shortcut: "K" },
      { id: "users", label: "Usuários", path: "/usuarios", icon: Users },
      { id: "webhooks", label: "Webhooks", path: "/webhooks", icon: Webhook, shortcut: "W" },
      { id: "logs", label: "Logs", path: "/logs", icon: ScrollText, shortcut: "L" },
    ],
  },
];

export const SETTINGS_NAV: NavItem = {
  id: "settings", label: "Configurações", path: "/configuracoes", icon: Settings, shortcut: "S",
  children: [{ items: [
    { id: "set-profile", label: "Perfil", path: "/configuracoes?secao=perfil", icon: UserRound },
    { id: "set-usage", label: "Uso", path: "/uso", icon: Gauge },
    { id: "set-billing", label: "Faturamento", path: "/faturamento", icon: Receipt },
    { id: "set-security", label: "Segurança", path: "/configuracoes?secao=seguranca", icon: ShieldCheck },
    { id: "set-retention", label: "Retenção de conteúdo", path: "/configuracoes?secao=retencao", icon: FolderSync },
    { id: "set-notifications", label: "Notificações", path: "/configuracoes?secao=notificacoes", icon: Radio },
    { id: "set-apps", label: "Apps conectados", path: "/configuracoes?secao=apps", icon: Cable },
    { id: "set-slack", label: "Slack", path: "/configuracoes?secao=slack", icon: Hash },
    { id: "set-leaderboard", label: "Ranking", path: "/configuracoes?secao=ranking", icon: Star },
    { id: "set-ai", label: "Provedores de IA", path: "/configuracoes?secao=ia", icon: Bot },
    { id: "set-whitelabel", label: "Marca própria", path: "/configuracoes?secao=marca-propria", icon: Tag },
    { id: "set-sso", label: "Login único (SSO)", path: "/configuracoes?secao=sso", icon: KeyRound },
    { id: "set-danger", label: "Zona de perigo", path: "/configuracoes?secao=perigo", icon: ShieldCheck },
  ] }],
};

/** Produto Console (para quem integra o NinePro ao próprio software) — sidebar plana, como na referência. */
export const CONSOLE_NAV: NavGroup[] = [{
  id: "console",
  items: [
    { id: "c-platforms", label: "Plataformas", path: "/console", icon: Boxes },
    { id: "c-numbers", label: "Números", path: "/console/numeros", icon: Phone },
    { id: "c-profiles", label: "Perfis", path: "/console/perfis", icon: UserRound },
    { id: "c-sessions", label: "Sessões", path: "/console/sessoes", icon: Radio },
    { id: "c-webhooks", label: "Webhooks", path: "/console/webhooks", icon: Webhook },
    { id: "c-logs", label: "Logs", path: "/console/logs", icon: ScrollText },
    { id: "c-keys", label: "Chaves de API", path: "/console/chaves-api", icon: KeyRound },
    { id: "c-apps", label: "Seus apps", path: "/console/apps", icon: AppWindow },
    { id: "c-team", label: "Equipe", path: "/console/equipe", icon: Users },
  ],
}];
export const CONSOLE_SETTINGS: NavLeaf = { id: "c-settings", label: "Configurações", path: "/console/configuracoes", icon: Settings };
export const isConsole = (pathname: string) => pathname === "/console" || pathname.startsWith("/console/");

export const SYSTEM_NAV: NavLeaf = { id: "design-system", label: "Design System", path: "/design-system", icon: Blocks, shortcut: "D" };

/* Telas fora da sidebar (acessíveis por atalho/paleta, como na referência) */
export const EXTRA_NAV: NavLeaf[] = [
  { id: "hashtags", label: "Pesquisa de hashtags", path: "/publicacoes/hashtags", icon: Hash },
  { id: "live", label: "Ao vivo", path: "/ao-vivo", icon: Mic },
  { id: "balance", label: "Saldo", path: "/saldo", icon: CircleDollarSign },
  { id: "account", label: "Conta de anúncios", path: "/anuncios/conta", icon: Building2 },
  { id: "automation-new", label: "Nova automação", path: "/automacoes/nova", icon: Workflow },
  { id: "ads-keywords", label: "Palavras-chave", path: "/anuncios/palavras-chave", icon: Hash },
  { id: "ads-search-terms", label: "Termos de pesquisa", path: "/anuncios/termos-de-pesquisa", icon: ScrollText },
  { id: "ads-bids", label: "Estratégias de lance", path: "/anuncios/estrategias-de-lance", icon: Target },
  { id: "ads-catalogs", label: "Catálogos", path: "/anuncios/catalogos", icon: ShoppingBag },
  { id: "ads-partnership", label: "Anúncios de parceria", path: "/anuncios/parcerias", icon: Sparkles },
];

/* ---------- utilitários ---------- */
const stripQuery = (p: string) => p.split("?")[0];

export const ALL_TOP: NavItem[] = [...NAV.flatMap((g) => g.items), SETTINGS_NAV];
export type NavLeafWithModule = NavLeaf & { module?: NavItem };
export const ALL_LEAVES: NavLeafWithModule[] = [
  ...ALL_TOP.flatMap((m): NavLeafWithModule[] => (m.children ? m.children.flatMap((g) => g.items.map((l) => ({ ...l, module: m }))) : [{ id: m.id, label: m.label, path: m.path, icon: m.icon, shortcut: m.shortcut }])),
  ...EXTRA_NAV,
  ...CONSOLE_NAV[0].items.map((l) => ({ ...l, label: `${l.label} (Console)` })),
  { ...CONSOLE_SETTINGS, label: "Configurações (Console)" },
  SYSTEM_NAV,
];
/** Compatibilidade com a paleta de comandos e atalhos. */
export const ALL_NAV: NavLeaf[] = [...ALL_TOP, ...EXTRA_NAV, SYSTEM_NAV];

/** Folha mais específica que corresponde ao caminho atual. */
export function findLeaf(pathname: string, search = "") {
  const full = pathname + search;
  const exact = ALL_LEAVES.find((l) => l.path === full) ?? ALL_LEAVES.find((l) => stripQuery(l.path) === pathname && !l.path.includes("?"));
  if (exact) return exact;
  return [...ALL_LEAVES].filter((l) => l.path !== "/" && pathname.startsWith(stripQuery(l.path))).sort((a, b) => b.path.length - a.path.length)[0];
}

/** Módulo (drill-down) ativo para o caminho atual. */
export function findModule(pathname: string): NavItem | undefined {
  return ALL_TOP.filter((m) => m.children).find((m) =>
    m.children!.some((g) => g.items.some((l) => { const p = stripQuery(l.path); return p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/"); })),
  );
}

export const findNav = (pathname: string) => findLeaf(pathname);
export const groupOf = (id: string) => NAV.find((g) => g.items.some((i) => i.id === id || i.children?.some((c) => c.items.some((l) => l.id === id))));
