import { describe, expect, it } from "vitest"
import { addPipelineProcessor, authoringToConnectConfig, replacePipelineAuthoringConfig, updatePipelineAuthoring, validatePipelineAuthoring } from "../../src/pipeline/authoring"
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
  it("replaces the whole native Connect config without dropping unknown fields", () => {
    const authoring = {
      id: "orders",
      name: "Orders",
      input: { stdin: {} },
      output: { drop: {} },
    }
    const next = replacePipelineAuthoringConfig(authoring, {
      input: { http_server: { path: "/events" } },
      pipeline: { threads: 4, processors: [{ mapping: "root = this" }], future: { keep: true } },
      output: { drop: {} },
      observability: { metrics: { type: "prometheus" } },
    })

    expect(next.input).toEqual({ http_server: { path: "/events" } })
    expect(next.processors).toEqual([{ mapping: "root = this" }])
    expect(next.connectConfig).toEqual({
      input: { http_server: { path: "/events" } },
      pipeline: { threads: 4, processors: [{ mapping: "root = this" }], future: { keep: true } },
      output: { drop: {} },
      observability: { metrics: { type: "prometheus" } },
    })
  })

  it("preserves unmodeled Connect fields from the immutable revision spec", () => {
    const definition = {
      id: "orders",
      name: "Orders",
      metadata: { owner: "porcelain" },
      desiredRevisionId: "revision-1",
      connectStreamId: "orders-runtime",
    }
    const revision = {
      id: "revision-1",
      pipelineId: "orders",
      version: 1,
      spec: {
        input: { generate: { interval: "1s" } },
        buffer: { memory: { limit: 100 } },
        pipeline: {
          label: "orders-pipeline",
          threads: 4,
          processors: [{ label: "normalize", mapping: "root = this" }],
        },
        output: { drop: {} },
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      checksum: "checksum",
    }

    const authoring = authoringFromDefinition(definition, revision)
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

  it("treats the native Connect config as the mutation source of truth", () => {
    const authoring = authoringFromDefinition(
      {
        id: "orders",
        name: "Orders",
        metadata: {},
        desiredRevisionId: "revision-1",
        connectStreamId: "orders",
      },
      {
        id: "revision-1",
        pipelineId: "orders",
        version: 1,
        spec: {
          input: { stdin: {} },
          pipeline: { threads: 4, future: { preserve: true }, processors: [{ mapping: "root = this" }] },
          output: { drop: {} },
          observability: { metrics: { type: "prometheus" } },
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        checksum: "checksum",
      },
    )

    const updated = updatePipelineAuthoring(authoring, { kind: "input" }, { http_server: { path: "/events" } })
    const withProcessor = addPipelineProcessor(updated, { mapping: "root = this.uppercase()" })

    expect(authoringToConnectConfig(withProcessor)).toEqual({
      input: { http_server: { path: "/events" } },
      pipeline: {
        threads: 4,
        future: { preserve: true },
        processors: [
          { mapping: "root = this" },
          { mapping: "root = this.uppercase()" },
        ],
      },
      output: { drop: {} },
      observability: { metrics: { type: "prometheus" } },
    })
  })
})
