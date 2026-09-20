import { describe, expect, it } from "vitest"
import type { PipelineCreate, PipelineDefinition, PipelineUpdate } from "../../../src/pipeline/store"
import { createAuthoredPipelineCommand, updateAuthoredPipelineCommand } from "../../../src/features/pipelines/server"

describe("pipeline authoring server boundary", () => {
  it("delegates authored create to the authoring lifecycle", async () => {
    const received: PipelineCreate[] = []
    const lifecycle = {
      createPipeline: async (definition: PipelineCreate) => {
        received.push(definition)
        return {
          id: definition.id,
          name: definition.name,
          metadata: definition.metadata,
          desiredRevisionId: "revision-1",
          connectStreamId: definition.id,
        } satisfies PipelineDefinition
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

  it("delegates authored update without caller-supplied runtime or revision state", async () => {
    const calls: Array<{ id: string; update: PipelineUpdate }> = []
    const lifecycle = {
      updatePipeline: async (id: string, update: PipelineUpdate) => {
        calls.push({ id, update })
        return {
          id,
          name: update.name,
          metadata: update.metadata,
          desiredRevisionId: "revision-2",
          connectStreamId: id,
        }
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
    })).resolves.toMatchObject({ id: "orders", desiredRevisionId: "revision-2" })

    expect(calls[0].update).toEqual({
      name: "Orders v2",
      metadata: {},
      desiredConfig: {
        input: { generate: { interval: "2s", mapping: "root = {}" },
        },
        output: { drop: {} },
      },
    })
  })
})
