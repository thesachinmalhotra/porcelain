import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { AirplayIcon } from "@phosphor-icons/react/dist/csr/Airplay"
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
import { XIcon } from "@phosphor-icons/react/dist/csr/X"
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft"
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight"
import { Button, IconButton, Input, KeyboardShortcut } from "../ui/primitives"

export type IconName =
  | "grid" | "pipeline" | "activity" | "settings" | "search" | "database" | "layers" | "more" | "panelLeft" | "panelRight" | "pulse" | "plus" | "check" | "terminal" | "warning" | "arrow"

type ShellContext = {
  runtime: { reachable: boolean; ready: boolean }
  pipelines: Array<{ id: string; name: string }>
}

type StaticDestination = {
  type: "destination"
  label: string
  description: string
  group: "Operate" | "Discover" | "Workspace"
  icon: IconName
  to: "/overview" | "/pipelines" | "/runtime" | "/activity" | "/streams" | "/components" | "/schemas" | "/settings"
}

type PipelineDestination = {
  type: "pipeline"
  label: string
  description: string
  group: "Pipelines"
  icon: "pipeline"
  pipelineId: string
}

type CommandDestination = StaticDestination | PipelineDestination

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

const staticDestinations: StaticDestination[] = [
  { type: "destination", label: "Overview", description: "Workspace health and recent activity", group: "Operate", icon: "grid", to: "/overview" },
  { type: "destination", label: "Pipelines", description: "Build and operate Connect pipelines", group: "Operate", icon: "pipeline", to: "/pipelines" },
  { type: "destination", label: "Runtime", description: "Inspect live Connect telemetry", group: "Operate", icon: "pulse", to: "/runtime" },
  { type: "destination", label: "Activity", description: "Review operational events", group: "Operate", icon: "activity", to: "/activity" },
  { type: "destination", label: "Connect streams", description: "Inspect runtime-owned streams", group: "Operate", icon: "database", to: "/streams" },
  { type: "destination", label: "Components", description: "Browse installed Connect capabilities", group: "Discover", icon: "layers", to: "/components" },
  { type: "destination", label: "Event schemas", description: "Review observed component types", group: "Discover", icon: "database", to: "/schemas" },
  { type: "destination", label: "Settings", description: "Configure this workspace", group: "Workspace", icon: "settings", to: "/settings" },
]

