import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Background,
  Controls,
  type Connection,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  SelectionMode,
  BackgroundVariant,
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
}

type PipelineNode = Node<PipelineNodeData, "pipelineNode">
type PipelineEdge = Edge

type PipelineCanvasProps = {
  authoring: PipelineAuthoring
  runtime: PipelineRuntime
  selected: WorkspaceSelection | null
  onSelect: (selection: WorkspaceSelection) => void
  onAuthoringChange: (authoring: PipelineAuthoring) => void
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
  return selection.kind === "processor" ? `processor-${selection.index}` : selection.kind
}

const PipelineNodeView = memo(function PipelineNodeView({ data, selected }: NodeProps<PipelineNode>) {
  const runtime = data.runtime
  const runtimeLabel = runtime?.connected ? (runtime.active ? "running" : "stopped") : "offline"
  const runtimeClass = runtime?.connected ? (runtime.active ? "online" : "inactive") : "offline"

  return (
    <div className={`pipeline-canvas-node${selected ? " selected" : ""}`}>
      {data.kind !== "input" && <Handle type="target" position={Position.Left} id="in" aria-label={`${data.label} input`} />}
      <div className="pipeline-canvas-node-drag">
        <div className="pipeline-canvas-node-topline">
          <span className="pipeline-canvas-node-icon"><Icon name={iconFor(data.kind)} /></span>
          <span className="pipeline-canvas-node-kind">{data.kind}</span>
          <span className={`pipeline-canvas-node-state ${runtimeClass}`}><span />{runtimeLabel}</span>
        </div>
        <strong>{data.component}</strong>
        <code>{data.label}</code>
      </div>
      {data.kind !== "output" && <Handle type="source" position={Position.Right} id="out" aria-label={`${data.label} output`} />}
    </div>
  )
})

const nodeTypes = { pipelineNode: PipelineNodeView }

function buildNodes(authoring: PipelineAuthoring, runtime: PipelineRuntime, positions: Map<string, { x: number; y: number }>): PipelineNode[] {
  const projection = projectPipelineAuthoring(authoring)
  const items: Array<{ id: string; kind: WorkspaceComponentKind; config: JsonObject; selection: WorkspaceSelection }> = [
    { id: "input", kind: "input", config: projection.input, selection: { kind: "input" } },
    ...(projection.buffer ? [{ id: "buffer", kind: "buffer" as const, config: projection.buffer, selection: { kind: "buffer" } as WorkspaceSelection }] : []),
    ...(projection.processors ?? []).map((config, index) => ({
      id: `processor-${index}`,
      kind: "processor" as const,
      config,
      selection: { kind: "processor", index } as WorkspaceSelection,
    })),
    { id: "output", kind: "output", config: projection.output, selection: { kind: "output" } },
  ]

  return items.map((item, index) => ({
    id: item.id,
    type: "pipelineNode",
    position: positions.get(item.id) ?? { x: 100 + index * 250, y: 180 },
    data: {
      label: componentLabel(
        item.config,
        item.kind === "input" ? "Input" : item.kind === "buffer" ? "Buffer" : item.kind === "output" ? "Output" : "Processor " + (index + 1),
      ),
      component: componentName(item.config, item.kind),
      kind: item.kind,
      selection: item.selection,
      runtime,
    },
    draggable: true,
    deletable: false,
    selectable: true,
  }))
}

