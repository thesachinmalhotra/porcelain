import { useEffect, useMemo, useState } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import type { JsonObject, PipelineAuthoring, PipelineAuthoringComponent } from "../../pipeline/authoring"
import { addPipelineProcessor, movePipelineProcessor, removePipelineProcessor, setPipelineAuthoringBuffer, updatePipelineAuthoring } from "../../pipeline/authoring"
import type { PipelineWorkspacePipeline } from "../../pipeline/pipeline"
import { createAuthoredPipelineServer, deletePipeline, updateAuthoredPipelineServer } from "./server"
import { Icon } from "../../components/app-shell"

type PipelineWorkspaceProps = { connectReachable: boolean; connectReady: boolean; pipelines: PipelineWorkspacePipeline[]; pipelineId?: string }
type Step = { id: string; label: string; kind: "input" | "buffer" | "processor" | "output"; config: JsonObject }

function authoringFromComponent(authoring: PipelineAuthoring, component: PipelineAuthoringComponent, config: JsonObject): PipelineAuthoring {
  return updatePipelineAuthoring(authoring, component, config)
}

function stepsFor(authoring: PipelineAuthoring): Step[] {
  const steps: Step[] = [{ id: "input", label: "Input", kind: "input", config: authoring.input }]
  if (authoring.buffer) steps.push({ id: "buffer", label: "Buffer", kind: "buffer", config: authoring.buffer })
  authoring.processors?.forEach((config, index) => steps.push({ id: `processor-${index}`, label: `Processor ${index + 1}`, kind: "processor", config }))
  steps.push({ id: "output", label: "Output", kind: "output", config: authoring.output })
  return steps
}
function Status({ pipeline }: { pipeline: PipelineWorkspacePipeline }) {
  const label = !pipeline.runtime.connected ? "Disconnected" : pipeline.runtime.active ? "Active" : "Inactive"
  return <span className={`status status-${label.toLowerCase()}`}><span className="status-dot" />{label}</span>
}
function formatNumber(value: unknown) { return typeof value === "number" ? new Intl.NumberFormat().format(value) : "—" }
function receivedMessages(pipeline: PipelineWorkspacePipeline) {
  const input = pipeline.runtime.stats?.input
  return input && typeof input === "object" && "received" in input ? input.received : undefined
}

