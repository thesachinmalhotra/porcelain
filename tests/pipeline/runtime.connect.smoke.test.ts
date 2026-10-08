import { describe, expect, it } from "vitest"
import { createConnectClient } from "../../src/runtime/connect/client"

const enabled = Boolean(process.env.PORCELAIN_RPK_PATH)
describe.skipIf(!enabled)("Slice H live Connect runtime", () => {
  it("observes native stream lifecycle and component metrics from a real Connect stream", async () => {
    const client = createConnectClient({ baseUrl: process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195" })
    const id = `porcelain-h-${Date.now()}`
    const config = {
      input: { generate: { interval: "100ms", mapping: "root = {}", count: 0 } },
      pipeline: { processors: [{ bloblang: 'root.value = "ok"' }] },
      output: { drop: {} },
    }
    try {
      await client.createStream(id, config)
      await new Promise((resolve) => setTimeout(resolve, 500))
      const stream = await client.getStream(id)
      const stats = await client.getStreamStats(id)
      expect(stream.active).toBe(true)
      const keys = Object.keys(stats)
      expect(keys.some((key) => key.startsWith("input_received{"))).toBe(true)
      expect(keys.some((key) => key.startsWith("processor_received{"))).toBe(true)
      expect(keys.some((key) => key.startsWith("output_sent{"))).toBe(true)
    } finally {
      await client.deleteStream(id)
    }
  })
})
