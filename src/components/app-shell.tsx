import type { ReactNode } from "react"

type IconName = "grid" | "pipeline" | "activity" | "settings" | "search" | "plus" | "chevron" | "database" | "pulse"

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    pipeline: "M5 5h4v4H5zM15 15h4v4h-4zM9 7h6m0 0v8m0-8 3 3M9 17H7m0 0v-5m0 0 3-3",
    activity: "M4 16l4-5 3 3 5-7 4 5",
    settings: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM5 12H3m18 0h-2M12 5V3m0 18v-2M6.7 6.7 5.3 5.3m13.4 13.4-1.4-1.4m0-10.6 1.4-1.4M5.3 18.7l1.4-1.4",
    search: "m20 20-4.5-4.5M10.8 17a6.2 6.2 0 1 0 0-12.4 6.2 6.2 0 0 0 0 12.4Z",
    plus: "M12 5v14M5 12h14",
    chevron: "m7 10 5 5 5-5",
    database: "M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Zm0 0v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7m-14 5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5",
    pulse: "M3 12h4l2-7 4 14 2-7h6",
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}

const navItems = [
  { label: "Overview", icon: "grid" as const },
  { label: "Pipelines", icon: "pipeline" as const, active: true },
  { label: "Runtime", icon: "pulse" as const },
  { label: "Activity", icon: "activity" as const },
]

export function AppShell({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="workspace-switcher">
          <div className="brand-mark">P</div>
          <div className="workspace-copy"><h1>Porcelain</h1><span>Workspace</span></div>
          <Icon name="chevron" />
        </div>
        <button className="search-button" type="button"><Icon name="search" /><span>Search</span><kbd>⌘ K</kbd></button>
        <nav aria-label="Primary navigation" className="primary-nav">
          <p className="nav-label">Operate</p>
          {navItems.map((item) => <a className={`nav-item${item.active ? " active" : ""}`} href={item.active ? "#pipelines" : `#${item.label.toLowerCase()}`} key={item.label}><Icon name={item.icon} /><span>{item.label}</span>{item.active && <i />}</a>)}
          <p className="nav-label section-label">Manage</p>
          <a className="nav-item" href="#streams"><Icon name="database" /><span>Connect streams</span></a>
        </nav>
        <div className="sidebar-footer">
          <div className="connect-indicator"><span className="status-dot online" /><div><strong>Redpanda Connect</strong><small>Local runtime</small></div><span className="runtime-badge">Ready</span></div>
          <a className="nav-item" href="#settings"><Icon name="settings" /><span>Settings</span></a>
          <div className="user-row"><span className="avatar">SM</span><div><strong>Sachin Malhotra</strong><small>Owner</small></div><Icon name="chevron" /></div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}

export { Icon }
