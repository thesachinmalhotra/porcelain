import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import type { ConnectComponentCapability } from "../../src/runtime/connect/capabilities.server"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => { cleanup(); vi.clearAllMocks() })

const mocks = vi.hoisted(() => ({
  validate: vi.fn().mockResolvedValue({ valid: true, lintErrors: [], output: "ok", restartRequired: false }),
  runtime: vi.fn().mockResolvedValue({ connectReachable: true, connectReady: true, runtime: { connected: true, active: true, uptimeSeconds: 42, uptime: "42s", stats: {} } }),
  publish: vi.fn().mockResolvedValue({ pipeline: { id: "orders" }, restartRequired: false }),
  create: vi.fn().mockResolvedValue("shipping"),
  navigate: vi.fn().mockResolvedValue(undefined),
  invalidate: vi.fn().mockResolvedValue(undefined),
  component: vi.fn().mockImplementation(async ({ data }: { data: { kind: string; name: string } }) => data.kind === "processor" ? { mapping: "root = this" } : data.kind === "input" ? { stdin: {} } : { stdout: {} }),
  normalize: vi.fn().mockImplementation(async ({ data }: { data: { config: object } }) => data.config),
}))

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: mocks.invalidate, navigate: mocks.navigate }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))
vi.mock("../../src/features/pipelines/runtime-server", () => ({ getPipelineRuntime: mocks.runtime }))
vi.mock("../../src/features/pipelines/server", () => ({
  validateAuthoredPipelineServer: mocks.validate,
  publishAuthoredPipelineServer: mocks.publish,
  createAuthoredPipelineServer: mocks.create,
  deletePipeline: vi.fn(),
}))
vi.mock("../../src/features/components/server", async () => {
  const actual = await vi.importActual<typeof import("../../src/features/components/server")>("../../src/features/components/server")
  return { ...actual, createConnectComponentConfig: mocks.component, normalizeConnectConfig: mocks.normalize }
})

import { PipelineWorkspace } from "../../src/features/pipelines/pipeline-workspace"

const authoring = { id: "orders", name: "Orders", input: { generate: { interval: "1s" } }, processors: [{ label: "normalize", mapping: "root = this" }], output: { drop: {} }, connectConfig: { input: { generate: { interval: "1s" } }, pipeline: { processors: [{ label: "normalize", mapping: "root = this" }] }, output: { drop: {} } } }
const runtime = { connected: true, active: true, uptimeSeconds: 42, uptime: "42s", stats: {} }
const components: ConnectComponentCapability[] = [
  { name: "generate", kinds: ["input"], status: "stable" as const },
  { name: "filter", kinds: ["processor"], status: "stable" as const },
  { name: "drop", kinds: ["output"], status: "stable" as const },
]

function renderWorkspace() {
  return render(<PipelineWorkspace connectReachable connectReady pipelines={[{ id: "orders", name: "Orders", connectStreamId: "orders-runtime", runtime, authoring }]} components={components} />)
}

describe("PipelineWorkspace", () => {
  it("renders the workspace shell and live runtime", async () => {
    renderWorkspace()
    expect(screen.getByRole("heading", { name: "Orders" })).toBeTruthy()
    expect(screen.getByText("Redpanda Connect ready")).toBeTruthy()
    expect(screen.getByText("orders-runtime")).toBeTruthy()
    expect(screen.getByRole("complementary", { name: "Connect component library" })).toBeTruthy()
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeTruthy()
    await waitFor(() => expect(mocks.runtime).toHaveBeenCalled())
  })

  it("edits and discards a processor draft", () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole("button", { name: "normalize" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit as JSON" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Step configuration" }), { target: { value: '{"label":"normalize-v2","mapping":"root = this"}' } })
    fireEvent.click(screen.getByRole("button", { name: "Apply change" }))
    expect(screen.getByText("Unpublished changes")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    expect(screen.queryByText("Unpublished changes")).toBeNull()
  })

  it("validates and publishes through Connect", async () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole("button", { name: "normalize" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit as JSON" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Step configuration" }), { target: { value: '{"label":"normalize-v2","mapping":"root = this"}' } })
    fireEvent.click(screen.getByRole("button", { name: "Apply change" }))
    fireEvent.click(screen.getByRole("button", { name: "Validate" }))
    await waitFor(() => expect(mocks.validate).toHaveBeenCalled())
    fireEvent.click(screen.getByRole("button", { name: "Publish" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalled())
    expect(mocks.invalidate).toHaveBeenCalledWith({ sync: true })
  })

  it("uses ?K to find and insert a live Connect processor", async () => {
    renderWorkspace()
    fireEvent.keyDown(window, { key: "k", metaKey: true })
    fireEvent.change(screen.getByRole("textbox", { name: "Search Connect components" }), { target: { value: "filter" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search Connect components" }), { key: "Enter" })
    await waitFor(() => expect(mocks.component).toHaveBeenCalledWith({ data: { kind: "processor", name: "filter" } }))
    expect(screen.getByRole("heading", { name: "Processor 2" })).toBeTruthy()
    expect(screen.getByText("Unpublished changes")).toBeTruthy()
  })

  it("creates a pipeline from the workspace", async () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole("button", { name: "New pipeline" }))
    fireEvent.change(screen.getByLabelText("Pipeline ID"), { target: { value: "shipping" } })
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Shipping" } })
    fireEvent.click(screen.getByRole("button", { name: "Create pipeline" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ data: { id: "shipping", name: "Shipping", input: { stdin: {} }, output: { drop: {} } } }))
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/pipelines/shipping", params: { pipelineId: "shipping" } })
  })
})