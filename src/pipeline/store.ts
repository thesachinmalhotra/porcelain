import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import type { JsonObject } from "./authoring"

export type PipelineMetadata = JsonObject

export type PipelineDefinition = {
  id: string
  name: string
  metadata: PipelineMetadata
  desiredConfig: JsonObject
  connectStreamId: string | null
}

type PipelineState = {
  pipelines: PipelineDefinition[]
}

type PipelineUpdate = Omit<PipelineDefinition, "id">

export function createPipelineStore(filePath = resolve(process.cwd(), ".porcelain", "pipelines.json")) {
  async function readState(): Promise<PipelineState> {
    try {
      const contents = await readFile(filePath, "utf8")
      return JSON.parse(contents) as PipelineState
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { pipelines: [] }
      }
      throw error
    }
  }

  async function writeState(state: PipelineState): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(state, null, 2) + "\n", "utf8")
  }

  return {
    async list(): Promise<PipelineDefinition[]> {
      const state = await readState()
      return state.pipelines
    },

    async get(id: string): Promise<PipelineDefinition | null> {
      const state = await readState()
      return state.pipelines.find((pipeline) => pipeline.id === id) ?? null
    },

    async create(definition: PipelineDefinition): Promise<PipelineDefinition> {
      const state = await readState()
      if (state.pipelines.some((pipeline) => pipeline.id === definition.id)) {
        throw new Error("Pipeline already exists: " + definition.id)
      }

      state.pipelines.push(definition)
      await writeState(state)
      return definition
    },

    async update(id: string, update: PipelineUpdate): Promise<PipelineDefinition> {
      const state = await readState()
      const index = state.pipelines.findIndex((pipeline) => pipeline.id === id)
      if (index === -1) {
        throw new Error("Pipeline not found: " + id)
      }

      const updated = { id, ...update }
      state.pipelines[index] = updated
      await writeState(state)
      return updated
    },
    async delete(id: string): Promise<void> {
      const state = await readState()
      const index = state.pipelines.findIndex((pipeline) => pipeline.id === id)
      if (index === -1) {
        throw new Error("Pipeline not found: " + id)
      }

      state.pipelines.splice(index, 1)
      await writeState(state)
    },
  }
}

