import { describe, expect, it } from "vitest"
import {
  addPipelineProcessor,
  authoringToConnectConfig,
  movePipelineProcessor,
  removePipelineProcessor,
  setPipelineAuthoringBuffer,
  setPipelineAuthoringName,
  updatePipelineAuthoring,
  type PipelineAuthoring,
} from "../../src/pipeline/authoring"

const base: PipelineAuthoring = {
  id: "orders",
  name: "Orders",
  metadata: { owner: "porcelain" },
  input: { generate: { interval: "1s" } },
  buffer: { memory: { limit: 100 } },
  processors: [
    { mapping: "root = this", label: "normalize" },
    { mapping: "root.foo = this.foo" },
  ],
  output: { drop: {} },
  connectConfig: {
    pipeline: { threads: 4, processors: [{ mapping: "old" }] },
    custom_field: { preserved: true },
  },
}

describe("pipeline authoring mutations", () => {
  it("updates a component without mutating the original", () => {
    const next = updatePipelineAuthoring(base, { kind: "processor", index: 0 }, { mapping: "root = this.foo" })

    expect(next.processors).toEqual([
      { mapping: "root = this.foo" },
      { mapping: "root.foo = this.foo" },
    ])
    expect(base.processors?.[0]).toEqual({ mapping: "root = this", label: "normalize" })
    expect(next.connectConfig).toEqual(base.connectConfig)
  })

  it("adds and removes processors while preserving order", () => {
    const added = addPipelineProcessor(base, { mapping: "root.bar = this.bar" }, 1)
    expect(added.processors).toEqual([
      base.processors![0],
      { mapping: "root.bar = this.bar" },
      base.processors![1],
    ])

    const removed = removePipelineProcessor(added, 1)
    expect(removed.processors).toEqual(base.processors)
  })

  it("moves processors without sharing mutable state", () => {
    const next = movePipelineProcessor(base, 0, 1)

    expect(next.processors).toEqual([base.processors![1], base.processors![0]])
    expect(next.processors).not.toBe(base.processors)
  })

  it("supports optional buffer creation and removal", () => {
    const withoutBuffer = setPipelineAuthoringBuffer(base, undefined)
    expect(withoutBuffer.buffer).toBeUndefined()

    const restored = setPipelineAuthoringBuffer(withoutBuffer, { memory: { limit: 50 } })
    expect(restored.buffer).toEqual({ memory: { limit: 50 } })
  })

  it("updates pipeline metadata without changing runtime configuration", () => {
    const renamed = setPipelineAuthoringName(base, "Orders v2")
    expect(renamed.name).toBe("Orders v2")
    expect(renamed.connectConfig).toEqual(base.connectConfig)
  })

  it("preserves unknown Connect fields when converting after mutations", () => {
    const next = updatePipelineAuthoring(base, { kind: "processor", index: 0 }, { mapping: "root = this.temperature" })
    const config = authoringToConnectConfig(next)

    expect(config.custom_field).toEqual({ preserved: true })
    expect(config.pipeline).toEqual({
      threads: 4,
      processors: [
        { mapping: "root = this.temperature" },
        { mapping: "root.foo = this.foo" },
      ],
    })
  })

  it("rejects invalid processor indexes", () => {
    expect(() => removePipelineProcessor(base, 4)).toThrow("Processor index is out of range")
    expect(() => movePipelineProcessor(base, 0, 4)).toThrow("Processor index is out of range")
    expect(() => updatePipelineAuthoring(base, { kind: "processor", index: -1 }, {})).toThrow(
      "Processor index is out of range",
    )
  })
})
