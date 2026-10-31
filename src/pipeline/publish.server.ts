import { authoringToConnectConfig, validatePipelineAuthoring, type PipelineAuthoring } from "./authoring"
import { lintConnectConfig } from "../runtime/connect/native-config.server"
import type { ConnectStreamStats } from "../runtime/connect/client"
import type { PipelineDefinition, PipelineUpdate } from "./store"

export type PipelineDraftValidation = {
  valid: boolean
  lintErrors: string[]
  output: string
  restartRequired: boolean
}

type Client = {
  getStream(id: string): Promise<{ active: boolean; uptime: number; uptime_str: string; config: Record<string, unknown> }>
  getStreamStats(id: string): Promise<ConnectStreamStats>
}

export type PipelineConfigurationComparison = { status: "in_sync" | "drifted" | "unknown"; differences: string[] }

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]))
  return value
}

export function comparePipelineConfigurations(desired: Record<string, unknown>, actual: Record<string, unknown>): PipelineConfigurationComparison {
  const same = JSON.stringify(canonical(desired)) === JSON.stringify(canonical(actual))
  return { status: same ? "in_sync" : "drifted", differences: same ? [] : ["$"] }
}
type Lifecycle = {
  publishPipeline(id: string, update: PipelineUpdate): Promise<{ pipeline: PipelineDefinition; connectStreamId: string; operation: "created" | "updated" }>
}

function lintMessage(result: Awaited<ReturnType<typeof lintConnectConfig>>): string {
  return result.stderr.trim() || result.stdout.trim() || "Redpanda Connect rejected the configuration during lint."
}

async function streamExists(client: Client, id: string): Promise<boolean> {
  try {
    await client.getStream(id)
    return true
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 404) return false
    throw error
  }
}

export async function validatePipelineDraft(authoring: PipelineAuthoring, client: Client, connectStreamId = authoring.id): Promise<PipelineDraftValidation> {
  validatePipelineAuthoring(authoring)
  const config = authoringToConnectConfig(authoring)
  const lint = await lintConnectConfig(config)
  const restartRequired = await streamExists(client, connectStreamId)
  return {
    valid: lint.valid,
    lintErrors: lint.valid ? [] : [lintMessage(lint)],
    output: lint.valid ? "Redpanda Connect accepted the configuration." : lintMessage(lint),
    restartRequired,
  }
}

export async function publishPipelineDraft({
  lifecycle,
  client,
  authoring,
  connectStreamId,
}: {
  lifecycle: Lifecycle
  client: Client
  authoring: PipelineAuthoring
  connectStreamId?: string
}) {
  const validation = await validatePipelineDraft(authoring, client, connectStreamId ?? authoring.id)
  if (!validation.valid) throw new Error(validation.lintErrors.join("\n"))

  const config = authoringToConnectConfig(authoring)
  const { pipeline, connectStreamId: publishedConnectStreamId, operation } = await lifecycle.publishPipeline(authoring.id, {
    name: authoring.name,
    metadata: authoring.metadata ?? {},
    desiredConfig: config,
  })
  let stream: Awaited<ReturnType<Client["getStream"]>> | null = null
  try {
    stream = await client.getStream(publishedConnectStreamId)
  } catch {
    // The Connect mutation already succeeded. Runtime projection is best-effort and must not roll back publish semantics.
  }

  const configuration = stream ? comparePipelineConfigurations(config, stream.config) : { status: "unknown" as const, differences: [] }

  let stats: ConnectStreamStats | null = null
  if (stream) {
    try {
      stats = await client.getStreamStats(publishedConnectStreamId)
    } catch {
      // Stats are observability-only; a transient stats failure must not turn a successful publish into a failure.
    }
  }

  return {
    pipeline,
    restartRequired: operation === "updated",
    configuration,
    runtime: stream
      ? {
          connected: true,
          active: stream.active,
          uptime: stream.uptime,
          uptimeStr: stream.uptime_str,
          stats,
        }
      : {
          connected: false,
          active: false,
          uptime: 0,
          uptimeStr: "0s",
          stats: null,
        },
  }
}
