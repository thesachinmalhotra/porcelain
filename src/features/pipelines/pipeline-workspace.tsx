import { useEffect, useMemo, useState } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { parse, stringify } from "yaml"
import type { JsonObject, PipelineAuthoring, PipelineAuthoringComponent } from "../../pipeline/authoring"
import { addPipelineProcessor, authoringToConnectConfig, movePipelineProcessor, projectPipelineAuthoring, removePipelineProcessor, replacePipelineAuthoringConfig, setPipelineAuthoringBuffer, updatePipelineAuthoring } from "../../pipeline/authoring"
import type { PipelineWorkspacePipeline } from "../../pipeline/pipeline"
import { createAuthoredPipelineServer, deletePipeline, publishAuthoredPipelineServer, validateAuthoredPipelineServer } from "./server"
import { getPipelineRuntime } from "./runtime-server"
import { connectPipelineRuntimeSummary } from "../../runtime/connect/stats"
import { Icon } from "../../components/app-shell"
import { createConnectComponentConfig, getConnectComponentSchema, normalizeConnectConfig } from "../components/server"
import type { ConnectComponentCapability } from "../../runtime/connect/capabilities"
import type { ConnectComponentSchema } from "../../runtime/connect/schema"
import { ComponentLibrary, PipelineCanvas, type WorkspaceComponentKind, type WorkspaceSelection } from "./pipeline-canvas"
import { Button, IconButton } from "../../ui/primitives"
import { NativeInspector } from "./native-inspector"
import { MappingStudio } from "./mapping-studio"
import { executeMappingServer } from "./mapping-server"

type Props = { connectReachable: boolean; connectReady: boolean; pipelines: PipelineWorkspacePipeline[]; components?: ConnectComponentCapability[]; pipelineId?: string }
type Step = { id: string; label: string; kind: WorkspaceSelection["kind"]; config: JsonObject }
type CommandOption = { component: ConnectComponentCapability; kind: Exclude<WorkspaceComponentKind, "buffer"> }

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value)
const selectedKey = (selection: WorkspaceSelection) => selection.kind === "processor" ? `processor-${selection.index}` : selection.kind

function stepsFor(authoring: PipelineAuthoring): Step[] {
  const projection = projectPipelineAuthoring(authoring)
  return [
    { id: "input", label: "Input", kind: "input", config: projection.input },
    ...(projection.buffer ? [{ id: "buffer", label: "Buffer", kind: "buffer" as const, config: projection.buffer }] : []),
    ...(projection.processors ?? []).map((config, index) => ({ id: `processor-${index}`, label: `Processor ${index + 1}`, kind: "processor" as const, config })),
    { id: "output", label: "Output", kind: "output", config: projection.output },
  ]
}

function CommandPalette({ open, query, options, activeIndex, onQueryChange, onActiveIndexChange, onChoose, onClose }: {
  open: boolean; query: string; options: CommandOption[]; activeIndex: number; onQueryChange: (value: string) => void
  onActiveIndexChange: (value: number) => void; onChoose: (option: CommandOption) => void; onClose: () => void
}) {
  if (!open) return null
  return <div className="workspace-command-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="workspace-command" role="dialog" aria-modal="true" aria-labelledby="workspace-command-title">
      <div className="workspace-command-input-row"><Icon name="search" /><input autoFocus id="workspace-command-title" aria-label="Search Connect components" placeholder="Add a Connect component?" value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose()
          if (event.key === "ArrowDown") { event.preventDefault(); onActiveIndexChange(Math.min(activeIndex + 1, Math.max(0, options.length - 1))) }
          if (event.key === "ArrowUp") { event.preventDefault(); onActiveIndexChange(Math.max(activeIndex - 1, 0)) }
          if (event.key === "Enter" && options[activeIndex]) { event.preventDefault(); onChoose(options[activeIndex]) }
        }} /><kbd>ESC</kbd></div>
      <div className="workspace-command-meta"><span>Redpanda Connect</span><span>{options.length} results</span></div>
      <div className="workspace-command-list">{options.map((option, index) =>
        <button className={`workspace-command-item${index === activeIndex ? " active" : ""}`} key={`${option.kind}:${option.component.name}`} type="button" onMouseEnter={() => onActiveIndexChange(index)} onClick={() => onChoose(option)}>
          <span className="workspace-command-item-icon"><Icon name={option.kind === "input" ? "database" : option.kind === "output" ? "arrow" : "layers"} /></span>
          <span className="workspace-command-item-copy"><strong>{option.component.name}</strong><small>{option.kind}{option.component.status ? ` ? ${option.component.status}` : ""}</small></span><Icon name="arrow" />
        </button>
      )}{!options.length && <div className="workspace-command-empty">No installed Connect components match.</div>}</div>
      <div className="workspace-command-footer"><span><kbd>?</kbd><kbd>?</kbd> navigate</span><span><kbd>?</kbd> insert</span><span><kbd>esc</kbd> close</span></div>
    </section>
  </div>
}

