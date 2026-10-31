import { describe, expect, it, vi } from "vitest"
import { comparePipelineConfigurations, publishPipelineDraft, validatePipelineDraft } from "../../src/pipeline/publish.server"

const mocks = vi.hoisted(() => ({
  lintConnectConfig: vi.fn().mockResolvedValue({ valid: true, stdout: "", stderr: "" }),
}))

vi.mock("../../src/runtime/connect/native-config.server", () => ({
  lintConnectConfig: mocks.lintConnectConfig,
}))

const authoring = {
  id: "orders",
  name: "Orders",
  input: { stdin: {} },
  output: { drop: {} },
}

describe("pipeline configuration comparison", () => {
  it("ignores object key order and preserves array order", () => {
    expect(comparePipelineConfigurations({ a: 1, nested: { b: 2, c: 3 } }, { nested: { c: 3, b: 2 }, a: 1 }).status).toBe("in_sync")
    expect(comparePipelineConfigurations({ items: [1, 2] }, { items: [2, 1] }).status).toBe("drifted")
    expect(comparePipelineConfigurations({ input: {} }, { input: {}, extra: true }).status).toBe("drifted")
  })
})
describe("pipeline publish", () => {
  it("uses Connect lint before publish and detects an existing stream", async () => {
    const client = {
      getStream: vi.fn().mockResolvedValue({ active: true, uptime: 10, uptime_str: "10s", config: {} }),
      getStreamStats: vi.fn(),
    }
    const result = await validatePipelineDraft(authoring, client)
    expect(result.valid).toBe(true)
    expect(result.restartRequired).toBe(true)
    expect(result.output).toBe("Redpanda Connect accepted the configuration.")
  })

  it("delegates runtime mutation to the lifecycle and projects runtime", async () => {
    const lifecycle = {
      publishPipeline: vi.fn().mockResolvedValue({
        pipeline: { id: "orders" },
        connectStreamId: "orders",
        operation: "updated" as const,
      }),
    }
    const client = {
      getStream: vi.fn().mockResolvedValue({ active: true, uptime: 2, uptime_str: "2s", config: {} }),
      getStreamStats: vi.fn().mockResolvedValue({ output: { sent: 2 } }),
    }

    const result = await publishPipelineDraft({ lifecycle, client, authoring })

    expect(lifecycle.publishPipeline).toHaveBeenCalledWith("orders", {
      name: "Orders",
      metadata: {},
      desiredConfig: { input: { stdin: {} }, output: { drop: {} } },
    })
    expect(result.restartRequired).toBe(true)
    expect(result.runtime.active).toBe(true)
    expect(result.runtime.stats).toEqual({ output: { sent: 2 } })
    expect(result.configuration.status).toBe("drifted")
  })

  it("does not fail a successful publish when stats are temporarily unavailable", async () => {
    const lifecycle = {
      publishPipeline: vi.fn().mockResolvedValue({
        pipeline: { id: "orders" },
        connectStreamId: "orders",
        operation: "created" as const,
      }),
    }
    const client = {
      getStream: vi.fn().mockResolvedValue({ active: true, uptime: 1, uptime_str: "1s", config: {} }),
      getStreamStats: vi.fn().mockRejectedValue(new Error("stats unavailable")),
    }

    await expect(publishPipelineDraft({ lifecycle, client, authoring })).resolves.toMatchObject({
      restartRequired: false,
      runtime: { connected: true, active: true, stats: null },
      configuration: { status: "drifted" },
    })
  })
})
