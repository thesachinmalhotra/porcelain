import { describe, expect, it } from "vitest"
import { discoverConnectCapabilities } from "../../src/runtime/connect/capabilities"

describe("Connect capability discovery", () => {
  it("discovers the installed Connect component universe through rpk", async () => {
    let invokedWith: string[] = []
    const result = await discoverConnectCapabilities({
      executable: "rpk",
      execute: async (_executable, args) => {
        invokedWith = args
        return {
        stdout: JSON.stringify({
          inputs: [{ name: "redpanda", status: "stable" }],
          processors: [{ name: "mapping", status: "stable" }],
          outputs: [{ name: "drop", status: "stable" }],
          buffers: [{ name: "memory", status: "stable" }],
        }),
        stderr: "",
        }
      },
    })

    expect(result.source).toBe("rpk")
    expect(invokedWith).toEqual(["connect", "list", "--format", "json"])
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

  it("merges roles and preserves the Connect-native inventory contract", async () => {
    const result = await discoverConnectCapabilities({
      executable: "rpk",
      execute: async () => ({
        stdout: JSON.stringify({
          inputs: [{ name: "redpanda", status: "stable" }],
          outputs: [{ name: "redpanda", status: "stable" }],
          processors: [{ name: "mapping", status: "beta" }],
        }),
        stderr: "",
      }),
    })

    expect(result.inventoryFormat).toBe("json")
    expect(result.schemaFormat).toBe("cue")
    expect(result.components).toEqual([
      { name: "mapping", kinds: ["processor"], status: "beta" },
      { name: "redpanda", kinds: ["input", "output"], status: "stable" },
    ])
  })

  it("normalizes singular and plural role keys", async () => {
    const result = await discoverConnectCapabilities({
      execute: async () => ({
        stdout: JSON.stringify({
          input: [{ name: "generate" }],
          output: [{ name: "drop" }],
          rate_limits: [{ name: "local" }],
        }),
        stderr: "",
      }),
    })

    expect(result.components).toEqual([
      { name: "drop", kinds: ["output"] },
      { name: "generate", kinds: ["input"] },
      { name: "local", kinds: ["rate_limit"] },
    ])
  })
})
