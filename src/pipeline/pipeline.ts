import type { ConnectStream, ConnectStreamStats, ConnectStreamSummary } from "../runtime/connect/client"
import type { PipelineDefinition } from "./store"

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

export function disconnectedPipelineRuntime(): PipelineRuntime {
  return {
    connected: false,
    active: false,
    uptimeSeconds: 0,
    uptime: "0s",
    stats: null,
  }
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
