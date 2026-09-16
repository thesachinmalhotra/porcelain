import { createServerFn } from "@tanstack/react-start"
import { createConnectClient } from "../../runtime/connect/client"
import { pipelineSummaryFromConnectStream } from "../../pipeline/pipeline"

function connectClient() {
  return createConnectClient({
    baseUrl: process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195",
  })
}

export const getPipelineWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  const client = connectClient()
  const connectReady = await client.ready()
  if (!connectReady) {
    return { connectReady: false, pipelines: [] }
  }

  const streams = await client.listStreams()
  return {
    connectReady: true,
    pipelines: Object.entries(streams).map(([id, stream]) =>
      pipelineSummaryFromConnectStream(id, stream),
    ),
  }
})
