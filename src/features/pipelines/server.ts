import { createServerFn } from "@tanstack/react-start"
import { pipelineSummaryFromConnectStream, pipelineSummaryFromDefinition } from "../../pipeline/pipeline"
import { createPipelineLifecycle } from "../../pipeline/lifecycle"
import { createPipelineStore } from "../../pipeline/store"
import { createConnectClient } from "../../runtime/connect/client"
import type { PipelineDefinition } from "../../pipeline/store"

type PipelineStore = ReturnType<typeof createPipelineStore>
type ConnectRuntimeClient = Pick<
  ReturnType<typeof createConnectClient>,
  "ready" | "listStreams" | "getStreamStats"
>
type PipelineLifecycle = ReturnType<typeof createPipelineLifecycle>

type PipelineWorkspaceDependencies = {
  store: PipelineStore
  client: ConnectRuntimeClient
}

type PipelineCommandDependencies = {
  store: PipelineStore
  client: ReturnType<typeof createConnectClient>
}

function connectClient() {
  return createConnectClient({
    baseUrl: process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195",
  })
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

function createLifecycle({ store, client }: PipelineCommandDependencies): PipelineLifecycle {
  return createPipelineLifecycle({ store, client })
}

export async function createPipelineCommand({
  lifecycle,
  definition,
}: {
  lifecycle: Pick<PipelineLifecycle, "createPipeline">
  definition: PipelineDefinition
}) {
  return lifecycle.createPipeline(definition)
}

export async function updatePipelineCommand({
  lifecycle,
  id,
  update,
}: {
  lifecycle: Pick<PipelineLifecycle, "updatePipeline">
  id: string
  update: Omit<PipelineDefinition, "id">
}) {
  return lifecycle.updatePipeline(id, update)
}

export async function deletePipelineCommand({
  lifecycle,
  id,
}: {
  lifecycle: Pick<PipelineLifecycle, "deletePipeline">
  id: string
}) {
  return lifecycle.deletePipeline(id)
}

export const getPipelineWorkspace = createServerFn({ method: "GET" }).handler(async () =>
  loadPipelineWorkspace({
    store: createPipelineStore(),
    client: connectClient(),
  }),
)

export const createPipeline = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => {
    const pipeline = await createPipelineCommand({
      lifecycle: createLifecycle({ store: createPipelineStore(), client: connectClient() }),
      definition: data as PipelineDefinition,
    })
    return pipeline.id
  })

export const updatePipeline = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => {
    const input = data as { id: string; update: Omit<PipelineDefinition, "id"> }
    const pipeline = await updatePipelineCommand({
      lifecycle: createLifecycle({ store: createPipelineStore(), client: connectClient() }),
      id: input.id,
      update: input.update,
    })
    return pipeline.id
  })

export const deletePipeline = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => {
    await deletePipelineCommand({
      lifecycle: createLifecycle({ store: createPipelineStore(), client: connectClient() }),
      id: (data as { id: string }).id,
    })
  })

