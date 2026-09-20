import { describe, expect, it } from "vitest"
import type { PipelineDefinition } from "../../../src/pipeline/store"
import { createPipelineCommand, deletePipelineCommand, updatePipelineCommand } from "../../../src/features/pipelines/server"
import type { PipelineUpdate } from "../../../src/pipeline/lifecycle"

const definition: PipelineDefinition = {
  id: "orders",
  name: "Orders",
  metadata: {},
  desiredConfig: { input: { generate: { interval: "1s" } }, output: { drop: {} } },
  connectStreamId: "orders-runtime",
}

describe("pipeline lifecycle server boundary", () => {
  it("delegates create to the lifecycle service", async () => {
    const calls: string[] = []
    const lifecycle = { createPipeline: async (value: PipelineDefinition) => { calls.push("create"); return value } }
    await expect(createPipelineCommand({ lifecycle, definition })).resolves.toEqual(definition)
    expect(calls).toEqual(["create"])
  })

  it("delegates update to the lifecycle service", async () => {
    const calls: string[] = []
    const lifecycle = { updatePipeline: async (id: string, value: PipelineUpdate) => { calls.push(id); return { id, ...value, connectStreamId: definition.connectStreamId } } }
    const { connectStreamId: _connectStreamId, ...update } = { ...definition, name: "Updated Orders" }
    await expect(updatePipelineCommand({ lifecycle, id: "orders", update })).resolves.toEqual({ ...update, connectStreamId: definition.connectStreamId })
    expect(calls).toEqual(["orders"])
  })

  it("delegates delete to the lifecycle service", async () => {
    const calls: string[] = []
    const lifecycle = { deletePipeline: async (id: string) => { calls.push(id) } }
    await expect(deletePipelineCommand({ lifecycle, id: "orders" })).resolves.toBeUndefined()
    expect(calls).toEqual(["orders"])
  })
})
