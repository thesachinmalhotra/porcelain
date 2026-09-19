import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { connectComponents, type PipelineComponentKind } from "../pipeline/catalog"

export const Route = createFileRoute("/components")({
  component: Components,
})

const filters: Array<{ label: string; value: PipelineComponentKind | "all" }> = [
  { label: "All", value: "all" },
  { label: "Inputs", value: "input" },
  { label: "Processors", value: "processor" },
  { label: "Outputs", value: "output" },
  { label: "Buffers", value: "buffer" },
  { label: "Caches", value: "cache" },
  { label: "Rate limits", value: "rate_limit" },
]

function Components() {
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<PipelineComponentKind | "all">("all")

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return connectComponents.filter((component) => {
      const matchesKind = kind === "all" || component.kinds.includes(kind)
      const matchesQuery = !normalized || component.name.includes(normalized)
      return matchesKind && matchesQuery
    })
  }, [kind, query])

  return (
    <div className="workspace-page" id="components">
      <header className="page-header">
        <div>
          <span className="eyebrow">Manage</span>
          <h1>Component catalog</h1>
          <p>Connect-native components available to Porcelain authoring.</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Redpanda Connect</h2>
            <p>{filtered.length} components in this Porcelain catalog slice.</p>
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
                {component.support}
                {component.enterprise ? " · Enterprise" : ""}
                {component.cloud ? " · Cloud" : " · Self-managed"}
              </small>
            </article>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="empty-inline">
            No components match that search.
          </div>
        )}
      </section>
    </div>
  )
}
