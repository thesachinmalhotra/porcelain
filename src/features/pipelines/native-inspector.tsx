import { useMemo } from "react"
import type { JsonObject, JsonValue } from "../../pipeline/authoring"
import type { ConnectComponentSchema, ConnectSchemaField, ConnectSchemaNode } from "../../runtime/connect/schema"

type Props = {
  config: JsonObject
  schema: ConnectComponentSchema
  onChange: (config: JsonObject) => void
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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

function defaultFor(node: ConnectSchemaNode | undefined): JsonValue {
  if (!node) return ""
  if (node.default !== undefined) return node.default as JsonValue
  if (node.type === "number" || node.type === "integer") return 0
  if (node.type === "boolean") return false
  return ""
}

function enumValue(options: Array<string | number | boolean | null>, value: string): JsonValue | undefined {
  return options.find((option) => String(option) === value)
}

function scalar(value: JsonValue | undefined): string {
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (typeof value === "boolean") return String(value)
  return ""
}

function primitiveArray(node: ConnectSchemaNode): boolean {
  return Boolean(node.items && ["string", "number", "integer", "boolean"].includes(node.items.type ?? ""))
}

function Field({
  field,
  config,
  onChange,
}: {
  field: ConnectSchemaField
  config: JsonObject
  onChange: (config: JsonObject) => void
}) {
  if (field.deprecated) return null
  const node = field.node
  const value = getValue(config, field.path)

  if (node.type === "object" && node.properties) {
    return (
      <fieldset className="native-inspector-object">
        <legend><span>{label(field.name)}</span>{field.advanced && <em>Advanced</em>}</legend>
        <div className="native-inspector-object-fields">
          {Object.entries(node.properties).map(([name, child]) => (
            <Field
              key={name}
              field={{
                name,
                path: [...field.path, name],
                node: child,
                required: (node.required ?? []).includes(name),
                optional: child.is_optional === true,
                advanced: child.is_advanced === true,
                deprecated: child.is_deprecated === true,
                secret: child.is_secret === true,
              }}
              config={config}
              onChange={onChange}
            />
          ))}
        </div>
      </fieldset>
    )
  }

  if (node.type === "array" && primitiveArray(node)) {
    const items = Array.isArray(value) ? value : []
    return (
      <div className="native-inspector-field">
        <div className="native-inspector-label"><label>{label(field.name)}</label><span>{field.required ? "Required" : "Optional"}</span></div>
        <div className="native-inspector-array">
          {items.map((item, index) => (
            <div className="native-inspector-array-row" key={index}>
              <input
                value={String(item ?? "")}
                type={node.items?.type === "number" || node.items?.type === "integer" ? "number" : "text"}
                onChange={(event) => {
                  const next = [...items]
                  next[index] = primitive(node.items?.type, event.target.value)
                  onChange(setValue(config, field.path, next))
                }}
              />
              <button className="text-button" type="button" onClick={() => onChange(setValue(config, field.path, items.filter((_, itemIndex) => itemIndex !== index)))}>Remove</button>
            </div>
          ))}
          <button className="button button-secondary" type="button" onClick={() => onChange(setValue(config, field.path, [...items, defaultFor(node.items)]))}>Add item</button>
        </div>
      </div>
    )
  }

  if (node.type === "array" || node.type === "object") {
    const empty = node.type === "array" ? [] : {}
    return (
      <div className="native-inspector-field advanced">
        <div className="native-inspector-label"><label>{label(field.name)}</label><span>Advanced</span></div>
        <textarea
          className="native-inspector-json"
          aria-label={label(field.name)}
          value={JSON.stringify(value ?? empty, null, 2)}
          onChange={(event) => {
            try {
              const parsed = JSON.parse(event.target.value) as JsonValue
              if ((node.type === "array" && Array.isArray(parsed)) || (node.type === "object" && isObject(parsed))) {
                onChange(setValue(config, field.path, parsed))
              }
            } catch {}
          }}
          spellCheck={false}
        />
      </div>
    )
  }

  if (node.enum?.length) {
    const current = value === undefined ? "" : scalar(value)
    return (
      <div className="native-inspector-field">
        <div className="native-inspector-label"><label>{label(field.name)}</label><span>{field.required ? "Required" : "Optional"}</span></div>
        <select value={current} onChange={(event) => onChange(setValue(config, field.path, event.target.value === "" ? undefined : enumValue(node.enum ?? [], event.target.value)))}>
          {!field.required && <option value="">Not configured</option>}
          {node.enum.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
        </select>
      </div>
    )
  }

  if (node.type === "boolean") {
    const checked = typeof value === "boolean" ? value : typeof node.default === "boolean" ? node.default : false
    return (
      <div className="native-inspector-field boolean">
        <div><label>{label(field.name)}</label><small>{field.required ? "Required" : node.default !== undefined ? "Default " + String(node.default) : "Optional"}</small></div>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(setValue(config, field.path, event.target.checked))} />
      </div>
    )
  }

  const current = value === undefined ? "" : scalar(value)
  const placeholder = value === undefined && node.default !== undefined
    ? String(node.default)
    : field.required ? "Required" : "Not configured"

  return (
    <div className="native-inspector-field">
      <div className="native-inspector-label"><label>{label(field.name)}</label><span>{field.required ? "Required" : node.default !== undefined ? "Default " + String(node.default) : "Optional"}</span></div>
      <input
        type={node.type === "number" || node.type === "integer" ? "number" : field.secret ? "password" : "text"}
        value={current}
        placeholder={placeholder}
        min={node.minimum}
        max={node.maximum}
        step={node.type === "integer" ? 1 : node.multipleOf ?? "any"}
        pattern={node.type === "string" ? node.pattern : undefined}
        onChange={(event) => {
          const next = primitive(node.type, event.target.value)
          if (typeof next === "number" && Number.isNaN(next)) return
          onChange(setValue(config, field.path, next === "" && !field.required ? undefined : next))
        }}
      />
      {node.description && <small className="native-inspector-description">{node.description}</small>}
      {field.secret && <small className="native-inspector-secret">Secret</small>}
    </div>
  )
}

export function NativeInspector({ config, schema, onChange }: Props) {
  const fields = useMemo(() => schema.fields.filter((field) => !field.deprecated), [schema.fields])
  const basic = fields.filter((field) => !field.advanced)
  const advanced = fields.filter((field) => field.advanced)

  return (
    <div className="native-inspector">
      <div className="native-inspector-summary">
        <span className="eyebrow">Native schema</span>
        <strong>{schema.name}</strong>
        <small>{schema.kind} · {fields.length} fields · Connect-owned</small>
      </div>
      <div className="native-inspector-fields">
        {basic.map((field) => <Field key={field.path.join(".")} field={field} config={config} onChange={onChange} />)}
      </div>
      {advanced.length > 0 && (
        <details className="native-inspector-advanced">
          <summary>Advanced fields <span>{advanced.length}</span></summary>
          <div className="native-inspector-fields">
            {advanced.map((field) => <Field key={field.path.join(".")} field={field} config={config} onChange={onChange} />)}
          </div>
        </details>
      )}
    </div>
  )
}
