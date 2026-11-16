import * as DM from "@radix-ui/react-dropdown-menu";
import * as CM from "@radix-ui/react-context-menu";
import * as SelectP from "@radix-ui/react-select";
import * as PopoverP from "@radix-ui/react-popover";
import * as TooltipP from "@radix-ui/react-tooltip";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Checkbox } from "./Controls";
import { fieldBase } from "./Input";

/* Superfície comum de todos os overlays flutuantes */
export const popSurface =
  "z-50 min-w-[180px] overflow-hidden rounded-lg border border-line bg-overlay p-1 text-body text-text shadow-pop animate-pop-in";
const itemCls =
  "relative flex min-h-8 cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 py-1.5 outline-none transition-colors data-[highlighted]:bg-soft data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-text-muted";

/* ---------------- Dropdown ---------------- */
export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({ children, align = "start", className, sideOffset = 6 }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string; sideOffset?: number }) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={sideOffset} className={cn(popSurface, className)}>
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function MenuItem({ children, icon, shortcut, danger, onSelect, disabled }: { children: ReactNode; icon?: ReactNode; shortcut?: string; danger?: boolean; onSelect?: () => void; disabled?: boolean }) {
  return (
    <DM.Item disabled={disabled} onSelect={onSelect} className={cn(itemCls, danger && "text-negative [&_svg]:!text-negative")}>
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="font-mono text-[11px] text-text-dim">{shortcut}</span>}
    </DM.Item>
  );
}

export function MenuCheckItem({ children, checked, onCheckedChange }: { children: ReactNode; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <DM.CheckboxItem checked={checked} onCheckedChange={onCheckedChange} onSelect={(e) => e.preventDefault()} className={cn(itemCls, "pl-8")}>
      <DM.ItemIndicator className="absolute left-2.5">
        <Check className="!text-accent-text" />
      </DM.ItemIndicator>
      {children}
    </DM.CheckboxItem>
  );
}

export function MenuRadioGroup({ value, onValueChange, options }: { value: string; onValueChange: (v: string) => void; options: { value: string; label: ReactNode }[] }) {
  return (
    <DM.RadioGroup value={value} onValueChange={onValueChange}>
      {options.map((o) => (
        <DM.RadioItem key={o.value} value={o.value} className={cn(itemCls, "pl-8")}>
          <DM.ItemIndicator className="absolute left-3 size-1.5 rounded-full bg-accent" />
          {o.label}
        </DM.RadioItem>
      ))}
    </DM.RadioGroup>
  );
}

export function MenuSub({ label, icon, children }: { label: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <DM.Sub>
      <DM.SubTrigger className={cn(itemCls, "data-[state=open]:bg-soft")}>
        {icon}
        <span className="flex-1">{label}</span>
        <ChevronRight className="!size-3.5" />
      </DM.SubTrigger>
      <DM.Portal>
        <DM.SubContent sideOffset={6} className={popSurface}>
          {children}
        </DM.SubContent>
      </DM.Portal>
    </DM.Sub>
  );
}

export const MenuLabel = ({ children }: { children: ReactNode }) => <DM.Label className="t-label px-2.5 pb-1 pt-2">{children}</DM.Label>;
export const MenuSeparator = () => <DM.Separator className="-mx-1 my-1 h-px bg-line" />;

/* ---------------- Context menu ---------------- */
export function ContextMenu({ children, items }: { children: ReactNode; items: { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; separatorBefore?: boolean }[] }) {
  return (
    <CM.Root>
      <CM.Trigger asChild>{children}</CM.Trigger>
      <CM.Portal>
        <CM.Content className={popSurface}>
          {items.map((it) => (
            <div key={it.label}>
              {it.separatorBefore && <CM.Separator className="-mx-1 my-1 h-px bg-line" />}
              <CM.Item onSelect={it.onSelect} className={cn(itemCls, it.danger && "text-negative [&_svg]:!text-negative")}>
                {it.icon}
                {it.label}
              </CM.Item>
            </div>
          ))}
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  );
}

