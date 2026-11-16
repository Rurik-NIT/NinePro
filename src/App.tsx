import { lazy, Suspense, type ComponentType } from "react";
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

const S = (el: JSX.Element) => <Suspense fallback={<LoadingState />}>{el}</Suspense>;
const N = (loader: () => Promise<Record<string, unknown>>, key: string) => { const C = named(loader, key); return S(<C />); };
const hidden = (title: string, description: string) => S(<Campaigns variant={{ title, description }} />);

const router = createBrowserRouter([
  {
    path: "/",
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { index: true, element: N(biz, "Home") },
      { path: "conexoes", element: S(<Connections />) },

      { path: "publicacoes", element: N(posts, "PostsAll") },
      { path: "publicacoes/filas", element: N(posts, "PostsQueues") },
      { path: "publicacoes/hashtags", element: <Navigate to="/conexoes" replace /> },
      { path: "ao-vivo", element: <Navigate to="/conexoes" replace /> },

      { path: "analises/publicacoes", element: N(analytics, "AnalyticsPosting") },
      { path: "analises/caixa-de-entrada", element: N(analytics, "AnalyticsInbox") },
      { path: "analises/site", element: N(analytics, "AnalyticsWebsite") },

      { path: "caixa-de-entrada/mensagens", element: N(inbox, "InboxMessages") },
      { path: "caixa-de-entrada/comentarios", element: N(inbox, "InboxComments") },
      { path: "caixa-de-entrada/avaliacoes", element: N(inbox, "InboxReviews") },
      { path: "caixa-de-entrada/mencoes", element: N(inbox, "InboxMentions") },
      { path: "caixa-de-entrada/campanhas", element: N(inbox, "InboxCampaigns") },
      { path: "caixa-de-entrada/fluxos", element: N(inbox, "InboxWorkflows") },
      { path: "caixa-de-entrada/contatos", element: N(inbox, "InboxContacts") },

      { path: "anuncios", element: S(<Dashboard />) },
      { path: "anuncios/campanhas", element: S(<Campaigns />) },
      { path: "anuncios/criativos", element: S(<Creatives />) },
      { path: "anuncios/leads", element: S(<Leads />) },
      { path: "anuncios/conversoes", element: N(conv, "ConversionsOverview") },
      { path: "anuncios/conversoes/eventos", element: N(conv, "ConversionEvents") },
      { path: "anuncios/conversoes/destinos", element: N(conv, "ConversionDestinations") },
      { path: "anuncios/conversoes/fontes", element: N(conv, "ConversionSources") },
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

      { path: "comercio/produtos", element: N(biz, "CommerceProducts") },
      { path: "comercio/colecoes", element: N(biz, "CommerceCollections") },
      { path: "comercio/descontos", element: N(biz, "CommerceDiscounts") },
      { path: "comercio/sincronizacao", element: N(biz, "CommerceSync") },
      { path: "criadores", element: N(biz, "Creators") },

      { path: "whatsapp", element: N(msg, "WhatsAppOverview") },
      { path: "whatsapp/modelos", element: N(msg, "WhatsAppTemplates") },
      { path: "whatsapp/fluxos", element: N(msg, "WhatsAppFlows") },
      { path: "whatsapp/grupos", element: N(msg, "WhatsAppGroups") },
      { path: "whatsapp/conversoes", element: N(msg, "WhatsAppConversions") },
      { path: "imessage", element: N(msg, "IMessageOverview") },
      { path: "imessage/opt-in", element: N(msg, "IMessageOptIn") },
      { path: "imessage/publico", element: N(msg, "IMessageAudience") },

      { path: "telefonia", element: N(phone, "PhoneOverview") },
      { path: "telefonia/chamadas", element: N(phone, "Calls") },
      { path: "telefonia/sip", element: N(phone, "SipTrunks") },
      { path: "telefonia/chamada-identificada", element: N(phone, "BrandedCalling") },
      { path: "telefonia/10dlc", element: N(phone, "TenDlc") },
      { path: "telefonia/ids-remetente", element: N(phone, "SenderIds") },
      { path: "telefonia/rcs", element: N(phone, "Rcs") },

      { path: "chaves-api", element: N(dev, "ApiKeys") },
      { path: "usuarios", element: N(dev, "Members") },
      { path: "webhooks", element: N(dev, "Webhooks") },
      { path: "logs", element: N(dev, "Logs") },

      { path: "uso", element: N(biz, "Usage") },
      { path: "faturamento", element: N(biz, "Billing") },
      { path: "saldo", element: <Navigate to="/faturamento" replace /> },
      { path: "configuracoes", element: S(<Settings />) },
      { path: "design-system", element: S(<DesignSystem />) },

      /* Produto Console */
      { path: "console", element: N(cons, "ConsolePlatforms") },
      { path: "console/numeros", element: N(cons, "ConsoleNumbers") },
      { path: "console/perfis", element: N(cons, "ConsoleProfiles") },
      { path: "console/sessoes", element: N(cons, "ConsoleSessions") },
      { path: "console/webhooks", element: N(dev, "Webhooks") },
      { path: "console/logs", element: N(dev, "Logs") },
      { path: "console/chaves-api", element: N(dev, "ApiKeys") },
      { path: "console/apps", element: N(cons, "ConsoleApps") },
      { path: "console/equipe", element: S(<ConsoleTeam />) },
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
  if (wsLoading) return <LoadingState label="Carregando espaço de trabalho…" className="h-full" />;
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
