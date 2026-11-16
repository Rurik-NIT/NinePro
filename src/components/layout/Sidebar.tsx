import { ChevronLeft, ChevronRight, ChevronsUpDown, LogOut, ShieldCheck, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { CONSOLE_NAV, CONSOLE_SETTINGS, NAV, SETTINGS_NAV, SYSTEM_NAV, findLeaf, findModule, isConsole, type NavItem, type NavLeaf } from "@/config/navigation";
import { Avatar } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { IconButton } from "@/components/ui/Button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuSeparator, MenuTrigger, Tooltip } from "@/components/ui/Menu";
import { Logo } from "./Logo";

const itemBase = "group relative flex h-9 items-center gap-2.5 rounded-md text-body font-semibold transition-colors duration-150";

function Entry({ item, active, collapsed, onClick, hasChildren }: { item: NavLeaf; active: boolean; collapsed: boolean; onClick?: () => void; hasChildren?: boolean }) {
  const el = (
    <NavLink
      to={item.path}
      end
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
  const auth = useAuth();
  const ws = useWorkspace();
  const live = auth.mode === "supabase";
  const userName = live ? (ws.profileName || auth.user?.email || "Usuário") : "Gestor Demo";
  const wsName = live ? (ws.current?.name ?? "Meu espaço") : "Loja Aurora";
  const roleLabel = live ? `${ws.current?.name ?? "Sem espaço"} · ${ws.current?.role === "owner" ? "Proprietário" : ws.current?.role === "admin" ? "Administrador" : "Membro"}` : "Administrador";
  const { pathname, search } = useLocation();
  const consoleMode = isConsole(pathname);
  const module = consoleMode ? undefined : findModule(pathname);
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
                <span className="grid size-7 place-items-center rounded-sm bg-series-4 text-[11px] font-extrabold text-white">{wsName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-secondary font-bold">{wsName}</span>
                  <span className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-text-dim">{consoleMode ? "Console" : "Estúdio"}{live ? "" : " · demo"}</span>
                </span>
                <ChevronsUpDown className="size-4 text-text-dim" />
              </button>
            </MenuTrigger>
            <MenuContent className="w-[260px]">
              <MenuLabel>Produto</MenuLabel>
              <MenuItem onSelect={() => { navigate("/"); onNavigate?.(); }} icon={<span className="grid size-4 place-items-center rounded-[3px] bg-accent text-[8px] font-extrabold text-accent-ink">E</span>}>
                <span className="flex flex-col"><span className="font-semibold">Estúdio{!consoleMode && " ✓"}</span><span className="t-caption">Suas próprias contas e canais</span></span>
              </MenuItem>
              <MenuItem onSelect={() => { navigate("/console"); onNavigate?.(); }} icon={<span className="grid size-4 place-items-center rounded-[3px] bg-text text-[8px] font-extrabold text-text-inverse">C</span>}>
                <span className="flex flex-col"><span className="font-semibold">Console{consoleMode && " ✓"}</span><span className="t-caption">Para os usuários do seu software</span></span>
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      )}

      <nav className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-3")}>
        {consoleMode ? (
          <ul className="flex flex-col gap-0.5">{CONSOLE_NAV[0].items.map((l) => <li key={l.id}><Entry item={l} active={pathname === l.path} collapsed={collapsed} onClick={onNavigate} /></li>)}</ul>
        ) : drill ? (
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
        {consoleMode ? <Entry item={CONSOLE_SETTINGS} active={pathname === CONSOLE_SETTINGS.path} collapsed={collapsed} onClick={onNavigate} /> : <Entry item={SETTINGS_NAV} active={module?.id === "settings"} collapsed={collapsed} hasChildren onClick={onNavigate} />}
        {(!live || ws.isPlatformAdmin) && <Entry item={SYSTEM_NAV} active={leaf?.id === SYSTEM_NAV.id} collapsed={collapsed} onClick={onNavigate} />}
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className={cn("mt-1 flex items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-surface-2", collapsed && "justify-center")} aria-label="Menu do usuário">
              <Avatar name={userName} size={28} />
              {!collapsed && (
                <>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-secondary font-bold">{userName}</span>
                    <span className="truncate text-caption text-text-dim">{roleLabel}</span>
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
            {live && ws.isPlatformAdmin && <MenuItem icon={<ShieldCheck />} onSelect={() => { navigate("/admin"); onNavigate?.(); }}>Painel admin</MenuItem>}
            <MenuItem icon={<UserRound />} onSelect={() => { navigate("/configuracoes?secao=perfil"); onNavigate?.(); }}>Perfil</MenuItem>
            <MenuItem icon={<Settings />} shortcut="G S" onSelect={() => { navigate("/configuracoes?secao=uso"); onNavigate?.(); }}>Uso e faturamento</MenuItem>
            <MenuSeparator />
            {live && ws.workspaces.length > 1 && (<><MenuSeparator /><MenuLabel>Espaço de trabalho</MenuLabel><MenuRadioGroup value={ws.current?.id ?? ""} onValueChange={(v) => ws.select(v)} options={ws.workspaces.map((w) => ({ value: w.id, label: w.name }))} /></>)}
            {live ? <MenuItem icon={<LogOut />} danger onSelect={() => void auth.signOut()}>Sair</MenuItem> : <MenuItem icon={<LogOut />} danger disabled>Sair (modo demonstração)</MenuItem>}
          </MenuContent>
        </Menu>
      </div>
    </aside>
  );
}
