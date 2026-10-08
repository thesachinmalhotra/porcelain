import { describe, expect, it } from "vitest"
import {
  addPipelineProcessor,
  authoringToConnectConfig,
  connectPipelineAuthoring,
  disconnectPipelineAuthoring,
  projectConnectConfig,
  replacePipelineAuthoringConfig,
  updatePipelineAuthoring,
  validatePipelineAuthoring,
  validatePipelineConnection,
} from "../../src/pipeline/authoring"
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

describe("native Connect projection", () => {
  it("projects the native stream boundary without dropping nested processor config", () => {
    const projection = projectConnectConfig({
      input: { http_server: { path: "/events" } },
      pipeline: {
        threads: 4,
        processors: [
          {
            workflow: {
              branches: {
                enrich: {
                  processors: [{ mapping: "root = this" }],
                },
              },
            },
          },
        ],
      },
      output: { drop: {} },
    })

    expect(projection.input).toEqual({ http_server: { path: "/events" } })
    expect(projection.processors?.[0]).toEqual({
      workflow: {
        branches: {
          enrich: {
            processors: [{ mapping: "root = this" }],
          },
        },
      },
    })
    expect(projection.output).toEqual({ drop: {} })
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
    const updated = updatePipelineAuthoring(authoring, { kind: "input" }, { generate: { interval: "2s" } })

    expect(authoringToConnectConfig(updated)).toEqual({
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


describe("native topology transformations", () => {
  const base = {
    id: "orders",
    name: "Orders",
    input: { stdin: {} },
    output: { drop: {} },
  }

  it.each([0, 1, 2, 10])("projects %i processors in native Connect order", (count) => {
    const processors = Array.from({ length: count }, (_, index) => ({ mapping: "processor-" + index }))
    const authoring = { ...base, ...(count > 0 ? { processors } : {}) }
    const config = authoringToConnectConfig(authoring)
    expect(config.input).toEqual(base.input)
    expect(config.output).toEqual(base.output)
    expect(config.pipeline).toEqual(count > 0 ? { processors } : undefined)
    expect(projectConnectConfig(config).processors).toEqual(count > 0 ? processors : undefined)
  })

  it("preserves buffer and processor ordering through native config", () => {
    const authoring = {
      ...base,
      buffer: { memory: { limit: 100 } },
      processors: [{ mapping: "one" }, { mapping: "two" }, { mapping: "three" }],
    }
    expect(authoringToConnectConfig(authoring)).toEqual({
      input: base.input,
      buffer: authoring.buffer,
      pipeline: { processors: authoring.processors },
      output: base.output,
    })
  })

  it("round-trips native topology without inventing identity", () => {
    const authoring = {
      ...base,
      buffer: { memory: {} },
      processors: [{ label: "first", mapping: "one" }, { label: "second", mapping: "two" }],
    }
    const config = authoringToConnectConfig(authoring)
    const projection = projectConnectConfig(config)
    expect(projection).toEqual({
      input: authoring.input,
      buffer: authoring.buffer,
      processors: authoring.processors,
      output: authoring.output,
    })
  })

  it("defines the valid connection matrix", () => {
    const withProcessors = { ...base, processors: [{ mapping: "one" }, { mapping: "two" }] }
    const withBuffer = { ...withProcessors, buffer: { memory: {} } }
    const cases = [
      [withBuffer, { source: { kind: "input" }, target: { kind: "buffer" } }, true],
      [withBuffer, { source: { kind: "buffer" }, target: { kind: "processor", index: 0 } }, true],
      [withProcessors, { source: { kind: "input" }, target: { kind: "processor", index: 1 } }, true],
      [withProcessors, { source: { kind: "processor", index: 0 }, target: { kind: "processor", index: 1 } }, true],
      [withProcessors, { source: { kind: "processor", index: 0 }, target: { kind: "output" } }, true],
      [{ ...base, buffer: { memory: {} } }, { source: { kind: "buffer" }, target: { kind: "output" } }, true],
      [base, { source: { kind: "input" }, target: { kind: "output" } }, true],
      [withBuffer, { source: { kind: "input" }, target: { kind: "processor", index: 0 } }, false],
      [withProcessors, { source: { kind: "buffer" }, target: { kind: "output" } }, false],
      [withProcessors, { source: { kind: "output" }, target: { kind: "processor", index: 0 } }, false],
    ] as const

    for (const [authoring, connection, valid] of cases) {
      expect(validatePipelineConnection(authoring, connection).valid).toBe(valid)
    }
  })

  it("makes disconnected edges explicit instead of persisting a second graph model", () => {
    expect(() => disconnectPipelineAuthoring(base, {
      source: { kind: "input" },
      target: { kind: "output" },
    })).toThrow(/do not persist disconnected edges/)
  })
})

describe("spatial connection authoring", () => {
  const base = {
    id: "orders",
    name: "Orders",
    input: { stdin: {} },
    processors: [{ mapping: "one" }, { mapping: "two" }, { mapping: "three" }],
    output: { drop: {} },
    connectConfig: {
      input: { stdin: {} },
      pipeline: { processors: [{ mapping: "one" }, { mapping: "two" }, { mapping: "three" }] },
      output: { drop: {} },
    },
  }

  it("moves a processor when connected to another processor", () => {
    const next = connectPipelineAuthoring(base, {
      source: { kind: "processor", index: 2 },
      target: { kind: "processor", index: 0 },
    })
    expect(next.processors).toEqual([{ mapping: "three" }, { mapping: "one" }, { mapping: "two" }])
  })

  it("moves a processor to the start from the input", () => {
    const next = connectPipelineAuthoring(base, {
      source: { kind: "input" },
      target: { kind: "processor", index: 2 },
    })
    expect(next.processors).toEqual([{ mapping: "three" }, { mapping: "one" }, { mapping: "two" }])
  })

  it("moves a processor to the end from the output", () => {
    const next = connectPipelineAuthoring(base, {
      source: { kind: "processor", index: 0 },
      target: { kind: "output" },
    })
    expect(next.processors).toEqual([{ mapping: "two" }, { mapping: "three" }, { mapping: "one" }])
  })

  it("rejects a connection that would bypass a configured buffer", () => {
    expect(() => connectPipelineAuthoring({ ...base, buffer: { memory: {} } }, {
      source: { kind: "input" },
      target: { kind: "processor", index: 0 },
    })).toThrow(/buffer sits between/)
  })
})
