import { useEffect, useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"

export type IconName =
  | "grid" | "pipeline" | "activity" | "settings" | "search" | "plus" | "chevron"
  | "database" | "pulse" | "layers" | "terminal" | "check" | "warning" | "more" | "arrow"

export function Icon({ name }: { name: IconName }) {
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
    layers: "m4 7 8-4 8 4-8 4-8-4Zm0 5 8 4 8-4M4 17l8 4 8-4",
    terminal: "m5 7 4 5-4 5m7 0h7",
    check: "m5 12 4 4L19 6",
    warning: "M12 4 21 20H3L12 4Zm0 6v4m0 3h.01",
    more: "M6 12h.01M12 12h.01M18 12h.01",
    arrow: "M5 12h13m-5-5 5 5-5 5",
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  )
}

const navGroups = [
  {
    label: "Operate",
    items: [
      { label: "Overview", icon: "grid" as const, to: "/overview" },
      { label: "Pipelines", icon: "pipeline" as const, to: "/pipelines" },
      { label: "Runtime", icon: "pulse" as const, to: "/runtime" },
      { label: "Activity", icon: "activity" as const, to: "/activity" },
    ],
  },
  {
    label: "Discover",
    items: [
      { label: "Components", icon: "layers" as const, to: "/components" },
      { label: "Event schemas", icon: "database" as const, to: "/schemas" },
    ],
  },
] as const

export function AppShell({ children }: Readonly<{ children?: ReactNode }>) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("porcelain.sidebar.collapsed") === "true")
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value
      window.localStorage.setItem("porcelain.sidebar.collapsed", String(next))
      return next
    })
  }

  return (
    <div className={"app-shell" + (collapsed ? " sidebar-collapsed" : "")}>
      <aside className="app-sidebar">
        <div className="sidebar-topbar">
          <div className="workspace-identity">
            <span className="brand-mark">P</span>
            <span className="workspace-copy">
              <strong>Porcelain</strong>
              <small>Connect workspace</small>
            </span>
          </div>
          <button
            className="sidebar-collapse"
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            <Icon name="chevron" />
          </button>
        </div>

        <Link className="search-button" to="/pipelines" title={collapsed ? "Find a pipeline" : undefined}>
          <Icon name="search" />
          <span className="search-label">Find a pipeline</span>
        </Link>

        <nav aria-label="Primary navigation" className="app-navigation">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-label">{group.label}</p>
              {group.items.map((item) => (
                <Link
                  aria-label={collapsed ? item.label : undefined}
                  activeProps={{ className: "nav-item active" }}
                  inactiveProps={{ className: "nav-item" }}
                  key={item.label}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon name={item.icon} />
                  <span className="nav-item-label">{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link className="connect-indicator" to="/runtime" title={collapsed ? "Redpanda Connect - Local runtime" : undefined}>
            <span className="status-dot online" />
            <span className="connect-copy">
              <strong>Redpanda Connect</strong>
              <small>Local runtime</small>
            </span>
            <span className="runtime-badge">Live</span>
          </Link>

          <Link activeProps={{ className: "nav-item active" }} inactiveProps={{ className: "nav-item" }} to="/settings" title={collapsed ? "Settings" : undefined}>
            <Icon name="settings" />
            <span className="nav-item-label">Settings</span>
          </Link>

          <div className="user-row">
            <span className="avatar">SM</span>
            <span className="user-copy">
              <strong>Sachin Malhotra</strong>
              <small>Owner</small>
            </span>
          </div>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  )
}
