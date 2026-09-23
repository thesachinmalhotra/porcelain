import { describe, expect, it } from "vitest"
import { createConnectConfig, discoverConnectSchema, echoConnectConfig, lintConnectConfig } from "../../src/runtime/connect/native-config"

describe.runIf(process.env.CI === "true")("native Connect integration", () => {
  it("uses the installed Connect CLI for generation, linting, echoing, and schema discovery", async () => {
    const config = await createConnectConfig("generate//drop")

    expect(config.input).toBeDefined()
    expect(config.output).toBeDefined()

    const lint = await lintConnectConfig(config)
    expect(lint.valid).toBe(true)

    const normalized = await echoConnectConfig(config)
    expect(normalized.input).toBeDefined()
    expect(normalized.output).toBeDefined()

    const cue = await discoverConnectSchema()
    expect(cue).toContain("#Config")
    expect(cue).toContain("#Input")
    expect(cue).toContain("#Output")
  }, 30000)
})
