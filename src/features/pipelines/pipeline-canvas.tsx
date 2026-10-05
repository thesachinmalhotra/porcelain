import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Background,
  Controls,
  NodeToolbar,
  Panel,
  type Connection,
  Handle,
  Position,
  ReactFlow,
  SelectionMode,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Edge,
  type Node,
  type NodeProps,
  type Viewport,
} from "@xyflow/react"
import type { JsonObject, PipelineAuthoring } from "../../pipeline/authoring"
import { connectPipelineAuthoring, projectPipelineAuthoring, validatePipelineConnection } from "../../pipeline/authoring"
import { Icon, type IconName } from "../../components/app-shell"
import type { ConnectComponentCapability } from "../../runtime/connect/capabilities"
import type { PipelineRuntime } from "../../pipeline/pipeline"
import "@xyflow/react/dist/style.css"

export type WorkspaceComponentKind = "input" | "buffer" | "processor" | "output"
export type WorkspaceSelection =
  | { kind: "input" }
  | { kind: "buffer" }
  | { kind: "processor"; index: number }
  | { kind: "output" }

type PipelineNodeData = {
  label: string
  component: string
  kind: WorkspaceComponentKind
  selection: WorkspaceSelection
  runtime?: PipelineRuntime
  onDuplicate: (selection: WorkspaceSelection) => void
  onDelete: (selection: WorkspaceSelection) => void
  onInspect: (selection: WorkspaceSelection) => void
}

type PipelineNode = Node<PipelineNodeData, "pipelineNode">
type PipelineEdge = Edge

type ContextMenuState = { x: number; y: number; selection?: WorkspaceSelection } | null

type PipelineCanvasProps = {
  pipelineId?: string
  authoring: PipelineAuthoring
  runtime: PipelineRuntime
  selected: WorkspaceSelection | null
  onSelect: (selection: WorkspaceSelection | null) => void
  onSelectMany: (selections: WorkspaceSelection[]) => void
  onAuthoringChange: (authoring: PipelineAuthoring) => void
  onDuplicate: (selections: WorkspaceSelection[]) => void
  onDelete: (selections: WorkspaceSelection[]) => void
  onOpenCommand: () => void
}

function componentName(config: JsonObject, fallback: string): string {
  return Object.keys(config).find((key) => key !== "label") ?? fallback
}

function componentLabel(config: JsonObject, fallback: string): string {
  return typeof config.label === "string" && config.label.trim() !== "" ? config.label : fallback
}

function iconFor(kind: WorkspaceComponentKind): IconName {
  if (kind === "input") return "database"
  if (kind === "output") return "arrow"
  if (kind === "buffer") return "grid"
  return "layers"
}

function selectionKey(selection: WorkspaceSelection): string {
  return selection.kind === "processor" ? "processor-" + selection.index : selection.kind
}

function PipelineNodeView({ id, data, selected }: NodeProps<PipelineNode>) {
  const runtime = data.runtime
  const runtimeLabel = runtime?.connected ? (runtime.active ? "running" : "stopped") : "offline"
  const runtimeClass = runtime?.connected ? (runtime.active ? "online" : "inactive") : "offline"
  const canDelete = data.kind === "processor" || data.kind === "buffer"
  return (
    <>
      <NodeToolbar nodeId={id} className="pipeline-node-toolbar" position={Position.Top} offset={10}>
        <button className="canvas-action" type="button" onClick={(event) => { event.stopPropagation(); data.onInspect(data.selection) }}>Configure</button>
        <button className="canvas-action" type="button" onClick={(event) => { event.stopPropagation(); data.onDuplicate(data.selection) }}>Duplicate</button>
        {canDelete && <button className="canvas-action danger" type="button" onClick={(event) => { event.stopPropagation(); data.onDelete(data.selection) }}>Delete</button>}
      </NodeToolbar>
      <div className={"pipeline-canvas-node" + (selected ? " selected" : "")}>
        {data.kind !== "input" && <Handle type="target" position={Position.Left} id="in" aria-label={data.label + " input"} />}
        <div className="pipeline-canvas-node-drag">
          <div className="pipeline-canvas-node-topline">
            <span className="pipeline-canvas-node-icon"><Icon name={iconFor(data.kind)} /></span>
            <span className="pipeline-canvas-node-kind">{data.kind}</span>
            <span className={"pipeline-canvas-node-state " + runtimeClass}><span />{runtimeLabel}</span>
          </div>
          <strong>{data.component}</strong>
          <code>{data.label}</code>
        </div>
        {data.kind !== "output" && <Handle type="source" position={Position.Right} id="out" aria-label={data.label + " output"} />}
      </div>
    </>
  )
}

const nodeTypes = { pipelineNode: memo(PipelineNodeView) }

