import { describe, expect, it, vi } from "vitest"
import { publishPipelineDraft, validatePipelineDraft } from "../../src/pipeline/publish"

const authoring = {
  id: "orders",
  name: "Orders",
  input: { stdin: {} },
  output: { drop: {} },
}

describe("pipeline publish", () => {
  it("uses Connect lint before publish and detects an existing stream", async () => {
    const client = {
      getStream: vi.fn().mockResolvedValue({ active: true, uptime: 10, uptime_str: "10s", config: {} }),
      updateStream: vi.fn(),
      createStream: vi.fn(),
      getStreamStats: vi.fn().mockResolvedValue({ input: { received: 1 } }),
    }
    const result = await validatePipelineDraft(authoring, client)
    expect(result.valid).toBe(true)
    expect(result.restartRequired).toBe(true)
  })

  it("publishes to Connect before persisting the revision and projects runtime", async () => {
    const order: string[] = []
    const client = {
      getStream: vi.fn().mockResolvedValue({ active: true, uptime: 2, uptime_str: "2s", config: {} }),
      updateStream: vi.fn().mockImplementation(async () => { order.push("connect") }),
      createStream: vi.fn(),
      getStreamStats: vi.fn().mockResolvedValue({ output: { sent: 2 } }),
    }
    const store = {
      get: vi.fn().mockResolvedValue({ id: "orders", name: "Orders", metadata: {}, desiredRevisionId: "rev", connectStreamId: "orders" }),
      updateWithRevision: vi.fn().mockImplementation(async () => { order.push("store"); return { id: "orders" } }),
    }
    const result = await publishPipelineDraft({ store, client, authoring })
    expect(order).toEqual(["connect", "store"])
    expect(result.restartRequired).toBe(true)
    expect(result.runtime.active).toBe(true)
    expect(result.runtime.stats).toEqual({ output: { sent: 2 } })
  })
})
