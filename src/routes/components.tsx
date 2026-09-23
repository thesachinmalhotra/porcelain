import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { getComponents, type ComponentsFilter } from "../features/components/server"

export const Route = createFileRoute("/components")({
  loader: () => getComponents(),
  component: Components,
})

const filters: Array<{ label: string; value: ComponentsFilter }> = [
  { label: "All", value: "all" },
  { label: "Inputs", value: "input" },
  { label: "Processors", value: "processor" },
  { label: "Outputs", value: "output" },
  { label: "Buffers", value: "buffer" },
  { label: "Caches", value: "cache" },
  { label: "Rate limits", value: "rate_limit" },
]

function Components() {
  const workspace = Route.useLoaderData()
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<ComponentsFilter>("all")

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return workspace.components.filter((component) => {
      const matchesKind = kind === "all" || component.kinds.includes(kind)
      return matchesKind && (!normalized || component.name.toLowerCase().includes(normalized))
    })
  }, [kind, query, workspace.components])

  return (
    <div className="workspace-page" id="components">
      <header className="page-header">
        <div>
          <span className="eyebrow">Manage</span>
          <h1>Connect components</h1>
          <p>Live component inventory discovered from the installed Redpanda Connect runtime.</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Redpanda Connect</h2>
            <p>{filtered.length} components discovered from Connect.</p>
          </div>
          <label className="input-search">
            <input
              aria-label="Search components"
              placeholder="Search components"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        <div className="catalog-filters" role="group" aria-label="Filter components">
          {filters.map((filter) => (
            <button
              className={kind === filter.value ? "button button-primary" : "button button-secondary"}
              key={filter.value}
              type="button"
              onClick={() => setKind(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="catalog-grid">
          {filtered.map((component) => (
            <article className="catalog-card" key={component.name}>
              <span>{component.kinds.join(" · ")}</span>
              <strong>{component.name}</strong>
              <small>
                {component.status ? `Connect status: ${component.status}` : "Connect status unavailable"}
              </small>
            </article>
          ))}
        </div>

        {filtered.length === 0 && <div className="empty-inline">No components match that search.</div>}
      </section>
    </div>
  )
}