/* ---------------- Select ---------------- */
export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Selecionar",
  size = "md",
  className,
  ariaLabel,
  id,
  prefix,
  invalid,
}: {
  value?: string;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
  id?: string;
  prefix?: ReactNode;
  invalid?: boolean;
}) {
  return (
    <SelectP.Root value={value} onValueChange={onValueChange}>
      <SelectP.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={cn(
          fieldBase,
          "inline-flex items-center justify-between gap-2 px-3 text-left data-[placeholder]:text-text-dim [&>span]:truncate",
          size === "sm" ? "h-control-sm text-secondary" : "h-control text-body",
          className,
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {prefix && <span className="text-text-dim [&_svg]:size-4">{prefix}</span>}
          <SelectP.Value placeholder={placeholder} />
        </span>
        <SelectP.Icon>
          <ChevronDown className="size-4 text-text-dim" />
        </SelectP.Icon>
      </SelectP.Trigger>
      <SelectP.Portal>
        <SelectP.Content position="popper" sideOffset={6} className={cn(popSurface, "max-h-[320px] w-[var(--radix-select-trigger-width)]")}>
          <SelectP.Viewport>
            {options.map((o) => (
              <SelectP.Item key={o.value} value={o.value} disabled={o.disabled} className={cn(itemCls, "pr-8")}>
                {o.icon}
                <SelectP.ItemText>{o.label}</SelectP.ItemText>
                <SelectP.ItemIndicator className="absolute right-2.5">
                  <Check className="!text-accent-text" />
                </SelectP.ItemIndicator>
              </SelectP.Item>
            ))}
          </SelectP.Viewport>
        </SelectP.Content>
      </SelectP.Portal>
    </SelectP.Root>
  );
}

/* ---------------- Multi select ---------------- */
export function MultiSelect({
  label,
  options,
  value,
  onValueChange,
  size = "md",
  icon,
}: {
  label: string;
  options: SelectOption[];
  value: string[];
  onValueChange: (v: string[]) => void;
  size?: "sm" | "md";
  icon?: ReactNode;
}) {
  const all = value.length === 0 || value.length === options.length;
  const summary = all ? `Todas` : value.length === 1 ? options.find((o) => o.value === value[0])?.label : `${value.length} selecionadas`;
  const toggle = (v: string) => onValueChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <PopoverP.Root>
      <PopoverP.Trigger
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 text-text transition-colors hover:border-line-strong data-[state=open]:border-line-strong",
          size === "sm" ? "h-control-sm text-secondary" : "h-control text-body",
        )}
      >
        {icon && <span className="text-text-dim [&_svg]:size-4">{icon}</span>}
        <span className="text-text-muted">{label}:</span>
        <span className="font-semibold">{summary}</span>
        {!all && <span className="num rounded-xs bg-accent-tint px-1 font-mono text-[10.5px] text-accent-text">{value.length}</span>}
        <ChevronDown className="size-4 text-text-dim" />
      </PopoverP.Trigger>
      <PopoverP.Portal>
        <PopoverP.Content align="start" sideOffset={6} className={cn(popSurface, "w-64 p-2")}>
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="t-label">{label}</span>
            <button type="button" className="text-caption font-semibold text-accent-text hover:underline" onClick={() => onValueChange([])}>
              Limpar
            </button>
          </div>
          <div className="flex flex-col gap-2.5 px-1 py-1">
            {options.map((o) => (
              <Checkbox key={o.value} checked={value.includes(o.value)} onCheckedChange={() => toggle(o.value)} label={<span className="flex items-center gap-2">{o.icon}{o.label}</span>} />
            ))}
          </div>
        </PopoverP.Content>
      </PopoverP.Portal>
    </PopoverP.Root>
  );
}

/* ---------------- Popover ---------------- */
export const Popover = PopoverP.Root;
export const PopoverTrigger = PopoverP.Trigger;
export function PopoverContent({ children, className, align = "start" }: { children: ReactNode; className?: string; align?: "start" | "end" | "center" }) {
  return (
    <PopoverP.Portal>
      <PopoverP.Content align={align} sideOffset={6} className={cn(popSurface, "p-0", className)}>
        {children}
      </PopoverP.Content>
    </PopoverP.Portal>
  );
}
export const PopoverClose = PopoverP.Close;

/* ---------------- Tooltip ---------------- */
export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <TooltipP.Provider delayDuration={250} skipDelayDuration={100}>
    {children}
  </TooltipP.Provider>
);

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipP.Root>
      <TooltipP.Trigger asChild>{children}</TooltipP.Trigger>
      <TooltipP.Portal>
        <TooltipP.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-[260px] rounded-sm bg-text px-2 py-1 text-caption font-semibold text-text-inverse shadow-pop animate-fade-in"
        >
          {content}
        </TooltipP.Content>
      </TooltipP.Portal>
    </TooltipP.Root>
  );
}
