import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import type { JsonObject } from "./authoring"

export type PipelineMetadata = JsonObject

export type PipelineRevision = {
  id: string
  pipelineId: string
  version: number
  spec: JsonObject
  createdAt: string
  checksum: string
}

export type PipelineDefinition = {
  id: string
  name: string
  metadata: PipelineMetadata
  desiredRevisionId: string
  connectStreamId: string | null
}

export type PipelineCreate = Omit<PipelineDefinition, "desiredRevisionId" | "connectStreamId"> & {
  desiredConfig: JsonObject
}

export type PipelineUpdate = Omit<PipelineDefinition, "id" | "desiredRevisionId" | "connectStreamId"> & {
  desiredConfig: JsonObject
}

type PipelineState = {
  pipelines: PipelineDefinition[]
  revisions: PipelineRevision[]
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function canonicalize(value: JsonObject): JsonObject {
  return canonicalizeValue(value) as JsonObject
}

function canonicalizeValue(value: JsonObject[keyof JsonObject] | JsonObject): JsonObject[keyof JsonObject] | JsonObject {
  if (Array.isArray(value)) return value.map((item) => canonicalizeValue(item as JsonObject))
  if (isObject(value)) {
    const result: JsonObject = {}
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalizeValue(value[key] as JsonObject)
    }
    return result
  }
  return value
}

function checksum(spec: JsonObject): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(spec))).digest("hex")
}

export function createPipelineStore(filePath = resolve(process.cwd(), ".porcelain", "pipelines.json")) {
  async function readState(): Promise<PipelineState> {
    try {
      const contents = await readFile(filePath, "utf8")
      const parsed = JSON.parse(contents) as Partial<PipelineState>
      return { pipelines: parsed.pipelines ?? [], revisions: parsed.revisions ?? [] }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { pipelines: [], revisions: [] }
      throw error
    }
  }

  async function writeState(state: PipelineState): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(state, null, 2) + "\n", "utf8")
  }

  return {
    async list(): Promise<PipelineDefinition[]> {
      return (await readState()).pipelines
    },

    async get(id: string): Promise<PipelineDefinition | null> {
      return (await readState()).pipelines.find((pipeline) => pipeline.id === id) ?? null
    },

    async getRevision(id: string): Promise<PipelineRevision | null> {
      return (await readState()).revisions.find((revision) => revision.id === id) ?? null
    },

    async listRevisions(pipelineId: string): Promise<PipelineRevision[]> {
      return (await readState()).revisions.filter((revision) => revision.pipelineId === pipelineId)
    },

    async createWithRevision(input: PipelineCreate): Promise<PipelineDefinition> {
      const state = await readState()
      if (state.pipelines.some((pipeline) => pipeline.id === input.id)) {
        throw new Error("Pipeline already exists: " + input.id)
      }

      const revision: PipelineRevision = {
        id: randomUUID(),
        pipelineId: input.id,
        version: 1,
        spec: structuredClone(input.desiredConfig),
        createdAt: new Date().toISOString(),
        checksum: checksum(input.desiredConfig),
      }
      const { desiredConfig: _desiredConfig, ...definition } = input
      const pipeline: PipelineDefinition = {
        ...definition,
        desiredRevisionId: revision.id,
        connectStreamId: input.id,
      }
      state.pipelines.push(pipeline)
      state.revisions.push(revision)
      await writeState(state)
      return pipeline
    },

    async updateWithRevision(id: string, update: PipelineUpdate): Promise<PipelineDefinition> {
      const state = await readState()
      const index = state.pipelines.findIndex((pipeline) => pipeline.id === id)
      if (index === -1) throw new Error("Pipeline not found: " + id)

      const revisions = state.revisions.filter((revision) => revision.pipelineId === id)
      const revision: PipelineRevision = {
        id: randomUUID(),
        pipelineId: id,
        version: Math.max(0, ...revisions.map((item) => item.version)) + 1,
        spec: structuredClone(update.desiredConfig),
        createdAt: new Date().toISOString(),
        checksum: checksum(update.desiredConfig),
      }
      const { desiredConfig: _desiredConfig, ...definition } = update
      const updated: PipelineDefinition = {
        id,
        ...definition,
        desiredRevisionId: revision.id,
        connectStreamId: state.pipelines[index].connectStreamId ?? id,
      }
      state.pipelines[index] = updated
      state.revisions.push(revision)
      await writeState(state)
      return updated
    },

    async delete(id: string): Promise<void> {
      const state = await readState()
      const index = state.pipelines.findIndex((pipeline) => pipeline.id === id)
      if (index === -1) throw new Error("Pipeline not found: " + id)
      state.pipelines.splice(index, 1)
      state.revisions = state.revisions.filter((revision) => revision.pipelineId !== id)
      await writeState(state)
    },
  }
}
