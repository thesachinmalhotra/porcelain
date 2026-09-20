import type { ConnectStream, ConnectStreamStats, ConnectStreamSummary } from "../runtime/connect/client"
import type { PipelineDefinition, PipelineRevision } from "./store"
import type { JsonObject, PipelineAuthoring } from "./authoring"

export type PipelineRuntime = {
  connected: boolean
  active: boolean
  uptimeSeconds: number
  uptime: string
  stats: ConnectStreamStats | null
}

export type Pipeline = PipelineDefinition & {
  runtime: PipelineRuntime
}

export type PipelineSummary = Pick<Pipeline, "id" | "name" | "connectStreamId"> & {
  runtime: PipelineRuntime
}

export type PipelineWorkspacePipeline = PipelineSummary & {
  authoring: PipelineAuthoring
}

export function authoringFromDefinition(definition: PipelineDefinition, revision: PipelineRevision): PipelineAuthoring {
  const config = revision.spec
  const pipeline = isObject(config.pipeline) ? config.pipeline : undefined
  const hasProcessors = pipeline && Object.prototype.hasOwnProperty.call(pipeline, "processors")
  const processors = hasProcessors && Array.isArray(pipeline.processors) ? pipeline.processors.filter(isObject) : undefined

  return {
    id: definition.id,
    name: definition.name,
    metadata: definition.metadata,
    input: isObject(config.input) ? config.input : {},
    ...(Object.prototype.hasOwnProperty.call(config, "buffer") && isObject(config.buffer) ? { buffer: config.buffer } : {}),
    ...(processors !== undefined ? { processors } : {}),
    output: isObject(config.output) ? config.output : {},
    connectConfig: structuredClone(config),
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function disconnectedPipelineRuntime(): PipelineRuntime {
  return { connected: false, active: false, uptimeSeconds: 0, uptime: "0s", stats: null }
}

export function pipelineFromConnectStream(
  definition: PipelineDefinition,
  stream: ConnectStream,
  stats: ConnectStreamStats | null = null,
): Pipeline {
  return {
    ...definition,
    runtime: {
      connected: true,
      active: stream.active,
      uptimeSeconds: stream.uptime,
      uptime: stream.uptime_str,
      stats,
    },
  }
}

export function pipelineSummaryFromDefinition(definition: PipelineDefinition): PipelineSummary {
  return {
    id: definition.id,
    name: definition.name,
    connectStreamId: definition.connectStreamId,
    runtime: disconnectedPipelineRuntime(),
  }
}

export function pipelineSummaryFromConnectStream(
  definition: PipelineDefinition,
  stream: ConnectStreamSummary,
  stats: ConnectStreamStats | null = null,
): PipelineSummary {
  return {
    id: definition.id,
    name: definition.name,
    connectStreamId: definition.connectStreamId,
    runtime: {
      connected: true,
      active: stream.active,
      uptimeSeconds: stream.uptime,
      uptime: stream.uptime_str,
      stats,
    },
  }
}
