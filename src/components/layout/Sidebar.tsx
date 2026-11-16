import { ChevronLeft, ChevronRight, ChevronsUpDown, LogOut, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { NAV, SETTINGS_NAV, SYSTEM_NAV, findLeaf, findModule, type NavItem, type NavLeaf } from "@/config/navigation";
import { Avatar } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/Button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuSeparator, MenuTrigger, Tooltip } from "@/components/ui/Menu";
import { Logo } from "./Logo";

const itemBase = "group relative flex h-9 items-center gap-2.5 rounded-md text-body font-semibold transition-colors duration-150";

function Entry({ item, active, collapsed, onClick, hasChildren }: { item: NavLeaf; active: boolean; collapsed: boolean; onClick?: () => void; hasChildren?: boolean }) {
  const el = (
    <NavLink
      to={item.path}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(itemBase, collapsed ? "justify-center px-0" : "px-2.5", active ? "bg-soft text-text" : "text-text-muted hover:bg-surface-2 hover:text-text")}
    >
      <span className={cn("absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-opacity", active ? "opacity-100" : "opacity-0")} aria-hidden />
      <item.icon className={cn("size-[18px] shrink-0", active ? "text-text" : "text-text-dim group-hover:text-text-soft")} strokeWidth={active ? 2.2 : 1.9} />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && hasChildren && <ChevronRight className="size-3.5 text-text-dim" />}
    </NavLink>
  );
  return collapsed ? <Tooltip content={item.label} side="right">{el}</Tooltip> : el;
}

const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "light", label: "Claro", icon: Sun },
  { value: "system", label: "Sistema", icon: Monitor },
];

/**
 * Sidebar com drill-down (comportamento da referência): dentro de um módulo com submenu,
 * a navegação inteira vira o submenu, encabeçado por "‹ Módulo".
 */
