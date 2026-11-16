import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold select-none transition-[background,color,border-color,box-shadow,transform] duration-150 ease-enter active:translate-y-px disabled:opacity-45 disabled:active:translate-y-0";

const variants: Record<ButtonVariant, string> = {
  /* Primário = acento. Regra: no máximo um por área de tela. */
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary: "bg-soft text-text hover:bg-surface-2 hover:ring-1 hover:ring-line",
  outline: "border border-line bg-surface text-text hover:bg-surface-2 hover:border-line-strong",
  ghost: "text-text-soft hover:text-text hover:bg-soft",
  danger: "bg-negative-tint text-negative hover:ring-1 hover:ring-negative",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-control-sm px-2.5 text-secondary rounded-sm [&_svg]:size-3.5",
  md: "h-control px-3 text-body rounded-md [&_svg]:size-4",
  lg: "h-control-lg px-4 text-body rounded-md [&_svg]:size-4",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "outline", size = "md", icon, iconRight, loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

/** Classes de botão para outros elementos (ex.: <Link>) — evita <a> dentro de <button>. */
export const buttonClasses = (variant: ButtonVariant = "outline", size: ButtonSize = "md", className?: string) =>
  cn(base, variants[variant], sizes[size], className);

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obrigatório: botões só com ícone precisam de nome acessível. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "ghost", size = "md", className, children, type = "button", ...rest },
  ref,
) {
  const dim =
    size === "sm"
      ? "size-control-sm rounded-sm [&_svg]:size-3.5"
      : size === "lg"
        ? "size-control-lg rounded-md [&_svg]:size-[18px]"
        : "size-control rounded-md [&_svg]:size-4";
  return (
    <button ref={ref} type={type} aria-label={label} className={cn(base, variants[variant], dim, "px-0", className)} {...rest}>
      {children}
    </button>
  );
});