function loadPositions(key: string): Map<string, { x: number; y: number }> {
  try {
    const raw = window.localStorage.getItem(key + ".positions")
    if (!raw) return new Map()
    const parsed = JSON.parse(raw) as Record<string, { x?: number; y?: number }>
    return new Map(Object.entries(parsed).flatMap(([id, position]) => typeof position?.x === "number" && typeof position?.y === "number" ? [[id, { x: position.x, y: position.y }] as const] : []))
  } catch { return new Map() }
}

function persistPositions(key: string, positions: Map<string, { x: number; y: number }>) {
  try { window.localStorage.setItem(key + ".positions", JSON.stringify(Object.fromEntries(positions))) } catch {}
}

function loadViewport(key: string): Viewport {
  try {
    const raw = window.localStorage.getItem(key + ".viewport")
    if (!raw) return { x: 0, y: 0, zoom: 1 }
    const parsed = JSON.parse(raw) as Partial<Viewport>
    if (typeof parsed.x === "number" && typeof parsed.y === "number" && typeof parsed.zoom === "number") return parsed as Viewport
  } catch {}
  return { x: 0, y: 0, zoom: 1 }
}

function hasStoredViewport(key: string): boolean {
  try { return window.localStorage.getItem(key + ".viewport") !== null } catch { return false }
}

function persistViewport(key: string, viewport: Viewport) {
  try { window.localStorage.setItem(key + ".viewport", JSON.stringify(viewport)) } catch {}
}

function buildNodes(
  authoring: PipelineAuthoring,
  runtime: PipelineRuntime,
  positions: Map<string, { x: number; y: number }>,
  actions: Pick<PipelineNodeData, "onDuplicate" | "onDelete" | "onInspect">,
): PipelineNode[] {
  const projection = projectPipelineAuthoring(authoring)
  const items: Array<{ id: string; kind: WorkspaceComponentKind; config: JsonObject; selection: WorkspaceSelection }> = [
    { id: "input", kind: "input", config: projection.input, selection: { kind: "input" } },
    ...(projection.buffer ? [{ id: "buffer", kind: "buffer" as const, config: projection.buffer, selection: { kind: "buffer" } as WorkspaceSelection }] : []),
    ...(projection.processors ?? []).map((config, index) => ({ id: "processor-" + index, kind: "processor" as const, config, selection: { kind: "processor", index } as WorkspaceSelection })),
    { id: "output", kind: "output", config: projection.output, selection: { kind: "output" } },
  ]
  return items.map((item, index) => ({
    id: item.id,
    type: "pipelineNode",
    position: positions.get(item.id) ?? { x: 100 + index * 250, y: 180 },
    data: {
      label: componentLabel(item.config, item.kind === "input" ? "Input" : item.kind === "buffer" ? "Buffer" : item.kind === "output" ? "Output" : "Processor " + (index + 1)),
      component: componentName(item.config, item.kind),
      kind: item.kind,
      selection: item.selection,
      runtime,
      ...actions,
    },
    draggable: true,
    deletable: false,
    selectable: true,
    focusable: true,
  }))
}

function buildEdges(authoring: PipelineAuthoring): PipelineEdge[] {
  const projection = projectPipelineAuthoring(authoring)
  const ids = ["input", ...(projection.buffer ? ["buffer"] : []), ...(projection.processors ?? []).map((_, index) => "processor-" + index), "output"]
  return ids.slice(1).map((target, index) => ({
    id: "pipeline-edge-" + index,
    source: ids[index],
    target,
    sourceHandle: "out",
    targetHandle: "in",
    type: "smoothstep",
    selectable: false,
    focusable: false,
    animated: false,
  }))
}

function selectionFromNode(node: PipelineNode): WorkspaceSelection {
  return node.data.selection
}

function nodeIdForSelection(selection: WorkspaceSelection): string {
  return selectionKey(selection)
}