function buildEdges(authoring: PipelineAuthoring): PipelineEdge[] {
  const projection = projectPipelineAuthoring(authoring)
  const ids = [
    "input",
    ...(projection.buffer ? ["buffer"] : []),
    ...(projection.processors ?? []).map((_, index) => `processor-${index}`),
    "output",
  ]
  return ids.slice(1).map((target, index) => ({
    id: `pipeline-edge-${index}`,
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

export function PipelineCanvas({ authoring, runtime, selected, onSelect, onAuthoringChange }: PipelineCanvasProps) {
  const positions = useRef(new Map<string, { x: number; y: number }>())
  const initialNodes = useMemo(() => buildNodes(authoring, runtime, positions.current), [authoring, runtime])
  const initialEdges = useMemo(() => buildEdges(authoring), [authoring])
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [connectionFeedback, setConnectionFeedback] = useState<string | null>(null)
  const connectionFeedbackRef = useRef<string | null>(null)

  const setFeedback = useCallback((message: string | null) => {
    if (connectionFeedbackRef.current === message) return
    connectionFeedbackRef.current = message
    setConnectionFeedback(message)
  }, [])

  useEffect(() => {
    setNodes(buildNodes(authoring, runtime, positions.current))
    setEdges(buildEdges(authoring))
  }, [authoring, runtime, setEdges, setNodes])

  const selectedId = selected ? selectionKey(selected) : null

  useEffect(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === selectedId })))
  }, [selectedId, setNodes])

  const handleNodesChange = (changes: Parameters<typeof onNodesChange>[0]) => {
    for (const change of changes) {
      if (change.type === "position" && change.position) positions.current.set(change.id, change.position)
    }
    onNodesChange(changes)
  }

  const connectionAuthoring = useCallback((connection: Pick<Connection, "source" | "target">) => {
    const source = nodes.find((node) => node.id === connection.source)
    const target = nodes.find((node) => node.id === connection.target)
    if (!source || !target || !connection.source || !connection.target) return null
    return { source: selectionFromNode(source), target: selectionFromNode(target) }
  }, [nodes])

  const isValidConnection = useCallback((connection: Connection | PipelineEdge) => {
    const authoringConnection = connectionAuthoring(connection)
    if (!authoringConnection) {
      setFeedback("That connection is missing a valid source or target.")
      return false
    }
    const validation = validatePipelineConnection(authoring, authoringConnection)
    setFeedback(validation.valid ? null : validation.reason ?? "That connection is not valid for a Connect stream.")
    return validation.valid
  }, [authoring, connectionAuthoring, setFeedback])

  const handleConnect = (connection: Connection) => {
    const authoringConnection = connectionAuthoring(connection)
    if (!authoringConnection) return
    const validation = validatePipelineConnection(authoring, authoringConnection)
    if (!validation.valid) {
      setFeedback(validation.reason ?? "That connection is not valid for a Connect stream.")
      return
    }
    try {
      onAuthoringChange(connectPipelineAuthoring(authoring, authoringConnection))
      setFeedback(null)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "That connection could not be applied.")
    }
  }

  if (typeof ResizeObserver === "undefined") {
    return (
      <div className="pipeline-canvas-fallback" aria-label="Pipeline workspace canvas">
        {nodes.map((node) => (
          <button
            className={`pipeline-canvas-fallback-node${node.id === selectedId ? " selected" : ""}`}
            key={node.id}
            type="button"
            aria-label={node.data.label}
            onClick={() => onSelect(node.data.selection)}
          >
            <span>{node.data.kind}</span>
            <strong>{node.data.component}</strong>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="pipeline-canvas-reactflow" aria-label="Pipeline workspace canvas">
      {connectionFeedback && <div className="pipeline-canvas-feedback" role="status">{connectionFeedback}</div>}
      <ReactFlow<PipelineNode, PipelineEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={() => undefined}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => onSelect(node.data.selection)}
        nodesConnectable
        edgesReconnectable={false}
        edgesFocusable={false}
        fitView
        fitViewOptions={{ padding: 0.24, minZoom: 0.65, maxZoom: 1.1 }}
        minZoom={0.35}
        maxZoom={1.6}
        panOnScroll
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={null}
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
      </ReactFlow>
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
    items: components
      .filter((component) => component.kinds.includes(kind))
      .filter((component) => !normalized || component.name.toLowerCase().includes(normalized))
      .slice(0, normalized ? 40 : 12),
  })).filter((group) => group.items.length > 0)

  return (
    <aside className="workspace-library" aria-label="Connect component library">
      <div className="workspace-library-header">
        <div>
          <span className="eyebrow">Library</span>
          <h2>Components</h2>
        </div>
        <button className="workspace-library-add" type="button" onClick={onOpenCommand} aria-label="Add component">
          <Icon name="plus" />
        </button>
      </div>
      <button className="workspace-command-trigger" type="button" onClick={onOpenCommand}>
        <Icon name="search" />
        <span>{query || "Search components"}</span>
        <kbd>?K</kbd>
      </button>
      <label className="workspace-library-search">
        <Icon name="search" />
        <input aria-label="Filter component library" placeholder="Filter library" value={query} onChange={(event) => onQueryChange(event.target.value)} />
      </label>
      <div className="workspace-library-groups">
        {groups.map((group) => (
          <section key={group.kind} className="workspace-library-group">
            <div className="workspace-library-group-title"><span>{group.kind}</span><span>{group.items.length}{normalized ? "" : "+"}</span></div>
            {group.items.map((component) => (
              <button className="workspace-library-item" type="button" key={`${group.kind}:${component.name}`} onClick={() => onChoose(component, group.kind)}>
                <span className="workspace-library-item-icon"><Icon name={iconFor(group.kind)} /></span>
                <span className="workspace-library-item-copy"><strong>{component.name}</strong>{component.status && <small>{component.status}</small>}</span>
                <Icon name="arrow" />
              </button>
            ))}
          </section>
        ))}
        {groups.length === 0 && <div className="workspace-library-empty">No installed Connect components match.</div>}
      </div>
      <div className="workspace-library-footer">
        <span className="status-dot online" />
        <span>Live from Connect</span>
      </div>
    </aside>
  )
}
