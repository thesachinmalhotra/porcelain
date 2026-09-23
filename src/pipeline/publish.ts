import { authoringToConnectConfig, validatePipelineAuthoring, type PipelineAuthoring } from "./authoring"
import { lintConnectConfig } from "../runtime/connect/native-config"
import { ConnectRequestError, type ConnectStreamStats } from "../runtime/connect/client"
import type { PipelineDefinition } from "./store"

export type PipelineDraftValidation = {
  valid: boolean
  lintErrors: string[]
  output: string
  restartRequired: boolean
}

type Client = {
  getStream(id: string): Promise<{ active: boolean; uptime: number; uptime_str: string; config: Record<string, unknown> }>
  createStream(id: string, config: Record<string, unknown>): Promise<void>
  updateStream(id: string, config: Record<string, unknown>): Promise<void>
  getStreamStats(id: string): Promise<ConnectStreamStats>
}

type Store = {
  get(id: string): Promise<PipelineDefinition | null>
  updateWithRevision(id: string, update: { name: string; metadata: Record<string, unknown>; desiredConfig: Record<string, unknown> }): Promise<PipelineDefinition>
}

function lintMessage(result: Awaited<ReturnType<typeof lintConnectConfig>>): string {
  return result.stderr.trim() || result.stdout.trim() || "Redpanda Connect rejected the configuration during lint."
}

async function streamExists(client: Client, id: string): Promise<boolean> {
  try {
    await client.getStream(id)
    return true
  } catch (error) {
    if (error instanceof ConnectRequestError && error.status === 404) return false
    throw error
  }
}

export async function validatePipelineDraft(authoring: PipelineAuthoring, client: Client): Promise<PipelineDraftValidation> {
  validatePipelineAuthoring(authoring)
  const config = authoringToConnectConfig(authoring)
  const lint = await lintConnectConfig(config)
  const restartRequired = await streamExists(client, authoring.id)
  return { valid: lint.valid, lintErrors: lint.valid ? [] : [lintMessage(lint)], output: lintMessage(lint), restartRequired }
}

export async function publishPipelineDraft({ store, client, authoring }: { store: Store; client: Client; authoring: PipelineAuthoring }) {
  const validation = await validatePipelineDraft(authoring, client)
  if (!validation.valid) throw new Error(validation.lintErrors.join("
"))
  const existing = await store.get(authoring.id)
  if (!existing) throw new Error("Pipeline not found: " + authoring.id)
  const config = authoringToConnectConfig(authoring)
  let restartRequired = false
  try {
    await client.getStream(authoring.id)
    restartRequired = true
    await client.updateStream(authoring.id, config)
  } catch (error) {
    if (!(error instanceof ConnectRequestError) || error.status !== 404) throw error
    await client.createStream(authoring.id, config)
  }
  const pipeline = await store.updateWithRevision(authoring.id, { name: authoring.name, metadata: authoring.metadata ?? {}, desiredConfig: config })
  const stream = await client.getStream(authoring.id)
  let stats: ConnectStreamStats | null = null
  try { stats = await client.getStreamStats(authoring.id) } catch {}
  return { pipeline, restartRequired, runtime: { connected: true, active: stream.active, uptime: stream.uptime, uptimeStr: stream.uptime_str, stats } }
}
