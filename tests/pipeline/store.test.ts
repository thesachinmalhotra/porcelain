import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createPipelineStore } from "../../src/pipeline/store"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTestStore() {
  const dir = await mkdtemp(join(tmpdir(), "porcelain-pipeline-store-"))
  tempDirs.push(dir)
  return createPipelineStore(join(dir, "pipelines.json"))
}

const definition = {
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

describe("pipeline store", () => {
  it("starts empty and persists created pipelines", async () => {
    const store = await createTestStore()

    expect(await store.list()).toEqual([])

    const created = await store.create(definition)
    expect(created).toEqual(definition)
    expect(await store.get("orders")).toEqual(definition)

  })

  it("reads the same pipeline from a new store instance", async () => {
    const dir = await mkdtemp(join(tmpdir(), "porcelain-pipeline-store-"))
    tempDirs.push(dir)
    const path = join(dir, "pipelines.json")

    const first = createPipelineStore(path)
    await first.create(definition)

    const second = createPipelineStore(path)
    expect(await second.get("orders")).toEqual(definition)
  })

  it("updates desired state without changing pipeline identity", async () => {
    const store = await createTestStore()
    await store.create(definition)

    const updated = await store.update("orders", {
      name: "Orders v2",
      metadata: { owner: "platform" },
      desiredConfig: { input: { stdin: {} }, output: { drop: {} } },
      connectStreamId: "orders-runtime-v2",
    })

    expect(updated).toEqual({
      ...definition,
      name: "Orders v2",
      metadata: { owner: "platform" },
      desiredConfig: { input: { stdin: {} }, output: { drop: {} } },
      connectStreamId: "orders-runtime-v2",
    })
  })
})
