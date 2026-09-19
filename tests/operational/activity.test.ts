import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createActivityStore } from "../../src/operational/activity"

describe("activity store", () => {
  let directory = ""
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })
  it("persists lifecycle events and detects runtime transitions", async () => {
    directory = await mkdtemp(join(tmpdir(), "porcelain-activity-"))
    const store = createActivityStore(join(directory, "activity.json"))
    await store.append({ type: "pipeline.created", pipelineId: "foo", pipelineName: "Foo", detail: "Pipeline created and published" })
    await store.observeRuntime([{ id: "foo", name: "Foo", connected: true, active: true }])
    await store.observeRuntime([{ id: "foo", name: "Foo", connected: true, active: false }])
    const events = await store.list()
    expect(events.map((event) => event.type)).toEqual(["runtime.stopped", "runtime.started", "runtime.connected", "pipeline.created"])
  })
})
