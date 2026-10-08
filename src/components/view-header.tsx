import type { ReactNode } from "react"

export function ViewHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
  meta?: ReactNode
}) {
  return (
    <header className="view-header">
      <div className="view-header-copy">
        <div className="view-header-topline">
          <span className="eyebrow">{eyebrow}</span>
          {meta}
        </div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="view-header-actions">{actions}</div>}
    </header>
  )
}
