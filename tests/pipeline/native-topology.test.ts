import { describe, expect, it } from "vitest"
import { buildNativeTopology } from "../../src/features/pipelines/native-topology"
import type { JsonObject } from "../../src/pipeline/authoring"

describe("native Connect topology projection", () => {
  it("projects switch routes and broker destinations into separate visual paths", () => {
    const graph = buildNativeTopology({
      input: { generate: {} },
      pipeline: { processors: [
        { branch: { request_map: "root.request = this", processors: [{ mapping: "root.enriched = true" }] } },
        { switch: { cases: [
          { check: 'this.priority == "critical"', output: { kafka: {} } },
          { output: { broker: { pattern: "fan_out_sequential", outputs: [{ redpanda: {} }, { aws_s3: {} }] } } },
        ] } },
      ] },
      output: { drop: {} },
    } as JsonObject)
    const components = graph.nodes.map(node => node.data.component)
    expect(components).toContain("branch")
    expect(components).toContain("switch")
    expect(components).toContain("mapping")
    expect(components).toContain("kafka")
    expect(components).toContain("broker")
    expect(components).toContain("redpanda")
    expect(components).toContain("aws_s3")
    expect(graph.edges.some(edge => edge.label === 'this.priority == "critical"')).toBe(true)
    expect(graph.nodes.every(node => node.draggable === false && node.connectable === false)).toBe(true)
    const mapping = graph.nodes.find(node => node.data.component === "mapping")
    expect(mapping?.data.path).toBe("pipeline.processors.0.branch.processors.0")
    expect(mapping?.data.config).toEqual({ mapping: "root.enriched = true" })
    const s3 = graph.nodes.find(node => node.data.component === "aws_s3")
    expect(s3?.data.path).toBe("pipeline.processors.1.switch.cases.1.output.broker.outputs.1")
  })

  it("keeps unknown component types visible rather than dropping them", () => {
    const graph = buildNativeTopology({ input: { custom_input: { option: true } }, output: { custom_output: {} } } as JsonObject)
    expect(graph.nodes.map(node => node.data.component)).toEqual(["custom_input", "custom_output"])
  })
})

