import { describe, expect, it } from "vitest"
import type { PipelineCreate, PipelineUpdate } from "../../../src/pipeline/store"
import { createPipelineCommand, deletePipelineCommand, updatePipelineCommand } from "../../../src/features/pipelines/server"

const createInput: PipelineCreate = {
  id: "orders",
  name: "Orders",
  metadata: {},
  desiredConfig: { input: { generate: { interval: "1s" } }, output: { drop: {} } },
}

const update: PipelineUpdate = {
  name: "Updated Orders",
  metadata: {},
  desiredConfig: { input: { stdin: {} }, output: { drop: {} } },
}

describe("pipeline lifecycle server boundary", () => {
  it("delegates create to the lifecycle service", async () => {
    const calls: string[] = []
    const lifecycle = {
      createPipeline: async (value: PipelineCreate) => {
        calls.push("create")
        return { ...value, desiredRevisionId: "revision-1", connectStreamId: value.id }
      },
    }
    await expect(createPipelineCommand({ lifecycle, definition: createInput })).resolves.toMatchObject({
      id: "orders",
      desiredRevisionId: "revision-1",
    })
    expect(calls).toEqual(["create"])
  })

  it("delegates update to the lifecycle service", async () => {
    const calls: string[] = []
    const lifecycle = {
      updatePipeline: async (id: string, value: PipelineUpdate) => {
        calls.push(id)
        return { id, ...value, desiredRevisionId: "revision-2", connectStreamId: id }
      },
    }
    await expect(updatePipelineCommand({ lifecycle, id: "orders", update })).resolves.toMatchObject({
      id: "orders",
      desiredRevisionId: "revision-2",
    })
    expect(calls).toEqual(["orders"])
  })

  it("delegates delete to the lifecycle service", async () => {
    const calls: string[] = []
    const lifecycle = { deletePipeline: async (id: string) => { calls.push(id) } }
    await expect(deletePipelineCommand({ lifecycle, id: "orders" })).resolves.toBeUndefined()
    expect(calls).toEqual(["orders"])
  })
})
