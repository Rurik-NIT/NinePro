import * as T from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Tabs — troca de visão dentro da mesma página (sublinhado no acento). */
export function Tabs({ value, onValueChange, items, children, className }: {
  value: string;
  onValueChange: (v: string) => void;
  items: { value: string; label: ReactNode; count?: number }[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <T.Root value={value} onValueChange={onValueChange} className={className}>
      <T.List className="flex gap-5 overflow-x-auto border-b border-line">
        {items.map((it) => (
          <T.Trigger
            key={it.value}
            value={it.value}
            className="relative -mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent text-body font-semibold text-text-muted transition-colors hover:text-text data-[state=active]:border-accent data-[state=active]:text-text"
          >
            {it.label}
            {it.count !== undefined && <span className="num font-mono text-[11px] text-text-dim">{it.count}</span>}
          </T.Trigger>
        ))}
      </T.List>
      {children}
    </T.Root>
  );
}
export const TabPanel = ({ value, children, className }: { value: string; children: ReactNode; className?: string }) => (
  <T.Content value={value} className={cn("outline-none", className)}>{children}</T.Content>
);

/** SegmentedControl — alternância curta e exclusiva (período, granularidade, visualização). */
export function SegmentedControl<V extends string>({ value, onValueChange, options, size = "md", ariaLabel }: {
  value: V;
  onValueChange: (v: V) => void;
  options: { value: V; label: ReactNode; icon?: ReactNode; title?: string }[];
  size?: "sm" | "md";
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex rounded-md border border-line bg-surface-2 p-0.5", size === "sm" ? "h-control-sm" : "h-control")}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            aria-label={o.title}
            onClick={() => onValueChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-2.5 font-semibold transition-colors [&_svg]:size-3.5",
              size === "sm" ? "text-caption" : "text-secondary",
              active ? "bg-raised text-text shadow-sm ring-1 ring-line" : "text-text-muted hover:text-text",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
