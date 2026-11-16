import * as TP from "@radix-ui/react-toast";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "warning" | "info";
interface ToastItem { id: number; title: string; description?: string; tone: ToastTone; action?: { label: string; onClick: () => void } }

const Ctx = createContext<((t: Omit<ToastItem, "id">) => void) | null>(null);

const icons: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="text-positive" />,
  error: <XCircle className="text-negative" />,
  warning: <TriangleAlert className="text-warning" />,
  info: <Info className="text-info" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, "id">) => setItems((s) => [...s.slice(-3), { ...t, id: Date.now() + Math.random() }]), []);
  return (
    <Ctx.Provider value={push}>
      <TP.Provider swipeDirection="right" duration={4500}>
        {children}
        {items.map((t) => (
          <TP.Root
            key={t.id}
            onOpenChange={(o) => !o && setItems((s) => s.filter((x) => x.id !== t.id))}
            className={cn("flex w-full items-start gap-3 rounded-lg border border-line bg-overlay p-3.5 shadow-pop data-[state=open]:animate-slide-in data-[state=closed]:animate-fade-in data-[swipe=end]:animate-fade-in [&_svg]:size-[18px]")}
          >
            <span className="mt-px shrink-0">{icons[t.tone]}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <TP.Title className="text-body font-bold">{t.title}</TP.Title>
              {t.description && <TP.Description className="t-secondary">{t.description}</TP.Description>}
              {t.action && (
                <TP.Action altText={t.action.label} asChild>
                  <button type="button" onClick={t.action.onClick} className="mt-1 self-start text-secondary font-bold text-accent-text hover:underline">{t.action.label}</button>
                </TP.Action>
              )}
            </div>
            <TP.Close aria-label="Fechar" className="grid size-6 place-items-center rounded-sm text-text-dim hover:bg-soft hover:text-text"><X className="!size-3.5" /></TP.Close>
          </TP.Root>
        ))}
        <TP.Viewport className="fixed bottom-4 right-4 z-[70] flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2 outline-none" />
      </TP.Provider>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast precisa de <ToastProvider>");
  return c;
}
