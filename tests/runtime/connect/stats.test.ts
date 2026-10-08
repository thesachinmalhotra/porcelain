import { describe, expect, it } from "vitest"
import { connectComponentRuntimeStats, connectPipelineRuntimeSummary } from "../../../src/runtime/connect/stats"

const stats = {
  'input_received{label="",path="root.input",stream="orders"}': 42,
  'input_connection_failed{label="",path="root.input",stream="orders"}': 1,
  'processor_received{label="normalize",path="root.pipeline.processors.0",stream="orders"}': 42,
  'processor_sent{label="normalize",path="root.pipeline.processors.0",stream="orders"}': 41,
  'processor_error{label="normalize",path="root.pipeline.processors.0",stream="orders"}': 1,
  'processor_latency_ns{label="normalize",path="root.pipeline.processors.0",stream="orders"}': { p50: 2500000, p90: 3000000, p99: 4000000 },
  'output_sent{label="",path="root.output",stream="orders"}': 41,
  'output_error{label="",path="root.output",stream="orders"}': 2,
}

describe("Connect runtime stats projection", () => {
  it("reads native flat metric keys by Connect path", () => {
    expect(connectComponentRuntimeStats(stats, "root.pipeline.processors.0", "processor")).toEqual({
      path: "root.pipeline.processors.0",
      received: 42,
      sent: 41,
      errors: 1,
      connectionFailures: 0,
      connectionLosses: 0,
      latencyP50Ms: 2.5,
    })
  })

  it("projects pipeline totals without inventing a throughput metric", () => {
    expect(connectPipelineRuntimeSummary(stats)).toMatchObject({ received: 42, sent: 41, errors: 3 })
    expect(connectPipelineRuntimeSummary(stats).processors).toHaveLength(1)
  })
})
