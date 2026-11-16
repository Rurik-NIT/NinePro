import * as CheckboxP from "@radix-ui/react-checkbox";
import * as RadioP from "@radix-ui/react-radio-group";
import * as SwitchP from "@radix-ui/react-switch";
import { Check, Minus } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
  ariaLabel,
}: {
  checked: boolean | "indeterminate";
  onCheckedChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-2.5", disabled && "opacity-50", className)}>
      <CheckboxP.Root
        id={id}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-xs border border-line-strong bg-surface transition-colors hover:border-text-dim data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent"
      >
        <CheckboxP.Indicator className="text-accent-ink">
          {checked === "indeterminate" ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
        </CheckboxP.Indicator>
      </CheckboxP.Root>
      {(label || description) && (
        <label htmlFor={id} className="flex cursor-pointer flex-col gap-0.5">
          {label && <span className="text-body text-text">{label}</span>}
          {description && <span className="t-secondary">{description}</span>}
        </label>
      )}
    </div>
  );
}

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export function RadioGroup<T extends string>({
  value,
  onValueChange,
  options,
  className,
  label,
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: RadioOption<T>[];
  className?: string;
  label: string;
}) {
  const gid = useId();
  return (
    <RadioP.Root aria-label={label} value={value} onValueChange={(v) => onValueChange(v as T)} className={cn("flex flex-col gap-2.5", className)}>
      {options.map((o) => {
        const id = `${gid}-${o.value}`;
        return (
          <div key={o.value} className={cn("flex items-start gap-2.5", o.disabled && "opacity-50")}>
            <RadioP.Item
              id={id}
              value={o.value}
              disabled={o.disabled}
              className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-line-strong bg-surface hover:border-text-dim data-[state=checked]:border-accent"
            >
              <RadioP.Indicator className="size-2 rounded-full bg-accent" />
            </RadioP.Item>
            <label htmlFor={id} className="flex cursor-pointer flex-col gap-0.5">
              <span className="text-body">{o.label}</span>
              {o.description && <span className="t-secondary">{o.description}</span>}
            </label>
          </div>
        );
      })}
    </RadioP.Root>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  size = "md",
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  const id = useId();
  const track = size === "sm" ? "h-4 w-7" : "h-5 w-9";
  const thumb = size === "sm" ? "size-3 data-[state=checked]:translate-x-3" : "size-4 data-[state=checked]:translate-x-4";
  const sw = (
    <SwitchP.Root
      id={id}
      checked={checked}
      disabled={disabled}
      aria-label={label ? undefined : ariaLabel}
      onCheckedChange={onCheckedChange}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full bg-line-strong p-0.5 transition-colors duration-150 data-[state=checked]:bg-accent disabled:opacity-50",
        track,
      )}
    >
      <SwitchP.Thumb
        className={cn("block rounded-full bg-text shadow-sm transition-transform duration-150 ease-enter data-[state=checked]:bg-accent-ink", thumb)}
      />
    </SwitchP.Root>
  );
  if (!label) return sw;
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="flex cursor-pointer flex-col gap-0.5">
        <span className="text-body">{label}</span>
        {description && <span className="t-secondary">{description}</span>}
      </label>
      {sw}
    </div>
  );
}
