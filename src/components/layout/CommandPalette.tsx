import { Command } from "cmdk";
import * as D from "@radix-ui/react-dialog";
import { Monitor, Moon, Search, Sun } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ALL_NAV, groupOf } from "@/config/navigation";
import { useTheme } from "@/lib/theme";
import { Kbd } from "@/components/ui/Badge";

const item =
  "flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-body font-semibold text-text-soft data-[selected=true]:bg-soft data-[selected=true]:text-text [&_svg]:size-4 [&_svg]:text-text-dim";
const group = "[&_[cmdk-group-heading]]:t-label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3";

/** Paleta de comandos ⌘K + atalhos "G + tecla" (padrão observado na referência). */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { setPreference } = useTheme();

  useEffect(() => {
    let gPressed = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "g") { gPressed = Date.now(); return; }
      if (Date.now() - gPressed < 900) {
        const dest = ALL_NAV.find((n) => n.shortcut?.toLowerCase() === e.key.toLowerCase());
        if (dest) { e.preventDefault(); navigate(dest.path); }
        gPressed = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, navigate]);

  const run = (fn: () => void) => { fn(); onOpenChange(false); };

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-scrim animate-fade-in" />
        <D.Content className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-overlay shadow-pop animate-pop-in">
          <D.Title className="sr-only">Paleta de comandos</D.Title>
          <D.Description className="sr-only">Busque páginas e ações</D.Description>
          <Command label="Paleta de comandos" loop>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-4 text-text-dim" />
              <Command.Input autoFocus placeholder="Buscar páginas e ações…" className="h-12 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-dim" />
              <Kbd>esc</Kbd>
            </div>
            <Command.List className="max-h-[360px] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center t-secondary">Nada encontrado.</Command.Empty>
              <Command.Group heading="Páginas" className={group}>
                {ALL_NAV.map((n) => (
                  <Command.Item key={n.id} value={`${n.label} ${groupOf(n.id)?.label ?? ""}`} onSelect={() => run(() => navigate(n.path))} className={item}>
                    <n.icon />
                    <span className="flex-1">{n.label}</span>
                    <span className="t-caption">{groupOf(n.id)?.label ?? "Sistema"}</span>
                    {n.shortcut && <span className="flex gap-1"><Kbd>G</Kbd><Kbd>{n.shortcut}</Kbd></span>}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Tema" className={group}>
                <Command.Item onSelect={() => run(() => setPreference("dark"))} className={item}><Moon />Tema escuro</Command.Item>
                <Command.Item onSelect={() => run(() => setPreference("light"))} className={item}><Sun />Tema claro</Command.Item>
                <Command.Item onSelect={() => run(() => setPreference("system"))} className={item}><Monitor />Seguir o sistema</Command.Item>
              </Command.Group>
            </Command.List>
            <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 t-caption">
              <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> abrir</span>
              <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> mover</span>
              <span className="flex items-center gap-1.5"><Kbd>G</Kbd> + tecla navega de qualquer tela</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
