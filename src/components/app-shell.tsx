import type { ReactNode } from "react"

export function AppShell({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <main>
      <h1>Porcelain</h1>
      {children}
    </main>
  )
}
