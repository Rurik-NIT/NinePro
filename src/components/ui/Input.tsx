import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export const fieldBase =
  "w-full bg-field text-text placeholder:text-text-dim border border-field-line rounded-md transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:outline-none focus:border-accent-line-strong focus:ring-[3px] focus:ring-accent-tint disabled:opacity-50 disabled:cursor-not-allowed aria-[invalid=true]:border-negative";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  size?: "sm" | "md" | "lg";
  prefix?: ReactNode;
  suffix?: ReactNode;
  invalid?: boolean;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", prefix, suffix, invalid, className, wrapperClassName, ...rest },
  ref,
) {
  const h = size === "sm" ? "h-control-sm text-secondary" : size === "lg" ? "h-control-lg text-body" : "h-control text-body";
  return (
    <div className={cn("relative flex items-center", wrapperClassName)}>
      {prefix && (
        <span className="pointer-events-none absolute left-3 flex items-center text-text-dim [&_svg]:size-4">{prefix}</span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(fieldBase, h, "px-3", prefix ? "pl-9" : "", suffix ? "pr-9" : "", className)}
        {...rest}
      />
      {suffix && <span className="absolute right-2.5 flex items-center text-text-dim [&_svg]:size-4">{suffix}</span>}
    </div>
  );
});

export interface SearchInputProps extends Omit<InputProps, "prefix" | "onChange" | "value" | "suffix"> {
  value: string;
  onValueChange: (v: string) => void;
}

export function SearchInput({ value, onValueChange, placeholder = "Buscar…", ...rest }: SearchInputProps) {
  return (
    <Input
      {...rest}
      type="search"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onValueChange("");
      }}
      prefix={<Search />}
      suffix={
        value ? (
          <button
            type="button"
            aria-label="Limpar busca"
            className="grid place-items-center rounded-sm text-text-dim hover:text-text"
            onClick={() => onValueChange("")}
          >
            <X />
          </button>
        ) : undefined
      }
    />
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, showCount, maxLength, value, ...rest },
  ref,
) {
  const len = typeof value === "string" ? value.length : 0;
  return (
    <div className="relative">
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        maxLength={maxLength}
        value={value}
        className={cn(fieldBase, "min-h-[88px] resize-y px-3 py-2 text-body", showCount ? "pb-6" : "", className)}
        {...rest}
      />
      {showCount && maxLength ? (
        <span className="num t-caption pointer-events-none absolute bottom-2 right-3">
          {len}/{maxLength}
        </span>
      ) : null}
    </div>
  );
});

/** Field: rótulo + controle + ajuda/erro, com ids conectados para leitores de tela. */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string; invalid?: boolean }) => ReactNode;
}) {
  const id = useId();
  const descId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-secondary font-semibold text-text-soft">
        {label}
        {required && (
          <span className="ml-0.5 text-negative" aria-hidden>
            *
          </span>
        )}
      </label>
      {children({ id, "aria-describedby": descId, invalid: !!error })}
      {(error || hint) && (
        <p id={descId} className={cn("text-caption", error ? "text-negative" : "text-text-dim")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