function AppTabBar({
  pathname,
  pipelines,
  onOpenCommand,
}: {
  pathname: string
  pipelines: ShellContext["pipelines"]
  onOpenCommand: () => void
}) {
  const pinnedTabs = [
    { label: "Overview", icon: "grid" as const, to: "/overview" as const },
    { label: "Pipelines", icon: "pipeline" as const, to: "/pipelines" as const },
    { label: "Runtime", icon: "pulse" as const, to: "/runtime" as const },
  ]
  const pipelineId = pathname.startsWith("/pipelines/") ? decodeURIComponent(pathname.slice("/pipelines/".length)) : null
  const activePipeline = pipelineId ? pipelines.find((pipeline) => pipeline.id === pipelineId) : undefined
  const contextualDestination = staticDestinations.find((item) => item.to === pathname && !pinnedTabs.some((tab) => tab.to === item.to))

  return <header className="app-tabbar">
    <div className="app-tab-history" aria-label="Navigation history">
      <IconButton label="Go back" onClick={() => window.history.back()}><CaretLeftIcon aria-hidden="true" /></IconButton>
      <IconButton label="Go forward" onClick={() => window.history.forward()}><CaretRightIcon aria-hidden="true" /></IconButton>
    </div>
    <nav className="app-tabs" aria-label="Open views">
      {pinnedTabs.map((tab) => {
        const active = pathname === tab.to
        return <Link className={`app-tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined} key={tab.to} to={tab.to}>
          <Icon name={tab.icon} /><span>{tab.label}</span>
        </Link>
      })}
      {activePipeline ? <Link className="app-tab active" aria-current="page" to="/pipelines/$pipelineId" params={{ pipelineId: activePipeline.id }}>
        <Icon name="pipeline" /><span>{activePipeline.name}</span>
      </Link> : null}
      {contextualDestination ? <Link className="app-tab active" aria-current="page" to={contextualDestination.to}>
        <Icon name={contextualDestination.icon} /><span>{contextualDestination.label}</span>
      </Link> : null}
      <IconButton className="app-tab-add" label="Open another view" onClick={onOpenCommand}><PlusIcon aria-hidden="true" /></IconButton>
    </nav>
  </header>
}

function GlobalCommandMenu({
  open,
  pipelines,
  onClose,
}: {
  open: boolean
  pipelines: ShellContext["pipelines"]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const items = useMemo<CommandDestination[]>(() => [
    ...staticDestinations,
    ...pipelines.map((pipeline) => ({
      type: "pipeline" as const,
      label: pipeline.name,
      description: pipeline.id,
      group: "Pipelines" as const,
      icon: "pipeline" as const,
      pipelineId: pipeline.id,
    })),
  ], [pipelines])
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items
    return items.filter((item) =>
      `${item.label} ${item.description} ${item.group}`.toLowerCase().includes(normalized),
    )
  }, [items, query])

  useEffect(() => {
    if (!open) return
    setQuery("")
    setActiveIndex(0)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, results.length - 1)))
  }, [results.length])

  if (!open) return null

  const openDestination = (item: CommandDestination | undefined) => {
    if (!item) return
    onClose()
    if (item.type === "pipeline") {
      void navigate({ to: "/pipelines/$pipelineId", params: { pipelineId: item.pipelineId } })
      return
    }
    void navigate({ to: item.to })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      openDestination(results[activeIndex])
    } else if (event.key === "Escape") {
      event.preventDefault()
      onClose()
    }
  }

  return <div className="global-command-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="global-command" role="dialog" aria-modal="true" aria-label="Search Porcelain" onMouseDown={(event) => event.stopPropagation()}>
      <div className="global-command-input">
        <Icon name="search" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search pipelines and destinations"
          aria-label="Search pipelines and destinations"
          aria-controls="global-command-results"
          aria-activedescendant={results[activeIndex] ? `global-command-${activeIndex}` : undefined}
        />
        <IconButton className="global-command-close" label="Close search" onClick={onClose}><XIcon aria-hidden="true" /></IconButton>
      </div>
      <div className="global-command-meta"><span>{query ? "Search results" : "Quick access"}</span><span>{results.length}</span></div>
      <div className="global-command-results" id="global-command-results" role="listbox" aria-label="Search results">
        {results.map((item, index) => <Button
          className={`global-command-result${index === activeIndex ? " active" : ""}`}
          variant="ghost"
          role="option"
          aria-selected={index === activeIndex}
          id={`global-command-${index}`}
          key={item.type === "pipeline" ? `pipeline:${item.pipelineId}` : item.to}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => openDestination(item)}
        >
          <span className="global-command-result-icon"><Icon name={item.icon} /></span>
          <span className="global-command-result-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
          <span className="global-command-result-group">{item.group}</span>
          {index === activeIndex ? <KeyboardShortcut>↵</KeyboardShortcut> : null}
        </Button>)}
        {!results.length ? <div className="global-command-empty"><strong>No results</strong><span>Try a pipeline name, destination, or feature.</span></div> : null}
      </div>
      <footer className="global-command-footer">
        <span><KeyboardShortcut>↑</KeyboardShortcut><KeyboardShortcut>↓</KeyboardShortcut> Navigate</span>
        <span><KeyboardShortcut>↵</KeyboardShortcut> Open</span>
        <span><KeyboardShortcut>Esc</KeyboardShortcut> Close</span>
      </footer>
    </section>
  </div>
}

export function AppShell({ children, context }: Readonly<{ children?: ReactNode; context?: ShellContext }>) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const searchTriggerRef = useRef<HTMLButtonElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const runtime = context?.runtime
  const runtimeState = !runtime ? "unknown" : !runtime.reachable ? "unreachable" : runtime.ready ? "ready" : "degraded"
  const runtimeLabel = runtimeState === "ready" ? "Connect ready" : runtimeState === "degraded" ? "Connect degraded" : runtimeState === "unreachable" ? "Runtime unreachable" : "Status unavailable"
  const runtimeDetail = runtimeState === "ready" ? "Local runtime" : runtimeState === "degraded" ? "Readiness check failed" : runtimeState === "unreachable" ? "Check runtime settings" : "Open runtime for details"

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("porcelain.sidebar.collapsed") === "true")
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && commandOpen) {
        event.preventDefault()
        setCommandOpen(false)
        searchTriggerRef.current?.focus()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !pathname.startsWith("/pipelines/")) {
        event.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [commandOpen, pathname])

  const closeCommand = () => {
    setCommandOpen(false)
    window.requestAnimationFrame(() => searchTriggerRef.current?.focus())
  }
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
          <Button
            className="brand-toggle"
            variant="ghost"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleCollapsed}
          >
            <img className="brand-logo" src="/porcelain.svg" alt="" aria-hidden="true" />
            <img className="brand-wordmark" src="/porcelain-wordmark.svg" alt="Porcelain" />
          </Button>
        </div>

        <Button
          ref={searchTriggerRef}
          className="search-button"
          variant="ghost"
          title={collapsed ? "Search Porcelain" : undefined}
          aria-haspopup="dialog"
          aria-keyshortcuts="Meta+K Control+K"
          onClick={() => setCommandOpen(true)}
        >
          <Icon name="search" />
          <span className="search-label">Search Porcelain</span>
          <KeyboardShortcut className="search-shortcut">⌘ K</KeyboardShortcut>
        </Button>

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
          <Link className={`connect-indicator runtime-${runtimeState}`} to="/runtime" title={collapsed ? runtimeLabel : undefined}>
            <span className={`status-dot ${runtimeState === "ready" ? "online" : runtimeState === "unknown" ? "" : "offline"}`} />
            <span className="connect-copy">
              <strong>{runtimeLabel}</strong>
              <small>{runtimeDetail}</small>
            </span>
            <span className="runtime-badge">{runtimeState === "ready" ? "Ready" : runtimeState === "unknown" ? "Unknown" : "Inspect"}</span>
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

      <div className="app-content">
        <AppTabBar pathname={pathname} pipelines={context?.pipelines ?? []} onOpenCommand={() => setCommandOpen(true)} />
        <main className="main-content" id="main-content">{children}</main>
      </div>
      <GlobalCommandMenu open={commandOpen} pipelines={context?.pipelines ?? []} onClose={closeCommand} />
    </div>
  )
}
