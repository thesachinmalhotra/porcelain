import { useEffect, useMemo, useState } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { parse, stringify } from "yaml"
import type { JsonObject, PipelineAuthoring, PipelineAuthoringComponent } from "../../pipeline/authoring"
import { addPipelineProcessor, movePipelineProcessor, removePipelineProcessor, replacePipelineAuthoringConfig, setPipelineAuthoringBuffer, updatePipelineAuthoring } from "../../pipeline/authoring"
import { authoringToConnectConfig } from "../../pipeline/authoring"
import type { PipelineWorkspacePipeline } from "../../pipeline/pipeline"
import { createAuthoredPipelineServer, deletePipeline, publishAuthoredPipelineServer, validateAuthoredPipelineServer } from "./server"
import { Icon } from "../../components/app-shell"
import { createConnectComponentConfig, normalizeConnectConfig } from "../components/server"
import type { ConnectComponentCapability } from "../../runtime/connect/capabilities"

type PipelineWorkspaceProps = { connectReachable: boolean; connectReady: boolean; pipelines: PipelineWorkspacePipeline[]; components?: ConnectComponentCapability[]; pipelineId?: string }
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

function workspaceComponents(components: ConnectComponentCapability[], kind: Step["kind"]): ConnectComponentCapability[] {
  return components.filter((component) => component.kinds.includes(kind))
}

function FriendlyFields({ config, onChange }: { config: JsonObject; onChange: (config: JsonObject) => void }) {
  const fields = scalarFields(config)
  if (fields.length === 0) return <p>No scalar fields are exposed at this level. Use Advanced or Raw to edit the native Connect configuration.</p>
  return <div className="detail-list">
    {fields.map(({ path, value }) => <label key={path.join(".")} className="native-field">
      <span>{path.join(" → ")}</span>
      {typeof value === "boolean" ? (
        <input checked={value} type="checkbox" onChange={(event) => onChange(setPath(config, path, event.target.checked))} />
      ) : (
        <input value={value === null ? "null" : String(value)} type={typeof value === "number" ? "number" : "text"} onChange={(event) => onChange(setPath(config, path, typeof value === "number" ? Number(event.target.value) : event.target.value))} />
      )}
    </label>)}
  </div>
}

function scalarFields(config: JsonObject, prefix: string[] = [], depth = 0): Array<{ path: string[]; value: string | number | boolean | null }> {
  if (depth > 2) return []
  const fields: Array<{ path: string[]; value: string | number | boolean | null }> = []
  for (const [key, value] of Object.entries(config)) {
    const path = [...prefix, key]
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) fields.push({ path, value })
    else if (isJsonObject(value)) fields.push(...scalarFields(value, path, depth + 1))
  }
  return fields
}