export function PipelineWorkspace({ connectReachable, connectReady, pipelines, components = [], pipelineId }: Props) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState(pipelineId ?? pipelines[0]?.id ?? "")
  const [drafts, setDrafts] = useState<Record<string, PipelineAuthoring>>({})
  const [selectedStep, setSelectedStep] = useState<WorkspaceSelection>({ kind: "input" })
  const [draftText, setDraftText] = useState("")
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newId, setNewId] = useState("")
  const [newName, setNewName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [inspectorMode, setInspectorMode] = useState<"friendly" | "advanced" | "raw">("friendly")
  const [validation, setValidation] = useState<{ valid: boolean; message: string } | null>(null)
  const [libraryQuery, setLibraryQuery] = useState("")
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState("")
  const [commandIndex, setCommandIndex] = useState(0)
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<{ pipelineId: string; connectReachable: boolean; connectReady: boolean; runtime: PipelineWorkspacePipeline["runtime"] } | null>(null)
  const [componentSchema, setComponentSchema] = useState<ConnectComponentSchema | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [mappingStudioOpen, setMappingStudioOpen] = useState(false)
  const [mappingInput, setMappingInput] = useState(`{
  "user": {
    "name": "Ada"
  }
}`)
  const [mappingOutput, setMappingOutput] = useState("")
  const [mappingError, setMappingError] = useState<string | null>(null)
  const [mappingRunning, setMappingRunning] = useState(false)

  useEffect(() => { if (pipelineId) setSelectedId(pipelineId) }, [pipelineId])
  const selected = pipelines.find((pipeline) => pipeline.id === selectedId) ?? pipelines[0]
  const authoring = selected ? drafts[selected.id] ?? selected.authoring : undefined
  const steps = authoring ? stepsFor(authoring) : []
  const selectedStepId = selectedKey(selectedStep)
  const step = steps.find((item) => item.id === selectedStepId) ?? steps[0]
  const stepComponent = step ? Object.keys(step.config).find((key) => key !== "label") : undefined
  const mappingConfigKey = step?.kind === "processor" ? Object.keys(step.config).find((key) => key === "mapping" || key === "bloblang") : undefined
  const isMappingProcessor = Boolean(mappingConfigKey)
  const mappingText = mappingConfigKey ? String(step?.config[mappingConfigKey] ?? "") : ""

  useEffect(() => {
    if (!isMappingProcessor) {
      setMappingStudioOpen(false)
      setMappingOutput("")
      setMappingError(null)
      return
    }
    setMappingOutput("")
    setMappingError(null)
  }, [selectedId, selectedStep.kind, selectedStep.kind === "processor" ? selectedStep.index : -1, mappingConfigKey, isMappingProcessor])

  useEffect(() => {
    let cancelled = false
    if (!step || !stepComponent) {
      setComponentSchema(null)
      setSchemaError(null)
      setSchemaLoading(false)
      return
    }
    setSchemaLoading(true)
    setSchemaError(null)
    void getConnectComponentSchema({ data: { kind: step.kind, name: stepComponent } })
      .then((schema) => { if (!cancelled) setComponentSchema(schema) })
      .catch((value) => { if (!cancelled) { setComponentSchema(null); setSchemaError(value instanceof Error ? value.message : "Connect schema discovery failed") } })
      .finally(() => { if (!cancelled) setSchemaLoading(false) })
    return () => { cancelled = true }
  }, [step?.kind, stepComponent])
  const dirty = selected ? Boolean(drafts[selected.id]) : false

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    const refresh = async () => {
      try { const snapshot = await getPipelineRuntime({ data: { id: selected.id } }); if (!cancelled) setRuntimeSnapshot({ pipelineId: selected.id, ...snapshot }) } catch {}
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 2000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [selected?.id])

  const live = runtimeSnapshot?.pipelineId === selected?.id ? runtimeSnapshot : null
  const runtime = live?.runtime ?? selected?.runtime
  const liveConnectReachable = live?.connectReachable ?? connectReachable
  const liveConnectReady = live?.connectReady ?? connectReady
  const statusLabel = !runtime.connected ? "Disconnected" : runtime.active ? "Running" : "Stopped"
  const statusClass = !runtime.connected ? "status-disconnected" : runtime.active ? "status-running" : "status-inactive"
  const runtimeSummary = connectPipelineRuntimeSummary(runtime.stats)
  const processorCount = authoring?.processors?.length ?? 0

  const commandOptions = useMemo<CommandOption[]>(() => {
    const normalized = commandQuery.trim().toLowerCase()
    const kinds: Array<Exclude<WorkspaceComponentKind, "buffer">> = ["input", "processor", "output"]
    return components.flatMap((component) => kinds.filter((kind) => component.kinds.includes(kind)).map((kind) => ({ component, kind })))
      .filter((option) => !normalized || option.component.name.toLowerCase().includes(normalized)).slice(0, 80)
  }, [commandQuery, components])

  useEffect(() => { setCommandIndex((current) => Math.min(current, Math.max(0, commandOptions.length - 1))) }, [commandOptions.length])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen(true); setCommandQuery(""); setCommandIndex(0) }
      if (event.key === "Escape" && commandOpen) setCommandOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [commandOpen])

  if (!selected || !authoring) return <div className="workspace-page pipeline-workspace"><div className="empty-state page-empty"><div className="empty-icon"><Icon name="pipeline" /></div><h3>No pipelines yet</h3><p>Create your first pipeline to start designing a native Connect stream.</p></div></div>

  const updateDraft = (next: PipelineAuthoring) => { setDrafts((current) => ({ ...current, [selected.id]: next })); setValidation(null) }
  const updateSelectedConfig = (config: JsonObject) => {
    if (!step) return
    const component: PipelineAuthoringComponent = step.kind === "processor" ? { kind: "processor", index: selectedStep.kind === "processor" ? selectedStep.index : 0 } : { kind: step.kind }
    updateDraft(updatePipelineAuthoring(authoring, component, config)); setError(null)
  }
  const openCommand = () => { setCommandOpen(true); setCommandQuery(""); setCommandIndex(0) }

  const insertComponent = async (option: CommandOption) => {
    setCommandOpen(false); setError(null)
    try {
      const config = await createConnectComponentConfig({ data: { kind: option.kind, name: option.component.name } })
      if (option.kind === "processor") {
        const index = selectedStep.kind === "processor" ? selectedStep.index + 1 : authoring.processors?.length ?? 0
        updateDraft(addPipelineProcessor(authoring, config, index)); setSelectedStep({ kind: "processor", index })
      } else {
        updateDraft(updatePipelineAuthoring(authoring, { kind: option.kind }, config)); setSelectedStep({ kind: option.kind })
      }
      setInspectorMode("friendly"); setEditing(false)
    } catch (value) { setError(value instanceof Error ? value.message : "Redpanda Connect component generation failed") }
  }

  const runMapping = async () => {
    if (!isMappingProcessor || !mappingConfigKey) return
    setMappingRunning(true)
    setMappingError(null)
    try {
      const result = await executeMappingServer({ data: { mapping: mappingText, input: mappingInput } })
      if (!result.ok) {
        setMappingOutput("")
        setMappingError(result.error)
        return
      }
      setMappingOutput(result.output)
    } catch (value) {
      setMappingOutput("")
      setMappingError(value instanceof Error ? value.message : "Connect mapping execution failed")
    } finally {
      setMappingRunning(false)
    }
  }

  const validateWithConnect = async () => {
    setValidation(null); setError(null)
    try {
      const result = await validateAuthoredPipelineServer({ data: { id: selected.id, authoring } })
      setValidation({ valid: result.valid, message: result.valid ? result.restartRequired ? "Connect accepted the draft. Publishing will restart this stream." : "Connect accepted the draft. It is ready to publish." : result.output })
    } catch (value) { setValidation({ valid: false, message: value instanceof Error ? value.message : "Connect validation failed" }) }
  }

  const normalizeWithConnect = async () => {
    if (!step) return
    try { const config = await normalizeConnectConfig({ data: { config: step.config } }); updateSelectedConfig(config); setValidation({ valid: true, message: "Connect returned the normalized native configuration." }) }
    catch (value) { setValidation({ valid: false, message: value instanceof Error ? value.message : "Connect normalization failed" }) }
  }

  const beginEdit = () => { if (step) { setDraftText(JSON.stringify(step.config, null, 2)); setEditing(true) } }
  const applyEdit = () => {
    try { const value = JSON.parse(draftText) as unknown; if (!isObject(value)) throw new Error("Configuration must be a JSON object"); updateSelectedConfig(value); setEditing(false) }
    catch (value) { setError(value instanceof Error ? value.message : "Invalid JSON") }
  }
  const applyRaw = () => {
    try { const value = parse(draftText) as unknown; if (!isObject(value)) throw new Error("Raw configuration must be a YAML/JSON object"); updateDraft(replacePipelineAuthoringConfig(authoring, value)); setError(null) }
    catch (value) { setError(value instanceof Error ? value.message : "Invalid YAML/JSON") }
  }
  const addProcessor = () => { const index = authoring.processors?.length ?? 0; updateDraft(addPipelineProcessor(authoring, { processor: {} })); setSelectedStep({ kind: "processor", index }) }
  const toggleBuffer = () => { updateDraft(setPipelineAuthoringBuffer(authoring, authoring.buffer ? undefined : { memory: {} })); setSelectedStep({ kind: authoring.buffer ? "input" : "buffer" }) }
  const removeProcessor = () => {
    if (selectedStep.kind !== "processor") return
    const count = authoring.processors?.length ?? 0
    const next = removePipelineProcessor(authoring, selectedStep.index)
    updateDraft(next); const nextIndex = Math.min(selectedStep.index, Math.max(0, count - 2))
    setSelectedStep(next.processors?.length ? { kind: "processor", index: nextIndex } : { kind: "input" })
  }
  const moveProcessor = (direction: -1 | 1) => {
    if (selectedStep.kind !== "processor") return
    const target = selectedStep.index + direction; const count = authoring.processors?.length ?? 0
    if (target < 0 || target >= count) return
    updateDraft(movePipelineProcessor(authoring, selectedStep.index, target)); setSelectedStep({ kind: "processor", index: target })
  }

  const discard = () => { setDrafts((current) => { const next = { ...current }; delete next[selected.id]; return next }); setValidation(null); setError(null); setEditing(false) }
  const publish = async () => {
    if (!dirty || !validation?.valid) return
    if (validation.message.includes("restart this stream") && !window.confirm("Publishing this change will restart the running Connect stream. Continue?")) return
    setSaving(true); setError(null)
    try { await publishAuthoredPipelineServer({ data: { id: selected.id, authoring } }); setDrafts((current) => { const next = { ...current }; delete next[selected.id]; return next }); await router.invalidate({ sync: true }) }
    catch (value) { const message = value instanceof Error ? value.message : "Publish failed"; setError(message); setValidation({ valid: false, message }) }
    finally { setSaving(false) }
  }
  const create = async () => {
    const id = newId.trim(); const name = newName.trim()
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) { setError("Pipeline ID must use lowercase letters, numbers, hyphens, or underscores"); return }
    if (!name) { setError("Pipeline name is required"); return }
    setSaving(true); setError(null)
    try { await createAuthoredPipelineServer({ data: { id, name, input: { stdin: {} }, output: { drop: {} } } }); setShowCreate(false); setNewId(""); setNewName(""); await router.invalidate({ sync: true }); await router.navigate({ to: `/pipelines/${id}`, params: { pipelineId: id } }) }
    catch (value) { setError(value instanceof Error ? value.message : "Create failed") }
    finally { setSaving(false) }
  }
  const remove = async () => {
    if (!window.confirm("Delete pipeline " + selected.name + "? This also removes its Connect stream.")) return
    try { await deletePipeline({ data: { id: selected.id } }); await router.invalidate({ sync: true }); const next = pipelines.find((pipeline) => pipeline.id !== selected.id); if (next) await router.navigate({ to: "/pipelines/$pipelineId", params: { pipelineId: next.id } }); else await router.navigate({ to: "/pipelines" }) }
    catch (value) { setError(value instanceof Error ? value.message : "Delete failed") }
  }

  return <div className="pipeline-workspace-v2">
    <header className="workspace-topbar">
      <div className="workspace-topbar-identity">
        <Link to="/pipelines" className="workspace-back"><Icon name="arrow" /></Link>
        <div className="workspace-breadcrumbs"><Link to="/pipelines">Pipelines</Link><span>/</span><strong>{selected.id}</strong></div>
        <span className="workspace-title-separator" /><h1>{selected.name}</h1>
        <span className={`status workspace-status ${statusClass}`}><span className="status-dot" />{statusLabel}</span>
        {dirty && <span className="draft-pill">Draft</span>}
      </div>
      <div className="workspace-topbar-actions">
        <button className="workspace-command-topbar" type="button" onClick={openCommand}><Icon name="search" /><span>Search components</span><kbd>?K</kbd></button>
        <Button variant="ghost" onClick={() => setShowCreate(true)} aria-label="New pipeline"><Icon name="plus" />New</Button>
        <Button variant="secondary" onClick={() => void validateWithConnect()} disabled={!dirty}>Validate</Button>
        <Button variant="primary" onClick={() => void publish()} disabled={!dirty || saving || !validation?.valid}>{saving ? "Publishing?" : "Publish"}</Button>
        <IconButton label="More pipeline actions" onClick={() => void remove()}><Icon name="more" /></IconButton>
      </div>
    </header>

    {error && <div className="workspace-alert error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
    {dirty && !error && <div className="workspace-alert draft" role="status"><span className="status-dot" /><span>Unpublished changes</span><span className="alert-detail">Validate the draft before publishing.</span><button type="button" onClick={discard}>Discard</button></div>}
    {validation && !error && <div className={`workspace-alert ${validation.valid ? "success" : "error"}`} role="status"><Icon name={validation.valid ? "check" : "warning"} /><span>{validation.message}</span></div>}

    <div className="workspace-frame">
      <ComponentLibrary components={components} query={libraryQuery} onQueryChange={setLibraryQuery} onOpenCommand={openCommand} onChoose={(component, kind) => void insertComponent({ component, kind })} />
      <main className="workspace-canvas-column">
        <div className="workspace-canvas-toolbar">
          <div><span className="eyebrow">Workspace</span><strong>{mappingStudioOpen ? "Mapping Studio" : "Stream topology"}</strong></div>
          {!mappingStudioOpen && <div className="workspace-canvas-toolbar-actions">
            <button type="button" className="workspace-toolbar-button" onClick={toggleBuffer}>{authoring.buffer ? "Remove buffer" : "Add buffer"}</button>
            <button type="button" className="workspace-toolbar-button" onClick={addProcessor}><Icon name="plus" />Processor</button>
          </div>}
        </div>
        <div className="workspace-canvas-stage">
          {mappingStudioOpen && isMappingProcessor && step && mappingConfigKey ? <MappingStudio
            componentName={stepComponent ?? "mapping"}
            mapping={mappingText}
            input={mappingInput}
            output={mappingOutput}
            error={mappingError}
            running={mappingRunning}
            onMappingChange={(value) => updateSelectedConfig({ ...step.config, [mappingConfigKey]: value })}
            onInputChange={(value) => { setMappingInput(value); setMappingError(null) }}
            onRun={() => void runMapping()}
            onClose={() => setMappingStudioOpen(false)}
          /> : <>
            <PipelineCanvas
              authoring={authoring}
              runtime={runtime}
              selected={selectedStep}
              onSelect={(selection) => {
                setSelectedStep(selection)
                setInspectorMode("friendly")
                setValidation(null)
                setError(null)
                const next = steps.find((item) => item.id === selectedKey(selection))
                const nextMapping = next?.kind === "processor" && Object.keys(next.config).some((key) => key === "mapping" || key === "bloblang")
                setMappingStudioOpen(Boolean(nextMapping))
              }}
              onAuthoringChange={(next) => updateDraft(next)}
            />
            <div className="workspace-canvas-hint"><span><kbd>?K</kbd> add component</span><span>Drag to arrange</span><span>Scroll to zoom</span></div>
          </>}
        </div>
        <div className="workspace-canvas-footer">
          <span><span className={`status-dot ${liveConnectReady ? "online" : "offline"}`} />{!liveConnectReachable ? "Connect unreachable" : liveConnectReady ? "Redpanda Connect ready" : "Connect not ready"}</span>
          <button type="button" onClick={() => { setDraftText(stringify(authoringToConnectConfig(authoring), { lineWidth: 120 })); setInspectorMode("raw") }}>View native config <Icon name="arrow" /></button>
        </div>
        <div className="workspace-runtime-strip">
          <div className={`runtime-state ${statusClass}`}><span className="status-dot" /><strong>{statusLabel}</strong></div>
          <div><span>Uptime</span><strong>{runtime.connected ? runtime.uptime : "?"}</strong></div>
          <div><span>Received</span><strong>{typeof runtimeSummary.received === "number" ? new Intl.NumberFormat().format(runtimeSummary.received) : "?"}</strong></div>
          <div><span>Sent</span><strong>{typeof runtimeSummary.sent === "number" ? new Intl.NumberFormat().format(runtimeSummary.sent) : "?"}</strong></div>
          <div><span>Errors</span><strong className={runtimeSummary.errors > 0 ? "runtime-error" : ""}>{typeof runtimeSummary.errors === "number" ? new Intl.NumberFormat().format(runtimeSummary.errors) : "?"}</strong></div>
          <div><span>Processors</span><strong>{processorCount}</strong></div>
        </div>
      </main>

      <aside className="workspace-inspector" aria-label="Inspector">
        <div className="workspace-inspector-header">
          <div><span className="eyebrow">{step?.kind ?? "pipeline"}</span><h2>{step?.label ?? "Pipeline"}</h2>{step && <code>{Object.keys(step.config)[0] ?? "configuration"}</code>}</div>
          {step?.kind === "processor" && <IconButton label="Processor options"><Icon name="more" /></IconButton>}
        </div>
        {step && <>
          {step.kind !== "buffer" && <div className="workspace-inspector-component"><div><span>Connect component</span><strong>{Object.keys(step.config).find((key) => key !== "label") ?? "Not configured"}</strong></div><button type="button" onClick={openCommand}>Change</button></div>}
          <div className="workspace-inspector-tabs" role="tablist" aria-label="Configuration view">
            {(["friendly", "advanced", "raw"] as const).map((mode) => <button key={mode} className={inspectorMode === mode ? "active" : ""} type="button" role="tab" aria-selected={inspectorMode === mode} onClick={() => { setInspectorMode(mode); setEditing(false); if (mode === "raw") setDraftText(stringify(authoringToConnectConfig(authoring), { lineWidth: 120 })) }}>{mode === "friendly" ? "Configure" : mode === "advanced" ? "Advanced" : "Source"}</button>)}
          </div>
          <div className="workspace-inspector-body">
            {inspectorMode === "friendly" && <section className="workspace-inspector-section"><div className="section-intro"><strong>Configuration</strong><span>Native Connect schema</span></div>{schemaLoading && <div className="inspector-empty">Loading the native Connect schema…</div>}{schemaError && <div className="error-banner" role="alert">{schemaError}</div>}{!schemaLoading && !schemaError && componentSchema && <NativeInspector config={step.config} schema={componentSchema} onChange={updateSelectedConfig} />}</section>}
            {inspectorMode === "advanced" && <section className="workspace-inspector-section"><div className="section-intro"><strong>Advanced configuration</strong><span>JSON for this component</span></div><textarea className="config-editor" aria-label="Step configuration" value={editing ? draftText : JSON.stringify(step.config, null, 2)} onChange={(event) => { setDraftText(event.target.value); setEditing(true) }} spellCheck={false} /></section>}
            {inspectorMode === "raw" && <section className="workspace-inspector-section"><div className="section-intro"><strong>Native Connect source</strong><span>YAML ? full stream</span></div><textarea className="config-editor config-editor-tall" aria-label="Raw Connect YAML configuration" value={draftText || stringify(authoringToConnectConfig(authoring), { lineWidth: 120 })} onChange={(event) => setDraftText(event.target.value)} spellCheck={false} /></section>}
            {validation && <div className={`validation-card ${validation.valid ? "valid" : "invalid"}`} role="status"><Icon name={validation.valid ? "check" : "warning"} /><div><strong>{validation.valid ? "Connect accepted the draft" : "Connect rejected the draft"}</strong><p>{validation.message}</p></div></div>}
            <div className="workspace-inspector-actions">
              {step.kind === "processor" && <><button className="button button-secondary" type="button" onClick={() => moveProcessor(-1)} disabled={selectedStep.kind !== "processor" || selectedStep.index === 0}>Move up</button><button className="button button-secondary" type="button" onClick={() => moveProcessor(1)} disabled={selectedStep.kind !== "processor" || selectedStep.index === (authoring.processors?.length ?? 1) - 1}>Move down</button><button className="button button-danger-ghost" type="button" onClick={removeProcessor}>Delete processor</button></>}
              {step.kind === "buffer" && <button className="button button-secondary" type="button" onClick={toggleBuffer}>Remove buffer</button>}
              {isMappingProcessor && <button className="button button-primary" type="button" onClick={() => { setMappingError(null); setMappingStudioOpen(true) }}><Icon name="arrow" />Open Mapping Studio</button>}
              {inspectorMode === "friendly" && <button className="button button-secondary" type="button" onClick={() => { beginEdit(); setInspectorMode("advanced") }}>Edit as JSON</button>}
              {inspectorMode === "advanced" && <><button className="button button-primary" type="button" onClick={applyEdit}>Apply change</button><button className="button button-ghost" type="button" onClick={() => setEditing(false)}>Cancel</button></>}
              {inspectorMode === "raw" && <button className="button button-primary" type="button" onClick={applyRaw}>Apply source</button>}
              <button className="button button-secondary" type="button" onClick={() => void validateWithConnect()} disabled={!dirty}>Validate with Connect</button>
              <button className="text-button" type="button" onClick={() => void normalizeWithConnect()}>Normalize with Connect <Icon name="arrow" /></button>
            </div>
            <div className="workspace-inspector-runtime"><div className="section-intro"><strong>Runtime</strong><span>Live from Connect ? 2s</span></div><dl className="detail-list"><div><dt>Connection</dt><dd>{runtime.connected ? "Connected" : "Unavailable"}</dd></div><div><dt>Stream</dt><dd className="mono">{selected.connectStreamId ?? "?"}</dd></div><div><dt>Status</dt><dd>{statusLabel}</dd></div><div><dt>Uptime</dt><dd>{runtime.connected ? runtime.uptime : "?"}</dd></div></dl></div>
          </div>
        </>}
      </aside>
    </div>

    <CommandPalette open={commandOpen} query={commandQuery} options={commandOptions} activeIndex={commandIndex} onQueryChange={(query) => { setCommandQuery(query); setCommandIndex(0) }} onActiveIndexChange={setCommandIndex} onChoose={(option) => void insertComponent(option)} onClose={() => setCommandOpen(false)} />

    {showCreate && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false) }}><form className="modal" onSubmit={(event) => { event.preventDefault(); void create() }}>
      <div className="modal-header"><div><span className="eyebrow">Pipeline</span><h2>New pipeline</h2></div><button className="icon-button" type="button" onClick={() => setShowCreate(false)} aria-label="Close">?</button></div>
      <label>Pipeline ID<input autoFocus value={newId} onChange={(event) => setNewId(event.target.value)} placeholder="pipeline-id" /></label>
      <label>Name<input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Pipeline" /></label>
      <p className="modal-help">Creates a real Redpanda Connect stream with a native stdin input and drop output. Replace either component from the workspace.</p>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Creating?" : "Create pipeline"}</button></div>
    </form></div>}
  </div>
}
