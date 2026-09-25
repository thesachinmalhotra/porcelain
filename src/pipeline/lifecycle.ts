import type { ConnectStreamConfig } from "../runtime/connect/client"
import type { PipelineCreate, PipelineDefinition, PipelineRevision, PipelineUpdate } from "./store"

type PipelineStore = {
  createWithRevision(input: PipelineCreate): Promise<PipelineDefinition>
  get(id: string): Promise<PipelineDefinition | null>
  updateWithRevision(id: string, update: PipelineUpdate): Promise<PipelineDefinition>
  getRevision(id: string): Promise<PipelineRevision | null>
  delete(id: string): Promise<void>
}
type ConnectClient = {
  getStream(id: string): Promise<unknown>
  createStream(id: string, config: ConnectStreamConfig): Promise<void>
  updateStream(id: string, config: ConnectStreamConfig): Promise<void>
  deleteStream(id: string): Promise<void>
}
type ActivityStore = {
  append(event: {
    type: "pipeline.created" | "pipeline.updated" | "pipeline.deleted"
    pipelineId: string
    pipelineName: string
    detail: string
  }): Promise<void>
}
type PipelineLifecycleDependencies = { store: PipelineStore; client: ConnectClient; activity?: ActivityStore }

export function createPipelineLifecycle({ store, client, activity }: PipelineLifecycleDependencies) {
  async function streamExists(id: string): Promise<boolean> {
    try {
      await client.getStream(id)
      return true
    } catch (error) {
      if (error instanceof Error && "status" in error && error.status === 404) return false
      throw error
    }
  }

  return {
    async createPipeline(definition: PipelineCreate): Promise<PipelineDefinition> {
      const connectStreamId = definition.id
      await client.createStream(connectStreamId, definition.desiredConfig)
      const pipeline = await store.createWithRevision(definition)
      await activity?.append({
        type: "pipeline.created",
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        detail: "Pipeline created and published",
      })
      return pipeline
    },

    async updatePipeline(id: string, update: PipelineUpdate): Promise<PipelineDefinition> {
      const existing = await store.get(id)
      if (!existing) throw new Error("Pipeline not found: " + id)
      if (!existing.connectStreamId) throw new Error("Pipeline is not linked to a Redpanda Connect stream: " + id)
      await client.updateStream(existing.connectStreamId, update.desiredConfig)
      const pipeline = await store.updateWithRevision(id, update)
      await activity?.append({
        type: "pipeline.updated",
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        detail: "Pipeline configuration published",
      })
      return pipeline
    },

    async publishPipeline(id: string, update: PipelineUpdate): Promise<{ pipeline: PipelineDefinition; connectStreamId: string; operation: "created" | "updated" }> {
      const existing = await store.get(id)
      if (!existing) throw new Error("Pipeline not found: " + id)

      const connectStreamId = existing.connectStreamId ?? existing.id
      const exists = await streamExists(connectStreamId)
      let operation: "created" | "updated"
      if (exists) {
        try {
          await client.updateStream(connectStreamId, update.desiredConfig)
          operation = "updated"
        } catch (error) {
          if (!(error instanceof Error && "status" in error && error.status === 404)) throw error
          await client.createStream(connectStreamId, update.desiredConfig)
          operation = "created"
        }
      } else {
        await client.createStream(connectStreamId, update.desiredConfig)
        operation = "created"
      }

      const pipeline = await store.updateWithRevision(id, update)
      await activity?.append({
        type: "pipeline.updated",
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        detail: "Pipeline configuration published",
      })
      return { pipeline, connectStreamId, operation }
    },

    async deletePipeline(id: string): Promise<void> {
      const existing = await store.get(id)
      if (!existing) throw new Error("Pipeline not found: " + id)
      if (existing.connectStreamId) {
        try {
          await client.deleteStream(existing.connectStreamId)
        } catch (error) {
          if (!(error instanceof Error && "status" in error && error.status === 404)) throw error
        }
      }
      await store.delete(id)
      await activity?.append({
        type: "pipeline.deleted",
        pipelineId: existing.id,
        pipelineName: existing.name,
        detail: "Pipeline deleted",
      })
    },
  }
}
