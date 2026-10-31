import { expect, test } from "@playwright/test"
import { createPipelineStore } from "../../src/pipeline/store.server"
import { createPipelineLifecycle } from "../../src/pipeline/lifecycle"
import { createConnectClient } from "../../src/runtime/connect/client"

test.setTimeout(90_000)

function config(version: string) {
  return {
    input: { http_server: { path: "/events" } },
    pipeline: {
      processors: [{ mapping: `root.version = "${version}"\nroot.event = this\n` }],
    },
    output: { sync_response: {} },
  }
}

async function sendEvent(connectUrl: string, id: string, event: Record<string, unknown>) {
  const response = await fetch(`${connectUrl}/${encodeURIComponent(id)}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  })
  const body = await response.text()
  expect(response.ok, `Connect event request failed: ${response.status} ${body}`).toBe(true)
  return JSON.parse(body) as unknown
}

test("edits and republishes an existing pipeline without changing its identity", async ({ page }) => {
  const id = "porcelain-edit-e2e-" + Date.now()
  const connectUrl = process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195"
  const connect = createConnectClient({ baseUrl: connectUrl })
  const store = createPipelineStore()
  const lifecycle = createPipelineLifecycle({ store, client: connect })
  const initialConfig = config("v1")
  const event = { event_id: "edit-publish-proof", temperature_c: 21.5 }

  try {
    const created = await lifecycle.createPipeline({
      id,
      name: "Edit lifecycle proof",
      metadata: { source: "playwright-edit-publish" },
      desiredConfig: initialConfig,
    })
    const originalPipelineId = created.id
    const originalStreamId = created.connectStreamId
    const originalRevisionId = created.desiredRevisionId
    expect(originalStreamId).toBe(id)

    await expect.poll(async () => (await connect.getStream(id)).active).toBe(true)
    await expect(sendEvent(connectUrl, id, event)).resolves.toEqual({ version: "v1", event })

    const streamsBefore = await connect.listStreams()
    const initialStream = await connect.getStream(id)
    const initialRevisions = await store.listRevisions(id)
    expect(initialRevisions).toHaveLength(1)
    expect(initialRevisions[0]).toMatchObject({ id: originalRevisionId, version: 1, spec: initialConfig })

    await page.goto(`/pipelines/${id}`)
    await expect(page.getByRole("heading", { name: "Edit lifecycle proof" })).toBeVisible()
    await page.locator(".react-flow__node").filter({ hasText: "http_server" }).click()
    await page.locator(".workspace-inspector-tabs").getByRole("tab", { name: "Source" }).click()

    const updatedYaml = [
      "input:",
      "  http_server:",
      "    path: /events",
      "pipeline:",
      "  processors:",
      "    - mapping: |",
      '        root.version = "v2"',
      "        root.event = this",
      "output:",
      "  sync_response: {}",
      "",
    ].join("\n")

    await page.getByRole("textbox", { name: "Raw Connect YAML configuration" }).fill(updatedYaml)
    await page.getByRole("button", { name: "Apply source" }).click()
    await expect(page.getByText("Draft differs from published configuration")).toBeVisible()
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled()

    // Editing is local draft state: no Connect mutation or persisted revision yet.
    await expect(connect.getStream(id)).resolves.toMatchObject({ config: initialConfig })
    expect(await store.get(id)).toMatchObject({ id: originalPipelineId, desiredRevisionId: originalRevisionId, connectStreamId: originalStreamId })
    expect(await store.listRevisions(id)).toHaveLength(1)

    await page.getByRole("button", { name: "Validate", exact: true }).click()
    await expect(page.getByText("Connect accepted the draft", { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled()

    page.once("dialog", (dialog) => dialog.accept())
    await page.getByRole("button", { name: "Publish", exact: true }).click()
    await expect(page.getByText("Draft differs from published configuration")).toHaveCount(0, { timeout: 20_000 })
    await expect.poll(async () => (await connect.getStream(id)).config).toMatchObject(config("v2"))

    const updated = await store.get(id)
    expect(updated).toMatchObject({ id: originalPipelineId, connectStreamId: originalStreamId })
    expect(updated?.desiredRevisionId).not.toBe(originalRevisionId)
    const revisions = await store.listRevisions(id)
    expect(revisions).toHaveLength(2)
    expect(revisions.map((revision) => revision.version)).toEqual([1, 2])
    expect(revisions[0]).toMatchObject({ id: originalRevisionId, spec: initialConfig })
    expect(revisions[1]).toMatchObject({ id: updated?.desiredRevisionId, version: 2, spec: config("v2") })

    // Connect replaces the stream process on PUT, but retains the same named stream identity.
    const streamsAfter = await connect.listStreams()
    expect(streamsAfter[id]).toBeDefined()
    expect(Object.keys(streamsAfter).filter((streamId) => !Object.prototype.hasOwnProperty.call(streamsBefore, streamId))).toEqual([])
    const updatedStream = await connect.getStream(originalStreamId!)
    expect(updatedStream).toMatchObject({ active: true, config: config("v2") })
    expect(Number.isFinite(updatedStream.uptime)).toBe(true)

    await expect(sendEvent(connectUrl, originalStreamId!, event)).resolves.toEqual({ version: "v2", event })
    expect(await store.get(id)).toMatchObject({ id: originalPipelineId, connectStreamId: originalStreamId, desiredRevisionId: updated?.desiredRevisionId })
  } finally {
    if (await store.get(id)) await lifecycle.deletePipeline(id)
    else {
      const streams = await connect.listStreams().catch(() => ({} as Record<string, never>))
      if (streams[id]) await connect.deleteStream(id)
    }
    expect(await store.get(id)).toBeNull()
    expect((await connect.listStreams())[id]).toBeUndefined()
  }
})

