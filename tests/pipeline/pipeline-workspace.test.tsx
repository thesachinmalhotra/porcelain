import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const mocks = vi.hoisted(() => ({
  updateAuthoredPipelineServer: vi.fn().mockResolvedValue("orders"),
  invalidate: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: mocks.invalidate }),
}))

vi.mock("../../src/features/pipelines/server", () => ({
  updateAuthoredPipelineServer: mocks.updateAuthoredPipelineServer,
}))

import { PipelineWorkspace } from "../../src/features/pipelines/pipeline-workspace"

const authoring = {
  id: "orders",
  name: "Orders",
  metadata: { owner: "porcelain" },
  input: { generate: { interval: "1s" } },
  processors: [{ label: "normalize", mapping: "root = this" }],
  output: { drop: {} },
  connectConfig: {
    input: { generate: { interval: "1s" } },
    pipeline: { threads: 4, processors: [{ label: "normalize", mapping: "root = this" }] },
    output: { drop: {} },
  },
}

const runtime = {
  connected: true,
  active: true,
  uptimeSeconds: 42,
  uptime: "42s",
  stats: { input: { received: 42 } },
}

function renderWorkspace() {
  return render(
    <PipelineWorkspace
      connectReachable={true}
      connectReady={true}
      pipelines={[
        { id: "orders", name: "Orders", connectStreamId: "orders-runtime", runtime, authoring },
        {
          id: "payments",
          name: "Payments",
          connectStreamId: "payments-runtime",
          runtime: { connected: false, active: false, uptimeSeconds: 0, uptime: "0s", stats: null },
          authoring: {
            id: "payments",
            name: "Payments",
            input: { stdin: {} },
            output: { drop: {} },
            connectConfig: { input: { stdin: {} }, output: { drop: {} } },
          },
        },
      ]}
    />,
  )
}

describe("PipelineWorkspace", () => {
  it("shows pipeline identity and live runtime state", () => {
    renderWorkspace()
    expect(screen.getByRole("heading", { name: "Orders" })).toBeTruthy()
    expect(screen.getByText("Connect ready")).toBeTruthy()
    expect(screen.getAllByText("orders-runtime").length).toBeGreaterThan(0)
    expect(screen.getByText("Active")).toBeTruthy()
    expect(screen.getByText("42s")).toBeTruthy()
    expect(screen.getByText("Payments")).toBeTruthy()
    expect(screen.getByText("Disconnected")).toBeTruthy()
  })

  it("selects a step, edits valid JSON, and can discard the draft", async () => {
    renderWorkspace()

    fireEvent.click(screen.getByRole("button", { name: /Processor 1/ }))
    expect(screen.getByRole("heading", { name: "Processor 1" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Edit configuration" }))
    const editor = screen.getByRole("textbox", { name: "Step configuration" })
    fireEvent.change(editor, { target: { value: '{"label":"normalize-v2","mapping":"root = this"}' } })
    fireEvent.click(screen.getByRole("button", { name: "Apply change" }))

    expect(screen.getByText("This pipeline has unpublished changes")).toBeTruthy()
    expect(screen.getByText(/normalize-v2/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    expect(screen.queryByText("This pipeline has unpublished changes")).toBeNull()
    expect(screen.getByText(/"normalize"/)).toBeTruthy()
  })

  it("surfaces invalid JSON without creating a draft", async () => {
    renderWorkspace()

    fireEvent.click(screen.getByRole("button", { name: /Processor 1/ }))
    fireEvent.click(screen.getByRole("button", { name: "Edit configuration" }))
    const editor = screen.getByRole("textbox", { name: "Step configuration" })
    fireEvent.change(editor, { target: { value: "{" } })
    fireEvent.click(screen.getByRole("button", { name: "Apply change" }))

    expect(screen.getByRole("alert").textContent).toContain("JSON")
    expect(screen.queryByText("This pipeline has unpublished changes")).toBeNull()
  })

  it("publishes the draft and reconciles route data", async () => {
    renderWorkspace()

    fireEvent.click(screen.getByRole("button", { name: /Processor 1/ }))
    fireEvent.click(screen.getByRole("button", { name: "Edit configuration" }))
    const editor = screen.getByRole("textbox", { name: "Step configuration" })
    fireEvent.change(editor, { target: { value: '{"label":"normalize-v2","mapping":"root = this"}' } })
    fireEvent.click(screen.getByRole("button", { name: "Apply change" }))
    fireEvent.click(screen.getByRole("button", { name: "Publish" }))

    await waitFor(() => expect(mocks.updateAuthoredPipelineServer).toHaveBeenCalledWith({
      data: {
        id: "orders",
        authoring: expect.objectContaining({
          processors: [{ label: "normalize-v2", mapping: "root = this" }],
        }),
      },
    }))
    expect(mocks.invalidate).toHaveBeenCalledWith({ sync: true })
    expect(screen.queryByText("This pipeline has unpublished changes")).toBeNull()
  })
})
