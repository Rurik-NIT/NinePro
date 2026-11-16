import { cn } from "@/lib/cn";

/**
 * Marca NinePro — o "9" é construído como um alvo/retícula: círculo de mira + haste.
 * Remete a precisão e controle (mirar o público, acertar o orçamento).
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={cn("shrink-0", className)} role="img" aria-label="NinePro">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <circle cx="15.5" cy="13" r="5.25" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6" />
      <circle cx="15.5" cy="13" r="1.4" fill="var(--accent-ink)" />
      <path d="M20.6 14.6 16.4 24.5" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <span className="flex items-baseline gap-1.5">
          <span className="text-[16px] font-extrabold tracking-[-0.03em] text-text">NinePro</span>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-dim">9Pro</span>
        </span>
      )}
    </span>
  );
}
