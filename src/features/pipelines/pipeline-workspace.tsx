import { useEffect, useMemo, useRef, useState } from "react"
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
import { executeMappingServer } from "./mapping-server"
import { createHistory, pushHistory, redoHistory, undoHistory, type HistoryState } from "./workspace-history"
import { filterCommands, type WorkspaceCommand } from "./commands"
import { DeepWorkSurface, type DeepWorkContext } from "./deep-work"

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

function CommandPalette({
  open,
  query,
  commands,
  options,
  context,
  activeIndex,
  onQueryChange,
  onActiveIndexChange,
  onChooseCommand,
  onChooseComponent,
  onClose,
}: {
  open: boolean
  query: string
  commands: WorkspaceCommand[]
  options: CommandOption[]
  context: Parameters<typeof filterCommands>[2]
  activeIndex: number
  onQueryChange: (value: string) => void
  onActiveIndexChange: (value: number) => void
  onChooseCommand: (command: WorkspaceCommand) => void
  onChooseComponent: (option: CommandOption) => void
  onClose: () => void
}) {
  if (!open) return null
  const commandItems = filterCommands(commands, query, context)
  const componentItems = query.trim() ? options.filter((option) => option.component.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40) : []
  const total = commandItems.length + componentItems.length
  const choose = (index: number) => {
    if (index < commandItems.length) onChooseCommand(commandItems[index])
    else if (componentItems[index - commandItems.length]) onChooseComponent(componentItems[index - commandItems.length])
  }
  return <div className="workspace-command-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="workspace-command" role="dialog" aria-modal="true" aria-labelledby="workspace-command-title">
      <div className="workspace-command-input-row"><Icon name="search" /><input autoFocus id="workspace-command-title" aria-label="Search Connect components" placeholder="Search commands or Connect components" value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); onClose() }
          if (event.key === "ArrowDown") { event.preventDefault(); onActiveIndexChange(Math.min(activeIndex + 1, Math.max(0, total - 1))) }
          if (event.key === "ArrowUp") { event.preventDefault(); onActiveIndexChange(Math.max(activeIndex - 1, 0)) }
          if (event.key === "Enter") { event.preventDefault(); choose(activeIndex) }
        }} /><kbd>ESC</kbd></div>
      <div className="workspace-command-meta"><span>{query ? "Search results" : "Workspace commands"}</span><span>{total}</span></div>
      <div className="workspace-command-list">
        {commandItems.map((command, index) => <button className={"workspace-command-item" + (index === activeIndex ? " active" : "")} key={command.id} type="button" onMouseEnter={() => onActiveIndexChange(index)} onClick={() => onChooseCommand(command)}>
          <span className="workspace-command-item-icon"><Icon name={command.group === "Deep work" ? "terminal" : command.group === "Edit" ? "layers" : "grid"} /></span><span className="workspace-command-item-copy"><strong>{command.title}</strong><small>{command.description ?? command.group}</small></span>{command.shortcut && <kbd>{command.shortcut}</kbd>}
        </button>)}
        {componentItems.map((option, offset) => { const index = commandItems.length + offset; return <button className={"workspace-command-item" + (index === activeIndex ? " active" : "")} key={option.kind + ":" + option.component.name} type="button" onMouseEnter={() => onActiveIndexChange(index)} onClick={() => onChooseComponent(option)}>
          <span className="workspace-command-item-icon"><Icon name={option.kind === "input" ? "database" : option.kind === "output" ? "arrow" : "layers"} /></span><span className="workspace-command-item-copy"><strong>{option.component.name}</strong><small>Add Connect {option.kind}</small></span><Icon name="arrow" />
        </button> })}
        {!total && <div className="workspace-command-empty">Nothing matches that search.</div>}
      </div>
      <div className="workspace-command-footer"><span><kbd>Up</kbd><kbd>Down</kbd> navigate</span><span><kbd>Enter</kbd> run</span><span><kbd>Esc</kbd> close</span></div>
    </section>
  </div>
}

function readWorkspacePanelState(pipelineId: string): { library: boolean; inspector: boolean } {
  try {
    const raw = window.localStorage.getItem("porcelain.pipeline.workspace." + pipelineId + ".panels")
    if (!raw) return { library: true, inspector: true }
    const parsed = JSON.parse(raw) as Partial<{ library: boolean; inspector: boolean }>
    return { library: parsed.library !== false, inspector: parsed.inspector !== false }
  } catch { return { library: true, inspector: true } }
}
function persistWorkspacePanelState(pipelineId: string, state: { library: boolean; inspector: boolean }) {
  try { window.localStorage.setItem("porcelain.pipeline.workspace." + pipelineId + ".panels", JSON.stringify(state)) } catch {}
}