export function PipelineCanvas({
  pipelineId = "unknown",
  authoring,
  runtime,
  selected,
  onSelect,
  onSelectMany,
  onAuthoringChange,
  onDuplicate,
  onDelete,
  onOpenCommand,
}: PipelineCanvasProps) {
  const workspaceKey = "porcelain.pipeline.workspace." + pipelineId
  const positions = useRef(loadPositions(workspaceKey))
  const initialViewport = useMemo(() => loadViewport(workspaceKey), [workspaceKey])
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<PipelineEdge>([])
  const [connectionFeedback, setConnectionFeedback] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const selectedId = selected ? selectionKey(selected) : null

  const nodeActions = useMemo(() => ({
    onDuplicate: (selection: WorkspaceSelection) => onDuplicate([selection]),
    onDelete: (selection: WorkspaceSelection) => onDelete([selection]),
    onInspect: (selection: WorkspaceSelection) => onSelect(selection),
  }), [onDelete, onDuplicate, onSelect])

  const rebuild = useCallback(() => {
    setNodes(buildNodes(authoring, runtime, positions.current, nodeActions))
    setEdges(buildEdges(authoring))
  }, [authoring, nodeActions, runtime, setEdges, setNodes])

  useEffect(() => { rebuild() }, [rebuild])

  useEffect(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === selectedId })))
  }, [selectedId, setNodes])

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener("click", close)
    return () => window.removeEventListener("click", close)
  }, [])

  const handleNodesChange = (changes: Parameters<typeof onNodesChange>[0]) => {
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        positions.current.set(change.id, change.position)
        persistPositions(workspaceKey, positions.current)
      }
    }
    onNodesChange(changes)
  }

  const connectionAuthoring = useCallback((connection: Pick<Connection, "source" | "target">) => {
    if (!connection.source || !connection.target) return null
    const source = nodes.find((node) => node.id === connection.source)
    const target = nodes.find((node) => node.id === connection.target)
    return source && target ? { source: selectionFromNode(source), target: selectionFromNode(target) } : null
  }, [nodes])

  const isValidConnection = useCallback((connection: Connection | PipelineEdge) => {
    const value = connectionAuthoring(connection)
    if (!value) { setConnectionFeedback("That connection is missing a valid source or target."); return false }
    const validation = validatePipelineConnection(authoring, value)
    setConnectionFeedback(validation.valid ? null : validation.reason ?? "That connection is not valid for a Connect stream.")
    return validation.valid
  }, [authoring, connectionAuthoring])

  const handleConnect = (connection: Connection) => {
    const value = connectionAuthoring(connection)
    if (!value) return
    const validation = validatePipelineConnection(authoring, value)
    if (!validation.valid) { setConnectionFeedback(validation.reason ?? "That connection is not valid for a Connect stream."); return }
    try { onAuthoringChange(connectPipelineAuthoring(authoring, value)); setConnectionFeedback(null) }
    catch (error) { setConnectionFeedback(error instanceof Error ? error.message : "That connection could not be applied.") }
  }

  const selectedNodes = nodes.filter((node) => node.selected)
  const selectedSelections = selectedNodes.map(selectionFromNode)
  const canDeleteSelection = selectedSelections.some((item) => item.kind === "processor" || item.kind === "buffer")

  if (typeof ResizeObserver === "undefined") {
    return <div className="pipeline-canvas-fallback" aria-label="Pipeline workspace canvas">{nodes.map((node) => <button className={"pipeline-canvas-fallback-node" + (node.id === selectedId ? " selected" : "")} key={node.id} type="button" aria-label={node.data.label} onClick={() => onSelect(node.data.selection)}><span>{node.data.kind}</span><strong>{node.data.component}</strong></button>)}</div>
  }

  const contextSelection = contextMenu?.selection
  return (
    <div className="pipeline-canvas-reactflow" aria-label="Pipeline workspace canvas" onContextMenu={(event) => event.preventDefault()}>
      {connectionFeedback && <div className="pipeline-canvas-feedback" role="status">{connectionFeedback}</div>}
      <ReactFlow<PipelineNode, PipelineEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => onSelect(node.data.selection)}
        onSelectionChange={({ nodes: nextNodes }) => {
          const selections = nextNodes.map((node) => selectionFromNode(node as PipelineNode))
          onSelectMany(selections)
          if (selections.length === 1) onSelect(selections[0])
          if (selections.length === 0) onSelect(null)
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          onSelect(node.data.selection)
          setContextMenu({ x: event.clientX, y: event.clientY, selection: node.data.selection })
        }}
        onSelectionContextMenu={(event, selection) => {
          event.preventDefault()
          setContextMenu({ x: event.clientX, y: event.clientY })
          onSelectMany(selection.map(selectionFromNode))
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault()
          setContextMenu({ x: event.clientX, y: event.clientY })
        }}
        onPaneClick={() => { onSelect(null); onSelectMany([]); setContextMenu(null) }}
        onNodeDragStop={(_, node, draggedNodes) => {
          draggedNodes.forEach((item) => { positions.current.set(item.id, item.position); persistPositions(workspaceKey, positions.current) })
        }}
        onMoveEnd={(_, viewport) => persistViewport(workspaceKey, viewport)}
        nodesConnectable
        nodesFocusable
        edgesFocusable={false}
        edgesReconnectable={false}
        defaultViewport={initialViewport}
        fitView={!hasStoredViewport(workspaceKey)}
        fitViewOptions={{ padding: 0.24, minZoom: 0.65, maxZoom: 1.1 }}
        minZoom={0.35}
        maxZoom={1.6}
        panOnDrag={false}
        panOnScroll
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={null}
        multiSelectionKeyCode={["Meta", "Control"]}
        selectionKeyCode={["Shift", "Meta", "Control"]}
        selectNodesOnDrag
        connectOnClick
        connectionRadius={24}
        defaultEdgeOptions={{ type: "smoothstep", selectable: false, focusable: false }}
        ariaLabelConfig={{
          "controls.ariaLabel": "Workspace viewport controls",
          "controls.zoomIn.ariaLabel": "Zoom in",
          "controls.zoomOut.ariaLabel": "Zoom out",
          "controls.fitView.ariaLabel": "Fit workspace",
          "controls.interactive.ariaLabel": "Toggle workspace interaction",
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
        {selectedSelections.length > 1 && <Panel position="top-center" className="canvas-selection-toolbar">
          <span>{selectedSelections.length} selected</span>
          <button type="button" onClick={() => onDuplicate(selectedSelections)}>Duplicate</button>
          <button type="button" className="danger" disabled={!canDeleteSelection} onClick={() => onDelete(selectedSelections)}>Delete</button>
        </Panel>}
      </ReactFlow>
      {contextMenu && <div className="canvas-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onClick={(event) => event.stopPropagation()}>
        <button type="button" role="menuitem" onClick={() => { setContextMenu(null); if (contextSelection) onSelect(contextSelection) }}>Configure <kbd>Enter</kbd></button>
        {contextSelection && <button type="button" role="menuitem" onClick={() => { setContextMenu(null); onDuplicate([contextSelection]) }}>Duplicate <kbd>Cmd D</kbd></button>}
        {contextSelection && (contextSelection.kind === "processor" || contextSelection.kind === "buffer") && <button type="button" role="menuitem" className="danger" onClick={() => { setContextMenu(null); onDelete([contextSelection]) }}>Delete <kbd>Delete</kbd></button>}
        {!contextSelection && <button type="button" role="menuitem" onClick={() => { setContextMenu(null); onOpenCommand() }}>Add component <kbd>Cmd K</kbd></button>}
        <div className="canvas-context-separator" />
        <button type="button" role="menuitem" onClick={() => { setContextMenu(null); onOpenCommand() }}>Command menu <kbd>Cmd K</kbd></button>
      </div>}
    </div>
  )
}

