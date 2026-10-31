import { createServerFn } from "@tanstack/react-start"
import { createConnectResourceStore } from "../../runtime/connect/resource-store.server"
import { createConnectClient, type ConnectResourceType, type JsonObject } from "../../runtime/connect/client"
const resourceTypes: ConnectResourceType[] = ["cache", "input", "output", "processor", "rate_limit"]
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
export const getManagedResources = createServerFn({ method: "GET" }).handler(async () => ({ resources: await createConnectResourceStore().list() }))
export const saveManagedResource = createServerFn({ method: "POST" }).validator((value: unknown) => {
  if (!isRecord(value) || (value.id !== undefined && typeof value.id !== "string") || typeof value.type !== "string" || !resourceTypes.includes(value.type as ConnectResourceType) || typeof value.component !== "string" || typeof value.name !== "string" || !value.name.trim() || !isRecord(value.config)) throw new Error("A valid resource type, component, name and configuration are required")
  return { id: value.id as string | undefined, type: value.type as ConnectResourceType, component: value.component, name: value.name.trim(), config: value.config as JsonObject }
}).handler(async ({ data }) => ({ resource: await createConnectResourceStore().save(data) }))
export const publishManagedResource = createServerFn({ method: "POST" }).validator((value: unknown) => { if (!isRecord(value) || typeof value.id !== "string") throw new Error("Resource id is required"); return { id: value.id } }).handler(async ({ data }) => {
  const store = createConnectResourceStore(), resource = await store.get(data.id)
  if (!resource) throw new Error("Resource not found")
  try {
    const client = createConnectClient({ baseUrl: process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195" })
    if (!(await client.ready())) throw new Error("Redpanda Connect is not ready")
    await client.createResource(resource.type, resource.name, resource.config)
    return { resource: await store.markPublished(resource.id) }
  } catch (error) { await store.markPublishFailed(resource.id, error instanceof Error ? error.message : "Resource publish failed"); throw error }
})

