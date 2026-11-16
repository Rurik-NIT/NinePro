import { ChevronsUpDown, LogOut, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, UserRound } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { NAV, SYSTEM_NAV, type NavItem } from "@/config/navigation";
import { Avatar } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/Button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuSeparator, MenuTrigger, Tooltip } from "@/components/ui/Menu";
import { Logo } from "./Logo";

function NavEntry({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const link = (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative flex h-9 items-center gap-2.5 rounded-md text-body font-semibold transition-colors duration-150",
          collapsed ? "justify-center px-0" : "px-2.5",
          isActive ? "bg-soft text-text" : "text-text-muted hover:bg-surface-2 hover:text-text",
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Indicador de seleção: filete de acento à esquerda — o acento marca estado, não decora */}
          <span className={cn("absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-opacity", isActive ? "opacity-100" : "opacity-0")} aria-hidden />
          <item.icon className={cn("size-[18px] shrink-0", isActive ? "text-text" : "text-text-dim group-hover:text-text-soft")} strokeWidth={isActive ? 2.2 : 1.9} />
          {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
          {!collapsed && item.status === "mapped" && <span className="size-1.5 rounded-full bg-line-strong" title="Aguardando integração" />}
        </>
      )}
    </NavLink>
  );
  return collapsed ? <Tooltip content={item.label} side="right">{link}</Tooltip> : link;
}

const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "light", label: "Claro", icon: Sun },
  { value: "system", label: "Sistema", icon: Monitor },
];

export function Sidebar({ collapsed, onToggleCollapsed, onNavigate, mobile }: { collapsed: boolean; onToggleCollapsed?: () => void; onNavigate?: () => void; mobile?: boolean }) {
  const { preference, setPreference } = useTheme();
  const navigate = useNavigate();
  return (
    <aside aria-label="Navegação principal" className={cn("flex h-full flex-col bg-surface", mobile ? "w-full" : "panel overflow-hidden")}>
      {/* Identidade */}
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

      {/* Contexto: espaço de trabalho (indicador de contexto observado na referência: "Profile") */}
      {!collapsed && (
        <div className="px-3 pt-3">
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="flex w-full items-center gap-2.5 rounded-md border border-line bg-surface-2 p-2 text-left transition-colors hover:border-line-strong">
                <span className="grid size-7 place-items-center rounded-sm bg-series-4 text-[11px] font-extrabold text-white">AU</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-secondary font-bold">Loja Aurora</span>
                  <span className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-text-dim">Espaço demo</span>
                </span>
                <ChevronsUpDown className="size-4 text-text-dim" />
              </button>
            </MenuTrigger>
            <MenuContent className="w-[220px]">
              <MenuLabel>Espaços de trabalho</MenuLabel>
              <MenuItem icon={<span className="grid size-4 place-items-center rounded-[3px] bg-series-4 text-[8px] font-extrabold text-white">AU</span>}>Loja Aurora</MenuItem>
              <MenuSeparator />
              <MenuItem disabled>Outros espaços chegam com o módulo de equipes</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      )}

      {/* Navegação */}
      <nav className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-3")}>
        {NAV.map((g, gi) => (
          <div key={g.id} className={cn(gi > 0 && "mt-5")}>
            {collapsed ? (gi > 0 && <div className="mx-2 mb-3 h-px bg-line" />) : <p className="t-label mb-1.5 px-2.5 !text-[10px] !text-text-dim">{g.label}</p>}
            <ul className="flex flex-col gap-0.5">
              {g.items.map((it) => (
                <li key={it.id}><NavEntry item={it} collapsed={collapsed} onNavigate={onNavigate} /></li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Rodapé: sistema, tema, usuário */}
      <div className={cn("flex flex-col gap-1 border-t border-line py-3", collapsed ? "px-2" : "px-3")}>
        <NavEntry item={SYSTEM_NAV} collapsed={collapsed} onNavigate={onNavigate} />
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
            <MenuRadioGroup
              value={preference}
              onValueChange={(v) => setPreference(v as ThemePreference)}
              options={themeOptions.map((o) => ({ value: o.value, label: <span className="flex items-center gap-2"><o.icon className="size-4 text-text-muted" />{o.label}</span> }))}
            />
            <MenuSeparator />
            <MenuItem icon={<UserRound />} onSelect={() => { navigate("/configuracoes"); onNavigate?.(); }}>Perfil</MenuItem>
            <MenuItem icon={<Settings />} shortcut="G S" onSelect={() => { navigate("/configuracoes?secao=preferencias"); onNavigate?.(); }}>Configurações</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<LogOut />} danger disabled>Sair (sem autenticação nesta versão)</MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </aside>
  );
}
