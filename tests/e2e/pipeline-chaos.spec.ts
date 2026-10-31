import { expect, test } from "@playwright/test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createPipelineStore } from "../../src/pipeline/store.server"
import { createConnectClient } from "../../src/runtime/connect/client"

test.setTimeout(120_000)

const connectUrl = process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195"

async function addLibraryComponent(
  page: import("@playwright/test").Page,
  kind: "input" | "buffer" | "processor" | "output",
  name: string,
) {
  await page.getByPlaceholder("Filter library").fill(name)
  const item = page.locator(".workspace-library-group")
    .filter({ has: page.locator(".workspace-library-group-title", { hasText: kind }) })
    .locator(".workspace-library-item")
    .filter({ hasText: name })
  await expect(item).toHaveCount(1)
  await item.click()
  await expect(page.locator(".react-flow__node").filter({ hasText: name })).toHaveCount(1)
  await page.getByPlaceholder("Filter library").fill("")
}

test("chaos: builds a canvas pipeline, enriches events, routes to multiple destinations and rejects bad drafts", async ({ page }) => {
  const id = "porcelain-chaos-" + Date.now()
  const outputDir = await mkdtemp(join(tmpdir(), "porcelain-chaos-output-"))
  const criticalPath = join(outputDir, "critical.ndjson")
  const standardPath = join(outputDir, "standard.ndjson")
  const auditPath = join(outputDir, "audit.ndjson")
  const store = createPipelineStore()
  const connect = createConnectClient({ baseUrl: connectUrl })
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("dialog", (dialog) => dialog.accept())

  try {
    await expect(connect.ready()).resolves.toBe(true)

    // Start from the product's own create flow, not a pre-seeded lifecycle record.
    await page.goto("/pipelines")
    await page.waitForTimeout(3_000)
    await page.getByPlaceholder("temperature-normalizer").fill(id)
    await expect(page.getByPlaceholder("temperature-normalizer")).toHaveValue(id)
    await page.getByPlaceholder("Temperature normalizer").fill("Chaos workflow " + id)
    await expect(page.getByPlaceholder("Temperature normalizer")).toHaveValue("Chaos workflow " + id)
    await page.getByRole("button", { name: "Create pipeline" }).click()
    await page.waitForURL(new RegExp("/pipelines/" + id + "$"))
    await expect(page.locator(".react-flow__node")).toHaveCount(2)

    // Compose the visible topology using the live Connect component library.
    await addLibraryComponent(page, "input", "http_server")
    await addLibraryComponent(page, "processor", "mapping")
    await addLibraryComponent(page, "processor", "branch")
    await addLibraryComponent(page, "output", "switch")
    await addLibraryComponent(page, "buffer", "memory")
    await expect(page.locator(".react-flow__node")).toHaveCount(5)
    await expect(page.locator(".react-flow__edge")).toHaveCount(4)
    await page.getByRole("button", { name: "Remove buffer" }).first().click()
    await expect(page.locator(".react-flow__node")).toHaveCount(4)
    await expect(page.locator(".react-flow__edge")).toHaveCount(3)
    await expect(page.getByRole("button", { name: "Add buffer", exact: true })).toBeVisible()

    // Assert the authoring state, not merely the visual node count: removing a
    // canvas buffer must remove it from the native Connect source of truth.
    // Removing the buffer selects the input in the inspector, so no canvas
    // click is needed here (the toolbar intentionally overlays the top edge).
    await page.locator(".workspace-view-switch").getByRole("tab", { name: "Source" }).click()
    const canvasSource = await page.getByRole("textbox", { name: "Full native Connect configuration" }).inputValue()
    expect(canvasSource).not.toMatch(/^buffer:/m)
    await page.locator(".workspace-view-switch").getByRole("tab", { name: "Graph" }).click()

    // Arrange the authored nodes on the canvas; the canvas owns a linear processor
    // chain, while the native Connect source below carries branching/fan-out semantics.
    const nodes = page.locator(".react-flow__node")
    const inputNode = nodes.filter({ hasText: "http_server" })
    const inputBox = await inputNode.boundingBox()
    if (!inputBox) throw new Error("HTTP input node is not visible on the canvas")
    await page.mouse.move(inputBox.x + inputBox.width / 2, inputBox.y + inputBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(inputBox.x + inputBox.width / 2 + 90, inputBox.y + inputBox.height / 2 + 70, { steps: 8 })
    await page.mouse.up()
    await expect(inputNode).toBeVisible()

    // Configure the exact native Connect workflow: normalise, branch-enrich,
    // classify, then switch-route to two distinct file destinations plus HTTP reply.
    await nodes.filter({ hasText: "http_server" }).click()
    await page.locator(".workspace-inspector-tabs").getByRole("tab", { name: "Source" }).click()
    const validYaml = [
      "input:",
      "  http_server:",
      "    path: /events",
      "pipeline:",
      "  processors:",
      "    - mapping: |",
      "        root = this",
      "        root.normalized = true",
      "        root.received_at = now()",
      '        root.route = if this.severity == "critical" { "critical" } else { "standard" }',
      "    - branch:",
      "        request_map: |",
      "          root = this.customer",
      "        processors:",
      "          - mapping: |",
      "              root = this",
      '              root.tier = this.tier | "standard"',
      '              root.region = this.region | "unknown"',
      "        result_map: |",
      "          root.customer = this",
      "output:",
      "  switch:",
      "    cases:",
      '      - check: this.severity == "critical"',
      "        output:",
      "          broker:",
      "            pattern: fan_out",
      "            outputs:",
      "              - file:",
      "                  path: " + criticalPath,
      "              - file:",
      "                  path: " + auditPath,
      "              - sync_response: {}",
      '      - check: this.severity != "critical"',
      "        output:",
      "          broker:",
      "            pattern: fan_out",
      "            outputs:",
      "              - file:",
      "                  path: " + standardPath,
      "              - file:",
      "                  path: " + auditPath,
      "              - sync_response: {}",
      "",
    ].join("\n")

    // Prove native validation rejects a malformed Bloblang draft before publish.
    const invalidYaml = validYaml.replace('root.route = if this.severity == "critical" { "critical" } else { "standard" }', "root.route = this.")
    await page.getByRole("textbox", { name: "Raw Connect YAML configuration" }).fill(invalidYaml)
    await page.getByRole("button", { name: "Apply source" }).click()
    await page.getByRole("button", { name: "Validate", exact: true }).click()
    const showInspector = page.locator(".workspace-edge-toggle-right")
    if (await showInspector.isVisible()) await showInspector.click()
    await page.locator(".react-flow__node").filter({ hasText: "http_server" }).getByText("http_server", { exact: true }).click()
    await page.getByRole("tab", { name: "Diagnostics" }).click()
    await expect(page.getByText("Connect rejected the draft", { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled()
    await expect(connect.getStream(id)).resolves.toMatchObject({ active: true })
    await page.getByRole("tab", { name: "Configure" }).click()
    await page.locator(".workspace-inspector-tabs").getByRole("tab", { name: "Source" }).click()

    // Replace with a valid draft, then publish through the real workspace controls.
    await page.getByRole("textbox", { name: "Raw Connect YAML configuration" }).fill(validYaml)
    await page.getByRole("button", { name: "Apply source" }).click()
    await expect(page.getByText("Unpublished changes", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Validate", exact: true }).click()
    const acceptedInspector = page.locator(".workspace-edge-toggle-right")
    if (await acceptedInspector.isVisible()) await acceptedInspector.click()
    await page.locator(".react-flow__node").filter({ hasText: "http_server" }).getByText("http_server", { exact: true }).click()
    await page.getByRole("tab", { name: "Diagnostics" }).click()
    await expect(page.getByText("Connect accepted the draft", { exact: true })).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: "Publish", exact: true }).click()
    await expect(page.getByText("Unpublished changes", { exact: true })).toHaveCount(0, { timeout: 20_000 })

    const stream = await connect.getStream(id)
    expect(stream.active).toBe(true)
    expect(stream.config).toMatchObject({
      input: { http_server: { path: "/events" } },
      pipeline: { processors: [{ mapping: expect.any(String) }, { branch: expect.any(Object) }] },
      output: { switch: expect.any(Object) },
    })
    expect(stream.config).not.toHaveProperty("buffer")

    const criticalEvent = {
      event_id: "evt-critical-1",
      severity: "critical",
      customer: { id: "customer-1" },
      amount: 125,
    }
    const standardEvent = {
      event_id: "evt-standard-1",
      severity: "info",
      customer: { id: "customer-2", tier: "gold", region: "eu-west" },
      amount: 19,
    }

    async function postEvent(event: Record<string, unknown>) {
      const response = await fetch(connectUrl + "/" + encodeURIComponent(id) + "/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      })
      const body = await response.text()
      expect(response.ok, "event processing failed: " + response.status + " " + body).toBe(true)
      if (!body.trim()) {
        const [stream, stats] = await Promise.all([connect.getStream(id), connect.getStreamStats(id)])
        throw new Error("Connect returned an empty synchronous response. Runtime config: " + JSON.stringify(stream.config) + " Runtime stats: " + JSON.stringify(stats))
      }
      return JSON.parse(body) as Record<string, unknown>
    }

    const criticalResponse = await postEvent(criticalEvent)
    expect(criticalResponse).toMatchObject({
      ...criticalEvent,
      normalized: true,
      route: "critical",
      customer: { id: "customer-1", tier: "standard", region: "unknown" },
    })
    expect(typeof criticalResponse.received_at).toBe("string")

    const standardResponse = await postEvent(standardEvent)
    expect(standardResponse).toMatchObject({
      ...standardEvent,
      normalized: true,
      route: "standard",
      customer: { id: "customer-2", tier: "gold", region: "eu-west" },
    })

    async function readRecords(path: string) {
      return readFile(path, "utf8")
        .then((value) => value.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>))
        .catch(() => [] as Record<string, unknown>[])
    }
    await expect.poll(async () => (await readRecords(criticalPath)).length).toBe(1)
    await expect.poll(async () => (await readRecords(standardPath)).length).toBe(1)
    await expect.poll(async () => (await readRecords(auditPath)).length).toBe(2)
    expect((await readRecords(criticalPath))[0]).toMatchObject(criticalResponse)
    expect((await readRecords(standardPath))[0]).toMatchObject(standardResponse)
    expect((await readRecords(auditPath)).map((record) => record.event_id).sort()).toEqual(["evt-critical-1", "evt-standard-1"])

    const stats = await connect.getStreamStats(id)
    const statKeys = Object.keys(stats)
    expect(statKeys.some((key) => key.startsWith("input_received{"))).toBe(true)
    expect(statKeys.some((key) => key.startsWith("processor_received{"))).toBe(true)
    expect(statKeys.some((key) => key.startsWith("output_sent{"))).toBe(true)

    const revisions = await store.listRevisions(id)
    expect(revisions.length).toBeGreaterThanOrEqual(2)
    expect(revisions.at(-1)?.spec).toMatchObject({ output: { switch: expect.any(Object) } })
    expect(pageErrors).toEqual([])
  } finally {
    const pipeline = await store.get(id)
    if (pipeline) {
      const { createPipelineLifecycle } = await import("../../src/pipeline/lifecycle")
      await createPipelineLifecycle({ store, client: connect }).deletePipeline(id)
    } else {
      await connect.deleteStream(id).catch(() => undefined)
    }
    expect(await store.get(id)).toBeNull()
    expect((await connect.listStreams())[id]).toBeUndefined()
    await rm(outputDir, { recursive: true, force: true })
  }
})