export function PipelineWorkspace({ connectReachable, connectReady, pipelines, pipelineId }: PipelineWorkspaceProps) {
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState(pipelineId ?? pipelines[0]?.id ?? "")
  const [drafts, setDrafts] = useState<Record<string, PipelineAuthoring>>({})
  const [selectedStep, setSelectedStep] = useState<PipelineAuthoringComponent>({ kind: "input" })
  const [draftText, setDraftText] = useState("")
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newId, setNewId] = useState("")
  const [newName, setNewName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  useEffect(() => { if (pipelineId) setSelectedId(pipelineId) }, [pipelineId])
  const selected = pipelines.find((pipeline) => pipeline.id === selectedId) ?? pipelines[0]
  const authoring = selected ? drafts[selected.id] ?? selected.authoring : undefined
  const steps = authoring ? stepsFor(authoring) : []
  const selectedStepId = selectedStep.kind === "input" ? "input" : selectedStep.kind === "buffer" ? "buffer" : selectedStep.kind === "output" ? "output" : `processor-${selectedStep.index}`
  const step = steps.find((item) => item.id === selectedStepId) ?? steps[0]
  const dirty = selected ? Boolean(drafts[selected.id]) : false
  const filtered = useMemo(() => pipelines.filter((pipeline) =>
    pipeline.name.toLowerCase().includes(query.toLowerCase()) || pipeline.id.toLowerCase().includes(query.toLowerCase())
  ), [pipelines, query])

  if (!selected) return <div className="workspace-page" id="pipelines"><div className="empty-state page-empty"><div className="empty-icon"><Icon name="pipeline" /></div><h3>No pipelines yet</h3><p>Create your first pipeline to start moving data.</p></div></div>

  const updateDraft = (next: PipelineAuthoring) => setDrafts((current) => ({ ...current, [selected.id]: next }))
  const beginEdit = () => { if (!step) return; setError(null); setDraftText(JSON.stringify(step.config, null, 2)); setEditing(true) }
  const applyEdit = () => {
    if (!authoring || !step) return
    try {
      const value = JSON.parse(draftText) as unknown
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Configuration must be a JSON object")
      const config = value as JsonObject
      const component: PipelineAuthoringComponent = step.kind === "processor" ? { kind: "processor", index: selectedStep.index } : { kind: step.kind }
      updateDraft(authoringFromComponent(authoring, component, config)); setEditing(false); setError(null)
    } catch (value) { setError(value instanceof Error ? value.message : "Invalid JSON") }
  }
  const addProcessor = () => {
    if (!authoring) return
    const index = authoring.processors?.length ?? 0
    updateDraft(addPipelineProcessor(authoring, { processor: {} }))
    setSelectedStep({ kind: "processor", index })
    setError(null)
  }
  const removeSelectedProcessor = () => {
    if (!authoring || selectedStep.kind !== "processor") return
    const count = authoring.processors?.length ?? 0
    const next = removePipelineProcessor(authoring, selectedStep.index)
    updateDraft(next)
    const nextIndex = Math.min(selectedStep.index, Math.max(0, count - 2))
    setSelectedStep(next.processors?.length ? { kind: "processor", index: nextIndex } : { kind: "input" })
    setError(null)
  }
  const moveSelectedProcessor = (direction: -1 | 1) => {
    if (!authoring || selectedStep.kind !== "processor") return
    const target = selectedStep.index + direction
    const count = authoring.processors?.length ?? 0
    if (target < 0 || target >= count) return
    updateDraft(movePipelineProcessor(authoring, selectedStep.index, target))
    setSelectedStep({ kind: "processor", index: target })
    setError(null)
  }
  const toggleBuffer = () => {
    if (!authoring) return
    updateDraft(setPipelineAuthoringBuffer(authoring, authoring.buffer ? undefined : { memory: {} }))
    if (!authoring.buffer) setSelectedStep({ kind: "buffer" })
    setError(null)
  }

  const discard = () => { setDrafts((current) => { const next = { ...current }; delete next[selected.id]; return next }); setEditing(false); setError(null) }
  const publish = async () => {
    if (!authoring || !dirty) return
    setSaving(true); setError(null)
    try {
      await updateAuthoredPipelineServer({ data: { id: selected.id, authoring } })
      setDrafts((current) => { const next = { ...current }; delete next[selected.id]; return next })
      await router.invalidate({ sync: true })
    } catch (value) { setError(value instanceof Error ? value.message : "Publish failed") }
    finally { setSaving(false) }
  }

  const create = async () => {
    const id = newId.trim()
    const name = newName.trim()
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(id)) { setError("Pipeline ID must use lowercase letters, numbers, hyphens, or underscores"); return }
    if (!name) { setError("Pipeline name is required"); return }
    setSaving(true); setError(null)
    try {
      await createAuthoredPipelineServer({ data: { id, name, input: { stdin: {} }, output: { drop: {} } } })
      setShowCreate(false); setNewId(""); setNewName("")
      await router.invalidate({ sync: true })
      await router.navigate({ to: "/pipelines/$pipelineId", params: { pipelineId: id } })
    } catch (value) { setError(value instanceof Error ? value.message : "Create failed") }
    finally { setSaving(false) }
  }
  const remove = async () => {
    if (!selected || !window.confirm("Delete pipeline " + selected.name + "? This also removes its Connect stream.")) return
    setDeleting(true); setError(null)
    try {
      await deletePipeline({ data: { id: selected.id } })
      await router.invalidate({ sync: true })
      const next = pipelines.find((pipeline) => pipeline.id !== selected.id)
      if (next) await router.navigate({ to: "/pipelines/$pipelineId", params: { pipelineId: next.id } })
      else await router.navigate({ to: "/pipelines" })
    } catch (value) { setError(value instanceof Error ? value.message : "Delete failed") }
    finally { setDeleting(false) }
  }
  return <div className="workspace-page" id="pipelines">
    <header className="page-header"><div><div className="breadcrumbs"><Link to="/pipelines">Pipelines</Link><b>/</b><strong>{authoring?.id ?? selected.id}</strong></div><h1>{authoring?.name ?? selected.name}</h1><p>Compose, publish, and observe this pipeline.</p></div><div className="header-actions"><button className="button button-secondary" type="button" onClick={() => setShowCreate(true)}>New pipeline</button><button className="button button-secondary" type="button" onClick={discard} disabled={!dirty}>Discard</button><button className="button button-primary" type="button" onClick={publish} disabled={!dirty || saving}>{saving ? "Publishing…" : "Publish"}</button></div></header>
    {dirty && <div className="unpublished-banner"><span className="status-dot" />This pipeline has unpublished changes</div>}
    <div className="metric-row"><div className="metric-card"><span>All pipelines</span><strong>{pipelines.length.toString().padStart(2, "0")}</strong><small>Managed by Porcelain</small></div><div className="metric-card"><span>Connected</span><strong>{pipelines.filter((p) => p.runtime.connected).length.toString().padStart(2, "0")}</strong><small><span className="status-dot online" />Runtime linked</small></div><div className="metric-card"><span>Active now</span><strong>{pipelines.filter((p) => p.runtime.active).length.toString().padStart(2, "0")}</strong><small>Across all streams</small></div><div className="runtime-card"><span className={`status-dot ${connectReady ? "online" : "offline"}`} /><div><strong>{!connectReachable ? "Runtime unreachable" : connectReady ? "Connect ready" : "Connect degraded"}</strong><small>Redpanda Connect · localhost:4195</small></div></div></div>
    <div className="content-grid">
      <section className="panel pipeline-panel">
        <div className="panel-header"><div><h2>Pipeline <span className="count-badge">{steps.length} steps</span></h2><p>Authoring configuration mapped directly to Redpanda Connect.</p></div><div className="header-actions"><button className="button button-secondary" type="button" onClick={addProcessor}>Add processor</button></div><label className="input-search"><Icon name="search" /><input aria-label="Filter pipelines" placeholder="Filter pipelines" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="pipeline-canvas" aria-label="Pipeline topology">{steps.map((item, index) => <div className="canvas-step-wrap" key={item.id}><button className={`canvas-step${step?.id === item.id ? " selected" : ""}`} type="button" onClick={() => { setSelectedStep(item.kind === "processor" ? { kind: "processor", index: Number(item.id.split("-")[1]) } : { kind: item.kind }); setEditing(false); setError(null) }}><span className="step-kind">{item.kind}</span><strong>{item.label}</strong><code>{Object.keys(item.config)[0] ?? "configuration"}</code></button>{index < steps.length - 1 && <span className="canvas-arrow">→</span>}</div>)}</div>
        <div className="pipeline-list compact-list">{filtered.length === 0 ? <div className="empty-inline">No matching pipelines. Try a different name or ID.</div> : filtered.map((pipeline) => <Link className={"pipeline-row" + (selected.id === pipeline.id ? " selected" : "")} key={pipeline.id} to="/pipelines/$pipelineId" params={{ pipelineId: pipeline.id }}><span className="pipeline-icon"><Icon name="pipeline" /></span><span className="pipeline-main"><strong>{pipeline.name}</strong><code>{pipeline.id}</code></span><span className="stream-name">{pipeline.connectStreamId ? <><Icon name="database" />{pipeline.connectStreamId}</> : "No stream linked"}</span><Status pipeline={pipeline} /></Link>)}</div>
      </section>
      <aside className="panel detail-panel">
        <div className="detail-heading"><div className="pipeline-icon large"><Icon name="pipeline" /></div><div><span className="eyebrow">{step?.kind ?? "Pipeline"}</span><h2>{step?.label ?? "Pipeline details"}</h2></div></div>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {step && <>
          <div className="detail-section"><h3>Configuration</h3>{editing ? <textarea className="config-editor" aria-label="Step configuration" value={draftText} onChange={(event) => setDraftText(event.target.value)} spellCheck={false} /> : <pre className="config-preview">{JSON.stringify(step.config, null, 2)}</pre>}<div className="detail-actions">{step.kind === "processor" && <><button className="button button-secondary" type="button" onClick={() => moveSelectedProcessor(-1)} disabled={selectedStep.index === 0}>Move up</button><button className="button button-secondary" type="button" onClick={() => moveSelectedProcessor(1)} disabled={selectedStep.index === (authoring?.processors?.length ?? 1) - 1}>Move down</button><button className="button button-secondary" type="button" onClick={removeSelectedProcessor}>Delete processor</button></>}{step.kind === "buffer" && <button className="button button-secondary" type="button" onClick={toggleBuffer}>Remove buffer</button>}{step.kind !== "buffer" && !authoring?.buffer && <button className="button button-secondary" type="button" onClick={toggleBuffer}>Add buffer</button>}{editing ? <><button className="button button-primary" type="button" onClick={applyEdit}>Apply change</button><button className="button button-ghost" type="button" onClick={() => setEditing(false)}>Cancel</button></> : <button className="button button-secondary" type="button" onClick={beginEdit}>Edit configuration</button>}</div></div>
          <div className="detail-section"><h3>Runtime</h3><dl className="detail-list"><div><dt>Connection</dt><dd>{selected.runtime.connected ? "Redpanda Connect" : "Not connected"}</dd></div><div><dt>Stream</dt><dd className="mono">{selected.connectStreamId ?? "—"}</dd></div><div><dt>Status</dt><dd>{selected.runtime.connected ? (selected.runtime.active ? "Running" : "Stopped") : "Disconnected"}</dd></div><div><dt>Uptime</dt><dd>{selected.runtime.connected ? selected.runtime.uptime : "—"}</dd></div><div><dt>Messages received</dt><dd>{formatNumber(receivedMessages(selected))}</dd></div></dl></div><div className="detail-actions"><button className="button button-secondary" type="button" onClick={remove} disabled={deleting}>{deleting ? "Deleting…" : "Delete pipeline"}</button></div>
        </>}
      </aside>
    </div>
    {showCreate && <div className="modal-backdrop" role="presentation"><form className="modal" onSubmit={(event) => { event.preventDefault(); void create() }}><div className="modal-header"><div><span className="eyebrow">Pipeline</span><h2>New pipeline</h2></div><button className="icon-button" type="button" onClick={() => setShowCreate(false)} aria-label="Close">×</button></div><label>Pipeline ID<input autoFocus value={newId} onChange={(event) => setNewId(event.target.value)} placeholder="temperature-normalizer" /></label><label>Name<input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Temperature normalizer" /></label><p className="modal-help">Starts with a stdin input and drop output. Configure the steps after creation.</p><div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create pipeline"}</button></div></form></div>}
  </div>
}
