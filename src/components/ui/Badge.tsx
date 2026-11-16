import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "positive" | "negative" | "warning" | "info" | "neutral" | "accent";

const dot: Record<Tone, string> = {
  positive: "bg-positive",
  negative: "bg-negative",
  warning: "bg-warning",
  info: "bg-info",
  neutral: "bg-text-dim",
  accent: "bg-accent",
};
const text: Record<Tone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
  info: "text-info",
  neutral: "text-text-muted",
  accent: "text-accent-text",
};

/**
 * StatusBadge — estado de entidade (entrega, lead, regra).
 * Sem pílula colorida: ponto + rótulo. Cor nunca é o único sinal (o texto nomeia o estado).
 */
export function StatusBadge({ tone, children, pulse }: { tone: Tone; children: ReactNode; pulse?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-secondary font-semibold", text[tone])}>
      <span className="relative flex size-1.5">
        {pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", dot[tone])} />}
        <span className={cn("relative inline-flex size-1.5 rounded-full", dot[tone])} />
      </span>
      {children}
    </span>
  );
}

/** Tag — classificação neutra (plataforma, formato, categoria). Mono, discreta. */
export function Tag({ children, className, tone }: { children: ReactNode; className?: string; tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-xs border px-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.05em]",
        tone === "accent" ? "border-accent-line bg-accent-tint text-accent-text" : "border-line text-text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line bg-surface-2 px-1 font-mono text-[10.5px] text-text-muted">
      {children}
    </kbd>
  );
}

/** Contador ao lado de títulos e breadcrumb — padrão observado na referência. */
export function Count({ children }: { children: ReactNode }) {
  return (
    <span className="num inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-soft px-1.5 font-mono text-[11px] text-text-muted">
      {children}
    </span>
  );
}

export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      className={cn("inline-grid shrink-0 place-items-center rounded-full bg-soft font-bold text-text-soft ring-1 ring-line", className)}
    >
      {initials}
    </span>
  );
}