export function PipelineWorkspace({ connectReachable, connectReady, pipelines, components = [], pipelineId }: Props) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState(pipelineId ?? pipelines[0]?.id ?? "")
  const [drafts, setDrafts] = useState<Record<string, PipelineAuthoring>>({})
  const [historyByPipeline, setHistoryByPipeline] = useState<Record<string, HistoryState>>({})
  const [selectedStep, setSelectedStep] = useState<WorkspaceSelection | null>(null)
  const [selectedSteps, setSelectedSteps] = useState<WorkspaceSelection[]>([])
  const [draftText, setDraftText] = useState("")
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newId, setNewId] = useState("")
  const [newName, setNewName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [inspectorMode, setInspectorMode] = useState<"friendly" | "advanced" | "raw">("friendly")
  const [inspectorSurface, setInspectorSurface] = useState<"configuration" | "runtime" | "diagnostics">("configuration")
  const [inspectorSearch, setInspectorSearch] = useState("")
  const [validation, setValidation] = useState<{ valid: boolean; message: string } | null>(null)
  const [libraryQuery, setLibraryQuery] = useState("")
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState("")
  const [commandIndex, setCommandIndex] = useState(0)
  const commandSelectionRef = useRef<WorkspaceSelection[] | null>(null)
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<{ pipelineId: string; connectReachable: boolean; connectReady: boolean; runtime: PipelineWorkspacePipeline["runtime"] } | null>(null)
  const [componentSchema, setComponentSchema] = useState<ConnectComponentSchema | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [mappingInput, setMappingInput] = useState(`{
  "user": {
    "name": "Ada"
  }
}`)
  const [mappingOutput, setMappingOutput] = useState("")
  const [mappingError, setMappingError] = useState<string | null>(null)
  const [mappingRunning, setMappingRunning] = useState(false)
  const [workspaceContext, setWorkspaceContext] = useState<DeepWorkContext | null>(null)
  const initialPipelineId = pipelineId ?? pipelines[0]?.id ?? ""
  const [libraryOpen, setLibraryOpen] = useState(() => readWorkspacePanelState(initialPipelineId).library)
  const [inspectorOpen, setInspectorOpen] = useState(() => readWorkspacePanelState(initialPipelineId).inspector)

  useEffect(() => { if (pipelineId) setSelectedId(pipelineId) }, [pipelineId])
  useEffect(() => {
    const state = readWorkspacePanelState(pipelines.find((pipeline) => pipeline.id === selectedId)?.id ?? initialPipelineId)
    setLibraryOpen(state.library)
    setInspectorOpen(state.inspector)
    setSelectedStep(null)
    setSelectedSteps([])
    setWorkspaceContext(null)
  }, [selectedId, pipelines, initialPipelineId])
  const selected = pipelines.find((pipeline) => pipeline.id === selectedId) ?? pipelines[0]
  const authoring = selected ? drafts[selected.id] ?? selected.authoring : undefined
  const steps = authoring ? stepsFor(authoring) : []
  const selectedStepId = selectedStep ? selectedKey(selectedStep) : null
  const step = selectedStepId ? steps.find((item) => item.id === selectedStepId) : undefined
  const savedStep = selectedStepId ? stepsFor(selected.authoring).find((item) => item.id === selectedStepId) : undefined
  const activeSelection = selectedStep ?? { kind: "input" as const }
  const stepComponent = step ? Object.keys(step.config).find((key) => key !== "label") : undefined
  const mappingConfigKey = step?.kind === "processor" ? Object.keys(step.config).find((key) => key === "mapping" || key === "bloblang") : undefined
  const isMappingProcessor = Boolean(mappingConfigKey)
  const mappingText = mappingConfigKey ? String(step?.config[mappingConfigKey] ?? "") : ""

  useEffect(() => {
    if (!isMappingProcessor) {
      setMappingOutput("")
      setMappingError(null)
      return
    }
    setMappingOutput("")
    setMappingError(null)
  }, [selectedId, selectedStep?.kind, selectedStep?.kind === "processor" ? selectedStep.index : -1, mappingConfigKey, isMappingProcessor])

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
  const dirty = selected ? JSON.stringify(authoring) !== JSON.stringify(selected.authoring) : false
  const history = selected ? historyByPipeline[selected.id] : undefined

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
      const target = event.target as HTMLElement | null
      if (target && typeof target.closest === "function" && target.closest("input, textarea, select, [contenteditable='true']")) return
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault(); setCommandOpen(true); setCommandQuery(""); setCommandIndex(0); return
      }
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && event.key.toLowerCase() === "d" && selectedSteps.length) {
        event.preventDefault()
        duplicateSelections(selectedSteps)
        return
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedSteps.some((item) => item.kind === "processor" || item.kind === "buffer")) {
        event.preventDefault()
        deleteSelections(selectedSteps)
        return
      }
      if (event.key === "Escape") {
        if (workspaceContext) {
          setWorkspaceContext(null)
          setInspectorOpen(true)
          return
        }
        if (commandOpen) {
          setCommandOpen(false)
          return
        }
        setSelectedStep(null)
        setSelectedSteps([])
        return
      }
      if (mod && event.key === "\\") {
        event.preventDefault()
        const next = !(libraryOpen && inspectorOpen)
        setLibraryOpen(next); setInspectorOpen(next)
        persistWorkspacePanelState(selected?.id ?? initialPipelineId, { library: next, inspector: next }); return
      }
      if (event.key === "[" && !mod) {
        event.preventDefault()
        const next = !libraryOpen
        setLibraryOpen(next)
        persistWorkspacePanelState(selected?.id ?? initialPipelineId, { library: next, inspector: inspectorOpen }); return
      }
      if (event.key === "]" && !mod) {
        event.preventDefault()
        const next = !inspectorOpen
        setInspectorOpen(next)
        persistWorkspacePanelState(selected?.id ?? initialPipelineId, { library: libraryOpen, inspector: next }); return
      }
      if (event.key === "Escape" && commandOpen) setCommandOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [commandOpen, libraryOpen, inspectorOpen, selected?.id, initialPipelineId])

  if (!selected || !authoring) return <div className="workspace-page pipeline-workspace"><div className="empty-state page-empty"><div className="empty-icon"><Icon name="pipeline" /></div><h3>No pipelines yet</h3><p>Create your first pipeline to start designing a native Connect stream.</p></div></div>

  const updateDraft = (next: PipelineAuthoring) => {
    setDrafts((current) => ({ ...current, [selected.id]: structuredClone(next) }))
    setHistoryByPipeline((current) => {
      const existing = current[selected.id] ?? createHistory(authoring)
      return { ...current, [selected.id]: pushHistory(existing, next) }
    })
    setValidation(null)
    setError(null)
  }

  const setDraftFromHistory = (next: PipelineAuthoring) => {
    setDrafts((current) => {
      const result = { ...current }
      if (JSON.stringify(next) === JSON.stringify(selected.authoring)) delete result[selected.id]
      else result[selected.id] = structuredClone(next)
      return result
    })
    setValidation(null)
    setError(null)
  }

  const undo = () => {
    if (!history?.past.length) return
    const next = undoHistory(history)
    setHistoryByPipeline((current) => ({ ...current, [selected.id]: next }))
    setDraftFromHistory(next.present)
  }

  const redo = () => {
    if (!history?.future.length) return
    const next = redoHistory(history)
    setHistoryByPipeline((current) => ({ ...current, [selected.id]: next }))
    setDraftFromHistory(next.present)
  }

  const deleteSelections = (selections: WorkspaceSelection[]) => {
    let next = authoring
    const processors = selections
      .filter((item): item is { kind: "processor"; index: number } => item.kind === "processor")
      .sort((a, b) => b.index - a.index)
    for (const item of processors) next = removePipelineProcessor(next, item.index)
    if (selections.some((item) => item.kind === "buffer")) next = setPipelineAuthoringBuffer(next, undefined)
    if (JSON.stringify(next) === JSON.stringify(authoring)) return
    updateDraft(next)
    const remaining = next.processors?.length
      ? [{ kind: "processor", index: Math.min(processors.at(-1)?.index ?? 0, next.processors.length - 1) } as WorkspaceSelection]
      : [{ kind: "input" as const }]
    setSelectedSteps(remaining)
    setSelectedStep(remaining[0] ?? null)
  }

  const duplicateSelections = (selections: WorkspaceSelection[]) => {
    const indexes = selections
      .filter((item): item is { kind: "processor"; index: number } => item.kind === "processor")
      .sort((a, b) => a.index - b.index)
    if (!indexes.length) return
    let next = authoring
    let offset = 0
    const created: WorkspaceSelection[] = []
    for (const item of indexes) {
      const sourceIndex = item.index + offset
      const source = next.processors?.[sourceIndex]
      if (!source) continue
      const copy = structuredClone(source)
      if (typeof copy.label === "string") copy.label += " copy"
      const target = sourceIndex + 1
      next = addPipelineProcessor(next, copy, target)
      created.push({ kind: "processor", index: target })
      offset += 1
    }
    updateDraft(next)
    setSelectedSteps(created)
    setSelectedStep(created[0] ?? null)
  }
  const updateSelectedConfig = (config: JsonObject) => {
    if (!step) return
    const component: PipelineAuthoringComponent = step.kind === "processor" ? { kind: "processor", index: activeSelection.kind === "processor" ? activeSelection.index : 0 } : { kind: step.kind }
    updateDraft(updatePipelineAuthoring(authoring, component, config)); setError(null)
  }
  const openCommand = () => { setCommandOpen(true); setCommandQuery(""); setCommandIndex(0) }

  const insertComponent = async (option: CommandOption) => {
    setCommandOpen(false); setError(null)
    try {
      const config = await createConnectComponentConfig({ data: { kind: option.kind, name: option.component.name } })
      if (option.kind === "processor") {
        const index = activeSelection.kind === "processor" ? activeSelection.index + 1 : authoring.processors?.length ?? 0
        updateDraft(addPipelineProcessor(authoring, config, index)); setSelectedStep({ kind: "processor", index }); setSelectedSteps([{ kind: "processor", index }])
      } else {
        updateDraft(updatePipelineAuthoring(authoring, { kind: option.kind }, config)); setSelectedStep({ kind: option.kind }); setSelectedSteps([{ kind: option.kind }])
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
  const addProcessor = () => { const index = authoring.processors?.length ?? 0; updateDraft(addPipelineProcessor(authoring, { processor: {} })); setSelectedStep({ kind: "processor", index }); setSelectedSteps([{ kind: "processor", index }]) }
  const toggleBuffer = () => { const next = setPipelineAuthoringBuffer(authoring, authoring.buffer ? undefined : { memory: {} }); updateDraft(next); const selection = authoring.buffer ? { kind: "input" as const } : { kind: "buffer" as const }; setSelectedStep(selection); setSelectedSteps([selection]) }
  const removeProcessor = () => {
    if (activeSelection.kind !== "processor") return
    const count = authoring.processors?.length ?? 0
    const next = removePipelineProcessor(authoring, activeSelection.index)
    updateDraft(next); const nextIndex = Math.min(activeSelection.index, Math.max(0, count - 2))
    setSelectedStep(next.processors?.length ? { kind: "processor", index: nextIndex } : { kind: "input" }); setSelectedSteps(next.processors?.length ? [{ kind: "processor", index: nextIndex }] : [{ kind: "input" }])
  }
  const moveProcessor = (direction: -1 | 1) => {
    if (activeSelection.kind !== "processor") return
    const target = activeSelection.index + direction; const count = authoring.processors?.length ?? 0
    if (target < 0 || target >= count) return
    updateDraft(movePipelineProcessor(authoring, activeSelection.index, target)); setSelectedStep({ kind: "processor", index: target }); setSelectedSteps([{ kind: "processor", index: target }])
  }

  const discard = () => { setDrafts((current) => { const next = { ...current }; delete next[selected.id]; return next }); setHistoryByPipeline((current) => { const next = { ...current }; delete next[selected.id]; return next }); setValidation(null); setError(null); setEditing(false) }
  const publish = async () => {
    if (!dirty || !validation?.valid) return
    if (validation.message.includes("restart this stream") && !window.confirm("Publishing this change will restart the running Connect stream. Continue?")) return
    setSaving(true); setError(null)
    try { await publishAuthoredPipelineServer({ data: { id: selected.id, authoring } }); setDrafts((current) => { const next = { ...current }; delete next[selected.id]; return next }); setHistoryByPipeline((current) => { const next = { ...current }; delete next[selected.id]; return next }); await router.invalidate({ sync: true }) }
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
  const setLibraryVisibility = (open: boolean) => {
    setLibraryOpen(open)
    persistWorkspacePanelState(selected.id, { library: open, inspector: inspectorOpen })
  }
  const setInspectorVisibility = (open: boolean) => {
    setInspectorOpen(open)
    persistWorkspacePanelState(selected.id, { library: libraryOpen, inspector: open })
  }
  const remove = async () => {
    if (!window.confirm("Delete pipeline " + selected.name + "? This also removes its Connect stream.")) return
    try { await deletePipeline({ data: { id: selected.id } }); await router.invalidate({ sync: true }); const next = pipelines.find((pipeline) => pipeline.id !== selected.id); if (next) await router.navigate({ to: "/pipelines/$pipelineId", params: { pipelineId: next.id } }); else await router.navigate({ to: "/pipelines" }) }
    catch (value) { setError(value instanceof Error ? value.message : "Delete failed") }
  }

  const openDeepWork = (context: DeepWorkContext) => {
    setWorkspaceContext(context)
    setInspectorOpen(false)
  }

  const commandContext = {
    selectionCount: selectedSteps.length,
    hasSelection: selectedSteps.length > 0,
    canDelete: selectedSteps.some((item) => item.kind === "processor" || item.kind === "buffer"),
    canDuplicate: selectedSteps.some((item) => item.kind === "processor"),
    canUndo: Boolean(history?.past.length),
    canRedo: Boolean(history?.future.length),
    dirty,
  }

  const commands: WorkspaceCommand[] = [
    { id: "undo", title: "Undo", description: "Revert the last authoring change", shortcut: "Cmd Z", group: "Edit", enabled: (context) => context.canUndo, run: undo },
    { id: "redo", title: "Redo", description: "Reapply the last undone change", shortcut: "Cmd Shift Z", group: "Edit", enabled: (context) => context.canRedo, run: redo },
    { id: "duplicate", title: "Duplicate selection", description: "Duplicate selected processor nodes", shortcut: "Cmd D", group: "Edit", enabled: (context) => context.canDuplicate, run: () => duplicateSelections(commandSelectionRef.current ?? selectedSteps) },
    { id: "delete", title: "Delete selection", description: "Remove selected processors or buffer", shortcut: "Delete", group: "Edit", enabled: (context) => context.canDelete, run: () => deleteSelections(commandSelectionRef.current ?? selectedSteps) },
    { id: "add-processor", title: "Add processor", description: "Insert a native Connect processor", group: "Canvas", enabled: () => Boolean(authoring), run: addProcessor },
    { id: "toggle-buffer", title: authoring.buffer ? "Remove buffer" : "Add buffer", description: "Toggle the native stream buffer", group: "Canvas", enabled: () => Boolean(authoring), run: toggleBuffer },
    { id: "mapping", title: "Open Mapping Studio", description: "Execute mappings through native Connect", group: "Deep work", enabled: () => isMappingProcessor, run: () => openDeepWork("mapping") },
    { id: "validation", title: "Open validation", description: "Run authoritative Connect validation", shortcut: "Cmd Shift V", group: "Deep work", enabled: (context) => context.dirty, run: () => openDeepWork("validation") },
    { id: "test", title: "Run native test", description: "Open the Connect unit-test surface", group: "Deep work", enabled: () => Boolean(authoring), run: () => openDeepWork("test") },
    { id: "diff", title: "Review diff", description: "Compare the draft with the published revision", group: "Deep work", enabled: (context) => context.dirty, run: () => openDeepWork("diff") },
    { id: "runtime", title: "Open runtime", description: "Inspect live stream stats", group: "Deep work", enabled: () => Boolean(selected), run: () => openDeepWork("runtime") },
    { id: "toggle-library", title: libraryOpen ? "Hide component library" : "Show component library", shortcut: "[", group: "Workspace", enabled: () => true, run: () => setLibraryVisibility(!libraryOpen) },
    { id: "toggle-inspector", title: inspectorOpen ? "Hide inspector" : "Show inspector", shortcut: "]", group: "Workspace", enabled: () => true, run: () => setInspectorVisibility(!inspectorOpen) },
    { id: "delete-pipeline", title: "Delete pipeline", description: "Remove the pipeline and its Connect stream", group: "Pipeline", enabled: () => Boolean(selected), run: () => void remove() },
  ]

  const runCommand = (id: string, selectionOverride?: WorkspaceSelection[]) => {
    const command = commands.find((item) => item.id === id)
    if (!command) return
    const context = selectionOverride ? { ...commandContext, selectionCount: selectionOverride.length, hasSelection: selectionOverride.length > 0, canDelete: selectionOverride.some((item) => item.kind === "processor" || item.kind === "buffer"), canDuplicate: selectionOverride.some((item) => item.kind === "processor") } : commandContext
    if (!command.enabled(context)) return
    commandSelectionRef.current = selectionOverride ?? null
    setCommandOpen(false)
    void Promise.resolve(command.run()).finally(() => { commandSelectionRef.current = null })
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
        <button className="workspace-command-topbar" type="button" onClick={openCommand} aria-label="Search or add Connect component">
          <Icon name="search" /><span>Search or add...</span><kbd>Cmd K</kbd>
        </button>
        <IconButton label={libraryOpen ? "Hide component library" : "Show component library"} onClick={() => setLibraryVisibility(!libraryOpen)}>
          <Icon name="panelLeft" />
        </IconButton>
        <IconButton label={inspectorOpen ? "Hide inspector" : "Show inspector"} onClick={() => setInspectorVisibility(!inspectorOpen)}>
          <Icon name="panelRight" />
        </IconButton>
        <IconButton label="New pipeline" onClick={() => setShowCreate(true)}>
          <Icon name="plus" />
        </IconButton>
        <span className="workspace-topbar-divider" />
        <Button variant="secondary" onClick={() => void validateWithConnect()} disabled={!dirty}>Validate</Button>
        <Button variant="primary" onClick={() => void publish()} disabled={!dirty || saving || !validation?.valid}>{saving ? "Publishing..." : "Publish"}</Button>
        <IconButton label="More pipeline actions" onClick={() => void remove()}><Icon name="more" /></IconButton>
      </div>
    </header>

    {error && <div className="workspace-alert error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
    {dirty && !error && <div className="workspace-alert draft" role="status"><span className="status-dot" /><span>Unpublished changes</span><span className="alert-detail">Validate the draft before publishing.</span><button type="button" onClick={discard}>Discard</button></div>}
    {validation && !error && <div className={`workspace-alert ${validation.valid ? "success" : "error"}`} role="status"><Icon name={validation.valid ? "check" : "warning"} /><span>{validation.message}</span></div>}

    <div className={`workspace-frame${libraryOpen ? " library-open" : " library-closed"}${inspectorOpen ? " inspector-open" : " inspector-closed"}`}>
      {libraryOpen && <ComponentLibrary components={components} query={libraryQuery} onQueryChange={setLibraryQuery} onOpenCommand={openCommand} onChoose={(component, kind) => void insertComponent({ component, kind })} />}
      <main className="workspace-canvas-column">
        <div className="workspace-canvas-toolbar">
          <div><span className="eyebrow">{workspaceContext ? "Deep work" : "Workspace"}</span><strong>{workspaceContext ? workspaceContext[0].toUpperCase() + workspaceContext.slice(1) : "Stream topology"}</strong></div>
          {!workspaceContext && <div className="workspace-canvas-toolbar-actions">
            <button type="button" className="workspace-toolbar-button" onClick={() => runCommand("toggle-buffer")}>{authoring.buffer ? "Remove buffer" : "Add buffer"}</button>
            <button type="button" className="workspace-toolbar-button" onClick={() => runCommand("add-processor")}><Icon name="plus" />Processor</button>
            {selectedSteps.length > 0 && <button type="button" className="workspace-toolbar-button" onClick={() => runCommand("duplicate")}>Duplicate</button>}
          </div>}
        </div>
        <div className="workspace-canvas-stage">
          {workspaceContext ? <DeepWorkSurface
            context={workspaceContext}
            authoring={authoring}
            pipelineId={selected.id}
            mapping={isMappingProcessor && step && mappingConfigKey ? {
              componentName: stepComponent ?? "mapping",
              mapping: mappingText,
              input: mappingInput,
              output: mappingOutput,
              error: mappingError,
              running: mappingRunning,
              onMappingChange: (value) => updateSelectedConfig({ ...step.config, [mappingConfigKey]: value }),
              onInputChange: (value) => { setMappingInput(value); setMappingError(null) },
              onRun: () => void runMapping(),
            } : undefined}
            validation={validation}
            runtime={runtime}
            connectReady={liveConnectReady}
            onValidate={() => void validateWithConnect()}
            onClose={() => { setWorkspaceContext(null); setInspectorOpen(true) }}
          /> : <>
            <PipelineCanvas
              key={selected.id}
              pipelineId={selected.id}
              authoring={authoring}
              runtime={runtime}
              selected={selectedStep}
              onSelect={(selection) => {
                setSelectedStep(selection)
                setSelectedSteps(selection ? [selection] : [])
                setInspectorOpen(Boolean(selection))
                setInspectorMode("friendly")
                setInspectorSurface("configuration")
                setValidation(null)
                setError(null)
              }}
              onSelectMany={(selections) => {
                setSelectedSteps(selections)
                setSelectedStep(selections[0] ?? null)
                if (selections.length) setInspectorOpen(true)
              }}
              onAuthoringChange={(next) => updateDraft(next)}
              onDuplicate={(selections) => runCommand("duplicate", selections)}
              onDelete={(selections) => runCommand("delete", selections)}
              onOpenCommand={openCommand}
            />
            <div className="workspace-canvas-hint"><span><kbd>Cmd K</kbd> commands</span><span>Shift drag to select</span><span>Cmd D duplicate</span><span>Scroll to zoom</span></div>
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

      {inspectorOpen && <aside className="workspace-inspector" aria-label="Inspector">
        <div className="workspace-inspector-header">
          <div><span className="eyebrow">{selectedSteps.length > 1 ? "selection" : step?.kind ?? "pipeline"}</span><h2>{selectedSteps.length > 1 ? selectedSteps.length + " selected" : step?.label ?? "Pipeline"}</h2>{step && <code>{stepComponent ?? "configuration"}</code>}</div>
          <IconButton label="Inspector menu" onClick={openCommand}><Icon name="more" /></IconButton>
        </div>
        <div className="inspector-mode-tabs" role="tablist" aria-label="Inspector mode">
          {(["configuration", "runtime", "diagnostics"] as const).map((mode) => <button key={mode} type="button" role="tab" aria-selected={inspectorSurface === mode} className={inspectorSurface === mode ? "active" : ""} onClick={() => setInspectorSurface(mode)}>{mode === "configuration" ? "Configure" : mode[0].toUpperCase() + mode.slice(1)}</button>)}
        </div>

        {selectedSteps.length > 1 ? <div className="workspace-inspector-multiselect">
          <div className="multi-select-summary"><strong>{selectedSteps.length} nodes selected</strong><span>Structural actions apply to the whole selection. Configuration remains per node.</span></div>
          <button className="button button-secondary" type="button" onClick={() => duplicateSelections(selectedSteps)}>Duplicate</button>
          <button className="button button-danger-ghost" type="button" onClick={() => deleteSelections(selectedSteps)}>Delete</button>
        </div> : inspectorSurface === "runtime" ? <div className="workspace-inspector-body">
          <div className="inspector-runtime-hero"><span className={"status-dot " + (runtime.connected ? "online" : "offline")} /><strong>{statusLabel}</strong><span>{runtime.connected ? runtime.uptime : "Unavailable"}</span></div>
          <dl className="detail-list"><div><dt>Connect stream</dt><dd className="mono">{selected.connectStreamId ?? "N/A"}</dd></div><div><dt>Ready</dt><dd>{liveConnectReady ? "Yes" : "No"}</dd></div><div><dt>Received</dt><dd>{runtimeSummary.received ?? "N/A"}</dd></div><div><dt>Sent</dt><dd>{runtimeSummary.sent ?? "N/A"}</dd></div><div><dt>Errors</dt><dd>{runtimeSummary.errors ?? "N/A"}</dd></div></dl>
          <button className="button button-secondary" type="button" onClick={() => openDeepWork("runtime")}>Open runtime surface</button>
        </div> : inspectorSurface === "diagnostics" ? <div className="workspace-inspector-body">
          <div className={"validation-card " + (validation ? validation.valid ? "valid" : "invalid" : "")} role="status"><Icon name={validation?.valid ? "check" : "warning"} /><div><strong>{validation ? (validation.valid ? "Connect accepted the draft" : "Connect rejected the draft") : "No diagnostics yet"}</strong><p>{validation?.message ?? "Run native validation to receive authoritative Connect diagnostics."}</p></div></div>
          <button className="button button-primary" type="button" onClick={() => openDeepWork("validation")}>Open validation</button>
          <button className="button button-secondary" type="button" onClick={() => openDeepWork("test")}>Run native test</button>
          <button className="button button-secondary" type="button" onClick={() => openDeepWork("diff")} disabled={!dirty}>Review diff</button>
        </div> : step ? <>
          {step.kind !== "buffer" && <div className="workspace-inspector-component"><div><span>Connect component</span><strong>{stepComponent ?? "Not configured"}</strong></div><button type="button" onClick={openCommand}>Change</button></div>}
          <div className="workspace-inspector-search"><Icon name="search" /><input aria-label="Search configuration fields" placeholder="Search fields..." value={inspectorSearch} onChange={(event) => setInspectorSearch(event.target.value)} /></div>
          <div className="workspace-inspector-tabs" role="tablist" aria-label="Configuration view">
            {(["friendly", "advanced", "raw"] as const).map((mode) => <button key={mode} className={inspectorMode === mode ? "active" : ""} type="button" role="tab" aria-selected={inspectorMode === mode} onClick={() => { setInspectorMode(mode); setEditing(false); if (mode === "raw") setDraftText(stringify(authoringToConnectConfig(authoring), { lineWidth: 120 })) }}>{mode === "friendly" ? "Fields" : mode === "advanced" ? "Advanced" : "Source"}</button>)}
          </div>
          <div className="workspace-inspector-body">
            {inspectorMode === "friendly" && <section className="workspace-inspector-section">
              <div className="section-intro"><strong>Native schema</strong><span>Live from Redpanda Connect</span></div>
              {schemaLoading && <div className="inspector-empty">Loading native Connect schema...</div>}
              {schemaError && <div className="error-banner" role="alert">{schemaError}</div>}
              {!schemaLoading && !schemaError && componentSchema && <NativeInspector config={step.config} initialConfig={savedStep?.config} schema={componentSchema} search={inspectorSearch} onChange={updateSelectedConfig} />}
            </section>}
            {inspectorMode === "advanced" && <section className="workspace-inspector-section">
              <div className="section-intro"><strong>Advanced configuration</strong><span>Native component JSON</span></div>
              <textarea className="config-editor" aria-label="Step configuration" value={editing ? draftText : JSON.stringify(step.config, null, 2)} onChange={(event) => { setDraftText(event.target.value); setEditing(true) }} spellCheck={false} />
            </section>}
            {inspectorMode === "raw" && <section className="workspace-inspector-section">
              <div className="section-intro"><strong>Native Connect source</strong><span>YAML - full stream</span></div>
              <textarea className="config-editor config-editor-tall" aria-label="Raw Connect YAML configuration" value={draftText || stringify(authoringToConnectConfig(authoring), { lineWidth: 120 })} onChange={(event) => setDraftText(event.target.value)} spellCheck={false} />
            </section>}
            {validation && <div className={"validation-card " + (validation.valid ? "valid" : "invalid")} role="status"><Icon name={validation.valid ? "check" : "warning"} /><div><strong>{validation.valid ? "Connect accepted the draft" : "Connect rejected the draft"}</strong><p>{validation.message}</p></div></div>}
            <div className="workspace-inspector-actions">
              {step.kind === "processor" && <><button className="button button-secondary" type="button" onClick={() => moveProcessor(-1)} disabled={activeSelection.kind !== "processor" || activeSelection.index === 0}>Move up</button><button className="button button-secondary" type="button" onClick={() => moveProcessor(1)} disabled={activeSelection.kind !== "processor" || activeSelection.index === processorCount - 1}>Move down</button><button className="button button-danger-ghost" type="button" onClick={() => deleteSelections([{ kind: "processor", index: activeSelection.kind === "processor" ? activeSelection.index : 0 }])}>Delete</button></>}
              {step.kind === "buffer" && <button className="button button-secondary" type="button" onClick={toggleBuffer}>Remove buffer</button>}
              {isMappingProcessor && <button className="button button-primary" type="button" onClick={() => { setMappingError(null); openDeepWork("mapping") }}><Icon name="arrow" />Open Mapping Studio</button>}
              {inspectorMode === "friendly" && <button className="button button-secondary" type="button" onClick={() => { beginEdit(); setInspectorMode("advanced") }}>Edit as JSON</button>}
              {inspectorMode === "advanced" && <><button className="button button-primary" type="button" onClick={applyEdit}>Apply change</button><button className="button button-ghost" type="button" onClick={() => setEditing(false)}>Cancel</button></>}
              {inspectorMode === "raw" && <button className="button button-primary" type="button" onClick={applyRaw}>Apply source</button>}
              <button className="button button-secondary" type="button" onClick={() => openDeepWork("validation")} disabled={!dirty}>Validate draft</button>
              <button className="text-button" type="button" onClick={() => void normalizeWithConnect()}>Normalize with Connect <Icon name="arrow" /></button>
            </div>
            {dirty && <div className="inspector-dirty-state"><span className="status-dot" />Draft differs from published configuration <button className="text-button" type="button" onClick={discard}>Revert draft</button></div>}
          </div>
        </> : <div className="workspace-inspector-body"><div className="workspace-inspector-empty"><Icon name="pipeline" /><strong>Select a node</strong><span>Choose a node on the canvas to configure it.</span></div><div className="workspace-inspector-runtime"><div className="section-intro"><strong>Runtime</strong><span>Live from Connect</span></div><dl className="detail-list"><div><dt>Stream</dt><dd className="mono">{selected.connectStreamId ?? "N/A"}</dd></div><div><dt>Status</dt><dd>{statusLabel}</dd></div><div><dt>Uptime</dt><dd>{runtime.connected ? runtime.uptime : "N/A"}</dd></div></dl></div></div>}
      </aside>}
      {!libraryOpen && <button className="workspace-edge-toggle workspace-edge-toggle-left" type="button" onClick={() => setLibraryVisibility(true)} aria-label="Show component library" title="Show component library [">
        <Icon name="panelLeft" />
      </button>}
      {!inspectorOpen && <button className="workspace-edge-toggle workspace-edge-toggle-right" type="button" onClick={() => setInspectorVisibility(true)} aria-label="Show inspector" title="Show inspector ]">
        <Icon name="panelRight" />
      </button>}
    </div>

    <CommandPalette
      open={commandOpen}
      query={commandQuery}
      commands={commands}
      options={commandOptions}
      context={commandContext}
      activeIndex={commandIndex}
      onQueryChange={(query) => { setCommandQuery(query); setCommandIndex(0) }}
      onActiveIndexChange={setCommandIndex}
      onChooseCommand={(command) => runCommand(command.id)}
      onChooseComponent={(option) => void insertComponent(option)}
      onClose={() => setCommandOpen(false)}
    />

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
