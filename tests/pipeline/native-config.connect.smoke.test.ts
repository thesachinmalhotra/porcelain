import { describe, expect, it } from "vitest"
import { createConnectConfig, discoverConnectSchema, echoConnectConfig, lintConnectConfig } from "../../src/runtime/connect/native-config"

describe.runIf(process.env.CI === "true")("native Connect integration", () => {
  it("uses the installed Connect CLI for generation, linting, echoing, and schema discovery", async () => {
    const config = await createConnectConfig()

    expect(config.input).toEqual({ stdin: {} })
    expect(config.output).toEqual({ stdout: {} })

    const lint = await lintConnectConfig(config)
    if (!lint.valid) throw new Error(`Connect lint rejected generated config: ${lint.stderr || lint.stdout}`)

    const normalized = await echoConnectConfig(config)
    expect(normalized.input).toBeDefined()
    expect(normalized.output).toBeDefined()

    const inputConfig = await createConnectConfig("http_server//stdout")
    const processorConfig = await createConnectConfig("stdin/mapping/stdout")
    const outputConfig = await createConnectConfig("stdin//drop")
    expect(inputConfig.input).toHaveProperty("http_server")
    expect(processorConfig.pipeline).toHaveProperty("processors")
    expect(outputConfig.output).toHaveProperty("drop")
    await expect(lintConnectConfig(inputConfig).then((result) => result.valid)).resolves.toBe(true)
    await expect(lintConnectConfig(processorConfig).then((result) => result.valid)).resolves.toBe(true)
    await expect(lintConnectConfig(outputConfig).then((result) => result.valid)).resolves.toBe(true)

    const cue = await discoverConnectSchema()
    expect(cue).toContain("#Config")
    expect(cue).toContain("#Input")
    expect(cue).toContain("#Output")
  }, 120000)
})