function setPath(config: JsonObject, path: string[], value: string | number | boolean | null): JsonObject {
  const next = structuredClone(config)
  let cursor = next
  for (const segment of path.slice(0, -1)) {
    if (!isJsonObject(cursor[segment])) cursor[segment] = {}
    cursor = cursor[segment] as JsonObject
  }
  cursor[path[path.length - 1]] = value
  return next
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function PipelineWorkspace({ connectReachable, connectReady, pipelines, components = [], pipelineId }: PipelineWorkspaceProps) {
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
  const [inspectorMode, setInspectorMode] = useState<"friendly" | "advanced" | "raw">("friendly")
  const [componentName, setComponentName] = useState("")
  const [componentQuery, setComponentQuery] = useState("")
  const [showComponentPicker, setShowComponentPicker] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<{ valid: boolean; message: string } | null>(null)
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

  const updateDraft = (next: PipelineAuthoring) => {
    setDrafts((current) => ({ ...current, [selected.id]: next }))
    setValidation(null)
  }
  const beginEdit = () => { if (!step) return; setError(null); setDraftText(JSON.stringify(step.config, null, 2)); setEditing(true) }
  const applyEdit = () => {
    if (!authoring || !step) return
    try {
      const value = JSON.parse(draftText) as unknown
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Configuration must be a JSON object")
      const config = value as JsonObject
      const component: PipelineAuthoringComponent = step.kind === "processor"
        ? { kind: "processor", index: selectedStep.kind === "processor" ? selectedStep.index : 0 }
        : { kind: step.kind }
      updateDraft(authoringFromComponent(authoring, component, config)); setEditing(false); setError(null)
    } catch (value) { setError(value instanceof Error ? value.message : "Invalid JSON") }
  }

  const updateSelectedConfig = (config: JsonObject) => {
    if (!authoring || !step) return
    const component: PipelineAuthoringComponent = step.kind === "processor"
      ? { kind: "processor", index: selectedStep.kind === "processor" ? selectedStep.index : 0 }
      : { kind: step.kind }
    updateDraft(authoringFromComponent(authoring, component, config))
    setError(null)
  }

  const generateComponent = async () => {
    if (!authoring || !step || !componentName) return
    setGenerating(true)
    setError(null)
    try {
      const config = await createConnectComponentConfig({ data: { kind: step.kind, name: componentName } })
      updateSelectedConfig(config)
      setEditing(false)
    } catch (value) {
      setError(value instanceof Error ? value.message : "Connect component generation failed")
    } finally {
      setGenerating(false)
    }
  }

  const validateWithConnect = async () => {
    if (!authoring) return
    setValidating(true)
    setValidation(null)
    setError(null)
    try {
      const result = await validateAuthoredPipelineServer({ data: { id: selected.id, authoring } })
      setValidation({
        valid: result.valid,
        message: result.valid
          ? result.restartRequired
            ? "Connect accepted the draft. Publishing will restart this stream."
            : "Connect accepted the draft. It is ready to publish."
          : result.output,
      })
    } catch (value) {
      setValidation({ valid: false, message: value instanceof Error ? value.message : "Connect validation failed" })
    } finally {
      setValidating(false)
    }
  }

  const normalizeWithConnect = async () => {
    if (!step) return
    setValidating(true)
    setError(null)
    try {
      const config = await normalizeConnectConfig({ data: { config: step.config } })
      updateSelectedConfig(config)
      setValidation({ valid: true, message: "Connect returned the normalized native configuration." })
    } catch (value) {
      setValidation({ valid: false, message: value instanceof Error ? value.message : "Connect normalization failed" })
    } finally {
      setValidating(false)
    }
  }

  const applyRaw = () => {
    if (!authoring) return
    try {
      const value = parse(draftText) as unknown
      if (!isJsonObject(value)) throw new Error("Raw configuration must be a YAML/JSON object")
      updateDraft(replacePipelineAuthoringConfig(authoring, value))
      setError(null)
    } catch (value) {
      setError(value instanceof Error ? value.message : "Invalid YAML/JSON")
    }
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

  const discard = () => {
    setDrafts((current) => {
      const next = { ...current }
      delete next[selected.id]
      return next
    })
    setEditing(false)
    setError(null)
    setValidation(null)
  }

  const publish = async () => {
    if (!authoring || !dirty || !validation?.valid) return
    if (validation.message.includes("restart this stream") && !window.confirm("Publishing this change will restart the running Connect stream. Continue?")) return
    setSaving(true)
    setError(null)
    try {
      await publishAuthoredPipelineServer({ data: { id: selected.id, authoring } })
      setDrafts((current) => {
        const next = { ...current }
        delete next[selected.id]
        return next
      })
      await router.invalidate({ sync: true })
    } catch (value) {
      const message = value instanceof Error ? value.message : "Publish failed"
      setError(message)
      setValidation({ valid: false, message })
    } finally {
      setSaving(false)
    }
  }

  const create = async () => {
    const id = newId.trim()
    const name = newName.trim()
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
      setError("Pipeline ID must use lowercase letters, numbers, hyphens, or underscores")
      return
    }
    if (!name) {
      setError("Pipeline name is required")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createAuthoredPipelineServer({ data: { id, name, input: { stdin: {} }, output: { drop: {} } } })
      setShowCreate(false)
      setNewId("")
      setNewName("")
      await router.invalidate({ sync: true })
      await router.navigate({ to: `/pipelines/${id}`, params: { pipelineId: id } })
    } catch (value) {
      setError(value instanceof Error ? value.message : "Create failed")
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!selected || !window.confirm("Delete pipeline " + selected.name + "? This also removes its Connect stream.")) return
    setDeleting(true)
    setError(null)
    try {
      await deletePipeline({ data: { id: selected.id } })
      await router.invalidate({ sync: true })
      const next = pipelines.find((pipeline) => pipeline.id !== selected.id)
      if (next) await router.navigate({ to: "/pipelines/$pipelineId", params: { pipelineId: next.id } })
      else await router.navigate({ to: "/pipelines" })
    } catch (value) {
      setError(value instanceof Error ? value.message : "Delete failed")
    } finally {
      setDeleting(false)
    }
  }

  const openComponentPicker = () => {
    setComponentQuery("")
    setShowComponentPicker(true)
  }

  const chooseComponent = async (name: string) => {
    setComponentName(name)
    setShowComponentPicker(false)
    if (!authoring || !step) return
    setGenerating(true)
    setError(null)
    try {
      const config = await createConnectComponentConfig({ data: { kind: step.kind, name } })
      updateSelectedConfig(config)
      setEditing(false)
    } catch (value) {
      setError(value instanceof Error ? value.message : "Connect component generation failed")
    } finally {
      setGenerating(false)
    }
  }

  const filteredComponents = useMemo(() => {
    const normalized = componentQuery.trim().toLowerCase()
    return availableComponents.filter((component) => !normalized || component.name.toLowerCase().includes(normalized))
  }, [availableComponents, componentQuery])

  const selectStep = (item: Step) => {
    setSelectedStep(item.kind === "processor"
      ? { kind: "processor", index: Number(item.id.split("-")[1]) }
      : { kind: item.kind })
    setEditing(false)
    setError(null)
    setValidation(null)
  }

  const statusLabel = !selected.runtime.connected ? "Disconnected" : selected.runtime.active ? "Running" : "Stopped"
  const statusClass = !selected.runtime.connected ? "status-disconnected" : selected.runtime.active ? "status-running" : "status-inactive"
  const received = receivedMessages(selected)
  const processorCount = authoring?.processors?.length ?? 0

  return (
    <div className="workspace-page pipeline-workspace" id="pipelines">
      <header className="pipeline-header">
        <div className="pipeline-title">
          <div className="breadcrumbs"><Link to="/pipelines">Pipelines</Link><span>/</span><strong>{authoring?.id ?? selected.id}</strong></div>
          <div className="pipeline-title-row">
            <div>
              <h1>{authoring?.name ?? selected.name}</h1>
              <div className="pipeline-subtitle">
                <span className={`status ${statusClass}`}><span className="status-dot" />{statusLabel}</span>
                <span className="dot-separator">·</span>
                <code>{selected.connectStreamId ?? "unlinked"}</code>
                {dirty && <span className="draft-pill">Draft changes</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="pipeline-header-actions">
          <button className="button button-ghost" type="button" onClick={() => setShowCreate(true)}><Icon name="plus" />New</button>
          <button className="button button-ghost" type="button" onClick={discard} disabled={!dirty}>Discard</button>
          <button className="button button-secondary" type="button" onClick={() => void validateWithConnect()} disabled={!dirty || validating}>
            <Icon name={validation?.valid ? "check" : "terminal"} />{validating ? "Checking…" : "Validate"}
          </button>
          <button className="button button-primary publish-button" type="button" onClick={publish} disabled={!dirty || saving || !validation?.valid}>
            {saving ? "Publishing…" : "Publish"}
          </button>
        </div>
      </header>

      {error && <div className="workspace-alert error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
      {dirty && !error && <div className="workspace-alert draft" role="status"><span className="status-dot" /><span>Unpublished changes</span><span className="alert-detail">Validate the draft before publishing.</span></div>}
      {validation && !error && (
        <div className={`workspace-alert ${validation.valid ? "success" : "error"}`} role="status">
          <Icon name={validation.valid ? "check" : "warning"} />
          <span>{validation.message}</span>
        </div>
      )}

      <div className="editor-shell">
        <aside className="pipeline-sidebar panel">
          <div className="editor-panel-heading">
            <div>
              <span className="eyebrow">Workspace</span>
              <h2>Pipelines <span className="count-badge">{pipelines.length}</span></h2>
            </div>
            <button className="icon-button" type="button" onClick={() => setShowCreate(true)} aria-label="New pipeline"><Icon name="plus" /></button>
          </div>
          <label className="workspace-search">
            <Icon name="search" />
            <input aria-label="Filter pipelines" placeholder="Filter" value={query} onChange={(event) => setQuery(event.target.value)} />
            <kbd>/</kbd>
          </label>
          <div className="pipeline-list workspace-pipeline-list">
            {filtered.length === 0 ? (
              <div className="empty-inline">No matching pipelines.</div>
            ) : filtered.map((pipeline) => (
              <Link
                className={"workspace-pipeline-row" + (selected.id === pipeline.id ? " selected" : "")}
                key={pipeline.id}
                to="/pipelines/$pipelineId"
                params={{ pipelineId: pipeline.id }}
              >
                <span className="pipeline-row-mark"><Icon name="pipeline" /></span>
                <span className="pipeline-main"><strong>{pipeline.name}</strong><code>{pipeline.id}</code></span>
                <span className={`status-dot ${pipeline.runtime.connected ? pipeline.runtime.active ? "online" : "" : "offline"}`} />
              </Link>
            ))}
          </div>
          <div className="pipeline-sidebar-footer">
            <div className="runtime-mini">
              <span className={`status-dot ${connectReady ? "online" : "offline"}`} />
              <div><strong>{!connectReachable ? "Runtime unreachable" : connectReady ? "Connect ready" : "Connect degraded"}</strong><small>localhost:4195</small></div>
            </div>
          </div>
        </aside>

        <main className="editor-main">
          <section className="panel topology-panel">
            <div className="editor-panel-heading topology-heading">
              <div>
                <span className="eyebrow">Authoring</span>
                <h2>Stream topology <span className="count-badge">{steps.length}</span></h2>
              </div>
              <div className="topology-actions">
                <button className="button button-secondary" type="button" onClick={toggleBuffer}>
                  {authoring?.buffer ? "Remove buffer" : "Add buffer"}
                </button>
                <button className="button button-secondary" type="button" onClick={addProcessor}><Icon name="plus" />Processor</button>
              </div>
            </div>

            <div className="topology-canvas" aria-label="Pipeline topology">
              <div className="topology-track">
                {steps.map((item, index) => (
                  <div className="topology-node-group" key={item.id}>
                    <button className={`topology-node${step?.id === item.id ? " selected" : ""}`} type="button" onClick={() => selectStep(item)}>
                      <span className="topology-node-icon"><Icon name={item.kind === "processor" ? "layers" : item.kind === "input" ? "database" : item.kind === "output" ? "arrow" : "grid"} /></span>
                      <span className="topology-node-copy">
                        <span className="topology-node-kind">{item.kind}</span>
                        <strong>{item.config && Object.keys(item.config).find((key) => key !== "label") ?? item.label}</strong>
                        <code>{item.label}</code>
                      </span>
                      <Icon name="more" />
                    </button>
                    {index < steps.length - 1 && (
                      <div className="topology-connector">
                        <span />
                        <button className="insert-button" type="button" aria-label={`Insert after ${item.label}`} onClick={() => {
                          if (item.kind === "processor") {
                            const indexToInsert = Number(item.id.split("-")[1]) + 1
                            updateDraft(addPipelineProcessor(authoring!, { processor: {} }, indexToInsert))
                            setSelectedStep({ kind: "processor", index: indexToInsert })
                            openComponentPicker()
                          } else {
                            addProcessor()
                            openComponentPicker()
                          }
                        }}>+</button>
                        <span />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="topology-footer">
              <div><span className="status-dot online" /><span>Source of truth: Redpanda Connect configuration</span></div>
              <button className="text-button" type="button" onClick={() => {
                if (authoring) {
                  setDraftText(stringify(authoringToConnectConfig(authoring), { lineWidth: 120 }))
                  setInspectorMode("raw")
                }
              }}>View native config <Icon name="arrow" /></button>
            </div>
          </section>

          <section className="panel runtime-strip">
            <div className="runtime-strip-main">
              <div className={`runtime-state ${statusClass}`}><span className="status-dot" /><strong>{statusLabel}</strong></div>
              <div className="runtime-stat"><span>Uptime</span><strong>{selected.runtime.connected ? selected.runtime.uptime : "—"}</strong></div>
              <div className="runtime-stat"><span>Messages received</span><strong>{formatNumber(received)}</strong></div>
              <div className="runtime-stat"><span>Processors</span><strong>{processorCount}</strong></div>
            </div>
            <Link className="text-button" to="/runtime">Open runtime <Icon name="arrow" /></Link>
          </section>
        </main>

        <aside className="inspector panel">
          <div className="inspector-header">
            <div className="inspector-heading">
              <span className="eyebrow">{step?.kind ?? "pipeline"}</span>
              <h2>{step?.label ?? "Pipeline"}</h2>
              {step && <code>{Object.keys(step.config)[0] ?? "configuration"}</code>}
            </div>
            <button className="icon-button" type="button" aria-label="More options"><Icon name="more" /></button>
          </div>

          {step && (
            <>
              {step.kind !== "buffer" && (
                <div className="component-summary">
                  <div><span className="component-summary-label">Component</span><strong>{Object.keys(step.config).find((key) => key !== "label") ?? "Not configured"}</strong></div>
                  <button className="button button-secondary" type="button" onClick={openComponentPicker} disabled={generating}>
                    {generating ? "Generating…" : "Change"}
                  </button>
                </div>
              )}

              <div className="inspector-tabs" role="tablist" aria-label="Configuration view">
                {(["friendly", "advanced", "raw"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={`inspector-tab ${inspectorMode === mode ? "active" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={inspectorMode === mode}
                    onClick={() => {
                      setInspectorMode(mode)
                      setEditing(false)
                      if (mode === "raw" && authoring) setDraftText(stringify(authoringToConnectConfig(authoring), { lineWidth: 120 }))
                    }}
                  >
                    {mode === "friendly" ? "Configure" : mode === "advanced" ? "Advanced" : "Source"}
                  </button>
                ))}
              </div>

              <div className="inspector-body">
                {inspectorMode === "friendly" && (
                  <div className="inspector-section">
                    <div className="section-intro"><strong>Configuration</strong><span>Native Connect fields</span></div>
                    <FriendlyFields config={step.config} onChange={updateSelectedConfig} />
                    {scalarFields(step.config).length === 0 && (
                      <div className="inspector-note"><Icon name="terminal" /><span>This component has no exposed scalar fields yet. Use Advanced or Source to edit the native configuration.</span></div>
                    )}
                  </div>
                )}
                {inspectorMode === "advanced" && (
                  <div className="inspector-section">
                    <div className="section-intro"><strong>Advanced configuration</strong><span>JSON for this component</span></div>
                    <textarea className="config-editor" aria-label="Step configuration" value={editing ? draftText : JSON.stringify(step.config, null, 2)} onChange={(event) => { setDraftText(event.target.value); setEditing(true) }} spellCheck={false} />
                  </div>
                )}
                {inspectorMode === "raw" && (
                  <div className="inspector-section">
                    <div className="section-intro"><strong>Native Connect source</strong><span>YAML · full stream</span></div>
                    <textarea className="config-editor config-editor-tall" aria-label="Raw Connect YAML configuration" value={draftText || (authoring ? stringify(authoringToConnectConfig(authoring), { lineWidth: 120 }) : "")} onChange={(event) => setDraftText(event.target.value)} spellCheck={false} />
                  </div>
                )}

                {validation && (
                  <div className={`validation-card ${validation.valid ? "valid" : "invalid"}`} role="status">
                    <Icon name={validation.valid ? "check" : "warning"} />
                    <div><strong>{validation.valid ? "Connect accepted the draft" : "Connect rejected the draft"}</strong><p>{validation.message}</p></div>
                  </div>
                )}

                <div className="inspector-actions">
                  {step.kind === "processor" && (
                    <>
                      <button className="button button-secondary" type="button" onClick={() => moveSelectedProcessor(-1)} disabled={selectedStep.index === 0}>Move up</button>
                      <button className="button button-secondary" type="button" onClick={() => moveSelectedProcessor(1)} disabled={selectedStep.index === (authoring?.processors?.length ?? 1) - 1}>Move down</button>
                      <button className="button button-danger-ghost" type="button" onClick={removeSelectedProcessor}>Delete processor</button>
                    </>
                  )}
                  {step.kind === "buffer" && <button className="button button-secondary" type="button" onClick={toggleBuffer}>Remove buffer</button>}
                  {inspectorMode === "raw" && <button className="button button-primary" type="button" onClick={applyRaw}>Apply source</button>}
                  {inspectorMode === "friendly" && <button className="button button-secondary" type="button" onClick={() => { beginEdit(); setInspectorMode("advanced") }}>Edit as JSON</button>}
                  {inspectorMode === "advanced" && (
                    <>
                      <button className="button button-primary" type="button" onClick={applyEdit}>Apply change</button>
                      <button className="button button-ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
                    </>
                  )}
                  <button className="button button-secondary" type="button" onClick={() => void validateWithConnect()} disabled={validating || !dirty}>
                    {validating ? "Checking…" : "Validate with Connect"}
                  </button>
                  <button className="text-button" type="button" onClick={() => void normalizeWithConnect()} disabled={validating}>Normalize with Connect <Icon name="arrow" /></button>
                </div>

                <div className="inspector-runtime">
                  <div className="section-intro"><strong>Runtime</strong><span>Live from Connect</span></div>
                  <dl className="detail-list">
                    <div><dt>Connection</dt><dd>{selected.runtime.connected ? "Connected" : "Unavailable"}</dd></div>
                    <div><dt>Stream</dt><dd className="mono">{selected.connectStreamId ?? "—"}</dd></div>
                    <div><dt>Status</dt><dd>{statusLabel}</dd></div>
                    <div><dt>Uptime</dt><dd>{selected.runtime.connected ? selected.runtime.uptime : "—"}</dd></div>
                    <div><dt>Messages received</dt><dd>{formatNumber(received)}</dd></div>
                  </dl>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      {showComponentPicker && (
        <div className="modal-backdrop component-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowComponentPicker(false) }}>
          <section className="component-picker" role="dialog" aria-modal="true" aria-labelledby="component-picker-title">
            <div className="modal-header">
              <div><span className="eyebrow">Redpanda Connect</span><h2 id="component-picker-title">Choose {step?.kind ?? "component"}</h2></div>
              <button className="icon-button" type="button" onClick={() => setShowComponentPicker(false)} aria-label="Close">×</button>
            </div>
            <label className="workspace-search picker-search">
              <Icon name="search" />
              <input autoFocus aria-label="Search components" placeholder="Search installed components" value={componentQuery} onChange={(event) => setComponentQuery(event.target.value)} />
              <span className="picker-count">{filteredComponents.length}</span>
            </label>
            <div className="component-picker-list">
              {filteredComponents.map((component) => (
                <button className="component-picker-row" key={component.name} type="button" onClick={() => void chooseComponent(component.name)}>
                  <span className="pipeline-row-mark"><Icon name="layers" /></span>
                  <span><strong>{component.name}</strong><small>{component.kinds.join(" · ")}{component.status ? ` · ${component.status}` : ""}</small></span>
                  <Icon name="arrow" />
                </button>
              ))}
              {filteredComponents.length === 0 && <div className="empty-inline">No installed Connect components match.</div>}
            </div>
            <p className="modal-help">Component inventory is discovered from the installed Connect runtime. Porcelain does not maintain a parallel catalogue.</p>
          </section>
        </div>
      )}

      {showCreate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false) }}>
          <form className="modal" onSubmit={(event) => { event.preventDefault(); void create() }}>
            <div className="modal-header">
              <div><span className="eyebrow">Pipeline</span><h2>New pipeline</h2></div>
              <button className="icon-button" type="button" onClick={() => setShowCreate(false)} aria-label="Close">×</button>
            </div>
            <label>Pipeline ID<input autoFocus value={newId} onChange={(event) => setNewId(event.target.value)} placeholder="temperature-normalizer" /></label>
            <label>Name<input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Temperature normalizer" /></label>
            <p className="modal-help">Creates a real Redpanda Connect stream with a stdin input and drop output. You can replace both immediately.</p>
            {error && <div className="error-banner" role="alert">{error}</div>}
            <div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create pipeline"}</button></div>
          </form>
        </div>
      )}

      {deleting && <div className="busy-indicator" role="status">Deleting pipeline…</div>}
    </div>
  )
}
