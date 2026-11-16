import { AlertOctagon, CheckCircle2, FlaskConical, Loader2, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Menu";
import { useAuth } from "@/lib/auth";

/** Skeleton — sempre no formato do conteúdo final (padrão confirmado na referência). */
export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cn("skeleton", className)} />;

export function EmptyState({ icon, title, description, actions, compact, className }: {
  icon: ReactNode; title: string; description?: ReactNode; actions?: ReactNode; compact?: boolean; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 px-6 py-10" : "gap-3 px-6 py-16", className)}>
      <span className="grid size-10 place-items-center rounded-lg border border-line bg-surface-2 text-text-muted [&_svg]:size-5">{icon}</span>
      <div className="flex max-w-[380px] flex-col gap-1">
        <p className="t-title">{title}</p>
        {description && <p className="t-secondary">{description}</p>}
      </div>
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function LoadingState({ label = "Carregando…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn("flex items-center justify-center gap-2 py-12 t-secondary", className)}>
      <Loader2 className="size-4 animate-spin text-accent-text" />
      {label}
    </div>
  );
}

export function ErrorState({ title = "Não foi possível carregar", description, onRetry, className }: {
  title?: string; description?: ReactNode; onRetry?: () => void; className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <span className="grid size-10 place-items-center rounded-lg bg-negative-tint text-negative"><AlertOctagon className="size-5" /></span>
      <div className="flex max-w-[380px] flex-col gap-1">
        <p className="t-title">{title}</p>
        {description && <p className="t-secondary">{description}</p>}
      </div>
      {onRetry && <Button size="sm" icon={<RotateCcw />} onClick={onRetry}>Tentar novamente</Button>}
    </div>
  );
}

export function SuccessState({ title, description, actions, className }: { title: string; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <span className="grid size-10 place-items-center rounded-lg bg-positive-tint text-positive"><CheckCircle2 className="size-5" /></span>
      <div className="flex max-w-[380px] flex-col gap-1">
        <p className="t-title">{title}</p>
        {description && <p className="t-secondary">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Banner inline para avisos contextuais (sem modal). */
export function InlineNotice({ tone = "info", icon, children, action }: { tone?: "info" | "warning" | "negative" | "positive"; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const t = { info: "bg-info-tint text-info", warning: "bg-warning-tint text-warning", negative: "bg-negative-tint text-negative", positive: "bg-positive-tint text-positive" }[tone];
  return (
    <div className={cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-secondary font-semibold [&_svg]:size-4", t)}>
      {icon}
      <span className="flex-1 text-text-soft">{children}</span>
      {action}
    </div>
  );
}

/** Selo obrigatório em toda tela com dados de demonstração. */
export function DemoBadge({ className, liveable }: { className?: string; liveable?: boolean }) {
  const { mode } = useAuth();
  if (liveable && mode === "supabase") return null;
  return (
    <Tooltip content="Dados fictícios gerados localmente para demonstrar o Design System. Nenhuma integração real.">
      <span tabIndex={0} className={cn("inline-flex h-6 items-center gap-1.5 rounded-sm border border-dashed border-warning bg-warning-tint px-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-warning", className)}>
        <FlaskConical className="size-3" />
        Dados fictícios
      </span>
    </Tooltip>
  );
}
