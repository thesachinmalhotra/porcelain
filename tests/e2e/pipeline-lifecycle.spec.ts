import { expect, test } from "@playwright/test"
import { createPipelineStore } from "../../src/pipeline/store.server"
import { createPipelineLifecycle } from "../../src/pipeline/lifecycle"
import { createConnectClient } from "../../src/runtime/connect/client"

test.setTimeout(60_000)

test("creates, validates, publishes and processes a real Connect event", async ({ page }) => {
  const id = "porcelain-e2e-" + Date.now()
  const store = createPipelineStore()
  const connect = createConnectClient({
    baseUrl: process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195",
  })
  const lifecycle = createPipelineLifecycle({ store, client: connect })
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("dialog", (dialog) => dialog.accept())

  try {
    await page.goto("/pipelines")
    // The app currently hydrates the controlled create form after its SSR shell.
    await page.waitForTimeout(1_200)
    await page.getByRole("textbox", { name: /Pipeline ID/ }).fill(id)
    await page.getByRole("textbox", { name: /Name required/ }).fill("E2E " + id)
    await page.getByRole("button", { name: /Create pipeline/ }).click()
    await page.waitForURL(new RegExp("/pipelines/" + id + "$"), { timeout: 15_000 })

    await expect(page.locator(".react-flow__node")).toHaveCount(2, { timeout: 10_000 })
    await page.locator(".react-flow__node").filter({ hasText: "stdin" }).click()
    await page.locator(".workspace-inspector-tabs").getByRole("tab", { name: "Source" }).click()

    const config = [
      "input:",
      "  http_server:",
      "    path: /events",
      "pipeline:",
      "  processors:",
      "    - mapping: |",
      "        root = this",
      "output:",
      "  sync_response: {}",
      "",
    ].join("\n")
    await page.getByRole("textbox", { name: "Raw Connect YAML configuration" }).fill(config)
    await page.getByRole("button", { name: "Apply source" }).click()
    await expect(page.getByText(/Draft differs from published configuration/)).toBeVisible()

    await page.getByRole("button", { name: "Validate", exact: true }).click()
    await expect(page.getByText("Connect accepted the draft", { exact: true })).toBeVisible({ timeout: 15_000 })

    await page.getByRole("button", { name: "Publish", exact: true }).click()
    await expect(page.getByText(/Draft differs from published configuration/)).toHaveCount(0, { timeout: 15_000 })
    await expect.poll(async () => (await connect.listStreams())[id]?.active).toBe(true)

    const event = { event_id: "lifecycle-proof-1", temperature_c: 21.5 }
    const response = await fetch("http://127.0.0.1:4195/" + encodeURIComponent(id) + "/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    })
    const responseBody = await response.text()
    expect(response.ok, "Connect should synchronously respond to the HTTP input event").toBe(true)
    expect(JSON.parse(responseBody)).toEqual(event)
    expect(pageErrors).toEqual([])
    expect(consoleErrors.filter((message) => message.includes("Hydration failed"))).toEqual([])
  } finally {
    const stored = await store.get(id)
    if (stored) {
      await lifecycle.deletePipeline(id)
    } else {
      const streams = await connect.listStreams()
      if (streams[id]) await connect.deleteStream(id)
    }
    expect(await store.get(id)).toBeNull()
    expect((await connect.listStreams())[id]).toBeUndefined()
  }
})
