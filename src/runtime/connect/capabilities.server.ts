import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/**
 * These are the component roles exposed by `rpk connect list --format json`.
 * They describe Connect's component universe; they are not a Porcelain
 * component registry.
 */
export type ConnectComponentKind =
  | "input"
  | "output"
  | "processor"
  | "buffer"
  | "cache"
  | "rate_limit"
  | "metric"
  | "tracer"

export type ConnectComponentCapability = {
  name: string
  kinds: ConnectComponentKind[]
  status?: "stable" | "beta" | "experimental"
}

export type ConnectCapabilityDiscovery = {
  components: ConnectComponentCapability[]
  source: "rpk" | "connect"
  executable: string
  inventoryFormat: "json"
}

export type ConnectCapabilityExecutor = (
  executable: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

export type ConnectCapabilityOptions = {
  executable?: string
  execute?: ConnectCapabilityExecutor
}

const defaultExecute: ConnectCapabilityExecutor = async (executable, args) => {
  const result = await execFileAsync(executable, args, {
    maxBuffer: 8 * 1024 * 1024,
  })
  return { stdout: result.stdout, stderr: result.stderr }
}

/**
 * Connect exposes a machine-readable component inventory through rpk connect list.
 * Configuration schema discovery is a separate Connect-owned surface consumed by
 * the native inspector.
 */
export async function discoverConnectCapabilities(
  options: ConnectCapabilityOptions = {},
): Promise<ConnectCapabilityDiscovery> {
  const connectExecutable = process.env.PORCELAIN_CONNECT_EXECUTABLE
  const executable = options.executable ?? connectExecutable ?? process.env.PORCELAIN_RPK_PATH ?? "rpk"
  const execute = options.execute ?? defaultExecute
  const isConnectExecutable = Boolean(connectExecutable) || options.executable?.includes("managed-connect") === true
  const { stdout } = await execute(
    executable,
    isConnectExecutable ? ["list", "--format", "json"] : ["connect", "list", "--format", "json"],
  )

  let value: unknown
  try {
    value = JSON.parse(stdout)
  } catch {
    throw new Error("Redpanda Connect capability discovery returned invalid JSON")
  }

  const components = normalizeComponents(value)
  if (components.length === 0) {
    throw new Error("Redpanda Connect capability discovery returned no components")
  }

  return {
    components,
    source: isConnectExecutable ? "connect" : "rpk",
    executable,
    inventoryFormat: "json",
  }
}

function normalizeComponents(value: unknown): ConnectComponentCapability[] {
  const discovered: ConnectComponentCapability[] = []

  if (isRecord(value)) {
    for (const [key, children] of Object.entries(value)) {
      const kind = normalizeKind(key)
      if (!kind || !Array.isArray(children)) continue

      for (const child of children) {
        if (typeof child === "string") {
          discovered.push({ name: child, kinds: [kind] })
        }
      }
    }
  }

  walk(value, undefined, discovered)

  const unique = new Map<string, ConnectComponentCapability>()
  for (const component of discovered) {
    const existing = unique.get(component.name)
    if (!existing) {
      unique.set(component.name, component)
      continue
    }

    unique.set(component.name, {
      name: component.name,
      kinds: [...new Set([...existing.kinds, ...component.kinds])].sort(),
      status: existing.status ?? component.status,
    })
  }

  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function walk(
  value: unknown,
  inheritedKind: ConnectComponentKind | undefined,
  output: ConnectComponentCapability[],
): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, inheritedKind, output)
    return
  }

  if (!isRecord(value)) return

  const kind = normalizeKind(value.kind ?? value.type) ?? inheritedKind
  const name = typeof value.name === "string" ? value.name : undefined
  if (name && kind) {
    output.push({
      name,
      kinds: [kind],
      status: normalizeStatus(value.status),
    })
  }

  for (const [key, child] of Object.entries(value)) {
    walk(child, normalizeKind(key) ?? kind, output)
  }
}

function normalizeKind(value: unknown): ConnectComponentKind | undefined {
  if (typeof value !== "string") return undefined
  switch (value.toLowerCase().replaceAll("-", "_")) {
    case "input":
    case "inputs":
      return "input"
    case "output":
    case "outputs":
      return "output"
    case "processor":
    case "processors":
      return "processor"
    case "buffer":
    case "buffers":
      return "buffer"
    case "cache":
    case "caches":
      return "cache"
    case "rate_limit":
    case "rate_limits":
      return "rate_limit"
    case "metric":
    case "metrics":
      return "metric"
    case "tracer":
    case "tracers":
      return "tracer"
    default:
      return undefined
  }
}

function normalizeStatus(value: unknown): ConnectComponentCapability["status"] {
  if (value === "stable" || value === "beta" || value === "experimental") return value
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
