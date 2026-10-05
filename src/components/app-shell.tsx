import { useEffect, useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Activity01Icon,
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle03Icon,
  ComputerTerminal02Icon,
  Database01Icon,
  GridIcon,
  Layers01Icon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PlusSignIcon,
  Search01Icon,
  Settings01Icon,
  WorkflowIcon,
} from "@hugeicons/core-free-icons"

export type IconName =
  | "grid" | "pipeline" | "activity" | "settings" | "search" | "database" | "layers" | "more" | "panelLeft" | "panelRight" | "pulse" | "plus" | "check" | "terminal" | "warning" | "arrow"

export function Icon({ name }: { name: IconName }) {
  const icons = {
    grid: GridIcon,
    pipeline: WorkflowIcon,
    activity: Activity01Icon,
    pulse: Activity01Icon,
    settings: Settings01Icon,
    search: Search01Icon,
    database: Database01Icon,
    layers: Layers01Icon,
    more: MoreHorizontalIcon,
    panelLeft: PanelLeftCloseIcon,
    panelRight: PanelRightCloseIcon,
    plus: PlusSignIcon,
    check: CheckmarkCircle03Icon,
    terminal: ComputerTerminal02Icon,
    warning: Alert02Icon,
    arrow: ArrowRight01Icon,
  } as const

  return <HugeiconsIcon icon={icons[name]} size={16} color="currentColor" strokeWidth={1.5} />
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
            <HugeiconsIcon
              icon={collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
            />
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
