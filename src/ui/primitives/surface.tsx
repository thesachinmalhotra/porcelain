import type { HTMLAttributes, ReactNode } from "react"

export function Panel({ as: Component = "section", className = "", children, ...props }: HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "aside" | "article"; children?: ReactNode }) {
  return <Component {...props} className={["panel", className].filter(Boolean).join(" ")}>{children}</Component>
}
