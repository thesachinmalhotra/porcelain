import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { afterEach, describe, expect, it } from "vitest"
import { AppShell } from "../src/components/app-shell"

describe("AppShell", () => {
  afterEach(() => { cleanup(); localStorage.clear() })
  it("renders the Porcelain application shell", () => {
    const rootRoute = createRootRoute({ component: AppShell })
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    })

    render(<RouterProvider router={router} />)
    return waitFor(() => expect(screen.getAllByAltText("Porcelain")).toBeTruthy())
  })

  it("collapses and persists the sidebar presentation state", async () => {
    localStorage.clear()
    const rootRoute = createRootRoute({ component: AppShell })
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    })

    const { container } = render(<RouterProvider router={router} />)
    const toggle = await waitFor(() => screen.getByRole("button", { name: "Collapse sidebar" }))
    fireEvent.click(toggle)
    return waitFor(() => {
      expect(container.querySelector(".app-shell")?.classList.contains("sidebar-collapsed")).toBe(true)
      expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy()
      expect(localStorage.getItem("porcelain.sidebar.collapsed")).toBe("true")
    })
  })

  it("uses TanStack Router state for the active navigation item", async () => {
    const rootRoute = createRootRoute({ component: AppShell })
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/overview" })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/overview"] }),
    })

    render(<RouterProvider router={router} />)
    const overview = await waitFor(() => screen.getByRole("link", { name: "Overview" }))
    expect(overview.className).toContain("active")
  })

  it("opens a real global command menu from the shell search control", async () => {
    const rootRoute = createRootRoute({
      component: () => <AppShell context={{
        runtime: { reachable: true, ready: true },
        pipelines: [{ id: "orders", name: "Order events" }],
      }} />,
    })
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    })

    render(<RouterProvider router={router} />)
    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: /search porcelain/i })))

    expect(await screen.findByRole("dialog", { name: "Search Porcelain" })).toBeTruthy()
    expect(screen.getByRole("option", { name: /Order events/ })).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "Search pipelines and destinations" })).toBe(document.activeElement)
  })

  it("does not claim the runtime is live when Connect is unreachable", async () => {
    const rootRoute = createRootRoute({
      component: () => <AppShell context={{
        runtime: { reachable: false, ready: false },
        pipelines: [],
      }} />,
    })
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText("Runtime unreachable")).toBeTruthy()
    expect(screen.queryByText("Live")).toBeNull()
  })
})
