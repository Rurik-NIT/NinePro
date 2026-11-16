import * as D from "@radix-ui/react-dialog";
import { Menu as MenuIcon, Moon, Search, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/theme";
import { useLocalState } from "@/lib/useLocalState";
import { findLeaf, findModule, isConsole } from "@/config/navigation";
import { IconButton } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Menu";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";

/**
 * AppShell — moldura flutuante: canvas + sidebar em painel + área de trabalho.
 * Gutter de 12px entre moldura, navegação e conteúdo (princípio de espaçamento do CoachIQ,
 * adaptado). Profundidade por nível de superfície, não por sombra.
 */
export function AppShell() {
  const [collapsed, setCollapsed] = useLocalState("ninepro.sidebar.collapsed", false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="flex h-full gap-gutter bg-canvas p-0 lg:p-gutter">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
        Pular para o conteúdo
      </a>

      {/* Desktop */}
      <div className={cn("hidden shrink-0 transition-[width] duration-200 ease-enter lg:block", collapsed ? "w-sidebar-c" : "w-sidebar")}>
        <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed(!collapsed)} />
      </div>

      {/* Mobile / tablet: drawer */}
      <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-scrim animate-fade-in lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] border-r border-line shadow-pop animate-slide-in lg:hidden">
            <D.Title className="sr-only">Menu</D.Title>
            <D.Description className="sr-only">Navegação principal</D.Description>
            <Sidebar collapsed={false} mobile onNavigate={() => setMobileOpen(false)} />
          </D.Content>
        </D.Portal>
      </D.Root>

      <div className="flex min-w-0 flex-1 flex-col lg:overflow-hidden lg:rounded-lg">
        <Header onOpenMenu={() => setMobileOpen(true)} onOpenSearch={() => setCmdOpen(true)} />
        <main id="conteudo" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}

function Header({ onOpenMenu, onOpenSearch }: { onOpenMenu: () => void; onOpenSearch: () => void }) {
  const { pathname, search } = useLocation();
  const { theme, toggle } = useTheme();
  const current = findLeaf(pathname, search);
  const module = findModule(pathname);
  return (
    <header className="sticky top-0 z-20 flex h-header shrink-0 items-center gap-2 border-b border-line bg-canvas px-3 lg:px-1">
      <IconButton label="Abrir menu" onClick={onOpenMenu} className="lg:hidden"><MenuIcon /></IconButton>
      <nav aria-label="Trilha" className="flex min-w-0 flex-1 items-center gap-2 text-body">
        {isConsole(pathname) && (
          <>
            <Link to="/console" className="hidden font-semibold text-text-dim hover:text-text sm:inline">Console</Link>
            <span className="hidden text-text-dim sm:inline" aria-hidden>/</span>
          </>
        )}
        {module && module.id !== current?.id && (
          <>
            <Link to={module.path} className="hidden font-semibold text-text-dim hover:text-text sm:inline">{module.label}</Link>
            <span className="hidden text-text-dim sm:inline" aria-hidden>/</span>
          </>
        )}
        <span className="truncate font-bold text-text" aria-current="page">{current?.label.replace(" (Console)", "") ?? "Página"}</span>
      </nav>
      <button
        type="button"
        onClick={onOpenSearch}
        className="hidden h-control w-[260px] items-center gap-2 rounded-md border border-line bg-surface px-3 text-body text-text-dim transition-colors hover:border-line-strong md:flex"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Buscar ou ir para…</span>
        <span className="flex gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
      </button>
      <IconButton label="Buscar" onClick={onOpenSearch} className="md:hidden"><Search /></IconButton>
      <Tooltip content={theme === "dark" ? "Tema claro" : "Tema escuro"}>
        <IconButton label="Alternar tema" variant="outline" onClick={toggle}>{theme === "dark" ? <Sun /> : <Moon />}</IconButton>
      </Tooltip>
    </header>
  );
}

/** PageHeader — título forte + descrição + ações. Uma ação primária no máximo. */
export function PageHeader({ title, description, actions, meta, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        {meta && <div className="flex flex-wrap items-center gap-2">{meta}</div>}
        <h1 className="t-display text-display-lg max-sm:text-display">{title}</h1>
        {description && <p className="max-w-[640px] t-secondary !text-body">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Page — container de conteúdo com padding e largura máxima consistentes. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto flex w-full max-w-content flex-col gap-5 px-3 py-5 sm:px-4 lg:px-1 lg:py-6", className)}>{children}</div>;
}

/** Section — bloco titulado dentro da página. */
export function Section({ title, description, actions, children, className }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            {title && <h2 className="t-headline">{title}</h2>}
            {description && <p className="t-secondary">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
