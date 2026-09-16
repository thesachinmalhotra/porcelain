import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createAuthoredPipeline, updateAuthoredPipeline } from "../../src/pipeline/authoring-lifecycle"
import { createConnectClient, ConnectRequestError } from "../../src/runtime/connect/client"
import { createPipelineLifecycle } from "../../src/pipeline/lifecycle"
import { createPipelineStore } from "../../src/pipeline/store"

describe("authored pipeline against real Connect", () => {
  it("creates, reads, updates, and deletes an authored stream", async () => {
    const directory = await mkdtemp(join(tmpdir(), "porcelain-authoring-"))
    const store = createPipelineStore(join(directory, "pipelines.json"))
    const client = createConnectClient({
      baseUrl: process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195",
    })
    const lifecycle = createPipelineLifecycle({ store, client })
    const id = `orders-authoring-${Date.now()}`

    try {
      await expect(client.ready()).resolves.toBe(true)

      const created = await createAuthoredPipeline({
        lifecycle,
        authoring: {
          id,
          name: "Orders Authoring",
          input: { generate: { interval: "1s", mapping: "root = {}" } },
          processors: [{ mapping: "root = this" }],
          output: { drop: {} },
        },
      })

      expect(created.connectStreamId).toBe(id)
      const stream = await client.getStream(id)
      expect(stream.config).toMatchObject({
        input: { generate: { interval: "1s", mapping: "root = {}" } },
        pipeline: { processors: [{ mapping: "root = this" }] },
        output: { drop: {} },
      })

      await updateAuthoredPipeline({
        lifecycle,
        id,
        authoring: {
          id,
          name: "Orders Authoring v2",
          input: { generate: { interval: "2s", mapping: "root = {}" } },
          processors: [{ mapping: "root = this" }],
          output: { drop: {} },
        },
      })

      const updatedStream = await client.getStream(id)
      expect(updatedStream.config).toMatchObject({
        input: { generate: { interval: "2s", mapping: "root = {}" } },
      })

      await lifecycle.deletePipeline(id)
      await expect(client.getStream(id)).rejects.toSatisfy(
        (error) => error instanceof ConnectRequestError && error.status === 404,
      )
      await expect(store.get(id)).resolves.toBeNull()
    } finally {
      try {
        await client.deleteStream(id)
      } catch {
        // The stream is expected to be gone after the lifecycle delete.
      }
      await rm(directory, { recursive: true, force: true })
    }
  }, 30_000)
})
