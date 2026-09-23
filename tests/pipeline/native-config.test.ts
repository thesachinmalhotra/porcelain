import { describe, expect, it } from "vitest"
import {
  createConnectConfig,
  discoverConnectSchema,
  echoConnectConfig,
  lintConnectConfig,
  parseNativeConfig,
  serializeNativeConfig,
} from "../../src/runtime/connect/native-config"

const config = {
  input: { generate: { interval: "1s" } },
  pipeline: { threads: 4, processors: [{ mapping: "root = this" }] },
  output: { drop: {} },
  future_field: { preserved: true },
}

describe("native Connect configuration", () => {
  it("asks Connect to generate the initial configuration", async () => {
    let args: string[] = []
    const result = await createConnectConfig("generate/mapping/drop", {
      execute: async (_executable, received) => {
        args = received
        return { stdout: serializeNativeConfig(config), stderr: "", exitCode: 0 }
      },
    })

    expect(args).toEqual(["connect", "create", "generate/mapping/drop"])
    expect(result).toEqual(config)
  })

  it("round-trips native YAML without reducing unknown fields", () => {
    expect(parseNativeConfig(serializeNativeConfig(config))).toEqual(config)
  })

  it("delegates normalization to Connect echo", async () => {
    let received: string[] = []
    const result = await echoConnectConfig(config, {
      execute: async (_executable, args) => {
        received = args
        return { stdout: "input:\n  stdin: {}\noutput:\n  drop: {}\n", stderr: "", exitCode: 0 }
      },
    })

    expect(received).toHaveLength(3)
    expect(received[0]).toBe("connect")
    expect(received[1]).toBe("echo")
    expect(result).toEqual({ input: { stdin: {} }, output: { drop: {} } })
  })

  it("returns Connect's native lint result instead of validating locally", async () => {
    const result = await lintConnectConfig(config, {
      execute: async () => ({ stdout: "", stderr: "unknown field", exitCode: 1 }),
    })

    expect(result).toEqual({ valid: false, stdout: "", stderr: "unknown field" })
  })

  it("retrieves Connect's CUE schema as an opaque Connect-owned surface", async () => {
    const cue = await discoverConnectSchema({
      execute: async (_executable, args) => {
        expect(args).toEqual(["connect", "list", "--format", "cue"])
        return { stdout: "package benthos\n#Config: {...}", stderr: "", exitCode: 0 }
      },
    })

    expect(cue).toContain("package benthos")
  })
})
