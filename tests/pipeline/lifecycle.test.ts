import { describe, expect, it } from "vitest"
import { createPipelineLifecycle } from "../../src/pipeline/lifecycle"
import type { PipelineCreate, PipelineDefinition, PipelineUpdate } from "../../src/pipeline/store"

const desiredConfig = {
  input: { generate: { interval: "1s" } },
  pipeline: { processors: [{ bloblang: "root = this" }] },
  output: { drop: {} },
}

const createInput: PipelineCreate = {
  id: "orders",
  name: "Orders",
  metadata: { owner: "porcelain" },
  desiredConfig,
}

function createFakes() {
  const calls: string[] = []
  let stored: PipelineDefinition | null = null
  const revisions = new Map<string, { id: string; pipelineId: string; version: number; spec: import("../../src/pipeline/store").PipelineRevision["spec"]; createdAt: string; checksum: string }>()
  const store = {
    createWithRevision: async (value: PipelineCreate) => {
      calls.push("store.createWithRevision")
      const revision = {
        id: "revision-1",
        pipelineId: value.id,
        version: 1,
        spec: value.desiredConfig,
        createdAt: "2026-01-01T00:00:00.000Z",
        checksum: "checksum-1",
      }
      revisions.set(revision.id, revision)
      stored = { id: value.id, name: value.name, metadata: value.metadata, desiredRevisionId: revision.id, connectStreamId: value.id }
      return stored
    },
    get: async (id: string) => {
      calls.push("store.get:" + id)
      return stored?.id === id ? stored : null
    },
    updateWithRevision: async (id: string, update: PipelineUpdate) => {
      calls.push("store.updateWithRevision:" + id)
      const revision = {
        id: "revision-2",
        pipelineId: id,
        version: 2,
        spec: update.desiredConfig,
        createdAt: "2026-01-01T00:00:00.000Z",
        checksum: "checksum-2",
      }
      revisions.set(revision.id, revision)
      stored = { id, name: update.name, metadata: update.metadata, desiredRevisionId: revision.id, connectStreamId: id }
      return stored
    },
    getRevision: async (id: string) => revisions.get(id) ?? null,
    delete: async (id: string) => { calls.push("store.delete:" + id); stored = null },
  }
  const client = {
    createStream: async (id: string, config: typeof desiredConfig) => {
      calls.push("connect.create:" + id)
      expect(config).toEqual(desiredConfig)
    },
    updateStream: async (id: string, _config: typeof desiredConfig) => { calls.push("connect.update:" + id) },
    deleteStream: async (id: string) => { calls.push("connect.delete:" + id) },
  }
  return { calls, store, client, setStored: (value: PipelineDefinition | null) => { stored = value } }
}

describe("createPipelineLifecycle", () => {
  it("creates Connect before the durable revision", async () => {
    const { calls, store, client } = createFakes()
    const lifecycle = createPipelineLifecycle({ store, client })
    await expect(lifecycle.createPipeline(createInput)).resolves.toMatchObject({
      id: "orders",
      desiredRevisionId: "revision-1",
      connectStreamId: "orders",
    })
    expect(calls).toEqual(["connect.create:orders", "store.createWithRevision"])
  })

  it("updates Connect before advancing the desired revision", async () => {
    const { calls, store, client, setStored } = createFakes()
    setStored({ id: "orders", name: "Orders", metadata: {}, desiredRevisionId: "revision-1", connectStreamId: "orders" })
    const lifecycle = createPipelineLifecycle({ store, client })
    const update = { name: "Orders v2", metadata: {}, desiredConfig: { input: { stdin: {} }, output: { drop: {} } } }
    await expect(lifecycle.updatePipeline("orders", update)).resolves.toMatchObject({ desiredRevisionId: "revision-2" })
    expect(calls).toEqual(["store.get:orders", "connect.update:orders", "store.updateWithRevision:orders"])
  })
})

describe("pipeline lifecycle failure semantics", () => {
  it("does not create a revision when Connect create fails", async () => {
    const { calls, store, client } = createFakes()
    client.createStream = async () => { calls.push("connect.create:orders"); throw new Error("create failed") }
    const lifecycle = createPipelineLifecycle({ store, client })
    await expect(lifecycle.createPipeline(createInput)).rejects.toThrow("create failed")
    expect(calls).toEqual(["connect.create:orders"])
  })

  it("leaves the previous desired revision intact when Connect update fails", async () => {
    const { calls, store, client, setStored } = createFakes()
    const existing = { id: "orders", name: "Orders", metadata: {}, desiredRevisionId: "revision-1", connectStreamId: "orders" }
    setStored(existing)
    client.updateStream = async () => { calls.push("connect.update:orders"); throw new Error("update failed") }
    const lifecycle = createPipelineLifecycle({ store, client })
    await expect(lifecycle.updatePipeline("orders", { name: "Orders v2", metadata: {}, desiredConfig })).rejects.toThrow("update failed")
    expect(calls).toEqual(["store.get:orders", "connect.update:orders"])
    await expect(store.get("orders")).resolves.toEqual(existing)
  })
})
