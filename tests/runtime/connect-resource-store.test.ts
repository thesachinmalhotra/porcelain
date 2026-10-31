import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createConnectResourceStore } from "../../src/runtime/connect/resource-store.server"

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })
async function fixture() { const dir = await mkdtemp(join(tmpdir(), "porcelain-resources-")); dirs.push(dir); const path = join(dir, "resources.json"); return { path, store: createConnectResourceStore(path) } }
const input = { type: "cache" as const, component: "memory", name: "customer-cache", config: { memory: { default_ttl: "5m" } } }

describe("Connect resource desired state", () => {
  it("persists drafts and reloads them", async () => {
    const { path, store } = await fixture()
    const saved = await store.save(input)
    expect(saved).toMatchObject({ name: input.name, type: "cache", publishedChecksum: null })
    await expect(createConnectResourceStore(path).list()).resolves.toEqual([saved])
  })
  it("keeps published state separate from changed desired configuration", async () => {
    const { store } = await fixture()
    const first = await store.save(input)
    const published = await store.markPublished(first.id)
    const changed = await store.save({ ...input, id: first.id, config: { memory: { default_ttl: "10m" } } })
    expect(changed.publishedChecksum).toBe(published.checksum)
    expect(changed.checksum).not.toBe(changed.publishedChecksum)
  })
  it("uses stable checksums independent of object key order", async () => {
    const { store } = await fixture()
    const first = await store.save({ ...input, config: { memory: { a: 1, b: 2 } } })
    const second = await store.save({ ...input, id: first.id, config: { memory: { b: 2, a: 1 } } })
    expect(second.checksum).toBe(first.checksum)
  })
  it("rejects duplicate resource identities and malformed component roots", async () => {
    const { store } = await fixture()
    await store.save(input)
    await expect(store.save(input)).rejects.toThrow("already exists")
    await expect(store.save({ ...input, name: "bad", config: { redis: {} } })).rejects.toThrow("selected component")
  })
  it("records publish failures without marking the resource published", async () => {
    const { path, store } = await fixture()
    const saved = await store.save(input)
    await store.markPublishFailed(saved.id, "runtime unavailable")
    const persisted = await createConnectResourceStore(path).get(saved.id)
    expect(persisted).toMatchObject({ publishedChecksum: null, lastPublishError: "runtime unavailable" })
  })
})

