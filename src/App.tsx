import { lazy, Suspense, type ComponentType } from "react";
import { DemoOnly } from "@/components/feedback/ComingSoon";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme";
import { FiltersProvider } from "@/lib/filters";
import { AppShell } from "@/components/layout/AppShell";
import { TooltipProvider } from "@/components/ui/Menu";
import { ToastProvider } from "@/components/ui/Toast";
import { LoadingState } from "@/components/feedback/States";
import { AuthProvider, useAuth } from "@/lib/auth";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { DataProvider } from "@/data/source";

/** Carrega um export nomeado de um módulo de forma preguiçosa. */
const named = <M extends Record<string, unknown>>(loader: () => Promise<M>, key: keyof M) =>
  lazy(() => loader().then((m) => ({ default: m[key] as ComponentType })));

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const Creatives = lazy(() => import("@/pages/Creatives"));
const Leads = lazy(() => import("@/pages/Leads"));
const Automations = lazy(() => import("@/pages/Automations"));
const Connections = lazy(() => import("@/pages/Connections"));
const Settings = lazy(() => import("@/pages/Settings"));
const DesignSystem = lazy(() => import("@/pages/DesignSystem"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Login = lazy(() => import("@/pages/auth/Login"));
const Privacy = lazy(() => import("@/pages/legal/Privacy"));
const Terms = lazy(() => import("@/pages/legal/Terms"));
const DataDeletion = lazy(() => import("@/pages/legal/DataDeletion"));
const Admin = lazy(() => import("@/pages/admin/Admin"));
const AgentIntegration = lazy(() => import("@/pages/dev/AgentIntegration"));
const Builder = lazy(() => import("@/pages/automations/Builder"));
const OAuthAuthorize = lazy(() => import("@/pages/oauth/Authorize"));
const MediaUpload = lazy(() => import("@/pages/oauth/Upload"));

const conv = () => import("@/pages/ads/Conversions");
const liveConv = () => import("@/pages/ads/LiveConversions");
const liveHome = () => import("@/pages/live/LiveHome");
const assets = () => import("@/pages/ads/Assets");
const dev = () => import("@/pages/dev/Developers");
const phone = () => import("@/pages/comm/Phone");
const msg = () => import("@/pages/comm/Messaging");
const inbox = () => import("@/pages/inbox/Inbox");
const posts = () => import("@/pages/posts/Posts");
const analytics = () => import("@/pages/analytics/Analytics");
const liveInbox = () => import("@/pages/channels/LiveInbox");
const liveSocial = () => import("@/pages/channels/LiveSocial");
const liveExtras = () => import("@/pages/channels/LiveExtras");
const liveAnalytics = () => import("@/pages/channels/LiveAnalytics");
const liveWs = () => import("@/pages/live/LiveWorkspace");
const liveQueues = () => import("@/pages/channels/LiveQueues");
const LiveRules = lazy(() => import("@/pages/automations/LiveRules"));
const LiveComments = lazy(() => import("@/pages/channels/LiveInbox").then((m) => ({ default: () => <m.LiveInboxComments kind="comment" /> })));
const LiveMentions = lazy(() => import("@/pages/channels/LiveInbox").then((m) => ({ default: () => <m.LiveInboxComments kind="mention" /> })));
const biz = () => import("@/pages/misc/Business");
const cons = () => import("@/pages/console/Console");
const ConsoleTeam = lazy(() => import("@/pages/dev/Developers").then((m) => ({ default: () => <m.Members title="Equipe" /> })));

function HomeRoute() {
  const { mode } = useAuth();
  return mode === "demo" ? N(biz, "Home") : N(liveHome, "LiveHome");
}

const S = (el: JSX.Element) => <Suspense fallback={<LoadingState />}>{el}</Suspense>;
const N = (loader: () => Promise<Record<string, unknown>>, key: string) => { const C = named(loader, key); return S(<C />); };
/** Com banco conectado mostra a tela real; no modo demonstração, o exemplo. */
function LiveOr({ live, demo }: { live: JSX.Element; demo: JSX.Element }) {
  return useAuth().mode === "demo" ? demo : live;
}
const L = (live: JSX.Element, demo: JSX.Element) => <LiveOr live={live} demo={demo} />;
const hidden = (title: string, description: string) => S(<Campaigns variant={{ title, description }} />);

const router = createBrowserRouter([
  /* Páginas públicas (sem login) */
  { path: "/privacidade", element: S(<Privacy />) },
  { path: "/termos", element: S(<Terms />) },
  { path: "/exclusao-de-dados", element: S(<DataDeletion />) },
  /* Autorização de agentes de IA (OAuth): exige login, sem o menu do app */
  /* Envio de mídia pelo link do agente de IA (público, protegido pelo token) */
  { path: "/enviar/:token", element: S(<MediaUpload />) },
  { path: "/oauth/autorizar", element: <RequireAuth>{S(<OAuthAuthorize />)}</RequireAuth> },
  {
    path: "/",
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: "conexoes", element: S(<Connections />) },

      { path: "publicacoes", element: L(N(liveSocial, "LivePosts"), N(posts, "PostsAll")) },
      { path: "publicacoes/filas", element: L(N(liveQueues, "LiveQueues"), N(posts, "PostsQueues")) },
      { path: "publicacoes/hashtags", element: <Navigate to="/conexoes" replace /> },
      { path: "ao-vivo", element: <Navigate to="/conexoes" replace /> },

      { path: "analises/publicacoes", element: L(N(liveAnalytics, "LiveAnalytics"), N(analytics, "AnalyticsPosting")) },
      { path: "analises/caixa-de-entrada", element: L(N(liveExtras, "LiveInboxAnalytics"), N(analytics, "AnalyticsInbox")) },
      { path: "analises/site", element: L(N(liveWs, "LiveSiteAnalytics"), N(analytics, "AnalyticsWebsite")) },

      { path: "caixa-de-entrada/mensagens", element: L(N(liveInbox, "LiveInboxMessages"), N(inbox, "InboxMessages")) },
      { path: "caixa-de-entrada/comentarios", element: L(S(<LiveComments />), N(inbox, "InboxComments")) },
      { path: "caixa-de-entrada/avaliacoes", element: <DemoOnly title="Avaliações" area="as redes sociais">{N(inbox, "InboxReviews")}</DemoOnly> },
      { path: "caixa-de-entrada/mencoes", element: L(S(<LiveMentions />), N(inbox, "InboxMentions")) },
      { path: "caixa-de-entrada/campanhas", element: L(N(liveExtras, "LiveBroadcasts"), N(inbox, "InboxCampaigns")) },
      { path: "caixa-de-entrada/sequencias", element: L(N(liveQueues, "LiveSequences"), N(inbox, "InboxWorkflows")) },
      { path: "caixa-de-entrada/fluxos", element: L(N(liveExtras, "LiveFlows"), N(inbox, "InboxWorkflows")) },
      { path: "caixa-de-entrada/contatos", element: L(N(liveExtras, "LiveContacts"), N(inbox, "InboxContacts")) },

      { path: "anuncios", element: S(<Dashboard />) },
      { path: "anuncios/campanhas", element: S(<Campaigns />) },
      { path: "anuncios/criativos", element: S(<Creatives />) },
      { path: "anuncios/leads", element: S(<Leads />) },
      { path: "anuncios/conversoes", element: L(N(liveConv, "LiveConversionsOverview"), N(conv, "ConversionsOverview")) },
      { path: "anuncios/conversoes/eventos", element: N(conv, "ConversionEvents") },
      { path: "anuncios/conversoes/destinos", element: L(N(liveConv, "LiveConversionDestinations"), N(conv, "ConversionDestinations")) },
      { path: "anuncios/conversoes/fontes", element: L(N(liveWs, "LiveConversionSources"), N(conv, "ConversionSources")) },
      { path: "anuncios/publicos", element: N(assets, "Audiences") },
      { path: "anuncios/formularios", element: N(assets, "LeadForms") },
      { path: "anuncios/palavras-chave", element: hidden("Palavras-chave", "Palavras-chave das campanhas de pesquisa, com desempenho por termo.") },
      { path: "anuncios/termos-de-pesquisa", element: hidden("Termos de pesquisa", "O que as pessoas buscaram antes de ver seus anúncios.") },
      { path: "anuncios/estrategias-de-lance", element: hidden("Estratégias de lance", "Estratégias de lance compartilhadas e o desempenho de cada uma.") },
      { path: "anuncios/catalogos", element: hidden("Catálogos", "Catálogos de produtos usados em anúncios dinâmicos.") },
      { path: "anuncios/parcerias", element: hidden("Anúncios de parceria", "Anúncios veiculados com perfis de criadores e parceiros.") },
      { path: "anuncios/conta", element: hidden("Conta de anúncios", "Visão por conta de anúncios conectada.") },

      { path: "automacoes", element: L(S(<LiveRules />), S(<Automations />)) },
      { path: "automacoes/modelos", element: L(S(<LiveRules defaultTab="modelos" />), S(<Automations defaultTab="modelos" />)) },
      { path: "automacoes/nova", element: S(<Builder />) },

      { path: "comercio/produtos", element: <DemoOnly title="Produtos" area="a sua loja">{N(biz, "CommerceProducts")}</DemoOnly> },
      { path: "comercio/colecoes", element: <DemoOnly title="Coleções" area="a sua loja">{N(biz, "CommerceCollections")}</DemoOnly> },
      { path: "comercio/descontos", element: <DemoOnly title="Descontos" area="a sua loja">{N(biz, "CommerceDiscounts")}</DemoOnly> },
      { path: "comercio/sincronizacao", element: <DemoOnly title="Sincronização" area="a sua loja">{N(biz, "CommerceSync")}</DemoOnly> },
      { path: "criadores", element: <DemoOnly title="Criadores" area="as redes sociais">{N(biz, "Creators")}</DemoOnly> },

      { path: "whatsapp", element: L(N(liveSocial, "LiveWhatsAppOverview"), N(msg, "WhatsAppOverview")) },
      { path: "whatsapp/modelos", element: L(N(liveSocial, "LiveWhatsAppTemplates"), N(msg, "WhatsAppTemplates")) },
      { path: "whatsapp/fluxos", element: <DemoOnly title="Fluxos do WhatsApp" area="o WhatsApp">{N(msg, "WhatsAppFlows")}</DemoOnly> },
      { path: "whatsapp/grupos", element: <DemoOnly title="Grupos do WhatsApp" area="o WhatsApp">{N(msg, "WhatsAppGroups")}</DemoOnly> },
      { path: "whatsapp/conversoes", element: <DemoOnly title="Conversões do WhatsApp" area="o WhatsApp">{N(msg, "WhatsAppConversions")}</DemoOnly> },
      { path: "imessage", element: <DemoOnly title="iMessage" area="o iMessage">{N(msg, "IMessageOverview")}</DemoOnly> },
      { path: "imessage/opt-in", element: <DemoOnly title="Opt-in do iMessage" area="o iMessage">{N(msg, "IMessageOptIn")}</DemoOnly> },
      { path: "imessage/publico", element: <DemoOnly title="Público do iMessage" area="o iMessage">{N(msg, "IMessageAudience")}</DemoOnly> },

      { path: "telefonia", element: <DemoOnly title="Telefonia" area="a telefonia">{N(phone, "PhoneOverview")}</DemoOnly> },
      { path: "telefonia/chamadas", element: <DemoOnly title="Chamadas" area="a telefonia">{N(phone, "Calls")}</DemoOnly> },
      { path: "telefonia/sip", element: <DemoOnly title="Troncos SIP" area="a telefonia">{N(phone, "SipTrunks")}</DemoOnly> },
      { path: "telefonia/chamada-identificada", element: <DemoOnly title="Chamada identificada" area="a telefonia">{N(phone, "BrandedCalling")}</DemoOnly> },
      { path: "telefonia/10dlc", element: <DemoOnly title="10DLC" area="a telefonia">{N(phone, "TenDlc")}</DemoOnly> },
      { path: "telefonia/ids-remetente", element: <DemoOnly title="IDs de remetente" area="a telefonia">{N(phone, "SenderIds")}</DemoOnly> },
      { path: "telefonia/rcs", element: <DemoOnly title="RCS" area="a telefonia">{N(phone, "Rcs")}</DemoOnly> },

      { path: "integracao", element: S(<AgentIntegration />) },
      { path: "chaves-api", element: N(dev, "ApiKeys") },
      { path: "usuarios", element: L(N(liveWs, "LiveTeam"), N(dev, "Members")) },
      { path: "webhooks", element: N(dev, "Webhooks") },
      { path: "logs", element: N(dev, "Logs") },

      { path: "uso", element: <DemoOnly title="Uso" area="o faturamento">{N(biz, "Usage")}</DemoOnly> },
      { path: "faturamento", element: <DemoOnly title="Faturamento" area="o faturamento">{N(biz, "Billing")}</DemoOnly> },
      { path: "saldo", element: <Navigate to="/faturamento" replace /> },
      { path: "configuracoes", element: S(<Settings />) },
      { path: "design-system", element: S(<DesignSystem />) },
      { path: "admin", element: S(<Admin />) },

      /* Produto Console */
      { path: "console", element: <DemoOnly title="Plataformas" area="a API pública">{N(cons, "ConsolePlatforms")}</DemoOnly> },
      { path: "console/numeros", element: <DemoOnly title="Números" area="a telefonia">{N(cons, "ConsoleNumbers")}</DemoOnly> },
      { path: "console/perfis", element: <DemoOnly title="Perfis" area="a API pública">{N(cons, "ConsoleProfiles")}</DemoOnly> },
      { path: "console/sessoes", element: <DemoOnly title="Sessões" area="a API pública">{N(cons, "ConsoleSessions")}</DemoOnly> },
      { path: "console/webhooks", element: N(dev, "Webhooks") },
      { path: "console/logs", element: N(dev, "Logs") },
      { path: "console/chaves-api", element: N(dev, "ApiKeys") },
      { path: "console/apps", element: <DemoOnly title="Apps" area="a API pública">{N(cons, "ConsoleApps")}</DemoOnly> },
      { path: "console/equipe", element: <DemoOnly title="Equipe" area="o convite de equipe">{S(<ConsoleTeam />)}</DemoOnly> },
      { path: "console/configuracoes", element: S(<Settings />) },

      /* rotas antigas (etapa 1) → novas */
      { path: "campanhas", element: <Navigate to="/anuncios/campanhas" replace /> },
      { path: "criativos", element: <Navigate to="/anuncios/criativos" replace /> },
      { path: "leads", element: <Navigate to="/anuncios/leads" replace /> },
      { path: "conversoes", element: <Navigate to="/anuncios/conversoes" replace /> },
      { path: "publicos", element: <Navigate to="/anuncios/publicos" replace /> },
      { path: "formularios", element: <Navigate to="/anuncios/formularios" replace /> },
      { path: "*", element: S(<NotFound />) },
    ],
  },
]);

/** Com Supabase configurado, exige sessão; no modo demonstração, entra direto. */
function RequireAuth({ children }: { children: JSX.Element }) {
  const { mode, loading, session } = useAuth();
  const { loading: wsLoading, current } = useWorkspace();
  if (mode === "demo") return children;
  if (loading) return <LoadingState label="Verificando sessão…" className="h-full" />;
  if (!session) return S(<Login />);
  if (wsLoading && !current) return <LoadingState label="Carregando espaço de trabalho…" className="h-full" />;
  if (!current) return <LoadingState label="Preparando seu espaço de trabalho…" className="h-full" />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <ToastProvider>
          <AuthProvider>
            <WorkspaceProvider>
              <DataProvider>
                <FiltersProvider>
                  <RouterProvider router={router} />
                </FiltersProvider>
              </DataProvider>
            </WorkspaceProvider>
          </AuthProvider>
        </ToastProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
