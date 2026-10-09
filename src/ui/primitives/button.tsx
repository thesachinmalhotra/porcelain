import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react"

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger-ghost"
type ButtonSize = "sm" | "md"

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "sm", loading = false, disabled, className = "", children, ...props }, ref) {
  const classes = ["button", `button-${variant}`, `button-${size}`, className].filter(Boolean).join(" ")
  return <button {...props} ref={ref} className={classes} type={props.type ?? "button"} disabled={disabled || loading} aria-busy={loading || undefined}>{loading ? "Working…" : children}</button>
})

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  size?: ButtonSize
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, size = "sm", disabled, className = "", children, ...props }, ref) {
  const classes = ["icon-button", `icon-button-${size}`, className].filter(Boolean).join(" ")
  return <button {...props} ref={ref} className={classes} type={props.type ?? "button"} disabled={disabled} aria-label={label}>{children}</button>
})
