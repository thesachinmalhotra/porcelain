import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PipelineWorkspace } from "../../src/features/pipelines/pipeline-workspace"

describe("PipelineWorkspace", () => {
  it("shows actual pipeline runtime state", () => {
    render(
      <PipelineWorkspace
        connectReady={true}
        pipelines={[
          {
            id: "orders",
            runtime: { active: true, uptimeSeconds: 42, uptime: "42s" },
          },
          {
            id: "payments",
            runtime: { active: false, uptimeSeconds: 0, uptime: "0s" },
          },
        ]}
      />,
    )

    expect(screen.getByRole("heading", { name: "Pipelines" })).toBeTruthy()
    expect(screen.getByText("Connect ready")).toBeTruthy()
    expect(screen.getByText("orders")).toBeTruthy()
    expect(screen.getByText("Active")).toBeTruthy()
    expect(screen.getByText("payments")).toBeTruthy()
    expect(screen.getByText("Inactive")).toBeTruthy()
    expect(screen.getByText("42s uptime")).toBeTruthy()
  })
})
