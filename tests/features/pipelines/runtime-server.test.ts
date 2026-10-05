import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadPipelineRuntime } from "../../../src/features/pipelines/runtime-server"
import { createPipelineStore } from "../../../src/pipeline/store.server"

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))) })

async function storeWithPipeline() {
  const dir = await mkdtemp(join(tmpdir(), "porcelain-runtime-"))
  dirs.push(dir)
  const store = createPipelineStore(join(dir, "pipelines.json"))
  await store.createWithRevision({
    id: "orders", name: "Orders", metadata: {},
    desiredConfig: { input: { stdin: {} }, output: { drop: {} } },
  })
  return store
}

describe("loadPipelineRuntime", () => {
  it("uses Connect readiness, stream state and native stream stats", async () => {
    const store = await storeWithPipeline()
    const client = {
      probe: async () => ({ reachable: true, ready: true }),
      listStreams: async () => ({ orders: { active: true, uptime: 42, uptime_str: "42s" } }),
      getStreamStats: async () => ({ 'input_received{path="root.input",stream="orders"}': 42 }),
    }
    await expect(loadPipelineRuntime("orders", client, store)).resolves.toEqual({
      connectReachable: true, connectReady: true,
      runtime: { connected: true, active: true, uptimeSeconds: 42, uptime: "42s", stats: { 'input_received{path="root.input",stream="orders"}': 42 } },
    })
  })

  it("keeps the durable pipeline disconnected when its Connect stream disappears", async () => {
    const store = await storeWithPipeline()
    const client: Pick<Awaited<ReturnType<typeof import("../../../src/runtime/connect/client").createConnectClient>>, "probe" | "listStreams" | "getStreamStats"> = {
      probe: async () => ({ reachable: true, ready: true }),
      listStreams: async () => ({}),
      getStreamStats: async () => ({}),
    }
    await expect(loadPipelineRuntime("orders", client, store)).resolves.toMatchObject({
      connectReachable: true, connectReady: true,
      runtime: { connected: false, active: false, stats: null },
    })
  })
})
