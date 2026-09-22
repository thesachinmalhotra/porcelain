import { describe, expect, it } from "vitest"
import { discoverConnectCapabilities } from "../../src/runtime/connect/capabilities"

describe("Connect capability discovery", () => {
  it("discovers the installed Connect component universe through rpk", async () => {
    const result = await discoverConnectCapabilities({
      executable: "rpk",
      execute: async () => ({
        stdout: JSON.stringify({
          inputs: [{ name: "redpanda", status: "stable" }],
          processors: [{ name: "mapping", status: "stable" }],
          outputs: [{ name: "drop", status: "stable" }],
          buffers: [{ name: "memory", status: "stable" }],
        }),
        stderr: "",
      }),
    })

    expect(result.source).toBe("rpk")
    expect(result.components).toEqual([
      { name: "drop", kinds: ["output"], status: "stable" },
      { name: "mapping", kinds: ["processor"], status: "stable" },
      { name: "memory", kinds: ["buffer"], status: "stable" },
      { name: "redpanda", kinds: ["input"], status: "stable" },
    ])
  })

  it("merges repeated component names across roles", async () => {
    const result = await discoverConnectCapabilities({
      execute: async () => ({
        stdout: JSON.stringify({
          inputs: [{ name: "redpanda" }],
          outputs: [{ name: "redpanda" }],
        }),
        stderr: "",
      }),
    })

    expect(result.components).toEqual([
      { name: "redpanda", kinds: ["input", "output"] },
    ])
  })

  it("rejects malformed discovery output", async () => {
    await expect(
      discoverConnectCapabilities({
        execute: async () => ({ stdout: "not json", stderr: "" }),
      }),
    ).rejects.toThrow("invalid JSON")
  })

  it("rejects an empty component universe", async () => {
    await expect(
      discoverConnectCapabilities({
        execute: async () => ({ stdout: JSON.stringify({}), stderr: "" }),
      }),
    ).rejects.toThrow("returned no components")
  })
})
