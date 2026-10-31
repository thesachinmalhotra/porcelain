import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import type { ConnectResourceType, JsonObject } from "./client"

export type ManagedConnectResource = {
  id: string; type: ConnectResourceType; component: string; name: string; config: JsonObject
  checksum: string; publishedChecksum: string | null; createdAt: string; updatedAt: string
  publishedAt: string | null; lastPublishError: string | null
}
type State = { resources: ManagedConnectResource[] }
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : typeof value === "object" && value !== null ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value
const checksum = (config: JsonObject) => createHash("sha256").update(JSON.stringify(canonical(config))).digest("hex")
const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value)

export function createConnectResourceStore(filePath = resolve(process.cwd(), ".porcelain", "resources.json")) {
  async function read(): Promise<State> {
    try { const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<State>; return { resources: parsed.resources ?? [] } }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { resources: [] }; throw error }
  }
  async function write(state: State) {
    await mkdir(dirname(filePath), { recursive: true })
    const temporary = filePath + ".tmp"
    await writeFile(temporary, JSON.stringify(state, null, 2) + "\n", "utf8")
    await rename(temporary, filePath)
  }
  return {
    async list() { return (await read()).resources.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)) },
    async get(id: string) { return (await read()).resources.find(resource => resource.id === id) ?? null },
    async save(input: { id?: string; type: ConnectResourceType; component: string; name: string; config: JsonObject }) {
      if (!isObject(input.config) || !isObject(input.config[input.component])) throw new Error("Configuration must contain the selected component at its root")
      const state = await read()
      const existing = input.id ? state.resources.find(resource => resource.id === input.id) : undefined
      if (input.id && !existing) throw new Error("Resource not found")
      if (state.resources.some(resource => resource.id !== input.id && resource.type === input.type && resource.name === input.name)) throw new Error("A resource with this type and name already exists")
      const now = new Date().toISOString()
      const next: ManagedConnectResource = { id: existing?.id ?? randomUUID(), type: input.type, component: input.component, name: input.name, config: structuredClone(input.config), checksum: checksum(input.config), publishedChecksum: existing?.publishedChecksum ?? null, createdAt: existing?.createdAt ?? now, updatedAt: now, publishedAt: existing?.publishedAt ?? null, lastPublishError: null }
      const index = state.resources.findIndex(resource => resource.id === next.id)
      if (index < 0) state.resources.push(next); else state.resources[index] = next
      await write(state)
      return next
    },
    async markPublished(id: string) {
      const state = await read(), resource = state.resources.find(item => item.id === id)
      if (!resource) throw new Error("Resource not found")
      resource.publishedChecksum = resource.checksum; resource.publishedAt = new Date().toISOString(); resource.lastPublishError = null
      await write(state); return resource
    },
    async markPublishFailed(id: string, message: string) {
      const state = await read(), resource = state.resources.find(item => item.id === id)
      if (!resource) throw new Error("Resource not found")
      resource.lastPublishError = message
      await write(state); return resource
    },
  }
}

