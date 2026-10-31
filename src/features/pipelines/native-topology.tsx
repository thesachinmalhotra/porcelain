import { memo, useMemo } from "react"
import { Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react"
import type { JsonObject } from "../../pipeline/authoring"
import { Icon } from "../../components/app-shell"

export type NativeTopologySelection = { label: string; component: string; role: string; detail?: string; structural?: boolean; path: string; config: JsonObject }
type TopologyNode = Node<NativeTopologySelection, "topologyNode">
type Tree = { id: string; label: string; component: string; role: string; detail?: string; children: Tree[]; edgeLabel?: string; structural?: boolean; path: string; config: JsonObject }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const firstEntry = (value: unknown): [string, unknown] | undefined => {
  if (!isRecord(value)) return
  const entry = Object.entries(value).find(([key]) => key !== "label")
  return entry
}
const short = (value: unknown, max = 72) => typeof value === "string" ? value.length > max ? value.slice(0, max - 1) + "?" : value : undefined

function componentTree(value: unknown, role: string, id: string, path: string, edgeLabel?: string): Tree {
  const entry = firstEntry(value)
  const name = entry?.[0] ?? "unrecognised"
  const config = isRecord(entry?.[1]) ? entry![1] as Record<string, unknown> : {}
  const children: Tree[] = []
  const add = (items: unknown[], prefix: string, childRole = "processor") => {
    items.forEach((item, index) => children.push(componentTree(item, childRole, `${id}/${prefix}-${index}`, `${path}.${name}.processors.${index}`)))
  }
  if (name === "branch") {
    add(Array.isArray(config.processors) ? config.processors : [], "branch")
  } else if (name === "switch") {
    const cases = Array.isArray(config.cases) ? config.cases : []
    cases.forEach((item, index) => {
      const c = isRecord(item) ? item : {}
      const condition = short(c.check) ?? (index === cases.length - 1 ? "default" : `case ${index + 1}`)
      if (isRecord(c.output)) children.push(componentTree(c.output, "output", `${id}/case-${index}`, `${path}.${name}.cases.${index}.output`, condition))
      else if (Array.isArray(c.processors)) {
        const wrapper: Tree = { id: `${id}/case-${index}`, label: condition, component: "case", role: "case", detail: "Switch route", children: [], edgeLabel: condition, structural: true, path: `${path}.${name}.cases.${index}`, config: isRecord(item) ? item as JsonObject : {} }
        wrapper.children = c.processors.map((item, childIndex) => componentTree(item, "processor", `${wrapper.id}/step-${childIndex}`, `${path}.${name}.cases.${index}.processors.${childIndex}`))
        children.push(wrapper)
      } else children.push({ id: `${id}/case-${index}`, label: condition, component: "unmodelled case", role: "native", detail: "Preserved in native configuration", children: [], edgeLabel: condition, structural: true, path: `${path}.${name}.cases.${index}`, config: isRecord(item) ? item as JsonObject : {} })
    })
  } else if (name === "broker") {
    const outputs = Array.isArray(config.outputs) ? config.outputs : []
    outputs.forEach((item, index) => children.push(componentTree(item, "output", `${id}/destination-${index}`, `${path}.${name}.outputs.${index}`, `destination ${index + 1}`)))
  } else if (name === "sequence" || name === "fallback") {
    const items = Array.isArray(config.processors) ? config.processors : Array.isArray(config.outputs) ? config.outputs : []
    add(items, name, role)
  } else if (Array.isArray(config.processors)) {
    add(config.processors, "nested")
  }
  const detail = name === "switch" ? `${children.length} routes` : name === "broker" ? `${children.length} destinations` : name === "branch" ? `${children.length} nested processors` : undefined
  return { id, label: typeof config.label === "string" ? config.label : name, component: name, role, detail, children, edgeLabel, structural: ["switch", "broker", "branch", "sequence", "fallback"].includes(name), path, config: entry ? { [name]: entry[1] as JsonObject[string] } : {} }
}

function nativeTree(config: JsonObject): Tree[] {
  const roots: Tree[] = []
  if (config.input !== undefined) roots.push(componentTree(config.input, "input", "input", "input"))
  if (config.buffer !== undefined) roots.push(componentTree(config.buffer, "buffer", "buffer", "buffer"))
  const pipeline = isRecord(config.pipeline) ? config.pipeline : {}
  if (Array.isArray(pipeline.processors)) pipeline.processors.forEach((item, index) => roots.push(componentTree(item, "processor", `processor-${index}`, `pipeline.processors.${index}`)))
  if (config.output !== undefined) roots.push(componentTree(config.output, "output", "output", "output"))
  if (!roots.length) roots.push({ id: "native-config", label: "Native configuration", component: "unmodelled", role: "native", detail: "No standard stream sections found", children: [], structural: true, path: "$", config })
  return roots
}

function graphFromTree(roots: Tree[]): { nodes: TopologyNode[]; edges: Edge[] } {
  const nodes: TopologyNode[] = []
  const edges: Edge[] = []
  const X_GAP = 250
  const Y_GAP = 132
  const place = (tree: Tree, depth: number, start: number): number => {
    const childSpans = tree.children.map(child => Math.max(1, span(child)))
    const total = childSpans.reduce((sum, value) => sum + value, 0)
    const ownSpan = Math.max(1, total)
    const y = (start + ownSpan / 2) * Y_GAP
    nodes.push({
      id: tree.id, type: "topologyNode", position: { x: depth * X_GAP + 40, y: y - 40 },
      data: { label: tree.label, component: tree.component, role: tree.role, detail: tree.detail, structural: tree.structural, path: tree.path, config: tree.config },
      sourcePosition: Position.Right, targetPosition: Position.Left, draggable: false, selectable: true, connectable: false,
    })
    let cursor = start
    tree.children.forEach((child, index) => {
      const childSpan = childSpans[index]
      place(child, depth + 1, cursor)
      edges.push({ id: `${tree.id}->${child.id}`, source: tree.id, target: child.id, type: "smoothstep", label: child.edgeLabel, animated: false, selectable: false, style: { stroke: "var(--color-ash)", strokeWidth: 1.35 }, labelStyle: { fill: "var(--color-fog)", fontSize: 10 }, labelBgStyle: { fill: "var(--color-void)" } })
      cursor += childSpan
    })
    return ownSpan
  }
  const span = (tree: Tree): number => tree.children.length ? tree.children.reduce((sum, child) => sum + span(child), 0) : 1
  let cursor = 0
  roots.forEach((root, index) => {
    const size = place(root, 0, cursor)
    if (index > 0) edges.push({ id: `sequence-${index}`, source: roots[index - 1].id, target: root.id, type: "smoothstep", selectable: false, style: { stroke: "var(--color-ash)", strokeWidth: 1.35 } })
    cursor += size
  })
  return { nodes, edges }
}

export function buildNativeTopology(config: JsonObject): { nodes: TopologyNode[]; edges: Edge[] } {
  return graphFromTree(nativeTree(config))
}

function TopologyNodeView({ data }: NodeProps<TopologyNode>) {
  const glyph = data.role === "input" ? "database" : data.role === "output" ? "arrow" : data.structural ? "layers" : data.role === "buffer" ? "grid" : "layers"
  return <div className={`native-topology-node ${data.structural ? "is-structural" : ""} ${data.role === "native" ? "is-native" : ""}`}>
    {data.role !== "input" && <Handle type="target" position={Position.Left} />}
    <div className="native-topology-icon"><Icon name={glyph as "database"} /></div>
    <div className="native-topology-copy"><span>{data.role}</span><strong title={data.label}>{data.label}</strong><code>{data.component}</code>{data.detail && <small>{data.detail}</small>}</div>
    {data.role !== "output" && <Handle type="source" position={Position.Right} />}
  </div>
}
const nodeTypes = { topologyNode: memo(TopologyNodeView) }

export function NativeTopology({ config, onSelect }: { config: JsonObject; onSelect?: (node: NativeTopologySelection | null) => void }) {
  const graph = useMemo(() => buildNativeTopology(config), [config])
  if (typeof ResizeObserver === "undefined") {
    return <div className="native-topology" aria-label="Native Connect topology">
      <div className="native-topology-banner"><span><strong>Native topology</strong> ? Read-only projection of the Connect configuration</span><span>{graph.nodes.length} components</span></div>
      <div className="native-topology-fallback">{graph.nodes.map(node => <div className="native-topology-node" key={node.id}><div className="native-topology-icon"><Icon name="layers" /></div><div className="native-topology-copy"><span>{node.data.role}</span><strong>{node.data.label}</strong><code>{node.data.component}</code></div></div>)}</div>
      <div className="native-topology-note">Interactive graph controls are unavailable in this environment. Native Source remains authoritative.</div>
    </div>
  }
  return <div className="native-topology" aria-label="Native Connect topology">
    <div className="native-topology-banner"><span><strong>Native topology</strong> ? Read-only projection of the Connect configuration</span><span>{graph.nodes.length} components</span></div>
    <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} onNodeClick={(_, node) => onSelect?.(node.data)} onPaneClick={() => onSelect?.(null)} fitView fitViewOptions={{ padding: 0.22, minZoom: 0.25, maxZoom: 1 }} minZoom={0.15} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} elementsSelectable panOnScroll zoomOnScroll zoomOnPinch selectionOnDrag={false} proOptions={{ hideAttribution: true }}>
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
      <Controls showInteractive={false} position="bottom-left" /><MiniMap pannable zoomable position="bottom-right" nodeColor={(node) => (node.data as NativeTopologySelection).structural ? "#77736a" : "#4e7770"} maskColor="rgba(10, 11, 12, .72)" />
    </ReactFlow>
    <div className="native-topology-note">Advanced Connect structures are visualised where recognised. The native Source remains authoritative for every field and unsupported construct.</div>
  </div>
}

