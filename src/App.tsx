import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme";
import { FiltersProvider } from "@/lib/filters";
import { AppShell } from "@/components/layout/AppShell";
import { TooltipProvider } from "@/components/ui/Menu";
import { ToastProvider } from "@/components/ui/Toast";
import { LoadingState } from "@/components/feedback/States";
import Dashboard from "@/pages/Dashboard";

const Campaigns = lazy(() => import("@/pages/Campaigns"));
const Creatives = lazy(() => import("@/pages/Creatives"));
const Leads = lazy(() => import("@/pages/Leads"));
const Automations = lazy(() => import("@/pages/Automations"));
const Connections = lazy(() => import("@/pages/Connections"));
const Settings = lazy(() => import("@/pages/Settings"));
const DesignSystem = lazy(() => import("@/pages/DesignSystem"));
const Mapped = lazy(() => import("@/pages/MappedModule"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const S = (el: JSX.Element) => <Suspense fallback={<LoadingState />}>{el}</Suspense>;

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "campanhas", element: S(<Campaigns />) },
      { path: "criativos", element: S(<Creatives />) },
      { path: "leads", element: S(<Leads />) },
      { path: "conversoes", element: S(<Mapped module="conversions" />) },
      { path: "publicos", element: S(<Mapped module="audiences" />) },
      { path: "formularios", element: S(<Mapped module="forms" />) },
      { path: "automacoes", element: S(<Automations />) },
      { path: "conexoes", element: S(<Connections />) },
      { path: "configuracoes", element: S(<Settings />) },
      { path: "design-system", element: S(<DesignSystem />) },
      { path: "*", element: S(<NotFound />) },
    ],
  },
]);

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <ToastProvider>
          <FiltersProvider>
            <RouterProvider router={router} />
          </FiltersProvider>
        </ToastProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
