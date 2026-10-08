import { createServerFn } from "@tanstack/react-start"
import {
  authoringFromDefinition,
  pipelineSummaryFromConnectStream,
  pipelineSummaryFromDefinition,
  type PipelineWorkspacePipeline,
} from "../../pipeline/pipeline"
import { validatePipelineAuthoring, type PipelineAuthoring } from "../../pipeline/authoring"
import type { PipelineCreate, PipelineDefinition, PipelineRevision, PipelineUpdate } from "../../pipeline/store.server"
import type { ConnectStreamStats } from "../../runtime/connect/client"

type PipelineStore = {
  list(): Promise<PipelineDefinition[]>
  get(id: string): Promise<PipelineDefinition | null>
  getRevision(id: string): Promise<PipelineRevision | null>
  createWithRevision(input: PipelineCreate): Promise<PipelineDefinition>
  updateWithRevision(id: string, update: PipelineUpdate): Promise<PipelineDefinition>
  delete(id: string): Promise<void>
}
type ConnectRuntimeClient = {
  probe(): Promise<{ reachable: boolean; ready: boolean }>
  listStreams(): Promise<Record<string, { active: boolean; uptime: number; uptime_str: string }>>
  getStreamStats(id: string): Promise<ConnectStreamStats>
}
type ConnectClient = ConnectRuntimeClient & {
  getStream(id: string): Promise<unknown>
  createStream(id: string, config: Record<string, unknown>): Promise<void>
  updateStream(id: string, config: Record<string, unknown>): Promise<void>
  deleteStream(id: string): Promise<void>
}
type PipelineLifecycle = {
  createPipeline(definition: PipelineCreate): Promise<PipelineDefinition>
  updatePipeline(id: string, update: PipelineUpdate): Promise<PipelineDefinition>
  deletePipeline(id: string): Promise<void>
  publishPipeline(id: string, update: PipelineUpdate): Promise<{ pipeline: PipelineDefinition; connectStreamId: string; operation: "created" | "updated" }>
}
type PipelineWorkspaceDependencies = { store: PipelineStore; client: ConnectRuntimeClient }
type PipelineLifecycleDependencies = { store: PipelineStore; client: ConnectClient }

async function connectClient() {
  const { createConnectClient } = await import("../../runtime/connect/client")
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

  const authoringEntries = await Promise.all(
    definitions.map(async (definition) => {
      const revision = await store.getRevision(definition.desiredRevisionId)
      if (!revision) {
        throw new Error("Pipeline desired revision not found: " + definition.desiredRevisionId)
      }
      return [definition.id, authoringFromDefinition(definition, revision)] as const
    }),
  )
  const authoringById = new Map(authoringEntries)

  let streams
  try {
    streams = await client.listStreams()
  } catch {
    return {
      connectReachable: false,
      connectReady: probe.ready,
      pipelines: definitions.map((definition) => ({
        ...pipelineSummaryFromDefinition(definition),
        authoring: authoringById.get(definition.id)!,
      })),
    }
  }

  const pipelines: PipelineWorkspacePipeline[] = await Promise.all(
    definitions.map(async (definition) => {
      const authoring = authoringById.get(definition.id)!
      if (!definition.connectStreamId) {
        return { ...pipelineSummaryFromDefinition(definition), authoring }
      }

      const stream = streams[definition.connectStreamId]
      if (!stream) {
        return { ...pipelineSummaryFromDefinition(definition), authoring }
      }

      let stats = null
      try {
        stats = await client.getStreamStats(definition.connectStreamId)
      } catch {
        // The stream may disappear between the stream listing and stats request.
      }

      return {
        ...pipelineSummaryFromConnectStream(definition, stream, stats),
        authoring,
      }
    }),
  )

  return {
    connectReachable: probe.reachable,
    connectReady: probe.ready,
    pipelines,
  }
}

async function createLifecycle({ store, client }: PipelineLifecycleDependencies): Promise<PipelineLifecycle> {
  const { createPipelineLifecycle } = await import("../../pipeline/lifecycle")
  const { createActivityStore } = await import("../../operational/activity")
  return createPipelineLifecycle({ store, client, activity: createActivityStore() })
}

export async function createAuthoredPipelineCommand({
  lifecycle,
  authoring,
}: {
  lifecycle: Pick<PipelineLifecycle, "createPipeline">
  authoring: PipelineAuthoring
}) {
  const { createAuthoredPipeline } = await import("../../pipeline/authoring-lifecycle")
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
  const { updateAuthoredPipeline } = await import("../../pipeline/authoring-lifecycle")
  return updateAuthoredPipeline({ lifecycle, id, authoring })
}

export async function createPipelineCommand({
  lifecycle,
  definition,
}: {
  lifecycle: Pick<PipelineLifecycle, "createPipeline">
  definition: PipelineCreate
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
  update: PipelineUpdate
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
    store: (await import("../../pipeline/store.server")).createPipelineStore(),
    client: await connectClient(),
  }),
)

function validateId(input: unknown): string {
  if (!isObject(input) || typeof input.id !== "string" || input.id.trim() === "") {
    throw new Error("Pipeline id must be a non-empty string")
  }
  return input.id
}

