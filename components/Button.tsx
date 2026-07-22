import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "soft" | "ghost" | "positive";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-linear-to-br from-primary to-primary-strong text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:brightness-105",
  positive:
    "bg-linear-to-br from-positive to-emerald-500 text-white shadow-lg shadow-positive/25 hover:brightness-105",
  soft: "bg-primary-soft text-primary hover:brightness-95",
  ghost: "bg-surface-2 text-foreground hover:bg-border",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-7 text-base",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  className = "",
  ...props
}: CommonProps & ComponentProps<"button">) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  fullWidth,
  className = "",
  ...props
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link
      className={`${base} ${variants[variant]} ${sizes[size]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      {...props}
    />
  );
}
