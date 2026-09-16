import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadPipelineWorkspace } from "../../../src/features/pipelines/server"
import { createPipelineStore } from "../../../src/pipeline/store"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createStoreWithPipeline() {
  const dir = await mkdtemp(join(tmpdir(), "porcelain-workspace-"))
  tempDirs.push(dir)
  const store = createPipelineStore(join(dir, "pipelines.json"))
  await store.create({
    id: "orders",
    name: "Orders",
    metadata: { owner: "porcelain" },
    desiredConfig: {
      input: { generate: { interval: "1s" } },
      pipeline: { processors: [{ bloblang: "root = this" }] },
      output: { drop: {} },
    },
    connectStreamId: "orders-runtime",
  })
  return store
}

describe("loadPipelineWorkspace", () => {
  it("keeps durable pipelines visible when Connect is unavailable", async () => {
    const store = await createStoreWithPipeline()
    const client = {
      ready: async () => false,
      listStreams: async () => {
        throw new Error("unreachable")
      },
      getStreamStats: async () => ({}),
    }

    await expect(loadPipelineWorkspace({ store, client })).resolves.toEqual({
      connectReady: false,
      pipelines: [
        {
          id: "orders",
          name: "Orders",
          connectStreamId: "orders-runtime",
          runtime: {
            connected: false,
            active: false,
            uptimeSeconds: 0,
            uptime: "0s",
            stats: null,
          },
        },
      ],
    })
  })

  it("enriches a durable pipeline from its associated Connect stream", async () => {
    const store = await createStoreWithPipeline()
    const client = {
      ready: async () => true,
      listStreams: async () => ({
        "orders-runtime": {
          active: true,
          uptime: 42,
          uptime_str: "42s",
        },
      }),
      getStreamStats: async (id: string) => ({ stream: id, input: { received: 42 } }),
    }

    await expect(loadPipelineWorkspace({ store, client })).resolves.toEqual({
      connectReady: true,
      pipelines: [
        {
          id: "orders",
          name: "Orders",
          connectStreamId: "orders-runtime",
          runtime: {
            connected: true,
            active: true,
            uptimeSeconds: 42,
            uptime: "42s",
            stats: { stream: "orders-runtime", input: { received: 42 } },
          },
        },
      ],
    })
  })

  it("keeps live association when Connect is reachable but not ready", async () => {
    const store = await createStoreWithPipeline()
    const client = {
      ready: async () => false,
      listStreams: async () => ({
        "orders-runtime": {
          active: false,
          uptime: 9,
          uptime_str: "9s",
        },
      }),
      getStreamStats: async () => ({ input: { received: 9 } }),
    }

    await expect(loadPipelineWorkspace({ store, client })).resolves.toEqual({
      connectReady: false,
      pipelines: [
        {
          id: "orders",
          name: "Orders",
          connectStreamId: "orders-runtime",
          runtime: {
            connected: true,
            active: false,
            uptimeSeconds: 9,
            uptime: "9s",
            stats: { input: { received: 9 } },
          },
        },
      ],
    })
  })

  it("does not hide a pipeline when its associated stream no longer exists", async () => {
    const store = await createStoreWithPipeline()
    const client = {
      ready: async () => true,
      listStreams: async () => ({}),
      getStreamStats: async () => ({}),
    }

    const workspace = await loadPipelineWorkspace({ store, client })
    expect(workspace.pipelines[0]?.runtime.connected).toBe(false)
    expect(workspace.pipelines[0]?.id).toBe("orders")
  })
})
