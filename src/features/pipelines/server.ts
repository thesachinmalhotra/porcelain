import { createServerFn } from "@tanstack/react-start"
import { pipelineSummaryFromConnectStream, pipelineSummaryFromDefinition } from "../../pipeline/pipeline"
import { createPipelineStore } from "../../pipeline/store"
import { createConnectClient } from "../../runtime/connect/client"

function connectClient() {
  return createConnectClient({
    baseUrl: process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195",
  })
}

type PipelineStore = ReturnType<typeof createPipelineStore>
type ConnectRuntimeClient = Pick<
  ReturnType<typeof createConnectClient>,
  "ready" | "listStreams" | "getStreamStats"
>

type PipelineWorkspaceDependencies = {
  store: PipelineStore
  client: ConnectRuntimeClient
}

export async function loadPipelineWorkspace({
  store,
  client,
}: PipelineWorkspaceDependencies) {
  const definitions = await store.list()
  const connectReady = await client.ready()

  let streams
  try {
    streams = await client.listStreams()
  } catch {
    return {
      connectReady,
      pipelines: definitions.map(pipelineSummaryFromDefinition),
    }
  }

  const pipelines = await Promise.all(
    definitions.map(async (definition) => {
      if (!definition.connectStreamId) {
        return pipelineSummaryFromDefinition(definition)
      }

      const stream = streams[definition.connectStreamId]
      if (!stream) {
        return pipelineSummaryFromDefinition(definition)
      }

      let stats = null
      try {
        stats = await client.getStreamStats(definition.connectStreamId)
      } catch {
        // The stream may disappear between the stream listing and stats request.
      }

      return pipelineSummaryFromConnectStream(definition, stream, stats)
    }),
  )

  return { connectReady, pipelines }
}

export const getPipelineWorkspace = createServerFn({ method: "GET" }).handler(async () =>
  loadPipelineWorkspace({
    store: createPipelineStore(),
    client: connectClient(),
  }),
)
