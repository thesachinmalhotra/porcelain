import { describe, expect, it } from "vitest"
import { authoringToConnectConfig, validatePipelineAuthoring } from "../../src/pipeline/authoring"
import { authoringFromDefinition } from "../../src/pipeline/pipeline"

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

describe("pipeline authoring round-trip", () => {
  it("preserves unmodeled Connect fields when an authored component changes", () => {
    const definition = {
      id: "orders",
      name: "Orders",
      metadata: { owner: "porcelain" },
      desiredConfig: {
        input: { generate: { interval: "1s" } },
        buffer: { memory: { limit: 100 } },
        pipeline: {
          label: "orders-pipeline",
          threads: 4,
          processors: [{ label: "normalize", mapping: "root = this" }],
        },
        output: { drop: {} },
      },
      connectStreamId: "orders-runtime",
    }

    const authoring = authoringFromDefinition(definition)
    authoring.input = { generate: { interval: "2s" } }

    expect(authoringToConnectConfig(authoring)).toEqual({
      input: { generate: { interval: "2s" } },
      buffer: { memory: { limit: 100 } },
      pipeline: {
        label: "orders-pipeline",
        threads: 4,
        processors: [{ label: "normalize", mapping: "root = this" }],
      },
      output: { drop: {} },
    })
  })
})
