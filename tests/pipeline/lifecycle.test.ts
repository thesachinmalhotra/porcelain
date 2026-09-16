import { describe, expect, it } from "vitest"
import type { PipelineDefinition } from "../../src/pipeline/store"
import { createPipelineLifecycle } from "../../src/pipeline/lifecycle"
import { ConnectRequestError } from "../../src/runtime/connect/client"

const definition: PipelineDefinition = {
  id: "orders",
  name: "Orders",
  metadata: { owner: "porcelain" },
  desiredConfig: {
    input: { generate: { interval: "1s" } },
    pipeline: { processors: [{ bloblang: "root = this" }] },
    output: { drop: {} },
  },
  connectStreamId: "orders-runtime",
}

function createFakes() {
  const calls: string[] = []
  let stored: PipelineDefinition | null = definition
  const store = {
    create: async (value: PipelineDefinition) => { calls.push("store.create"); stored = value; return value },
    get: async (id: string) => { calls.push("store.get:" + id); return stored?.id === id ? stored : null },
    update: async (id: string, update: Omit<PipelineDefinition, "id">) => { calls.push("store.update:" + id); stored = { id, ...update }; return stored },
    delete: async (id: string) => { calls.push("store.delete:" + id); stored = null },
  }
  const client = {
    createStream: async (id: string, config: Record<string, unknown>) => { calls.push("connect.create:" + id); expect(config).toEqual(definition.desiredConfig) },
    updateStream: async (id: string, _config: Record<string, unknown>) => { calls.push("connect.update:" + id) },
    deleteStream: async (id: string) => { calls.push("connect.delete:" + id) },
  }
  return { calls, store, client, setStored: (value: PipelineDefinition | null) => { stored = value } }
}

describe("createPipelineLifecycle", () => {
  it("creates the Connect stream before persisting the durable pipeline", async () => {
    const { calls, store, client, setStored } = createFakes(); setStored(null)
    const lifecycle = createPipelineLifecycle({ store, client })
    await expect(lifecycle.createPipeline(definition)).resolves.toEqual(definition)
    expect(calls).toEqual(["connect.create:orders-runtime", "store.create"])
  })

  it("uses the Porcelain id as the Connect stream id when no association exists", async () => {
    const { calls, store, client, setStored } = createFakes(); setStored(null)
    const lifecycle = createPipelineLifecycle({ store, client })
    const unassociated = { ...definition, connectStreamId: null }
    await expect(lifecycle.createPipeline(unassociated)).resolves.toEqual({ ...unassociated, connectStreamId: "orders" })
    expect(calls).toEqual(["connect.create:orders", "store.create"])
  })

  it("updates Connect before persisting the new durable desired state", async () => {
    const { calls, store, client } = createFakes()
    const lifecycle = createPipelineLifecycle({ store, client })
    const update = { ...definition, desiredConfig: { ...definition.desiredConfig, output: { drop: { updated: true } } } }
    await expect(lifecycle.updatePipeline("orders", update)).resolves.toEqual(update)
    expect(calls).toEqual(["store.get:orders", "connect.update:orders-runtime", "store.update:orders"])
  })

  it("deletes Connect before removing the durable pipeline", async () => {
    const { calls, store, client } = createFakes()
    const lifecycle = createPipelineLifecycle({ store, client })
    await expect(lifecycle.deletePipeline("orders")).resolves.toBeUndefined()
    expect(calls).toEqual(["store.get:orders", "connect.delete:orders-runtime", "store.delete:orders"])
  })

  it("deletes an unassociated durable pipeline without calling Connect", async () => {
    const { calls, store, client, setStored } = createFakes(); setStored({ ...definition, connectStreamId: null })
    const lifecycle = createPipelineLifecycle({ store, client })
    await expect(lifecycle.deletePipeline("orders")).resolves.toBeUndefined()
    expect(calls).toEqual(["store.get:orders", "store.delete:orders"])
  })
})




describe("pipeline lifecycle failure semantics", () => {
  it("does not persist when Connect create fails", async () => {
    const { calls, store, client, setStored } = createFakes(); setStored(null)
    const error = new Error("create failed")
    client.createStream = async () => { calls.push("connect.create:orders-runtime"); throw error }
    const lifecycle = createPipelineLifecycle({ store, client })
    await expect(lifecycle.createPipeline(definition)).rejects.toBe(error)
    expect(calls).toEqual(["connect.create:orders-runtime"])
    await expect(store.get("orders")).resolves.toBeNull()
  })

  it("does not persist when Connect update fails", async () => {
    const { calls, store, client } = createFakes()
    const error = new Error("update failed")
    client.updateStream = async () => { calls.push("connect.update:orders-runtime"); throw error }
    const lifecycle = createPipelineLifecycle({ store, client })
    const update = { ...definition, desiredConfig: { ...definition.desiredConfig, output: { drop: { updated: true } } } }
    await expect(lifecycle.updatePipeline("orders", update)).rejects.toBe(error)
    expect(calls).toEqual(["store.get:orders", "connect.update:orders-runtime"])
    await expect(store.get("orders")).resolves.toEqual(definition)
  })

  it("deletes durable state when the associated Connect stream is already gone", async () => {
    const { calls, store, client } = createFakes()
    client.deleteStream = async (id: string) => {
      calls.push("connect.delete:" + id)
      throw new ConnectRequestError("DELETE", "/streams/" + id, 404)
    }
    const lifecycle = createPipelineLifecycle({ store, client })
    await expect(lifecycle.deletePipeline("orders")).resolves.toBeUndefined()
    expect(calls).toEqual(["store.get:orders", "connect.delete:orders-runtime", "store.delete:orders"])
    await expect(store.get("orders")).resolves.toBeNull()
  })

  it("keeps durable state when Connect delete fails for another status", async () => {
    const { calls, store, client } = createFakes()
    const error = new ConnectRequestError("DELETE", "/streams/orders-runtime", 503)
    client.deleteStream = async () => { calls.push("connect.delete:orders-runtime"); throw error }
    const lifecycle = createPipelineLifecycle({ store, client })
    await expect(lifecycle.deletePipeline("orders")).rejects.toBe(error)
    expect(calls).toEqual(["store.get:orders", "connect.delete:orders-runtime"])
    await expect(store.get("orders")).resolves.toEqual(definition)
  })

  it("rejects update when the durable pipeline does not exist", async () => {
    const { calls, store, client, setStored } = createFakes(); setStored(null)
    const lifecycle = createPipelineLifecycle({ store, client })
    await expect(lifecycle.updatePipeline("missing", { ...definition })).rejects.toThrow("Pipeline not found: missing")
    expect(calls).toEqual(["store.get:missing"])
  })

  it("rejects delete when the durable pipeline does not exist", async () => {
    const { calls, store, client, setStored } = createFakes(); setStored(null)
    const lifecycle = createPipelineLifecycle({ store, client })
    await expect(lifecycle.deletePipeline("missing")).rejects.toThrow("Pipeline not found: missing")
    expect(calls).toEqual(["store.get:missing"])
  })})

