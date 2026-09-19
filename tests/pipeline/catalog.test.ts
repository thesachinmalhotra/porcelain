import { describe, expect, it } from "vitest"
import { connectComponents } from "../../src/pipeline/catalog"

describe("Connect component catalog", () => {
  it("has unique component names", () => {
    const names = connectComponents.map((component) => component.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("contains the core authoring roles", () => {
    expect(connectComponents.some((component) => component.name === "redpanda" && component.kinds.includes("input") && component.kinds.includes("output"))).toBe(true)
    expect(connectComponents.some((component) => component.name === "mapping" && component.kinds.includes("processor"))).toBe(true)
    expect(connectComponents.some((component) => component.name === "memory" && component.kinds.includes("buffer"))).toBe(true)
  })

  it("captures documented nested processor metadata", () => {
    const branch = connectComponents.find((component) => component.name === "branch")
    expect(branch?.composesProcessors).toBe(true)
    expect(branch?.fields?.find((field) => field.name === "processors")?.type).toBe("processor[]")
  })

  it("does not invent a deprecated Kafka component as the default Redpanda path", () => {
    expect(connectComponents.some((component) => component.name === "kafka")).toBe(false)
    expect(connectComponents.some((component) => component.name === "kafka_franz")).toBe(false)
  })
})
