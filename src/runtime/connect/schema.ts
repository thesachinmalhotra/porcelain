import type { JsonValue } from "../../pipeline/authoring"
import type { ConnectComponentKind } from "./capabilities"

export type ConnectSchemaNode = {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array"
  properties?: Record<string, ConnectSchemaNode>
  patternProperties?: Record<string, ConnectSchemaNode>
  items?: ConnectSchemaNode
  enum?: Array<string | number | boolean | null>
  default?: JsonValue
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  description?: string
  title?: string
  $ref?: string
  is_optional?: boolean
  is_advanced?: boolean
  is_deprecated?: boolean
  is_secret?: boolean
  additionalProperties?: boolean | ConnectSchemaNode
  required?: string[]
  anyOf?: ConnectSchemaNode[]
  oneOf?: ConnectSchemaNode[]
  allOf?: ConnectSchemaNode[]
}

export type ConnectJsonSchemaDocument = {
  definitions: Record<string, ConnectSchemaNode>
  properties?: Record<string, ConnectSchemaNode>
}

export type ConnectComponentSchema = {
  name: string
  kind: ConnectComponentKind
  fields: ConnectSchemaField[]
}

export type ConnectSchemaField = {
  name: string
  path: string[]
  node: ConnectSchemaNode
  required: boolean
  optional: boolean
  advanced: boolean
  deprecated: boolean
  secret: boolean
}

type ComponentVariant = {
  properties?: Record<string, ConnectSchemaNode>
  required?: string[]
}

const cache = new Map<string, Promise<ConnectJsonSchemaDocument>>()

export function componentSchemaFromDocument(
  document: ConnectJsonSchemaDocument,
  kind: ConnectComponentKind,
  name: string,
): ConnectComponentSchema {
  const definition = document.definitions[kind]
  if (!definition) throw new Error("Connect schema has no " + kind + " definition")
  const variant = flattenVariants(definition).find((item) => item.properties?.[name])
  const component = variant?.properties?.[name]
  if (!component) throw new Error("Connect schema has no " + kind + " component named " + name)
  return {
    name,
    kind,
    fields: fieldsFromNode(component, [name], component.required ?? variant?.required ?? []),
  }
}

export async function discoverConnectJsonSchema(
  execute: (executable: string, args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>,
  executable: string,
): Promise<ConnectJsonSchemaDocument> {
  const existing = cache.get(executable)
  if (existing) return existing

  const pending = execute(executable, ["connect", "list", "--format", "jsonschema"]).then((result) => {
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || "Redpanda Connect schema discovery failed")
    }
    const parsed = JSON.parse(result.stdout) as ConnectJsonSchemaDocument
    if (!parsed || typeof parsed !== "object" || !parsed.definitions) {
      throw new Error("Redpanda Connect returned an invalid JSON Schema document")
    }
    return parsed
  })

  cache.set(executable, pending)
  try {
    return await pending
  } catch (error) {
    cache.delete(executable)
    throw error
  }
}

function flattenVariants(node: ConnectSchemaNode): ComponentVariant[] {
  const result: ComponentVariant[] = []
  if (node.properties) result.push({ properties: node.properties, required: node.required })
  for (const child of [...(node.anyOf ?? []), ...(node.oneOf ?? []), ...(node.allOf ?? [])]) {
    result.push(...flattenVariants(child))
  }
  return result
}

function fieldsFromNode(
  node: ConnectSchemaNode,
  parentPath: string[],
  requiredNames: string[],
): ConnectSchemaField[] {
  if (!node.properties) return []
  return Object.entries(node.properties).map(([name, child]) => ({
    name,
    path: [...parentPath, name],
    node: child,
    required: requiredNames.includes(name),
    optional: child.is_optional === true,
    advanced: child.is_advanced === true,
    deprecated: child.is_deprecated === true,
    secret: child.is_secret === true,
  }))
}
