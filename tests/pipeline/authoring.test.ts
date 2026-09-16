import { describe, expect, it } from "vitest"
import { authoringToConnectConfig, validatePipelineAuthoring } from "../../src/pipeline/authoring"

describe("pipeline authoring", () => {
  it("maps input, buffer, processors, and output to Connect stream config", () => {
    expect(authoringToConnectConfig({
      id: "orders",
      name: "Orders",
      input: { generate: { interval: "1s", mapping: "root = {}" } },
      buffer: { none: {} },
      processors: [{ mapping: "root = this" }],
      output: { drop: {} },
    })).toEqual({
      input: { generate: { interval: "1s", mapping: "root = {}" } },
      buffer: { none: {} },
      pipeline: { processors: [{ mapping: "root = this" }] },
      output: { drop: {} },
    })
  })

  it("omits optional buffer and empty processor pipeline", () => {
    expect(authoringToConnectConfig({
      id: "orders",
      name: "Orders",
      input: { generate: { interval: "1s", mapping: "root = {}" } },
      output: { drop: {} },
    })).toEqual({
      input: { generate: { interval: "1s", mapping: "root = {}" } },
      output: { drop: {} },
    })
  })

  it("rejects missing required structure", () => {
    expect(() => validatePipelineAuthoring({
      id: "",
      name: "Orders",
      input: {},
      output: { drop: {} },
    })).toThrow("Pipeline id must be a non-empty string")
  })

  it("rejects non-object component values", () => {
    expect(() => validatePipelineAuthoring({
      id: "orders",
      name: "Orders",
      input: "generate" as unknown as Record<string, unknown>,
      output: { drop: {} },
    })).toThrow("Pipeline input must be an object")
  })
})
