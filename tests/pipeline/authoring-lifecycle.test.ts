import { describe, expect, it } from "vitest"
import type { PipelineCreate, PipelineDefinition, PipelineUpdate } from "../../src/pipeline/store"
import { createAuthoredPipeline, updateAuthoredPipeline } from "../../src/pipeline/authoring-lifecycle"

describe("authored pipeline lifecycle", () => {
  it("maps authored configuration into a revision command", async () => {
    const calls: PipelineCreate[] = []
    const lifecycle = {
      createPipeline: async (definition: PipelineCreate) => {
        calls.push(definition)
        return {
          id: definition.id,
          name: definition.name,
          metadata: definition.metadata,
          desiredRevisionId: "revision-1",
          connectStreamId: definition.id,
        } satisfies PipelineDefinition
      },
    }
    const result = await createAuthoredPipeline({
      lifecycle,
      authoring: {
        id: "orders",
        name: "Orders",
        metadata: { owner: "platform" },
        input: { generate: { interval: "1s", mapping: "root = {}" } },
        processors: [{ mapping: "root = this" }],
        output: { drop: {} },
      },
    })
    expect(result.desiredRevisionId).toBe("revision-1")
    expect(calls[0].desiredConfig).toEqual({
      input: { generate: { interval: "1s", mapping: "root = {}" } },
      pipeline: { processors: [{ mapping: "root = this" }] },
      output: { drop: {} },
    })
  })

  it("does not pass runtime or revision identity during update", async () => {
    let received: { id: string; update: PipelineUpdate } | undefined
    const lifecycle = {
      updatePipeline: async (id: string, update: PipelineUpdate) => {
        received = { id, update }
        return {
          id,
          name: update.name,
          metadata: update.metadata,
          desiredRevisionId: "revision-2",
          connectStreamId: "orders",
        }
      },
    }
    await updateAuthoredPipeline({
      lifecycle,
      id: "orders",
      authoring: {
        id: "orders",
        name: "Orders v2",
        input: { generate: { interval: "2s", mapping: "root = {}" } },
        output: { drop: {} },
      },
    })
    expect(received).toEqual({
      id: "orders",
      update: {
        name: "Orders v2",
        metadata: {},
        desiredConfig: {
          input: { generate: { interval: "2s", mapping: "root = {}" } },
          output: { drop: {} },
        },
      },
    })
  })
})
