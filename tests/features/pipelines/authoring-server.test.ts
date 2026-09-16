import { describe, expect, it } from "vitest"
import type { PipelineDefinition } from "../../../src/pipeline/store"
import { createAuthoredPipelineCommand, updateAuthoredPipelineCommand } from "../../../src/features/pipelines/server"

describe("pipeline authoring server boundary", () => {
  it("delegates authored create to the authoring lifecycle", async () => {
    const received: PipelineDefinition[] = []
    const lifecycle = {
      createPipeline: async (definition: PipelineDefinition) => {
        received.push(definition)
        return definition
      },
    }
    const result = await createAuthoredPipelineCommand({
      lifecycle,
      authoring: {
        id: "orders",
        name: "Orders",
        input: { generate: { interval: "1s", mapping: "root = {}" } },
        processors: [{ mapping: "root = this" }],
        output: { drop: {} },
      },
    })
    expect(result.id).toBe("orders")
    expect(received[0].desiredConfig).toEqual({
      input: { generate: { interval: "1s", mapping: "root = {}" } },
      pipeline: { processors: [{ mapping: "root = this" }] },
      output: { drop: {} },
    })
  })

  it("delegates authored update without accepting caller-supplied runtime state", async () => {
    const calls: Array<{ id: string; update: Omit<PipelineDefinition, "id"> }> = []
    const lifecycle = {
      updatePipeline: async (id: string, update: Omit<PipelineDefinition, "id">) => {
        calls.push({ id, update })
        return { id, ...update }
      },
    }
    await expect(updateAuthoredPipelineCommand({
      lifecycle,
      id: "orders",
      authoring: {
        id: "orders",
        name: "Orders v2",
        input: { generate: { interval: "2s", mapping: "root = {}" } },
        output: { drop: {} },
      },
    })).resolves.toMatchObject({ id: "orders", name: "Orders v2" })
    expect(calls).toHaveLength(1)
    expect(calls[0].update.connectStreamId).toBeNull()
  })
})