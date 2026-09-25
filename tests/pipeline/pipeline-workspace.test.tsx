import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const mocks = vi.hoisted(() => ({
  validateAuthoredPipelineServer: vi.fn().mockResolvedValue({ valid: true, lintErrors: [], output: "ok", restartRequired: false }),
  publishAuthoredPipelineServer: vi.fn().mockResolvedValue({ pipeline: { id: "orders" }, restartRequired: false, runtime: { connected: true, active: true, uptime: 42, uptimeStr: "42s", stats: {} } }),
  updateAuthoredPipelineServer: vi.fn().mockResolvedValue("orders"),
  createAuthoredPipelineServer: vi.fn().mockResolvedValue("new-pipeline"),
  deletePipeline: vi.fn().mockResolvedValue(undefined),
  invalidate: vi.fn().mockResolvedValue(undefined),
  navigate: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: mocks.invalidate, navigate: mocks.navigate }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

vi.mock("../../src/features/pipelines/server", () => ({
  validateAuthoredPipelineServer: mocks.validateAuthoredPipelineServer,
  publishAuthoredPipelineServer: mocks.publishAuthoredPipelineServer,
  updateAuthoredPipelineServer: mocks.updateAuthoredPipelineServer,
  createAuthoredPipelineServer: mocks.createAuthoredPipelineServer,
  deletePipeline: mocks.deletePipeline,
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
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0)
    expect(screen.getAllByText("42s").length).toBeGreaterThan(0)
    expect(screen.getByText("Payments")).toBeTruthy()
  })

  it("selects a step, edits valid JSON, and can discard the draft", async () => {
    renderWorkspace()

    fireEvent.click(screen.getByRole("button", { name: "Processor 1" }))
    expect(screen.getByRole("heading", { name: "Processor 1" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Edit as JSON" }))
    const editor = screen.getByRole("textbox", { name: "Step configuration" })
    fireEvent.change(editor, { target: { value: '{"label":"normalize-v2","mapping":"root = this"}' } })
    fireEvent.click(screen.getByRole("button", { name: "Apply change" }))

    expect(screen.getByText("Unpublished changes")).toBeTruthy()
    expect(screen.getByText(/normalize-v2/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    expect(screen.queryByText("Unpublished changes")).toBeNull()
    expect(screen.getByText(/"normalize"/)).toBeTruthy()
  })

  it("surfaces invalid JSON without creating a draft", async () => {
    renderWorkspace()

    fireEvent.click(screen.getByRole("button", { name: "Processor 1" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit as JSON" }))
    const editor = screen.getByRole("textbox", { name: "Step configuration" })
    fireEvent.change(editor, { target: { value: "{" } })
    fireEvent.click(screen.getByRole("button", { name: "Apply change" }))

    expect(screen.getByRole("alert").textContent).toContain("JSON")
    expect(screen.queryByText("Unpublished changes")).toBeNull()
  })

  it("publishes the draft and reconciles route data", async () => {
    renderWorkspace()

    fireEvent.click(screen.getByRole("button", { name: "Processor 1" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit as JSON" }))
    const editor = screen.getByRole("textbox", { name: "Step configuration" })
    fireEvent.change(editor, { target: { value: '{"label":"normalize-v2","mapping":"root = this"}' } })
    fireEvent.click(screen.getByRole("button", { name: "Apply change" }))
    fireEvent.click(screen.getByRole("button", { name: "Validate" }))
    await waitFor(() => expect(mocks.validateAuthoredPipelineServer).toHaveBeenCalledWith({
      data: { id: "orders", authoring: expect.objectContaining({ id: "orders" }) },
    }))
    fireEvent.click(screen.getByRole("button", { name: "Publish" }))

    await waitFor(() => expect(mocks.publishAuthoredPipelineServer).toHaveBeenCalledWith({
      data: {
        id: "orders",
        authoring: expect.objectContaining({
          processors: [{ label: "normalize-v2", mapping: "root = this" }],
        }),
      },
    }))
    expect(mocks.invalidate).toHaveBeenCalledWith({ sync: true })
    expect(screen.queryByText("Unpublished changes")).toBeNull()
  })
  it("creates a pipeline from the workspace and navigates to it", async () => {
    renderWorkspace()

    fireEvent.click(screen.getByRole("button", { name: "New pipeline" }))
    fireEvent.change(screen.getByLabelText("Pipeline ID"), { target: { value: "shipping" } })
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Shipping" } })
    fireEvent.click(screen.getByRole("button", { name: "Create pipeline" }))

    await waitFor(() => expect(mocks.createAuthoredPipelineServer).toHaveBeenCalledWith({
      data: { id: "shipping", name: "Shipping", input: { stdin: {} }, output: { drop: {} } },
    }))
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/pipelines/shipping", params: { pipelineId: "shipping" } })
  })

})
