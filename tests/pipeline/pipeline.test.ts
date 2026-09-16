import { describe, expect, it } from "vitest"
import {
  disconnectedPipelineRuntime,
  pipelineFromConnectStream,
  pipelineSummaryFromConnectStream,
  pipelineSummaryFromDefinition,
} from "../../src/pipeline/pipeline"

const definition = {
  id: "orders",
  name: "Orders",
  metadata: { owner: "porcelain" },
  desiredConfig: {
    input: { generate: { interval: "1s" } },
    buffer: { none: {} },
    pipeline: { processors: [{ bloblang: "root = this" }] },
    output: { drop: {} },
  },
  connectStreamId: "orders-runtime",
}

describe("pipeline domain", () => {
  it("keeps Porcelain identity and desired config independent from the Connect stream id", () => {
    const stats = { input: { received: 10 }, output: { sent: 9 } }
    const stream = {
      active: true,
      uptime: 12.5,
      uptime_str: "12.5s",
      config: definition.desiredConfig,
    }

    expect(pipelineFromConnectStream(definition, stream, stats)).toEqual({
      ...definition,
      runtime: {
        connected: true,
        active: true,
        uptimeSeconds: 12.5,
        uptime: "12.5s",
        stats,
      },
    })
  })

  it("represents a durable pipeline with no connected runtime", () => {
    expect(pipelineSummaryFromDefinition(definition)).toEqual({
      id: "orders",
      name: "Orders",
      connectStreamId: "orders-runtime",
      runtime: disconnectedPipelineRuntime(),
    })
  })

  it("maps Connect runtime into a durable pipeline summary", () => {
    expect(
      pipelineSummaryFromConnectStream(
        definition,
        { active: true, uptime: 42, uptime_str: "42s" },
        { input: { received: 42 } },
      ),
    ).toEqual({
      id: "orders",
      name: "Orders",
      connectStreamId: "orders-runtime",
      runtime: {
        connected: true,
        active: true,
        uptimeSeconds: 42,
        uptime: "42s",
        stats: { input: { received: 42 } },
      },
    })
  })
})