export function Sidebar({ collapsed, onToggleCollapsed, onNavigate, mobile }: { collapsed: boolean; onToggleCollapsed?: () => void; onNavigate?: () => void; mobile?: boolean }) {
  const { preference, setPreference } = useTheme();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const module = findModule(pathname);
  const leaf = findLeaf(pathname, search);
  const [showRoot, setShowRoot] = useState(false);
  useEffect(() => setShowRoot(false), [pathname]);

  const drill = module && !showRoot ? module : undefined;
  const isActiveLeaf = (l: NavLeaf) => leaf?.id === l.id;
  const isActiveTop = (m: NavItem) => module?.id === m.id || leaf?.id === m.id;

  return (
    <aside aria-label="Navegação principal" className={cn("flex h-full flex-col bg-surface", mobile ? "w-full" : "panel overflow-hidden")}>
      <div className={cn("flex h-header shrink-0 items-center border-b border-line", collapsed ? "justify-center px-0" : "justify-between pl-4 pr-2")}>
        {collapsed ? (
          <IconButton label="Expandir menu" onClick={onToggleCollapsed}><PanelLeftOpen /></IconButton>
        ) : (
          <>
            <Logo />
            {onToggleCollapsed && <IconButton label="Recolher menu" onClick={onToggleCollapsed}><PanelLeftClose /></IconButton>}
          </>
        )}
      </div>

      {!collapsed && (
        <div className="px-3 pt-3">
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="flex w-full items-center gap-2.5 rounded-md border border-line bg-surface-2 p-2 text-left transition-colors hover:border-line-strong">
                <span className="grid size-7 place-items-center rounded-sm bg-series-4 text-[11px] font-extrabold text-white">AU</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-secondary font-bold">Loja Aurora</span>
                  <span className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-text-dim">Estúdio · demo</span>
                </span>
                <ChevronsUpDown className="size-4 text-text-dim" />
              </button>
            </MenuTrigger>
            <MenuContent className="w-[240px]">
              <MenuLabel>Produto</MenuLabel>
              <MenuItem icon={<span className="grid size-4 place-items-center rounded-[3px] bg-accent text-[8px] font-extrabold text-accent-ink">E</span>}>Estúdio — suas contas e canais</MenuItem>
              <MenuItem disabled icon={<span className="grid size-4 place-items-center rounded-[3px] bg-soft text-[8px] font-extrabold">C</span>}>Console — para seus clientes (em breve)</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      )}

      <nav className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-3")}>
        {drill ? (
          <div key={drill.id} className="animate-fade-in">
            {!collapsed ? (
              <button type="button" onClick={() => setShowRoot(true)} className="mb-2 flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-secondary font-semibold text-text-muted transition-colors hover:bg-surface-2 hover:text-text">
                <ChevronLeft className="size-4" />{drill.label}
              </button>
            ) : (
              <Tooltip content={`Voltar ao menu (${drill.label})`} side="right">
                <button type="button" onClick={() => setShowRoot(true)} aria-label="Voltar ao menu principal" className="mb-2 grid h-8 w-full place-items-center rounded-md text-text-muted hover:bg-surface-2"><ChevronLeft className="size-4" /></button>
              </Tooltip>
            )}
            {drill.children!.map((g, gi) => (
              <div key={gi} className={cn(gi > 0 && "mt-4")}>
                {g.label && !collapsed && <p className="t-label mb-1.5 px-2.5 !text-[10px] !text-text-dim">{g.label}</p>}
                {g.label && collapsed && <div className="mx-2 mb-3 h-px bg-line" />}
                <ul className="flex flex-col gap-0.5">
                  {g.items.map((l) => <li key={l.id}><Entry item={l} active={isActiveLeaf(l)} collapsed={collapsed} onClick={onNavigate} /></li>)}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          NAV.map((g, gi) => (
            <div key={g.id} className={cn(gi > 0 && "mt-5")}>
              {g.label && (collapsed ? <div className="mx-2 mb-3 h-px bg-line" /> : <p className="t-label mb-1.5 px-2.5 !text-[10px] !text-text-dim">{g.label}</p>)}
              <ul className="flex flex-col gap-0.5">
                {g.items.map((m) => <li key={m.id}><Entry item={m} active={isActiveTop(m)} collapsed={collapsed} hasChildren={!!m.children} onClick={onNavigate} /></li>)}
              </ul>
            </div>
          ))
        )}
      </nav>

      <div className={cn("flex flex-col gap-0.5 border-t border-line py-3", collapsed ? "px-2" : "px-3")}>
        <Entry item={SETTINGS_NAV} active={module?.id === "settings"} collapsed={collapsed} hasChildren onClick={onNavigate} />
        <Entry item={SYSTEM_NAV} active={leaf?.id === SYSTEM_NAV.id} collapsed={collapsed} onClick={onNavigate} />
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className={cn("mt-1 flex items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-surface-2", collapsed && "justify-center")} aria-label="Menu do usuário">
              <Avatar name="Gestor Demo" size={28} />
              {!collapsed && (
                <>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-secondary font-bold">Gestor Demo</span>
                    <span className="truncate text-caption text-text-dim">Administrador</span>
                  </span>
                  <ChevronsUpDown className="size-4 text-text-dim" />
                </>
              )}
            </button>
          </MenuTrigger>
          <MenuContent align="start" className="w-[232px]">
            <MenuLabel>Tema</MenuLabel>
            <MenuRadioGroup value={preference} onValueChange={(v) => setPreference(v as ThemePreference)}
              options={themeOptions.map((o) => ({ value: o.value, label: <span className="flex items-center gap-2"><o.icon className="size-4 text-text-muted" />{o.label}</span> }))} />
            <MenuSeparator />
            <MenuItem icon={<UserRound />} onSelect={() => { navigate("/configuracoes?secao=perfil"); onNavigate?.(); }}>Perfil</MenuItem>
            <MenuItem icon={<Settings />} shortcut="G S" onSelect={() => { navigate("/configuracoes?secao=uso"); onNavigate?.(); }}>Uso e faturamento</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<LogOut />} danger disabled>Sair (sem autenticação nesta versão)</MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </aside>
  );
}
