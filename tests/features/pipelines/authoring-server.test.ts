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

  it("delegates authored update to the authoring lifecycle", async () => {
    const calls: string[] = []
    const lifecycle = {
      updatePipeline: async (id: string, update: Omit<PipelineDefinition, "id">) => {
        calls.push(id)
        return { id, ...update }
      },
    }
    const existing: PipelineDefinition = {
      id: "orders",
      name: "Orders",
      metadata: {},
      desiredConfig: {},
      connectStreamId: "orders",
    }
    await expect(updateAuthoredPipelineCommand({
      lifecycle,
      id: "orders",
      existing,
      authoring: {
        id: "orders",
        name: "Orders v2",
        input: { generate: { interval: "2s", mapping: "root = {}" } },
        output: { drop: {} },
      },
    })).resolves.toMatchObject({ id: "orders", name: "Orders v2" })
    expect(calls).toEqual(["orders"])
  })
})
