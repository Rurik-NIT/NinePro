import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/cn";
import { formatDelta, formatValue, type MetricFormat } from "@/lib/format";
import { Skeleton } from "@/components/feedback/States";
import { Tooltip } from "@/components/ui/Menu";

/**
 * PerformanceIndicator (Delta) — variação vs. período anterior.
 * A cor depende da direção DESEJÁVEL da métrica (CPA subindo = negativo), e o ícone + sinal
 * garantem leitura sem depender de cor.
 */
export function Delta({ current, previous, better = "up", size = "sm" }: { current: number; previous: number; better?: "up" | "down" | "neutral"; size?: "xs" | "sm" }) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return <span className="t-caption">—</span>;
  const ratio = (current - previous) / Math.abs(previous);
  const flat = Math.abs(ratio) < 0.005;
  const good = better === "neutral" ? null : (ratio > 0) === (better === "up");
  const color = flat || good === null ? "text-text-muted" : good ? "text-positive" : "text-negative";
  const Icon = flat ? Minus : ratio > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("num inline-flex items-center gap-0.5 font-bold", size === "xs" ? "text-caption" : "text-secondary", color)}>
      <Icon className={size === "xs" ? "size-3" : "size-3.5"} strokeWidth={2.5} aria-hidden />
      {flat ? "0,0%" : formatDelta(ratio)}
    </span>
  );
}

export interface KpiItem {
  id: string;
  label: string;
  value: number;
  previous?: number;
  format: MetricFormat;
  better?: "up" | "down" | "neutral";
  hint?: string;
  spark?: number[];
}

/**
 * KpiStrip — faixa contínua de indicadores (grade sem gap, divisores de 1px).
 * Herdado da referência funcional; o primeiro item pode ser "hero" (valor maior).
 */
export function KpiStrip({ items, loading, hero = true, className }: { items: KpiItem[]; loading?: boolean; hero?: boolean; className?: string }) {
  return (
    <div className={cn("panel grid overflow-hidden", "grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6", className)}>
      {items.map((k, i) => (
        <div key={k.id} className={cn("relative flex min-h-[112px] flex-col justify-between gap-3 p-4", "border-line [box-shadow:inset_-1px_-1px_0_var(--line)]")}>
          <div className="flex items-center justify-between gap-2">
            {k.hint ? (
              <Tooltip content={k.hint}><span tabIndex={0} className="t-label cursor-help decoration-dotted underline-offset-4 hover:underline">{k.label}</span></Tooltip>
            ) : (
              <span className="t-label">{k.label}</span>
            )}
            {i === 0 && hero && <span className="size-1.5 rounded-full bg-accent" aria-hidden />}
          </div>
          {loading ? (
            <div className="flex flex-col gap-2"><Skeleton className="h-7 w-28" /><Skeleton className="h-3.5 w-16" /></div>
          ) : (
            <div className="flex items-end justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className={cn("num truncate font-bold text-text", i === 0 && hero ? "text-kpi 2xl:text-kpi-lg" : "text-kpi")}>{formatValue(k.value, k.format)}</span>
                <span className="flex items-center gap-1.5">
                  {k.previous !== undefined && <Delta current={k.value} previous={k.previous} better={k.better} />}
                  <span className="t-caption">vs. anterior</span>
                </span>
              </div>
              {k.spark && <Sparkline data={k.spark} className="h-9 w-14 shrink-0 sm:w-20" />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** MetricCard — indicador isolado com contexto (meta, progresso ou nota). */
export function MetricCard({ label, value, format, previous, better, footer, icon, className }: {
  label: string; value: number; format: MetricFormat; previous?: number; better?: "up" | "down" | "neutral"; footer?: ReactNode; icon?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("panel flex flex-col gap-3 p-4", className)}>
      <div className="flex items-center gap-2">
        {icon && <span className="grid size-7 place-items-center rounded-md bg-surface-2 text-text-muted [&_svg]:size-3.5">{icon}</span>}
        <span className="t-label">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="num text-kpi font-bold">{formatValue(value, format)}</span>
        {previous !== undefined && <Delta current={value} previous={previous} better={better} />}
      </div>
      {footer && <div className="border-t border-line-soft pt-3">{footer}</div>}
    </div>
  );
}

/** ProgressIndicator — consumo de orçamento, meta atingida, limite. */
export function Progress({ value, max = 1, tone = "accent", label, ariaLabel, showValue, size = "md" }: {
  value: number; max?: number; tone?: "accent" | "positive" | "warning" | "negative" | "neutral"; label?: string; ariaLabel?: string; showValue?: boolean; size?: "sm" | "md";
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const bar = { accent: "bg-accent", positive: "bg-positive", warning: "bg-warning", negative: "bg-negative", neutral: "bg-text-dim" }[tone];
  return (
    <div className="flex w-full flex-col gap-1.5">
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && <span className="t-caption">{label}</span>}
          {showValue && <span className="num text-caption font-bold text-text-soft">{Math.round(pct * 100)}%</span>}
        </div>
      )}
      <div role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={ariaLabel ?? label} className={cn("w-full overflow-hidden rounded-full bg-bar-idle", size === "sm" ? "h-1" : "h-1.5")}>
        <div className={cn("h-full rounded-full transition-[width] duration-500 ease-enter", bar)} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

/** Sparkline — tendência sem eixos. Uma série, cor neutra-ativa. */
export function Sparkline({ data, className, color = "var(--accent-text)" }: { data: number[]; className?: string; color?: string }) {
  const rows = data.map((v, i) => ({ i, v }));
  const gid = `sp-${Math.round(data.reduce((a, b) => a + b, 0)) % 100000}-${data.length}`;
  return (
    <div className={className} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${gid})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
