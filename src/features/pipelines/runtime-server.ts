import { createServerFn } from "@tanstack/react-start"
import { disconnectedPipelineRuntime, pipelineSummaryFromConnectStream, type PipelineRuntime } from "../../pipeline/pipeline"
import type { ConnectStreamStats } from "../../runtime/connect/client"
type ConnectRuntimeClient = {
  probe(): Promise<{ reachable: boolean; ready: boolean }>
  listStreams(): Promise<Record<string, { active: boolean; uptime: number; uptime_str: string }>>
  getStreamStats(id: string): Promise<ConnectStreamStats>
}
import type { PipelineDefinition } from "../../pipeline/store.server"
type PipelineStore = { get(id: string): Promise<PipelineDefinition | null> }

async function connectClient(): Promise<ConnectRuntimeClient> {
  const { createConnectClient } = await import("../../runtime/connect/client")
  return createConnectClient({ baseUrl: process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195" })
}

export type PipelineRuntimeSnapshot = {
  connectReachable: boolean
  connectReady: boolean
  runtime: PipelineRuntime
}

export async function loadPipelineRuntime(
  id: string,
  client: ConnectRuntimeClient,
  store: PipelineStore,
): Promise<PipelineRuntimeSnapshot> {
  const definition = await store.get(id)
  if (!definition) throw new Error("Pipeline not found: " + id)

  const probe = await client.probe()
  if (!probe.reachable) {
    return { connectReachable: false, connectReady: false, runtime: disconnectedPipelineRuntime() }
  }

  let streams
  try {
    streams = await client.listStreams()
  } catch {
    return { connectReachable: true, connectReady: probe.ready, runtime: disconnectedPipelineRuntime() }
  }

  if (!definition.connectStreamId) {
    return { connectReachable: true, connectReady: probe.ready, runtime: disconnectedPipelineRuntime() }
  }

  const stream = streams[definition.connectStreamId]
  if (!stream) {
    return { connectReachable: true, connectReady: probe.ready, runtime: disconnectedPipelineRuntime() }
  }

  let stats = null
  try {
    stats = await client.getStreamStats(definition.connectStreamId)
  } catch {
    // Stream lifecycle remains authoritative when stats briefly fail.
  }

  return {
    connectReachable: true,
    connectReady: probe.ready,
    runtime: pipelineSummaryFromConnectStream(definition, stream, stats).runtime,
  }
}

export const getPipelineRuntime = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof (input as { id?: unknown }).id !== "string") {
      throw new Error("Pipeline id must be a non-empty string")
    }
    const id = (input as { id: string }).id.trim()
    if (!id) throw new Error("Pipeline id must be a non-empty string")
    return { id }
  })
  .handler(async ({ data }) => {
    const [{ createPipelineStore }, client] = await Promise.all([import("../../pipeline/store.server"), connectClient()])
    return loadPipelineRuntime(data.id, client, createPipelineStore())
  })
