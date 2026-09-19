import type { ConnectStreamConfig } from "../runtime/connect/client"
import type { PipelineDefinition } from "./store"

type PipelineStore = {
  create(definition: PipelineDefinition): Promise<PipelineDefinition>
  get(id: string): Promise<PipelineDefinition | null>
  update(id: string, update: Omit<PipelineDefinition, "id">): Promise<PipelineDefinition>
  delete(id: string): Promise<void>
}
type ConnectClient = {
  createStream(id: string, config: ConnectStreamConfig): Promise<void>
  updateStream(id: string, config: ConnectStreamConfig): Promise<void>
  deleteStream(id: string): Promise<void>
}
type ActivityStore = { append(event: { type: "pipeline.created" | "pipeline.updated" | "pipeline.deleted"; pipelineId: string; pipelineName: string; detail: string }): Promise<void> }
type PipelineLifecycleDependencies = { store: PipelineStore; client: ConnectClient; activity?: ActivityStore }

export function createPipelineLifecycle({ store, client, activity }: PipelineLifecycleDependencies) {
  return {
    async createPipeline(definition: PipelineDefinition): Promise<PipelineDefinition> {
      const connectStreamId = definition.connectStreamId ?? definition.id
      await client.createStream(connectStreamId, definition.desiredConfig)
      const pipeline = await store.create({ ...definition, connectStreamId })
      await activity?.append({ type: "pipeline.created", pipelineId: pipeline.id, pipelineName: pipeline.name, detail: "Pipeline created and published" })
      return pipeline
    },
    async updatePipeline(id: string, update: Omit<PipelineDefinition, "id">): Promise<PipelineDefinition> {
      const existing = await store.get(id)
      if (!existing) throw new Error("Pipeline not found: " + id)
      if (existing.connectStreamId) await client.updateStream(existing.connectStreamId, update.desiredConfig)
      const pipeline = await store.update(id, { ...update, connectStreamId: existing.connectStreamId })
      await activity?.append({ type: "pipeline.updated", pipelineId: pipeline.id, pipelineName: pipeline.name, detail: "Pipeline configuration published" })
      return pipeline
    },
    async deletePipeline(id: string): Promise<void> {
      const existing = await store.get(id)
      if (!existing) throw new Error("Pipeline not found: " + id)
      if (existing.connectStreamId) {
        try { await client.deleteStream(existing.connectStreamId) }
        catch (error) { if (!(error instanceof Error && "status" in error && error.status === 404)) throw error }
      }
      await store.delete(id)
      await activity?.append({ type: "pipeline.deleted", pipelineId: existing.id, pipelineName: existing.name, detail: "Pipeline deleted" })
    },
  }
}
