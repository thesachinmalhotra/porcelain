import { useMemo, useState } from "react"
import type { JsonObject, JsonValue } from "../../pipeline/authoring"
import type { ConnectComponentSchema, ConnectSchemaField, ConnectSchemaNode } from "../../runtime/connect/schema"

type Props = {
  config: JsonObject
  initialConfig?: JsonObject
  schema: ConnectComponentSchema
  search?: string
  onChange: (config: JsonObject) => void
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function relativePath(field: ConnectSchemaField): string[] {
  return field.path[0] === field.name ? field.path : field.path.slice(1)
}

function getValue(config: JsonObject, path: string[]): JsonValue | undefined {
  let current: JsonValue = config
  for (const segment of path) {
    if (!isObject(current)) return undefined
    current = current[segment]
  }
  return current
}

function setValue(config: JsonObject, path: string[], value: JsonValue | undefined): JsonObject {
  const next = structuredClone(config)
  if (!path.length) return next
  let current = next
  for (const segment of path.slice(0, -1)) {
    if (!isObject(current[segment])) current[segment] = {}
    current = current[segment] as JsonObject
  }
  const leaf = path[path.length - 1]
  if (value === undefined) delete current[leaf]
  else current[leaf] = structuredClone(value)
  return next
}

function label(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

function primitive(type: string | undefined, value: string): JsonValue {
  if (type === "number") return value === "" ? "" : Number(value)
  if (type === "integer") return value === "" ? "" : Number.parseInt(value, 10)
  if (type === "boolean") return value === "true"
  return value
}

function defaultFor(node: ConnectSchemaNode | undefined): JsonValue | undefined {
  if (!node) return undefined
  if (node.default !== undefined) return node.default as JsonValue
  if (node.type === "boolean") return false
  if (node.type === "array") return []
  if (node.type === "object") return {}
  return undefined
}

function scalar(value: JsonValue | undefined): string {
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (typeof value === "boolean") return String(value)
  return ""
}

function enumValue(options: Array<string | number | boolean | null>, value: string): JsonValue | undefined {
  return options.find((option) => String(option) === value)
}

function primitiveArray(node: ConnectSchemaNode): boolean {
  return Boolean(node.items && ["string", "number", "integer", "boolean"].includes(node.items.type ?? ""))
}

function matchesField(field: ConnectSchemaField, query: string): boolean {
  if (!query) return true
  const haystack = [field.name, label(field.name), field.node.title ?? "", field.node.description ?? "", field.path.join(".")].join(" ").toLowerCase()
  return haystack.includes(query)
}

function matchesNode(field: ConnectSchemaField, query: string): boolean {
  if (!query) return true
  if (matchesField(field, query)) return true
  const node = field.node
  if (!node.properties) return false
  return Object.entries(node.properties).some(([name, child]) => matchesNode({
    name,
    path: [...field.path, name],
    node: child,
    required: (node.required ?? []).includes(name),
    optional: child.is_optional === true,
    advanced: child.is_advanced === true,
    deprecated: child.is_deprecated === true,
    secret: child.is_secret === true,
  }, query))
}

function Field({
  field,
  config,
  initialConfig,
  query,
  onChange,
}: {
  field: ConnectSchemaField
  config: JsonObject
  initialConfig: JsonObject
  query: string
  onChange: (config: JsonObject) => void
}) {
  if (field.deprecated || !matchesNode(field, query)) return null
  const node = field.node
  const path = relativePath(field)
  const value = getValue(config, path)
  const initial = getValue(initialConfig, path)
  const dirty = JSON.stringify(value) !== JSON.stringify(initial)
  const reset = () => onChange(setValue(config, path, defaultFor(node)))

  if (node.type === "object" && node.properties) {
    return (
      <details className={"native-inspector-object" + (field.advanced ? " advanced" : "")} open={!field.advanced || Boolean(query)}>
        <summary><span>{label(field.name)}</span><span className="native-inspector-meta">{field.advanced ? "Advanced" : field.required ? "Required" : "Optional"}{dirty && <i />}</span></summary>
        {node.description && <p className="native-inspector-description">{node.description}</p>}
        <div className="native-inspector-object-fields">
          {Object.entries(node.properties).map(([name, child]) => <Field key={name} field={{ name, path: [...field.path, name], node: child, required: (node.required ?? []).includes(name), optional: child.is_optional === true, advanced: child.is_advanced === true, deprecated: child.is_deprecated === true, secret: child.is_secret === true }} config={config} initialConfig={initialConfig} query={query} onChange={onChange} />)}
        </div>
      </details>
    )
  }

  const fieldLabel = label(field.name)
  const meta = field.required ? "Required" : node.default !== undefined ? "Default " + String(node.default) : "Optional"

  if (node.type === "array" && primitiveArray(node)) {
    const items = Array.isArray(value) ? value : []
    return <div className="native-inspector-field"><div className="native-inspector-label"><label>{fieldLabel}{dirty && <i />}</label><span>{meta}</span></div><div className="native-inspector-array">{items.map((item, index) => <div className="native-inspector-array-row" key={index}><input value={String(item ?? "")} type={node.items?.type === "number" || node.items?.type === "integer" ? "number" : "text"} onChange={(event) => { const next = [...items]; next[index] = primitive(node.items?.type, event.target.value); onChange(setValue(config, path, next)) }} /><button className="text-button" type="button" onClick={() => onChange(setValue(config, path, items.filter((_, itemIndex) => itemIndex !== index)))}>Remove</button></div>)}<button className="button button-secondary" type="button" onClick={() => onChange(setValue(config, path, [...items, defaultFor(node.items) ?? ""]))}>Add item</button></div></div>
  }

  if (node.enum?.length) {
    const current = value === undefined ? "" : scalar(value)
    return <div className="native-inspector-field"><div className="native-inspector-label"><label>{fieldLabel}{dirty && <i />}</label><span>{meta}</span></div><select value={current} onChange={(event) => onChange(setValue(config, path, event.target.value === "" ? undefined : enumValue(node.enum ?? [], event.target.value)))}>{!field.required && <option value="">Not configured</option>}{node.enum.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</select>{node.description && <small className="native-inspector-description">{node.description}</small>}</div>
  }

  if (node.type === "boolean") {
    const checked = typeof value === "boolean" ? value : typeof node.default === "boolean" ? node.default : false
    return <div className="native-inspector-field boolean"><div><label>{fieldLabel}{dirty && <i />}</label><small>{meta}</small></div><input type="checkbox" checked={checked} onChange={(event) => onChange(setValue(config, path, event.target.checked))} /></div>
  }

  if (node.type === "array" || node.type === "object") {
    const empty = node.type === "array" ? [] : {}
    return <div className="native-inspector-field advanced"><div className="native-inspector-label"><label>{fieldLabel}{dirty && <i />}</label><span>Advanced</span></div><textarea className="native-inspector-json" aria-label={fieldLabel} value={JSON.stringify(value ?? empty, null, 2)} onChange={(event) => { try { const parsed = JSON.parse(event.target.value) as JsonValue; if ((node.type === "array" && Array.isArray(parsed)) || (node.type === "object" && isObject(parsed))) onChange(setValue(config, path, parsed)) } catch {} }} spellCheck={false} /><button className="text-button native-inspector-reset" type="button" onClick={reset}>Reset</button></div>
  }

  const current = value === undefined ? "" : scalar(value)
  const error = field.required && value === undefined
    ? "Required"
    : typeof value === "string" && node.minLength !== undefined && value.length < node.minLength ? "Too short"
    : typeof value === "string" && node.maxLength !== undefined && value.length > node.maxLength ? "Too long"
    : typeof value === "number" && node.minimum !== undefined && value < node.minimum ? "Below minimum"
    : typeof value === "number" && node.maximum !== undefined && value > node.maximum ? "Above maximum"
    : undefined
  return <div className={"native-inspector-field" + (error ? " invalid" : "")}><div className="native-inspector-label"><label>{fieldLabel}{dirty && <i />}</label><span>{meta}</span></div><div className="native-inspector-input-wrap"><input type={node.type === "number" || node.type === "integer" ? "number" : field.secret ? "password" : "text"} value={current} placeholder={value === undefined && node.default !== undefined ? String(node.default) : field.required ? "Required" : "Not configured"} min={node.minimum} max={node.maximum} step={node.type === "integer" ? 1 : node.multipleOf ?? "any"} pattern={node.pattern} onChange={(event) => { const next = primitive(node.type, event.target.value); if (typeof next === "number" && Number.isNaN(next)) return; onChange(setValue(config, path, next === "" && !field.required ? undefined : next)) }} />{dirty && <button className="field-reset" type="button" onClick={reset} aria-label={"Reset " + fieldLabel}>��y��y�</button>}</div>{node.description && <small className="native-inspector-description">{node.description}</small>}{field.secret && <small className="native-inspector-secret">Secret � never echoed into telemetry</small>}{error && <small className="native-inspector-error">{error}</small>}</div>
}

export function NativeInspector({ config, initialConfig = config, schema, search = "", onChange }: Props) {
  const query = search.trim().toLowerCase()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const fields = useMemo(() => schema.fields.filter((field) => !field.deprecated), [schema.fields])
  const basic = fields.filter((field) => !field.advanced)
  const advanced = fields.filter((field) => field.advanced)
  return <div className="native-inspector">
    <div className="native-inspector-summary"><span className="eyebrow">Native schema</span><strong>{schema.name}</strong><span>{schema.kind} � {fields.length} supported fields</span></div>
    <div className="native-inspector-note">This surface is generated from Redpanda Connect's native JSON Schema. Porcelain does not maintain a second component schema.</div>
    <section className="native-inspector-group"><div className="native-inspector-group-header"><strong>Core</strong><span>{basic.length}</span></div>{basic.map((field) => <Field key={field.path.join(".")} field={field} config={config} initialConfig={initialConfig} query={query} onChange={onChange} />)}</section>
    {advanced.length > 0 && <section className="native-inspector-group"><button className="native-inspector-advanced-toggle" type="button" onClick={() => setShowAdvanced((value) => !value)}><span>Advanced fields</span><span>{advanced.length} {showAdvanced ? "shown" : "hidden"}</span></button>{showAdvanced && advanced.map((field) => <Field key={field.path.join(".")} field={field} config={config} initialConfig={initialConfig} query={query} onChange={onChange} />)}</section>}
    {!basic.some((field) => matchesNode(field, query)) && !advanced.some((field) => matchesNode(field, query)) && <div className="inspector-empty">No native fields match "{search}".</div>}
  </div>
}
