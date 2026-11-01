import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createAgentDraftStore } from "../../../src/runtime/connect/agent-draft-store.server"

const directories: string[] = []
async function temporaryStore() {
  const directory = await mkdtemp(join(tmpdir(), "porcelain-agent-drafts-"))
  directories.push(directory)
  return { directory, store: createAgentDraftStore(join(directory, "drafts.json")) }
}
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))) })

describe("agent pipeline draft store", () => {
  it("creates an isolated draft from a native pipeline config", async () => {
    const { store } = await temporaryStore()
    const config = { input: { stdin: {} }, pipeline: { processors: [{ mapping: "root = this" }] }, output: { drop: {} } }
    const draft = await store.create({ pipelineId: "events", pipelineName: "Events", config, basedOnRevision: "revision-1", basedOnChecksum: "checksum-1" })
    expect(draft.version).toBe(1)
    expect(draft.config).toEqual(config)
    expect(await store.get("events")).toEqual(draft)
  })

  it("increments versions, clears stale validation and persists the full native config", async () => {
    const { directory, store } = await temporaryStore()
    await store.create({ pipelineId: "events", pipelineName: "Events", config: { input: { stdin: {} }, output: { drop: {} } }, basedOnRevision: "r1", basedOnChecksum: "c1" })
    await store.recordValidation("events", true, "valid")
    const nextConfig = { input: { http_server: { address: "0.0.0.0:8080" } }, pipeline: { processors: [{ branch: { request_map: "root = this", processors: [{ mapping: "root = this" }] } }] }, output: { drop: {} } }
    const updated = await store.update("events", nextConfig)
    expect(updated.version).toBe(2)
    expect(updated.config).toEqual(nextConfig)
    expect(updated.validation).toBeUndefined()
    const persisted = JSON.parse(await readFile(join(directory, "drafts.json"), "utf8"))
    expect(persisted.drafts[0].config).toEqual(nextConfig)
  })

  it("serialises concurrent edits instead of losing draft versions", async () => {
    const { store } = await temporaryStore()
    await store.create({ pipelineId: "events", pipelineName: "Events", config: { input: { stdin: {} }, output: { drop: {} } }, basedOnRevision: "r1", basedOnChecksum: "c1" })
    await Promise.all(Array.from({ length: 8 }, (_, index) => store.update("events", {
      input: { stdin: {} },
      pipeline: { processors: [{ mapping: `root.sequence = ${index}` }] },
      output: { drop: {} },
    })))
    expect((await store.get("events"))?.version).toBe(9)
  })

  it("rejects malformed stream configs and updates without an existing draft", async () => {
    const { store } = await temporaryStore()
    await expect(store.update("missing", { input: { stdin: {} }, output: { drop: {} } })).rejects.toThrow("create one first")
    await store.create({ pipelineId: "events", pipelineName: "Events", config: { input: { stdin: {} }, output: { drop: {} } }, basedOnRevision: "r1", basedOnChecksum: "c1" })
    await expect(store.update("events", { input: { stdin: {} } })).rejects.toThrow("input and output")
  })
})
