import type { ConnectStream, ConnectStreamSummary } from "../runtime/connect/client"

export type Pipeline = {
  id: string
  config: Record<string, unknown>
  runtime: {
    active: boolean
    uptimeSeconds: number
    uptime: string
  }
}

export function pipelineFromConnectStream(id: string, stream: ConnectStream): Pipeline {
  return {
    id,
    config: stream.config,
    runtime: {
      active: stream.active,
      uptimeSeconds: stream.uptime,
      uptime: stream.uptime_str,
    },
  }
}


export type PipelineSummary = {
  id: string
  runtime: Pipeline["runtime"]
}

export function pipelineSummaryFromConnectStream(id: string, stream: ConnectStreamSummary): PipelineSummary {
  return {
    id,
    runtime: {
      active: stream.active,
      uptimeSeconds: stream.uptime,
      uptime: stream.uptime_str,
    },
  }
}
