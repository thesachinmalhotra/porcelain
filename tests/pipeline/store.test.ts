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
  return { store: createPipelineStore(join(dir, "pipelines.json")), path: join(dir, "pipelines.json") }
}

const input = {
  id: "orders",
  name: "Orders",
  metadata: { owner: "porcelain" },
  desiredConfig: {
    input: { generate: { interval: "1s" } },
    pipeline: { processors: [{ bloblang: "root = this" }] },
    output: { drop: {} },
  },
}

describe("pipeline store revisions", () => {
  it("creates revision 1 and points the pipeline at it", async () => {
    const { store } = await createTestStore()

    const pipeline = await store.createWithRevision(input)
    const revision = await store.getRevision(pipeline.desiredRevisionId)

    expect(pipeline).toMatchObject({
      id: "orders",
      name: "Orders",
      metadata: { owner: "porcelain" },
      connectStreamId: "orders",
    })
    expect(revision).toMatchObject({
      pipelineId: "orders",
      version: 1,
      spec: input.desiredConfig,
      checksum: "7082dcfa45c27a713fab874a353908a59db86cf8e2f30f63f50a23c9598eee86",
    })
  })

  it("produces the same checksum for equivalent object key order", async () => {
    const { store } = await createTestStore()
    const first = await store.createWithRevision({
      ...input,
      desiredConfig: {
        output: { drop: {} },
        pipeline: { processors: [{ bloblang: "root = this" }] },
        input: { generate: { interval: "1s" } },
      },
    })
    const firstRevision = await store.getRevision(first.desiredRevisionId)

    const secondStore = await createTestStore()
    const second = await secondStore.store.createWithRevision(input)
    const secondRevision = await secondStore.store.getRevision(second.desiredRevisionId)

    expect(firstRevision?.checksum).toBe(secondRevision?.checksum)
  })

  it("creates immutable revision history with incrementing versions", async () => {
    const { store } = await createTestStore()
    const first = await store.createWithRevision(input)
    const firstRevision = await store.getRevision(first.desiredRevisionId)

    const second = await store.updateWithRevision("orders", {
      name: "Orders v2",
      metadata: { owner: "platform" },
      desiredConfig: { input: { stdin: {} }, output: { drop: {} } },
    })

    const revisions = await store.listRevisions("orders")
    expect(revisions.map(({ version }) => version)).toEqual([1, 2])
    expect(second.desiredRevisionId).toBe(revisions[1].id)
    expect(await store.getRevision(first.desiredRevisionId)).toEqual(firstRevision)
    expect(revisions[1].checksum).not.toBe(revisions[0].checksum)
  })

  it("preserves revision history across store reload", async () => {
    const { store, path } = await createTestStore()
    const created = await store.createWithRevision(input)

    const reloaded = createPipelineStore(path)
    await expect(reloaded.get("orders")).resolves.toEqual(created)
    await expect(reloaded.listRevisions("orders")).resolves.toHaveLength(1)
    await expect(reloaded.getRevision(created.desiredRevisionId)).resolves.toMatchObject({ version: 1 })
  })
})
