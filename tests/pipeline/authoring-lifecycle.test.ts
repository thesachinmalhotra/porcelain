import { describe, expect, it } from "vitest"
import type { PipelineDefinition } from "../../src/pipeline/store"
import { createAuthoredPipeline, updateAuthoredPipeline } from "../../src/pipeline/authoring-lifecycle"

describe("authored pipeline lifecycle", () => {
  it("creates a durable definition through lifecycle with mapped Connect config", async () => {
    const calls: PipelineDefinition[] = []
    const lifecycle = {
      createPipeline: async (definition: PipelineDefinition) => {
        calls.push(definition)
        return definition
      },
    }
    const result = await createAuthoredPipeline({
      lifecycle,
      authoring: {
        id: "orders",
        name: "Orders",
        metadata: { owner: "platform" },
        input: { generate: { interval: "1s" } },
        processors: [{ bloblang: "root = this" }],
        output: { drop: {} },
      },
    })
    expect(result.desiredConfig).toEqual({
      input: { generate: { interval: "1s" } },
      pipeline: { processors: [{ bloblang: "root = this" }] },
      output: { drop: {} },
    })
    expect(result.connectStreamId).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it("updates through lifecycle while preserving the existing stream id", async () => {
    let received: { id: string; update: Omit<PipelineDefinition, "id"> } | undefined
    const lifecycle = {
      updatePipeline: async (id: string, update: Omit<PipelineDefinition, "id">) => {
        received = { id, update }
        return { id, ...update }
      },
    }
    const existing: PipelineDefinition = {
      id: "orders",
      name: "Orders",
      metadata: { owner: "platform" },
      desiredConfig: { input: { generate: { interval: "1s" } }, output: { drop: {} } },
      connectStreamId: "orders",
    }
    await updateAuthoredPipeline({
      lifecycle,
      id: "orders",
      existing,
      authoring: {
        id: "orders",
        name: "Orders v2",
        input: { generate: { interval: "2s" } },
        output: { drop: {} },
      },
    })
    expect(received).toEqual({
      id: "orders",
      update: {
        name: "Orders v2",
        metadata: {},
        desiredConfig: { input: { generate: { interval: "2s" } }, output: { drop: {} } },
        connectStreamId: "orders",
      },
    })
  })
})
