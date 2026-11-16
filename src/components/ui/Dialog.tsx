import * as D from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

const overlay = "fixed inset-0 z-50 bg-scrim backdrop-blur-[2px] animate-fade-in";

function Header({ icon, title, description }: { icon?: ReactNode; title: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 pr-10">
      {icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-text-soft [&_svg]:size-[18px]">
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-1">
        <D.Title className="t-headline">{title}</D.Title>
        {description ? (
          <D.Description className="t-secondary">{description}</D.Description>
        ) : (
          <D.Description className="sr-only">{typeof title === "string" ? title : "Diálogo"}</D.Description>
        )}
      </div>
    </div>
  );
}

const CloseX = () => (
  <D.Close aria-label="Fechar" className="absolute right-4 top-4 grid size-8 place-items-center rounded-md text-text-muted hover:bg-soft hover:text-text">
    <X className="size-4" />
  </D.Close>
);

export interface OverlayProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Modal — tarefas focadas que bloqueiam o fluxo (criar, editar, confirmar). */
export function Modal({ open, onOpenChange, title, description, icon, children, footer, size = "md", className }: OverlayProps & { size?: "sm" | "md" | "lg" | "xl" }) {
  const w = { sm: "max-w-[420px]", md: "max-w-[560px]", lg: "max-w-[760px]", xl: "max-w-[980px]" }[size];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-overlay shadow-pop animate-pop-in",
            w,
            className,
          )}
        >
          <div className="border-b border-line p-5">
            <Header icon={icon} title={title} description={description} />
          </div>
          <CloseX />
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Drawer — configuração lateral sem perder o contexto (colunas, cards, filtros, detalhes). */
export function Drawer({ open, onOpenChange, title, description, icon, children, footer, width = 440, className }: OverlayProps & { width?: number }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content
          style={{ width: `min(${width}px, calc(100vw - 16px))` }}
          className={cn(
            "fixed bottom-2 right-2 top-2 z-50 flex flex-col rounded-xl border border-line bg-overlay shadow-pop animate-slide-in",
            className,
          )}
        >
          <div className="border-b border-line p-5">
            <Header icon={icon} title={title} description={description} />
          </div>
          <CloseX />
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
          {footer && <div className="flex items-center gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** ConfirmDialog — ações destrutivas ou de alto impacto (pausar, excluir, alterar orçamento). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-overlay p-5 shadow-pop animate-pop-in"
        >
          <div className="flex gap-3">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-md",
                tone === "danger" ? "bg-negative-tint text-negative" : "bg-accent-tint text-accent-text",
              )}
            >
              <AlertTriangle className="size-[18px]" />
            </span>
            <div className="flex flex-col gap-1">
              <D.Title className="t-title">{title}</D.Title>
              <D.Description className="t-secondary">{description}</D.Description>
              {children}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <D.Close asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </D.Close>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
