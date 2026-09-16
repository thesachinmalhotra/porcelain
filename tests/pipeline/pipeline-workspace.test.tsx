import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PipelineWorkspace } from "../../src/features/pipelines/pipeline-workspace"

const runtime = {
  connected: true,
  active: true,
  uptimeSeconds: 42,
  uptime: "42s",
  stats: { input: { received: 42 } },
}

describe("PipelineWorkspace", () => {
  it("shows Porcelain pipeline identity and live runtime state", () => {
    render(
      <PipelineWorkspace
        connectReady={true}
        pipelines={[
          { id: "orders", name: "Orders", connectStreamId: "orders-runtime", runtime },
          {
            id: "payments",
            name: "Payments",
            connectStreamId: "payments-runtime",
            runtime: {
              connected: false,
              active: false,
              uptimeSeconds: 0,
              uptime: "0s",
              stats: null,
            },
          },
        ]}
      />,
    )

    expect(screen.getByRole("heading", { name: "Pipelines" })).toBeTruthy()
    expect(screen.getByText("Connect ready")).toBeTruthy()
    expect(screen.getByText("Orders")).toBeTruthy()
    expect(screen.getByText("orders")).toBeTruthy()
    expect(screen.getByText("Active")).toBeTruthy()
    expect(screen.getByText("42s uptime")).toBeTruthy()
    expect(screen.getByText("Payments")).toBeTruthy()
    expect(screen.getByText("Disconnected")).toBeTruthy()
  })
})
