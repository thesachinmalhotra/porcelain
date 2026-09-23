import { afterEach, describe, expect, it } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConnectRequestError, createConnectClient } from "../../src/runtime/connect/client"
import { publishPipelineDraft } from "../../src/pipeline/publish"
import { createPipelineStore } from "../../src/pipeline/store"

const run = describe.runIf(process.env.CI === "true")
const baseUrl = process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195"
const tempDirs: string[] = []
const streamIds: string[] = []

afterEach(async () => {
  const client = createConnectClient({ baseUrl })
  await Promise.all(streamIds.splice(0).map(async (id) => {
    try { await client.deleteStream(id) } catch {}
  }))
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function connectConfig(mapping: string) {
  return {
    input: { generate: { interval: "100ms", mapping, count: 0 } },
    pipeline: { processors: [] },
    output: { drop: {} },
  }
}

async function createStore(id: string) {
  const dir = await mkdtemp(join(tmpdir(), "porcelain-publish-smoke-"))
  tempDirs.push(dir)
  const store = createPipelineStore(join(dir, "pipelines.json"))
  await store.createWithRevision({
    id, name: "Smoke pipeline", metadata: { source: "sac-46-smoke" },
    desiredConfig: connectConfig('root = "v1"'),
  })
  return store
}

run("SAC-46 real Connect publish", () => {
  it("creates a missing stream through POST and projects runtime stats", async () => {
    const id = "sac-46-create-" + Date.now()
    streamIds.push(id)
    const store = await createStore(id)
    const client = createConnectClient({ baseUrl })
    const result = await publishPipelineDraft({
      store, client,
      authoring: { id, name: "Smoke pipeline", metadata: { source: "sac-46-smoke" },
        input: { generate: { interval: "100ms", mapping: 'root = "v1"', count: 0 } }, output: { drop: {} } },
    })
    expect(result.restartRequired).toBe(false)
    expect(result.runtime.connected).toBe(true)
    expect(result.runtime.active).toBe(true)
    expect(result.runtime.stats).toBeDefined()
    await expect(client.getStream(id)).resolves.toMatchObject({
      active: true,
      config: { input: { generate: { mapping: 'root = "v1"' } }, output: { drop: {} } },
    })
  }, 30000)

  it("updates an existing stream through PUT and observes the restarted runtime", async () => {
    const id = "sac-46-update-" + Date.now()
    streamIds.push(id)
    const store = await createStore(id)
    const client = createConnectClient({ baseUrl })
    const first = await publishPipelineDraft({
      store, client,
      authoring: { id, name: "Smoke pipeline", metadata: { source: "sac-46-smoke" },
        input: { generate: { interval: "100ms", mapping: 'root = "v1"', count: 0 } }, output: { drop: {} } },
    })
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const before = await client.getStream(id)
    const second = await publishPipelineDraft({
      store, client,
      authoring: { id, name: "Smoke pipeline", metadata: { source: "sac-46-smoke" },
        input: { generate: { interval: "100ms", mapping: 'root = "v2"', count: 0 } }, output: { drop: {} } },
    })
    expect(first.restartRequired).toBe(false)
    expect(second.restartRequired).toBe(true)
    expect(second.runtime.connected).toBe(true)
    expect(second.runtime.active).toBe(true)
    expect(second.runtime.uptime).toBeLessThan(before.uptime)
    await expect(client.getStream(id)).resolves.toMatchObject({
      active: true, config: { input: { generate: { mapping: 'root = "v2"' } } },
    })
  }, 30000)

  it("preserves the native Connect error when Streams API publish is rejected", async () => {
    const id = "sac-46-invalid-" + Date.now()
    streamIds.push(id)
    const client = createConnectClient({ baseUrl })
    await expect(client.createStream(id, {
      input: { generate: { interval: "1s", mapping: 'root = "invalid"', count: 0 } },
      output: { definitely_not_a_real_output: {} },
    })).rejects.toSatisfy((error: unknown) =>
      error instanceof ConnectRequestError &&
      error.status === 400 &&
      error.details?.message?.includes("unable to infer output type"),
    )
  }, 30000)
})