function validatePipelineDefinition(input: unknown): PipelineCreate {
  if (!isObject(input)) throw new Error("Pipeline definition must be an object")
  if (typeof input.id !== "string" || input.id.trim() === "") {
    throw new Error("Pipeline id must be a non-empty string")
  }
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new Error("Pipeline name must be a non-empty string")
  }
  if (!isObject(input.metadata)) throw new Error("Pipeline metadata must be an object")
  if (!isObject(input.desiredConfig)) {
    throw new Error("Pipeline desiredConfig must be an object")
  }
  if (Object.prototype.hasOwnProperty.call(input, "connectStreamId")) {
    throw new Error("Pipeline connectStreamId is lifecycle-owned")
  }
  if (Object.prototype.hasOwnProperty.call(input, "desiredRevisionId")) {
    throw new Error("Pipeline desiredRevisionId is lifecycle-owned")
  }
  return input as PipelineCreate
}

function validatePipelineUpdate(input: unknown): { id: string; update: PipelineUpdate } {
  if (!isObject(input) || !isObject(input.update)) {
    throw new Error("Pipeline update must be an object")
  }

  const id = validateId(input)
  const update = input.update

  if (!isObject(update.metadata)) throw new Error("Pipeline metadata must be an object")
  if (!isObject(update.desiredConfig)) {
    throw new Error("Pipeline desiredConfig must be an object")
  }
  if (Object.prototype.hasOwnProperty.call(update, "desiredRevisionId")) {
    throw new Error("Pipeline desiredRevisionId is lifecycle-owned")
  }
  if (Object.prototype.hasOwnProperty.call(update, "connectStreamId")) {
    throw new Error("Pipeline connectStreamId is lifecycle-owned")
  }
  if (typeof update.name !== "string" || update.name.trim() === "") {
    throw new Error("Pipeline name must be a non-empty string")
  }

  return { id, update: update as PipelineUpdate }
}

function validateAuthoredCreate(input: unknown): PipelineAuthoring {
  validatePipelineAuthoring(input)
  return input
}

function validateAuthoredPipeline(input: unknown): {
  id: string
  authoring: PipelineAuthoring
} {
  if (!isObject(input)) throw new Error("Pipeline update must be an object")
  if (typeof input.id !== "string" || input.id.trim() === "") {
    throw new Error("Pipeline id must be a non-empty string")
  }
  validatePipelineAuthoring(input.authoring)
  if (input.authoring.id !== input.id) {
    throw new Error("Pipeline authoring id must match the pipeline id")
  }
  return { id: input.id, authoring: input.authoring }
}

export const createPipeline = createServerFn({ method: "POST" })
  .validator(validatePipelineDefinition)
  .handler(async ({ data }) => {
    const pipeline = await createPipelineCommand({
      lifecycle: await createLifecycle({
        store: (await import("../../pipeline/store.server")).createPipelineStore(),
        client: await connectClient(),
      }),
      definition: data,
    })
    return pipeline.id
  })

export const updatePipeline = createServerFn({ method: "POST" })
  .validator(validatePipelineUpdate)
  .handler(async ({ data }) => {
    const pipeline = await updatePipelineCommand({
      lifecycle: await createLifecycle({
        store: (await import("../../pipeline/store.server")).createPipelineStore(),
        client: await connectClient(),
      }),
      id: data.id,
      update: data.update,
    })
    return pipeline.id
  })

export const deletePipeline = createServerFn({ method: "POST" })
  .validator(validateId)
  .handler(async ({ data }) => {
    await deletePipelineCommand({
      lifecycle: await createLifecycle({
        store: (await import("../../pipeline/store.server")).createPipelineStore(),
        client: await connectClient(),
      }),
      id: data,
    })
  })

export const createAuthoredPipelineServer = createServerFn({ method: "POST" })
  .validator(validateAuthoredCreate)
  .handler(async ({ data }) => {
    const pipeline = await createAuthoredPipelineCommand({
      lifecycle: await createLifecycle({
        store: (await import("../../pipeline/store.server")).createPipelineStore(),
        client: await connectClient(),
      }),
      authoring: data,
    })
    return pipeline.id
  })

export const validateAuthoredPipelineServer = createServerFn({ method: "POST" })
  .validator(validateAuthoredPipeline)
  .handler(async ({ data }) => {
    const store = (await import("../../pipeline/store.server")).createPipelineStore()
    const existing = await store.get(data.id)
    const { validatePipelineDraft } = await import("../../pipeline/publish.server")
    return validatePipelineDraft(data.authoring, await connectClient(), existing?.connectStreamId ?? data.id)
  })

export const publishAuthoredPipelineServer = createServerFn({ method: "POST" })
  .validator(validateAuthoredPipeline)
  .handler(async ({ data }) => {
    const store = (await import("../../pipeline/store.server")).createPipelineStore()
    const existing = await store.get(data.id)
    const { publishPipelineDraft } = await import("../../pipeline/publish.server")
    const { createPipelineLifecycle } = await import("../../pipeline/lifecycle")
    const { createActivityStore } = await import("../../operational/activity")
    const client = await connectClient()
    return publishPipelineDraft({
      lifecycle: createPipelineLifecycle({
        store,
        client: await connectClient(),
        activity: createActivityStore(),
      }),
      client,
      authoring: data.authoring,
      connectStreamId: existing?.connectStreamId ?? data.id,
    })
  })

export const updateAuthoredPipelineServer = publishAuthoredPipelineServer

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
