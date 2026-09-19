import { createServerFn } from "@tanstack/react-start"
import { authoringFromDefinition, pipelineSummaryFromConnectStream, pipelineSummaryFromDefinition, type PipelineWorkspacePipeline } from "../../pipeline/pipeline"
import { createPipelineLifecycle } from "../../pipeline/lifecycle"
import { createAuthoredPipeline, updateAuthoredPipeline } from "../../pipeline/authoring-lifecycle"
import { validatePipelineAuthoring, type PipelineAuthoring } from "../../pipeline/authoring"
import { createPipelineStore } from "../../pipeline/store"
import { createConnectClient } from "../../runtime/connect/client"
import { createActivityStore } from "../../operational/activity"
import type { PipelineDefinition } from "../../pipeline/store"

type PipelineStore = ReturnType<typeof createPipelineStore>
type ConnectRuntimeClient = Pick<
  ReturnType<typeof createConnectClient>,
  "probe" | "listStreams" | "getStreamStats"
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
  const probe = await client.probe()

  let streams
  try {
    streams = await client.listStreams()
  } catch {
    return {
      connectReachable: false,
      connectReady: probe.ready,
      pipelines: definitions.map((definition) => ({ ...pipelineSummaryFromDefinition(definition), authoring: authoringFromDefinition(definition) })),
    }
  }

  const pipelines: PipelineWorkspacePipeline[] = await Promise.all(
    definitions.map(async (definition) => {
      if (!definition.connectStreamId) {
        return { ...pipelineSummaryFromDefinition(definition), authoring: authoringFromDefinition(definition) }
      }

      const stream = streams[definition.connectStreamId]
      if (!stream) {
        return { ...pipelineSummaryFromDefinition(definition), authoring: authoringFromDefinition(definition) }
      }

      let stats = null
      try {
        stats = await client.getStreamStats(definition.connectStreamId)
      } catch {
        // The stream may disappear between the stream listing and stats request.
      }

      return { ...pipelineSummaryFromConnectStream(definition, stream, stats), authoring: authoringFromDefinition(definition) }
    }),
  )

  return { connectReachable: probe.reachable, connectReady: probe.ready, pipelines }
}

function createLifecycle({ store, client }: PipelineCommandDependencies): PipelineLifecycle {
  return createPipelineLifecycle({ store, client, activity: createActivityStore() })
}

export async function createAuthoredPipelineCommand({
  lifecycle,
  authoring,
}: {
  lifecycle: Pick<PipelineLifecycle, "createPipeline">
  authoring: PipelineAuthoring
}) {
  return createAuthoredPipeline({ lifecycle, authoring })
}

export async function updateAuthoredPipelineCommand({
  lifecycle,
  id,
  authoring,
}: {
  lifecycle: Pick<PipelineLifecycle, "updatePipeline">
  id: string
  authoring: PipelineAuthoring
}) {
  return updateAuthoredPipeline({ lifecycle, id, authoring })
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

function validateId(input: unknown): string {
  if (!isObject(input) || typeof input.id !== "string" || input.id.trim() === "") {
    throw new Error("Pipeline id must be a non-empty string")
  }
  return input.id
}

function validatePipelineDefinition(input: unknown): PipelineDefinition {
  if (!isObject(input)) throw new Error("Pipeline definition must be an object")
  if (typeof input.id !== "string" || input.id.trim() === "") throw new Error("Pipeline id must be a non-empty string")
  if (typeof input.name !== "string" || input.name.trim() === "") throw new Error("Pipeline name must be a non-empty string")
  if (!isObject(input.metadata)) throw new Error("Pipeline metadata must be an object")
  if (!isObject(input.desiredConfig)) throw new Error("Pipeline desiredConfig must be an object")
  if (input.connectStreamId !== null && typeof input.connectStreamId !== "string") throw new Error("Pipeline connectStreamId must be a string or null")
  return input as PipelineDefinition
}

function validatePipelineUpdate(input: unknown): { id: string; update: Omit<PipelineDefinition, "id"> } {
  if (!isObject(input) || !isObject(input.update)) throw new Error("Pipeline update must be an object")
  const id = validateId(input)
  const update = input.update
  if (!isObject(update.metadata)) throw new Error("Pipeline metadata must be an object")
  if (!isObject(update.desiredConfig)) throw new Error("Pipeline desiredConfig must be an object")
  if (update.connectStreamId !== null && typeof update.connectStreamId !== "string") throw new Error("Pipeline connectStreamId must be a string or null")
  if (typeof update.name !== "string" || update.name.trim() === "") throw new Error("Pipeline name must be a non-empty string")
  return { id, update: update as Omit<PipelineDefinition, "id"> }
}

function validateAuthoredCreate(input: unknown): PipelineAuthoring {
  validatePipelineAuthoring(input)
  return input
}

function validateAuthoredPipeline(input: unknown): { id: string; authoring: PipelineAuthoring } {
  if (!isObject(input)) throw new Error("Pipeline update must be an object")
  if (typeof input.id !== "string" || input.id.trim() === "") throw new Error("Pipeline id must be a non-empty string")
  validatePipelineAuthoring(input.authoring)
  if (input.authoring.id !== input.id) throw new Error("Pipeline authoring id must match the pipeline id")
  return { id: input.id, authoring: input.authoring }
}

export const createPipeline = createServerFn({ method: "POST" })
  .validator(validatePipelineDefinition)
  .handler(async ({ data }) => {
    const pipeline = await createPipelineCommand({
      lifecycle: createLifecycle({ store: createPipelineStore(), client: connectClient() }),
      definition: data,
    })
    return pipeline.id
  })

export const updatePipeline = createServerFn({ method: "POST" })
  .validator(validatePipelineUpdate)
  .handler(async ({ data }) => {
    const pipeline = await updatePipelineCommand({
      lifecycle: createLifecycle({ store: createPipelineStore(), client: connectClient() }),
      id: data.id,
      update: data.update,
    })
    return pipeline.id
  })

export const deletePipeline = createServerFn({ method: "POST" })
  .validator(validateId)
  .handler(async ({ data }) => {
    await deletePipelineCommand({
      lifecycle: createLifecycle({ store: createPipelineStore(), client: connectClient() }),
      id: data,
    })
  })

export const createAuthoredPipelineServer = createServerFn({ method: "POST" })
  .validator(validateAuthoredCreate)
  .handler(async ({ data }) => {
    const pipeline = await createAuthoredPipelineCommand({
      lifecycle: createLifecycle({ store: createPipelineStore(), client: connectClient() }),
      authoring: data,
    })
    return pipeline.id
  })

export const updateAuthoredPipelineServer = createServerFn({ method: "POST" })
  .validator(validateAuthoredPipeline)
  .handler(async ({ data }) => {
    const pipeline = await updateAuthoredPipelineCommand({
      lifecycle: createLifecycle({ store: createPipelineStore(), client: connectClient() }),
      id: data.id,
      authoring: data.authoring,
    })
    return pipeline.id
  })

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
