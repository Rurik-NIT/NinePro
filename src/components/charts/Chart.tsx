import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatValue, type MetricFormat } from "@/lib/format";

/**
 * ChartContainer — painel padrão de gráfico: título, subtítulo que descreve o recorte,
 * ações (seletor de métrica, granularidade) e legenda acima do plot.
 */
export function ChartContainer({ title, subtitle, actions, legend, children, footer, className, bodyClassName }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; legend?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={cn("panel flex min-w-0 flex-col", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pb-2 pt-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="t-title">{title}</h3>
          {subtitle && <p className="t-secondary">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      {legend && <div className="px-4 pb-1">{legend}</div>}
      <div className={cn("min-h-0 flex-1 px-2 pb-3", bodyClassName)}>{children}</div>
      {footer && <footer className="border-t border-line-soft px-4 py-3">{footer}</footer>}
    </section>
  );
}

export interface LegendItem { id: string; label: string; color: string; value?: string; dashed?: boolean }

/** ChartLegend — sempre presente com ≥ 2 séries; clicável para isolar série. Texto em tinta de texto, nunca na cor da série. */
export function ChartLegend({ items, hidden, onToggle }: { items: LegendItem[]; hidden?: Set<string>; onToggle?: (id: string) => void }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => {
        const off = hidden?.has(it.id);
        const Tag = onToggle ? "button" : "span";
        return (
          <li key={it.id}>
            <Tag
              {...(onToggle ? { type: "button" as const, onClick: () => onToggle(it.id), "aria-pressed": !off } : {})}
              className={cn("inline-flex items-center gap-2 text-secondary font-semibold text-text-soft transition-opacity", off && "opacity-40", onToggle && "hover:text-text")}
            >
              {it.dashed ? (
                <span className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: it.color }} aria-hidden />
              ) : (
                <span className="size-2.5 rounded-[3px]" style={{ background: it.color }} aria-hidden />
              )}
              {it.label}
              {it.value && <span className="num text-text-muted">{it.value}</span>}
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

interface TooltipPayload { dataKey?: string | number; name?: string | number; value?: number; color?: string; stroke?: string; fill?: string; payload?: Record<string, unknown> }

/** Tooltip de gráfico com tokens. Uso: <Tooltip content={<ChartTooltip ... />} /> */
export function ChartTooltip({ active, payload, label, format, labelFormatter, names }: {
  active?: boolean; payload?: TooltipPayload[]; label?: string | number; format: MetricFormat | ((key: string) => MetricFormat);
  labelFormatter?: (l: string | number) => string; names?: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[180px] rounded-md border border-line bg-overlay p-2.5 shadow-pop">
      {label !== undefined && <p className="t-label mb-1.5">{labelFormatter ? labelFormatter(label) : label}</p>}
      <ul className="flex flex-col gap-1">
        {payload.map((p) => {
          const key = String(p.dataKey ?? p.name);
          const f = typeof format === "function" ? format(key) : format;
          return (
            <li key={key} className="flex items-center justify-between gap-4 text-secondary">
              <span className="flex items-center gap-2 text-text-soft">
                <span className="size-2 rounded-[2px]" style={{ background: p.color ?? p.stroke ?? p.fill }} />
                {names?.[key] ?? p.name}
              </span>
              <span className="num font-bold text-text">{formatValue(p.value ?? NaN, f)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Propriedades comuns de eixo — recessivos, sem linha de eixo, mono pequeno. */
export const axisProps = {
  tick: { fill: "var(--chart-axis)", fontSize: 11, fontFamily: "var(--font-mono)" },
  tickLine: false,
  axisLine: false,
} as const;
export const gridProps = { stroke: "var(--chart-grid)", strokeDasharray: "0", vertical: false } as const;
