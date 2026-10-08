import type { ButtonHTMLAttributes, ReactNode } from "react"

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger-ghost"
type ButtonSize = "sm" | "md"

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  children?: ReactNode
}

export function Button({ variant = "secondary", size = "sm", loading = false, disabled, className = "", children, ...props }: ButtonProps) {
  const classes = ["button", `button-${variant}`, `button-${size}`, className].filter(Boolean).join(" ")
  return <button {...props} className={classes} type={props.type ?? "button"} disabled={disabled || loading} aria-busy={loading || undefined}>{loading ? "Working…" : children}</button>
}

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  size?: ButtonSize
}

export function IconButton({ label, size = "sm", disabled, className = "", children, ...props }: IconButtonProps) {
  const classes = ["icon-button", `icon-button-${size}`, className].filter(Boolean).join(" ")
  return <button {...props} className={classes} type={props.type ?? "button"} disabled={disabled} aria-label={label}>{children}</button>
}
