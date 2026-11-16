import {
  Blocks, Cable, FileText, Image, LayoutGrid, Megaphone, Settings, Target, UserRound, Users, Workflow, type LucideIcon,
} from "lucide-react";

/**
 * Navegação do NinePro — fonte única para sidebar, breadcrumb e paleta de comandos.
 * Derivada do mapa do módulo Ads da referência (docs/reverse-engineering/01-navigation-map.md),
 * reorganizada em grupos por tarefa do gestor de tráfego. Ver docs/design-system/00-design-principles.md §Navegação.
 */
export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  shortcut?: string; // tecla após "G"
  status?: "mapped"; // módulo mapeado, aguardando integração
}
export interface NavGroup { id: string; label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    id: "operacao",
    label: "Operação",
    items: [
      { id: "overview", label: "Visão geral", path: "/", icon: LayoutGrid, shortcut: "V" },
      { id: "campaigns", label: "Campanhas", path: "/campanhas", icon: Megaphone, shortcut: "C" },
      { id: "creatives", label: "Criativos", path: "/criativos", icon: Image, shortcut: "R" },
      { id: "leads", label: "Leads", path: "/leads", icon: UserRound, shortcut: "L" },
    ],
  },
  {
    id: "mensuracao",
    label: "Mensuração",
    items: [
      { id: "conversions", label: "Conversões", path: "/conversoes", icon: Target, status: "mapped" },
      { id: "audiences", label: "Públicos", path: "/publicos", icon: Users, status: "mapped" },
      { id: "forms", label: "Formulários", path: "/formularios", icon: FileText, status: "mapped" },
    ],
  },
  {
    id: "automacao",
    label: "Automação",
    items: [{ id: "automations", label: "Regras", path: "/automacoes", icon: Workflow, shortcut: "A" }],
  },
  {
    id: "conta",
    label: "Conta",
    items: [
      { id: "connections", label: "Conexões", path: "/conexoes", icon: Cable },
      { id: "settings", label: "Configurações", path: "/configuracoes", icon: Settings, shortcut: "S" },
    ],
  },
];

export const SYSTEM_NAV: NavItem = { id: "design-system", label: "Design System", path: "/design-system", icon: Blocks, shortcut: "D" };

export const ALL_NAV: NavItem[] = [...NAV.flatMap((g) => g.items), SYSTEM_NAV];

export const findNav = (pathname: string) =>
  ALL_NAV.find((n) => (n.path === "/" ? pathname === "/" : pathname.startsWith(n.path)));
export const groupOf = (id: string) => NAV.find((g) => g.items.some((i) => i.id === id));
