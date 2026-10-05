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

export type PipelineCreate = Omit<PipelineDefinition, "desiredRevisionId" | "connectStreamId"> & { desiredConfig: JsonObject }
export type PipelineUpdate = Omit<PipelineDefinition, "id" | "desiredRevisionId" | "connectStreamId"> & { desiredConfig: JsonObject }