type ComponentLibraryProps = {
  components: ConnectComponentCapability[]
  query: string
  onQueryChange: (query: string) => void
  onOpenCommand: () => void
  onChoose: (component: ConnectComponentCapability, kind: Exclude<WorkspaceComponentKind, "buffer">) => void
}
const libraryKinds: Array<Exclude<WorkspaceComponentKind, "buffer">> = ["input", "processor", "output"]

export function ComponentLibrary({ components, query, onQueryChange, onOpenCommand, onChoose }: ComponentLibraryProps) {
  const normalized = query.trim().toLowerCase()
  const groups = libraryKinds.map((kind) => ({
    kind,
    items: components.filter((component) => component.kinds.includes(kind)).filter((component) => !normalized || component.name.toLowerCase().includes(normalized)).slice(0, normalized ? 40 : 12),
  })).filter((group) => group.items.length > 0)

  return <aside className="workspace-library" aria-label="Connect component library">
    <div className="workspace-library-header"><div><span className="eyebrow">Library</span><h2>Components</h2></div><button className="workspace-library-add" type="button" onClick={onOpenCommand} aria-label="Add component"><Icon name="plus" /></button></div>
    <button className="workspace-command-trigger" type="button" onClick={onOpenCommand}><Icon name="search" /><span>{query || "Search components"}</span><kbd>Cmd K</kbd></button>
    <label className="workspace-library-search"><Icon name="search" /><input aria-label="Filter component library" placeholder="Filter library" value={query} onChange={(event) => onQueryChange(event.target.value)} /></label>
    <div className="workspace-library-groups">
      {groups.map((group) => <section key={group.kind} className="workspace-library-group">
        <div className="workspace-library-group-title"><span>{group.kind}</span><span>{group.items.length}{normalized ? "" : "+"}</span></div>
        {group.items.map((component) => <button className="workspace-library-item" type="button" key={group.kind + ":" + component.name} onClick={() => onChoose(component, group.kind)}>
          <span className="workspace-library-item-icon"><Icon name={iconFor(group.kind)} /></span><span className="workspace-library-item-copy"><strong>{component.name}</strong>{component.status && <small>{component.status}</small>}</span><Icon name="arrow" />
        </button>)}
      </section>)}
      {!groups.length && <div className="workspace-library-empty">No installed Connect components match.</div>}
    </div>
    <div className="workspace-library-footer"><span className="status-dot online" /><span>Live from Connect</span></div>
  </aside>
}
