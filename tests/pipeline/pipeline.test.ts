import { describe, expect, it } from "vitest"
import { pipelineFromConnectStream, pipelineSummaryFromConnectStream } from "../../src/pipeline/pipeline"

describe("pipelineFromConnectStream", () => {
  it("represents a Connect stream as a Porcelain pipeline without changing its config", () => {
    const stream = {
      active: true,
      uptime: 12.5,
      uptime_str: "12.5s",
      config: {
        input: { generate: { interval: "1s", mapping: "root = this" } },
        buffer: { none: {} },
        pipeline: { processors: [{ bloblang: "root = this" }] },
        output: { drop: {} },
      },
    }

    expect(pipelineFromConnectStream("orders", stream)).toEqual({
      id: "orders",
      config: stream.config,
      runtime: {
        active: true,
        uptimeSeconds: 12.5,
        uptime: "12.5s",
      },
    })
  })
})

describe("pipeline summaries", () => {
  it("maps Connect stream summaries into runtime-aware Porcelain pipeline summaries", () => {
    expect(
      pipelineSummaryFromConnectStream("orders", {
        active: true,
        uptime: 42,
        uptime_str: "42s",
      }),
    ).toEqual({
      id: "orders",
      runtime: {
        active: true,
        uptimeSeconds: 42,
        uptime: "42s",
      },
    })
  })
})
