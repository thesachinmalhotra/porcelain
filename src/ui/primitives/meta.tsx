import type { HTMLAttributes, ReactNode } from "react"

type Tone = "neutral" | "success" | "warning" | "danger"

export function Badge({ tone = "neutral", className = "", children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; children?: ReactNode }) {
  return <span {...props} className={["ui-badge", `ui-badge-${tone}`, className].filter(Boolean).join(" ")}>{children}</span>
}

export function Status({ tone, label, className = "" }: { tone: Tone; label: string; className?: string }) {
  return <span className={["ui-status", `ui-status-${tone}`, className].filter(Boolean).join(" ")}><span className="status-dot" aria-hidden="true" />{label}</span>
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={["ui-divider", className].filter(Boolean).join(" ")} role="separator" />
}

export function Avatar({ label, className = "" }: { label: string; className?: string }) {
  return <span className={["avatar", "ui-avatar", className].filter(Boolean).join(" ")} aria-label={label}>{label}</span>
}

export function KeyboardShortcut({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <kbd className={["ui-kbd", className].filter(Boolean).join(" ")}>{children}</kbd>
}
