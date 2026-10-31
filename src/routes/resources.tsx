import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { parse, stringify } from "yaml"
import { ViewHeader } from "../components/view-header"
import { getComponents } from "../features/components/server"
import { getManagedResources, publishManagedResource, saveManagedResource } from "../features/resources/server"
import type { ConnectResourceType } from "../runtime/connect/client"

export const Route = createFileRoute("/resources")({ loader: async () => Promise.all([getManagedResources(), getComponents()]), component: Resources })
const types: ConnectResourceType[] = ["cache", "rate_limit", "input", "output", "processor"]
type Resource = Awaited<ReturnType<typeof getManagedResources>>["resources"][number]
function Resources() {
  const [initial, inventory] = Route.useLoaderData()
  const [items, setItems] = useState<Resource[]>(initial.resources)
  const [selectedId, setSelectedId] = useState<string | null>(initial.resources[0]?.id ?? null)
  const [type, setType] = useState<ConnectResourceType>("cache")
  const [component, setComponent] = useState(""), [name, setName] = useState(""), [source, setSource] = useState("")
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const selected = items.find(item => item.id === selectedId) ?? null
  const components = useMemo(() => inventory.components.filter(item => item.kinds.includes(type)), [inventory.components, type])
  const dirty = !!selected && selected.checksum !== selected.publishedChecksum
  const editorDirty = !!selected && source !== stringify(selected.config, { lineWidth: 100 })
  const fresh = () => { setSelectedId(null); setType("cache"); setComponent(""); setName(""); setSource(""); setError(null) }
  const edit = (item: Resource) => { setSelectedId(item.id); setType(item.type); setComponent(item.component); setName(item.name); setSource(stringify(item.config, { lineWidth: 100 })); setError(null) }
  const save = async () => {
    setBusy(true); setError(null)
    try {
      const config = parse(source) as Record<string, unknown>
      if (!config || typeof config !== "object" || Array.isArray(config) || !config[component]) throw new Error("Configuration must contain the selected root component")
      const result = await saveManagedResource({ data: { id: selectedId ?? undefined, type, component, name, config } })
      setItems(current => current.some(item => item.id === result.resource.id) ? current.map(item => item.id === result.resource.id ? result.resource : item) : [...current, result.resource])
      setSelectedId(result.resource.id); setSource(stringify(result.resource.config, { lineWidth: 100 }))
    } catch (value) { setError(value instanceof Error ? value.message : "Could not save resource") }
    finally { setBusy(false) }
  }
  const publish = async () => {
    if (!selected) return
    setBusy(true); setError(null)
    try { const result = await publishManagedResource({ data: { id: selected.id } }); setItems(current => current.map(item => item.id === selected.id ? result.resource : item)) }
    catch (value) { setError(value instanceof Error ? value.message : "Could not publish resource") }
    finally { setBusy(false) }
  }
  return <div className="workspace-page">
    <ViewHeader eyebrow="Connect" title="Shared resources" description="Author shared Connect resources once and reference them from streams. The Streams API does not expose resource read-back or deletion." actions={<button className="button button-primary" type="button" onClick={fresh}>New resource</button>} />
    <div className="resource-workbench">
      <aside className="resource-list panel">
        <header><strong>Resource catalogue</strong><span>{items.length}</span></header>
        {items.map(item => <button key={item.id} type="button" className={`resource-list-item${selectedId === item.id ? " active" : ""}`} onClick={() => edit(item)}><span><strong>{item.name}</strong><small>{item.type} ? {item.component}</small></span><i className={item.publishedChecksum === item.checksum ? "published" : "draft"}>{item.publishedChecksum === item.checksum ? "Published" : "Draft"}</i></button>)}
        {!items.length && <p className="resource-empty">No shared resources authored yet.</p>}
        <footer>Porcelain desired state ? {items.length} resources</footer>
      </aside>
      <section className="resource-editor panel">
        <header><div><span className="eyebrow">{selected ? "Resource configuration" : "New resource"}</span><strong>{selected?.name ?? "Untitled resource"}</strong></div>{selected && <span className={`status ${dirty ? "status-inactive" : "status-running"}`}><span className="status-dot" />{dirty ? "Unpublished changes" : "In sync"}</span>}</header>
        <div className="resource-fields">
          <label><span>Resource type</span><select value={type} disabled={!!selected} onChange={event => { setType(event.target.value as ConnectResourceType); setComponent(""); setSource("") }}>{types.map(item => <option key={item}>{item}</option>)}</select></label>
          <label><span>Component</span><select value={component} onChange={event => { setComponent(event.target.value); setSource(stringify({ [event.target.value]: {} }, { lineWidth: 100 })) }}><option value="">Select installed component</option>{components.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
          <label><span>Resource name / ID</span><input value={name} onChange={event => setName(event.target.value)} placeholder="customer-cache" /></label>
        </div>
        <div className="resource-source-head"><strong>Native Connect configuration</strong><small>Component configuration only; resource ID is supplied separately to the Streams API.</small></div>
        <textarea aria-label="Resource configuration" value={source} onChange={event => setSource(event.target.value)} spellCheck={false} placeholder="Select a component to begin" />
        {error && <div className="inline-error" role="alert">{error}</div>}
        <footer><span>{selected?.publishedAt ? `Last published ${new Date(selected.publishedAt).toLocaleString()}` : "Not yet published"}{selected?.lastPublishError ? ` ? ${selected.lastPublishError}` : ""}</span><div><button className="button button-secondary" type="button" disabled={busy || !name.trim() || !component || !source.trim()} onClick={() => void save()}>Save draft</button><button className="button button-primary" type="button" disabled={busy || !selected || !dirty || editorDirty} onClick={() => void publish()}>Publish</button></div></footer>
      </section>
    </div>
  </div>
}

