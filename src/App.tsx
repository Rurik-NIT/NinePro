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

const conv = () => import("@/pages/ads/Conversions");
const assets = () => import("@/pages/ads/Assets");
const dev = () => import("@/pages/dev/Developers");
const phone = () => import("@/pages/comm/Phone");
const msg = () => import("@/pages/comm/Messaging");
const inbox = () => import("@/pages/inbox/Inbox");
const posts = () => import("@/pages/posts/Posts");
const analytics = () => import("@/pages/analytics/Analytics");
const biz = () => import("@/pages/misc/Business");
const cons = () => import("@/pages/console/Console");
const ConsoleTeam = lazy(() => import("@/pages/dev/Developers").then((m) => ({ default: () => <m.Members title="Equipe" /> })));

function HomeRoute() {
  const { mode } = useAuth();
  return mode === "demo" ? N(biz, "Home") : <Navigate to="/anuncios" replace />;
}

const S = (el: JSX.Element) => <Suspense fallback={<LoadingState />}>{el}</Suspense>;
const N = (loader: () => Promise<Record<string, unknown>>, key: string) => { const C = named(loader, key); return S(<C />); };
const hidden = (title: string, description: string) => S(<Campaigns variant={{ title, description }} />);

const router = createBrowserRouter([
  /* Páginas públicas (sem login) */
  { path: "/privacidade", element: S(<Privacy />) },
  { path: "/termos", element: S(<Terms />) },
  { path: "/exclusao-de-dados", element: S(<DataDeletion />) },
  {
    path: "/",
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: "conexoes", element: S(<Connections />) },

      { path: "publicacoes", element: <DemoOnly title="Publicações" area="as redes sociais">{N(posts, "PostsAll")}</DemoOnly> },
      { path: "publicacoes/filas", element: <DemoOnly title="Filas de publicação" area="as redes sociais">{N(posts, "PostsQueues")}</DemoOnly> },
      { path: "publicacoes/hashtags", element: <Navigate to="/conexoes" replace /> },
      { path: "ao-vivo", element: <Navigate to="/conexoes" replace /> },

      { path: "analises/publicacoes", element: <DemoOnly title="Análises de publicações" area="as redes sociais">{N(analytics, "AnalyticsPosting")}</DemoOnly> },
      { path: "analises/caixa-de-entrada", element: <DemoOnly title="Análises da caixa de entrada" area="as redes sociais">{N(analytics, "AnalyticsInbox")}</DemoOnly> },
      { path: "analises/site", element: <DemoOnly title="Análises do site" area="a tag do site">{N(analytics, "AnalyticsWebsite")}</DemoOnly> },

      { path: "caixa-de-entrada/mensagens", element: <DemoOnly title="Mensagens" area="as redes sociais">{N(inbox, "InboxMessages")}</DemoOnly> },
      { path: "caixa-de-entrada/comentarios", element: <DemoOnly title="Comentários" area="as redes sociais">{N(inbox, "InboxComments")}</DemoOnly> },
      { path: "caixa-de-entrada/avaliacoes", element: <DemoOnly title="Avaliações" area="as redes sociais">{N(inbox, "InboxReviews")}</DemoOnly> },
      { path: "caixa-de-entrada/mencoes", element: <DemoOnly title="Menções" area="as redes sociais">{N(inbox, "InboxMentions")}</DemoOnly> },
      { path: "caixa-de-entrada/campanhas", element: <DemoOnly title="Campanhas de mensagens" area="as redes sociais">{N(inbox, "InboxCampaigns")}</DemoOnly> },
      { path: "caixa-de-entrada/fluxos", element: <DemoOnly title="Fluxos" area="as redes sociais">{N(inbox, "InboxWorkflows")}</DemoOnly> },
      { path: "caixa-de-entrada/contatos", element: <DemoOnly title="Contatos" area="as redes sociais">{N(inbox, "InboxContacts")}</DemoOnly> },

      { path: "anuncios", element: S(<Dashboard />) },
      { path: "anuncios/campanhas", element: S(<Campaigns />) },
      { path: "anuncios/criativos", element: S(<Creatives />) },
      { path: "anuncios/leads", element: S(<Leads />) },
      { path: "anuncios/conversoes", element: N(conv, "ConversionsOverview") },
      { path: "anuncios/conversoes/eventos", element: N(conv, "ConversionEvents") },
      { path: "anuncios/conversoes/destinos", element: N(conv, "ConversionDestinations") },
      { path: "anuncios/conversoes/fontes", element: <DemoOnly title="Fontes de conversão" area="a tag do site e as lojas">{N(conv, "ConversionSources")}</DemoOnly> },
      { path: "anuncios/publicos", element: N(assets, "Audiences") },
      { path: "anuncios/formularios", element: N(assets, "LeadForms") },
      { path: "anuncios/palavras-chave", element: hidden("Palavras-chave", "Palavras-chave das campanhas de pesquisa, com desempenho por termo.") },
      { path: "anuncios/termos-de-pesquisa", element: hidden("Termos de pesquisa", "O que as pessoas buscaram antes de ver seus anúncios.") },
      { path: "anuncios/estrategias-de-lance", element: hidden("Estratégias de lance", "Estratégias de lance compartilhadas e o desempenho de cada uma.") },
      { path: "anuncios/catalogos", element: hidden("Catálogos", "Catálogos de produtos usados em anúncios dinâmicos.") },
      { path: "anuncios/parcerias", element: hidden("Anúncios de parceria", "Anúncios veiculados com perfis de criadores e parceiros.") },
      { path: "anuncios/conta", element: hidden("Conta de anúncios", "Visão por conta de anúncios conectada.") },

      { path: "automacoes", element: S(<Automations />) },
      { path: "automacoes/modelos", element: S(<Automations defaultTab="modelos" />) },
      { path: "automacoes/nova", element: S(<Builder />) },

      { path: "comercio/produtos", element: <DemoOnly title="Produtos" area="a sua loja">{N(biz, "CommerceProducts")}</DemoOnly> },
      { path: "comercio/colecoes", element: <DemoOnly title="Coleções" area="a sua loja">{N(biz, "CommerceCollections")}</DemoOnly> },
      { path: "comercio/descontos", element: <DemoOnly title="Descontos" area="a sua loja">{N(biz, "CommerceDiscounts")}</DemoOnly> },
      { path: "comercio/sincronizacao", element: <DemoOnly title="Sincronização" area="a sua loja">{N(biz, "CommerceSync")}</DemoOnly> },
      { path: "criadores", element: <DemoOnly title="Criadores" area="as redes sociais">{N(biz, "Creators")}</DemoOnly> },

      { path: "whatsapp", element: <DemoOnly title="WhatsApp" area="o WhatsApp">{N(msg, "WhatsAppOverview")}</DemoOnly> },
      { path: "whatsapp/modelos", element: <DemoOnly title="Modelos do WhatsApp" area="o WhatsApp">{N(msg, "WhatsAppTemplates")}</DemoOnly> },
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
      { path: "usuarios", element: <DemoOnly title="Usuários" area="o convite de equipe">{N(dev, "Members")}</DemoOnly> },
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
