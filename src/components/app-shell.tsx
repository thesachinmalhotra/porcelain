import { useEffect, useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { AirplayIcon } from "@phosphor-icons/react/dist/csr/Airplay"
import { BorderBeam } from "border-beam"
import { ListDashesIcon } from "@phosphor-icons/react/dist/csr/ListDashes"
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight"
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle"
import { DatabaseIcon } from "@phosphor-icons/react/dist/csr/Database"
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree"
import { GearIcon } from "@phosphor-icons/react/dist/csr/Gear"
import { FlowArrowIcon } from "@phosphor-icons/react/dist/csr/FlowArrow"
import { CompassIcon } from "@phosphor-icons/react/dist/csr/Compass"
import { StackIcon } from "@phosphor-icons/react/dist/csr/Stack"
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass"
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus"
import { SidebarSimpleIcon } from "@phosphor-icons/react/dist/csr/SidebarSimple"
import { TerminalWindowIcon } from "@phosphor-icons/react/dist/csr/TerminalWindow"
import { WarningCircleIcon } from "@phosphor-icons/react/dist/csr/WarningCircle"

export type IconName =
  | "grid" | "pipeline" | "activity" | "settings" | "search" | "database" | "layers" | "more" | "panelLeft" | "panelRight" | "pulse" | "plus" | "check" | "terminal" | "warning" | "arrow"

function ConnectedRuntimeBeam({ children }: Readonly<{ children: ReactNode }>) {
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    setSupported(typeof window.matchMedia === "function")
  }, [])

  if (!supported) return <>{children}</>

  return (
    <BorderBeam
      className="connect-beam"
      size="md"
      colorVariant="colorful"
      theme="dark"
      strength={0.65}
      duration={4.5}
    >
      {children}
    </BorderBeam>
  )
}

export function Icon({ name }: { name: IconName }) {
  const icons = {
    grid: CompassIcon,
    pipeline: FlowArrowIcon,
    activity: ListDashesIcon,
    pulse: AirplayIcon,
    settings: GearIcon,
    search: MagnifyingGlassIcon,
    database: DatabaseIcon,
    layers: StackIcon,
    more: DotsThreeIcon,
    panelLeft: SidebarSimpleIcon,
    panelRight: SidebarSimpleIcon,
    plus: PlusIcon,
    check: CheckCircleIcon,
    terminal: TerminalWindowIcon,
    warning: WarningCircleIcon,
    arrow: ArrowRightIcon,
  } as const

  const IconComponent = icons[name]
  return <IconComponent
    size={16}
    color="currentColor"
    weight="regular"
    mirrored={name === "panelRight"}
    aria-hidden="true"
  />
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
            <img className="brand-logo" src="/porcelain.svg" alt="Porcelain" />
            <img className="brand-wordmark" src="/porcelain-wordmark.svg" alt="Porcelain" />
          </div>
          <button
            className="sidebar-collapse"
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            {collapsed ? (
              <img className="brand-logo" src="/porcelain.svg" alt="" aria-hidden="true" />
            ) : (
              <SidebarSimpleIcon size={16} color="currentColor" weight="regular" aria-hidden="true" />
            )}
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
          <ConnectedRuntimeBeam>
            <Link className="connect-indicator" to="/runtime" title={collapsed ? "Redpanda Connect - Local runtime" : undefined}>
              <span className="status-dot online" />
              <span className="connect-copy">
                <strong>Redpanda Connect</strong>
                <small>Local runtime</small>
              </span>
              <span className="runtime-badge">Live</span>
            </Link>
          </ConnectedRuntimeBeam>

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
